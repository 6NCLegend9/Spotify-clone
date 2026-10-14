/* Isolated route/module fuzzing: no real database, mail, provider, or network access. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../../..');
const req = require('node:module').createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
process.env = { NODE_ENV: 'test', NEXTAUTH_SECRET: 'AUDIT_SYNTHETIC_SECRET_'.repeat(3) };
let networkAttempts = 0;
global.fetch = async () => { networkAttempts++; throw new Error('AUDIT_NETWORK_DISABLED'); };
const results = [], logs = [], cache = new Map();
const syntheticUser = { _id: '507f1f77bcf86cd799439011', email: 'audit@example.invalid', userName: 'Audit', isVerified: true, sessionVersion: 0 };
const syntheticData = { _id: '507f1f77bcf86cd799439012', playlists: [], settings: {}, genres: [], seenNotificationIds: [] };
let authenticated = true, modelMode = 'empty', playlist = null;
function chain(value) {
 const q = { then: (ok, fail) => Promise.resolve(value).then(ok, fail) };
 for (const m of ['select', 'lean', 'session', 'sort', 'populate', 'limit']) q[m] = () => q;
 return q;
}
const mockModel = new Proxy({}, {get: (_, key) => {
 if (key === 'db') return {transaction: async (cb) => cb({})};
 if (key === 'findById') return () => chain(modelMode === 'playlist' ? playlist : syntheticData);
 if (key === 'findOne') return () => chain(null);
 if (key === 'find') return () => chain([]);
 if (key === 'create') return async (v) => Array.isArray(v) ? v.map(x => ({...x, _id:'507f1f77bcf86cd799439013'})) : {...v,_id:'507f1f77bcf86cd799439013'};
 if (key === 'findByIdAndUpdate') return (_, changes) => chain({ ...syntheticData, settings: Object.fromEntries(Object.entries(changes.$set || {}).filter(([k])=>k.startsWith('settings.')).map(([k,v])=>[k.slice(9),v])) });
 if (key === 'updateOne' || key === 'deleteOne' || key === 'updateMany') return async () => ({modifiedCount:1});
 return undefined;
}});
const esmDefault = value => ({__esModule:true, default:value});
const stubs = {
 '@/utils/dbconnect': esmDefault(async()=>{}),
 '@/utils/mailSender': esmDefault(async()=>{}),
 '@/utils/rateLimit': {getClientKey:()=> 'audit-local', isRateLimited:async()=>({limited:false,retryAfter:1})},
 '@/utils/sessionAuth': {getSessionUser:async()=>authenticated?syntheticUser:null,resolveSessionUser:async()=>authenticated?syntheticUser:null},
 '@/utils/userAccount': {getAuthenticatedAccount:async(_,options={})=> {
  if (!authenticated) { if(options.optional)return null; throw new (load('src/utils/apiResponseCore.mjs').ApiRouteError)('UNAUTHORIZED'); }
  return {user:syntheticUser,userData:syntheticData,email:syntheticUser.email};
 }},
 'next-auth/jwt': {getToken:async()=>authenticated?{id:syntheticUser._id}:null, encode:async()=> 'AUDIT_SYNTHETIC_SESSION'},
 '@/utils/youtubeApi': {hasYouTubeApiKey:()=>false,youtubeFetch:async()=>({ok:true,data:{items:[]}}), fetchYouTubeCaptionLines:async()=>[],fetchYouTubeChannel:async()=>null,fetchYouTubeMusicAlbum:async()=>null,parseIsoDuration:()=>0,hydrateYoutubeCatalogTracks:async()=>[]},
};
function load(file, extra={}, globals={}) {
 const absolute=path.resolve(root,file);
 if(cache.has(absolute)&&!Object.keys(extra).length&&!Object.keys(globals).length)return cache.get(absolute).exports;
 const module={exports:{}}; if(!Object.keys(extra).length&&!Object.keys(globals).length)cache.set(absolute,module);
 const input=fs.readFileSync(absolute,'utf8');
 const compiled=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 function resolve(name) {
  if(name in extra)return extra[name];
  if(name in stubs)return stubs[name];
  if(name.startsWith('@/models/'))return esmDefault(mockModel);
  if(name.startsWith('@/')||name.startsWith('.')) {
   let p=name.startsWith('@/')?path.join(root,'src',name.slice(2)):path.resolve(path.dirname(absolute),name);
   if(!path.extname(p)) p += fs.existsSync(p+'.js')?'.js':fs.existsSync(p+'.mjs')?'.mjs':'.jsx';
   return load(path.relative(root,p));
  }
  if(['net','http','https','tls','child_process'].some(x=>name===x||name==='node:'+x))throw Error('AUDIT_FORBIDDEN_IMPORT '+name);
  return req(name);
 }
 const context={ module,exports:module.exports, require:resolve, process, Buffer, URL, URLSearchParams, Request, Response, Headers, ReadableStream, TextEncoder, TextDecoder, AbortSignal, AbortController, DOMException, structuredClone, performance, setTimeout,clearTimeout,console:{log(){},info(){},warn(){},error(...args){logs.push(args.map(String).join(' '));}}, fetch:global.fetch, ...globals };
 vm.runInNewContext(`(function(exports,require,module,__filename,__dirname){${compiled}\n})`,context,{filename:absolute})(module.exports,resolve,module,absolute,path.dirname(absolute));
 return module.exports;
}
async function record(name, fn) {
 const start=performance.now();
 try { const observation=await fn(); results.push({name,observation,ms:+(performance.now()-start).toFixed(2)}); }
 catch(e) {results.push({name,error:String(e.message).slice(0,200),ms:+(performance.now()-start).toFixed(2)});}
}
const values=[undefined,null,'','   ','\u0000\u0001','<script>alert(1)</script>','<img src=x onerror=alert(1)>',"' OR 1=1 --",{$ne:null},['x'],-1,0,1.5,1e308,'A'.repeat(10001),'😀'.repeat(3000),'مرحبا שלום 日本語','__proto__','constructor','toString'];
function request(url,method,body,origin='http://localhost:3000') {
 const r=new Request('http://localhost:3000'+url,{method,headers:{origin,'content-type':'application/json'},...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
 r.nextUrl=new URL(r.url); return r;
}
async function routeCall(file,method,body,url='/api/audit',origin) {
 const route=load(file); const r=await route[method](request(url,method,body,origin));
 return {status:r.status,body:await r.json(),cacheControl:r.headers.get('cache-control')};
}
(async()=>{
 const core=load('src/utils/apiResponseCore.mjs');
 for(const raw of ['', 'null','[]','true','{','{"x":NaN}','{"x":1e309}','{"__proto__":{"polluted":true}}'])
  await record('json:'+raw,async()=>{try{return {accepted:await core.readRequestJson(request('/api/audit','POST',raw))};}catch(e){return {rejected:e.code};}});
 await record('json:8MiB-body',async()=>{const raw=JSON.stringify({padding:'A'.repeat(8*1024*1024)}); try { const parsed=await core.readRequestJson(request('/api/audit','POST',raw));return {acceptedBytes:raw.length,paddingLength:parsed.padding.length}; } catch(e) {return {rejected:e.code,status:e.status};}});
 await record('json:interrupted-stream',async()=>{const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"x":'));c.error(Error('synthetic interrupted stream'));}});try{await core.readRequestJson(new Request('http://localhost:3000/api/audit',{method:'POST',body:stream,duplex:'half'}));return 'accepted';}catch(e){return {rejected:e.code};}});
 const routes=[
 ['src/app/api/signup/route.js','POST',(v)=>({userName:v,email:'audit@example.invalid',password:'Audit12345!'})],
 ['src/app/api/signup/route.js','POST',(v)=>({userName:'Audit',email:v,password:'Audit12345!'})],
 ['src/app/api/signup/route.js','POST',(v)=>({userName:'Audit',email:'audit@example.invalid',password:v})],
 ['src/app/api/settings/route.js','PUT',(v)=>({settings:{masterVolume:v}})],
 ['src/app/api/settings/route.js','PUT',(v)=>({settings:{fadeSeconds:v}})],
 ['src/app/api/settings/route.js','PUT',(v)=>({settings:{explicitContent:v}})],
 ['src/app/api/language/route.js','PUT',(v)=>({languages:v})],
 ['src/app/api/userPlaylists/route.js','POST',(v)=>({name:v})],
 ['src/app/api/userPlaylists/route.js','POST',(v)=>({name:'Audit',category:v})],
 ['src/app/api/userPlaylists/songs/route.js','POST',(v)=>({playlistID:v,song:'dQw4w9WgXcQ'})],
 ['src/app/api/desktop/auth/exchange/route.js','POST',(v)=>({code:v,state:v,verifier:v})],
 ];
 for(let i=0;i<routes.length;i++)for(let j=0;j<values.length;j++) {
  const [file,method,wrap]=routes[i]; await record(`route:${i}:case:${j}`,()=>routeCall(file,method,wrap(values[j])));
 }
 const mongoose=req('mongoose'); const modelExports=load('src/models/Playlist.js',{'mongoose':mongoose});
 modelMode='playlist';
 function newPlaylist(){const p=new modelExports.default({name:'Audit',user:syntheticUser._id});p.save=async()=>{await p.validate();return p;};p.populate=async()=>p;return p;}
 for(const action of ['name','category','pinned','smartShuffle','visibility','cover','details'])for(let j=0;j<values.length;j++) {
  playlist=newPlaylist();await record(`playlist:${action}:case:${j}`,()=>routeCall('src/app/api/userPlaylists/route.js','PATCH',{playlistId:'507f1f77bcf86cd799439014',action,value:values[j]}));
 }
 for(const cover of ['data:image/png;base64,','data:image/png;base64,NOT_BASE64!!!','data:image/png;base64,'+Buffer.from('#!/bin/sh\necho audit').toString('base64'),'data:image/jpeg;base64,'+Buffer.from('MZ fake executable').toString('base64')]){
  playlist=newPlaylist();await record('cover:corrupt:'+cover,()=>routeCall('src/app/api/userPlaylists/route.js','PATCH',{playlistId:'507f1f77bcf86cd799439014',action:'cover',value:cover}));
 }
 for(const value of ['\u200b','\u0000\u0001']){
  playlist=newPlaylist();await record('invisible-playlist-name:'+JSON.stringify(value),()=>routeCall('src/app/api/userPlaylists/route.js','PATCH',{playlistId:'507f1f77bcf86cd799439014',action:'name',value}));
  await record('invisible-signup-name:'+JSON.stringify(value),()=>routeCall('src/app/api/signup/route.js','POST',{userName:value,email:'audit@example.invalid',password:'Audit12345!'}));
 }
 await record('signup-unicode-surrogate-boundary',()=>routeCall('src/app/api/signup/route.js','POST',{userName:'a'+'😀'.repeat(30),email:'audit@example.invalid',password:'Audit12345!'}));
 modelMode='empty';authenticated=false;
 const routeFiles=[];
 function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(e.name==='route.js')routeFiles.push(path.relative(root,p));}}
 walk(path.join(root,'src/app/api'));
 for(const file of routeFiles){if(file.includes('[...nextauth]'))continue;
  let m;try{m=load(file);}catch(e){results.push({name:'coverage:'+file,excluded:String(e.message).slice(0,180)});continue;}
  for(const method of ['POST','PUT','PATCH','DELETE'].filter(x=>typeof m[x]==='function')) {
   await record('anonymous:'+file+':'+method,()=>routeCall(file,method,{}));
   await record('foreign-origin:'+file+':'+method,()=>routeCall(file,method,{},'/api/audit','https://attacker.invalid'));
  }
 }
 const getRoutes=[['youtube-captions','videoId'],['youtube-videos','id'],['youtube-playlist','id'],['youtube-channel','id'],['youtube-album','id']];
 for(const [name,key] of getRoutes)for(let j=0;j<values.length;j++){
  const raw=values[j]===undefined?'':typeof values[j]==='object'?JSON.stringify(values[j]):String(values[j]);
  await record(`query:${name}:case:${j}`,()=>routeCall(`src/app/api/${name}/route.js`,'GET',null,`/api/${name}?${key}=${encodeURIComponent(raw)}`));
 }
 const updateRoute=load('src/app/api/desktop/update/[channel]/[file]/route.js');
 for(const value of ['../secret','../../.env','%2e%2e%2f.env','latest.yml/../../.env','\\etc\\passwd','',null,'A'.repeat(10001)])
  await record('desktop-file-route:'+String(value).slice(0,90),async()=>{const r=await updateRoute.GET(null,{params:Promise.resolve({channel:'stable',file:value})});return {status:r.status};});
 await record('json-concurrent-64x128KiB',async()=>{const raw=JSON.stringify({padding:'A'.repeat(128*1024)});const rssBefore=process.memoryUsage().rss;const r=await Promise.all(Array.from({length:64},()=>core.readRequestJson(request('/api/audit','POST',raw)).then(()=> 'accepted',e=>e.code)));return {completed:r.length,accepted:r.filter(x=>x==='accepted').length,rejected:r.filter(x=>x==='PAYLOAD_TOO_LARGE').length,bytesPerBody:raw.length,rssDeltaBytes:process.memoryUsage().rss-rssBefore};});
 const folders=fs.mkdtempSync(path.join(os.tmpdir(),'haykasa-audit-'));
 const nativeStore=await import(pathToFileURL(path.join(root,'desktop/src/nativeStore.mjs')));
 const nativeLogger=await import(pathToFileURL(path.join(root,'desktop/src/nativeLogger.mjs')));
 const appearance=await import(pathToFileURL(path.join(root,'desktop/src/appearanceStore.mjs')));
 for(const raw of ['', '{','null','[]','{"crashStreak":-1,"updateChannel":"../../","autoLaunch":"true","password":"AUDIT_SECRET"}',JSON.stringify({lastNotifiedVersion:'😀'.repeat(10000),rendererCrashCount:1e308})]) {
  fs.writeFileSync(path.join(folders,'desktop-settings.json'),raw);
  await record('desktop-settings-corruption:'+raw.slice(0,80),()=>{const store=new nativeStore.NativeStore(folders);return {crashStreak:store.get('crashStreak'),updateChannel:store.get('updateChannel'),secretRetained:JSON.stringify(store.getAll()).includes('AUDIT_SECRET')};});
 }
 const logger=new nativeLogger.NativeLogger(folders);
 await record('native-log-redaction',()=>{logger.error('audit',{token:'AUDIT_SECRET',password:'AUDIT_SECRET',error:'request https://local.invalid/?token=AUDIT_SECRET',email:'audit@example.invalid'});const raw=fs.readFileSync(logger.file,'utf8');return {sensitiveFieldRedacted:raw.includes('"token":"[redacted]"'),freeTextSecretRetained:raw.includes('?token=AUDIT_SECRET'),emailRetained:raw.includes('audit@example.invalid')};});
 for(const raw of ['', '{','null','[]',JSON.stringify({version:1,profiles:[{name:'A'.repeat(10000),opacity:1e308}]})]) {
  fs.mkdirSync(path.join(folders,'appearance'),{recursive:true});
  fs.writeFileSync(path.join(folders,'appearance','appearance.json'),raw);
  await record('appearance-corruption:'+raw.slice(0,60),()=>{const store=new appearance.AppearanceStore(folders);return {loaded:!!store.resolve()};});
 }
 const auth=await import(pathToFileURL(path.join(root,'desktop/src/authFlow.mjs')));
 const sec=await import(pathToFileURL(path.join(root,'desktop/src/security.mjs')));
 const urls=['','%','heykasa://auth','heykasa://open/../../settings','file:///etc/passwd','javascript:alert(1)','https://haykasa.vercel.app.attacker.invalid','https://user:pass@haykasa.vercel.app','heykasa://auth?code='+ 'A'.repeat(32)+'&state='+ 'B'.repeat(32),'heykasa://auth?code='+ 'A'.repeat(10001)+'&state='+ 'B'.repeat(32)];
 const origins=sec.buildTrustedOrigins();
 for(const url of urls)await record('url:'+url.slice(0,100),()=>({authLink:auth.parseDesktopAuthDeepLink(url),safeDeepLink:sec.isSafeHeyKasaDeepLink(url),trustedRenderer:sec.isTrustedRendererUrl(url,origins),safeExternal:sec.isSafeExternalUrl(url)}));
 let seed=7301;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let i=0;i<2000;i++){const url=Array.from({length:rand()%250},()=>String.fromCharCode(rand()%65536)).join('');await record('url-random:'+i,()=>({auth:!!auth.parseDesktopAuthDeepLink(url),deep:sec.isSafeHeyKasaDeepLink(url),renderer:sec.isTrustedRendererUrl(url,origins)}));}
 const image=load('src/utils/imageOptimize.js');
 for(const file of [null,{size:0,type:'application/octet-stream'},{size:8*1024*1024+1,type:'image/png'},{size:0,type:'image/png'}])await record('cover-client:'+JSON.stringify(file),async()=>{try{await image.resizeCoverFile(file);return 'accepted';}catch(e){return {error:e.message};}});
 class AbortedReader { readAsDataURL(){ setTimeout(()=>this.onabort?.(),0); } }
 const interruptedImage=load('src/utils/imageOptimize.js',{}, {FileReader:AbortedReader});
 await record('cover-client-read-abort',async()=>{const result=await Promise.race([interruptedImage.resizeCoverFile({type:'image/png',size:100}).then(()=> 'resolved',()=> 'rejected'),new Promise(resolve=>setTimeout(()=>resolve('pending_after_50ms'),50))]);return {result};});
 class CorruptReader { readAsDataURL(){ this.result='data:image/png;base64,NOT_BASE64'; setTimeout(()=>this.onload?.(),0); } }
 class FailedImage { set src(_){setTimeout(()=>this.onerror?.(),0);} }
 const corruptImage=load('src/utils/imageOptimize.js',{}, {FileReader:CorruptReader,Image:FailedImage});
 await record('cover-client-decoder-failure',async()=>{try{await corruptImage.resizeCoverFile({type:'image/png',size:10});return 'accepted';}catch(e){return {rejected:e.message};}});
 const arcade=load('src/utils/arcadeAudioFile.mjs');
 await record('arcade-unbounded-file-read',async()=>{let read=false;try {await arcade.decodeArcadeAudio({name:'oversized.mp3',type:'audio/mpeg',size:1024*1024*1024,arrayBuffer:async()=>{read=true;return new ArrayBuffer(0);}}, {AudioContextClass:class {}});} catch(e){return {declaredSize:1024*1024*1024,arrayBufferCalled:read,rejected:e.message};}});
 const react=req('react'), {renderToStaticMarkup}=req('react-dom/server');
 await record('react-xss-text-encoding',()=>{const payload='<img src=x onerror=alert(1)><script>alert(1)</script>مرحبا';const html=renderToStaticMarkup(react.createElement('p',null,payload));return {escaped:!html.includes('<script>')&&!html.includes('<img'),html};});
 const email=load('src/emails/VerificationEmail.js');
 await record('verification-email-xss',()=>{const html=email.getVerificationEmailTemplate('<img onerror=alert(1)>','https://local.invalid/?x=" onclick="alert(1)',{logoUrl:'https://local.invalid/logo',lightPillarUrl:'https://local.invalid/light'});return {nameEscaped:html.includes('&lt;img'),hrefEscaped:html.includes('&quot;')}});
 // Actual account-cache persistence, using a synthetic storage implementation.
 const account=load('src/utils/accountCache.mjs');const storage=new Map();const fakeStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
 await record('account-cache-plaintext-history',()=>{account.writeAccountCache(fakeStorage,'heykasa:history:v1','account:synthetic',{title:'AUDIT_PRIVATE_LISTENING_HISTORY'});return {plaintext:JSON.stringify([...storage]).includes('AUDIT_PRIVATE_LISTENING_HISTORY'),crossAccountReadableByHelper:account.readAccountCache(fakeStorage,'heykasa:history:v1','account:other')!==null};});
 await record('session-cache-expired-entry-retention',async()=>{
  let clock=Date.now();
  class AuditDate extends Date {static now(){return clock;}}
  const isolatedGlobals={};
  const lookup=load('src/utils/sessionAuth.js',{
   '@/models/User':esmDefault({findById:async(id)=>({_id:id,isVerified:true,sessionVersion:0,email:'synthetic@example.invalid'})}),
  },{globalThis:isolatedGlobals,Date:AuditDate});
  for(let i=1;i<=10000;i++){
   const id=i.toString(16).padStart(24,'0');
   await lookup.resolveSessionUser({id,sub:id,sessionVersion:0},{fresh:true});
  }
  clock+=5000;
  const id=(1).toString(16).padStart(24,'0');
  await lookup.resolveSessionUser({id,sub:id,sessionVersion:0},{fresh:true});
  const map=isolatedGlobals.__HeyKasaSessionLookup;
  return {insertedUsers:10000,cacheSize:map.size,expiredRetained:[...map.values()].filter(e=>e.expiresAt<clock).length,advanceMs:5000};
 });
 const assert=req('node:assert/strict');
 const sharp=req('sharp');const cover=load('src/utils/coverValidation.js');
 await record('cover-valid-real-png',async()=>{const bytes=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).png().toBuffer();const result=await cover.validatedCover('data:image/png;base64,'+bytes.toString('base64'));const meta=await sharp(Buffer.from(result.split(',')[1],'base64')).metadata();return {format:meta.format,width:meta.width,height:meta.height};});
 await record('cover-mime-spoof-real-png',async()=>{const bytes=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).png().toBuffer();try{await cover.validatedCover('data:image/jpeg;base64,'+bytes.toString('base64'));return 'accepted';}catch(e){return {rejected:e.code};}});
 await record('json-forged-length-stream',async()=>{let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('A'.repeat(65537)));},cancel(){cancelled=true;}});try{await core.readRequestJson(new Request('http://localhost:3000/api/audit',{method:'POST',headers:{'content-length':'1'},body:stream,duplex:'half'}));return 'accepted';}catch(e){return {rejected:e.code,cancelled};}});
 await record('logout-cache-purge-and-pending-writes',()=>{const privacy=load('src/utils/accountStorage.mjs');const map=new Map();const storage={get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};privacy.setActiveAccountOwner('account:synthetic');account.writeAccountCache(storage,'heykasa:history:v1','account:synthetic',{title:'AUDIT_HISTORY'});map.set('heykasa:playback:v1:account%3Asynthetic','AUDIT_QUEUE');map.set('persist:settings','appearance-preferences');map.set('heykasa:history:v1:guest','guest-history');privacy.clearLocalAccountCaches();privacy.clearAccountStorage(storage);const lateWrite=account.writeAccountCache(storage,'heykasa:history:v1','account:synthetic',{title:'LATE_HISTORY'});return {accountKeys:[...map.keys()].filter(x=>x.includes('account')).length,lateWrite,preferencesPreserved:map.has('persist:settings'),guestPreserved:map.has('heykasa:history:v1:guest')};});
 await record('legacy-log-scrub',()=>{const folder=fs.mkdtempSync(path.join(os.tmpdir(),'haykasa-old-log-'));fs.mkdirSync(path.join(folder,'logs'));const file=path.join(folder,'logs','desktop.log');fs.writeFileSync(file,JSON.stringify({event:'native_ipc_failed',error:'Bearer AUDIT_SECRET',detail:'https://local.invalid/?token=AUDIT_SECRET',token:'AUDIT_SECRET'})+'\n');const logger=new nativeLogger.NativeLogger(folder);const raw=fs.readFileSync(file,'utf8');const tail=JSON.stringify(logger.tail());fs.rmSync(folder,{recursive:true,force:true});return {rawSecret:raw.includes('AUDIT_SECRET'),tailSecret:tail.includes('AUDIT_SECRET')};});
 await record('auth-post-wrapper-preserves-form',async()=>{const factory=esmDefault(()=>async(r,ctx)=>Response.json({body:await r.text(),cookie:r.headers.get('cookie'),param:ctx.marker}));const authRoute=load('src/app/api/auth/[...nextauth]/route.js',{'next-auth':factory,'@/utils/authOptions':{authOptions:{}}});const body='csrfToken=SYNTHETIC&email=audit%40example.invalid&password=A%2BB%F0%9F%98%80';const r=await authRoute.POST(new Request('http://localhost:3000/api/auth/callback/credentials',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',cookie:'next-auth.csrf-token=SYNTHETIC'},body}),{marker:'context-preserved'});return {status:r.status,...await r.json(),original:body};});
 await record('auth-post-wrapper-size-limit',async()=>{let called=false;const authRoute=load('src/app/api/auth/[...nextauth]/route.js',{'next-auth':esmDefault(()=>async()=>{called=true;return Response.json({});}),'@/utils/authOptions':{authOptions:{}}});const r=await authRoute.POST(new Request('http://localhost:3000/api/auth/callback/credentials',{method:'POST',body:'A'.repeat(16385)}),{});return {status:r.status,handlerCalled:called};});
 await record('request-malformed-utf8',async()=>{try{await core.readRequestJson(new Request('http://localhost:3000/api/audit',{method:'POST',body:new Uint8Array([0xff,0xff])}));return 'accepted';}catch(e){return {code:e.code,status:e.status};}});
 await record('arcade-cancel-pending-read',async()=>{const controller=new AbortController();let closed=0;class AudioContext{async close(){closed++;}}const promise=arcade.decodeArcadeAudio({size:100,type:'audio/mpeg',arrayBuffer:()=>new Promise(()=>{})},{signal:controller.signal,AudioContextClass:AudioContext});controller.abort();try{await promise;return 'accepted';}catch(e){return {name:e.name,closed};}});
 if(process.argv.includes('--verify-fixes')){
  const find=name=>{const r=results.find(x=>x.name===name);assert.ok(r,'missing '+name);assert.ok(!r.error,name+': '+r.error);return r.observation;};
  assert.equal(find('json:8MiB-body').status,413);
  assert.equal(find('json-forged-length-stream').rejected,'PAYLOAD_TOO_LARGE');assert.equal(find('json-forged-length-stream').cancelled,true);
  assert.equal(find('json-concurrent-64x128KiB').rejected,64);
  for(const r of results.filter(x=>x.name.startsWith('cover:corrupt:')))assert.equal(r.observation.status,400,r.name);
  for(const i of [17,18,19]){const r=find('playlist:category:case:'+i);assert.equal(r.status,200);assert.equal(r.body.data.playlist.category,'Pop');}
  for(const r of results.filter(x=>x.name.startsWith('invisible-')))assert.equal(r.observation.status,400,r.name);
  assert.equal(find('signup-unicode-surrogate-boundary').status,201);
  assert.equal(find('arcade-unbounded-file-read').arrayBufferCalled,false);
  assert.equal(find('cover-client-read-abort').result,'rejected');
  assert.equal(find('native-log-redaction').freeTextSecretRetained,false);assert.equal(find('native-log-redaction').emailRetained,false);
  assert.ok(find('session-cache-expired-entry-retention').cacheSize<=1000);assert.equal(find('session-cache-expired-entry-retention').expiredRetained,0);
  assert.deepEqual(find('cover-valid-real-png'),{format:'jpeg',width:400,height:400});
  assert.equal(find('cover-mime-spoof-real-png').rejected,'VALIDATION_ERROR');
  assert.equal(find('logout-cache-purge-and-pending-writes').accountKeys,0);assert.equal(find('logout-cache-purge-and-pending-writes').lateWrite,false);
  assert.equal(find('logout-cache-purge-and-pending-writes').preferencesPreserved,true);assert.equal(find('logout-cache-purge-and-pending-writes').guestPreserved,true);
  assert.equal(find('legacy-log-scrub').rawSecret,false);assert.equal(find('legacy-log-scrub').tailSecret,false);
  const authForm=find('auth-post-wrapper-preserves-form');assert.equal(authForm.status,200);assert.equal(authForm.body,authForm.original);assert.equal(authForm.param,'context-preserved');assert.equal(authForm.cookie,'next-auth.csrf-token=SYNTHETIC');
  assert.equal(find('auth-post-wrapper-size-limit').status,413);assert.equal(find('auth-post-wrapper-size-limit').handlerCalled,false);
  assert.equal(find('request-malformed-utf8').status,400);
  assert.equal(find('arcade-cancel-pending-read').name,'AbortError');assert.ok(find('arcade-cancel-pending-read').closed>0);
  assert.equal(networkAttempts,0);
 }
 const output=process.argv[2]||path.join(os.tmpdir(),'haykasa-security-audit.json');
 const summary={routeInventory:routeFiles.length,cases:results.length,networkAttempts,exceptions:results.filter(x=>x.error).length,http500:results.filter(x=>x.observation?.status>=500).length,results,logs};
 fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
 fs.rmSync(folders,{recursive:true,force:true});
 console.log(JSON.stringify({output,routeInventory:routeFiles.length,cases:results.length,networkAttempts,exceptions:summary.exceptions,http500:summary.http500}));
})().catch(e=>{console.error(e);process.exitCode=1});
