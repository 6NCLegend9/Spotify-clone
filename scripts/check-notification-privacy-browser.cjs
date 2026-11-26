// Actual SettingsPage, UpdatesBell, settings reducer and account boundary.
// Session/HTTP/Notification APIs are fixtures; no real account or OS alerts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.resolve(process.env.HAYKASA_NOTIFICATION_PRIVACY_EVIDENCE || path.join(root, 'artifacts/notification-privacy'));
fs.mkdirSync(output, { recursive: true });
const sources = {};
const controlled = new Set(['react', 'react-dom', 'next-auth/react', 'next/link', 'next/dynamic', 'react-redux', 'react-hot-toast', 'lucide-react', 'react-icons/fa', '@reduxjs/toolkit', '@/services/http', '@/redux/features/playerSlice', '@/utils/signOut', '@/utils/discordPresenceStatus', '@/lib/discordPresenceClient', '@/components/DeleteAccountForm', '@/components/ExportDataButton', '@/components/GenrePreferences', '@/components/FeedbackPreferences', '@/components/SupportDiagnostics', '@/components/ListeningInsights', '@/components/AppearanceSettings']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const baseline = process.env.HAYKASA_NOTIFICATION_PRIVACY_BASELINE;
  const read = baseline && ['UpdatesBell.jsx', 'page.jsx'].includes(path.basename(file)) ? path.join(baseline, path.basename(file)) : file;
  const compiled = ts.transpileModule(fs.readFileSync(read, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }, reportDiagnostics: true });
  assert.equal(compiled.diagnostics?.length || 0, 0, read);
  const dependencies = {}; sources[key] = { code: compiled.outputText, dependencies };
  for (const [, spec] of compiled.outputText.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (controlled.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, ...['.js', '.jsx', '.mjs'].map(ext => candidate + ext)].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), `Unexpected dependency ${spec}`);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entries = Object.fromEntries(Object.entries({ bell: 'components/UpdatesBell.jsx', settings: 'app/settings/page.jsx', boundary: 'components/AccountPrivacyBoundary.jsx', reducer: 'redux/features/settingsSlice.js', storage: 'utils/accountStorage.mjs', androidAudio: 'components/MusicPlayer/media/androidAudioElement.mjs' }).map(([key, file]) => [key, include(path.join(root, 'src', file))]));
