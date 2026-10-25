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
        main(() -> {
            try {
                service.command(command, json -> {
                    try { packets.add(new JSONObject(json)); }
                    catch (Exception error) { throw new AssertionError("Native producer emitted invalid JSON", error); }
                }, attachment);
            } catch (Exception error) { throw new AssertionError(error); }
        });
    }
    private JSONObject last(String event) {
        for (int index = packets.size() - 1; index >= 0; index--) {
            JSONObject value = packets.get(index);
            if (id.equals(value.optString("id")) && event.equals(value.optString("event"))) return value;
        }
        throw new AssertionError("Missing native event " + event);
    }
    private JSONObject scope() throws Exception { return new JSONObject().put("version", 1).put("engineId", engine).put("bindingId", bindingId); }
    private JSONObject request(String action) throws Exception {
        return new JSONObject().put("id", id).put("action", action).put("requestId", uuid()).put("transport", scope());
    }
    private void bootstrap() throws Exception {
        id = "audio_" + uuid();
        send(new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid()));
        JSONObject caps = last("transportCapabilities");
        assertEquals("ordered-transport-v1", caps.getString("capability"));
        assertTrue(caps.getInt("nativeBuildCode") > 0);
        assertTrue(caps.isNull("currentBindingId"));
        engine = caps.getString("engineId"); bindingId = uuid();
        binding = new JSONObject().put("id", id).put("action", "transportBind").put("version", 1)
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
        send(new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid()));
        JSONObject caps = last("transportCapabilities");
        assertEquals(old, caps.getString("currentBindingId")); bindingId = uuid();
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 1)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", old).put("bindGrant", caps.getString("bindGrant")));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertEquals("baseline", snapshot().getJSONObject("intent").getString("origin"));
        assertSame(original, raw());
        send(binding);
        assertEquals("BIND_CONFLICT", last("transportControlError").getString("reason"));
        send(request("release")); assertNull(raw());
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
        send(new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid()));
        JSONObject caps = last("transportCapabilities");
        assertTrue(caps.isNull("currentBindingId"));
        // Even a fresh grant cannot turn a non-null recovery expectation into creation.
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 1)
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
        send(new JSONObject().put("id", id).put("action", "transportHello").put("requestId", uuid()));
        JSONObject caps = last("transportCapabilities");
        String previous = bindingId;
        assertEquals(previous, caps.getString("currentBindingId")); bindingId = uuid();
        send(new JSONObject().put("id", id).put("action", "transportBind").put("version", 1)
            .put("requestId", uuid()).put("engineId", engine).put("bindingId", bindingId)
            .put("expectedBindingId", previous).put("bindGrant", caps.getString("bindGrant")));
        assertEquals(0, snapshot().getLong("processedWebRevision"));
        assertEquals(0, snapshot().getJSONObject("intent").getLong("revision"));
        assertSame(original, raw());
        send(request("release")); assertNull(raw());
    }

    private static byte[] tone() {
        int rate = 48000, samples = rate * 12, bytes = samples * 4;
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
