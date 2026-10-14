/* Offline browser-engine tests. No live database, source extraction, or network. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {chromium, firefox, webkit} = require('playwright');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const output = path.join(root, 'artifacts/mobile-source-vm');
fs.mkdirSync(output, {recursive:true});
const sources = {
  '@/utils/mobileMediaPolicy.mjs':'src/utils/mobileMediaPolicy.mjs',
  '@/utils/youtubeResumePolicy.mjs':'src/utils/youtubeResumePolicy.mjs',
  '@/utils/mediaSessionCompatibility.mjs':'src/utils/mediaSessionCompatibility.mjs',
  '@/utils/eqPresets':'src/utils/eqPresets.js',
  './mediaPlayerStates.mjs':'src/components/MusicPlayer/media/mediaPlayerStates.mjs',
  './nativeAudioGraph.mjs':'src/components/MusicPlayer/media/nativeAudioGraph.mjs',
  './nativeMediaDeck.mjs':'src/components/MusicPlayer/media/nativeMediaDeck.mjs',
};
const compiled = Object.fromEntries(Object.entries(sources).map(([name,file])=>[name,ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText]));
const rate=16000, seconds=8, samples=rate*seconds, wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
const script = `(() => {
 const modules=${JSON.stringify(compiled)}, cache={};
 const data=Uint8Array.from(atob(${JSON.stringify(wav.toString('base64'))}),c=>c.charCodeAt(0));
 const assetUrl=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));
 window.vmResult={ready:false,tracks:1,requests:0,events:[],errors:[],loggedIn:true};
 const mockResolver={resolveMediaAsset:async()=>{vmResult.requests++;return {receipt:'synthetic',asset:{url:assetUrl,duration:8,expiresAt:Date.now()+600000}}},cancelMediaReceipt(){}};
 function require(name){if(name==='./resolveMediaAsset.mjs')return mockResolver;if(cache[name])return cache[name].exports;const module={exports:{}};cache[name]=module;new Function('module','exports','require',modules[name])(module,module.exports,require);return module.exports;}
 const policy=require('@/utils/mobileMediaPolicy.mjs'), resume=require('@/utils/youtubeResumePolicy.mjs'), session=require('@/utils/mediaSessionCompatibility.mjs');
 vmResult.mobile=policy.isMobileMediaClient(navigator);
 vmResult.desktopNarrow=policy.isMobileMediaClient({userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36'});
 window.vmGuestAllowed=()=>resume.authenticatedPlaybackOwner(null,'unauthenticated','guest');
 const {createNativeMediaDeck}=require('./nativeMediaDeck.mjs');
 let paused=true;
 window.vmDeck=createNativeMediaDeck({host:document.querySelector('#media'),videoId:'abcdefghijk',mode:'audio',maxHeight:1080,profile:'mp4-aac',autoplay:false,title:'Synthetic VM audio',
 events:{onReady(){vmResult.ready=true;},onStateChange(event){vmResult.events.push(event.data);if(event.data===0 && !paused && vmResult.loggedIn){vmResult.tracks++;vmDeck.loadVideoById({videoId:'lmnopqrstuv'});}},onAutoplayBlocked(){vmResult.errors.push('autoplay-blocked')}},onFallback(value){vmResult.errors.push(value.reason)}});
 document.querySelector('#play').onclick=()=>{paused=false;if(!resume.shouldDeferYoutubeResume({hidden:document.hidden,explicitUserAction:true,provider:'native',authenticated:vmResult.loggedIn})){vmDeck.unMute();vmDeck.playVideo();}};
 document.querySelector('#pause').onclick=()=>{paused=true;vmDeck.pauseVideo();};
 document.querySelector('#logout').onclick=()=>{paused=true;vmResult.loggedIn=false;vmDeck.destroy();session.publishMediaPlaybackState(navigator.mediaSession,false);};
 session.publishMediaMetadata(navigator.mediaSession,{title:'Synthetic VM audio',artist:'Offline test'},window.MediaMetadata);
 window.vmSample=()=>({time:vmDeck.getCurrentTime(),state:vmDeck.getPlayerState(),paused:document.querySelector('audio')?.paused,visibility:document.visibilityState,tracks:vmResult.tracks,errors:[...vmResult.errors],mobile:vmResult.mobile,requests:vmResult.requests});
})();`;
const html='<title>HayKasa VM audio</title><main><h1>Offline playback engine test</h1><p>Synthetic audio. This is a test fixture, not the HayKasa UI.</p><div id="media"></div><button id="play">Play</button><button id="pause">Pause</button><button id="logout">Log out</button></main>';
async function waitFor(page, predicate) {await page.waitForFunction(predicate,null,{timeout:20000});}
(async()=>{
 const results=[];
 try {
  for(const [name,type,agent] of [
   ['chromium',chromium,'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36'],
   ['firefox',firefox,'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130 Firefox/130'],
   ['webkit',webkit,'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1']]) {
   const browser=await type.launch({headless:process.env.VM_HEADLESS==='1'});
   try {
    const context=await browser.newContext({userAgent:agent,viewport:{width:390,height:844},hasTouch:true});
    const network=[];await context.route(/https?:\/\//,route=>{network.push(route.request().url());return route.abort();});
    const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setContent(html);await page.addScriptTag({content:script});await waitFor(page,()=>vmResult.ready);
    assert.equal(await page.evaluate(()=>vmResult.mobile),true);assert.equal(await page.evaluate(()=>vmResult.desktopNarrow),false);assert.equal(await page.evaluate(()=>vmGuestAllowed()),false);
    await page.click('#play');await waitFor(page,()=>vmDeck.getCurrentTime()>0.4 && vmDeck.getPlayerState()===1);
    const before=await page.evaluate(()=>vmSample());
    await page.bringToFront();
    const windowId=execFileSync('xdotool',['getactivewindow'],{encoding:'utf8'}).trim();
    const windowTitle=execFileSync('xdotool',['getwindowname',windowId],{encoding:'utf8'}).trim();
    assert.ok(windowTitle.includes('HayKasa VM audio'),'Minimize the test browser window, not another application');
    execFileSync('xdotool',['windowminimize',windowId]);
    await new Promise(resolve=>setTimeout(resolve,1800));
    const background=await page.evaluate(()=>vmSample());
    const hidden=background.visibility==='hidden';
    assert.equal(hidden,true,name+' must enter a real minimized-window state');
    if(hidden){assert.ok(background.time>before.time+0.5,'Audio must advance while hidden');assert.equal(background.paused,false);}
    await page.evaluate(()=>vmDeck.seekTo(7.8));await waitFor(page,()=>vmResult.tracks===2 && vmDeck.getCurrentTime()>0.2);
    const advance=await page.evaluate(()=>vmSample());assert.equal(advance.errors.length,0);
    await page.evaluate(()=>document.querySelector('#pause').click());const pause=await page.evaluate(()=>vmSample());
    await new Promise(resolve=>setTimeout(resolve,500));assert.ok(Math.abs((await page.evaluate(()=>vmSample())).time-pause.time)<0.15,'Pause must remain paused in background');
    execFileSync('xdotool',['windowmap',windowId]);execFileSync('xdotool',['windowactivate','--sync',windowId]);await page.bringToFront();assert.equal((await page.evaluate(()=>vmSample())).paused,true,'Returning must not undo explicit Pause');
    await page.click('#play');await waitFor(page,()=>vmDeck.getPlayerState()===1);await page.click('#logout');assert.equal(await page.locator('audio').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
    await page.screenshot({path:path.join(output,name+'.png')});
    results.push({engine:name,windowTitle,mobileEmulation:true,syntheticAudio:true,backgroundVisibility:background.visibility,backgroundProgress:hidden?'passed':'not_observed',playPause:true,trackAdvance:true,logoutCleanup:true,networkRequests:network.length,before,background,advance});
    console.log('MEASUREMENTS '+JSON.stringify(results.at(-1)));
    console.log('PASS '+name+': native decode/play, routing, track advance, explicit pause, logout; background visibility='+background.visibility);
    await context.close();
   } finally {await browser.close();}
  }
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'passed',physicalMobileDevice:false,liveYtDlp:false,results},null,2));
 } catch(error){fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'failed',error:error.stack,physicalMobileDevice:false,liveYtDlp:false,results},null,2));throw error;}
})().catch(error=>{console.error(error);process.exitCode=1});
