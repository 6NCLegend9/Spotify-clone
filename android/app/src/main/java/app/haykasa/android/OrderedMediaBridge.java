package app.haykasa.android;

import android.os.Handler;
import android.os.SystemClock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.json.JSONException;
import org.json.JSONObject;

/** Native D06 handshake/codec. Attachment authority is supplied by Java, never by JSON. */
@androidx.media3.common.util.UnstableApi
final class OrderedMediaBridge {
    private static final long GRANT_MS = 5_000;
    private final String engineId = UUID.randomUUID().toString();
    private final PlaybackService host;
    private final Handler handler;
    private final Map<String, Load> loads = new LinkedHashMap<>();
    private final Map<String, Grant> grants = new LinkedHashMap<>();
    private record Grant(Object attachment, String id, String expected, long expires) {}
    private static final class Load {
        final String id;
        final Object attachment;
        final long reservationExpires;
        PlaybackService.Sink sink;
        OrderedTransport owner;
        JSONObject bind;
        Runnable reservation;
        boolean authorized = true;
        String url, title;
        Load(String id, Object attachment) {
            this.id = id; this.attachment = attachment;
            reservationExpires = SystemClock.elapsedRealtime() + GRANT_MS;
        }
    }

    OrderedMediaBridge(PlaybackService host, Handler handler) { this.host = host; this.handler = handler; }
    boolean contains(String id) { return loads.containsKey(id); }
    int size() { return loads.size(); }
    Iterable<String> ids() { return new ArrayList<>(loads.keySet()); }
    OrderedTransport owner(String id) { Load load = loads.get(id); return load == null ? null : load.owner; }

    boolean handle(JSONObject msg, PlaybackService.Sink sink, Object attachment) {
        String action = text(msg, "action"), id = text(msg, "id");
        if (!action.startsWith("transport") && !msg.has("transport") && !contains(id)) return false;
        if (!MediaPolicy.isId(id)) return true;
        try {
            if ("transportHello".equals(action)) { hello(msg, sink, attachment); return true; }
            if ("transportBind".equals(action)) { bind(msg, sink, attachment); return true; }
            Load load = loads.get(id);
            if (load == null) { error(msg, sink, "NOT_FOUND"); return true; }
            if (!load.authorized || load.attachment != attachment || !scopeMatches(msg, load)) {
                error(msg, sink, "INVALID_SCOPE"); return true;
            }
            if (load.owner.exhausted()) { error(msg, sink, "COUNTER_EXHAUSTED"); return true; }
            load.sink = sink;
            if ("play".equals(action) || "pause".equals(action)) {
                Long revision = number(msg.optJSONObject("transport"), "webRevision", true);
                if (revision == null) { error(msg, sink, "PROTOCOL_ERROR"); return true; }
                load.owner.command(revision, action, host.hasPlayer(id));
                if (load.owner.exhausted()) error(msg, sink, "COUNTER_EXHAUSTED");
            } else if ("transportReadState".equals(action)) {
                if (!uuid(text(msg, "requestId"))) { error(msg, sink, "PROTOCOL_ERROR"); return true; }
                Long revision = msg.has("forWebRevision") ? number(msg, "forWebRevision", true) : null;
                if (msg.has("forWebRevision") && revision == null) error(msg, sink, "PROTOCOL_ERROR");
                else {
                    load.owner.read(text(msg, "requestId"), revision);
                    if (load.owner.exhausted()) error(msg, sink, "COUNTER_EXHAUSTED");
                }
            } else lifecycle(msg, load, sink);
        } catch (RuntimeException | JSONException failure) {
            // Never turn a control failure into a legacy decoder error or print signed URLs.
            error(msg, sink, "UNAVAILABLE");
        }
        return true;
    }

