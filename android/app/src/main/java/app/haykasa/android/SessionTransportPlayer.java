package app.haykasa.android;

import androidx.media3.common.ForwardingSimpleBasePlayer;
import androidx.media3.common.Player;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/** Only MediaSession commands pass this hook; bridge/policy changes use the raw player. */
@androidx.media3.common.util.UnstableApi
final class SessionTransportPlayer extends ForwardingSimpleBasePlayer {
    private final Player raw;
    private final boolean idle;
    private final BiConsumer<Boolean, Runnable> transport;
    private final Consumer<String> diagnostic;
    SessionTransportPlayer(Player raw, boolean idle, BiConsumer<Boolean, Runnable> transport, Consumer<String> diagnostic) {
        super(raw);
        this.raw = raw; this.idle = idle; this.transport = transport;
        this.diagnostic = diagnostic;
    }
    @Override protected State getState() {
        State value = super.getState();
        return idle ? value.buildUpon().setAvailableCommands(Player.Commands.EMPTY).build() : value;
    }
    @Override protected ListenableFuture<?> handleSetPlayWhenReady(boolean value) {
        diagnostic.accept(value ? "session-command play" : "session-command pause");
        transport.accept(value, () -> raw.setPlayWhenReady(value));
        return Futures.immediateVoidFuture();
    }
    @Override protected ListenableFuture<?> handleStop() {
        diagnostic.accept("session-command stop");
        transport.accept(false, () -> { raw.setPlayWhenReady(false); raw.stop(); });
        return Futures.immediateVoidFuture();
    }
}
