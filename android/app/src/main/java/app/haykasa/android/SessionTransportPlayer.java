package app.haykasa.android;

import androidx.media3.common.ForwardingSimpleBasePlayer;
import androidx.media3.common.Player;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.BooleanSupplier;
import java.util.function.IntPredicate;

/** Only MediaSession commands pass this hook; bridge/policy changes use the raw player. */
@androidx.media3.common.util.UnstableApi
final class SessionTransportPlayer extends ForwardingSimpleBasePlayer {
    private final Player raw;
    private final boolean idle;
    private final BiConsumer<Boolean, Runnable> transport;
    private final Consumer<String> diagnostic;
    private final IntPredicate skip;
    private final BooleanSupplier ownsQueue;
    SessionTransportPlayer(Player raw, boolean idle, BiConsumer<Boolean, Runnable> transport, Consumer<String> diagnostic) {
        this(raw, idle, transport, diagnostic, direction -> false, () -> false);
    }
    SessionTransportPlayer(Player raw, boolean idle, BiConsumer<Boolean, Runnable> transport, Consumer<String> diagnostic,
                           IntPredicate skip, BooleanSupplier ownsQueue) {
        super(raw);
        this.raw = raw; this.idle = idle; this.transport = transport;
        this.diagnostic = diagnostic;
        this.skip = skip; this.ownsQueue = ownsQueue;
    }
    @Override protected State getState() {
        State value = super.getState();
        // Repeat is owned by the app's scoped configuration. An unobserved OS
        // mutation would make its acknowledged setting disagree with the decoder.
        Player.Commands.Builder commands = value.availableCommands.buildUpon().remove(Player.COMMAND_SET_REPEAT_MODE);
        if (ownsQueue.getAsBoolean()) commands.remove(Player.COMMAND_SET_SHUFFLE_MODE)
            .remove(Player.COMMAND_CHANGE_MEDIA_ITEMS).remove(Player.COMMAND_SET_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
            .add(Player.COMMAND_SEEK_TO_PREVIOUS).add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM);
        return value.buildUpon().setAvailableCommands(idle ? Player.Commands.EMPTY : commands.build()).build();
    }
    @Override protected ListenableFuture<?> handleSeek(int mediaItemIndex, long positionMs, int seekCommand) {
        int direction = seekCommand == Player.COMMAND_SEEK_TO_NEXT || seekCommand == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM ? 1
            : seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS || seekCommand == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM ? -1 : 0;
        if (direction != 0 && skip.test(direction)) return Futures.immediateVoidFuture();
        return super.handleSeek(mediaItemIndex, positionMs, seekCommand);
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