    private void hello(JSONObject msg, PlaybackService.Sink sink, Object attachment) throws JSONException {
        String id = text(msg, "id"), request = text(msg, "requestId");
        if (!loadId(id) || !uuid(request)) { error(msg, sink, "PROTOCOL_ERROR"); return; }
        Load existing = loads.get(id);
        if (existing != null && (!existing.authorized || existing.attachment != attachment)
            || existing == null && host.hasPlayer(id)) { error(msg, sink, "UNAVAILABLE"); return; }
        long now = SystemClock.elapsedRealtime();
        grants.entrySet().removeIf(entry -> entry.getValue().expires() <= now);
        long reserved = grants.values().stream().filter(value -> value.attachment() == attachment).count();
        if (reserved >= 4) { error(msg, sink, "UNAVAILABLE"); return; }
        String grant = UUID.randomUUID().toString();
        String expected = existing == null ? null : existing.owner.bindingId;
        grants.put(grant, new Grant(attachment, id, expected, now + GRANT_MS));
        send(sink, new JSONObject().put("id", id).put("event", "transportCapabilities")
            .put("requestId", request).put("version", 1).put("capability", "ordered-transport-v1")
            .put("nativeBuildCode", host.nativeBuildCode()).put("engineId", engineId)
            .put("currentBindingId", expected == null ? JSONObject.NULL : expected)
            .put("bindGrant", grant).put("grantLifetimeMs", GRANT_MS));
    }

    private void bind(JSONObject msg, PlaybackService.Sink sink, Object attachment) throws JSONException {
        String id = text(msg, "id"), binding = text(msg, "bindingId"), grantId = text(msg, "bindGrant");
        String expected = msg.isNull("expectedBindingId") ? null : text(msg, "expectedBindingId");
        if (!loadId(id) || !uuid(text(msg, "requestId")) || !uuid(binding) || !uuid(grantId)
            || !msg.has("expectedBindingId") || expected != null && !uuid(expected)
            || !Long.valueOf(1).equals(number(msg, "version", true))) {
            error(msg, sink, "PROTOCOL_ERROR"); return;
        }
        if (!engineId.equals(text(msg, "engineId"))) { error(msg, sink, "ENGINE_MISMATCH"); return; }
        Load load = loads.get(id);
        if (load != null && load.authorized && load.attachment == attachment && sameBind(load.bind, msg)) {
            load.sink = sink;
            if (load.owner.exhausted()) error(msg, sink, "COUNTER_EXHAUSTED");
            else load.owner.read(text(msg, "requestId"), null);
            return;
        }
        if (load != null && (!load.authorized || load.attachment != attachment)
            || load == null && host.hasPlayer(id)) { error(msg, sink, "UNAVAILABLE"); return; }
        if (expected != null && load == null) { error(msg, sink, "NOT_FOUND"); return; }
        // Only the exact lost-reply retry above may reuse the current ID.
        // Resetting that live scope would make old revisions authoritative again.
        if (!Objects.equals(expected, load == null ? null : load.owner.bindingId)
            || load != null && binding.equals(load.owner.bindingId)) {
            error(msg, sink, "BIND_CONFLICT"); return;
        }
        Grant grant = grants.get(grantId);
        if (grant == null) { error(msg, sink, load == null ? "NOT_FOUND" : "GRANT_EXPIRED"); return; }
        if (grant.expires() <= SystemClock.elapsedRealtime()) {
            grants.remove(grantId); error(msg, sink, "GRANT_EXPIRED"); return;
        }
        if (grant.attachment() != attachment || !grant.id().equals(id) || !Objects.equals(grant.expected(), expected)) {
            error(msg, sink, "BIND_CONFLICT"); return;
        }
        if (load == null && !host.reserveOrderedSlot(id)) { error(msg, sink, "UNAVAILABLE"); return; }
        grants.remove(grantId);
        if (load == null) {
            load = new Load(id, attachment);
            loads.put(id, load);
            final Load reserved = load;
            load.reservation = () -> {
                if (loads.get(id) == reserved && !host.hasPlayer(id)
                    && SystemClock.elapsedRealtime() >= reserved.reservationExpires) host.releasePlayer(id);
            };
            handler.postDelayed(load.reservation, GRANT_MS);
        }
        boolean baseline = load.owner != null && load.owner.intent().playWhenReady();
        if (load.owner != null) load.owner.retire();
        final Load own = load;
        load.sink = sink;
        load.bind = new JSONObject(msg.toString());
        load.owner = new OrderedTransport(binding, baseline, () -> host.observePlayer(id),
            playing -> host.setTransportPlaying(id, playing), update -> state(own, update),
            SystemClock::elapsedRealtime, (task, delay) -> handler.postDelayed(task, delay), handler::removeCallbacks);
        load.owner.read(text(msg, "requestId"), null);
    }

