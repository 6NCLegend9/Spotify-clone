const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const modules = {};
for (const name of ['androidAudioElement', 'orderedAndroidTransport', 'nativeMediaDeck', 'mediaPlayerStates', 'resolveMediaAsset']) {
  modules[`./${name}.mjs`] = ts.transpileModule(fs.readFileSync(path.join(root, `src/components/MusicPlayer/media/${name}.mjs`), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
modules['@/utils/androidNavigation.mjs'] = ts.transpileModule(fs.readFileSync(path.join(root, 'src/utils/androidNavigation.mjs'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const code = `window.qaResolveRequests=0;window.fetch=async(url,options={})=>{if(url!=='/api/media/resolve')throw new Error('Unexpected network request in isolated fixture');if(options.signal?.aborted)throw options.signal.reason;if(options.method==='DELETE')return new Response(JSON.stringify({cancelled:true}));window.qaResolveRequests++;return new Response(JSON.stringify({state:'ready',receipt:'synthetic-emulator-only',asset:{url:'https://haykasa.vercel.app/v1/assets/00000000000000000000000000000001?signature=synthetic',duration:120,expiresAt:Date.now()+3600000,mimeType:'audio/mp4',codec:'aac'}}),{status:200,headers:{'Content-Type':'application/json'}})};const modules=${JSON.stringify(modules)},cache={};function require(name){if(name==='./nativeAudioGraph.mjs')return{createNativeAudioGraph:()=>null};if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;new Function('module','exports','require',modules[name])(module,module.exports,require);return module.exports;}require('@/utils/androidNavigation.mjs').installAndroidNavigation({replace:path=>history.replaceState(null,'',path)});window.qaEvents=[];window.qaIntents=[];window.qaCapabilities=[];window.qaDeck=require('./nativeMediaDeck.mjs').createNativeMediaDeck({host:document.getElementById('media'),videoId:'synthetic01',title:'HayKasa emulator tone (synthetic)',mode:'audio',profile:'mp4-aac',maxHeight:1080,autoplay:false,events:{onReady(){window.qaReady=true},onStateChange(e){qaEvents.push(e.data)},onTransportIntent(e){qaIntents.push(e.data.playing)},onTransportCapability(e){qaCapabilities.push(e.data.version)},onTransportError(e){window.qaTransportError=e.data.code},onTransportRecovered(){window.qaTransportError=null}},onFallback(e){window.qaFailure=e.reason}});window.qaSample=()=>({ready:!!window.qaReady,state:qaDeck.getPlayerState(),position:qaDeck.getCurrentTime(),duration:qaDeck.getDuration(),androidNative:qaDeck.androidNative,orderedTransport:qaDeck.orderedTransport,transportVersion:qaDeck.nativeTransportVersion,capabilities:qaCapabilities,playIntent:qaDeck.nativePlayIntent,observedPlaying:qaDeck.nativeObservedPlaying,transportError:window.qaTransportError||null,failure:window.qaFailure||null,events:qaEvents,intents:qaIntents});setInterval(()=>document.getElementById('state').textContent=JSON.stringify(qaSample()),1000);document.getElementById('play').onclick=()=>{qaDeck.unMute();qaDeck.setVolume(50);qaDeck.playVideo()};document.getElementById('pause').onclick=()=>qaDeck.pauseVideo();`;
// Observe actual native replies without changing their delivery/order. Keep only
// transport state: URLs, receipts and other message fields are never retained.
const nativeDiagnostics = `
window.qaNativeFrames=[];
const receiveNativeFrame=HayKasaAndroidMedia.onmessage;
HayKasaAndroidMedia.onmessage=message=>{
  try {
    const packet=JSON.parse(message.data),transport=packet.transport,snapshot=transport?.snapshot;
    if(snapshot){
      const intent=snapshot.intent,observed=snapshot.observed,result=transport.result;
      qaNativeFrames.push({at:Math.round(performance.now()),id:packet.id,event:packet.event,
        bindingId:transport.bindingId,eventSeq:transport.eventSeq,
        processedWebRevision:snapshot.processedWebRevision,appliedWebRevision:snapshot.appliedWebRevision,
        intent:{revision:intent.revision,playWhenReady:intent.playWhenReady,origin:intent.origin,webRevision:intent.webRevision},
        observed:{state:observed.state,isPlaying:observed.isPlaying,playWhenReady:observed.playWhenReady,
          suppressionReason:observed.suppressionReason,policyReason:observed.policyReason,position:packet.position},
        ...(result?{result:{action:result.action,phase:result.phase,webRevision:result.webRevision,
          decisionIntentRevision:result.decisionIntentRevision,reason:result.reason}}:{})});
      if(qaNativeFrames.length>64)qaNativeFrames.shift();
    }
  } catch { /* Malformed diagnostics never change the actual consumer's input. */ }
  receiveNativeFrame(message);
};
`;
const dir = path.join(root, 'android/app/build/generated/qaAssets');
fs.mkdirSync(dir, { recursive: true });
// Fixed synthetic 997Hz, six-second, stereo48kHz fixtures. These qualify
// decoder behavior, never live songs. Generate explicitly with FFmpeg:
// ffmpeg -f lavfi -i sine=frequency=997:duration=6:sample_rate=48000 -ac 2
//   -c:a aac (or libopus) -b:a 160k <filename>; update hashes after review.
// CI needs no encoder download and rejects missing/corrupted test media.
for (const [filename, sha256] of [
  ['quality-aac.m4a', 'da8be58b8317bd75f7c2ec9ff28fbc65ffacdfa95cbfe76623fe53f7c0868983'],
  ['quality-opus.webm', '476983f1f8af391944cb43c8393775d890a1bf831ce8742baa74f21b3d00bb77'],
]) {
  const bytes = fs.readFileSync(path.join(__dirname, 'audio', filename));
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
    throw new Error(`Android synthetic audio fixture hash mismatch: ${filename}`);
  }
  fs.writeFileSync(path.join(dir, filename), bytes);
}
fs.writeFileSync(path.join(dir, 'native-qa.html'), `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#060d1b;color:white;padding:20px;font:16px sans-serif"><h1>HayKasa Android QA</h1><p>Synthetic audio fixture in the real Android app.</p><div id="media"></div><button id="play">Play</button><button id="pause">Pause</button><pre id="state" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre><script>${code}\n${nativeDiagnostics}</script>`);
console.log('Generated Android instrumentation fixture from production bridge/deck modules.');
