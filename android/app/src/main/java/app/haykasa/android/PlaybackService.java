package app.haykasa.android;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Binder;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

@androidx.media3.common.util.UnstableApi
public final class PlaybackService extends MediaSessionService {
    public interface Sink { void send(String json); }
    public final class LocalBinder extends Binder { PlaybackService service() { return PlaybackService.this; } }
    private final LocalBinder binder = new LocalBinder();
    private final Map<String, ExoPlayer> players = new HashMap<>();
    private final Map<String, Sink> sinks = new HashMap<>();
    private final Map<String, SessionTransportPlayer> wrappers = new HashMap<>();
    private final Map<String, String> policyReasons = new HashMap<>();
    private final Object localAttachment = new Object();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final OrderedMediaBridge ordered = new OrderedMediaBridge(this, handler);
    private ExoPlayer idle;
    private SessionTransportPlayer idleWrapper;
    private String activeId;
    private DefaultMediaSourceFactory sourceFactory;
    private MediaSession session;
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            for (String id : players.keySet()) emit(id, "progress");
            handler.postDelayed(this, 1000);
        }
    };
    @Override public void onCreate() {
        super.onCreate();
        androidx.media3.common.util.Log.setLogLevel(androidx.media3.common.util.Log.LOG_LEVEL_OFF);
        sourceFactory = new DefaultMediaSourceFactory(this);
        idle = new ExoPlayer.Builder(this).build();
        idleWrapper = new SessionTransportPlayer(idle, true, (playing, mutation) -> {});
        PendingIntent activity = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, idleWrapper).setSessionActivity(activity).build();
        // This app binds through LocalBinder, so no MediaController connection
        // invokes onGetSession to register the session on our behalf.
        addSession(session);
        handler.post(ticker);
    }
    @Nullable @Override public IBinder onBind(Intent intent) {
        return "app.haykasa.android.BIND".equals(intent.getAction()) ? binder : super.onBind(intent);
    }
    @Nullable @Override public MediaSession onGetSession(MediaSession.ControllerInfo info) {
        return info.isTrusted() || info.getUid() == getApplicationInfo().uid ? session : null;
    }
    public void command(JSONObject msg, Sink sink) throws Exception {
        command(msg, sink, localAttachment);
    }
    public void command(JSONObject msg, Sink sink, Object attachment) throws Exception {
        if (Looper.myLooper() != handler.getLooper()) throw new IllegalStateException("Media commands require the application looper");
        if (ordered.handle(msg, sink, attachment)) return;
        String id = msg.optString("id"), action = msg.optString("action");
        if (!MediaPolicy.isId(id)) return;
        if ("release".equals(action)) { releasePlayer(id); return; }
        ExoPlayer player = players.get(id);
        if ("load".equals(action)) {
            String url = msg.optString("url");
            if (!MediaPolicy.isAsset(url)) {
                sink.send(new JSONObject().put("id", id).put("event", "error").toString());
                return;
            }
            loadPlayer(id, url, msg.optString("title", "HayKasa"), sink);
            return;
        }
        if (player == null) return;
        if (("seek".equals(action) || "volume".equals(action)) && !Double.isFinite(msg.optDouble("value", Double.NaN))) return;
        switch (action) {
            case "play": setTransportPlaying(id, true); break;
            case "pause": setTransportPlaying(id, false); break;
            case "seek": seekPlayer(id, msg.optDouble("value", 0)); break;
            case "volume": volumePlayer(id, msg.optDouble("value", 1)); break;
            default: break;
        }
    }

    int nativeBuildCode() {
        try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode; }
        catch (android.content.pm.PackageManager.NameNotFoundException error) { throw new IllegalStateException(error); }
    }
    boolean hasPlayer(String id) { return players.containsKey(id); }
    boolean reserveOrderedSlot(String id) {
        if (players.containsKey(id) || ordered.contains(id)) return true;
        int count = ordered.size();
        for (String key : players.keySet()) if (!ordered.contains(key)) count++;
        if (count < 2) return true;
        for (String key : ordered.ids()) if (!key.equals(activeId)) { releasePlayer(key); return true; }
        for (String key : players.keySet().toArray(new String[0])) if (!key.equals(activeId)) { releasePlayer(key); return true; }
        return false;
    }

    void loadPlayer(String id, String url, String title, Sink sink) {
        ExoPlayer player = players.get(id);
        if (player == null) {
            if (!reserveOrderedSlot(id)) throw new IllegalStateException("Media capacity reached");
            player = new ExoPlayer.Builder(this).setMediaSourceFactory(sourceFactory).build();
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
            player.setHandleAudioBecomingNoisy(true);
            player.setWakeMode(C.WAKE_MODE_LOCAL);
            final String key = id;
            final ExoPlayer observedPlayer = player;
            player.addListener(new Player.Listener() {
                @Override public void onPlaybackStateChanged(int state) {
                    if (players.get(key) != observedPlayer) return;
                    int actual = observedPlayer.getPlaybackState();
                    emit(key, actual == Player.STATE_READY ? "ready" : actual == Player.STATE_ENDED ? "ended" : "waiting");
                }
                @Override public void onIsPlayingChanged(boolean playing) {
                    if (players.get(key) != observedPlayer) return;
                    emit(key, observedPlayer.isPlaying() ? "playing" : observedPlayer.getPlayWhenReady() ? "waiting" : "pause");
                }
                @Override public void onPlayWhenReadyChanged(boolean value, int reason) {
                    if (players.get(key) != observedPlayer) return;
                    policyReasons.put(key, reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS ? "focus"
                        : reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY ? "noisy" : "none");
                    if (ordered.contains(key)) emit(key, "transportState");
                }
                @Override public void onPlaybackSuppressionReasonChanged(int reason) {
                    if (players.get(key) != observedPlayer) return;
                    policyReasons.put(key, reason == Player.PLAYBACK_SUPPRESSION_REASON_NONE ? "none" : "focus");
                    if (ordered.contains(key)) emit(key, "transportState");
                }
                @Override public void onPositionDiscontinuity(Player.PositionInfo oldPosition, Player.PositionInfo newPosition, int reason) {
                    if (players.get(key) != observedPlayer) return;
                    if (reason == Player.DISCONTINUITY_REASON_SEEK || reason == Player.DISCONTINUITY_REASON_SEEK_ADJUSTMENT) emit(key, "seeked");
                }
                @Override public void onPlayerError(PlaybackException error) {
                    if (players.get(key) != observedPlayer || observedPlayer.getPlayerError() == null) return;
                    if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                        android.util.Log.d("HayKasaMediaQA", "error code=" + error.getErrorCodeName());
                    }
                    emit(key, "error");
                }
            });
            players.put(id, player);
            ExoPlayer raw = player;
            wrappers.put(id, new SessionTransportPlayer(raw, false, (playing, mutation) -> {
                if (!id.equals(activeId) || players.get(id) != raw) return;
                OrderedTransport owner = ordered.owner(id);
                if (owner == null) mutation.run(); else owner.system(playing, mutation);
            }));
        }
        sinks.put(id, sink);
        if (title.length() > 300) title = title.substring(0, 300);
        player.setMediaItem(new MediaItem.Builder().setUri(url).setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build()).build());
        player.prepare();
    }

    void setTransportPlaying(String id, boolean playing) {
        ExoPlayer player = players.get(id);
        if (player == null) throw new IllegalStateException("Media load missing");
        if (playing && !id.equals(activeId)) {
            ExoPlayer previous = players.get(activeId);
            if (previous != null) {
                OrderedTransport owner = ordered.owner(activeId);
                if (owner == null) previous.pause(); else owner.policyPause("switch");
            }
            activeId = id;
            session.setPlayer(wrappers.get(id));
        }
        player.setPlayWhenReady(playing);
    }
    void seekPlayer(String id, double seconds) { players.get(id).seekTo((long)(Math.max(0, Math.min(1801, seconds)) * 1000)); }
    void volumePlayer(String id, double volume) { players.get(id).setVolume((float)Math.max(0, Math.min(1, volume))); }
    OrderedTransport.Observation observePlayer(String id) {
        ExoPlayer player = players.get(id);
        if (player == null) return OrderedTransport.Observation.idle();
        String state = switch (player.getPlaybackState()) {
            case Player.STATE_READY -> "ready"; case Player.STATE_BUFFERING -> "buffering";
            case Player.STATE_ENDED -> "ended"; default -> "idle";
        };
        return new OrderedTransport.Observation(player.isPlaying(), player.getPlayWhenReady(), state,
            player.getPlaybackSuppressionReason(), policyReasons.getOrDefault(id, "none"),
            Math.max(0, player.getCurrentPosition()) / 1000.0, Math.max(0, player.getDuration()) / 1000.0);
    }
    private void emit(String id, String event) {
        String orderedEvent = "playing".equals(event) || "pause".equals(event) ? "transportState" : event;
        if (ordered.observation(id, orderedEvent)) return;
        ExoPlayer p = players.get(id); Sink sink = sinks.get(id);
        if (p == null || sink == null) return;
        try {
            JSONObject json = new JSONObject().put("id", id).put("event", event)
                .put("position", Math.max(0, p.getCurrentPosition()) / 1000.0)
                .put("duration", p.getDuration() > 0 ? p.getDuration() / 1000.0 : 0)
                .put("playing", p.isPlaying())
                .put("playWhenReady", p.getPlayWhenReady());
            sink.send(json.toString());
        } catch (Exception ignored) { /* Never log signed media URLs or session cookies. */ }
    }
    void releasePlayer(String id) {
        ordered.forget(id);
        sinks.remove(id); ExoPlayer p = players.remove(id);
        policyReasons.remove(id);
        SessionTransportPlayer wrapper = wrappers.remove(id);
        if (id.equals(activeId)) { activeId = null; session.setPlayer(idleWrapper); }
        if (wrapper != null) wrapper.release(); else if (p != null) p.release();
    }
    public void detachSinks() { sinks.clear(); }
    public void detachAttachment(Object attachment) { ordered.detach(attachment); }
    public void releaseAll() {
        for (String id : ordered.ids()) releasePlayer(id);
        for (String id : players.keySet().toArray(new String[0])) releasePlayer(id);
    }
    @Override public void onTaskRemoved(Intent rootIntent) {
        if (!session.getPlayer().getPlayWhenReady()) { releaseAll(); stopSelf(); }
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null); releaseAll(); session.release(); idleWrapper.release(); super.onDestroy();
    }
}
