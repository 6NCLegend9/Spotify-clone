// Real React hook and signed adapter; auth, HTTP and realtime are local boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const sources = {};
const external = new Set(['react', 'react-redux', 'next-auth/react', 'react-hot-toast', '@/redux/features/playerSlice', '@/utils/supabaseClient']);
function include(file) {
  const key = path.relative(root, file).replaceAll(path.sep, '/');
  if (sources[key]) return key;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {}; sources[key] = { code, dependencies };
  for (const [, spec] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (external.has(spec)) { dependencies[spec] = spec; continue; }
    const candidate = spec.startsWith('@/') ? path.join(root, 'src', spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const resolved = [candidate, candidate + '.js', candidate + '.mjs'].find(value => fs.existsSync(value) && fs.statSync(value).isFile());
    assert(resolved && resolved.startsWith(path.join(root, 'src') + path.sep), `Unexpected dependency: ${spec}`);
    dependencies[spec] = include(resolved);
  }
  return key;
}
const entry = include(path.join(root, 'src/hooks/useJamSession.js'));
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url() === 'http://localhost/__jam-test'
      ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://localhost/__jam-test');
    await page.clock.install();
    for (const file of ['react/umd/react.development.js', 'react-dom/umd/react-dom.development.js']) {
      await page.addScriptTag({ path: path.join(root, 'node_modules', file) });
    }
    await page.evaluate(async ({ sources, entry }) => {
      const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const publicKey = await crypto.subtle.exportKey('jwk', keys.publicKey);
      window.qa = { status: 200, removed: [], channels: [], notices: [], actions: [] };
      const session = { data: { user: { id: 'account-a', name: 'Listener' } }, status: 'authenticated' };
      const player = { youtubeVideo: null, youtubeQueue: [], isPlaying: false };
      const dispatch = action => qa.actions.push(action);
      const supabase = {
        channel() {
          const raw = {
            on() { return raw; },
            subscribe(callback) { raw.callback = callback; queueMicrotask(() => callback('SUBSCRIBED')); return raw; },
            async send() { return 'ok'; },
          };
          qa.channels.push(raw); return raw;
        },
        async removeChannel(raw) { qa.removed.push(qa.channels.indexOf(raw)); },
      };
      window.fetch = async (url, options) => {
        const body = JSON.parse(options?.body || '{}');
        if (url === '/api/jam') return Response.json({ data: { publicKey, roomId: 'room-a', code: 'ABCDEF', role: 'host', startedAt: Date.now() } });
        if (body.event === 'heartbeat' && qa.status !== 200) return new Response('Denied', { status: qa.status });
        const message = JSON.stringify({ roomId: 'room-a', event: body.event, senderId: 'account-a', id: crypto.randomUUID(), at: Date.now(), payload: body.payload });
        const bytes = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(message));
        return Response.json({ data: { message, signature: btoa(String.fromCharCode(...new Uint8Array(bytes))) } });
      };
      const cache = {};
      function load(key) {
        if (key === 'react') return window.React;
        if (key === 'react-redux') return { useDispatch: () => dispatch, useSelector: select => select({ player }) };
        if (key === 'next-auth/react') return { useSession: () => session };
        if (key === 'react-hot-toast') return { toast: Object.assign(message => qa.notices.push(message), { error: message => qa.notices.push(message) }) };
        if (key === '@/redux/features/playerSlice') return Object.fromEntries(['setYoutubeVideo', 'setYoutubeQueue', 'playPause', 'appendToQueue'].map(type => [type, payload => ({ type, payload })]));
        if (key === '@/utils/supabaseClient') return { getSupabase: async () => supabase, isSupabaseConfigured: () => true };
        if (cache[key]) return cache[key].exports;
        const loaded = { exports: {} }; cache[key] = loaded;
        const { code, dependencies } = sources[key];
        new Function('require', 'module', 'exports', code)(name => load(dependencies[name]), loaded, loaded.exports);
        return loaded.exports;
      }
      const useJamSession = load(entry).default;
      function Harness() { qa.jam = useJamSession(); return React.createElement('span', null, qa.jam.status); }
      qa.root = ReactDOM.createRoot(document.getElementById('root'));
      qa.root.render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
    }, { sources, entry });
    await page.waitForFunction(() => window.qa?.jam?.status === 'idle');
    await page.evaluate(() => qa.jam.host());
    await page.waitForFunction(() => qa.jam.status === 'connected');
    assert(await page.evaluate(() => Boolean(sessionStorage.getItem('heykasa.jam'))));
    await page.evaluate(() => { qa.status = 503; });
    await page.clock.fastForward(4100);
    assert.equal(await page.evaluate(() => qa.jam.status), 'connected');
    assert.equal(await page.evaluate(() => qa.removed.length), 0);
    await page.evaluate(() => { qa.status = 403; });
    await page.clock.fastForward(4100);
    await page.waitForFunction(() => qa.jam.status === 'error');
    assert.deepEqual(await page.evaluate(() => ({ role: qa.jam.role, code: qa.jam.code, saved: sessionStorage.getItem('heykasa.jam'), removed: qa.removed })), { role: null, code: '', saved: null, removed: [0] });
    await page.evaluate(() => qa.channels[0].callback('SUBSCRIBED'));
    assert.equal(await page.evaluate(() => qa.jam.status), 'error');
    await page.evaluate(() => { qa.status = 200; return qa.jam.host(); });
    await page.waitForFunction(() => qa.jam.status === 'connected');
    await page.evaluate(() => qa.channels[0].callback('CLOSED'));
    assert.equal(await page.evaluate(() => qa.jam.status), 'connected');
    assert.equal(await page.evaluate(() => qa.notices.length), 1);
    await page.evaluate(() => qa.root.unmount());
    assert.deepEqual(await page.evaluate(() => qa.removed), [0, 1]);
    assert.deepEqual(errors, []);
    console.log('Jam hook integration passed: transient failure, revocation, storage/UI reset, raw-channel removal, stale subscription, fresh join and unmount. Controlled transport; no deployed authorization claim.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
