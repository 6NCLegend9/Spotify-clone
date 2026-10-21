const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../../node_modules/typescript');
const root = path.resolve(__dirname, '../../..');
function load(file, mocks={}, globals={}) {
  const module = {exports:{}};
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>mocks[name]||require(name),URL,Date,process:{env:{VERCEL_ENV:'production',MEDIA_SERVICE_DEPLOYMENT_PROBE:'1'}},console,...globals});
  return module.exports;
}
const media=load('src/utils/mediaService.mjs');
const secret='isolated-runtime-secret-'.repeat(3);
const config=media.mediaServiceConfig({MEDIA_SERVICE_INTERNAL_URL:'https://binding.example.test/service-prefix/',JWT_SECRET:secret,NODE_ENV:'production'});
assert.equal(config.enabled,true);
assert.equal(config.playbackEnabled,false);
assert.equal(media.mediaServiceConfig({MEDIA_SERVICE_INTERNAL_URL:'https://binding.example.test',JWT_SECRET:secret,MEDIA_SERVICE_PLAYBACK_ENABLED:'1'}).playbackEnabled,true);
assert.equal(config.apiKey,crypto.createHmac('sha256',secret).update('HayKasa/media-service/api/v1').digest('hex'));
assert.equal(new URL('v1/jobs',config.baseUrl).href,'https://binding.example.test/service-prefix/v1/jobs');
config.deliveryOrigin='https://public.example.test';
const value={jobId:'a'.repeat(32),state:'ready',asset:{url:'https://public.example.test/v1/assets/'+'b'.repeat(32)+'?expires=123&signature=synthetic',expiresAt:Date.now()+10000,duration:2,mimeType:'audio/mp4',codec:'aac'}};
assert.equal(media.normalizeMediaResult(value,config).asset.mimeType,'audio/mp4');
const measured=media.normalizeMediaResult({...value,asset:{...value.asset,audioBitrateKbps:158.4,audioBitrateEstimated:false,sampleRateHz:48000,channels:2}},config).asset;
assert.equal(measured.audioBitrateKbps,158.4);assert.equal(measured.audioBitrateEstimated,false);
assert.equal(measured.sampleRateHz,48000);assert.equal(measured.channels,2);
const invalidMetadata=media.normalizeMediaResult({...value,asset:{...value.asset,audioBitrateKbps:Infinity,sampleRateHz:999999,channels:99}},config).asset;
assert.equal(invalidMetadata.audioBitrateKbps,null);assert.equal(invalidMetadata.sampleRateHz,null);assert.equal(invalidMetadata.channels,null);
assert.equal(invalidMetadata.audioBitrateEstimated,true);
assert.equal(media.validateMediaRequest({videoId:'abcdefghijk',mode:'audio',maxHeight:1080,profile:'auto'}).profile,'auto');
assert.throws(()=>media.normalizeMediaResult({...value,asset:{...value.asset,url:'https://attacker.example.test/v1/assets/'+'b'.repeat(32)}},config));
assert.equal(media.mediaServiceConfig({MEDIA_SERVICE_INTERNAL_URL:'https://user:password@binding.example.test',JWT_SECRET:secret}).enabled,false);
const legacy=media.mediaServiceConfig({MEDIA_SERVICE_URL:'https://legacy.example.test',MEDIA_SERVICE_API_KEY:secret,JWT_SECRET:secret});
assert.equal(legacy.enabled,true);assert.equal(legacy.internal,false);
let category = "auto", constructions = 0;
const eq = {'@/utils/eqPresets':{EQ_BAND_FREQS:[],eqHeadroomGain:()=>1,normalizationGain:()=>1},'@/utils/nativeAudio.mjs':{resumeAudioContext:()=>Promise.resolve()}};
const graph=load('src/components/MusicPlayer/media/nativeAudioGraph.mjs',eq,{
  navigator:{audioSession:{set type(value){category=value}}},
  window:{AudioContext:class {constructor(){constructions++;assert.equal(category,'playback');throw Error('unsupported context')}}},
});
assert.equal(graph.createNativeAudioGraph({}),null);assert.equal(constructions,1);assert.equal(category,'playback');
const partial=load('src/components/MusicPlayer/media/nativeAudioGraph.mjs',eq,{
  navigator:{audioSession:{set type(_value){throw Error('read only')}}},window:{},
});
assert.equal(partial.createNativeAudioGraph({}),null);
let touched=false;
const route=load('src/app/api/media/preflight/route.js',{
  'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},
  '@/utils/mediaService.mjs':{mediaServiceConfig:()=>{touched=true;throw Error('production probe reached service')}},
  '@/utils/mediaReceipts.mjs':{},'@/utils/rateLimit':{},
});
(async()=>{
  assert.equal((await route.GET({})).status,404);assert.equal(touched,false);
  const requests=[],limits=[];
  const asset={jobId:'a'.repeat(32),state:'ready',asset:{url:'https://public.example.test/v1/assets/'+'b'.repeat(32)}};
  const preview=load('src/app/api/media/preflight/route.js',{
    'next/server':{NextResponse:{json:(data,options={})=>({data,...options})}},
    '@/utils/mediaService.mjs':{
      mediaServiceConfig:()=>({...config,enabled:true,internal:true,secret}),
      normalizeMediaResult:value=>value,
      callMediaService:async(_config,path,options)=>{
        if(path==='/v1/jobs'){
          requests.push(options.body);
          return {jobId:'c'.repeat(32),state:'failed',reason:'source_access_restricted'};
        }
        return asset;
      },
    },
    '@/utils/mediaReceipts.mjs':{mediaScopeHash:()=> 'd'.repeat(64)},
    '@/utils/rateLimit':{isRateLimited:async(key,options)=>{limits.push({key,options});return {limited:false}}},
  },{
    process:{env:{VERCEL_ENV:'preview',MEDIA_SERVICE_DEPLOYMENT_PROBE:'1'}},
    AbortSignal,Uint8Array,
    fetch:async(_url,options)=>{
      assert.equal(options.headers.Range,'bytes=0-1023');
      return {status:206,arrayBuffer:async()=>new ArrayBuffer(1024),headers:{get:()=> 'bytes 0-1023/2048'}};
    },
  });
  const request=sample=>({nextUrl:new URL('https://preview.example.test/api/media/preflight'+(sample?'?sample='+sample:''))});
  assert.equal((await preview.GET(request('arbitrary-video-id'))).status,400);
  assert.equal(limits.length,0);assert.equal(requests.length,0);
  for(const [sample,id] of [['big-buck-bunny','aqz-KE-bpKQ'],['on-and-on','K4DyBUG242c'],['invincible','J2X5mJ3HDYE']]){
    const result=await preview.GET(request(sample));
    assert.equal(result.status,503);assert.equal(result.data.sample,sample);
    assert.equal(result.data.reason,'source_access_restricted');
    assert.equal(result.data.storage,'passed');assert.equal(result.data.range,'passed');
    assert.equal(requests.at(-1).videoId,id);
    assert.equal(limits.at(-1).key.endsWith(':'+sample),true);
    assert.equal(limits.at(-1).options.max,1);
  }
  assert.equal(new Set(limits.map(value=>value.key)).size,3);
  console.log('PASS: internal binding paths, credential purpose separation, public asset origin validation, legacy service compatibility, production preflight exclusion, fixed live-song samples and independent bounded probes');
})().catch(error=>{console.error(error);process.exitCode=1});
