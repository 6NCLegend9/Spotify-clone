const UI_TRACK = { id: "abcdefghijk", title: "A very long track title — Music for testing — responsive interface verification", channel: "A very long artist name", thumbnail: "/icon-192x192.png" };

async function installUiFixtures(page, { playback = false, accent = null, track = UI_TRACK, preserveSavedPlayback = false } = {}) {
  await page.addInitScript(({ track, playbackEnabled, customAccent, preserveSavedPlayback }) => {
    delete Navigator.prototype.serviceWorker;
    if (playbackEnabled) {
      localStorage.setItem("persist:settings", JSON.stringify({ owner: JSON.stringify("account:ui-test"), audioOnly: "true", dataSaver: "false", masterVolume: "0.35" }));
      if (!preserveSavedPlayback || !localStorage.getItem("heykasa:playback:v1:account%3Aui-test")) localStorage.setItem("heykasa:playback:v1:account%3Aui-test", JSON.stringify({ version: 1, owner: "account:ui-test", savedAt: Date.now(), youtubeVideo: track, youtubeQueue: [track], position: 12 }));
    }
    if (customAccent) {
      // AppearanceSync consumes the existing desktop bridge, not an invented storage key.
      window.heykasaDesktop = {
        getInfo: async () => ({ apiVersion: 1, desktopVersion: "99.0.0", capabilities: [] }),
        appearance: { get: async () => ({ available: true, resolvedAccent: customAccent, accentForeground: "#001014", profiles: [], activeProfile: null, backgroundUrl: "" }), onChanged: () => () => {} },
      };
    }
  }, { track, playbackEnabled: playback, customAccent: accent, preserveSavedPlayback });
  await page.route(/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\//, (route) => route.abort());
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/session") return route.fulfill({ json: { user: { id: "ui-test", name: "UI Test" }, expires: "2099-01-01T00:00:00.000Z" } });
    if (path === "/api/auth/providers") return route.fulfill({ json: {} });
    if (path === "/api/settings") return route.fulfill({ json: { authenticated: true, settings: {} } });
    if (path === "/api/language") return route.fulfill({ json: { authenticated: true, language: [] } });
    if (path === "/api/userPlaylists") return route.fulfill({ json: { success: true, data: { playlists: [] } } });
    if (path === "/api/favourite") return route.fulfill({ json: { success: true, data: { favourites: [] } } });
    return route.fulfill({ json: { success: true, authenticated: true, data: [], results: [], releases: [], genres: [], tree: [], personalGenres: [], sections: {}, artists: [], minimum: "0.0.0", desktopApiVersion: 1 } });
  });
}

module.exports = { installUiFixtures, UI_TRACK };
