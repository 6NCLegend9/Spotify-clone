import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMinidump, collectEmulatorCrashMetadata, LIMITS } from './emulator-crash-metadata.mjs';

const root = mkdtempSync(join(tmpdir(), 'emulator-crash-metadata-'));
const fixture = ({ code = 11, platform = 0x8201, processId = 2879, exception = true } = {}) => {
  const types = exception ? [7, 15, 6] : [7, 15];
  const sizes = { 7: 56, 15: 24, 6: 168 };
  const data = Buffer.alloc(32 + types.length * 12 + types.reduce((sum, type) => sum + sizes[type], 0));
  data.writeUInt32LE(0x504d444d, 0); data.writeUInt32LE(0xa793, 4); data.writeUInt32LE(types.length, 8); data.writeUInt32LE(32, 12); data.writeUInt32LE(1795083667, 20);
  let offset = 32 + types.length * 12;
  for (const [index, type] of types.entries()) {
    data.writeUInt32LE(type, 32 + index * 12); data.writeUInt32LE(sizes[type], 36 + index * 12); data.writeUInt32LE(offset, 40 + index * 12);
    if (type === 7) { data.writeUInt16LE(9, offset); data.writeUInt32LE(platform, offset + 20); }
    if (type === 15) { data.writeUInt32LE(24, offset); data.writeUInt32LE(1, offset + 4); data.writeUInt32LE(processId, offset + 8); }
    if (type === 6) data.writeUInt32LE(code, offset + 8);
    offset += sizes[type];
  }
  return data;
};
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS', name); }
function parse(data) { const file = join(root, 'fixture.dmp'); writeFileSync(file, data); return parseMinidump(file); }
try {
  check('Linux SIGSEGV uses only numeric metadata and valid PID/timestamp', () => {
    const result = parse(fixture()); assert.equal(result.status, 'exception_metadata'); assert.equal(result.linuxSignal, 'SIGSEGV');
    assert.equal(result.processId, 2879); assert.equal(result.platform, 'linux'); assert.equal(result.architecture, 'x86_64');
    assert.equal(result.timestamp, new Date(1795083667 * 1000).toISOString());
  });
  check('Linux SIGABRT', () => assert.equal(parse(fixture({ code: 6 })).linuxSignal, 'SIGABRT'));
  check('Windows exception code is never interpreted as a Linux signal', () => {
    const result = parse(fixture({ code: 11, platform: 2 })); assert.equal(result.platform, 'windows'); assert.equal(result.linuxSignal, null);
  });
  check('Requested or unknown Linux dump code stays unnamed', () => assert.equal(parse(fixture({ code: 0xffffffff })).linuxSignal, null));
  check('No exception stream remains explicitly unknown', () => assert.equal(parse(fixture({ exception: false })).status, 'unknown'));
  check('Missing and short reports remain unknown', () => {
    assert.equal(parseMinidump(join(root, 'missing')).status, 'unknown'); assert.equal(parse(Buffer.alloc(10)).status, 'unknown');
  });
  check('Malformed stream directory is rejected', () => { const data = fixture(); data.writeUInt32LE(0xffffffff, 12); assert.equal(parse(data).status, 'unknown'); });
  check('Oversized stream table is rejected', () => { const data = fixture(); data.writeUInt32LE(LIMITS.streams + 1, 8); assert.equal(parse(data).status, 'unknown'); });
  check('Out-of-file stream is rejected', () => { const data = fixture(); data.writeUInt32LE(0xffffffff, 40); assert.equal(parse(data).status, 'unknown'); });
  check('Incomplete exception structure is unknown', () => { const data = fixture(); data.writeUInt32LE(16, 36 + 2 * 12); assert.equal(parse(data).reason, 'short_exception_info'); });
  check('Symbolic link dump is not followed', () => {
    const link = join(root, 'link.dmp'); symlinkSync(join(root, 'fixture.dmp'), link); assert.equal(parseMinidump(link).reason, 'symlink_rejected');
  });
  check('Empty or missing database is unknown, not a no-crash claim', () => {
    assert.equal(collectEmulatorCrashMetadata(root).status, 'unknown'); assert.equal(collectEmulatorCrashMetadata(join(root, 'missing')).status, 'unknown');
  });
  check('Collector reads only allowlisted report names and excludes raw contents', () => {
    const pending = join(root, 'emu-crash-37.2.13.db', 'pending'); mkdirSync(pending, { recursive: true });
    const data = Buffer.concat([fixture(), Buffer.from('DO_NOT_EXPORT_MEMORY_OR_CREDENTIALS')]);
    writeFileSync(join(pending, '11111111-2222-3333-4444-555555555555.dmp'), data);
    writeFileSync(join(pending, 'untrusted-name.dmp'), data);
    const result = collectEmulatorCrashMetadata(root); assert.equal(result.reports.length, 1); assert.equal(result.exitStatus, 'unknown');
    assert.equal(result.status, 'exception_metadata'); assert(!JSON.stringify(result).includes('DO_NOT_EXPORT'));
  });
  console.log(`Emulator crash metadata checks passed: ${checks} synthetic cases; no real emulator-crash qualification.`);
} finally { rmSync(root, { recursive: true, force: true }); }
