const fs = require("node:fs"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const root = path.resolve(__dirname, "../../.."),
  ts = require(root + "/node_modules/typescript");
const load = (file, mocks = {}, globals = {}) => {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(root + "/" + file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: (n) => mocks[n] || require(n),
    console,
    URL,
    URLSearchParams,
    AbortController,
    Date,
    ...globals,
  });
  return module.exports;
};
const identity = load("src/utils/songIdentity.mjs");
const discovery = load("src/utils/homeDiscovery.mjs", {
  "./songIdentity.mjs": identity,
});
const explicit = load("src/utils/explicitContent.mjs");
const track = (i) => ({
  id: `id${String(i).padStart(9, "0")}`,
  title: `Song ${i}`,
  channel: `Artist ${i}`,
});
const taste = Array.from({ length: 24 }, (_, i) => track(i)),
  explore = Array.from({ length: 12 }, (_, i) => track(i + 20));
const tick = () => new Promise((r) => setImmediate(r));
function harness(deferPlaylists = false) {
  const slots = [],
    effects = [],
    cleanup = [],
    events = new Map(),
    playlistRequests = [],
    recommendationRequests = [];
  let index = 0,
    privateSession = false;
  const react = {
    useState: (v) => {
      const k = index++;
      if (!(k in slots)) slots[k] = typeof v === "function" ? v() : v;
      return [
        slots[k],
        (v) => {
          slots[k] = typeof v === "function" ? v(slots[k]) : v;
        },
      ];
    },
    useMemo: (fn) => {
      index++;
      return fn();
    },
    useEffect: (fn, deps) => {
      const k = index++;
      if (!slots[k] || deps.some((v, i) => v !== slots[k][i])) {
        slots[k] = deps;
        effects.push(() => {
          cleanup[k]?.();
          cleanup[k] = fn();
        });
      }
    },
  };
  const dispatch = () => {};
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const hook = load(
    "src/hooks/useHomeFeed.js",
    {
      react,
      "react-redux": {
        useDispatch: () => dispatch,
        useSelector: (fn) =>
          fn({ settings: { privateSession, explicitContent: false } }),
      },
      "next-auth/react": {
        useSession: () => ({
          status: "authenticated",
          data: { user: { id: "alice" } },
        }),
      },
      "@/redux/features/loadingBarSlice": { setProgress: (x) => x },
      "@/services/http": {
        requestJson: async (url) => {
          if (url.startsWith("/api/recommendations")) {
            recommendationRequests.push(url);
            const recent = new Set(
              (
                new URL(url, "https://qa.invalid").searchParams.get("recent") ||
                ""
              ).split(","),
            );
            return {
              basis: "taste",
              sections: {
                forYou: {
                  tracks: taste.filter((t) => !recent.has(t.id)).slice(0, 12),
                  playlists: [],
                },
                explore: {
                  tracks: explore.filter((t) => !recent.has(t.id)).slice(0, 12),
                  playlists: [],
                },
              },
            };
          }
          return url === "/api/history"
            ? { success: true, data: [] }
            : { releases: [] };
        },
      },
      "@/services/playlistApi": {
        getUserPlaylists: () =>
          deferPlaylists
            ? new Promise((resolve) => playlistRequests.push(resolve))
            : Promise.resolve({ success: true, data: { playlists: [] } }),
      },
      "@/utils/userError": { toUserError: (x) => x },
      "@/utils/accountCache.mjs": {
        accountOwner: () => "account:alice",
        readAccountCache: () => null,
        writeAccountCache: () => true,
      },
      "@/utils/explicitContent.mjs": explicit,
      "@/utils/homeDiscovery.mjs": discovery,
      "@/utils/recentActivity.mjs": {
        HISTORY_CHANGED: "history",
        prependHistory: (list, entry) => [
          entry,
          ...list.filter((t) => t.id !== entry.id),
        ],
      },
    },
    {
      localStorage: storage,
      sessionStorage: storage,
      window: {
        addEventListener: (n, fn) => events.set(n, fn),
        removeEventListener: (n) => events.delete(n),
      },
    },
  ).default;
  return {
    render() {
      index = 0;
      const result = hook();
      effects.splice(0).forEach((fn) => fn());
      return result;
    },
    events,
    playlistRequests,
    recommendationRequests,
    setPrivate: (v) => {
      privateSession = v;
    },
    close: () => cleanup.forEach((fn) => fn?.()),
  };
}
(async () => {
  const h = harness();
  h.render();
  await tick();
  let feed = h.render();
  const before = discovery.composeHomePage(feed);
  h.events.get("history")({
    detail: { owner: "account:alice", entry: taste[0] },
  });
  h.render();
  await tick();
  feed = h.render();
  const after = discovery.composeHomePage(feed);
  assert.equal(after.forYou.tracks.length, 12);
  assert.equal(after.explore.tracks.length, 12);
  assert(h.recommendationRequests.at(-1).includes("recent=" + taste[0].id));
  assert(!after.forYou.tracks.some((t) => t.id === taste[0].id));
  const calls = h.recommendationRequests.length;
  h.events.get("history")({
    detail: { owner: "account:bob", entry: taste[1] },
  });
  h.render();
  await tick();
  assert.equal(h.recommendationRequests.length, calls);
  h.setPrivate(true);
  h.render();
  await tick();
  h.render();
  assert(!h.recommendationRequests.at(-1).includes("recent="));
  h.close();
  const p = harness(true);
  p.render();
  await tick();
  p.events.get("heykasa:playlists-changed")({
    detail: { owner: "account:alice", playlist: { _id: "new", name: "New" } },
  });
  p.playlistRequests[1]({
    success: true,
    data: { playlists: [{ _id: "new", name: "New" }] },
  });
  await tick();
  const newer = p.render().playlists.length;
  p.playlistRequests[0]({ success: true, data: { playlists: [] } });
  await tick();
  const older = p.render().playlists.length;
  assert.equal(newer, 1);
  assert.equal(older, 1);
  p.close();
  const runtime = require(root + "/node_modules/react/jsx-runtime");
  for (const filter of ["music", "for-you"]) {
    const moduleMocks = {
      react: { useState: () => [filter, () => {}] },
      "react/jsx-runtime": runtime,
      "@/hooks/useHomeFeed": {
        __esModule: true,
        default: () => ({
          status: "authenticated",
          basis: "taste",
          loading: false,
          hasAny: true,
        }),
      },
      "@/hooks/useHomeHighlights": { __esModule: true, default: () => ({}) },
      "@/utils/homeDiscovery.mjs": {
        composeHomePage: () => ({
          quickItems: [{ type: "liked" }],
          history: [],
          anniversary: [],
          weekly: [],
          forYou: {
            tracks: [],
            mainTracks: [],
            playlists:
              filter === "music" ? [{ id: "one", title: "Playlist" }] : [],
          },
          explore: {
            tracks: filter === "for-you" ? [track(20)] : [],
            mainTracks: filter === "for-you" ? [track(20)] : [],
            playlists: [{ id: "two", title: "Playlist 2" }],
          },
        }),
      },
    };
    const stub = function Stub() {};
    const code = ts.transpileModule(
      fs.readFileSync(root + "/src/components/Homepage/Home.jsx", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      },
    ).outputText;
    const module = { exports: {} };
    const Empty = function EmptyState() {};
    moduleMocks["@/components/EmptyState"] = {
      __esModule: true,
      default: Empty,
    };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require: (n) =>
        moduleMocks[n] || {
          __esModule: true,
          default: stub,
          TrackRail: stub,
          MixRail: stub,
          HomeFeedSkeleton: stub,
        },
    });
    const tree = module.exports.default();
    let emptyStates = 0,
      visibleItems = 0;
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.type === Empty) emptyStates++;
      for (const key of ["videos", "mixes", "items"])
        visibleItems += n.props?.[key]?.length || 0;
      walk(n.props?.children);
    };
    walk(tree);
    assert.equal(emptyStates, 1);
    assert.equal(visibleItems, 0);
  }
  const reducer = load("src/redux/features/appearanceSlice.js", {
    "@reduxjs/toolkit": require(root + "/node_modules/@reduxjs/toolkit"),
    "@/utils/appearanceModel.mjs": load("src/utils/appearanceModel.mjs"),
  });
  const appearance = reducer.default(undefined, { type: "init" });
  const lum = (h) => {
    const c = h
      .match(/\w\w/g)
      .map((x) => parseInt(x, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const ratio = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  assert.equal(appearance.accentForeground, "#ffffff");
  assert(ratio(appearance.resolvedAccent, appearance.accentForeground) >= 4.5);
  const artists = load("src/utils/artistNavigation.mjs", {
    "./text.js": load("src/utils/text.js"),
    "./radioSeed.mjs": load("src/utils/radioSeed.mjs", {
      "./songIdentity.mjs": identity,
    }),
  });
  const channelId = "UC" + "a".repeat(22);
  const credits = artists.trackArtistCredits({
    artists: [{ name: "Earth, Wind & Fire", channelId }],
    channel: "Earth, Wind & Fire",
    channelId,
  });
  assert.equal(credits.length, 1);
  assert.equal(credits[0].channelId, channelId);
  assert(
    artists
      .artistPageHref(credits[0].channelId, credits[0].name)
      .startsWith("/artist/" + channelId),
  );
  assert.equal(
    artists.trackArtistCredits({ artists: ["First, Second"] }).length,
    2,
  );
  const model = load("src/utils/appearanceModel.mjs");
  const desktop = await import(
    require("node:url").pathToFileURL(
      path.join(root, "desktop/src/artworkPalette.mjs"),
    ).href
  );
  for (const color of [
    "#096192",
    "#1171ba",
    "#1399c6",
    "#24aae2",
    "#0e8c7f",
    "#000000",
    "#ffffff",
  ]) {
    assert.equal(
      model.foregroundForAccent(color),
      desktop.foregroundForAccent(color),
    );
    const hydrated = reducer.default(
      appearance,
      reducer.hydrateAppearance({ resolvedAccent: color }),
    );
    assert.equal(hydrated.accentForeground, model.foregroundForAccent(color));
    assert.equal(
      model.effectiveAppearance({
        ...appearance,
        preview: { resolvedAccent: color },
      }).accentForeground,
      model.foregroundForAccent(color),
    );
  }
  assert.equal(
    model.effectiveAppearance(appearance),
    appearance,
    "Stable selector identity without a preview",
  );
  console.log(
    "PASS: history refill before server save, private/account exclusions, out-of-order playlist refresh, filter-specific empty states, identified band links and multi-artist credits, web/desktop foreground parity",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
