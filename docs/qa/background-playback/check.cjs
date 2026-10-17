const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const tick = () => new Promise(resolve => setImmediate(resolve));
function load(file, mocks = {}, globals = {}) {
  const context = {module:{exports:{}}, exports:{}, require:name=>mocks[name], console, AbortController, ...globals};
  context.exports = context.module.exports;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
  return context.module.exports;
}
async function deckCase({play, resumeContext, graph, resolveAsset, metadata = true} = {}) {
  const listeners = new Map(), events = [], failures = [], requests = [], cancelled = [], timers = new Map();
  let timerId = 0;
  const media = {currentTime:0, duration:180, paused:true, muted:true, volume:1, style:{},
    setAttribute(){}, removeAttribute(name){ if (name === 'src') delete this.src; }, remove(){}, load(){},
    addEventListener:(name, fn)=>listeners.set(name, fn), removeEventListener:name=>listeners.delete(name),
    play(){ this.paused=false; return play ? play() : Promise.resolve(); },
    pause(){ this.paused=true; },
    get currentSrc(){ return this.src; },
  };
  const states = {UNSTARTED:-1, ENDED:0, PLAYING:1, PAUSED:2, BUFFERING:3, CUED:5};
  const {createNativeMediaDeck} = load('src/components/MusicPlayer/media/nativeMediaDeck.mjs', {
    './mediaPlayerStates.mjs':{MEDIA_PLAYER_STATES:states},
    './resolveMediaAsset.mjs':{resolveMediaAsset:async(request, options)=>{
      requests.push(request);
      return resolveAsset ? resolveAsset(request, options) : {receipt:'synthetic',asset:{url:`https://example.invalid/${request.videoId}`,duration:180,expiresAt:Date.now()+300000}};
    },cancelMediaReceipt:value=>{ if (value) cancelled.push(value); }},
    './androidAudioElement.mjs':{createAndroidAudioElement:()=>null},
    './nativeAudioGraph.mjs':{createNativeAudioGraph:()=>graph ? {resume:resumeContext, configure(){}, close(){}} : null},
  }, {document:{createElement:()=>media}, setTimeout:fn=>{ timers.set(++timerId, fn); return timerId; }, clearTimeout:id=>timers.delete(id)});
  const deck = createNativeMediaDeck({host:{replaceChildren(){}},videoId:'abcdefghijk',mode:'audio',profile:'mp4-aac',autoplay:false,
    events:{onAutoplayBlocked:()=>events.push('blocked')},onFallback:value=>failures.push(value.reason)});
  await tick(); if (metadata) listeners.get('loadedmetadata')();
  return {deck, media, events, failures, listeners, requests, cancelled, timers};
}
(async()=>{
  const {shouldDeferYoutubeResume:defer,authenticatedPlaybackOwner:owns} = load('src/utils/youtubeResumePolicy.mjs');
  for(const provider of ['native','youtube',undefined]) for(const authenticated of [true,false]) {
    assert.equal(defer({hidden:false,provider,authenticated}),false);
    assert.equal(defer({hidden:true,explicitUserAction:true,provider,authenticated}),false);
    assert.equal(defer({hidden:true,provider,authenticated}),!(provider==='native' && authenticated));
  }
  assert.equal(owns({user:{id:'alice'}},'authenticated','account:alice'),true);
  for(const [session,status,owner] of [[null,'authenticated','account:alice'],[{user:{id:'alice'}},'loading','account:alice'],[{user:{id:'alice'}},'unauthenticated','account:alice'],[{user:{id:'alice'}},'authenticated','account:bob'],[{user:{id:' '}},'authenticated','account: ']]) assert.equal(owns(session,status,owner),false);
  const {publishMediaMetadata:metadata,publishMediaPlaybackState:state} = load('src/utils/mediaSessionCompatibility.mjs');
  const partial={}; metadata(partial,{title:'Track'},undefined);state(partial,true);assert.equal(partial.playbackState,'playing');
  const restricted={set metadata(value){throw new Error('unsupported')},set playbackState(value){throw new Error('unsupported')}};
  assert.doesNotThrow(()=>{metadata(restricted,{},class {});state(restricted,true);});
  assert.doesNotThrow(()=>{metadata(null,{},undefined);state(null,false);});
  for(const [types,expected] of [[['audio/webm'],'webm-opus'],[['audio/mp4'],'mp4-aac'],[[],null]]) {
    const {supportedMediaProfile} = load('src/components/MusicPlayer/media/mediaCapabilities.mjs',{}, {document:{createElement:()=>({canPlayType:type=>types.some(prefix=>type.startsWith(prefix))?'probably':''})}});
    assert.equal(supportedMediaProfile('audio'),expected);
  }
  const success=await deckCase();success.deck.playVideo();await tick();assert.equal(success.media.paused,false);success.deck.pauseVideo();assert.equal(success.media.paused,true);success.deck.destroy();
  const denied=Object.assign(new Error('gesture required'),{name:'NotAllowedError'});
  for(const options of [{play:()=>{throw denied}}, {play:()=>Promise.reject(denied)}, {graph:true,resumeContext:()=>{throw denied}}, {graph:true,resumeContext:()=>Promise.reject(denied),play:()=>{throw denied}}]) {
    const result=await deckCase(options);result.deck.playVideo();await tick();assert.deepEqual(result.events,['blocked']);assert.equal(result.media.paused,true);assert.deepEqual(result.failures,[]);result.deck.destroy();
  }
  let reject;
  const stale=await deckCase({play:()=>new Promise((_,failed)=>reject=failed)});
  stale.deck.playVideo();stale.deck.pauseVideo();reject(denied);await tick();assert.deepEqual(stale.events,[]);assert.equal(stale.media.paused,true);stale.deck.destroy();
  const broken=await deckCase({play:()=>{throw new Error('decode failed')}});broken.deck.playVideo();await tick();assert.deepEqual(broken.failures,['native_playback_failed']);broken.deck.destroy();
  const cued=await deckCase();
  const staleRenew=[...cued.timers.values()][0];
  cued.deck.cueVideoById({videoId:'lmnopqrstuv',startSeconds:12});
  assert.equal(cued.media.currentSrc,undefined,'Cueing another track must detach the old source');
  assert.equal(cued.deck.getDuration(),0,'Old track metadata must not describe the cued track');
  assert.equal(cued.timers.size,0,'Idle decks must not renew an abandoned source');
  staleRenew(); await tick();
  assert.equal(cued.requests.length,1,'A queued old renewal must not extract the cued track');
  cued.deck.playVideo(); cued.deck.playVideo(); await tick();
  assert.equal(cued.requests.length,2,'Play must resolve a cue-only track exactly once');
  assert.equal(cued.requests[1].videoId,'lmnopqrstuv');
  cued.listeners.get('loadedmetadata')(); await tick();
  assert.equal(cued.media.currentTime,12);
  assert.equal(cued.media.paused,false);
  cued.deck.destroy();
  cued.deck.playVideo(); await tick();
  assert.equal(cued.requests.length,2,'A disposed deck must not start another extraction');
  let completeOld;
  const pending=await deckCase({metadata:false,resolveAsset:()=>new Promise(resolve=>{ completeOld=resolve; })});
  pending.deck.cueVideoById('lmnopqrstuv');
  completeOld({receipt:'abandoned',asset:{url:'https://example.invalid/old',duration:180,expiresAt:Date.now()+300000}}); await tick();
  assert.equal(pending.media.currentSrc,undefined,'A late old response must not attach audio to the new track');
  assert(pending.cancelled.includes('abandoned'),'Late abandoned receipts must be released');
  assert.equal(pending.timers.size,0);
  pending.deck.destroy();
  console.log('PASS: authenticated background policy, guest/account isolation, explicit media-key intent, partial Media Session, Opus/AAC capability selection, native play/pause, synchronous and asynchronous denial, late rejection, decoding failure, cue-only playback, abandoned source cleanup, stale renewal and resolver isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
