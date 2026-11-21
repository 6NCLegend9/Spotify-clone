import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exportedState, parseEvents, memorySnapshot, supervise } from './emulator-exit-observer.mjs';
const root = mkdtempSync(join(tmpdir(), 'emulator-exit-check-'));
const script = resolve('docs/qa/android/emulator-exit-observer.mjs');
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; };
const output = join(root, 'state.json');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) { if (fn()) return; await delay(20); }
  throw new Error('Synthetic observer condition did not settle');
}
const run = code => supervise(process.execPath, ['-e', code], { output, observeEvery: 10 });
try {
  await check('zero exit is a code, not a signal', async () => {
    const state = await run('process.exit(0)');
    assert.equal(state.status, 'exited'); assert.equal(state.exitCode, 0); assert.equal(state.linuxSignal, null);
    assert.equal(state.qemuObserved, false);
  });
  await check('nonzero exit is preserved', async () => {
    const state = await run('process.exit(23)'); assert.equal(state.exitCode, 23); assert.equal(state.linuxSignal, null);
  });
  await check('SIGKILL is authoritative child signal, not an OOM claim', async () => {
    const state = await run("process.kill(process.pid,'SIGKILL')");
    assert.equal(state.exitCode, null); assert.equal(state.linuxSignal, 9); assert.equal(state.forwardedSignal, null);
    assert.equal(JSON.stringify(state).includes('oomVictim'), false);
  });
  await check('qemu role is observed separately from exit status', async () => {
    const state = await run("process.title='qemu-system-x86_64';setTimeout(()=>process.exit(0),150)");
    assert.equal(state.qemuObserved, true); assert.equal(state.exitCode, 0);
  });
  await check('spawn failure has no fabricated exit status', async () => {
    const state = await supervise(join(root, 'missing-binary'), [], { output });
    assert.equal(state.status, 'spawn_failed'); assert.equal(state.spawnError, 'ENOENT');
    assert.equal(state.exitCode, null); assert.equal(state.linuxSignal, null);
  });
  await check('strict numeric counter allowlist', () => {
    assert.deepEqual(parseEvents('oom 3\noom_kill 2\nunknown 9\nhigh nope\nlow 1 extra\nmax 9007199254740993'), { oom: 3, oom_kill: 2 });
    assert.equal(parseEvents(null), null); assert.equal(parseEvents('garbage'), null);
  });
  await check('actual leaf and ancestor counters, paths stay private', () => {
    const proc = join(root, 'proc'), cg = join(root, 'cgroup');
    mkdirSync(join(proc, '123'), { recursive: true }); mkdirSync(join(cg, 'private-name', 'leaf'), { recursive: true });
    writeFileSync(join(proc, '123', 'cgroup'), '0::/private-name/leaf\n');
    writeFileSync(join(cg, 'private-name', 'leaf', 'memory.events'), 'oom 1\noom_kill 1\n');
    writeFileSync(join(cg, 'private-name', 'memory.events'), 'oom_kill 4\n');
    writeFileSync(join(cg, 'private-name', 'leaf', 'memory.current'), '4096\n');
    writeFileSync(join(cg, 'private-name', 'leaf', 'memory.max'), 'max\n');
    const first = memorySnapshot(123, { procRoot: proc, cgroupRoot: cg });
    assert.equal(first.available, true); assert.equal(first.levels.length, 3);
    assert.equal(first.levels[0].events.oom_kill, 1); assert.equal(first.levels[1].events.oom_kill, 4);
    assert.equal(first.levels[0].currentBytes, 4096); assert.equal(first.levels[0].unlimited, true);
    writeFileSync(join(cg, 'private-name', 'leaf', 'memory.events'), 'oom 2\noom_kill 2\n');
    const afterExit = memorySnapshot(0, { cgroupRoot: cg, membership: '0::/private-name/leaf\n' });
    assert.equal(afterExit.levels[0].events.oom_kill - first.levels[0].events.oom_kill, 1);
    assert.equal(JSON.stringify(first).includes('private-name'), false);
  });
  await check('unavailable or escaped membership stays unknown', () => {
    assert.deepEqual(memorySnapshot(0, { procRoot: root }), { available: false, levels: [] });
    assert.deepEqual(memorySnapshot(0, { membership: '0::/../secret' }), { available: false, levels: [] });
  });
  await check('bounded ancestors', () => {
    const value = memorySnapshot(0, { cgroupRoot: root, membership: '0::/a/b/c/d/e/f/g/h/i/j/k' });
    assert.equal(value.levels.length, 9); assert.equal(value.truncatedAncestors, true);
    assert.equal(memorySnapshot(0, { cgroupRoot: root, membership: '0::/a/b/c/d/e/f/g/h/i' }).truncatedAncestors, true);
  });
  await check('missing malformed and unfinished observer are unknown', () => {
    assert.equal(exportedState(join(root, 'missing')).status, 'unknown');
    writeFileSync(output, '{'); assert.equal(exportedState(output).status, 'unknown');
    writeFileSync(output, JSON.stringify({ schemaVersion: 1, status: 'running', exitCode: 0 }));
    const state = exportedState(output); assert.equal(state.status, 'unknown'); assert.equal(state.exitCode, null);
  });
  await check('supervisor forwards termination and records it', async () => {
    const dir = join(root, 'forward'); mkdirSync(dir);
    const child = spawn(process.execPath, [script, 'supervise', process.execPath, '-e', 'setInterval(()=>{},1000)'],
      { env: { ...process.env, RUNNER_TEMP: dir }, stdio: 'ignore' });
    const ended = new Promise(resolve => child.once('exit', resolve));
    const file = join(dir, 'haykasa-emulator-exit.json');
    await waitFor(() => { try { return JSON.parse(readFileSync(file)).childPid > 0; } catch { return false; } });
    child.kill('SIGTERM'); await ended;
    const state = exportedState(file); assert.equal(state.linuxSignal, 15); assert.equal(state.forwardedSignal, 15);
  });
  await check('killed supervisor remains unknown rather than a fabricated child exit', async () => {
    const dir = join(root, 'killed'); mkdirSync(dir);
    const child = spawn(process.execPath, [script, 'supervise', process.execPath, '-e', 'setInterval(()=>{},1000)'],
      { env: { ...process.env, RUNNER_TEMP: dir }, stdio: 'ignore' });
    const ended = new Promise(resolve => child.once('exit', resolve));
    const file = join(dir, 'haykasa-emulator-exit.json');
    let descendant;
    await waitFor(() => { try { descendant = JSON.parse(readFileSync(file)).childPid; return descendant > 0; } catch { return false; } });
    child.kill('SIGKILL'); await ended;
    try { process.kill(descendant, 'SIGKILL'); } catch { /* Already gone. */ }
    const state = exportedState(file); assert.equal(state.status, 'unknown'); assert.equal(state.exitCode, null);
    assert.equal(state.reason, 'observer_unfinished');
  });
  await check('installed wrapper preserves arguments and binary location', () => {
    const sdk = join(root, "sdk space's"), dir = join(sdk, 'emulator'), temp = join(root, 'installed');
    mkdirSync(dir, { recursive: true }); mkdirSync(temp);
    const launcher = join(dir, 'emulator'), argsFile = join(temp, 'args.json');
    writeFileSync(launcher, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(argsFile)},JSON.stringify(process.argv.slice(2)));process.exit(7);\n`, { mode: 0o755 });
    const env = { ...process.env, ANDROID_HOME: sdk, RUNNER_TEMP: temp };
    assert.equal(spawnSync(process.execPath, [script, 'install'], { env, encoding: 'utf8' }).status, 0);
    const args = ['-avd', "AVD name's", 'two words', "quote's", '$literal'];
    const result = spawnSync(launcher, args, { env, encoding: 'utf8' });
    assert.equal(result.status, 7); assert.deepEqual(JSON.parse(readFileSync(argsFile)), args);
    const state = exportedState(join(temp, 'haykasa-emulator-exit.json'));
    assert.equal(state.exitCode, 7); assert.equal(state.qemuObserved, false);
    assert.equal(state.observationScope, 'launcher_child_only');
    const before = readFileSync(join(temp, 'haykasa-emulator-exit.json'), 'utf8');
    assert.equal(spawnSync(launcher, ['-version'], { env, encoding: 'utf8' }).status, 7);
    assert.equal(readFileSync(join(temp, 'haykasa-emulator-exit.json'), 'utf8'), before);
    assert.equal(JSON.stringify(state).includes(sdk), false);
    assert.notEqual(spawnSync(process.execPath, [script, 'install'], { env, encoding: 'utf8' }).status, 0);
  });
  console.log(`Emulator exit observer checks passed: ${checks} synthetic cases; no actual emulator-loss qualification.`);
} finally { rmSync(root, { recursive: true, force: true }); }
