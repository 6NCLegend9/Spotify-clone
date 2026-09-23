const POSITIVE_TITLE_PATTERNS = [
  [/\bofficial\s+music\s+video\b/i, 90],
  [/\bofficial\s+video\b/i, 75],
  [/\bofficial\s+audio\b/i, 70],
  [/\bofficial\b/i, 30],
];

const NEGATIVE_PATTERNS = [
  [/\bcover\b/i, -140],
  [/\bkaraoke\b/i, -140],
  [/\breaction\b/i, -120],
  [/\bnightcore\b/i, -110],
  [/\bslowed\b/i, -80],
  [/\breverb\b/i, -70],
  [/\b8d\b/i, -70],
  [/\bsped\s*up\b/i, -70],
  [/\blyric(?:s|\s+video)?\b/i, -45],
  [/\blive\b/i, -35],
];

const NON_MUSIC_TITLE_PATTERNS = [
  /\breaction(?:s|\s+video)?\b/i,
  /\breacts?\s+to\b/i,
  /\bpress\s+conference\b/i,
  /\binterview\b/i,
  /\bpodcast\b/i,
  /\breview\b/i,
  /\bbreakdown\b/i,
  /\bexplained\b/i,
  /\bdocumentary\b/i,
  /\bbehind\s+the\s+scenes\b/i,
  /\bmaking\s+of\b/i,
  /\b(?:official\s+)?trailer\b/i,
  /\bteaser\b/i,
  /\bannouncement\b/i,
  /\bvlog\b/i,
  /\bchallenge\b/i,
  /\btutorial\b/i,
  /\bcommentary\b/i,
  /\bfirst\s+listen\b/i,
  /\bstream\s+highlights?\b/i,
  /#shorts?\b/i,
];

const DERIVATIVE_VERSION_PATTERNS = [
  [/\bcover\b/i, /\bcover\b/i],
  [/\bkaraoke\b/i, /\bkaraoke\b/i],
  [/\bnightcore\b/i, /\bnightcore\b/i],
  [/\bslowed\b/i, /\bslowed\b/i],
  [/\breverb\b/i, /\breverb\b/i],
  [/\b8d\b/i, /\b8d\b/i],
  [/\bsped\s*up\b/i, /\bsped\s*up\b/i],
];

function words(value) {
  return String(value || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

export function sanitizeMusicSearchQuery(query) {
  return String(query || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

export function buildOfficialMusicQuery(query) {
  // Preserve the requested song, language and version. Provider-specific OR
  // syntax and forced English release labels change what the user searched for.
  // Prefer official sources only when ranking equally relevant results below.
  return sanitizeMusicSearchQuery(query);
}

export function isMusicPlaybackCandidate(result, query = "") {
  const title = String(result?.title || result?.name || "").trim();
  if (!title) return false;
  if (NON_MUSIC_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return false;
  const requested = String(query || "");
  for (const [candidatePattern, requestedPattern] of DERIVATIVE_VERSION_PATTERNS) {
    if (candidatePattern.test(title) && !requestedPattern.test(requested)) return false;
  }
  return true;
}

export function filterMusicPlaybackResults(results, query = "") {
  return (Array.isArray(results) ? results : []).filter((result) => isMusicPlaybackCandidate(result, query));
}

function queryCoverage(result, query) {
  const requested = new Set(words(query));
  const candidate = new Set(words(`${result?.title || ""} ${result?.channel || ""}`));
  if (!requested.size) return 0;
  return [...requested].filter((word) => candidate.has(word)).length / requested.size;
}

export function officialMusicScore(result, query) {
  const title = String(result?.title || "");
  const channel = String(result?.channel || "");
  const description = String(result?.description || "");
  const haystack = `${title} ${channel} ${description}`;
  const normalizedChannel = channel.toLowerCase().trim();
  const queryWords = new Set(words(query));
  const candidateWords = new Set(words(`${title} ${channel}`));
  let score = 0;

  if (/\bvevo\b/i.test(channel) || /vevo$/i.test(normalizedChannel)) score += 130;
  if (/\s-\s*topic$/i.test(channel) || /\btopic$/i.test(normalizedChannel)) score += 125;
  if (/\bofficial\b/i.test(channel)) score += 80;

  for (const [pattern, points] of POSITIVE_TITLE_PATTERNS) {
    if (pattern.test(title)) score += points;
  }
  for (const [pattern, points] of NEGATIVE_PATTERNS) {
    if (pattern.test(haystack) && !pattern.test(query)) score += points;
  }

  if (queryWords.size) {
    let matched = 0;
    queryWords.forEach((word) => {
      if (candidateWords.has(word)) matched += 1;
    });
    score += Math.round((matched / queryWords.size) * 60);
  }

  return score;
}

export function rankOfficialMusicResults(results, query) {
  return filterMusicPlaybackResults(results, query)
    .map((result, index) => ({ result, index, coverage: queryCoverage(result, query), score: officialMusicScore(result, query) }))
    .sort((left, right) => right.coverage - left.coverage || right.score - left.score || left.index - right.index)
    .map(({ result }) => result);
}
