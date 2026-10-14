const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
function load(file, mocks = {}) {
  const module = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code, {module,exports:module.exports,require:name=>mocks[name] || require(name),Buffer,URL,Date,process:{env:{NODE_ENV:"production"}},console});
  return module.exports;
}
const policy = load('src/utils/mobileMediaPolicy.mjs');
const receipts = load('src/utils/mediaReceipts.mjs');
const validation = load('src/utils/mediaService.mjs');
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36';
const android = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18 Safari/605.1.15';
let enabled=true, token={id:'alice',sessionVersion:1}, validUser=true, limited=false, trusted=true;
const calls=[];
const route=load('src/app/api/media/resolve/route.js', {
  '@/utils/apiResponseCore.mjs':{readRequestJson:request=>request.json(),ApiRouteError:class extends Error {}},
  'next/server':{NextResponse:{json:(body,{status=200,headers={}}={})=>({body,status,headers})}},
  'next-auth/jwt':{getToken:async()=>token}, '@/utils/authToken':{tokenOptions:request=>request},
  '@/utils/sessionAuth':{resolveSessionUser:async value=>validUser?{id:value.id}:null},
  '@/utils/trustedOrigin':{isTrustedRequestOrigin:()=>trusted},
  '@/utils/rateLimit':{getClientKey:()=> 'local',isRateLimited:async()=>({limited})},
  '@/utils/mediaService.mjs':{...validation,mediaServiceConfig:()=>({enabled,secret:'synthetic-media-signing-secret-'.repeat(2)}),
    callMediaService:async(_,url,options)=>{calls.push({url,...options});return {jobId:'a'.repeat(32),state:'ready'}},normalizeMediaResult:result=>result},
  '@/utils/mediaReceipts.mjs':receipts, '@/utils/mobileMediaPolicy.mjs':policy,
});
function request(agent, method='GET', body, extra={}) {
  const request = new Request('https://haykasa.vercel.app/api/media/resolve', {method,headers:{'user-agent':agent,origin:'https://haykasa.vercel.app','content-type':'application/json',...extra},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  request.nextUrl=new URL(request.url);return request;
}
(async()=>{
  for(const userAgent of [android,iphone,'Mozilla/5.0 (iPad) Safari/605.1.15','Mozilla/5.0 (Android 14) Firefox/130 Mobile']) assert.equal(policy.isMobileMediaClient({userAgent}),true);
  for(const userAgent of [desktop,ipadDesktop,'Mozilla/5.0 (X11; Linux x86_64) Firefox/130','Mozilla/5.0 Electron/44.0 Android Mobile']) assert.equal(policy.isMobileMediaClient({userAgent}),false);
  assert.equal(policy.isMobileMediaClient({userAgent:ipadDesktop,maxTouchPoints:5}),true);
  assert.equal(policy.isMobileMediaClient({userAgent:android},true),false);
  assert.equal(policy.isMobileMediaClient({userAgentData:{mobile:true}}),true);
  assert.equal(policy.isMobileMediaRequest(new Headers({'user-agent':ipadDesktop,'X-HayKasa-Media-Client':'mobile'})),true);
  assert.equal(policy.isMobileMediaRequest(new Headers({'user-agent':desktop,'X-HayKasa-Media-Client':'mobile'})),false);
  assert.equal(policy.isMobileMediaRequest(new Headers({'sec-ch-ua-mobile':'?1'})),true);
  const selection={videoId:'abcdefghijk',mode:'audio',maxHeight:1080,profile:'mp4-aac'};
  assert.equal((await route.GET(request(desktop))).body.enabled,false);
  assert.equal((await route.POST(request(desktop,'POST',selection))).status,403);assert.equal(calls.length,0);
  token=null;assert.equal((await route.GET(request(android))).body.enabled,false);
  assert.equal((await route.POST(request(android,'POST',selection))).status,401);assert.equal(calls.length,0);
  token={id:'alice',sessionVersion:1};validUser=false;assert.equal((await route.POST(request(android,'POST',selection))).status,401);validUser=true;
  assert.equal((await route.GET(request(android))).body.enabled,true);
  const created=await route.POST(request(android,'POST',selection));assert.equal(created.status,200);assert.equal(calls.length,1);
  const receipt=created.body.receipt;
  token={id:'bob',sessionVersion:1};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,403);assert.equal(calls.length,1);
  token={id:'alice',sessionVersion:2};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,403);
  token={id:'alice',sessionVersion:1};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,200);
  assert.equal((await route.POST(request(desktop,'POST',{action:'renew',receipt}))).status,403);
  assert.equal((await route.DELETE(request(desktop,'DELETE',{receipt}))).status,200);assert.equal(calls.at(-1).method,'DELETE');
  trusted=false;assert.equal((await route.POST(request(android,'POST',selection))).status,403);trusted=true;
  limited=true;assert.equal((await route.POST(request(android,'POST',selection))).status,429);limited=false;
  enabled=false;assert.equal((await route.GET(request(android))).body.enabled,false);assert.equal((await route.POST(request(android,'POST',selection))).status,503);
  console.log('PASS: mobile/tablet detection, desktop/Electron exclusion, iPad desktop mode, mobile hints, availability, account validation, desktop/guest denial before extraction, real receipt scope/session checks, authenticated cancellation, origin/rate limits, unconfigured service');
})().catch(error=>{console.error(error);process.exitCode=1});