    private void lifecycle(JSONObject msg, Load load, PlaybackService.Sink sink) throws JSONException {
        String action = text(msg, "action"), request = text(msg, "requestId");
        if (!uuid(request)) { error(msg, sink, "PROTOCOL_ERROR"); return; }
        switch (action) {
            case "load": {
                String url = text(msg, "url"), title = text(msg, "title");
                if (!MediaPolicy.isAsset(url) || !(msg.opt("title") instanceof String)) {
                    error(msg, sink, "INVALID_VALUE"); return;
                }
                title = title.substring(0, Math.min(300, title.length()));
                if (load.url != null && (!load.url.equals(url) || !load.title.equals(title))) {
                    error(msg, sink, "LOAD_CONFLICT"); return;
                }
                if (load.url == null) {
                    host.loadPlayer(load.id, url, title, sink);
                    load.url = url; load.title = title;
                    handler.removeCallbacks(load.reservation);
                }
                ack(msg, sink, load.owner.bindingId, "accepted");
                break;
            }
            case "seek": case "volume": {
                Object value = msg.opt("value");
                if (!(value instanceof Number) || !Double.isFinite(((Number)value).doubleValue())) {
                    error(msg, sink, "INVALID_VALUE"); return;
                }
                if (!host.hasPlayer(load.id)) { error(msg, sink, "UNAVAILABLE"); return; }
                if ("seek".equals(action)) host.seekPlayer(load.id, ((Number)value).doubleValue());
                else host.volumePlayer(load.id, ((Number)value).doubleValue());
                ack(msg, sink, load.owner.bindingId, "seek".equals(action) ? "accepted" : "completed");
                break;
            }
            case "release": {
                String binding = load.owner.bindingId;
                host.releasePlayer(load.id);
                ack(msg, sink, binding, "completed");
                break;
            }
            default: error(msg, sink, "PROTOCOL_ERROR");
        }
    }

    private void ack(JSONObject msg, PlaybackService.Sink sink, String binding, String phase) throws JSONException {
        send(sink, new JSONObject().put("id", text(msg, "id")).put("event", "transportControlAck")
            .put("version", 1).put("requestId", text(msg, "requestId")).put("action", text(msg, "action"))
            .put("scope", scope(binding)).put("phase", phase));
    }

    boolean observation(String id, String event) {
        Load load = loads.get(id);
        if (load == null) return false;
        load.owner.observation(event);
        return true;
    }

    void forget(String id) {
        Load load = loads.remove(id);
        if (load == null) return;
        load.owner.retire();
        if (load.reservation != null) handler.removeCallbacks(load.reservation);
        load.sink = null;
        grants.entrySet().removeIf(entry -> entry.getValue().id().equals(id));
    }

    void detach(Object attachment) {
        grants.entrySet().removeIf(entry -> entry.getValue().attachment() == attachment);
        for (Load load : loads.values()) if (load.attachment == attachment) {
            load.authorized = false; load.sink = null; load.owner.retire();
        }
    }

    private void state(Load load, OrderedTransport.Update update) {
        if (!load.authorized || load.sink == null) return;
        try {
            OrderedTransport.Snapshot value = update.snapshot();
            OrderedTransport.Intent intent = value.intent();
            OrderedTransport.Observation observed = value.observed();
            JSONObject actual = new JSONObject().put("isPlaying", observed.isPlaying())
                .put("playWhenReady", observed.playWhenReady()).put("state", observed.state())
                .put("suppressionReason", observed.suppressionReason()).put("policyReason", observed.policyReason());
            JSONObject snapshot = new JSONObject().put("processedWebRevision", value.processed())
                .put("appliedWebRevision", value.applied()).put("intent", new JSONObject()
                    .put("revision", intent.revision()).put("playWhenReady", intent.playWhenReady())
                    .put("origin", intent.origin()).put("webRevision", intent.webRevision() == null ? JSONObject.NULL : intent.webRevision()))
                .put("observed", actual);
            JSONObject transport = scope(update.bindingId()).put("version", 1).put("eventSeq", update.sequence()).put("snapshot", snapshot);
            if (update.result() != null) transport.put("result", result(update.result()));
            if (update.requestError() != null) transport.put("requestError", new JSONObject()
                .put("webRevision", update.requestRevision()).put("action", update.requestAction()).put("reason", update.requestError()));
            if (update.replyTo() != null) transport.put("replyTo", update.replyTo());
            if (update.lookupRevision() != null) transport.put("lookup", new JSONObject()
                .put("webRevision", update.lookupRevision()).put("status", update.lookupResult() == null ? "notFound"
                    : "accepted".equals(update.lookupResult().phase()) ? "pending" : "terminal")
                .put("result", update.lookupResult() == null ? JSONObject.NULL : result(update.lookupResult())));
            send(load.sink, new JSONObject().put("id", load.id).put("event", update.event()).put("transport", transport)
                .put("position", observed.position()).put("duration", observed.duration())
                .put("playing", observed.isPlaying()).put("playWhenReady", observed.playWhenReady()));
        } catch (JSONException ignored) { /* No private source data is included in transport diagnostics. */ }
    }

