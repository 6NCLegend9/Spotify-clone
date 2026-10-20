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
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ExoPlayer idle;
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
        PendingIntent activity = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        session = new MediaSession.Builder(this, idle).setSessionActivity(activity).build();
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
        String id = msg.optString("id"), action = msg.optString("action");
        if (!MediaPolicy.isId(id)) return;
        if ("release".equals(action)) { release(id); return; }
        ExoPlayer player = players.get(id);
        if ("load".equals(action)) {
            String url = msg.optString("url");
            if (!MediaPolicy.isAsset(url)) {
                sink.send(new JSONObject().put("id", id).put("event", "error").toString());
                return;
            }
            if (player == null) {
                if (players.size() >= 2) {
                    for (String old : players.keySet().toArray(new String[0])) {
                        if (players.get(old) != session.getPlayer()) { release(old); break; }
                    }
                    if (players.size() >= 2) return;
                }
                player = new ExoPlayer.Builder(this).setMediaSourceFactory(sourceFactory).build();
                player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true);
                player.setHandleAudioBecomingNoisy(true);
                player.setWakeMode(C.WAKE_MODE_LOCAL);
                final String key = id;
                player.addListener(new Player.Listener() {
                    @Override public void onPlaybackStateChanged(int state) {
                        emit(key, state == Player.STATE_READY ? "ready" : state == Player.STATE_ENDED ? "ended" : "waiting");
                    }
                    @Override public void onIsPlayingChanged(boolean playing) { ExoPlayer own = players.get(key); emit(key, playing ? "playing" : own != null && own.getPlayWhenReady() ? "waiting" : "pause"); }
                    @Override public void onPlayerError(PlaybackException error) {
                        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                            android.util.Log.d("HayKasaMediaQA", "error code=" + error.getErrorCodeName());
                        }
                        emit(key, "error");
                    }
                });
                players.put(id, player);
            }
            sinks.put(id, sink);
            String title = msg.optString("title", "HayKasa");
            if (title.length() > 300) title = title.substring(0, 300);
            player.setMediaItem(new MediaItem.Builder().setUri(url).setMediaMetadata(new MediaMetadata.Builder().setTitle(title).build()).build());
            player.prepare();
            return;
        }
        if (player == null) return;
        if (("seek".equals(action) || "volume".equals(action)) && !Double.isFinite(msg.optDouble("value", Double.NaN))) return;
        switch (action) {
            case "play":
                if (session.getPlayer() != player) { session.getPlayer().pause(); session.setPlayer(player); }
                player.play(); break;
            case "pause": player.pause(); break;
            case "seek": player.seekTo((long)(Math.max(0, Math.min(1801, msg.optDouble("value", 0))) * 1000)); break;
            case "volume": player.setVolume((float)Math.max(0, Math.min(1, msg.optDouble("value", 1)))); break;
            default: break;
        }
    }
    private void emit(String id, String event) {
        ExoPlayer p = players.get(id); Sink sink = sinks.get(id);
        if (p == null || sink == null) return;
        try {
            JSONObject json = new JSONObject().put("id", id).put("event", event)
                .put("position", Math.max(0, p.getCurrentPosition()) / 1000.0)
                .put("duration", p.getDuration() > 0 ? p.getDuration() / 1000.0 : 0)
                .put("playing", p.getPlayWhenReady());
            sink.send(json.toString());
        } catch (Exception ignored) { /* Never log signed media URLs or session cookies. */ }
    }
    private void release(String id) {
        sinks.remove(id); ExoPlayer p = players.remove(id);
        if (p != null) { if (session.getPlayer() == p) session.setPlayer(idle); p.release(); }
    }
    public void detachSinks() { sinks.clear(); }
    public void releaseAll() { for (String id : players.keySet().toArray(new String[0])) release(id); }
    @Override public void onTaskRemoved(Intent rootIntent) {
        if (!session.getPlayer().getPlayWhenReady()) { releaseAll(); stopSelf(); }
    }
    @Override public void onDestroy() {
        handler.removeCallbacksAndMessages(null); releaseAll(); session.release(); idle.release(); super.onDestroy();
    }
}
