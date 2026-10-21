/* Actual browser DSP measurements using synthetic audio; no provider/network. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.join(root, 'artifacts/audio-quality');
const modules = Object.fromEntries([
  ['@/utils/eqPresets', 'src/utils/eqPresets.js'],
  ['@/utils/nativeAudio.mjs', 'src/utils/nativeAudio.mjs'],
  ['./nativeAudioGraph.mjs', 'src/components/MusicPlayer/media/nativeAudioGraph.mjs'],
  ['./useAudioEq', 'src/hooks/useAudioEq.js'],
].map(([key, file]) => [key, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText]));

(async () => {
  const results = [];
  for (const engine of (process.env.AUDIO_TEST_BROWSERS || 'chromium').split(',')) {
    const browser = await playwright[engine].launch({headless: true});
    try {
      const page = await browser.newPage();
      const errors = [], network = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route(/https?:\/\//, route => {network.push(route.request().url()); return route.abort();});
      const measured = await page.evaluate(async sources => {
        const RealAudioContext = window.AudioContext;
        const cache = {};
        function require(name) {
          if (cache[name]) return cache[name].exports;
          const module = {exports: {}};
          cache[name] = module;
          new Function('module', 'exports', 'require', sources[name])(module, module.exports, require);
          return module.exports;
        }
        const {createNativeAudioGraph} = require('./nativeAudioGraph.mjs');
        const {applyLatestOutputVolume} = require('@/utils/eqPresets');
        const rate = 48000, length = rate, frequency = 1000, amplitude = .98;
        async function render(settings) {
          const context = new OfflineAudioContext(2, length, rate);
          const buffer = context.createBuffer(2, length, rate);
          for (let i = 0; i < length; i++) {
            buffer.getChannelData(0)[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / rate);
            buffer.getChannelData(1)[i] = amplitude * .5 * Math.cos(2 * Math.PI * frequency * i / rate);
          }
          const source = context.createBufferSource();
          source.buffer = buffer;
          context.createMediaElementSource = () => source;
          window.AudioContext = function () {return context;};
          const graph = createNativeAudioGraph({}, settings);
          // Reconfigure the same graph to catch stale/duplicate connections.
          graph.configure(settings);
          source.start();
          const actual = await context.startRendering();
          let peak = 0, rms = 0, maxError = 0, monoDifference = 0;
          const scale = settings.normalization === 'quiet' ? .72 : 1;
          for (let i = 0; i < length; i++) {
            const left = actual.getChannelData(0)[i], right = actual.getChannelData(1)[i];
            peak = Math.max(peak, Math.abs(left), Math.abs(right));
            rms += left * left;
            const expected = settings.monoAudio ? (buffer.getChannelData(0)[i] + buffer.getChannelData(1)[i]) * .5 : buffer.getChannelData(0)[i];
            maxError = Math.max(maxError, Math.abs(left - expected * scale));
            monoDifference = Math.max(monoDifference, Math.abs(left - right));
          }
          return {peak, rms: Math.sqrt(rms / length), maxError, monoDifference};
        }
        const original = await render({normalization: 'normal'});
        const quiet = await render({normalization: 'quiet'});
        const mono = await render({normalization: 'normal', monoAudio: true});
        const boosted = await render({normalization: 'loud', bands: [12, 12, 12, 12, 12, 12]});
        const volume = [];
        for (const player of [{provider: 'native'}, {provider: 'native', androidNative: true}, {provider: 'youtube'}]) {
          let applied;
          player.setVolume = value => {applied = value;};
          applyLatestOutputVolume(player, {playbackVolume: 72, masterVolume: .5}, .5);
          volume.push(applied);
        }
        window.AudioContext = RealAudioContext;
        return {original, quiet, mono, boosted, volume};
      }, modules);
      assert.ok(measured.original.maxError < 1e-6, 'Flat stereo must preserve waveform and dynamics');
      assert.ok(measured.quiet.maxError < 1e-6, 'Quiet gain must be applied once');
      assert.ok(measured.mono.maxError < 1e-6 && measured.mono.monoDifference < 1e-6, 'Mono must average channels once');
      assert.ok(measured.boosted.peak <= 1.001, 'Boosted EQ must retain output headroom: ' + JSON.stringify(measured.boosted));
      assert.deepEqual(measured.volume, [25, 18, 18], 'Browser graph, native Android and iframe volume must each apply level once');
      await page.addScriptTag({path: path.join(root, 'node_modules/react/umd/react.development.js')});
      await page.addScriptTag({path: path.join(root, 'node_modules/react-dom/umd/react-dom.development.js')});
      const lifecycle = await page.evaluate(async sources => {
        const cache = {}, contexts = [], OriginalContext = window.AudioContext || window.webkitAudioContext;
        window.AudioContext = function () {const context = new OriginalContext(); contexts.push(context); return context;};
        function require(name) {
          if (name === 'react') return window.React;
          if (name === '@/components/MusicPlayer/media/nativeAudioGraph.mjs') name = './nativeAudioGraph.mjs';
          if (cache[name]) return cache[name].exports;
          const module = {exports: {}}; cache[name] = module;
          new Function('module', 'exports', 'require', sources[name])(module, module.exports, require);
          return module.exports;
        }
        const useAudioEq = require('./useAudioEq').default;
        function Player() {
          const ref = React.useRef(null);
          useAudioEq(ref, {bands: [0,0,0,0,0,0], normalization: 'normal', monoAudio: false});
          return React.createElement('audio', {ref});
        }
        const host = document.createElement('div'); document.body.append(host);
        const root = ReactDOM.createRoot(host);
        root.render(React.createElement(React.StrictMode, null, React.createElement(Player)));
        await new Promise(resolve => setTimeout(resolve, 100));
        const mounted = contexts.map(context => context.state);
        root.unmount();
        await new Promise(resolve => setTimeout(resolve, 50));
        return {count: contexts.length, mounted, unmounted: contexts.map(context => context.state)};
      }, modules);
      assert.equal(lifecycle.count, 1, 'Strict Mode must reuse one real media source/context');
      assert.ok(lifecycle.mounted.every(state => state !== 'closed'));
      assert.deepEqual(lifecycle.unmounted, ['closed'], 'Unmount must release the audio context');
      assert.deepEqual(errors, []);
      assert.deepEqual(network, []);
      results.push({engine, status: 'passed', sampleRateHz: 48000, ...measured, lifecycle});
      console.log('PASS: ' + engine + ' real DSP: flat waveform preservation, one quiet gain, stereo/mono, EQ headroom and provider volume');
    } finally {await browser.close();}
  }
  fs.mkdirSync(output, {recursive: true});
  fs.writeFileSync(path.join(output, 'dsp.json'), JSON.stringify({syntheticAudio: true, liveYtDlp: false, results}, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