    private static JSONObject result(OrderedTransport.Result result) throws JSONException {
        JSONObject value = new JSONObject().put("webRevision", result.revision()).put("action", result.action())
            .put("phase", result.phase()).put("decisionIntentRevision", result.decision() == null ? JSONObject.NULL : result.decision());
        if (result.reason() != null) value.put("reason", result.reason());
        return value;
    }

    private void error(JSONObject msg, PlaybackService.Sink sink, String reason) {
        try {
            String id = text(msg, "id"), action = text(msg, "action");
            JSONObject correlation = new JSONObject().put("action", action);
            JSONObject attempted = msg.optJSONObject("transport");
            if (attempted == null && "transportBind".equals(action)) attempted = msg;
            boolean knownScope = attempted != null && uuid(text(attempted, "engineId")) && uuid(text(attempted, "bindingId"));
            if (knownScope) correlation.put("attemptedScope", new JSONObject()
                .put("engineId", text(attempted, "engineId")).put("bindingId", text(attempted, "bindingId")));
            if ("play".equals(action) || "pause".equals(action)) {
                Long revision = number(attempted, "webRevision", true);
                if (!knownScope || revision == null) return;
                correlation.put("webRevision", revision);
            } else {
                if (!("transportHello".equals(action) || "transportBind".equals(action)
                    || "transportReadState".equals(action) || "load".equals(action)
                    || "seek".equals(action) || "volume".equals(action) || "release".equals(action))) return;
                if (!uuid(text(msg, "requestId"))) return;
                correlation.put("requestId", text(msg, "requestId"));
            }
            send(sink, new JSONObject().put("id", id).put("event", "transportControlError")
                .put("version", 1).put("correlation", correlation).put("reason", reason));
        } catch (JSONException ignored) { /* A malformed request has no fabricated correlation. */ }
    }

    private JSONObject scope(String binding) throws JSONException {
        return new JSONObject().put("engineId", engineId).put("bindingId", binding);
    }
    private boolean scopeMatches(JSONObject msg, Load load) {
        JSONObject scope = msg.optJSONObject("transport");
        return scope != null && Long.valueOf(1).equals(number(scope, "version", true))
            && engineId.equals(text(scope, "engineId")) && load.owner.bindingId.equals(text(scope, "bindingId"));
    }
    private static boolean sameBind(JSONObject a, JSONObject b) {
        if (a == null) return false;
        for (String key : new String[]{"id", "requestId", "engineId", "bindingId", "bindGrant"})
            if (!text(a, key).equals(text(b, key))) return false;
        return Objects.equals(a.opt("expectedBindingId"), b.opt("expectedBindingId"));
    }
    static String text(JSONObject object, String key) {
        return object != null && object.opt(key) instanceof String ? (String)object.opt(key) : "";
    }
    static Long number(JSONObject object, String key, boolean positive) {
        Object raw = object == null ? null : object.opt(key);
        if (!(raw instanceof Number)) return null;
        double value = ((Number)raw).doubleValue();
        return Double.isFinite(value) && value >= (positive ? 1 : 0) && value <= OrderedTransport.MAX
            && value == Math.rint(value) ? (long)value : null;
    }
    static boolean uuid(String value) {
        return value.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}");
    }
    private static boolean loadId(String value) { return value.startsWith("audio_") && uuid(value.substring(6)); }
    private static void send(PlaybackService.Sink sink, JSONObject value) {
        try { sink.send(value.toString()); } catch (RuntimeException ignored) { /* Detached renderer. */ }
    }
}
