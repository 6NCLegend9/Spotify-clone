const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

let accessToken = "";
let tokenExpiresAt = 0;

function createSpotifyError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getCredentials() {
  const clientId = typeof process.env.SPOTIFY_CLIENT_ID === "string" ? process.env.SPOTIFY_CLIENT_ID.trim() : "";
  const clientSecret = typeof process.env.SPOTIFY_CLIENT_SECRET === "string" ? process.env.SPOTIFY_CLIENT_SECRET.trim() : "";
  if (!clientId || !clientSecret) throw createSpotifyError("Spotify integration is not configured", 503);
  return { clientId, clientSecret };
}

async function getAccessToken(forceRefresh = false) {
  if (!forceRefresh && accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const { clientId, clientSecret } = getCredentials();
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) throw createSpotifyError("Unable to authenticate with Spotify", response.status);
  const payload = await response.json();
  if (typeof payload.access_token !== "string" || !payload.access_token) throw createSpotifyError("Spotify returned an invalid access token", 502);

  accessToken = payload.access_token;
  tokenExpiresAt = Date.now() + Math.max(30, Number(payload.expires_in) || 3600 - 60) * 1000;
  return accessToken;
}

async function requestSpotify(path, parameters = {}, retried = false) {
  const token = await getAccessToken(retried);
  const url = new URL(path, `${SPOTIFY_API_URL}/`);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 && !retried) {
    accessToken = "";
    tokenExpiresAt = 0;
    return requestSpotify(path, parameters, true);
  }
  if (!response.ok) throw createSpotifyError("Spotify data is temporarily unavailable", response.status);
  return response.json();
}

export async function searchSpotifyTracks(query, limit = 10, offset = 0) {
  return requestSpotify("search", {
    q: query,
    type: "track",
    limit: Math.min(Math.max(Number(limit) || 1, 1), 10),
    offset: Math.min(Math.max(Number(offset) || 0, 0), 990),
    market: "US",
  });
}

export async function getSpotifyArtist(artistId) {
  if (typeof artistId !== "string" || !artistId) return null;
  return requestSpotify(`artists/${encodeURIComponent(artistId)}`);
}