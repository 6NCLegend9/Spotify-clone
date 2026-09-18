// Chart engine for Beat Arcade. Notes are scheduled in song time so a tile,
// obstacle, or enemy reaches the hit line on the beat — not after it.

export const DEFAULT_BPM = 120;
export const MIN_BPM = 72;
export const MAX_BPM = 180;

export function hashSeed(value) {
  const text = String(value || "arcade");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampBpm(bpm) {
  const value = Number(bpm);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BPM;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));
}

export function beatInterval(bpm) {
  return 60 / clampBpm(bpm);
}

export function estimateBpm(seed, title = "") {
  const text = String(title || "");
  if (/\b(ballad|slow|sad|acoustic|lullaby)\b/i.test(text)) return 84;
  if (/\b(edm|nightcore|drum|dnb|hardstyle|techno)\b/i.test(text)) return 140;
  if (/\b(hip[- ]?hop|rap|trap)\b/i.test(text)) return 96;
  if (/\b(disco|house|dance|pop)\b/i.test(text)) return 124;
  const pool = [88, 96, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140];
  const rng = createRng(hashSeed(seed));
  return pool[Math.floor(rng() * pool.length)];
}

export function notesInWindow(notes, from, to) {
  if (!Array.isArray(notes) || to <= from) return [];
  return notes.filter((note) => note.t >= from && note.t < to);
}

export function sliceChartFrom(chart, fromTime) {
  if (!chart || !Array.isArray(chart.notes)) return chart;
  const from = Math.max(0, Number(fromTime) || 0);
  return {
    ...chart,
    notes: chart.notes.filter((note) => Number(note.t) >= from),
  };
}

export function chartEnergy(time, bpm, offset = 0) {
  const interval = beatInterval(bpm);
  const elapsed = Math.max(0, Number(time) - Number(offset || 0));
  const phase = ((elapsed % interval) + interval) % interval / interval;
  const pulse = Math.max(0, 1 - phase * 2.4);
  return {
    bass: pulse,
    mid: 0.38 + pulse * 0.25,
    treble: 0.28 + pulse * 0.2,
    energy: 0.42 + pulse * 0.35,
    onset: phase < 0.07,
    mode: "chart",
  };
}

export function approachSeconds(bpm, beats = 4, reducedMotion = false) {
  return beatInterval(bpm) * (reducedMotion ? beats + 2 : beats);
}

function nextLane(previous, lanes, rng, style) {
  if (style === "stairs") return (previous + 1) % lanes;
  if (style === "bounce") return lanes - 1 - previous;
  if (style === "jump") return (previous + 2) % lanes;
  if (style === "hold") return previous;
  const step = rng() > 0.5 ? 1 : -1;
  return Math.max(0, Math.min(lanes - 1, previous + step));
}

export function buildRhythmChart({
  duration = 180,
  bpm,
  seed = "arcade",
  title = "",
  lanes = 4,
  onsets = null,
} = {}) {
  const tempo = clampBpm(bpm || estimateBpm(seed, title));
  const length = Math.max(8, Number(duration) || 180);
  const interval = beatInterval(tempo);
  const start = interval * 2;
  const end = Math.max(start + interval, length - 0.35);
  const rng = createRng(hashSeed(`${seed}:${Math.round(tempo)}:${lanes}`));
  const notes = [];

  if (Array.isArray(onsets) && onsets.length >= 8) {
    let lane = Math.floor(rng() * lanes);
    let previous = -1;
    for (const raw of onsets) {
      const time = Number(raw);
      if (!Number.isFinite(time) || time < start || time > end) continue;
      if (previous >= 0 && time - previous < interval * 0.42) continue;
      const accent = Math.abs((time - start) / interval - Math.round((time - start) / interval)) < 0.12
        && Math.round((time - start) / interval) % 4 === 0;
      lane = nextLane(lane, lanes, rng, accent ? "jump" : "walk");
      notes.push({
        t: time,
        lane,
        kind: accent ? "accent" : "tap",
        strength: accent ? 1 : 0.65,
      });
      previous = time;
    }
    if (notes.length >= 8) {
      return { bpm: tempo, offset: start, duration: length, notes, source: "onsets" };
    }
  }

  let lane = Math.floor(rng() * lanes);
  for (let time = start, beat = 0; time < end; time += interval, beat += 1) {
    const bar = Math.floor(beat / 4);
    const beatInBar = beat % 4;
    if (bar % 8 === 7 && beatInBar === 3) continue;

    const style = ["stairs", "walk", "bounce", "jump", "hold"][bar % 5];
    const dense = bar % 4 === 2;
    const steps = dense ? 2 : 1;
    for (let step = 0; step < steps; step += 1) {
      if (step > 0 && rng() < 0.42) continue;
      const noteTime = time + (step * interval) / steps;
      if (noteTime >= end) continue;
      lane = nextLane(lane, lanes, rng, step === 0 ? style : "walk");
      notes.push({
        t: Number(noteTime.toFixed(4)),
        lane,
        kind: beatInBar === 0 && step === 0 ? "accent" : "tap",
        strength: beatInBar === 0 && step === 0 ? 1 : dense ? 0.75 : 0.6,
      });
    }
  }

  return { bpm: tempo, offset: start, duration: length, notes, source: "grid" };
}

export function remapLanes(chart, lanes) {
  const count = Math.max(1, Number(lanes) || 1);
  return {
    ...chart,
    notes: (chart?.notes || []).map((note) => ({
      ...note,
      lane: ((Number(note.lane) || 0) % count + count) % count,
    })),
  };
}

export function estimateBpmFromOnsets(onsets) {
  if (!Array.isArray(onsets) || onsets.length < 6) return 0;
  const gaps = [];
  for (let index = 1; index < onsets.length; index += 1) {
    const gap = onsets[index] - onsets[index - 1];
    if (gap >= 0.22 && gap <= 1.1) gaps.push(gap);
  }
  if (gaps.length < 4) return 0;
  gaps.sort((left, right) => left - right);
  const median = gaps[Math.floor(gaps.length / 2)];
  let bpm = 60 / median;
  if (bpm < 75) bpm *= 2;
  if (bpm > 170) bpm /= 2;
  return clampBpm(bpm);
}

export function analyzePcm(samples, sampleRate = 44100) {
  const rate = Number(sampleRate) || 44100;
  const data = samples || [];
  const hop = 512;
  const energies = [];
  for (let index = 0; index + hop < data.length; index += hop) {
    let energy = 0;
    for (let offset = 0; offset < hop; offset += 1) {
      const sample = data[index + offset] || 0;
      energy += sample * sample;
    }
    energies.push(Math.sqrt(energy / hop));
  }

  const flux = [0];
  for (let index = 1; index < energies.length; index += 1) {
    flux.push(Math.max(0, energies[index] - energies[index - 1]));
  }
  const mean = flux.reduce((total, value) => total + value, 0) / Math.max(1, flux.length);
  const threshold = Math.max(0.004, mean * 1.7);
  const onsets = [];
  let last = -99;
  for (let index = 1; index < flux.length - 1; index += 1) {
    if (
      flux[index] > threshold
      && flux[index] >= flux[index - 1]
      && flux[index] >= flux[index + 1]
      && index - last > 4
    ) {
      onsets.push((index * hop) / rate);
      last = index;
    }
  }

  return {
    duration: data.length / rate,
    bpm: estimateBpmFromOnsets(onsets) || DEFAULT_BPM,
    onsets,
  };
}

export function emptyChart(seed = "arcade") {
  return buildRhythmChart({ duration: 180, seed });
}
