// Parametric radio queue engine (YouTube Music-style station tuner).
//
// Pure, dependency-free, and framework-agnostic so it can be unit-tested with
// `node --test` and reused from any client component. It re-ranks and filters a
// pool of candidate tracks around a seed using three dials:
//   - varietyLevel  : how aggressively same-artist tracks are spread apart
//   - selectionDepth: familiar (hits) -> discover (balanced) -> deep-dives (novel)
//   - mood          : real-time keyword re-rank (chill/workout/focus/party/energy)
//
// The app's YouTube tracks do not carry reliable audio features or view counts,
// so ranking uses the signals that ARE present: artist (channel), genre/seed,
// original relevance order, and title/genre keywords.

/**
 * @typedef {Object} RadioTrack
 * @property {string} [id]
 * @property {string} [title]
 * @property {string} [channel]     Artist / uploader (primary artist signal).
 * @property {string} [channelTitle]
 * @property {string} [genre]
 * @property {string} [seedQuery]
 * @property {string|number} [duration] ISO-8601 ("PT3M45S"), "mm:ss", or seconds.
 * @property {string|number} [views]
 */

export const VARIETY_LEVELS = ["low", "med", "high"];
export const SELECTION_DEPTHS = ["familiar", "discover", "deep-dives"];

// Mood ids intentionally match MOOD_OPTIONS in moods.js so the two systems align.
export const MOOD_PROFILES = {
  chill: {
    label: "Chill",
    keywords: ["chill", "lofi", "lo-fi", "relax", "calm", "acoustic", "ambient", "slow", "mellow", "sleep", "rain", "soft", "dream"],
    avoid: ["workout", "hype", "hard", "metal", "rage", "gym", "banger"],
  },
  workout: {
    label: "Workout",
    keywords: ["workout", "gym", "hype", "pump", "power", "beast", "motivation", "running", "cardio", "hard", "intense", "hiit", "fast"],
    avoid: ["lofi", "lo-fi", "sleep", "calm", "slow", "ambient", "acoustic"],
  },
  focus: {
    label: "Focus",
    keywords: ["focus", "study", "concentration", "instrumental", "deep work", "ambient", "piano", "reading", "calm", "beats"],
    avoid: ["party", "club", "banger", "turn up", "hype", "remix"],
  },
  party: {
    label: "Party",
    keywords: ["party", "dance", "club", "hits", "remix", "banger", "turn up", "edm", "house", "anthem", "dj", "mix"],
    avoid: ["lofi", "lo-fi", "sleep", "study", "ambient", "acoustic", "calm"],
  },
  energy: {
    label: "Energy",
    keywords: ["energy", "energetic", "epic", "power", "anthem", "upbeat", "adrenaline", "hype", "rock", "electric"],
    avoid: ["sleep", "lofi", "lo-fi", "slow", "calm", "mellow"],
  },
};

export const RADIO_MOODS = Object.keys(MOOD_PROFILES);

const VARIETY_GAP = { low: 0, med: 2, high: 4 };

const DEPTH_WEIGHTS = {
  familiar: { familiarity: 2.2, popularity: 1.4, novelty: -0.6 },
  discover: { familiarity: 0.8, popularity: 0.5, novelty: 0.8 },
  "deep-dives": { familiarity: 0.4, popularity: -0.9, novelty: 1.6 },
};

const lc = (value) => String(value == null ? "" : value).toLowerCase();

/** Extract a stable track id from the various shapes YouTube data can take. */
export function trackId(track) {
  if (!track) return null;
  if (typeof track.id === "string" || typeof track.id === "number") return track.id;
  if (track.id && typeof track.id === "object") return track.id.videoId ?? track.id.playlistId ?? null;
  return track.videoId ?? null;
}

function trackTitle(track) {
  return track?.title || track?.name || "";
}

function trackArtist(track) {
  return track?.channel || track?.channelTitle || track?.artist || track?.videoOwnerChannelTitle || "";
}

function trackGenre(track) {
  return track?.genre || track?.seedQuery || "";
}

function trackText(track) {
  return `${trackTitle(track)} ${trackArtist(track)} ${trackGenre(track)}`.toLowerCase();
}

/** Parse a view count that may be a number or a string like "1.2M views". */
export function parseViews(track) {
  const raw = track?.views ?? track?.viewCount ?? track?.statistics?.viewCount;
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const cleaned = String(raw).toLowerCase().replace(/,/g, "").replace(/views?/g, "").trim();
  const match = cleaned.match(/^([\d.]+)\s*([kmb])?/);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;
  const mult = match[2] === "b" ? 1e9 : match[2] === "m" ? 1e6 : match[2] === "k" ? 1e3 : 1;
  return Math.round(value * mult);
}

