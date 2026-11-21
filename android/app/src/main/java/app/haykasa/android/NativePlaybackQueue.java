package app.haykasa.android;

import android.os.Handler;
import android.os.SystemClock;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** One native timeline, with real prepared assets only. All player mutation stays on its looper. */
@androidx.media3.common.util.UnstableApi
final class NativePlaybackQueue {
    interface Resolver {
        JSONObject request(String token, JSONObject body) throws Exception;
    }
    private record Entry(String occurrenceId, String videoId, String title) {}
    private static final class Grant {
        final String token;
        long expiresAt;
        Grant(String token, long expiresAt) { this.token = token; this.expiresAt = expiresAt; }
        String token() { return token; }
        long expiresAt() { return expiresAt; }
    }
    private static final class Asset {
        final Grant grant;
        final JSONObject descriptor;
        final String receipt;
        final long expiresAt;
        boolean errorRetried;
        Asset(Grant grant, String receipt, JSONObject descriptor, boolean retried) throws JSONException {
            this.grant = grant; this.receipt = receipt; this.descriptor = descriptor;
            expiresAt = descriptor.getLong("expiresAt"); errorRetried = retried;
        }
        boolean usable() { return expiresAt > System.currentTimeMillis() + 1000; }
    }
    private static final class SourceFailure extends Exception {
        final String reason;
        SourceFailure(String reason) { this.reason = reason; }
    }
    private static final Set<String> REASONS = Set.of("authentication_required", "rate_limited",
        "service_disabled", "service_unavailable", "source_access_restricted", "source_network_restricted",
        "source_unavailable", "source_timeout", "invalid_receipt");
    private final Handler handler;
    private final ExoPlayer player;
    private final BooleanSupplier desiredIntent;
    private final Runnable onState;
    private final Consumer<String> onFailure;
    private final Consumer<JSONObject> onAssetChanged;
    private final Resolver fixtureResolver;
    private final ExecutorService network = Executors.newSingleThreadExecutor();
    private final ExecutorService cleanup = Executors.newSingleThreadExecutor();
    private final Map<String, Asset> assets = new HashMap<>();
    private record Retry(int attempts, long after, String reason) {}
    private final Map<String, Retry> preparationFailures = new HashMap<>();
    private final Map<String, Grant> grants = new LinkedHashMap<>();
    private List<Entry> entries = List.of();
    private Grant currentGrant;
    private String profile, currentOccurrenceId, pendingOccurrenceId, reason, configuration;
    private long revision;
    private long pendingPosition;
    private long grantRefreshRetryAt;
    private volatile long generation;
    private volatile boolean released;
    private boolean preparing, updatingTimeline, failed;
    private Future<?> operation;
    private Entry operationEntry;
    private Grant operationGrant;
    private volatile HttpURLConnection connection;
    private final Runnable tick = this::work;

    NativePlaybackQueue(Handler handler, ExoPlayer player, BooleanSupplier desiredIntent,
                        Runnable onState, Consumer<String> onFailure, Consumer<JSONObject> onAssetChanged) {
        this(handler, player, desiredIntent, onState, onFailure, onAssetChanged, null);
    }

    NativePlaybackQueue(Handler handler, ExoPlayer player, BooleanSupplier desiredIntent,
                        Runnable onState, Consumer<String> onFailure, Consumer<JSONObject> onAssetChanged,
                        Resolver fixtureResolver) {
        this.handler = handler; this.player = player; this.desiredIntent = desiredIntent;
        this.onState = onState; this.onFailure = onFailure; this.onAssetChanged = onAssetChanged;
        this.fixtureResolver = fixtureResolver;
    }

