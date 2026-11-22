// Observe only our own emulator child. Never record argv, environment, cgroup paths or guest memory.
import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync, constants as fsConstants, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { constants } from 'node:os';

const LIMIT = 32768;
const eventKeys = ['low', 'high', 'max', 'oom', 'oom_kill', 'oom_group_kill', 'sock_throttled'];
const signalNumber = signal => constants.signals[signal] || null;
const read = (path, limit = 8192) => {
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const bytes = Buffer.alloc(limit + 1), size = readSync(fd, bytes, 0, bytes.length, 0);
    return size <= limit ? bytes.toString('utf8', 0, size) : null;
  } catch { return null; }
  finally { if (fd !== undefined) closeSync(fd); }
};
export function parseEvents(text) {
  if (typeof text !== 'string') return null;
  const result = {};
  for (const line of text.trim().split('\n')) {
    const [key, value, extra] = line.trim().split(/\s+/);
    if (eventKeys.includes(key) && !extra && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) result[key] = Number(value);
  }
  return Object.keys(result).length ? result : null;
}
const number = text => typeof text === 'string' && /^\d+$/.test(text.trim()) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
export function memorySnapshot(pid, { procRoot = '/proc', cgroupRoot = '/sys/fs/cgroup', membership = read(join(procRoot, String(pid), 'cgroup')) } = {}) {
  const entry = membership?.split('\n').find(line => line.startsWith('0::/'));
  if (!entry) return { available: false, levels: [] };
  const path = entry.slice(3);
  if (path.split('/').includes('..') || path.includes('\0')) return { available: false, levels: [] };
  const root = resolve(cgroupRoot), leaf = resolve(root, `.${path}`);
  const offset = relative(root, leaf);
  if (offset.startsWith('..') || isAbsolute(offset)) return { available: false, levels: [] };
  const levels = [];
  let current = leaf, reachedRoot = false;
  for (let depth = 0; depth <= 8; depth++) {
    const events = parseEvents(read(join(current, 'memory.events')));
    const localEvents = parseEvents(read(join(current, 'memory.events.local')));
    const currentBytes = number(read(join(current, 'memory.current')));
    const limitText = read(join(current, 'memory.max'))?.trim();
    levels.push({ depth, events, localEvents, currentBytes, maxBytes: number(limitText), unlimited: limitText === 'max' });
    if (current === root) { reachedRoot = true; break; }
    current = dirname(current);
  }
  return { available: levels.some(level => level.events !== null), truncatedAncestors: !reachedRoot, levels };
}
function statePath() {
  if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required for isolated emulator evidence');
  return join(process.env.RUNNER_TEMP, 'haykasa-emulator-exit.json');
}
function save(path, value) {
  const text = JSON.stringify(value);
  if (text.length > LIMIT) throw new Error('Emulator exit evidence exceeds its fixed bound');
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 }); renameSync(`${path}.tmp`, path);
}
const unknown = reason => ({ schemaVersion: 1, status: 'unknown', reason, exitCode: null, linuxSignal: null });
export function exportedState(path) {
  const text = read(path, LIMIT);
  if (!text) return unknown('observer_missing_or_unreadable');
  try {
    const state = JSON.parse(text);
    if (state.schemaVersion === 1 && state.status === 'unknown' && state.reason === 'observer_not_started') return state;
    if (state.schemaVersion !== 1 || !['running', 'exited', 'spawn_failed'].includes(state.status)) return unknown('observer_invalid');
    if (state.status === 'running') return { ...state, status: 'unknown', reason: 'observer_unfinished', exitCode: null, linuxSignal: null };
    if (typeof state.qemuObserved !== 'boolean'
      || state.exitCode !== null && (!Number.isInteger(state.exitCode) || state.exitCode < 0 || state.exitCode > 255)
      || state.linuxSignal !== null && (!Number.isInteger(state.linuxSignal) || state.linuxSignal < 1 || state.linuxSignal > 64)
      || state.status === 'exited' && ((state.exitCode === null) === (state.linuxSignal === null))) return unknown('observer_invalid');
    return { ...state, observationScope: state.qemuObserved ? 'qemu_child' : 'launcher_child_only' };
  } catch { return unknown('observer_invalid'); }
}
export async function supervise(binary, args, { output = statePath(), procRoot = '/proc', cgroupRoot = '/sys/fs/cgroup', observeEvery = 250 } = {}) {
  const state = { schemaVersion: 1, status: 'running', startedAt: new Date().toISOString(), endedAt: null,
    supervisorPid: process.pid, childPid: null, qemuObserved: false, exitCode: null, linuxSignal: null,
    forwardedSignal: null, spawnError: null, memoryBaseline: null, memoryLatest: null };
  save(output, state); // A killed observer leaves explicit unfinished evidence.
  const child = spawn(binary, args, { stdio: 'inherit' });
  state.childPid = child.pid || null;
  let sampleAt = 0, membership;
  const sample = (force = false) => {
    const name = state.childPid ? read(join(procRoot, String(state.childPid), 'comm'), 128)?.trim() : null;
    const observedBefore = state.qemuObserved;
    if (/^qemu-system(?:-[a-zA-Z0-9_-]+)?$/.test(name || '')) state.qemuObserved = true;
    if (state.childPid && (force || Date.now() - sampleAt >= 5000)) {
      membership = read(join(procRoot, String(state.childPid), 'cgroup')) || membership;
      const memory = memorySnapshot(state.childPid, { procRoot, cgroupRoot, membership });
      state.memoryBaseline ??= memory;
      state.memoryLatest = memory; sampleAt = Date.now();
    } else if (observedBefore === state.qemuObserved) return;
    save(output, state);
  };
  sample(true);
  const timer = setInterval(sample, observeEvery);
  const handlers = new Map(['SIGINT', 'SIGTERM', 'SIGHUP'].map(signal => [signal, () => {
    state.forwardedSignal = signalNumber(signal); save(output, state);
    try { child.kill(signal); } catch { /* Exit event remains authoritative. */ }
  }]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  return new Promise(resolveDone => {
    let finished = false;
    const finish = (code, signal, error) => {
      if (finished) return; finished = true;
      clearInterval(timer);
      for (const [name, handler] of handlers) process.removeListener(name, handler);
      // Retain membership privately so exit-time cgroup counters survive /proc removal.
      if (membership) state.memoryLatest = memorySnapshot(state.childPid, { procRoot, cgroupRoot, membership });
      state.status = error ? 'spawn_failed' : 'exited';
      state.endedAt = new Date().toISOString(); state.exitCode = code; state.linuxSignal = signalNumber(signal);
      state.spawnError = error ? (['ENOENT', 'EACCES', 'ENOEXEC'].includes(error.code) ? error.code : 'OTHER') : null;
      save(output, state);
      resolveDone(state);
    };
    child.once('error', error => finish(null, null, error));
    child.once('exit', (code, signal) => finish(code, signal, null));
  });
}
function install() {
  if (!process.env.ANDROID_HOME) throw new Error('ANDROID_HOME is required');
  const launcher = join(process.env.ANDROID_HOME, 'emulator', 'emulator');
  const original = `${launcher}.haykasa-original`;
  if (existsSync(original)) throw new Error('Emulator observer backup already exists; refusing to overwrite it');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  const shim = `#!/bin/sh\nfor arg do\n  case "$arg" in -avd|@*) exec ${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))} supervise ${quote(original)} "$@";; esac\ndone\nexec ${quote(original)} "$@"\n`;
  save(statePath(), unknown('observer_not_started'));
  renameSync(launcher, original);
  writeFileSync(launcher, shim, { mode: 0o755 });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [mode, binary, ...args] = process.argv.slice(2);
  if (mode === 'install' && !binary) install();
  else if (mode === 'export' && !binary) process.stdout.write(`${JSON.stringify(exportedState(statePath()))}\n`);
  else if (mode === 'supervise' && binary) {
    const state = await supervise(binary, args);
    process.exitCode = state.exitCode ?? (state.linuxSignal ? 128 + state.linuxSignal : 1);
  } else throw new Error('Usage: emulator-exit-observer.mjs install|export|supervise <binary> [arguments]');
}
