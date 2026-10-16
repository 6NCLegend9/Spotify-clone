// Real Chromium DOM, synthetic Android bridge; no live website/provider requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const network = [];
    await context.route('**/*', route => {
      if (route.request().url() === 'https://haykasa.vercel.app/android-qa') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolated Android bridge test</title><main id="host"></main>' });
      network.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://haykasa.vercel.app/android-qa');
    const source = fs.readFileSync(path.join(__dirname, '../../../src/components/MusicPlayer/media/androidAudioElement.mjs'), 'utf8').replace(/^export /gm, '');
    await page.addScriptTag({ content: 'window.nativeMessages=[]; window.HayKasaAndroidMedia={postMessage:value=>nativeMessages.push(JSON.parse(value))};' + source + ';window.nativeFactory=createAndroidAudioElement;' });
    const result = await page.evaluate(async () => {
      const audio = nativeFactory('Synthetic audio');
      document.getElementById('host').replaceChildren(audio);
      const events = [];
      for (const type of ['loadedmetadata', 'playing', 'pause', 'ended']) audio.addEventListener(type, () => events.push(type));
      audio.src = 'https://haykasa.vercel.app/v1/assets/0123456789abcdef0123456789abcdef?signature=synthetic';
      audio.load(); const id = nativeMessages.at(-1).id;
      const emit = event => HayKasaAndroidMedia.onmessage({ data: JSON.stringify({ id, event, duration: 180, position: 12 }) });
      emit('ready'); audio.muted = false; audio.volume = .4; await audio.play(); emit('playing');
      const playing = !audio.paused && audio.duration === 180 && audio.currentTime === 12;
      audio.currentTime = 45; const seek = nativeMessages.at(-1);
      audio.pause(); emit('pause'); const paused = audio.paused;
      emit('ended'); const ended = audio.ended;
      const browserSource = audio.getAttribute('src');
      audio.removeAttribute('src'); audio.load(); audio.remove();
      return { playing, paused, ended, seek, browserSource, events, commands: nativeMessages.map(m => m.action), remaining: document.querySelectorAll('audio').length };
    });
    assert(result.playing); assert(result.paused); assert(result.ended);
    assert.equal(result.seek.action, 'seek'); assert.equal(result.seek.value, 45);
    assert.equal(result.browserSource, null, 'WebView must not start a second HTML audio decoder');
    assert.equal(result.remaining, 0); assert.equal(result.commands.at(-1), 'release');
    assert.deepEqual(result.events, ['loadedmetadata', 'playing', 'pause', 'ended']);
    assert.deepEqual(errors, []); assert.deepEqual(network, []);
    console.log('PASS: real Chromium media-element overrides, native source handoff, metadata, play/pause/seek/end, no browser source request, cleanup. Synthetic bridge; not an Android device test.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