/** Parse a duration in ISO-8601 ("PT3M45S"), "mm:ss"/"h:mm:ss", or seconds. */
export function parseDurationSeconds(track) {
  const raw = track?.duration ?? track?.lengthSeconds;
  if (raw == null) return 0;
  if (typeof raw === "number") return raw > 0 ? raw : 0;
  const value = String(raw).trim();
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (iso) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
  if (value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.length && parts.every((n) => Number.isFinite(n))) {
      return parts.reduce((acc, part) => acc * 60 + part, 0);
    }
  }
  return 0;
}

function keywordHits(text, words) {
  let hits = 0;
  for (const word of words) {
    if (word && text.includes(word)) hits += 1;
  }
  return hits;
}

function familiarityScore(track, seed) {
  if (!seed) return 0;
  let score = 0;
  const artist = lc(trackArtist(track));
  const seedArtist = lc(trackArtist(seed));
  if (artist && artist === seedArtist) score += 3;
  const genre = lc(trackGenre(track));
  const seedGenre = lc(trackGenre(seed));
  if (genre && seedGenre && (genre === seedGenre || genre.includes(seedGenre) || seedGenre.includes(genre))) score += 2;
  const seedQuery = lc(seed?.seedQuery);
  const trackQuery = lc(track?.seedQuery);
  if (seedQuery && trackQuery && seedQuery === trackQuery) score += 1;
  return score;
}

function genreMatches(track, seed) {
  if (!seed) return false;
  const genre = lc(trackGenre(track));
  const seedGenre = lc(trackGenre(seed));
  return Boolean(genre && seedGenre && (genre === seedGenre || genre.includes(seedGenre) || seedGenre.includes(genre)));
}

function scoreCandidate(track, { seed, index, total, depth, mood }) {
  const weights = DEPTH_WEIGHTS[depth] || DEPTH_WEIGHTS.discover;
  const familiarity = familiarityScore(track, seed);

  // Popularity proxy: earlier in the source list == more relevant/popular.
  const positionScore = total > 1 ? 1 - index / (total - 1) : 1;
  const views = parseViews(track);
  const viewsScore = views > 0 ? Math.min(1, Math.log10(views) / 9) : 0;
  const popularity = Math.max(positionScore, viewsScore);

  const sameArtist = seed && lc(trackArtist(track)) === lc(trackArtist(seed));
  const novelty = (sameArtist ? 0 : 1) * (genreMatches(track, seed) ? 1.2 : 0.6);

  let score = weights.familiarity * familiarity + weights.popularity * popularity * 2 + weights.novelty * novelty;

  if (mood && MOOD_PROFILES[mood]) {
    const text = trackText(track);
    score += keywordHits(text, MOOD_PROFILES[mood].keywords) * 1.5;
    score -= keywordHits(text, MOOD_PROFILES[mood].avoid) * 1.2;
  }
  return score;
}

/**
 * Greedy re-order that keeps ranking order while separating same-artist tracks
 * by up to `gap` slots. varietyLevel "low" is a no-op (pure relevance order).
 * @param {RadioTrack[]} tracks
 * @param {"low"|"med"|"high"} [varietyLevel]
 * @returns {RadioTrack[]}
 */
export function spreadByArtist(tracks, varietyLevel = "med") {
  const gap = VARIETY_GAP[varietyLevel] ?? 2;
  const list = Array.isArray(tracks) ? tracks.slice() : [];
  if (gap <= 0 || list.length < 3) return list;

  const result = [];
  const recentArtists = [];
  while (list.length) {
    let pick = list.findIndex((track) => !recentArtists.includes(lc(trackArtist(track))));
    if (pick === -1) pick = 0; // Everything left is "recent" -> take the top-ranked.
    const [chosen] = list.splice(pick, 1);
    result.push(chosen);
    recentArtists.push(lc(trackArtist(chosen)));
    while (recentArtists.length > gap) recentArtists.shift();
  }
  return result;
}

