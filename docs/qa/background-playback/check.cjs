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
function recoveryCase() {
  const queue = load('src/utils/playerQueue.mjs');
  const policy = load('src/utils/youtubePlaybackError.mjs', {'./playerQueue.mjs':queue});
  const source = fs.readFileSync(path.join(root, 'src/components/MusicPlayer/YouTubePlayer.jsx'), 'utf8');
  const part = (start, end) => {
    const first = source.indexOf(start), last = source.indexOf(end, first);
    assert(first >= 0 && last > first, `Production playback function not found: ${start}`);
    return source.slice(first, last);
  };
  const intervals = new Map(), timeouts = new Map(); let timerId = 0, now = 0, playerState = 1, outputRatio = 1;
  const calls = {reloads:0, searches:0, advances:0, manualSkips:0, stops:0, pauses:0};
  const player = {provider:'youtube', getCurrentTime:()=>0, getPlayerState:()=>playerState, getVideoData:()=>({video_id:context.videoRef.current.id}), playVideo(){}, unMute(){},
    loadVideoById(){ calls.reloads++; }, pauseVideo(){ calls.pauses++; }};
  const toast = ()=>{}; toast.error = ()=>{};
  const context = {
    ...queue, ...policy, Set, console, toast,
    window:{
      setInterval(fn, ms){ intervals.set(++timerId, {fn, due:now+ms, ms}); return timerId; }, clearInterval(id){ intervals.delete(id); },
      setTimeout(fn, ms){ timeouts.set(++timerId, {fn, due:now+ms}); return timerId; }, clearTimeout(id){ timeouts.delete(id); },
    },
    fadeTimerRef:{current:null}, fadeInTimerRef:{current:null}, fadeEnabled:true, fadeSeconds:.8, MAX_SKIP_FADE_SECONDS:1, isPlaying:true,
    getActivePlayer:()=>player, applyPlaybackVolume(_player, ratio=1){ outputRatio = ratio; }, mediaLoadOptions:()=>({}), apiReady:true,
    videoRef:{current:{id:'synthetic01', queueEntryId:'occurrence-A', title:'Synthetic track'}},
    endFadeOccurrenceRef:{current:null}, MEDIA_PLAYER_STATES:{PLAYING:1}, playerVideoId:value=>value.getVideoData().video_id,
    userPausedRef:{current:false}, trackChangeUntilRef:{current:0}, isJamGuestRef:{current:false},
    failureResolveRef:{current:null}, sameIdRetryRef:{current:null}, alternateAttemptRef:{current:{identity:null}},
    abortCrossfade(){}, clearActiveBufferTimers(){}, markExpectPlaying(){},
    setPlayerError(value){ if (value) calls.stops++; },
    playPause:value=>({type:'playPause', value}), replaceCurrentYoutubeTrack:value=>({type:'replace', value}),
    dispatch(action){
      // Replacements preserve the queue occurrence, as the production reducer does.
      if (action.type === 'replace') context.videoRef.current = {...context.videoRef.current, ...action.value};
    },
    resolveAlternateUpload:async()=>{ calls.searches++; return {id:`alternate0${calls.searches}`, title:'Synthetic alternate'}; },
    store:{getState:()=>({settings:{explicitContent:true}})}, isTrackAllowed:()=>true,
    playNextOrContinueRef:{current:async()=>{ calls.advances++; return true; }},
  };
  context.video = context.videoRef.current;
  context.useEffect = effect => { context.fadeInEffect = effect; };
  const advance = milliseconds => {
    const until = now + milliseconds;
    for (;;) {
      const pending = [...intervals.entries()].map(([id, timer])=>({id, timer, interval:true}))
        .concat([...timeouts.entries()].map(([id, timer])=>({id, timer, interval:false})))
        .filter(({timer})=>timer.due <= until).sort((a,b)=>a.timer.due-b.timer.due)[0];
      if (!pending) break;
      now = pending.timer.due;
      if (pending.interval) pending.timer.due += pending.timer.ms;
      else timeouts.delete(pending.id);
      pending.timer.fn();
    }
    now = until;
  };
  // Exercise production callbacks rather than reproducing their branching here.
  vm.runInNewContext(part('const cancelFade = () =>', 'const emptyRecovery =')
    + part('const fadeOutThenSkip = (run) =>', 'const handleNext =')
    + part('const handlePlaybackFailure = async', 'handlePlaybackFailureRef.current = handlePlaybackFailure;')
    + part('// Fade a newly-started track in from silence', 'const seekOnCurrentTrack =')
    + '\nglobalThis.fail = handlePlaybackFailure; globalThis.skip = fadeOutThenSkip;', context);
  return {context, policy, calls, intervals,
    startSkip(){ context.skip(()=>{ calls.manualSkips++; }); },
    setPlayerState(value){ playerState = value; },
    startFadeIn(){ return context.fadeInEffect(); }, advance,
    outputRatio:()=>outputRatio,
    finishFade(){ advance(1500); },
  };
}
(async()=>{
  for (const code of [100, '100', 101, '101', 150, '150', 153, '153']) {
    const recovery = recoveryCase();
    for (const attempts of [0, 2, 99]) {
      const result = recovery.policy.youtubePlaybackFailurePolicy({code, sameIdAttempts:attempts, alternateAttempts:attempts});
      assert.equal(result.action, 'fatalUI', `Provider error ${code} stops at every recovery budget`);
      assert.equal(result.error.canRetry, Number(code) === 153, `Provider error ${code} only offers a useful same-upload manual retry`);
    }
    const before = {...recovery.context.videoRef.current};
    await recovery.context.fail({code});
    assert.equal(recovery.calls.stops, 1, `Provider error ${code} must stop on its first error`);
    assert.equal(recovery.calls.pauses, 1);
    assert.equal(recovery.context.userPausedRef.current, true);
    assert.deepEqual(recovery.context.videoRef.current, before, 'Terminal errors preserve the selected song and queue occurrence');
    assert.equal(recovery.calls.reloads + recovery.calls.searches + recovery.calls.advances, 0, `Provider error ${code} must not reload, search alternate uploads or consume the queue`);
  }
  for (const code of [2, 5, 999, 'stall']) {
    const recovery = recoveryCase();
    const selectedOccurrence = recovery.context.videoRef.current.queueEntryId;
    for (let attempt=0; attempt<24 && recovery.calls.stops === 0; attempt++) await recovery.context.fail({code});
    assert.equal(recovery.calls.searches, 3, `Transient error ${code} retains its bounded alternate budget`);
    assert.equal(recovery.calls.reloads, code === 'stall' ? 0 : 8, 'Each of the four attempted uploads has at most two same-ID retries');
    assert.equal(recovery.calls.advances, 0, 'Exhausted recovery must not advance the queue and restart its budget');
    assert.equal(recovery.calls.stops, 1, 'Exhausted recovery must surface the failure');
    assert.equal(recovery.calls.pauses, 1);
    assert.equal(recovery.context.userPausedRef.current, true);
    assert.equal(recovery.context.videoRef.current.queueEntryId, selectedOccurrence, 'Bounded alternate recovery preserves the selected queue occurrence');
  }
  {
    const recovery = recoveryCase();
    const before = {...recovery.context.videoRef.current};
    recovery.context.resolveAlternateUpload = async () => { recovery.calls.searches++; return null; };
    await recovery.context.fail({code:'stall'});
    assert.equal(recovery.calls.searches, 1, 'An exhausted upload search is attempted once');
    assert.equal(recovery.calls.stops, 1, 'No alternative must expose the failure');
    assert.equal(recovery.calls.advances, 0, 'No alternative must not silently consume the queue');
    assert.deepEqual(recovery.context.videoRef.current, before, 'An empty recovery search preserves the selected song');
  }
  for (const interruption of ['verification-error', 'embed-error', 'autoplay-error', 'pause', 'track-change', 'none']) {
    const recovery = recoveryCase(); recovery.startSkip();
    if (interruption === 'verification-error') await recovery.context.fail({code:153});
    if (interruption === 'embed-error') await recovery.context.fail({code:150});
    if (interruption === 'autoplay-error') await recovery.context.fail({kind:'autoplay'});
    if (interruption === 'pause') recovery.context.userPausedRef.current = true;
    if (interruption === 'track-change') recovery.context.videoRef.current = {id:'synthetic02', queueEntryId:'occurrence-B'};
    if (interruption.endsWith('-error')) assert.equal(recovery.intervals.size, 0, 'Terminal errors must cancel a pending skip fade');
    recovery.finishFade();
    assert.equal(recovery.calls.manualSkips, interruption === 'none' ? 1 : 0, `Delayed skip must respect ${interruption}`);
  }
  const immediateSkip = recoveryCase();
  immediateSkip.setPlayerState(3); immediateSkip.startFadeIn();
  immediateSkip.setPlayerState(1); immediateSkip.startSkip();
  immediateSkip.advance(1200);
  assert.equal(immediateSkip.calls.manualSkips, 1, 'A pending startup fade-in must not cancel an immediate manual skip');
  const startup = recoveryCase();
  startup.setPlayerState(3); startup.startFadeIn();
  startup.setPlayerState(1); startup.advance(1200);
  assert.equal(startup.outputRatio(), 1, 'An uninterrupted startup fade must still reach the selected output volume');
  assert.equal(startup.calls.manualSkips, 0);
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
  console.log('PASS: terminal unavailable/embed/verification errors, bounded upload recovery without automatic queue advancement, interrupted and healthy skip fades, pending startup fade cancellation, uninterrupted startup fade, authenticated background policy, guest/account isolation, explicit media-key intent, partial Media Session, Opus/AAC capability selection, native play/pause, synchronous and asynchronous denial, late rejection, decoding failure, cue-only playback, abandoned source cleanup, stale renewal and resolver isolation');
})().catch(error=>{console.error(error);process.exitCode=1});
