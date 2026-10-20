import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {androidDownloadFromRelease} from '../../../src/utils/androidDownload.mjs';
import './download-check.mjs';
// Every external tool is a fixture. No real credentials, network or publication.
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'haykasa-release-check-'));
const publisher=fileURLToPath(new URL('../../../scripts/publish-android-preview.mjs',import.meta.url));
const repo='6NCLegend9/Spotify-clone',sha='a'.repeat(40),tag=`android-preview-${sha}`;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const apk=Buffer.from('Synthetic APK never installed or executed'),archive=Buffer.from('Synthetic artifact archive');
const date='2026-10-19T12:00:00.000Z';
const metadata={schemaVersion:1,sourceSha:sha,workflowRunId:123,artifactId:456,artifactSha256:hash(archive),apkSha256:hash(apk),apkSizeBytes:apk.length,sourceCommittedAt:date,buildCreatedAt:date,androidApis:[33,36]};
const release={draft:false,prerelease:true,tag_name:tag,target_commitish:sha,author:{login:'github-actions[bot]'},body:`<!-- haykasa-android-preview:v1 ${JSON.stringify(metadata)} -->`,assets:[{name:'HayKasa-Android.apk',state:'uploaded',size:apk.length,digest:`sha256:${hash(apk)}`,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/HayKasa-Android.apk`}]};
const base={run:{id:123,status:'completed',conclusion:'success',path:'.github/workflows/android-ci.yml',head_branch:'main',event:'push',repository:{full_name:repo},head_repository:{full_name:repo},head_sha:sha,created_at:date},jobs:{total_count:3,jobs:['apk','Android 33 emulator','Android 36 emulator'].map(name=>({name,status:'completed',conclusion:'success',run_id:123,head_sha:sha}))},artifacts:{total_count:1,artifacts:[{id:456,name:`haykasa-android-debug-${sha}`,expired:false,size_in_bytes:archive.length,digest:`sha256:${hash(archive)}`,workflow_run:{id:123,head_branch:'main',head_sha:sha}}]},archive:archive.toString('base64'),apk:apk.toString('base64'),sourceCommittedAt:date};
let checked=0;
try {
 const executable=(name,source)=>fs.writeFileSync(path.join(fixture,name),'#!/usr/bin/env node\n'+source,{mode:0o700});
 executable('git',`const c=JSON.parse(process.env.QA_ANDROID_CASE);if(process.argv[2]==='merge-base')process.exit(c.merged===false?1:0);if(process.argv[2]==='show')console.log(c.sourceCommittedAt);else process.exit(1);`);
 executable('unzip',`const c=JSON.parse(process.env.QA_ANDROID_CASE);process.stdout.write(process.argv[2]==='-Z1'?(c.entries||'app-debug.apk\\n'):Buffer.from(c.apk,'base64'));`);
 executable('jarsigner',`const c=JSON.parse(process.env.QA_ANDROID_CASE);console.log(c.signature||'jar verified.');`);
 executable('gh',`const fs=require('fs'),crypto=require('crypto'),c=JSON.parse(process.env.QA_ANDROID_CASE),a=process.argv.slice(2),e=a[1];
const created=()=>fs.existsSync('created.json')?JSON.parse(fs.readFileSync('created.json')):null;const missing=()=>{console.error('HTTP 404');process.exit(1)};
if(a[0]==='release'){if(a[1]!=='create')throw Error('Only immutable create allowed');fs.writeFileSync('writes.json',JSON.stringify(a));const bytes=Buffer.from(c.apk,'base64');fs.writeFileSync('created.json',JSON.stringify({draft:false,prerelease:true,tag_name:a[2],target_commitish:c.run.head_sha,author:{login:'github-actions[bot]'},body:fs.readFileSync(a[a.indexOf('--notes-file')+1],'utf8'),assets:[{name:'HayKasa-Android.apk',state:'uploaded',size:bytes.length,digest:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),browser_download_url:'https://github.com/${repo}/releases/download/'+a[2]+'/HayKasa-Android.apk'}]}));process.exit(0)}
if(a[0]!=='api')throw Error('Unexpected command');
if(e.includes('/jobs?'))console.log(JSON.stringify(c.jobs));else if(e.includes('/artifacts?'))console.log(JSON.stringify(c.artifacts));else if(e.endsWith('/actions/artifacts/456/zip'))process.stdout.write(Buffer.from(c.archive,'base64'));else if(e.includes('/releases/tags/')){const r=created()||c.existingRelease;if(!r)missing();console.log(JSON.stringify(r))}else if(e.includes('/git/ref/tags/')){const object=created()?{type:'commit',sha:c.publishedTagSha||c.run.head_sha}:c.existingTag;if(!object)missing();console.log(JSON.stringify({ref:'refs/tags/'+e.split('/').at(-1),object}))}else if(e.includes('/git/tags/'))console.log(JSON.stringify({object:c.annotatedTarget}));else if(e.endsWith('/actions/runs/123'))console.log(JSON.stringify(c.run));else throw Error('Unexpected endpoint');`);
 const check=(label,mutate,expected,environment={},publishes=false)=>{
  const value=structuredClone(base);mutate(value);for(const name of ['created.json','writes.json'])fs.rmSync(path.join(fixture,name),{force:true});
  const result=spawnSync(process.execPath,[publisher],{cwd:fixture,encoding:'utf8',env:{...process.env,PATH:`${fixture}${path.delimiter}${process.env.PATH}`,GH_TOKEN:'synthetic-no-network',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/android-preview-release.yml@refs/heads/main`,GITHUB_EVENT_NAME:'workflow_run',ANDROID_PREVIEW_RUN_ID:'123',QA_ANDROID_CASE:JSON.stringify(value),...environment}});
  assert.equal(result.status,expected?1:0,`${label}: ${result.stderr}`);if(expected)assert.match(result.stderr,expected,label);assert.equal(fs.existsSync(path.join(fixture,'writes.json')),publishes,`${label}: unexpected release mutation`);checked++;return result;
 };
 check('verified main publish',()=>{},null,{},true);
 assert.equal(androidDownloadFromRelease(JSON.parse(fs.readFileSync(path.join(fixture,'created.json'))))?.buildCommit,sha);
 const write=JSON.parse(fs.readFileSync(path.join(fixture,'writes.json')));assert.equal(write[2],tag);assert(write.includes('--latest=false'));
 check('manual main run',c=>{c.run.event='workflow_dispatch'},null,{GITHUB_EVENT_NAME:'workflow_dispatch'},true);
 check('immutable no-op',c=>{c.existingRelease=release;c.existingTag={type:'commit',sha}},null);
 check('annotated tag',c=>{c.existingRelease=release;c.existingTag={type:'tag',sha:'b'.repeat(40)};c.annotatedTarget={type:'commit',sha}},null);
 for(const [name,mutate] of [
  ['fork',c=>{c.run.head_repository.full_name='attacker/fork'}],['wrong repository',c=>{c.run.repository.full_name='attacker/fork'}],['PR run',c=>{c.run.event='pull_request'}],['non-main branch',c=>{c.run.head_branch='feature'}],['wrong workflow',c=>{c.run.path='other.yml'}],['failed run',c=>{c.run.conclusion='failure'}],['wrong run ID',c=>{c.run.id=124}],
 ])check(name,mutate,/successful Android APK main workflow/);
 check('unmerged',c=>{c.merged=false},/already be merged/);
 check('untrusted workflow checkout',()=>{},/trusted main preview workflow/,{GITHUB_WORKFLOW_REF:`${repo}/.github/workflows/android-preview-release.yml@refs/heads/feature`});
 check('non-main publisher',()=>{},/trusted main preview workflow/,{GITHUB_REF:'refs/heads/feature'});
 check('missing run ID',()=>{},/explicit Android workflow run ID/,{ANDROID_PREVIEW_RUN_ID:''});
 for(const [name,mutate] of [
  ['missing API36',c=>{c.jobs.jobs.pop();c.jobs.total_count--}],['skipped API36',c=>{c.jobs.jobs[2].conclusion='skipped'}],['failed API33',c=>{c.jobs.jobs[1].conclusion='failure'}],['legacy emulator only',c=>{c.jobs.jobs=[c.jobs.jobs[0],{...c.jobs.jobs[1],name:'emulator'}];c.jobs.total_count=2}],['conflicting job',c=>{c.jobs.jobs.push({...c.jobs.jobs[2],conclusion:'failure'});c.jobs.total_count++}],['wrong job run',c=>{c.jobs.jobs[2].run_id=124}],['wrong job SHA',c=>{c.jobs.jobs[2].head_sha='b'.repeat(40)}],
 ])check(name,mutate,/both required emulator jobs/);
 check('truncated jobs',c=>{c.jobs.total_count=101},/Incomplete GitHub workflow listing/);
 check('truncated artifacts',c=>{c.artifacts.total_count=101},/Incomplete GitHub workflow listing/);
 check('wrong-SHA artifact',c=>{c.artifacts.artifacts[0].name=`haykasa-android-debug-${'b'.repeat(40)}`},/Exactly one unexpired/);
 check('duplicate APK',c=>{c.artifacts.artifacts.push(c.artifacts.artifacts[0]);c.artifacts.total_count++},/Exactly one unexpired/);
 check('expired APK',c=>{c.artifacts.artifacts[0].expired=true},/Exactly one unexpired/);
 check('wrong artifact run',c=>{c.artifacts.artifacts[0].workflow_run.id=124},/Artifact provenance/);
 check('wrong artifact SHA',c=>{c.artifacts.artifacts[0].workflow_run.head_sha='b'.repeat(40)},/Artifact provenance/);
 check('bad digest',c=>{c.artifacts.artifacts[0].digest='sha256:invalid'},/Artifact provenance/);
 check('archive mismatch',c=>{c.archive=Buffer.from('corrupt archive').toString('base64')},/archive digest mismatch/);
 check('unexpected ZIP entries',c=>{c.entries='app-debug.apk\n../payload\n'},/Unexpected artifact archive contents/);
 check('unsigned APK',c=>{c.signature='jar is unsigned.'},/signature verification failed/);
 check('orphaned tag',c=>{c.existingTag={type:'commit',sha:'b'.repeat(40)}},/tag already exists/);
 check('wrong existing tag',c=>{c.existingRelease=release;c.existingTag={type:'commit',sha:'b'.repeat(40)}},/never replaced/);
 check('immutable APK mismatch',c=>{c.existingRelease=structuredClone(release);c.existingRelease.assets[0].digest=`sha256:${'b'.repeat(64)}`;c.existingTag={type:'commit',sha}},/never replaced/);
 check('duplicate existing APK',c=>{c.existingRelease=structuredClone(release);c.existingRelease.assets.push(c.existingRelease.assets[0]);c.existingTag={type:'commit',sha}},/never replaced/);
 check('postpublication tag mismatch',c=>{c.publishedTagSha='b'.repeat(40)},/did not match/,{},true);
 const workflow=fs.readFileSync(new URL('../../../.github/workflows/android-preview-release.yml',import.meta.url),'utf8');assert.match(workflow,/workflow_run:/);assert.match(workflow,/ref: main\s+fetch-depth: 0\s+persist-credentials: false/);assert.doesNotMatch(workflow,/39041930548|head_sha\s*}}|^  push:/m);
 console.log(`PASS: ${checked} immutable Android preview/provenance cases; no real publication.`);
}finally{fs.rmSync(fixture,{recursive:true,force:true})}
