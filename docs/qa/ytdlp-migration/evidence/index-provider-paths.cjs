// Reproducible tracked-file inventory. Does not load application code or secrets.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const known = new Set(files);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const pattern = /youtube|youtu\.be|googlevideo|ytimg|youtubei|iframe_api|\bIFrame\b/ig;
const code = /\.(?:[cm]?js|jsx|tsx?|py|java|html)$/;
const text = /\.(?:[cm]?js|jsx|tsx?|py|java|html|css|json|md|ya?ml|toml|gradle|properties|xml|txt|sh|ps1)$/;
const excluded = f => /(?:^|\/)(?:package-lock\.json|[^/]+\.lock|LICENSE)$/.test(f)
  || /^docs\/qa\/ytdlp-migration\/(?:inventory[^/]*|call-map|evidence\/[^/]+)\.json$/.test(f)
  || /(?:^|\/)\.env(?:\.|$)/.test(f) && f !== '.env.example';
const runtime = f => /^(?:src|desktop\/src|android\/app\/src\/main|media-service\/app|scripts)\//.test(f)
  || ['next.config.js', 'vercel.json', 'package.json', 'desktop/package.json', 'contracts/desktop.json', 'android/app/build.gradle'].includes(f);
const classify = f => f === 'media-service/app/jobs.py' ? 'yt_dlp_acquisition_boundary'
  : /(?:^|\/)(?:docs\/qa|androidTest|test|tests)\//.test(f) || /(?:check|smoke|probe|verify)/.test(path.basename(f)) ? 'verification'
  : f.endsWith('.md') ? 'documentation'
  : runtime(f) ? 'runtime_or_configuration' : 'build_or_other_text';
const imports = [], apiReferences = [], direct = [], unresolvedLocalImports = [];
const codeFiles = [];
const apiRoutes = new Map(files.filter(f => /^src\/app\/api\/.+\/route\.[jt]s$/.test(f))
  .map(f => [f.replace(/^src\/app/, '').replace(/\/route\.[jt]s$/, ''), f]));
const resolve = (from, spec) => {
  const base = spec.startsWith('@/') ? 'src/' + spec.slice(2)
    : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)) : null;
  if (!base) return null;
  return [base, ...['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css'].map(e => base + e),
    ...['.js', '.jsx', '.mjs', '.ts', '.tsx'].map(e => base + '/index' + e)].find(f => known.has(f));
};

