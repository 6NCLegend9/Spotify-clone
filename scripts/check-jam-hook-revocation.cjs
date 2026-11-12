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
      window.qa = { status: 200, removed: [], channels: [], notices: [], actions: [], grantRole: 'host', pendingJoins: [] };
      qa.sign = async (event, payload, senderId = 'account-a') => {
        const message = JSON.stringify({ roomId: 'room-a', event, senderId, id: crypto.randomUUID(), at: Date.now(), payload });
        const bytes = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(message));
        return { message, signature: btoa(String.fromCharCode(...new Uint8Array(bytes))) };
      };
      const session = { data: { user: { id: 'account-a', name: 'Listener' } }, status: 'authenticated' };
      const player = { youtubeVideo: null, youtubeQueue: [], isPlaying: false };
      const dispatch = action => qa.actions.push(action);
      const supabase = {
        channel() {
          const handlers = new Map();
          const raw = {
            on(type, filter, handler) { handlers.set(filter.event, handler); return raw; },
            subscribe(callback) { raw.callback = callback; queueMicrotask(() => callback('SUBSCRIBED')); return raw; },
            async send(value) {
              if (value.event === 'join-request') {
                return new Promise(resolve => qa.pendingJoins.push({ raw, resolve, requestId: JSON.parse(value.payload.message).payload.requestId }));
              }
              return 'ok';
            },
            async accept(requestId) {
              const payload = await qa.sign('join-accept', { requestId, participantId: 'host-a', role: 'host', name: 'Host' }, 'host-a');
              await handlers.get('join-accept')({ payload });
            },
          };
          qa.channels.push(raw); return raw;
        },
        async removeChannel(raw) { qa.removed.push(qa.channels.indexOf(raw)); },
      };
      window.fetch = async (url, options) => {
        const body = JSON.parse(options?.body || '{}');
        if (url === '/api/jam') return Response.json({ data: { publicKey, roomId: 'room-a', code: body.code, role: qa.grantRole, startedAt: Date.now() } });
        if (body.event === 'heartbeat' && qa.status !== 200) return new Response('Denied', { status: qa.status });
        return Response.json({ data: await qa.sign(body.event, body.payload) });
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
    await page.evaluate(() => qa.jam.leave());
    await page.waitForFunction(() => qa.jam.status === 'idle');
    for (const replacement of [false, true]) {
      const oldIndex = await page.evaluate(() => qa.pendingJoins.length);
      await page.evaluate(() => { qa.grantRole = 'guest'; return qa.jam.join('ABCDEF'); });
      await page.waitForFunction(index => qa.pendingJoins.length > index, oldIndex);
      await page.evaluate(async index => {
        const pending = qa.pendingJoins[index];
        await pending.raw.accept(pending.requestId);
        await qa.jam.leave();
      }, oldIndex);
      await page.waitForFunction(() => qa.jam.status === 'idle');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('heykasa.jam')), null);
      if (replacement) {
        await page.evaluate(() => qa.jam.join('GHJKMN'));
        await page.waitForFunction(index => qa.pendingJoins.length > index + 1, oldIndex);
        await page.evaluate(async index => {
          const pending = qa.pendingJoins[index + 1];
          await pending.raw.accept(pending.requestId);
          pending.resolve('ok');
        }, oldIndex);
        await page.waitForFunction(() => qa.jam.status === 'connected' && qa.jam.code === 'GHJKMN');
      }
      const expected = await page.evaluate(() => ({ status: qa.jam.status, role: qa.jam.role, code: qa.jam.code, saved: sessionStorage.getItem('heykasa.jam'), people: qa.jam.people, removed: qa.removed }));
      await page.evaluate(async index => {
        const pending = qa.pendingJoins[index];
        pending.resolve('ok');
      }, oldIndex);
      // Let the released Promise chain and React's queued render drain without
      // advancing fake timers or relying on an arbitrary sleep.
      await page.evaluate(() => new Promise(resolve => {
        const c = new MessageChannel();
        c.port1.onmessage = () => { c.port1.close(); c.port2.close(); resolve(); };
        c.port2.postMessage(null);
      }));
      assert.deepEqual(await page.evaluate(() => ({ status: qa.jam.status, role: qa.jam.role, code: qa.jam.code, saved: sessionStorage.getItem('heykasa.jam'), people: qa.jam.people, removed: qa.removed })), expected, `Old guest continuation must not overwrite ${replacement ? 'the new guest session' : 'Leave'}`);
    }
    const lastChannel = await page.evaluate(() => qa.channels.length - 1);
    await page.evaluate(() => qa.root.unmount());
    assert.equal(await page.evaluate(() => qa.removed.at(-1)), lastChannel);
    assert.deepEqual(errors, []);
    console.log('Jam hook integration passed: transient failure, revocation, storage/UI reset, raw-channel removal, stale subscription, guest Leave and replacement races, fresh join and unmount. Controlled transport; no deployed authorization claim.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