/**
 * Build a tuned radio queue from a seed track and a candidate pool.
 * The seed itself is excluded from the returned "up-next" list.
 *
 * @param {Object} options
 * @param {RadioTrack} [options.seedTrack]      The track the station is seeded from.
 * @param {string} [options.seedTrackId]        Alternative to seedTrack: look it up in candidates.
 * @param {RadioTrack[]} [options.candidates]   Pool of tracks to rank/filter.
 * @param {"low"|"med"|"high"} [options.varietyLevel]
 * @param {"familiar"|"discover"|"deep-dives"} [options.selectionDepth]
 * @param {string|null} [options.mood]          One of RADIO_MOODS, or null.
 * @param {number} [options.limit]              Max tracks to return (default 50).
 * @returns {RadioTrack[]}
 */
export function buildRadioQueue({
  seedTrack = null,
  seedTrackId = null,
  candidates = [],
  varietyLevel = "med",
  selectionDepth = "discover",
  mood = null,
  limit = 50,
} = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const depth = SELECTION_DEPTHS.includes(selectionDepth) ? selectionDepth : "discover";
  const variety = VARIETY_LEVELS.includes(varietyLevel) ? varietyLevel : "med";
  const moodKey = mood && MOOD_PROFILES[mood] ? mood : null;

  const seed = seedTrack
    || (seedTrackId != null ? list.find((track) => String(trackId(track)) === String(seedTrackId)) : null)
    || null;
  const seedIdStr = seed ? String(trackId(seed)) : null;

  const seen = new Set();
  const pool = [];
  for (const track of list) {
    const id = trackId(track);
    if (id == null) continue;
    const idStr = String(id);
    if (seedIdStr != null && idStr === seedIdStr) continue;
    if (seen.has(idStr)) continue;
    seen.add(idStr);
    pool.push(track);
  }

  const total = pool.length;
  const scored = pool.map((track, index) => ({
    track,
    index,
    score: scoreCandidate(track, { seed, index, total, depth, mood: moodKey }),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const ranked = spreadByArtist(scored.map((entry) => entry.track), variety);
  return typeof limit === "number" && limit > 0 ? ranked.slice(0, limit) : ranked;
}

/**
 * Re-rank an existing queue in real time for a mood switch, keeping the
 * currently-playing track pinned at the head. Boosts (never hard-drops) so the
 * queue can't empty out. Passing a falsy mood restores stable order.
 *
 * @param {RadioTrack[]} queue
 * @param {string|null} mood
 * @param {Object} [options]
 * @param {RadioTrack} [options.seedTrack]  The now-playing track to keep at index 0.
 * @param {"low"|"med"|"high"} [options.varietyLevel]
 * @returns {RadioTrack[]}
 */
export function applyMoodFilter(queue, mood, { seedTrack = null, varietyLevel = "med" } = {}) {
  const list = Array.isArray(queue) ? queue.slice() : [];
  if (list.length === 0) return list;
  const moodKey = mood && MOOD_PROFILES[mood] ? mood : null;

  let head = null;
  if (seedTrack) {
    const seedIdStr = String(trackId(seedTrack));
    const at = list.findIndex((track) => String(trackId(track)) === seedIdStr);
    if (at >= 0) [head] = list.splice(at, 1);
  }
  if (!head) head = list.shift() || null;

  if (!moodKey) return head ? [head, ...list] : list;

  const total = list.length;
  const scored = list.map((track, index) => ({
    track,
    index,
    score:
      keywordHits(trackText(track), MOOD_PROFILES[moodKey].keywords) * 1.5
      - keywordHits(trackText(track), MOOD_PROFILES[moodKey].avoid) * 1.2
      + (total > 1 ? (1 - index / (total - 1)) * 0.4 : 0),
  }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const reordered = spreadByArtist(scored.map((entry) => entry.track), varietyLevel);
  return head ? [head, ...reordered] : reordered;
}

// ---------------------------------------------------------------------------
// Kasa Crowd — blending several listeners into one shared station.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} CrowdMember
 * @property {string} id            Stable participant id (Jam presence key).
 * @property {string} [name]        Display name, used for on-screen attribution.
 * @property {string[]} [genres]
 * @property {string[]} [artists]
 */

/**
 * @typedef {Object} CrowdSeed
 * @property {string} term
 * @property {"artist"|"genre"} kind
 * @property {string[]} owners      Member ids that contributed the term.
 * @property {string[]} ownerNames  Matching display names, same order as owners.
 * @property {number} weight        How many members share the term.
 */

const CROWD_TERM_MAX_CHARS = 60;

function crowdTerm(value) {
  return String(value == null ? "" : value).trim().replace(/\s+/g, " ").slice(0, CROWD_TERM_MAX_CHARS);
}

/** Which member a candidate track is attributed to. */
export function trackOwner(track) {
  const owner = track?.owner ?? track?.ownerId;
  return owner == null ? "" : String(owner);
}

/**
 * Merge each member's taste into one seed list for a shared room.
 *
 * Seeds are picked round-robin so every member is represented even when the
 * room is lopsided, then sorted so terms more people share rank first. Owners
 * are tracked per seed so the UI can say *why* a track is playing.
 *
 * @param {CrowdMember[]} members
 * @param {Object} [options]
 * @param {number} [options.maxSeeds]      Total seeds to emit (default 12).
 * @param {number} [options.maxPerMember]  Terms taken from each member (default 4).
 * @returns {{ seeds: CrowdSeed[], owners: Array<{id: string, name: string, seedCount: number}> }}
 */
export function blendProfiles(members, { maxSeeds = 12, maxPerMember = 4 } = {}) {
  const list = Array.isArray(members) ? members : [];
  const owners = [];
  const perMember = [];

  for (const member of list) {
    const id = member?.id == null ? "" : String(member.id);
    if (!id || owners.some((owner) => owner.id === id)) continue;
    const name = crowdTerm(member?.name) || "Listener";
    owners.push({ id, name, seedCount: 0 });

    // Alternate artist/genre so one long list can't crowd out the other.
    const artists = (Array.isArray(member?.artists) ? member.artists : []).map((raw) => ({ raw, kind: "artist" }));
    const genres = (Array.isArray(member?.genres) ? member.genres : []).map((raw) => ({ raw, kind: "genre" }));
    const picks = [];
    for (let index = 0; index < Math.max(artists.length, genres.length); index += 1) {
      for (const entry of [artists[index], genres[index]]) {
        if (!entry) continue;
        const term = crowdTerm(entry.raw);
        if (!term) continue;
        const key = `${entry.kind}:${term.toLowerCase()}`;
        if (picks.some((pick) => pick.key === key)) continue;
        picks.push({ key, term, kind: entry.kind });
      }
    }
    perMember.push({ id, name, picks: picks.slice(0, Math.max(0, maxPerMember)) });
  }

  const seeds = [];
  if (maxSeeds > 0) {
    const byKey = new Map();
    for (let round = 0; seeds.length < maxSeeds; round += 1) {
      let advanced = false;
      for (const member of perMember) {
        const pick = member.picks[round];
        if (!pick) continue;
        advanced = true;
        const existing = byKey.get(pick.key);
        if (existing) {
          if (!existing.owners.includes(member.id)) {
            existing.owners.push(member.id);
            existing.ownerNames.push(member.name);
            existing.weight += 1;
          }
          continue;
        }
        const seed = { term: pick.term, kind: pick.kind, owners: [member.id], ownerNames: [member.name], weight: 1 };
        byKey.set(pick.key, seed);
        seeds.push(seed);
        if (seeds.length >= maxSeeds) break;
      }
      if (!advanced) break;
    }
    seeds.sort((a, b) => b.weight - a.weight);
  }

  for (const owner of owners) {
    owner.seedCount = seeds.filter((seed) => seed.owners.includes(owner.id)).length;
  }
  return { seeds, owners };
}

/**
 * Round-robin an attributed pool so every member gets comparable airtime,
 * preserving each member's own ranking order. Duplicate track ids are dropped,
 * keeping the first (best-ranked) occurrence.
 *
 * @param {RadioTrack[]} tracks   Tracks carrying an `owner` (see trackOwner).
 * @param {Object} [options]
 * @param {number} [options.limit]  Max tracks to return (0 = all).
 * @returns {RadioTrack[]}
 */
export function spreadByOwner(tracks, { limit = 0 } = {}) {
  const list = Array.isArray(tracks) ? tracks : [];
  const buckets = new Map();
  const order = [];
  const seen = new Set();

  for (const track of list) {
    const id = trackId(track);
    if (id == null) continue;
    const idStr = String(id);
    if (seen.has(idStr)) continue;
    seen.add(idStr);
    const owner = trackOwner(track);
    if (!buckets.has(owner)) {
      buckets.set(owner, []);
      order.push(owner);
    }
    buckets.get(owner).push(track);
  }

  const result = [];
  for (let round = 0; ; round += 1) {
    let advanced = false;
    for (const owner of order) {
      const bucket = buckets.get(owner);
      if (round >= bucket.length) continue;
      result.push(bucket[round]);
      advanced = true;
      if (limit > 0 && result.length >= limit) return result;
    }
    if (!advanced) return result;
  }
}