for (const file of files) {
  if ((!text.test(file) && file !== '.env.example') || excluded(file)) continue;
  const bytes = fs.readFileSync(path.join(root, file));
  if (bytes.includes(0)) continue;
  const contents = bytes.toString('utf8'), lines = contents.split(/\r?\n/);
  const hits = lines.flatMap((line, i) => {
    pattern.lastIndex = 0;
    return pattern.test(line) ? [i + 1] : [];
  });
  if (hits.length || /youtube/i.test(file)) direct.push({ path: file, category: classify(file),
    lines: hits, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), status: 'pending' });
  if (runtime(file) && code.test(file)) codeFiles.push(file);
  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
    const add = (node, spec, kind) => {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const dependency = resolve(file, spec);
      if (dependency) imports.push({ caller: file, line, dependency, kind });
      else if (spec.startsWith('.') || spec.startsWith('@/')) unresolvedLocalImports.push({ caller: file, line, spec, kind });
    };
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier))
        add(node, node.moduleSpecifier.text, ts.isImportDeclaration(node) ? 'import' : 're-export');
      if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0])
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        add(node, node.arguments[0].text, node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import' : 'require');
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (let i = 0; i < lines.length; i++) {
    for (const hit of lines[i].matchAll(/\/api\/[a-zA-Z0-9_/-]+/g)) {
      const route = hit[0].replace(/\/$/, '');
      apiReferences.push({ caller: file, line: i + 1, route, handler: apiRoutes.get(route) || null });
    }
  }
}
const scope = new Set(direct.filter(f => runtime(f.path)).map(f => f.path));
// This is an import-connected review set, not a claim that all files need edits.
let changed = true;
while (changed) {
  changed = false;
  for (const edge of imports) if (runtime(edge.caller) && runtime(edge.dependency)
    && (scope.has(edge.caller) || scope.has(edge.dependency))) {
    for (const f of [edge.caller, edge.dependency]) if (!scope.has(f)) { scope.add(f); changed = true; }
  }
}
const boundaries = [
  { from: 'src/hooks/useDesktopPlaybackBridge.js', via: 'heykasaDesktop playback IPC', to: 'desktop/src/preload.cjs' },
  { from: 'desktop/src/preload.cjs', via: 'ipcRenderer / ipcMain playback and OS commands', to: 'desktop/src/main.mjs' },
  { from: 'desktop/src/miniPreload.cjs', via: 'mini-player command/state IPC', to: 'desktop/src/main.mjs' },
  { from: 'desktop/src/main.mjs', via: 'mini-player document and state delivery', to: 'desktop/src/miniPlayer.html' },
  { from: 'src/components/MusicPlayer/media/androidAudioElement.mjs', via: 'WebMessage trusted document attachment and native events', to: 'android/app/src/main/java/app/haykasa/android/MainActivity.java' },
  { from: 'android/app/src/main/java/app/haykasa/android/MainActivity.java', via: 'service command and event sink', to: 'android/app/src/main/java/app/haykasa/android/PlaybackService.java' },
  { from: 'android/app/src/main/java/app/haykasa/android/PlaybackService.java', via: 'ordered capability/bind/control', to: 'android/app/src/main/java/app/haykasa/android/OrderedMediaBridge.java' },
  { from: 'android/app/src/main/java/app/haykasa/android/SessionTransportPlayer.java', via: 'MediaSession Play/Pause/Stop', to: 'android/app/src/main/java/app/haykasa/android/PlaybackService.java' },
  { from: 'src/utils/mediaService.mjs', via: 'authenticated private Vercel service binding', to: 'media-service/app/vercel_app.py' },
  { from: 'media-service/app/vercel_app.py', via: 'bounded preparation, private Blob persistence and signed leases', to: 'media-service/app/jobs.py' },
  { from: 'src/utils/jamSignedChannel.mjs', via: '/api/jam/events authorization/signature and persisted occurrence identity', to: 'src/app/api/jam/events/route.js' },
];
for (const b of boundaries) for (const f of [b.from, b.to]) {
  if (!known.has(f)) throw Error('Boundary does not exist: ' + f);
  scope.add(f);
}
const policyAndPackagingPaths = [
  'next.config.js', 'vercel.json', 'src/sw.js', 'src/app/layout.js',
  'media-service/requirements.txt', 'media-service/requirements.vercel.txt',
  'media-service/Dockerfile', 'media-service/Dockerfile.vercel',
  'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/java/app/haykasa/android/MediaPolicy.java',
  'android/app/src/main/java/app/haykasa/android/PlayAppUpdater.java',
  'android/app/src/test/java/app/haykasa/android/MediaPolicyTest.java',
  'desktop/package.json', 'contracts/desktop.json', 'desktop/src/artworkPalette.mjs',
  'desktop/src/generated/desktopContract.mjs', 'src/generated/desktopContract.mjs',
  'src/utils/mediaReceipts.mjs', 'src/utils/sessionAuth.js', 'src/utils/trustedOrigin.js',
  'src/utils/rateLimit.js', 'src/utils/playbackSnapshot.mjs', 'src/utils/jamRooms.mjs',
  'src/utils/jamAuthorization.mjs', 'src/utils/jamSigning.js', 'src/models/JamRoom.js',
];
for (const f of policyAndPackagingPaths) {
  if (!known.has(f)) throw Error('Policy/packaging path does not exist: ' + f);
  scope.add(f);
}
for (const edge of unresolvedLocalImports) {
  edge.classification = edge.caller === 'docs/qa/audio-quality/browser.cjs' ? 'virtual_fixture_loader'
    : edge.spec.includes('node_modules/') ? 'external_dependency_outside_tracked_tree' : 'needs_review';
}
const result = { schemaVersion: 1, sourceCommit,
  scanContent: 'Tracked working-tree bytes at scan time; sourceCommit is the base. Direct candidates carry SHA256 hashes. Pending review edits are listed explicitly.',
  workingTreeModifiedPaths: execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  scannedTrackedFiles: files.length,
  scope: 'Tracked text/code/configuration paths and static JS/TS imports plus named HTTP and manual cross-process boundaries. Locks, binary files, credential files and generated QA inventories excluded.',
  sourceDecision: 'Replace application-owned embeds, SDK, Data API and youtubei.js with yt-dlp. Preserve saved identities/library and guest behavior. Acquisition URLs consumed by yt-dlp are distinct from direct application provider integrations.',
  counts: { direct: direct.length, runtimeDirect: direct.filter(f => runtime(f.path)).length,
    runtimeCodeFiles: codeFiles.length, importEdges: imports.length, apiReferences: apiReferences.length,
    importConnectedReviewPaths: scope.size, unresolvedLocalImports: unresolvedLocalImports.length },
  direct, runtimeCodeFiles: codeFiles.sort(), imports, apiReferences, manualBoundaries: boundaries, policyAndPackagingPaths,
  importConnectedReviewPaths: [...scope].sort(), unresolvedLocalImports,
  limitations: ['Static index is not a complete dynamic execution trace or unused-code proof.',
    'Generic shared helpers connect otherwise unrelated consumers; review membership does not mean removal.',
    'Java/Python semantic relationships are supplemented by code-only Graphify maps; IPC/session/HTTP paths need runtime evidence.',
    'Historical documentation/test fixtures remain evidence and must not be deleted to fabricate zero references.',
    'Production source playback is disabled; repeated deployed extraction/decoding remains a gate before switching playback.'] };
const destination = path.resolve(process.argv[2] || path.join(__dirname, '../inventory-current.json'));
fs.writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sourceCommit, ...result.counts, destination }));