const results = [];
let browser;
async function setup(page, kind, android = false) {
  const fixtureUrl = (android ? "https://haykasa.vercel.app" : "http://127.0.0.1:3000") + "/__notification-privacy-qa";
  await page.route('**/*', route => route.request().url() === fixtureUrl
    ? route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' }) : route.abort());
  await page.goto(fixtureUrl);
  for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js', '@reduxjs/toolkit/dist/redux-toolkit.umd.js']) await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
  await page.evaluate(({ sources, entries, kind, android }) => {
    if (android) window.HayKasaAndroidMedia = { postMessage() { throw Error("Settings must not send playback commands"); } };
    window.qaSession = { data: { user: { id: 'A' } }, status: 'authenticated' };
    window.qaCalls = []; window.qaToasts = []; window.qaAlerts = []; window.qaPending = [];
    window.qaRevision = 0; window.qaHold = false; window.qaHoldRender = false; window.qaMounted = true;
    const originalInterval = window.setInterval;
    window.setInterval = (callback, ...args) => { window.qaPoll = callback; return originalInterval(callback, ...args); };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    class NotificationFixture {
      static permission = kind === 'bell' ? 'granted' : 'default';
      static requestPermission() { return new Promise((resolve, reject) => { window.qaPermission = { resolve, reject }; }); }
      constructor(title, options) { qaAlerts.push({ title, options }); }
      close() {}
    }
    window.Notification = NotificationFixture;
    const requestJson = (url, options = {}) => {
      const item = { id: 'release-' + qaRevision, type: 'release', title: 'Private artist ' + qaRevision, body: 'Private song ' + qaRevision, unread: true };
      const response = { items: [item] };
      qaCalls.push({ url, owner: qaSession.data?.user?.id || 'guest', method: options.method || 'GET' });
      return qaHold ? new Promise(resolve => qaPending.push({ resolve: () => resolve(response), response })) : Promise.resolve(response);
    };
    const toast = value => qaToasts.push(String(value)); toast.success = toast; toast.error = toast;
    const cache = {}; let store;
    function require(name) {
      if (name === 'react') return React;
      if (name === 'react-dom') return ReactDOM;
      if (name === '@reduxjs/toolkit') return RTK;
      if (name === 'react-redux') return {
        useDispatch: () => store.dispatch, useStore: () => store,
        useSelector: pick => React.useSyncExternalStore(callback => store.subscribe(() => { if (!qaHoldRender) callback(); }), () => pick(store.getState())),
      };
      if (name === 'next-auth/react') return { useSession: () => qaSession };
      if (name === 'next/link') return { __esModule: true, default: ({ href, ...props }) => React.createElement('a', { ...props, href }) };
      if (name === 'next/dynamic') return { __esModule: true, default: () => () => null };
      if (name === 'react-hot-toast') return { __esModule: true, default: toast, toast };
      if (name === 'lucide-react' || name === 'react-icons/fa') return new Proxy({}, { get: () => props => React.createElement('svg', { ...props, width: props.size || 24, height: props.size || 24 }) });
      if (name === '@/services/http') return { requestJson };
      if (name === '@/redux/features/playerSlice') return { startYoutubePlayback: payload => ({ type: 'qa/play', payload }) };
      if (name === '@/utils/signOut') return { signOutWithPrivacy: async () => {} };
      if (name === '@/utils/discordPresenceStatus') return { getDiscordPresenceStatus: () => ({ state: 'idle' }), subscribeDiscordPresenceStatus: () => () => {} };
      if (name === '@/lib/discordPresenceClient') return { discordPresenceTransport: () => 'unavailable' };
      if (name.startsWith('@/components/')) return { __esModule: true, default: () => null };
      if (cache[name]) return cache[name].exports;
      const source = sources[name]; if (!source) throw Error('Unknown fixture ' + name);
      const loadedModule = { exports: {} }; cache[name] = loadedModule;
      new Function('require', 'module', 'exports', source.code)(spec => require(source.dependencies[spec]), loadedModule, loadedModule.exports);
      return loadedModule.exports;
    }
    window.qaActions = require(entries.reducer);
    window.qaStartNativeAudio = ({ supported = true, version = 2, malformed = false } = {}) => {
      const bridge = window.HayKasaAndroidMedia;
      const engineId = crypto.randomUUID(), issuedBindingId = crypto.randomUUID();
      let sequence = 0, bindingId, ready = false;
      const deliver = packet => bridge.onmessage({ data: JSON.stringify(packet) });
      const state = (id, replyTo) => deliver({ id, event: ready ? 'ready' : 'transportState',
        position: 0, duration: ready ? 10 : 0, playing: false, playWhenReady: false,
        transport: { version, engineId, bindingId, eventSeq: ++sequence, ...(replyTo ? { replyTo } : {}),
          snapshot: { processedWebRevision: 0, appliedWebRevision: 0,
            intent: { revision: 0, playWhenReady: false, origin: 'baseline', webRevision: null },
            observed: { isPlaying: false, playWhenReady: false, state: ready ? 'ready' : 'idle', suppressionReason: 0, policyReason: 'none' } } } });
      bridge.postMessage = raw => {
        const command = JSON.parse(raw);
        if (command.action === 'transportHello') deliver({ id: command.id, event: 'transportCapabilities',
          requestId: command.requestId, version, capability: `ordered-transport-v${version}`,
          nativeBuildCode: malformed ? null : 6, engineId, currentBindingId: null, issuedBindingId,
          bindGrant: crypto.randomUUID(), grantLifetimeMs: 5000,
          ...(supported ? { audioProcessing: 'pcm-eq-v1' } : {}) });
        else if (command.action === 'transportBind') { bindingId = command.bindingId; state(command.id, command.requestId); }
        else if (['load', 'volume', 'configureAudio', 'release'].includes(command.action)) {
          deliver({ id: command.id, event: 'transportControlAck', version, action: command.action,
            requestId: command.requestId, scope: { engineId, bindingId }, phase: command.action === 'load' ? 'accepted' : 'completed' });
          if (command.action === 'load') { ready = true; state(command.id); }
        }
      };
      const audio = require(entries.androidAudio).createAndroidAudioElement('Synthetic settings capability');
      audio.src = 'https://haykasa.vercel.app/v1/assets/00000000000000000000000000000000';
      audio.load();
      window.qaNativeAudio = audio;
    };
    store = RTK.configureStore({ reducer: { settings: qaActions.default } }); window.qaStore = store;
    store.dispatch(qaActions.setSettingsOwner('account:A'));
    if (kind === 'bell') store.dispatch(qaActions.updateSetting({ key: 'browserNotifications', value: true }));
    window.qaStorage = require(entries.storage);
    const Component = require(entries[kind]).default, Boundary = require(entries.boundary).default;
    const host = ReactDOM.createRoot(document.getElementById('root'));
    const render = () => ReactDOM.flushSync(() => host.render(React.createElement(React.Fragment, null, React.createElement(Boundary), qaMounted && React.createElement(Component))));
    window.qaSetOwner = owner => {
      qaSession = owner ? { data: { user: { id: owner } }, status: 'authenticated' } : { data: null, status: 'unauthenticated' };
      store.dispatch(qaActions.setSettingsOwner(owner ? 'account:' + owner : 'guest')); render();
    };
    window.qaSetPreference = (key, value) => store.dispatch(qaActions.updateSetting({ key, value }));
    window.qaResolve = index => qaPending.splice(index, 1)[0].resolve();
    window.qaUnmount = () => { qaMounted = false; render(); };
    render();
  }, { sources, entries, kind, android });
  await page.waitForFunction(() => qaStorage.getActiveAccountOwner() === 'account:A');
}
async function settle(page) { await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); }); }
async function scenario(name, kind, run, android = false) {
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  const errors = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try { await setup(page, kind, android); await run(page); await settle(page); assert.deepEqual(errors, []); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: String(error.stack || error), pageErrors: errors }); }
  finally { await page.close(); }
}
async function poll(page) {
  await settle(page);
  await page.evaluate(() => { qaHold = true; qaRevision++; qaPoll(); });
  await page.waitForFunction(() => qaPending.length === 1);
}
async function requestPermission(page) {
  const input = page.getByRole('checkbox', { name: /Browser notifications/ });
  await input.focus(); await page.keyboard.press('Space');
  await page.waitForFunction(() => Boolean(qaPermission));
}
(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.HAYKASA_BROWSER_EXECUTABLE ? { executablePath: process.env.HAYKASA_BROWSER_EXECUTABLE } : {}) });
  try {
    for (const key of ['privateSession', 'browserNotifications']) await scenario('delayed-announcement-respects-' + key + '-before-render', 'bell', async page => {
      await poll(page);
      await page.evaluate(key => { qaHoldRender = true; qaSetPreference(key, key === 'privateSession'); qaResolve(0); }, key);
      await settle(page);
      assert.deepEqual(await page.evaluate(() => qaAlerts), []);
      assert.equal(await page.evaluate(() => qaToasts.length), key === 'privateSession' ? 0 : 1);
    });
    await scenario('current-permitted-announcement-still-works', 'bell', async page => {
      await poll(page); await page.evaluate(() => qaResolve(0)); await settle(page);
      assert.equal(await page.evaluate(() => qaToasts.length), 1); assert.equal(await page.evaluate(() => qaAlerts.length), 1);
      assert.equal(await page.evaluate(() => qaAlerts[0].title), 'Private artist 1');
    });
    await scenario('latest-overlapping-load-is-authoritative', 'bell', async page => {
      await poll(page); await page.evaluate(() => { qaRevision = 2; qaPoll(); }); await page.waitForFunction(() => qaPending.length === 2);
      await page.evaluate(() => qaResolve(1)); await settle(page); await page.evaluate(() => qaResolve(0)); await settle(page);
      assert.deepEqual(await page.evaluate(() => qaAlerts.map(alert => alert.title)), ['Private artist 2']);
      await page.getByRole('button', { name: /Open notifications/ }).click(); await page.getByText('Private artist 2', { exact: true }).waitFor();
      assert.equal(await page.getByText('Private artist 1', { exact: true }).count(), 0);
    });
    await scenario('uninitialized-account-settings-cannot-opt-in', 'bell', async page => {
      await poll(page); await page.evaluate(() => { qaHoldRender = true; qaStore.dispatch(qaActions.setSettingsOwner('account:B')); qaSetPreference('browserNotifications', true); qaResolve(0); });
      await settle(page); assert.deepEqual(await page.evaluate(() => qaAlerts), []); assert.deepEqual(await page.evaluate(() => qaToasts), []);
    });
    for (const mode of ['switch', 'roundtrip', 'logout', 'privacy-clear', 'unmount', 'settings-owner-before-render']) for (const outcome of ['granted', 'denied', 'rejected']) await scenario('permission-' + mode + '-' + outcome, 'settings', async page => {
      await requestPermission(page);
      await page.evaluate(({ mode, outcome }) => {
        if (mode === 'switch' || mode === 'roundtrip') qaSetOwner('B');
        if (mode === 'roundtrip') qaSetOwner('A');
        if (mode === 'logout') qaSetOwner(null);
        if (mode === 'privacy-clear') qaStorage.clearLocalAccountCaches({ notify: true });
        if (mode === 'unmount') qaUnmount();
        if (mode === 'settings-owner-before-render') { qaHoldRender = true; qaStore.dispatch(qaActions.setSettingsOwner('account:B')); }
        if (outcome === 'rejected') qaPermission.reject(Error('Synthetic permission failure')); else qaPermission.resolve(outcome);
      }, { mode, outcome });
      await settle(page); assert.equal(await page.evaluate(() => qaStore.getState().settings.browserNotifications), false);
      assert.equal(await page.getByText('Notifications are off', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Notifications unavailable', { exact: true }).count(), 0);
    });
    for (const outcome of ['granted', 'denied', 'rejected']) await scenario('permission-current-' + outcome, 'settings', async page => {
      await requestPermission(page); await page.evaluate(outcome => outcome === 'rejected' ? qaPermission.reject(Error('Synthetic permission failure')) : qaPermission.resolve(outcome), outcome);
      await settle(page); assert.equal(await page.evaluate(() => qaStore.getState().settings.browserNotifications), outcome === 'granted');
      if (outcome !== 'granted') await page.getByText(outcome === 'denied' ? 'Notifications are off' : 'Notifications unavailable', { exact: true }).waitFor();
    });
    for (const android of [false, true]) await scenario('audio-processing-capability-' + (android ? 'android' : 'browser'), 'settings', async page => {
      await settle(page);
      await page.setViewportSize({ width: android ? 390 : 1280, height: 844 });
      const manifest = JSON.parse(fs.readFileSync(path.join(root, '.next/app-build-manifest.json'), 'utf8'));
      const css = (manifest.pages['/layout'] || []).filter(name => name.endsWith('.css')).map(name => fs.readFileSync(path.join(root, '.next', name), 'utf8')).join('\n');
      await page.addStyleTag({ content: css });
      const mono = page.getByRole('checkbox', { name: /^Mono audio/ });
      const preset = page.getByRole('combobox', { name: 'Preset', exact: true });
      assert.equal(await mono.isDisabled(), android);
      assert.equal(await preset.isDisabled(), android);
      assert.equal(await page.getByRole('button', { name: 'Reset to flat' }).isDisabled(), android);
      const faders = page.locator('input.eq-fader');
      assert.equal(await faders.count(), 6);
      for (const fader of await faders.all()) assert.equal(await fader.isDisabled(), android);
      assert.equal(await page.getByRole('combobox', { name: 'Playback level', exact: true }).isDisabled(), false);
      await page.getByRole('heading', { name: 'Playback sound', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, android ? 'android-audio-settings.png' : 'browser-audio-settings.png') });
      await page.locator('section').filter({ has: page.getByRole('heading', { name: 'Equalizer', exact: true }) }).screenshot({ path: path.join(output, android ? 'android-eq-settings.png' : 'browser-eq-settings.png') });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Settings must not overflow the viewport');
      if (android) {
        await page.getByText('Start native audio playback in an updated Android app to check equalizer support.', { exact: false }).waitFor();
        await page.evaluate(() => qaSetPreference('monoAudio', true));
        await settle(page);
        assert.equal(await mono.isChecked(), true, 'Stored preference remains available to other supported players');
        assert.equal(await mono.isDisabled(), true);
      }
    }, android);
    for (const [name, options, supported] of [
      ['negotiated-v2', {}, true],
      ['old-native', { supported: false }, false],
      ['v1-cannot-advertise-v2-processing', { version: 1 }, false],
      ['malformed-hello-cannot-enable-processing', { malformed: true }, false],
    ]) await scenario('android-audio-settings-' + name, 'settings', async page => {
      const mono = page.getByRole('checkbox', { name: /^Mono audio/ });
      const preset = page.getByRole('combobox', { name: 'Preset', exact: true });
      assert.equal(await mono.isDisabled(), true);
      await page.evaluate(options => qaStartNativeAudio(options), options);
      await settle(page);
      assert.equal(await mono.isDisabled(), !supported);
      assert.equal(await preset.isDisabled(), !supported);
      for (const fader of await page.locator('input.eq-fader').all()) assert.equal(await fader.isDisabled(), !supported);
      if (supported) {
        await mono.check();
        assert.equal(await page.evaluate(() => qaStore.getState().settings.monoAudio), true);
      }
      await page.evaluate(() => qaNativeAudio.removeAttribute('src'));
      await settle(page);
      assert.equal(await mono.isDisabled(), true, 'Retired source must stop advertising processing support');
      assert.equal(await preset.isDisabled(), true);
      if (supported) assert.equal(await mono.isChecked(), true, 'Retiring support preserves saved settings');
    }, true);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ scope: 'Actual components/settings reducer/AccountPrivacyBoundary; fixture HTTP/session/OS notification API. No real alert or external write.', results }, null, 2));
  for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error.split('\n')[0] : ''));
  if (results.some(result => !result.pass)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
