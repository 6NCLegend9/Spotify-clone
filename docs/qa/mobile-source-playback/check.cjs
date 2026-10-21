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
const receipts = load('src/utils/mediaReceipts.mjs');
const validation = load('src/utils/mediaService.mjs');
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36';
const android = 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36';
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
const ipadDesktop = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18 Safari/605.1.15';
let internal=false, playbackEnabled=false;
let enabled=true, token={id:'alice',sessionVersion:1}, validUser=true, limited=false, trusted=true;
let authenticationFails=false, databaseFails=false, authenticationCalls=0, databaseCalls=0;
const calls=[];
const route=load('src/app/api/media/resolve/route.js', {
  '@/utils/apiResponseCore.mjs':{readRequestJson:request=>request.json(),ApiRouteError:class extends Error {}},
  'next/server':{NextResponse:{json:(body,{status=200,headers={}}={})=>({body,status,headers})}},
  'next-auth/jwt':{getToken:async()=>{authenticationCalls++;if(authenticationFails) throw new Error('private-auth-diagnostic');return token;}}, '@/utils/authToken':{tokenOptions:request=>request},
  '@/utils/sessionAuth':{resolveSessionUser:async value=>{databaseCalls++;if(databaseFails) throw new Error('private-database-diagnostic');return validUser?{id:value.id}:null;}},
  '@/utils/trustedOrigin':{isTrustedRequestOrigin:()=>trusted},
  '@/utils/rateLimit':{getClientKey:()=> 'local',isRateLimited:async()=>({limited})},
  '@/utils/mediaService.mjs':{...validation,mediaServiceConfig:()=>({enabled,internal,playbackEnabled,secret:'synthetic-media-signing-secret-'.repeat(2)}),
    callMediaService:async(_,url,options)=>{calls.push({url,...options});return {jobId:'a'.repeat(32),state:'ready'}},normalizeMediaResult:result=>result},
  '@/utils/mediaReceipts.mjs':receipts,
});
function request(agent, method='GET', body, extra={}) {
  const request = new Request('https://haykasa.vercel.app/api/media/resolve', {method,headers:{'user-agent':agent,origin:'https://haykasa.vercel.app','content-type':'application/json',...extra},...(method==='GET'?{}:{body:JSON.stringify(body)})});
  request.nextUrl=new URL(request.url);return request;
}
(async()=>{
  async function capability(agent, expectedReason) {
    const response=await route.GET(request(agent));
    assert.equal(response.status,200);
    assert.equal(response.headers['Cache-Control'],'private, no-store');
    assert.equal(response.body.enabled,expectedReason===null);
    assert.equal(response.body.reason,expectedReason);
    assert.equal(Object.keys(response.body).sort().join(','),'enabled,reason','Capability status must not expose configuration or account details');
    return response;
  }
  const selection={videoId:'abcdefghijk',mode:'audio',maxHeight:1080,profile:'mp4-aac'};
  token=null;
  for (const agent of [desktop, android, iphone, ipadDesktop, 'Mozilla/5.0 Electron/44.4.1']) {
    await capability(agent,'authentication_required');
    assert.equal((await route.POST(request(agent,'POST',selection))).status,401);
  }
  assert.equal(databaseCalls,0); assert.equal(calls.length,0);
  await capability(android,'authentication_required');
  assert.equal((await route.POST(request(android,'POST',selection))).status,401);assert.equal(calls.length,0);
  token={id:'alice',sessionVersion:1};validUser=false;await capability(android,'authentication_required');assert.equal((await route.POST(request(android,'POST',selection))).status,401);validUser=true;
  internal=true;
  const authBeforeDisabled=authenticationCalls;
  await capability(android,'service_disabled');assert.equal(authenticationCalls,authBeforeDisabled);
  const disabled=await route.POST(request(android,'POST',selection));
  assert.equal(disabled.status,503);assert.equal(disabled.body.reason,'service_disabled');assert.equal(calls.length,0);
  playbackEnabled=true;
  for (const agent of [desktop, android, iphone, ipadDesktop, 'Mozilla/5.0 Electron/44.4.1']) await capability(agent,null);
  internal=false;playbackEnabled=false;
  await capability(android,null);
  authenticationFails=true;await capability(android,'service_unavailable');authenticationFails=false;
  databaseFails=true;await capability(android,'service_unavailable');databaseFails=false;
  assert.equal(calls.length,0,'Capability requests must not start provider work');
  const created=await route.POST(request(android,'POST',selection));assert.equal(created.status,200);assert.equal(calls.length,1);
  const receipt=created.body.receipt;
  token={id:'bob',sessionVersion:1};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,403);assert.equal(calls.length,1);
  token={id:'alice',sessionVersion:2};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,403);
  token={id:'alice',sessionVersion:1};assert.equal((await route.POST(request(iphone,'POST',{action:'poll',receipt}))).status,200);
  assert.equal((await route.POST(request(desktop,'POST',{action:'renew',receipt}))).status,200);
  internal=true;playbackEnabled=false;
  assert.equal((await route.DELETE(request(desktop,'DELETE',{receipt}))).status,200);assert.equal(calls.at(-1).method,'DELETE');internal=false;
  trusted=false;assert.equal((await route.POST(request(android,'POST',selection))).status,403);trusted=true;
  limited=true;assert.equal((await route.POST(request(android,'POST',selection))).status,429);limited=false;
  const beforeDesktop=calls.length;
  assert.equal((await route.POST(request(desktop,'POST',{...selection,profile:'auto'}))).status,200);
  assert.equal(calls.length,beforeDesktop+1);
  assert.equal(calls.at(-1).body.profile,'auto');
  enabled=false;
  const authBeforeUnconfigured=authenticationCalls;
  await capability(android,'service_unconfigured');assert.equal(authenticationCalls,authBeforeUnconfigured);
  assert.equal((await route.POST(request(android,'POST',selection))).status,503);
  console.log('PASS: shared desktop/Electron/phone/tablet source eligibility, private capability reasons, auth/database failure isolation, validated accounts, guest denial before extraction, account/session-scoped receipts, cross-device renewal/cancellation, codec negotiation, origin/rate limits, unconfigured service');
})().catch(error=>{console.error(error);process.exitCode=1});
