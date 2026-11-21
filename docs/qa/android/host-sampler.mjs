// Bounded host evidence for emulator loss. Never read cmdline or environ.
import { readFileSync, readdirSync } from 'node:fs';
const read = (file) => { try { return readFileSync(file, 'utf8').trim(); } catch { return null; } };
const fields = (text, allowed) => Object.fromEntries((text || '').split('\n').flatMap(line => {
  const [name, value] = line.trim().split(/:\s*|\s+/);
  return allowed.includes(name) && /^\d+$/.test(value) ? [[name, Number(value)]] : [];
}));
function sample() {
  const processes = [];
  let entries = [];
  try { entries = readdirSync('/proc'); } catch { /* Non-Linux evidence is unavailable. */ }
  for (const pid of entries) {
    if (!/^\d+$/.test(pid)) continue;
    const name = read(`/proc/${pid}/comm`);
    if (!/^(qemu-system.*|emulator|java|node|MainThread)$/.test(name || '')) continue;
    const status = read(`/proc/${pid}/status`);
    processes.push({ pid: Number(pid), name,
      state: status?.match(/^State:\s+(\w)/m)?.[1] || null,
      ...fields(status, ['VmRSS', 'VmHWM', 'Threads']) });
  }
  return { at: new Date().toISOString(), processes,
    memoryKiB: fields(read('/proc/meminfo'), ['MemAvailable', 'MemFree', 'SwapFree']),
    // Explicit null distinguishes unavailable counters from zero OOM events.
    cgroupMemoryEvents: read('/sys/fs/cgroup/memory.events'),
    memoryPressure: read('/proc/pressure/memory'), cpuPressure: read('/proc/pressure/cpu') };
}
let remaining = 420; // At most 35 minutes, matching the CI job deadline.
function emit() {
  process.stdout.write(`${JSON.stringify(sample())}\n`);
  if (--remaining <= 0) clearInterval(timer);
}
const timer = setInterval(emit, 5000);
process.on('SIGTERM', () => { clearInterval(timer); emit(); });
process.on('SIGINT', () => { clearInterval(timer); emit(); });
emit();
