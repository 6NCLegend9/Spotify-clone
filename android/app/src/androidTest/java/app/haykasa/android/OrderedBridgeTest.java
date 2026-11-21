package app.haykasa.android;

import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import androidx.media3.datasource.ByteArrayDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaController;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ServiceTestRule;
import com.google.common.util.concurrent.ListenableFuture;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual service/codec/session tests using local PCM bytes, never provider extraction. */
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class OrderedBridgeTest {
    @Rule public final ServiceTestRule services = new ServiceTestRule();
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Object attachment = new Object();
    private final List<JSONObject> packets = new CopyOnWriteArrayList<>();
    private PlaybackService service;
    private JSONObject binding;
    private String id, engine, bindingId;
    private MediaController controller;
    private boolean lastCommandNeedsUpdate;
    private static String uuid() { return UUID.randomUUID().toString(); }
    private void main(Runnable run) { InstrumentationRegistry.getInstrumentation().runOnMainSync(run); }

    @Before public void connect() throws Exception {
        service = ((PlaybackService.LocalBinder)services.bindService(new Intent(context, PlaybackService.class)
            .setAction("app.haykasa.android.BIND"))).service();
    }
    @After public void close() {
        main(() -> { if (controller != null) controller.release(); if (service != null) service.releaseAll(); });
    }
    private void send(JSONObject command) {
        send(command, attachment);
    }
    private void send(JSONObject command, Object sender) {
        main(() -> {
            try {
                lastCommandNeedsUpdate = service.command(command, json -> {
                    try { packets.add(new JSONObject(json)); }
                    catch (Exception error) { throw new AssertionError("Native producer emitted invalid JSON", error); }
                }, sender);
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }
    private JSONObject last(String event) {
        return last(event, id);
    }
    private JSONObject last(String event, String loadId) {
        for (int index = packets.size() - 1; index >= 0; index--) {
            JSONObject value = packets.get(index);
            if (loadId.equals(value.optString("id")) && event.equals(value.optString("event"))) return value;
        }
        throw new AssertionError("Missing native event " + event);
    }
    private JSONObject scope() throws Exception { return new JSONObject().put("version", 2).put("engineId", engine).put("bindingId", bindingId); }
    private JSONObject request(String action) throws Exception {
        return new JSONObject().put("id", id).put("action", action).put("requestId", uuid()).put("transport", scope());
    }
    private JSONObject hello() throws Exception {
        return new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid())
            .put("supportedTransportVersions", new JSONArray().put(2).put(1));
    }
    private JSONObject proposedBind(JSONObject caps, String next, String expected) throws Exception {
        return new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", next)
            .put("expectedBindingId", expected == null ? JSONObject.NULL : expected)
            .put("bindGrant", caps.getString("bindGrant"));
    }
    private OrderedMediaBridge bridge() throws Exception {
        Field field = PlaybackService.class.getDeclaredField("ordered"); field.setAccessible(true);
        return (OrderedMediaBridge)field.get(service);
    }
    private void bootstrap() throws Exception {
        id = "audio_" + uuid();
        send(hello());
        JSONObject caps = last("transportCapabilities");
        assertEquals("ordered-transport-v2", caps.getString("capability"));
        assertEquals(2, caps.getInt("version"));
        assertTrue(caps.getInt("nativeBuildCode") > 0);
        assertTrue(caps.isNull("currentBindingId"));
        engine = caps.getString("engineId"); bindingId = caps.getString("issuedBindingId");
        binding = new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", JSONObject.NULL).put("bindGrant", caps.getString("bindGrant"));
        send(binding);
        JSONObject state = last("transportState").getJSONObject("transport");
        assertEquals(1, state.getLong("eventSeq"));
        assertEquals(binding.getString("requestId"), state.getString("replyTo"));
        assertEquals(0, state.getJSONObject("snapshot").getLong("processedWebRevision"));
    }
    private void load() throws Exception {
        Field factory = PlaybackService.class.getDeclaredField("sourceFactory"); factory.setAccessible(true);
        byte[] pcm = tone();
        main(() -> {
            try { ((DefaultMediaSourceFactory)factory.get(service)).setDataSourceFactory(() -> new ByteArrayDataSource(pcm)); }
            catch (Exception error) { throw new AssertionError(error); }
        });
        send(request("load").put("title", "Local transport fixture")
            .put("url", MediaPolicy.ORIGIN + "/v1/assets/00000000000000000000000000000000"));
        assertEquals("accepted", last("transportControlAck").getString("phase"));
    }
    private void transport(String action, long revision) throws Exception {
        send(new JSONObject().put("id", id).put("action", action).put("transport", scope().put("webRevision", revision)));
    }
    private JSONObject snapshot() { return last("transportState").optJSONObject("transport").optJSONObject("snapshot"); }
    private boolean hasResult(long revision, String phase) {
        for (JSONObject packet : packets) {
            if (!id.equals(packet.optString("id"))) continue;
            JSONObject transport = packet.optJSONObject("transport");
            JSONObject result = transport == null ? null : transport.optJSONObject("result");
            if (result != null && result.optLong("webRevision") == revision && phase.equals(result.optString("phase"))) return true;
        }
        return false;
    }
    private void waitFor(BooleanSupplier condition) throws Exception {
        for (int attempt = 0; attempt < 200; attempt++) { if (condition.getAsBoolean()) return; Thread.sleep(50); }
        fail("Native transport condition did not settle");
    }
    @SuppressWarnings("unchecked") private ExoPlayer raw() throws Exception {
        Field players = PlaybackService.class.getDeclaredField("players"); players.setAccessible(true);
        return ((Map<String, ExoPlayer>)players.get(service)).get(id);
    }

    @Test public void nativeQueueRenewsAndAdvancesBetweenDuplicateOccurrences() throws Exception {
        bootstrap(); load();
        ExoPlayer player = raw();
        var actions = new CopyOnWriteArrayList<String>();
        var renewAttempts = new java.util.concurrent.atomic.AtomicInteger();
        var createAttempts = new java.util.concurrent.atomic.AtomicInteger();
        var occurrence = new AtomicReference<String>();
        var failure = new AtomicReference<String>();
        var queueRef = new AtomicReference<NativePlaybackQueue>();
        long now = System.currentTimeMillis();
        JSONObject first = new JSONObject().put("occurrenceId", "first").put("videoId", "synthetic01").put("title", "First");
        JSONObject second = new JSONObject().put("occurrenceId", "second").put("videoId", "synthetic01").put("title", "Second");
        JSONObject configuration = new JSONObject().put("revision", 1).put("expectedRevision", 0)
            .put("currentOccurrenceId", "first").put("nativeGrant", "npr1_" + "a".repeat(43))
            .put("grantExpiresAt", now + 240_000).put("profile", "mp4-aac").put("repeatAll", false)
            .put("receipt", "initial").put("assetExpiresAt", now + 30_000)
            .put("entries", new JSONArray().put(first).put(second));
        try {
            main(() -> {
                NativePlaybackQueue queue = new NativePlaybackQueue(new android.os.Handler(Looper.getMainLooper()), player,
                    player::getPlayWhenReady, () -> {
                        try { occurrence.set(queueRef.get().snapshot().optString("currentOccurrenceId")); }
                        catch (Exception error) { throw new AssertionError(error); }
                    }, failure::set, ignored -> {}, (token, request) -> {
                        String action = request.getString("action");
                        if (!action.equals("cancel")) actions.add(action);
                        if (action.equals("refreshNativeGrant")) {
                            return new JSONObject().put("expiresAt", System.currentTimeMillis() + 600_000);
                        }
                        if (action.equals("renew")) assertEquals("initial", request.getString("receipt"));
                        if (action.equals("create")) assertEquals("synthetic01", request.getString("videoId"));
                        if (action.equals("renew") && renewAttempts.incrementAndGet() == 1
                            || action.equals("create") && createAttempts.incrementAndGet() == 1) {
                            return new JSONObject().put("state", "failed").put("reason", "source_unavailable")
                                .put("receipt", action + "-failed");
                        }
                        return new JSONObject().put("state", "ready").put("receipt", action + "-receipt")
                            .put("asset", new JSONObject().put("expiresAt", System.currentTimeMillis() + 600_000)
                                .put("url", MediaPolicy.ORIGIN + "/v1/assets/00000000000000000000000000000001"));
                    });
                queueRef.set(queue);
                player.addListener(new androidx.media3.common.Player.Listener() {
                    @Override public void onMediaItemTransition(androidx.media3.common.MediaItem item, int reason) {
                        queue.onMediaItemTransition(reason);
                    }
                });
                try { queue.configure(configuration); } catch (Exception error) { throw new AssertionError(error); }
            });
            var prepared = new java.util.concurrent.atomic.AtomicBoolean();
            waitFor(() -> {
                main(() -> prepared.set(player.getMediaItemCount() == 2 && player.getDuration() > 0));
                return prepared.get();
            });
            assertEquals(List.of("refreshNativeGrant", "renew", "create", "renew", "create"), actions);
            assertEquals("first", occurrence.get());
            main(() -> player.seekTo(player.getDuration() - 300));
            transport("play", 1);
            waitFor(() -> "second".equals(occurrence.get()));
            waitFor(() -> {
                main(() -> prepared.set(player.isPlaying() && player.getCurrentPosition() > 100));
                return prepared.get();
            });
            assertNull(failure.get());
        } finally {
            main(() -> { if (queueRef.get() != null) queueRef.get().release(); });
        }
    }

    @SuppressWarnings("unchecked") private NativeAudioProcessor processor() throws Exception {
        Field field = PlaybackService.class.getDeclaredField("processors"); field.setAccessible(true);
        return ((Map<String, NativeAudioProcessor>)field.get(service)).get(id);
    }
    private JSONObject processing(boolean bypass) throws Exception {
        return request("configureAudio").put("bypass", bypass).put("mono", true)
            .put("bands", new JSONArray().put(0).put(0).put(6).put(0).put(0).put(0));
    }
    private void processingError(JSONObject command, String reason, Object sender) throws Exception {
        send(command, sender);
        JSONObject error = last("transportControlError");
        assertEquals(reason, error.getString("reason"));
        JSONObject correlation = error.getJSONObject("correlation");
        assertEquals("configureAudio", correlation.getString("action"));
        assertEquals(command.getString("requestId"), correlation.getString("requestId"));
        assertEquals(command.getJSONObject("transport").getString("bindingId"),
            correlation.getJSONObject("attemptedScope").getString("bindingId"));
    }
    @Test public void scopedAudioProcessingConsumesDecodedPcmAndRejectsRetiredAuthority() throws Exception {
        bootstrap();
        assertEquals("pcm-eq-v1", last("transportCapabilities").getString("audioProcessing"));
        processingError(processing(false), "UNAVAILABLE", attachment);
        load();
        for (Object value : new Object[]{"6", 12.1, JSONObject.NULL}) {
            processingError(processing(false).put("bands", new JSONArray().put(0).put(0).put(value).put(0).put(0).put(0)),
                "INVALID_VALUE", attachment);
        }
        processingError(processing(false).put("mono", "true"), "INVALID_VALUE", attachment);
        send(processing(false));
        assertEquals("configureAudio", last("transportControlAck").getString("action"));
        assertEquals("completed", last("transportControlAck").getString("phase"));
        NativeAudioProcessor dsp = processor();
        transport("play", 1);
        waitFor(() -> dsp.stats().frames() > 4800 && dsp.stats().processingActive());
        NativeAudioProcessor.Stats measured = dsp.stats();
        assertEquals(48000, measured.sampleRate()); assertEquals(2, measured.channelCount());
        assertFalse(measured.original());
        assertTrue(measured.inputSamplePeak() > 0); assertTrue(measured.outputSamplePeak() > 0);
        assertTrue(measured.headroomGain() < 1);
        ExoPlayer current = raw();
        AtomicReference<android.media.session.MediaController> platform = new AtomicReference<>();
        main(() -> platform.set(new android.media.session.MediaController(context,
            service.getSessions().get(0).getPlatformToken())));
        platform.get().getTransportControls().stop();
        AtomicReference<Boolean> stopped = new AtomicReference<>(false);
        waitFor(() -> {
            main(() -> stopped.set(current.getPlaybackState() == androidx.media3.common.Player.STATE_IDLE
                && !current.getPlayWhenReady()));
            return stopped.get();
        });
        transport("play", 2);
        waitFor(() -> hasResult(2, "completed") && dsp.stats().frames() > 4800 && dsp.stats().processingActive());
        assertSame(current, raw()); assertSame(dsp, processor());
        assertFalse(dsp.stats().original()); assertTrue(dsp.stats().headroomGain() < 1);
        JSONObject retired = processing(true);
        String oldBinding = bindingId;
        send(hello());
        JSONObject caps = last("transportCapabilities"); bindingId = caps.getString("issuedBindingId");
        send(proposedBind(caps, bindingId, oldBinding));
        processingError(retired, "INVALID_SCOPE", attachment);
        processingError(processing(true), "INVALID_SCOPE", new Object());
        long before = dsp.stats().frames();
        waitFor(() -> dsp.stats().frames() > before);
        assertTrue(dsp.stats().processingActive()); assertFalse(dsp.stats().original());
        send(processing(true));
        waitFor(() -> dsp.stats().original() && !dsp.stats().processingActive());
        send(request("release"));
        assertNull(processor());
    }

    @Test public void measuredNormalizationIsValidatedAndConsumesDecodedPcm() throws Exception {
        bootstrap(); load();
        assertEquals("ebu-r128-v1", last("transportCapabilities").getString("measuredLoudness"));
        JSONObject command = processing(false).put("mono", false).put("bands", new JSONArray(new double[6]))
            .put("normalizeLoudness", true)
            .put("loudness", new JSONObject().put("integratedLufs", -10).put("truePeakDbfs", -3));
        processingError(new JSONObject(command.toString()).put("normalizeLoudness", "true"), "INVALID_VALUE", attachment);
        processingError(new JSONObject(command.toString()).put("loudness", new JSONObject().put("integratedLufs", -70).put("truePeakDbfs", -3)), "INVALID_VALUE", attachment);
        send(command);
        NativeAudioProcessor dsp = processor();
        transport("play", 1);
        double expected = Math.pow(10, -4.0 / 20);
        waitFor(() -> dsp.stats().frames() > 4800 && Math.abs(dsp.stats().normalizationGain() - expected) < 1e-12);
        assertTrue(dsp.stats().processingActive());
        assertTrue(dsp.stats().inputSamplePeak() > dsp.stats().outputSamplePeak());
        send(processing(false).put("mono", false).put("bands", new JSONArray(new double[6]))
            .put("normalizeLoudness", true).put("loudness", JSONObject.NULL));
        waitFor(() -> dsp.stats().frames() > 4800 && dsp.stats().normalizationGain() == 1 && !dsp.stats().processingActive());
    }

    @Test public void repeatOneLoopsWithoutWebCommandsAndPreservesPauseAndBindingAuthority() throws Exception {
        bootstrap();
        assertEquals("one-v1", last("transportCapabilities").getString("nativeRepeat"));
        send(request("repeatOne").put("enabled", true));
        assertEquals("UNAVAILABLE", last("transportControlError").getString("reason"));
        load();
        send(request("repeatOne").put("enabled", "true"));
        assertEquals("INVALID_VALUE", last("transportControlError").getString("reason"));
        send(request("repeatOne").put("enabled", true), new Object());
        assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason"));
        JSONObject retired = request("repeatOne").put("enabled", false);
        send(request("repeatOne").put("enabled", true));
        assertEquals("repeatOne", last("transportControlAck").getString("action"));
        assertEquals("completed", last("transportControlAck").getString("phase"));
        main(() -> {
            try {
                Field wrappers = PlaybackService.class.getDeclaredField("wrappers"); wrappers.setAccessible(true);
                SessionTransportPlayer wrapper = (SessionTransportPlayer)((Map<?, ?>)wrappers.get(service)).get(id);
                assertFalse(wrapper.isCommandAvailable(androidx.media3.common.Player.COMMAND_SET_REPEAT_MODE));
            } catch (Exception error) { throw new AssertionError(error); }
        });
        transport("pause", 1);
        assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
        waitFor(() -> packets.stream().anyMatch(packet -> id.equals(packet.optString("id")) && "ready".equals(packet.optString("event"))));
        send(request("seek").put("value", 29.6));
        transport("play", 2);
        // No renderer commands follow Play: Media3 must perform the actual wrap.
        waitFor(() -> packets.stream().anyMatch(packet -> id.equals(packet.optString("id")) && packet.optBoolean("repeated")));
        JSONObject repeated = packets.stream().filter(packet -> id.equals(packet.optString("id")) && packet.optBoolean("repeated"))
            .reduce((previous, next) -> next).orElseThrow();
        assertEquals("progress", repeated.getString("event"));
        assertTrue(repeated.getDouble("position") < 2);
        assertEquals(2, repeated.getJSONObject("transport").getJSONObject("snapshot").getLong("processedWebRevision"));
        transport("pause", 3);
        waitFor(() -> hasResult(3, "completed"));
        send(hello());
        JSONObject caps = last("transportCapabilities");
        String nextBinding = caps.getString("issuedBindingId");
        send(proposedBind(caps, nextBinding, bindingId)); bindingId = nextBinding;
        send(retired);
        assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason"));
        send(request("repeatOne").put("enabled", false));
        main(() -> {
            try {
                assertEquals(androidx.media3.common.Player.REPEAT_MODE_OFF, raw().getRepeatMode());
                assertFalse(raw().getPlayWhenReady());
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }

    @Test public void noOpPauseAndHistoricalLookupHaveExplicitNativeResults() throws Exception {
        bootstrap(); load(); transport("pause", 1);
        assertTrue(hasResult(1, "accepted")); assertTrue(hasResult(1, "completed"));
        assertFalse(snapshot().getJSONObject("observed").getBoolean("isPlaying"));
        send(request("transportReadState").put("forWebRevision", 1));
        JSONObject lookup = last("transportState").getJSONObject("transport").getJSONObject("lookup");
        assertEquals("terminal", lookup.getString("status"));
        assertEquals("pause", lookup.getJSONObject("result").getString("action"));
        send(request("transportReadState").put("forWebRevision", 99));
        lookup = last("transportState").getJSONObject("transport").getJSONObject("lookup");
        assertEquals("notFound", lookup.getString("status")); assertTrue(lookup.isNull("result"));
    }

    @Test public void loadConflictAndRetiredScopeDoNotReleaseOrRetuneCurrentPlayer() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw();
        JSONObject conflict = request("load").put("title", "Changed")
            .put("url", MediaPolicy.ORIGIN + "/v1/assets/11111111111111111111111111111111");
        send(conflict);
        JSONObject error = last("transportControlError");
        assertEquals("LOAD_CONFLICT", error.getString("reason"));
        assertEquals(conflict.getString("requestId"), error.getJSONObject("correlation").getString("requestId"));
        assertFalse(error.has("transport")); assertFalse(error.has("snapshot"));
        assertSame(original, raw());
        send(new JSONObject().put("id", id).put("action", "pause").put("transport", scope().put("bindingId", uuid()).put("webRevision", 1)));
        assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason"));
        send(new JSONObject().put("id", id).put("action", "release")); // No legacy downgrade.
        assertSame(original, raw());
        send(request("transportReadState"));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
    }

    @Test public void invalidNumericRevisionsCannotCrossTheNativeBoundary() throws Exception {
        bootstrap(); load();
        for (Object revision : new Object[]{"1", -1, 0, 1.5, 9_007_199_254_740_992d, JSONObject.NULL}) {
            send(new JSONObject().put("id", id).put("action", "play").put("transport", scope().put("webRevision", revision)));
        }
        send(request("transportReadState"));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
    }

    @Test public void bindReplayAndRebindPreservePlayerAndRejectOldAuthority() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw();
        transport("pause", 1);
        send(binding); // Lost-reply retry does not reset counters.
        assertEquals(1, snapshot().getLong("processedWebRevision"));
        String old = bindingId;
        send(hello());
        JSONObject caps = last("transportCapabilities");
        assertEquals(old, caps.getString("currentBindingId")); bindingId = caps.getString("issuedBindingId");
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", old).put("bindGrant", caps.getString("bindGrant")));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertEquals("baseline", snapshot().getJSONObject("intent").getString("origin"));
        assertSame(original, raw());
        send(binding);
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason"));
        send(request("release")); assertNull(raw());
    }

    @Test public void currentBindingReuseCannotResetTheReplayWatermark() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw();
        transport("play", 1); transport("pause", 2);
        long intentRevision = snapshot().getJSONObject("intent").getLong("revision");
        send(hello());
        JSONObject caps = last("transportCapabilities");
        JSONObject reused = new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", bindingId).put("bindGrant", caps.getString("bindGrant"));
        send(reused);
        JSONObject error = last("transportControlError");
        assertEquals("BIND_CONFLICT", error.getString("reason"));
        assertEquals(reused.getString("requestId"), error.getJSONObject("correlation").getString("requestId"));
        transport("play", 1); // Cached old Play cannot override the newer Pause.
        send(request("transportReadState"));
        assertEquals(2, snapshot().getLong("processedWebRevision"));
        assertEquals(intentRevision, snapshot().getJSONObject("intent").getLong("revision"));
        assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
        main(() -> assertFalse(original.getPlayWhenReady()));
        assertSame(original, raw());
        send(binding); // Exact lost-reply retry remains idempotent.
        assertEquals(2, snapshot().getLong("processedWebRevision"));
        // Rejection must not consume the grant or prevent a genuine new scope.
        String previous = bindingId; bindingId = caps.getString("issuedBindingId");
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", previous).put("bindGrant", caps.getString("bindGrant")));
        assertEquals(bindingId, last("transportState").getJSONObject("transport").getString("bindingId"));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertSame(original, raw());
    }

    @Test public void actualSessionPlayAfterPauseUsesNewIntentWithoutAnotherWebPlay() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            transport("pause", 2);
            assertTrue(hasResult(2, "completed"));
            JSONObject pauseState = snapshot();
            AtomicReference<ListenableFuture<MediaController>> future = new AtomicReference<>();
            main(() -> future.set(new MediaController.Builder(context, service.getSessions().get(0).getToken())
                .setApplicationLooper(Looper.getMainLooper()).buildAsync()));
            controller = future.get().get(10, TimeUnit.SECONDS);
            main(() -> controller.play());
            waitFor(() -> "system".equals(snapshot().optJSONObject("intent").optString("origin"))
                && snapshot().optJSONObject("observed").optBoolean("isPlaying"));
            assertEquals(2, snapshot().getLong("processedWebRevision"));
            assertTrue(snapshot().getJSONObject("intent").getLong("revision") > pauseState.getJSONObject("intent").getLong("revision"));
            // A historical web Play retry must not create another system/web intent.
            long revision = snapshot().getJSONObject("intent").getLong("revision");
            transport("play", 1);
            assertEquals(revision, snapshot().getJSONObject("intent").getLong("revision"));
            assertTrue(snapshot().getJSONObject("observed").getBoolean("isPlaying"));
            main(() -> controller.pause());
            waitFor(() -> !snapshot().optJSONObject("observed").optBoolean("playWhenReady"));
        }
    }

    @Test public void releasedCreationCannotBeRecreatedByItsConsumedBindGrant() throws Exception {
        bootstrap();
        send(request("release"));
        assertEquals("completed", last("transportControlAck").getString("phase"));
        send(binding);
        assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        send(hello());
        JSONObject caps = last("transportCapabilities");
        assertTrue(caps.isNull("currentBindingId"));
        // Even a fresh grant cannot turn a non-null recovery expectation into creation.
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", uuid())
            .put("expectedBindingId", bindingId).put("bindGrant", caps.getString("bindGrant")));
        assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        assertNull(raw());
    }

    @Test public void detachedSessionWrapperCannotRestartThePreviousTrack() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            ExoPlayer old = raw();
            AtomicReference<androidx.media3.common.Player> oldWrapper = new AtomicReference<>();
            main(() -> oldWrapper.set(service.getSessions().get(0).getPlayer()));
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            ExoPlayer current = raw();
            main(() -> {
                oldWrapper.get().play();
                assertFalse("A detached session cannot select a previous scope", old.getPlayWhenReady());
                assertTrue(current.getPlayWhenReady());
            });
        }
    }

    @Test public void releasedPlatformControlsCannotStopReplacementButCurrentControlsWork() throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            AtomicReference<androidx.media3.session.MediaSession> oldSession = new AtomicReference<>();
            AtomicReference<android.media.session.MediaController> oldController = new AtomicReference<>();
            main(() -> {
                oldSession.set(service.getSessions().get(0));
                oldController.set(new android.media.session.MediaController(context, oldSession.get().getPlatformToken()));
            });
            send(request("release"));
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            ExoPlayer current = raw();
            AtomicReference<android.media.session.MediaController> currentController = new AtomicReference<>();
            main(() -> {
                androidx.media3.session.MediaSession replacement = service.getSessions().get(0);
                assertNotEquals("Notification identity must not be reused after Release", oldSession.get().getId(), replacement.getId());
                assertNotEquals("A released source must not retain the replacement's OS token", oldSession.get().getPlatformToken(), replacement.getPlatformToken());
                currentController.set(new android.media.session.MediaController(context, replacement.getPlatformToken()));
                // Same platform transport API used by SystemUI's asynchronous dismissal.
                oldController.get().getTransportControls().stop();
            });
            Thread.sleep(500);
            AtomicReference<Boolean> observed = new AtomicReference<>();
            waitFor(() -> {
                main(() -> observed.set(current.isPlaying() && current.getCurrentPosition() > 1000));
                return observed.get();
            });
            currentController.get().getTransportControls().pause();
            waitFor(() -> { main(() -> observed.set(!current.getPlayWhenReady())); return observed.get(); });
            currentController.get().getTransportControls().play();
            waitFor(() -> { main(() -> observed.set(current.isPlaying())); return observed.get(); });
            currentController.get().getTransportControls().stop();
            waitFor(() -> {
                main(() -> observed.set(!current.getPlayWhenReady() && current.getPlaybackState() == androidx.media3.common.Player.STATE_IDLE));
                return observed.get();
            });
            AtomicReference<Long> stoppedPosition = new AtomicReference<>();
            AtomicReference<androidx.media3.common.MediaItem> retainedItem = new AtomicReference<>();
            main(() -> {
                stoppedPosition.set(current.getCurrentPosition());
                retainedItem.set(current.getCurrentMediaItem());
                assertNotNull(retainedItem.get());
            });
            // App Play goes through the ordered bridge, not MediaController's prepare handling.
            transport("play", 2);
            waitFor(() -> hasResult(2, "completed"));
            assertSame("Play after Stop must retain the same native source", current, raw());
            assertEquals(bindingId, last("transportState").getJSONObject("transport").getString("bindingId"));
            assertEquals(2, snapshot().getLong("appliedWebRevision"));
            assertEquals(2, snapshot().getJSONObject("intent").getLong("webRevision"));
            waitFor(() -> {
                main(() -> {
                    assertEquals(retainedItem.get(), current.getCurrentMediaItem());
                    observed.set(current.isPlaying() && current.getCurrentPosition() > stoppedPosition.get() + 200);
                });
                return observed.get();
            });
            transport("pause", 3);
            assertTrue(hasResult(3, "completed"));
            transport("play", 2); // A completed old Play cannot prepare or restart after newer Pause.
            main(() -> assertFalse(current.getPlayWhenReady()));
            assertEquals(3, snapshot().getLong("appliedWebRevision"));
            assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
        }
    }

    @Test public void taskRemovalReleasesEndedSourceWithRetainedPlayIntent() throws Exception {
        verifyTerminalTaskRemoval(true);
    }

    @Test public void taskRemovalReleasesIdleSourceWithRetainedPlayIntent() throws Exception {
        verifyTerminalTaskRemoval(false);
    }

    private void verifyTerminalTaskRemoval(boolean ended) throws Exception {
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            ExoPlayer player = raw();
            main(() -> {
                if (ended) {
                    assertTrue("Local tone must expose its real duration", player.getDuration() > 0);
                    player.seekTo(player.getDuration());
                } else player.stop();
            });
            AtomicReference<Boolean> terminal = new AtomicReference<>();
            waitFor(() -> {
                main(() -> terminal.set(player.getPlaybackState() == (ended
                    ? androidx.media3.common.Player.STATE_ENDED : androidx.media3.common.Player.STATE_IDLE)));
                return terminal.get();
            });
            main(() -> {
                assertTrue("Terminal output does not clear retained Play intent", player.getPlayWhenReady());
                service.onTaskRemoved(new Intent());
                assertFalse("Task removal must release a terminal source", service.hasPlayer(id));
            });
            assertNull(raw());
            assertFalse("Task removal must also retire the terminal binding", bridge().contains(id));
        }
    }

    @Test public void transientAudioFocusLossResumesNativePlayback() throws Exception {
        verifyTransientAudioFocus(false);
    }

    @Test public void pauseDuringAudioFocusLossPreventsAutomaticResume() throws Exception {
        verifyTransientAudioFocus(true);
    }

    private void verifyTransientAudioFocus(boolean pauseDuringInterruption) throws Exception {
        android.media.AudioManager audio = (android.media.AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
        AtomicReference<android.media.AudioFocusRequest> interruption = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1);
            waitFor(() -> hasResult(1, "completed"));
            ExoPlayer player = raw();
            AtomicReference<Boolean> observed = new AtomicReference<>();
            waitFor(() -> { main(() -> observed.set(player.isPlaying())); return observed.get(); });
            main(() -> {
                interruption.set(new android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build())
                    .setOnAudioFocusChangeListener(change -> {}).build());
                assertEquals("The OS must actually grant the competing focus request",
                    android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED, audio.requestAudioFocus(interruption.get()));
            });
            waitFor(() -> {
                main(() -> observed.set(!player.isPlaying() && player.getPlaybackSuppressionReason() != androidx.media3.common.Player.PLAYBACK_SUPPRESSION_REASON_NONE));
                return observed.get();
            });
            // Losing focus is a temporary policy observation, not an explicit user Pause.
            send(request("transportReadState"));
            assertTrue(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
            if (!pauseDuringInterruption) {
                main(() -> service.onTaskRemoved(new Intent()));
                assertSame("Task removal must retain temporary focus-suppressed playback", player, raw());
            }
            if (pauseDuringInterruption) {
                transport("pause", 2);
                waitFor(() -> hasResult(2, "completed"));
            }
            main(() -> audio.abandonAudioFocusRequest(interruption.get()));
            if (pauseDuringInterruption) {
                Thread.sleep(750);
                main(() -> {
                    assertFalse("Focus gain must not undo explicit Pause", player.getPlayWhenReady());
                    assertFalse(player.isPlaying());
                });
                send(request("transportReadState"));
                assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
            } else {
                AtomicReference<Long> position = new AtomicReference<>();
                main(() -> position.set(player.getCurrentPosition()));
                waitFor(() -> {
                    main(() -> observed.set(player.isPlaying() && player.getCurrentPosition() > position.get() + 250));
                    return observed.get();
                });
            }
        } finally {
            if (interruption.get() != null) main(() -> audio.abandonAudioFocusRequest(interruption.get()));
        }
    }

    @Test public void exhaustedBindingKeepsItsAnchorAndRebindsWithoutReloading() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw();
        Field bridgeField = PlaybackService.class.getDeclaredField("ordered"); bridgeField.setAccessible(true);
        OrderedMediaBridge bridge = (OrderedMediaBridge)bridgeField.get(service);
        Field sequence = OrderedTransport.class.getDeclaredField("sequence"); sequence.setAccessible(true);
        main(() -> {
            try { sequence.setLong(bridge.owner(id), OrderedTransport.MAX); }
            catch (Exception error) { throw new AssertionError(error); }
        });
        send(request("transportReadState"));
        assertEquals("COUNTER_EXHAUSTED", last("transportControlError").getString("reason"));
        send(hello());
        JSONObject caps = last("transportCapabilities");
        String previous = bindingId;
        assertEquals(previous, caps.getString("currentBindingId")); bindingId = caps.getString("issuedBindingId");
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 2)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", previous).put("bindGrant", caps.getString("bindGrant")));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertEquals(0, snapshot().getJSONObject("intent").getLong("revision"));
        assertSame(original, raw());
        send(request("release")); assertNull(raw());
    }

    private void assertRetiredBindingCannotReturn(int intermediateScopes) throws Exception {
        bootstrap(); load(); ExoPlayer original = raw(); String retired = bindingId;
        JSONObject oldPlay = new JSONObject().put("id", id).put("action", "play")
            .put("transport", scope().put("webRevision", 1));
        send(oldPlay); transport("pause", 2);
        for (int i = 0; i < intermediateScopes; i++) {
            send(hello()); JSONObject caps = last("transportCapabilities");
            String prior = bindingId; bindingId = caps.getString("issuedBindingId");
            send(proposedBind(caps, bindingId, prior)); transport("pause", 1);
        }
        send(hello()); JSONObject caps = last("transportCapabilities");
        send(proposedBind(caps, retired, bindingId));
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason"));
        send(oldPlay);
        assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason"));
        send(request("transportReadState"));
        assertEquals(1, snapshot().getLong("processedWebRevision"));
        assertFalse(snapshot().getJSONObject("intent").getBoolean("playWhenReady"));
        main(() -> assertFalse(original.getPlayWhenReady())); assertSame(original, raw());
    }
    @Test public void retiredBindingCannotBeReactivatedAfterAnIntermediateScope() throws Exception {
        assertRetiredBindingCannotReturn(1);
    }
    @Test public void retiredBindingCannotBeReactivatedAfterSeveralIntermediateScopes() throws Exception {
        assertRetiredBindingCannotReturn(2);
    }
    @Test public void releaseInvalidatesConsumedAndUnusedGrantsAndNeverRevivesOldPlay() throws Exception {
        bootstrap(); load(); String retired = bindingId;
        JSONObject oldPlay = new JSONObject().put("id", id).put("action", "play").put("transport", scope().put("webRevision", 2));
        transport("pause", 1); send(oldPlay);
        send(hello()); JSONObject unused = last("transportCapabilities");
        send(request("release")); assertNull(raw());
        send(binding); assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        send(proposedBind(unused, unused.getString("issuedBindingId"), null));
        assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        send(hello()); JSONObject fresh = last("transportCapabilities"); assertTrue(fresh.isNull("currentBindingId"));
        send(proposedBind(fresh, retired, null));
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason")); assertNull(raw());
        bindingId = fresh.getString("issuedBindingId"); send(proposedBind(fresh, bindingId, null));
        load(); transport("pause", 1); ExoPlayer current = raw(); send(oldPlay);
        assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason"));
        send(request("transportReadState")); assertEquals(1, snapshot().getLong("processedWebRevision"));
        main(() -> assertFalse(current.getPlayWhenReady()));
    }
    @Test public void alteredAndCompetingGrantsPreserveOwnerSourcePositionAndGain() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw();
        main(() -> { original.seekTo(2800); original.setVolume(.42f); });
        send(hello()); JSONObject first = last("transportCapabilities");
        send(hello()); JSONObject second = last("transportCapabilities");
        String prior = bindingId;
        JSONObject valid = proposedBind(first, first.getString("issuedBindingId"), prior);
        OrderedTransport oldOwner = bridge().owner(id);
        for (String key : new String[]{"bindingId", "expectedBindingId", "engineId", "id"}) {
            JSONObject invalid = new JSONObject(valid.toString());
            invalid.put(key, key.equals("id") ? "audio_" + uuid() : uuid()); send(invalid);
            assertSame(oldOwner, bridge().owner(id)); assertSame(original, raw());
        }
        send(valid, new Object()); assertEquals("UNAVAILABLE", last("transportControlError").getString("reason"));
        assertSame(oldOwner, bridge().owner(id));
        send(valid); bindingId = first.getString("issuedBindingId");
        assertNotSame(oldOwner, bridge().owner(id)); assertSame(original, raw());
        send(proposedBind(second, second.getString("issuedBindingId"), prior));
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason"));
        main(() -> {
            assertEquals(2800, original.getCurrentPosition()); assertEquals(.42f, original.getVolume(), .001f);
            assertFalse(original.getPlayWhenReady()); assertEquals(1, original.getMediaItemCount());
        });
        send(request("transportReadState")); assertEquals(0, snapshot().getLong("processedWebRevision"));
    }
    @Test public void exactBindRetrySurvivesGrantExpiryButNotReplacement() throws Exception {
        bootstrap(); load(); transport("pause", 1); ExoPlayer original = raw();
        send(new JSONObject(binding.toString()).put("version", 2d));
        assertEquals(binding.getString("requestId"), last("transportState").getJSONObject("transport").getString("replyTo"));
        Thread.sleep(5100); send(binding);
        assertEquals(1, snapshot().getLong("processedWebRevision")); assertSame(original, raw());
        send(hello()); JSONObject caps = last("transportCapabilities");
        String old = bindingId; bindingId = caps.getString("issuedBindingId"); send(proposedBind(caps, bindingId, old));
        OrderedTransport owner = bridge().owner(id); send(binding);
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason"));
        assertSame(owner, bridge().owner(id)); assertSame(original, raw());
    }
    @Test public void expiredUnusedGrantCannotReplaceItsCurrentOwner() throws Exception {
        bootstrap(); load(); send(hello()); JSONObject caps = last("transportCapabilities");
        ExoPlayer original = raw(); OrderedTransport owner = bridge().owner(id);
        Thread.sleep(5100); send(proposedBind(caps, caps.getString("issuedBindingId"), bindingId));
        assertEquals("GRANT_EXPIRED", last("transportControlError").getString("reason"));
        assertSame(owner, bridge().owner(id)); assertSame(original, raw());
    }
    @Test public void unpopulatedRebindDoesNotExtendReapingOrKeepUnusedGrants() throws Exception {
        bootstrap(); JSONObject consumed = new JSONObject(binding.toString());
        long start = android.os.SystemClock.elapsedRealtime(); Thread.sleep(2600);
        send(hello()); JSONObject caps = last("transportCapabilities");
        String prior = bindingId; bindingId = caps.getString("issuedBindingId"); send(proposedBind(caps, bindingId, prior));
        send(hello()); JSONObject unused = last("transportCapabilities");
        Thread.sleep(Math.max(0, 5500 - (android.os.SystemClock.elapsedRealtime() - start)));
        assertNull(bridge().owner(id)); assertNull(raw());
        send(consumed); assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        send(proposedBind(unused, unused.getString("issuedBindingId"), null));
        assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
    }
    @Test public void fourGrantCeilingDoesNotConsumeAValidCandidateOrEvictPlayback() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw(); JSONObject first = null;
        for (int i = 0; i < 4; i++) { send(hello()); if (first == null) first = last("transportCapabilities"); }
        send(hello()); assertEquals("UNAVAILABLE", last("transportControlError").getString("reason"));
        assertSame(original, raw()); assertEquals(1, bridge().size());
        String previous = bindingId; bindingId = first.getString("issuedBindingId"); send(proposedBind(first, bindingId, previous));
        assertSame(original, raw()); send(hello());
        assertEquals(bindingId, last("transportCapabilities").getString("currentBindingId"));
    }
    @Test public void failedCreationAtCapacityCannotEvictEitherPlayer() throws Exception {
        bootstrap(); load(); String firstId = id; ExoPlayer first = raw();
        bootstrap(); load(); ExoPlayer second = raw(); send(hello()); JSONObject caps = last("transportCapabilities");
        JSONObject invalid = proposedBind(caps, caps.getString("issuedBindingId"), null).put("id", "audio_" + uuid());
        send(invalid); assertEquals("BIND_CONFLICT", last("transportControlError", invalid.getString("id")).getString("reason"));
        assertEquals(2, bridge().size()); assertSame(second, raw());
        String secondId = id; id = firstId; assertSame(first, raw()); id = secondId;
    }
    @Test public void evictionInvalidatesTheOldLoadsUnusedGrant() throws Exception {
        bootstrap(); load(); String firstId = id; send(hello()); JSONObject oldCaps = last("transportCapabilities");
        bootstrap(); load(); bootstrap(); load(); String currentId = id; ExoPlayer current = raw();
        id = firstId; assertNull(raw());
        send(proposedBind(oldCaps, oldCaps.getString("issuedBindingId"), null));
        assertEquals("NOT_FOUND", last("transportControlError").getString("reason"));
        id = currentId; assertSame(current, raw()); assertEquals(2, bridge().size());
    }
    @Test public void eachExhaustedCounterAllowsFreshRebindAndScopedReleaseWithoutOutputReplay() throws Exception {
        for (String counter : new String[]{"processed", "intent", "sequence"}) {
            bootstrap(); load(); transport("pause", 1); ExoPlayer original = raw();
            main(() -> { original.seekTo(2800); original.setVolume(.42f); });
            OrderedTransport owner = bridge().owner(id);
            Field field = OrderedTransport.class.getDeclaredField(counter); field.setAccessible(true);
            main(() -> {
                try {
                    if (counter.equals("intent")) field.set(owner, new OrderedTransport.Intent(OrderedTransport.MAX, false, "policy", null));
                    else field.setLong(owner, OrderedTransport.MAX);
                } catch (Exception failure) { throw new AssertionError(failure); }
            });
            send(request("transportReadState")); assertEquals("COUNTER_EXHAUSTED", last("transportControlError").getString("reason"));
            send(hello()); JSONObject caps = last("transportCapabilities"); assertEquals(bindingId, caps.getString("currentBindingId"));
            String previous = bindingId; bindingId = caps.getString("issuedBindingId"); send(proposedBind(caps, bindingId, previous));
            assertEquals(0, snapshot().getLong("processedWebRevision")); assertSame(original, raw());
            main(() -> { assertFalse(original.getPlayWhenReady()); assertEquals(2800, original.getCurrentPosition()); assertEquals(.42f, original.getVolume(), .001f); });
            OrderedTransport fresh = bridge().owner(id);
            main(() -> { try { Field seq = OrderedTransport.class.getDeclaredField("sequence"); seq.setAccessible(true); seq.setLong(fresh, OrderedTransport.MAX); } catch (Exception failure) { throw new AssertionError(failure); } });
            send(new JSONObject().put("id", id).put("action", "release").put("requestId", uuid()).put("transport", scope().put("bindingId", previous)));
            assertEquals("INVALID_SCOPE", last("transportControlError").getString("reason")); assertSame(original, raw());
            send(request("release")); assertEquals("completed", last("transportControlAck").getString("phase")); assertNull(raw());
        }
    }
    @Test public void oldAndMalformedRendererRequestsNeverEnterLegacyPlayback() throws Exception {
        bootstrap(); load(); ExoPlayer original = raw(); OrderedTransport owner = bridge().owner(id);
        JSONObject oldHello = new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid());
        send(oldHello); assertTrue(lastCommandNeedsUpdate); assertEquals(1, last("transportControlError").getInt("version"));
        assertEquals("UNAVAILABLE", last("transportControlError").getString("reason"));
        send(new JSONObject().put("id", id).put("action", "play")); assertTrue(lastCommandNeedsUpdate);
        send(new JSONObject().put("id", id).put("action", "pause").put("transport", scope().put("version", 1).put("webRevision", 1)));
        assertTrue(lastCommandNeedsUpdate); assertSame(owner, bridge().owner(id)); assertSame(original, raw());
        for (Object offer : new Object[]{new JSONArray().put(2), new JSONArray().put("2").put(1), JSONObject.NULL}) {
            send(hello().put("supportedTransportVersions", offer));
            assertFalse(lastCommandNeedsUpdate); assertEquals("PROTOCOL_ERROR", last("transportControlError").getString("reason"));
        }
        main(() -> assertFalse(original.getPlayWhenReady()));
    }

    private void oldRendererPage(ActivityScenario<MainActivity> scenario, JSONObject command) throws Exception {
        String oldPage = "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><script>"
            + "window.HayKasaAndroidMedia.postMessage(" + JSONObject.quote(command.toString()) + ");</script>";
        scenario.onActivity(activity -> {
            try {
                Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                android.webkit.WebView web = (android.webkit.WebView)field.get(activity);
                android.webkit.WebViewClient delegate = web.getWebViewClient(); web.stopLoading();
                web.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override public android.webkit.WebResourceResponse shouldInterceptRequest(android.webkit.WebView view, android.webkit.WebResourceRequest request) {
                        String page = request.getUrl().getQueryParameter("old-player-qa") != null ? oldPage
                            : "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1'><body style='color:#f1f5ff;background:#060d1b;font-family:sans-serif'><h1>Reloaded player fixture</h1>";
                        return new android.webkit.WebResourceResponse("text/html", "UTF-8", new java.io.ByteArrayInputStream(page.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                    }
                    @Override public void onPageStarted(android.webkit.WebView view, String url, android.graphics.Bitmap icon) { delegate.onPageStarted(view, url, icon); }
                    @Override public void onPageFinished(android.webkit.WebView view, String url) { delegate.onPageFinished(view, url); }
                });
                web.loadUrl(MediaPolicy.ORIGIN + "/?old-player-qa=1");
            } catch (Exception failure) { throw new AssertionError(failure); }
        });
    }
    private static void enlargeText(android.view.View view) {
        if (view instanceof android.widget.TextView) ((android.widget.TextView)view).setTextSize(36);
        if (view instanceof android.view.ViewGroup) {
            android.view.ViewGroup group = (android.view.ViewGroup)view;
            for (int i = 0; i < group.getChildCount(); i++) enlargeText(group.getChildAt(i));
        }
    }
    @Test public void nativeUpdateUiPreservesAudioAndOsControlsUntilExplicitReload() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            bootstrap(); load(); transport("play", 1); waitFor(() -> hasResult(1, "completed"));
            ExoPlayer original = raw();
            JSONObject oldHello = new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid());
            oldRendererPage(scenario, oldHello);
            AtomicReference<android.widget.Button> button = new AtomicReference<>();
            waitFor(() -> {
                scenario.onActivity(activity -> button.set(activity.findViewById(android.R.id.button1)));
                return button.get() != null;
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> {
                assertEquals(activity.getString(R.string.reload_player), button.get().getText().toString());
                assertTrue(button.get().isShown()); assertTrue(button.get().isFocusable());
                assertTrue(button.get().getHeight() >= 48 * activity.getResources().getDisplayMetrics().density);
                assertTrue(original.getPlayWhenReady());
            });
            AndroidPlaybackTest.screenshot("native-player-update-portrait");
            InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_TAB);
            main(() -> assertTrue("Reload must be reachable by keyboard", button.get().hasFocus()));
            scenario.onActivity(activity -> activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            waitFor(() -> {
                java.util.concurrent.atomic.AtomicBoolean wide = new java.util.concurrent.atomic.AtomicBoolean();
                scenario.onActivity(activity -> wide.set(activity.getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE));
                return wide.get();
            });
            AndroidPlaybackTest.screenshot("native-player-update-landscape");
            // Stress the real native error layout with 200% text, without changing VM system settings.
            scenario.onActivity(activity -> enlargeText((android.view.View)button.get().getParent()));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            main(() -> {
                android.widget.ScrollView scroll = (android.widget.ScrollView)button.get().getParent().getParent();
                scroll.setSmoothScrollingEnabled(false);
                scroll.fullScroll(android.view.View.FOCUS_DOWN);
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            main(() -> {
                android.graphics.Rect visible = new android.graphics.Rect();
                assertTrue(button.get().getGlobalVisibleRect(visible));
                assertEquals("Large-text Reload must remain fully reachable", button.get().getHeight(), visible.height());
                assertTrue(original.getPlayWhenReady());
            });
            AndroidPlaybackTest.screenshot("native-player-update-large-text");
            AtomicReference<ListenableFuture<MediaController>> future = new AtomicReference<>();
            main(() -> future.set(new MediaController.Builder(context, service.getSessions().get(0).getToken())
                .setApplicationLooper(Looper.getMainLooper()).buildAsync()));
            controller = future.get().get(10, TimeUnit.SECONDS);
            main(() -> controller.pause()); waitFor(() -> !snapshot().optJSONObject("observed").optBoolean("playWhenReady"));
            main(() -> controller.play()); waitFor(() -> snapshot().optJSONObject("observed").optBoolean("isPlaying"));
            main(() -> button.get().performClick());
            waitFor(() -> {
                java.util.concurrent.atomic.AtomicBoolean reloaded = new java.util.concurrent.atomic.AtomicBoolean();
                scenario.onActivity(activity -> {
                    try {
                        Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                        android.webkit.WebView web = (android.webkit.WebView)field.get(activity);
                        reloaded.set(activity.findViewById(android.R.id.button1) == null && (MediaPolicy.ORIGIN + "/?utm_source=android").equals(web.getUrl()));
                    } catch (Exception failure) { throw new AssertionError(failure); }
                });
                return reloaded.get();
            });
            AndroidPlaybackTest.screenshot("native-player-update-reloaded");
            assertSame(original, raw()); main(() -> assertTrue(original.getPlayWhenReady()));
        }
    }

    private static byte[] tone() {
        int rate = 48000, samples = rate * 30, bytes = samples * 4;
        ByteBuffer out = ByteBuffer.allocate(44 + bytes).order(ByteOrder.LITTLE_ENDIAN);
        out.put(new byte[]{'R','I','F','F'}).putInt(36 + bytes).put(new byte[]{'W','A','V','E','f','m','t',' '})
            .putInt(16).putShort((short)1).putShort((short)2).putInt(rate).putInt(rate * 4)
            .putShort((short)4).putShort((short)16).put(new byte[]{'d','a','t','a'}).putInt(bytes);
        for (int index = 0; index < samples; index++) {
            short value = (short)(Math.sin(index * 2 * Math.PI * 440 / rate) * 1500);
            out.putShort(value).putShort(value);
        }
        return out.array();
    }
}
