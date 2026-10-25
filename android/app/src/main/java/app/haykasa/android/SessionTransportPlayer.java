package app.haykasa.android;

import androidx.media3.common.ForwardingSimpleBasePlayer;
import androidx.media3.common.Player;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.BiConsumer;

/** Only MediaSession commands pass this hook; bridge/policy changes use the raw player. */
@androidx.media3.common.util.UnstableApi
final class SessionTransportPlayer extends ForwardingSimpleBasePlayer {
    private final Player raw;
    private final boolean idle;
    private final BiConsumer<Boolean, Runnable> transport;
    SessionTransportPlayer(Player raw, boolean idle, BiConsumer<Boolean, Runnable> transport) {
        super(raw);
        this.raw = raw; this.idle = idle; this.transport = transport;
    }
    @Override protected State getState() {
        State value = super.getState();
        return idle ? value.buildUpon().setAvailableCommands(Player.Commands.EMPTY).build() : value;
    }
    @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
        transport.accept(value, () -> raw.setPlayWhenReady(value));
        return Futures.immediateVoidFuture();
    }
    @Override protected ListenableFuture<?> handleStop() {
        transport.accept(false, () -> { raw.setPlayWhenReady(false); raw.stop(); });
        return Futures.immediateVoidFuture();
    }
}
