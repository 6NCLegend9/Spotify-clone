// Read only fixed numeric minidump metadata; never copy dumps or inspect memory/strings.
import { constants, openSync, closeSync, fstatSync, readSync, lstatSync, opendirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LIMITS = Object.freeze({ databases: 4, reports: 8, directoryEntries: 128, streams: 128, readBytes: 4096 });
const DEFAULT_ROOT = '/tmp/android-runner';
const SIGNALS = ['UNKNOWN', 'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE', 'SIGKILL',
  'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGALRM', 'SIGTERM', 'SIGSTKFLT', 'SIGCHLD', 'SIGCONT', 'SIGSTOP',
  'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGXCPU', 'SIGXFSZ', 'SIGVTALRM', 'SIGPROF', 'SIGWINCH', 'SIGIO', 'SIGPWR', 'SIGSYS'];
const unknown = reason => ({ status: 'unknown', reason });

export function parseMinidump(file) {
  let fd;
  try {
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(fd);
    if (!info.isFile()) return unknown('not_regular_file');
    let bytesRead = 0;
    const read = (offset, length) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > info.size || bytesRead + length > LIMITS.readBytes) throw new Error('bounds');
      bytesRead += length;
      const buffer = Buffer.alloc(length);
      if (readSync(fd, buffer, 0, length, offset) !== length) throw new Error('short_read');
      return buffer;
    };
    const header = read(0, 32);
    if (header.readUInt32LE(0) !== 0x504d444d || (header.readUInt32LE(4) & 0xffff) !== 0xa793) return unknown('invalid_header');
    const count = header.readUInt32LE(8), directoryOffset = header.readUInt32LE(12);
    if (count > LIMITS.streams || directoryOffset < 32) return unknown('invalid_directory');
    const directory = read(directoryOffset, count * 12);
    const streams = new Map();
    for (let i = 0; i < count; i++) {
      const type = directory.readUInt32LE(i * 12), size = directory.readUInt32LE(i * 12 + 4), offset = directory.readUInt32LE(i * 12 + 8);
      if (offset + size > info.size) return unknown('invalid_stream_bounds');
      if (![6, 7, 15].includes(type)) continue;
      if (streams.has(type) || offset < 32 || (offset < directoryOffset + directory.length && offset + size > directoryOffset)) return unknown('invalid_stream_directory');
      streams.set(type, { offset, size });
    }
    const result = { status: 'unknown', reason: 'exception_stream_missing', timestamp: new Date(header.readUInt32LE(20) * 1000).toISOString(),
      architecture: 'unknown', platform: 'unknown', exceptionCode: null, linuxSignal: null, processId: null };
    const system = streams.get(7);
    if (system) {
      if (system.size < 56) return unknown('short_system_info');
      const data = read(system.offset, 24);
      result.architecture = ({ 0: 'x86', 5: 'arm', 9: 'x86_64', 12: 'arm64' })[data.readUInt16LE(0)] || 'unknown';
      result.platform = ({ 2: 'windows', 0x8201: 'linux', 0x8203: 'android', 0x8101: 'macos' })[data.readUInt32LE(20)] || 'unknown';
    }
    const misc = streams.get(15);
    if (misc) {
      if (misc.size < 24) return unknown('short_misc_info');
      const data = read(misc.offset, 12), declared = data.readUInt32LE(0);
      if (declared < 24 || declared > misc.size) return unknown('invalid_misc_info');
      if ((data.readUInt32LE(4) & 1) && data.readUInt32LE(8) > 0) result.processId = data.readUInt32LE(8);
    }
    const exception = streams.get(6);
    if (exception) {
      if (exception.size < 168) return unknown('short_exception_info');
      result.exceptionCode = read(exception.offset, 16).readUInt32LE(8);
      result.linuxSignal = result.platform === 'linux' && result.exceptionCode > 0 ? SIGNALS[result.exceptionCode] || null : null;
      result.status = 'exception_metadata';
      result.reason = 'recorded_exception_is_not_process_exit_status';
    }
    return result;
  } catch (error) {
    return unknown(error.code === 'ELOOP' ? 'symlink_rejected' : 'unreadable_or_malformed_report');
  } finally { if (fd !== undefined) closeSync(fd); }
}

function entries(path) {
  if (!lstatSync(path).isDirectory()) throw new Error('not_directory');
  const directory = opendirSync(path), found = [];
  try {
    for (let i = 0; i <= LIMITS.directoryEntries; i++) {
      const entry = directory.readSync();
      if (!entry) return { entries: found, truncated: false };
      if (i === LIMITS.directoryEntries) return { entries: found, truncated: true };
      found.push(entry);
    }
  } finally { directory.closeSync(); }
}

export function collectEmulatorCrashMetadata(root = DEFAULT_ROOT) {
  const result = { source: 'crashpad_minidump_numeric_metadata', status: 'unknown', exitStatus: 'unknown', capturedAt: new Date().toISOString(),
    reason: 'no_usable_reports', databasesExamined: 0, reports: [], truncated: false, limits: LIMITS };
  let databases;
  try { const listed = entries(root); databases = listed.entries; result.truncated = listed.truncated; }
  catch { result.reason = 'database_root_unavailable'; return result; }
  for (const database of databases) {
    if (!database.isDirectory() || !/^emu-crash-\d+(?:\.\d+){1,3}\.db$/.test(database.name)) continue;
    if (result.databasesExamined === LIMITS.databases) { result.truncated = true; break; }
    result.databasesExamined++;
    for (const state of ['pending', 'completed']) {
      let reports;
      try { const listed = entries(join(root, database.name, state)); reports = listed.entries; result.truncated ||= listed.truncated; }
      catch { continue; }
      for (const report of reports) {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.dmp$/i.test(report.name)) continue;
        if (result.reports.length === LIMITS.reports) { result.truncated = true; return result; }
        const parsed = parseMinidump(join(root, database.name, state, report.name));
        result.reports.push(parsed);
        if (parsed.status === 'exception_metadata') {
          result.status = 'exception_metadata'; result.reason = 'recorded_exception_is_not_process_exit_status';
        }
      }
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Root override is for disposable test fixtures; CI invokes the known default.
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root')) throw new Error('Usage: emulator-crash-metadata.mjs [--root fixture-directory]');
  console.log(JSON.stringify(collectEmulatorCrashMetadata(args[1]), null, 2));
}
