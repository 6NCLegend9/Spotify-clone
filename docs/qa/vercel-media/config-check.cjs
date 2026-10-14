const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../../node_modules/typescript');
const root = path.resolve(__dirname, '../../..');
function load(file, mocks={}) {
  const module = {exports:{}};
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>mocks[name]||require(name),URL,Date,process:{env:{VERCEL_ENV:'production',MEDIA_SERVICE_DEPLOYMENT_PROBE:'1'}},console});
  return module.exports;
}
const media=load('src/utils/mediaService.mjs');
const secret='isolated-runtime-secret-'.repeat(3);
const config=media.mediaServiceConfig({MEDIA_SERVICE_INTERNAL_URL:'https://binding.example.test/service-prefix/',JWT_SECRET:secret,NODE_ENV:'production'});
assert.equal(config.enabled,true);
assert.equal(config.apiKey,crypto.createHmac('sha256',secret).update('HayKasa/media-service/api/v1').digest('hex'));
assert.equal(new URL('v1/jobs',config.baseUrl).href,'https://binding.example.test/service-prefix/v1/jobs');
config.deliveryOrigin='https://public.example.test';
const value={jobId:'a'.repeat(32),state:'ready',asset:{url:'https://public.example.test/v1/assets/'+'b'.repeat(32)+'?expires=123&signature=synthetic',expiresAt:Date.now()+10000,duration:2,mimeType:'audio/mp4',codec:'aac'}};
assert.equal(media.normalizeMediaResult(value,config).asset.mimeType,'audio/mp4');
assert.throws(()=>media.normalizeMediaResult({...value,asset:{...value.asset,url:'https://attacker.example.test/v1/assets/'+'b'.repeat(32)}},config));
assert.equal(media.mediaServiceConfig({MEDIA_SERVICE_INTERNAL_URL:'https://user:password@binding.example.test',JWT_SECRET:secret}).enabled,false);
const legacy=media.mediaServiceConfig({MEDIA_SERVICE_URL:'https://legacy.example.test',MEDIA_SERVICE_API_KEY:secret,JWT_SECRET:secret});
assert.equal(legacy.enabled,true);assert.equal(legacy.internal,false);
let touched=false;
const route=load('src/app/api/media/preflight/route.js',{
  'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},
  '@/utils/mediaService.mjs':{mediaServiceConfig:()=>{touched=true;throw Error('production probe reached service')}},
  '@/utils/mediaReceipts.mjs':{},'@/utils/rateLimit':{},
});
(async()=>{assert.equal((await route.GET({})).status,404);assert.equal(touched,false);console.log('PASS: internal binding paths, credential purpose separation, public asset origin validation, legacy service compatibility, production preflight exclusion');})().catch(error=>{console.error(error);process.exitCode=1});