    void configure(JSONObject message) throws JSONException {
        if (released) throw new IllegalArgumentException("Released queue");
        long nextRevision = positive(message, "revision"), expected = nonnegative(message, "expectedRevision");
        String selected = requiredText(message, "currentOccurrenceId", 160);
        String token = requiredText(message, "nativeGrant", 64);
        String nextProfile = requiredText(message, "profile", 16);
        long grantExpiry = positive(message, "grantExpiresAt");
        JSONArray input = message.optJSONArray("entries");
        if (!token.matches("npr1_[A-Za-z0-9_-]{43}") || !("mp4-aac".equals(nextProfile) || "webm-opus".equals(nextProfile))
            || grantExpiry <= System.currentTimeMillis() || grantExpiry > System.currentTimeMillis() + 3_660_000
            || input == null || input.length() < 1 || input.length() > 100
            || !(message.opt("repeatAll") instanceof Boolean)) throw new IllegalArgumentException("Invalid queue");
        ArrayList<Entry> nextEntries = new ArrayList<>();
        HashSet<String> identities = new HashSet<>();
        for (int index = 0; index < input.length(); index++) {
            JSONObject item = input.getJSONObject(index);
            String occurrence = requiredText(item, "occurrenceId", 160), video = requiredText(item, "videoId", 11);
            String title = requiredText(item, "title", 300);
            if (!occurrence.matches("[A-Za-z0-9:_-]{1,160}") || !video.matches("[A-Za-z0-9_-]{11}")
                || !identities.add(occurrence)) throw new IllegalArgumentException("Invalid queue entry");
            nextEntries.add(new Entry(occurrence, video, title));
        }
        if (!identities.contains(selected)) throw new IllegalArgumentException("Missing selection");
        String signature = nextEntries.toString() + selected + token + grantExpiry + nextProfile + message.getBoolean("repeatAll");
        if (nextRevision == revision && signature.equals(configuration)) { onState.run(); return; }
        if (expected != revision || nextRevision != revision + 1
            || revision > 0 && (!selected.equals(currentOccurrenceId) || !nextProfile.equals(profile))) {
            throw new IllegalArgumentException("Queue revision conflict");
        }
        Map<String, Entry> previous = new HashMap<>();
        for (Entry entry : entries) previous.put(entry.occurrenceId(), entry);
        for (Entry entry : nextEntries) if (assets.containsKey(entry.occurrenceId())
            && previous.containsKey(entry.occurrenceId()) && !previous.get(entry.occurrenceId()).videoId().equals(entry.videoId())) {
            throw new IllegalArgumentException("Occurrence changed source");
        }
        Grant grant = grants.get(token);
        if (grant == null) grant = new Grant(token, grantExpiry);
        else grant.expiresAt = Math.max(grant.expiresAt, grantExpiry);
        Asset initial = null;
        if (revision == 0) {
            MediaItem item = player.getCurrentMediaItem();
            String receipt = requiredText(message, "receipt", 8192);
            long expiry = positive(message, "assetExpiresAt");
            if (item == null || item.localConfiguration == null || !MediaPolicy.isAsset(item.localConfiguration.uri.toString())
                || expiry <= System.currentTimeMillis()) throw new IllegalArgumentException("Initial source missing");
            initial = new Asset(grant, receipt, new JSONObject().put("url", item.localConfiguration.uri.toString())
                .put("expiresAt", expiry), false);
        }
        generation++; cancelOperation();
        for (String identity : new ArrayList<>(assets.keySet())) if (!identities.contains(identity)) retireAsset(assets.remove(identity));
        currentGrant = grant; grants.put(token, grant); profile = nextProfile;
        grantRefreshRetryAt = 0;
        entries = nextEntries; revision = nextRevision; configuration = signature;
        currentOccurrenceId = selected; repeatAll = message.getBoolean("repeatAll");
        pendingOccurrenceId = null; preparing = false; failed = false; reason = null;
        preparationFailures.clear();
        if (initial != null) {
            assets.put(selected, initial);
            updatingTimeline = true;
            try {
                MediaItem item = player.getCurrentMediaItem();
                player.replaceMediaItem(player.getCurrentMediaItemIndex(), item.buildUpon().setMediaId(selected)
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(current().title()).build()).build());
            } finally { updatingTimeline = false; }
        }
        reconcileTimeline(); pruneGrants(); onState.run(); wake();
    }

    private boolean repeatAll;
    boolean isPreparing() { return preparing; }
    JSONObject snapshot() throws JSONException {
        if (revision == 0 || released) return null;
        Entry current = current();
        if (current == null) return null;
        JSONObject value = new JSONObject().put("revision", revision).put("owns", true).put("preparing", preparing)
            .put("currentOccurrenceId", current.occurrenceId()).put("currentVideoId", current.videoId())
            .put("currentTitle", current.title());
        Asset asset = assets.get(currentOccurrenceId);
        if (asset != null && asset.descriptor.optJSONObject("loudness") != null) {
            value.put("loudness", asset.descriptor.optJSONObject("loudness"));
        }
        if (reason != null) value.put("reason", reason);
        return value;
    }

    boolean select(String occurrenceId) {
        Entry selected = find(occurrenceId);
        if (released || revision == 0 || selected == null) return false;
        generation++; cancelOperation(); reason = null; failed = false;
        boolean changed = !selected.occurrenceId().equals(currentOccurrenceId);
        currentOccurrenceId = selected.occurrenceId(); pendingOccurrenceId = selected.occurrenceId(); preparing = true;
        pendingPosition = 0; preparationFailures.remove(currentOccurrenceId);
        if (changed) onAssetChanged.accept(null);
        // Stop silences the previous item without erasing playWhenReady. A newer native
        // Pause/noisy/focus change while preparation is pending remains authoritative.
        player.setPlayWhenReady(desiredIntent.getAsBoolean());
        player.stop();
        Asset ready = assets.get(selected.occurrenceId());
        if (ready != null && ready.usable()) activate(selected, ready, true);
        else { onState.run(); wake(); }
        return true;
    }

    boolean next() { Entry next = neighbor(1); return next != null && select(next.occurrenceId()); }
    boolean previous() {
        if (player.getCurrentPosition() > 3000 && !preparing) { player.seekTo(0); return true; }
        Entry previous = neighbor(-1); return previous != null && select(previous.occurrenceId());
    }
    void onMediaItemTransition(int transitionReason) {
        if (released || revision == 0 || updatingTimeline || preparing) return;
        MediaItem item = player.getCurrentMediaItem();
        Entry selected = item == null ? null : find(item.mediaId);
        if (selected == null || selected.occurrenceId().equals(currentOccurrenceId)) return;
        currentOccurrenceId = selected.occurrenceId(); reason = null; failed = false;
        Asset asset = assets.get(currentOccurrenceId);
        onAssetChanged.accept(asset == null ? null : asset.descriptor);
        onState.run(); wake();
    }
    boolean onEnded() {
        if (released || revision == 0 || preparing || !player.getPlayWhenReady()) return false;
        Entry next = neighbor(1);
        return next != null && select(next.occurrenceId());
    }
    boolean onPlayerError() {
        if (released || revision == 0) return false;
        Asset asset = assets.get(currentOccurrenceId);
        if (asset == null || asset.errorRetried) { fail("source_unavailable"); return true; }
        asset.errorRetried = true;
        generation++; cancelOperation();
        pendingOccurrenceId = currentOccurrenceId; preparing = true;
        pendingPosition = Math.max(0, player.getCurrentPosition());
        onState.run(); start(current(), asset, true);
        return true;
    }

    private void work() {
        if (released || revision == 0 || failed) return;
        if (operation != null) { schedule(1000); return; }
        long now = System.currentTimeMillis();
        if (currentGrant != null && currentGrant.expiresAt() - now <= 300_000
            && SystemClock.elapsedRealtime() >= grantRefreshRetryAt) {
            refreshGrant(currentGrant); return;
        }
        Entry pending = find(pendingOccurrenceId);
        if (pending != null) { start(pending, assets.get(pending.occurrenceId()), false); return; }
        Entry selected = current();
        Asset selectedAsset = selected == null ? null : assets.get(selected.occurrenceId());
        if (selectedAsset != null && !selectedAsset.usable() && exhausted(selected)) {
            fail(preparationFailures.get(selected.occurrenceId()).reason()); return;
        }
        if (selectedAsset != null && selectedAsset.expiresAt - now <= 60_000 && retryReady(selected)) {
            start(selected, selectedAsset, false); return;
        }
        Entry next = neighbor(1);
        if (next != null && !usable(next) && retryReady(next)) {
            start(next, assets.get(next.occurrenceId()), false); return;
        }
        for (Entry entry : entries) {
            Asset asset = assets.get(entry.occurrenceId());
            if (asset != null && asset.expiresAt - now <= 60_000
                && retryReady(entry)) { start(entry, asset, false); return; }
        }
        long delay = 60_000;
        for (Entry entry : entries) {
            Retry retry = preparationFailures.get(entry.occurrenceId());
            if (retry != null && retry.after() != Long.MAX_VALUE) {
                delay = Math.min(delay, Math.max(1000, retry.after() - SystemClock.elapsedRealtime()));
            } else if (retry != null && entry.occurrenceId().equals(currentOccurrenceId)) {
                Asset asset = assets.get(entry.occurrenceId());
                if (asset != null) delay = Math.min(delay, Math.max(1000, asset.expiresAt - now));
            } else if (retry == null) {
                Asset asset = assets.get(entry.occurrenceId());
                if (asset != null) delay = Math.min(delay, Math.max(1000, asset.expiresAt - now - 60_000));
            }
        }
        if (currentGrant != null) delay = Math.min(delay,
            Math.max(1000, Math.max(currentGrant.expiresAt() - now - 300_000,
                grantRefreshRetryAt - SystemClock.elapsedRealtime())));
        schedule(delay);
    }

    private void refreshGrant(Grant grant) {
        final long own = generation;
        operationGrant = grant;
        operation = network.submit(() -> {
            long expiresAt = 0;
            String failure = null;
            try {
                JSONObject reply = request(grant, new JSONObject().put("action", "refreshNativeGrant"), false);
                long candidate = positive(reply, "expiresAt");
                long now = System.currentTimeMillis();
                if (candidate <= now || candidate > now + 3_660_000) throw new SourceFailure("source_unavailable");
                expiresAt = candidate;
            } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
            catch (SourceFailure invalid) { failure = invalid.reason; }
            catch (Exception invalid) { failure = "source_unavailable"; }
            final long refreshedExpiry = expiresAt;
            final String failedReason = failure;
            handler.post(() -> {
                if (released || generation != own) return;
                operation = null; operationGrant = null;
                if (refreshedExpiry > 0) {
                    grant.expiresAt = refreshedExpiry;
                    grantRefreshRetryAt = refreshedExpiry - System.currentTimeMillis() <= 300_000
                        ? SystemClock.elapsedRealtime() + 30_000 : 0;
                } else if ("authentication_required".equals(failedReason)) {
                    fail(failedReason); return;
                } else {
                    // Keep a usable prepared song playing during transient refresh failures.
                    grantRefreshRetryAt = SystemClock.elapsedRealtime() + 30_000;
                }
                wake();
            });
        });
    }

    private void start(Entry entry, Asset existing, boolean errorRecovery) {
        if (entry == null || released) return;
        final long own = generation;
        // Each retained asset keeps its original job grant. A different grant is not
        // an atomic subscriber transfer; revoking the old grant could cancel playback.
        Grant grant = existing == null ? currentGrant : existing.grant;
        boolean create = existing == null;
        if (grant.expiresAt() <= System.currentTimeMillis()) {
            if (currentGrant.expiresAt() <= System.currentTimeMillis()) { fail("authentication_required"); return; }
            grant = currentGrant; create = true;
        }
        final Grant ownGrant = grant;
        final boolean creating = create;
        final String priorReceipt = create ? null : existing.receipt;
        final boolean retried = errorRecovery || existing != null && existing.errorRetried;
        operationEntry = entry; operationGrant = grant;
        operation = network.submit(() -> {
            Asset result = null;
            String failure = null, latestReceipt = priorReceipt;
            try {
                JSONObject body = creating ? new JSONObject().put("action", "create").put("videoId", entry.videoId())
                    .put("mode", "audio").put("profile", profile).put("maxHeight", 1080)
                    : new JSONObject().put("action", "renew").put("receipt", priorReceipt);
                long deadline = SystemClock.elapsedRealtime() + 270_000;
                JSONObject reply = request(ownGrant, body, false);
                latestReceipt = receipt(reply);
                while ("pending".equals(reply.optString("state"))) {
                    checkLive(own);
                    if (SystemClock.elapsedRealtime() >= deadline) throw new SourceFailure("source_timeout");
                    Thread.sleep(1500);
                    reply = request(ownGrant, new JSONObject().put("action", "poll").put("receipt", latestReceipt), false);
                    latestReceipt = receipt(reply);
                }
                if (!"ready".equals(reply.optString("state"))) throw new SourceFailure(safeReason(reply.optString("reason")));
                JSONObject descriptor = reply.getJSONObject("asset");
                if (!MediaPolicy.isAsset(descriptor.optString("url")) || descriptor.optLong("expiresAt") <= System.currentTimeMillis()) {
                    throw new SourceFailure("source_unavailable");
                }
                result = new Asset(ownGrant, latestReceipt, descriptor, retried);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } catch (SourceFailure invalid) { failure = invalid.reason; }
            catch (Exception invalid) { failure = "source_unavailable"; }
            final Asset resolved = result;
            final String failedReason = failure, resolvedReceipt = latestReceipt;
            handler.post(() -> {
                if (released || own != generation) {
                    if (creating && resolvedReceipt != null) cancel(ownGrant, resolvedReceipt);
                    return;
                }
                operation = null; operationEntry = null; operationGrant = null;
                if (resolved == null) {
                    if (creating && resolvedReceipt != null) cancel(ownGrant, resolvedReceipt);
                    String reason = safeReason(failedReason);
                    if (entry.occurrenceId().equals(currentOccurrenceId)
                        && (pendingOccurrenceId != null || errorRecovery || existing == null
                            || !existing.usable() || "authentication_required".equals(reason))) fail(reason);
                    else {
                        // A transient failed renewal must not interrupt still-usable audio.
                        Retry previous = preparationFailures.get(entry.occurrenceId());
                        int attempts = previous == null ? 1 : previous.attempts() + 1;
                        preparationFailures.put(entry.occurrenceId(), new Retry(attempts,
                            attempts >= 3 ? Long.MAX_VALUE : SystemClock.elapsedRealtime() + 5_000, reason));
                        wake();
                    }
                    return;
                }
                preparationFailures.remove(entry.occurrenceId());
                Asset previous = assets.put(entry.occurrenceId(), resolved);
                if (previous != null && previous.grant != resolved.grant) retireAsset(previous);
                if (entry.occurrenceId().equals(currentOccurrenceId)) activate(entry, resolved, pendingOccurrenceId != null);
                else { reconcileTimeline(); onState.run(); }
                pruneGrants(); wake();
            });
        });
    }

    private void activate(Entry entry, Asset asset, boolean restart) {
        boolean playing = player.getPlayWhenReady();
        long position = restart ? pendingPosition : Math.max(0, player.getCurrentPosition());
        onAssetChanged.accept(asset.descriptor);
        reconcileTimeline();
        int index = timelineIndex(entry.occurrenceId());
        if (index < 0) { fail("source_unavailable"); return; }
        updatingTimeline = true;
        try {
            player.seekTo(index, position);
            if (player.getPlaybackState() == Player.STATE_IDLE) player.prepare();
            player.setPlayWhenReady(playing);
        } finally { updatingTimeline = false; }
        pendingOccurrenceId = null; preparing = false; reason = null;
        onState.run(); wake();
    }

    private void reconcileTimeline() {
        if (released || revision == 0 || !assets.containsKey(currentOccurrenceId)) return;
        int middle = indexOf(currentOccurrenceId), from = middle, to = middle;
        while (from > 0 && usable(entries.get(from - 1))) from--;
        while (to + 1 < entries.size() && usable(entries.get(to + 1))) to++;
        List<Entry> materialized = entries.subList(from, to + 1);
        Set<String> keep = new HashSet<>();
        for (Entry entry : materialized) keep.add(entry.occurrenceId());
        updatingTimeline = true;
        try {
            for (int index = player.getMediaItemCount() - 1; index >= 0; index--) {
                if (!keep.contains(player.getMediaItemAt(index).mediaId)) player.removeMediaItem(index);
            }
            for (int index = 0; index < materialized.size(); index++) {
                Entry entry = materialized.get(index);
                Asset asset = assets.get(entry.occurrenceId());
                MediaItem desired = new MediaItem.Builder().setMediaId(entry.occurrenceId())
                    .setUri(asset.descriptor.optString("url"))
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(entry.title()).build()).build();
                int existing = timelineIndex(entry.occurrenceId());
                if (existing < 0) player.addMediaItem(index, desired);
                else {
                    if (existing != index) player.moveMediaItem(existing, index);
                    if (!desired.equals(player.getMediaItemAt(index))) player.replaceMediaItem(index, desired);
                }
            }
        } finally { updatingTimeline = false; }
    }

    private JSONObject request(Grant grant, JSONObject body, boolean retiring) throws Exception {
        if (!retiring && (released || Thread.currentThread().isInterrupted())) throw new InterruptedException();
        if (fixtureResolver != null) return fixtureResolver.request(grant.token(), body);
        HttpURLConnection own = (HttpURLConnection)new URL(MediaPolicy.ORIGIN + "/api/media/resolve").openConnection();
        if (!retiring) connection = own;
        try {
            own.setInstanceFollowRedirects(false); own.setConnectTimeout(15_000); own.setReadTimeout(15_000);
            own.setRequestMethod("POST"); own.setDoOutput(true);
            own.setRequestProperty("Authorization", "Bearer " + grant.token());
            own.setRequestProperty("Content-Type", "application/json");
            own.setRequestProperty("Accept", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            own.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream output = own.getOutputStream()) { output.write(bytes); }
            int status = own.getResponseCode();
            if (status >= 300 && status < 400) throw new SourceFailure("authentication_required");
            InputStream stream = status >= 400 ? own.getErrorStream() : own.getInputStream();
            if (stream == null) throw new SourceFailure("source_unavailable");
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (InputStream input = stream) {
                byte[] block = new byte[4096]; int count;
                while ((count = input.read(block)) != -1) {
                    if (buffer.size() + count > 65_536) throw new SourceFailure("source_unavailable");
                    buffer.write(block, 0, count);
                }
            }
            JSONObject value = new JSONObject(buffer.toString(StandardCharsets.UTF_8.name()));
            if (status < 200 || status >= 300) throw new SourceFailure(status == 401 || status == 403
                ? "authentication_required" : safeReason(value.optString("reason")));
            return value;
        } finally { own.disconnect(); if (!retiring) connection = null; }
    }

    void release() {
        if (released) return;
        released = true; generation++; handler.removeCallbacks(tick); cancelOperation();
        assets.clear(); preparationFailures.clear(); entries = List.of();
        for (Grant grant : grants.values()) revoke(grant);
        grants.clear(); network.shutdownNow(); cleanup.shutdown();
    }
    private void cancelOperation() {
        if (operation != null) operation.cancel(true);
        HttpURLConnection active = connection;
        if (active != null) active.disconnect();
        operation = null; operationEntry = null; operationGrant = null;
    }
    private void retireAsset(Asset asset) { if (asset != null) cancel(asset.grant, asset.receipt); }
    private void cancel(Grant grant, String receipt) {
        if (cleanup.isShutdown()) return;
        cleanup.execute(() -> { try { request(grant, new JSONObject().put("action", "cancel").put("receipt", receipt), true); }
            catch (Exception ignored) { /* Revocation/expiry is still checked by the server. */ } });
    }
    private void revoke(Grant grant) {
        if (cleanup.isShutdown()) return;
        cleanup.execute(() -> { try { request(grant, new JSONObject().put("action", "revokeNativeGrant"), true); }
            catch (Exception ignored) { /* A retired grant is never reused locally. */ } });
    }
    private void pruneGrants() {
        Set<String> keep = new HashSet<>();
        if (currentGrant != null) keep.add(currentGrant.token());
        if (operationGrant != null) keep.add(operationGrant.token());
        for (Asset asset : assets.values()) keep.add(asset.grant.token());
        for (String token : new ArrayList<>(grants.keySet())) if (!keep.contains(token)) revoke(grants.remove(token));
    }
    private void fail(String value) {
        if (released) return;
        reason = safeReason(value); failed = true; preparing = false; pendingOccurrenceId = null;
        handler.removeCallbacks(tick); onFailure.accept(reason); onState.run();
    }
    private void wake() { handler.removeCallbacks(tick); handler.post(tick); }
    private void schedule(long delay) { handler.removeCallbacks(tick); handler.postDelayed(tick, delay); }
    private void checkLive(long own) throws InterruptedException {
        if (released || generation != own || Thread.currentThread().isInterrupted()) throw new InterruptedException();
    }
    private Entry current() { return find(currentOccurrenceId); }
    private Entry find(String identity) { int index = indexOf(identity); return index < 0 ? null : entries.get(index); }
    private int indexOf(String identity) {
        for (int index = 0; index < entries.size(); index++) if (entries.get(index).occurrenceId().equals(identity)) return index;
        return -1;
    }
    private Entry neighbor(int direction) {
        int index = indexOf(currentOccurrenceId);
        if (index < 0) return null;
        int next = index + direction;
        if (next < 0 || next >= entries.size()) return repeatAll ? entries.get(direction > 0 ? 0 : entries.size() - 1) : null;
        return entries.get(next);
    }
    private boolean usable(Entry entry) { Asset asset = assets.get(entry.occurrenceId()); return asset != null && asset.usable(); }
    private boolean retryReady(Entry entry) {
        Retry retry = preparationFailures.get(entry.occurrenceId());
        return retry == null || SystemClock.elapsedRealtime() >= retry.after();
    }
    private boolean exhausted(Entry entry) {
        Retry retry = preparationFailures.get(entry.occurrenceId());
        return retry != null && retry.after() == Long.MAX_VALUE;
    }
    private int timelineIndex(String identity) {
        for (int index = 0; index < player.getMediaItemCount(); index++) if (identity.equals(player.getMediaItemAt(index).mediaId)) return index;
        return -1;
    }
    private static String receipt(JSONObject reply) throws SourceFailure {
        Object value = reply.opt("receipt");
        if (!(value instanceof String) || ((String)value).isEmpty() || ((String)value).length() > 8192) throw new SourceFailure("source_unavailable");
        return (String)value;
    }
    private static String requiredText(JSONObject value, String key, int limit) {
        Object raw = value.opt(key);
        if (!(raw instanceof String) || ((String)raw).isEmpty() || ((String)raw).length() > limit) throw new IllegalArgumentException("Invalid queue text");
        return (String)raw;
    }
    private static long positive(JSONObject value, String key) { long result = nonnegative(value, key); if (result == 0) throw new IllegalArgumentException("Invalid queue counter"); return result; }
    private static long nonnegative(JSONObject value, String key) {
        Object raw = value.opt(key);
        if (!(raw instanceof Number)) throw new IllegalArgumentException("Invalid queue number");
        double number = ((Number)raw).doubleValue();
        if (!Double.isFinite(number) || number < 0 || number > OrderedTransport.MAX || number != Math.rint(number)) throw new IllegalArgumentException("Invalid queue number");
        return (long)number;
    }
    private static String safeReason(String value) { return value != null && REASONS.contains(value) ? value : "source_unavailable"; }
}
