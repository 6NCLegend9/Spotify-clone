import assert from 'node:assert/strict';
import {androidDownloadFromRelease,fetchAndroidDownload} from '../../../src/utils/androidDownload.mjs';
const repo='6NCLegend9/Spotify-clone',sha='a'.repeat(40),hash='b'.repeat(64);
const make=(source=sha,sourceDate='2026-10-20T10:00:00.000Z',buildDate=sourceDate)=>{
 const tag=`android-preview-${source}`;
 const metadata={schemaVersion:1,sourceSha:source,workflowRunId:123,artifactId:456,artifactSha256:'c'.repeat(64),apkSha256:hash,apkSizeBytes:12345,sourceCommittedAt:sourceDate,buildCreatedAt:buildDate,androidApis:[33,36]};
 return {draft:false,prerelease:true,tag_name:tag,target_commitish:source,author:{login:'github-actions[bot]'},body:`<!-- haykasa-android-preview:v1 ${JSON.stringify(metadata)} -->`,assets:[{name:'HayKasa-Android.apk',state:'uploaded',size:12345,digest:`sha256:${hash}`,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/HayKasa-Android.apk`}]};
};
const legacy=make();legacy.tag_name='android-preview';legacy.body='Legacy notes';legacy.assets[0].browser_download_url=`https://github.com/${repo}/releases/download/android-preview/HayKasa-Android.apk`;
assert.equal(androidDownloadFromRelease(make()).buildCommit,sha);assert.equal(androidDownloadFromRelease(legacy).legacy,true);
const metadata=(release,mutate)=>{const value=JSON.parse(release.body.match(/(\{.*\})/)[1]);mutate(value);release.body=`<!-- haykasa-android-preview:v1 ${JSON.stringify(value)} -->`};
const invalid=[
 r=>{r.draft=true},r=>{r.prerelease=false},r=>{r.tag_name='android-preview-main'},r=>{r.tag_name=`android-preview-${'A'.repeat(40)}`},r=>{r.target_commitish='main'},r=>{r.author.login='someone'},r=>{r.assets.push(r.assets[0])},r=>{r.assets=[]},r=>{r.assets[0].state='starter'},r=>{r.assets[0].size=0},r=>{r.assets[0].size=101*1024*1024},r=>{r.assets[0].digest='sha256:invalid'},r=>{r.assets[0].browser_download_url='https://attacker.invalid/app.apk'},r=>{r.assets[0].browser_download_url+= '?redirect=1'},r=>{r.assets[0].browser_download_url=r.assets[0].browser_download_url.replace('github.com/','github.com.evil/')},r=>{r.assets[0].name='other.apk'},r=>{r.body=''},r=>{r.body+=r.body},r=>{r.body='<!-- haykasa-android-preview:v1 {invalid} -->'},r=>metadata(r,v=>{v.sourceSha='d'.repeat(40)}),r=>metadata(r,v=>{v.apkSha256='d'.repeat(64)}),r=>metadata(r,v=>{v.apkSizeBytes++}),r=>metadata(r,v=>{v.androidApis=[33]}),r=>metadata(r,v=>{v.artifactSha256='invalid'}),r=>metadata(r,v=>{v.workflowRunId=0}),r=>metadata(r,v=>{v.artifactId=-1}),r=>metadata(r,v=>{v.sourceCommittedAt='invalid'}),r=>metadata(r,v=>{v.buildCreatedAt='2026-99-20T10:00:00.000Z'}),
];
for(const mutate of invalid){const value=make();mutate(value);assert.equal(androidDownloadFromRelease(value),null)}
const queueFetch=responses=>{const requests=[];return {requests,fetch:async(url,options)=>{requests.push({url,options});const next=responses.shift();assert(next,'No unbounded release fetches');return new Response(JSON.stringify(next.body),{status:next.status||200,headers:{'content-type':'application/json'}})}}};
const newer=make(),oldPublishedLater=make('d'.repeat(40),'2026-10-19T10:00:00.000Z','2026-10-21T10:00:00.000Z');
let q=queueFetch([{body:[oldPublishedLater,legacy,newer]}]);
assert.equal((await fetchAndroidDownload(q.fetch)).buildCommit,sha,'An older source published/built later cannot downgrade Settings');assert.equal(q.requests.length,1);
assert.equal(q.requests[0].url,`https://api.github.com/repos/${repo}/releases?per_page=100&page=1`);assert.equal(q.requests[0].options.redirect,'error');assert.equal(q.requests[0].options.next.revalidate,300);
q=queueFetch([{body:[{...newer,draft:true},legacy]}]);assert.equal((await fetchAndroidDownload(q.fetch)).legacy,true);
q=queueFetch([{body:[]},{body:legacy}]);assert.equal((await fetchAndroidDownload(q.fetch)).legacy,true);assert.equal(q.requests.length,2);assert(q.requests[1].url.endsWith('/releases/tags/android-preview'));
q=queueFetch([{status:404,body:{}},{status:404,body:{}}]);assert.equal(await fetchAndroidDownload(q.fetch),null);
q=queueFetch([{body:[]},{body:newer}]);assert.equal(await fetchAndroidDownload(q.fetch),null,'Legacy endpoint cannot return an unrelated versioned release');
q=queueFetch([{body:Array(101).fill(legacy)}]);await assert.rejects(()=>fetchAndroidDownload(q.fetch),/Invalid Android release/);
q=queueFetch([{body:{releases:[newer]}}]);await assert.rejects(()=>fetchAndroidDownload(q.fetch),/Invalid Android release/);
q=queueFetch([{status:503,body:{}}]);await assert.rejects(()=>fetchAndroidDownload(q.fetch),/unavailable/);assert.equal(q.requests.length,1,'API outage does not silently downgrade to a stale release');
console.log(`PASS: Android release selection, ${invalid.length} malformed/unsafe release cases, immutable URLs/digests, downgrade prevention, bounded fetches and legacy fallback.`);
