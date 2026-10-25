package app.haykasa.android;

import java.util.LinkedHashMap;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Looper-confined D06 transport decisions. No URLs, Android callbacks, or wall clocks. */
final class OrderedTransport {
    static final long MAX = 9_007_199_254_740_991L;
    static final long PLAY_TIMEOUT_MS = 30_000;
    record Intent(long revision, boolean playWhenReady, String origin, Long webRevision) {}
    record Observation(boolean isPlaying, boolean playWhenReady, String state,
                       int suppressionReason, String policyReason, double position, double duration) {
        static Observation idle() { return new Observation(false, false, "idle", 0, "none", 0, 0); }
    }
    record Snapshot(long processed, long applied, Intent intent, Observation observed) {}
    record Result(long revision, String action, String phase, Long decision, String reason) {}
    record Update(String bindingId, long sequence, String event, Snapshot snapshot,
                  Result result, String requestError, long requestRevision, String requestAction,
                  String replyTo, Long lookupRevision, Result lookupResult) {}

    final String bindingId;
    private final Supplier<Observation> observe;
    private final Consumer<Boolean> mutate;
    private final Consumer<Update> output;
    private final LongSupplier clock;
    private final BiConsumer<Runnable, Long> schedule;
    private final Consumer<Runnable> cancel;
    private final LinkedHashMap<Long, Result> terminal = new LinkedHashMap<>();
    private long processed, applied, sequence;
    private Intent intent;
    private Result pending;
    private Runnable deadline;
    private long expiresAt;
    private boolean live = true, exhausted;
    private String policyReason = "none";

    OrderedTransport(String bindingId, boolean baselineIntent, Supplier<Observation> observe,
                     Consumer<Boolean> mutate, Consumer<Update> output, LongSupplier clock,
                     BiConsumer<Runnable, Long> schedule, Consumer<Runnable> cancel) {
        this.bindingId = bindingId;
        this.observe = observe;
        this.mutate = mutate;
        this.output = output;
        this.clock = clock;
        this.schedule = schedule;
        this.cancel = cancel;
        intent = new Intent(0, baselineIntent, "baseline", null);
    }

    boolean exhausted() { return exhausted; }
    boolean live() { return live; }
    Intent intent() { return intent; }
    Snapshot snapshot() {
        Observation value = observe.get();
        if (!"none".equals(policyReason)) value = new Observation(value.isPlaying(), value.playWhenReady(),
            value.state(), value.suppressionReason(), policyReason, value.position(), value.duration());
        return new Snapshot(processed, applied, intent, value);
    }
    Result result(long revision) {
        return pending != null && pending.revision() == revision ? pending : terminal.get(revision);
    }

    void read(String replyTo, Long revision) {
        expire();
        emit("transportState", null, null, 0, null, replyTo, revision);
    }

    void command(long revision, String action, boolean available) {
        if (!live || exhausted) return;
        if (revision < 1 || revision > MAX || !("play".equals(action) || "pause".equals(action))) {
            throw new IllegalArgumentException("Invalid transport command");
        }
        expire();
        Result previous = result(revision);
        if (previous != null) {
            if (previous.action().equals(action)) emit("transportState", previous, null, 0, null, null, null);
            else requestError(revision, action, "COMMAND_CONFLICT");
            return;
        }
        if (revision <= processed) { requestError(revision, action, "REPLAY_EXPIRED"); return; }
        if (revision - processed > 64) { requestError(revision, action, "REVISION_GAP"); return; }
        if (intent.revision() == MAX || sequence == MAX) { exhaust(); return; }
        processed = revision;
        if (!available) {
            finish(new Result(revision, action, "rejected", null, "UNAVAILABLE"));
            return;
        }
        applied = revision;
        intent = new Intent(intent.revision() + 1, "play".equals(action), "web", revision);
        policyReason = "none";
        supersede();
        Result accepted = new Result(revision, action, "accepted", intent.revision(), null);
        if ("play".equals(action)) {
            pending = accepted;
            expiresAt = clock.getAsLong() + PLAY_TIMEOUT_MS;
            final Result own = accepted;
            deadline = () -> { if (live && pending == own) expire(); };
            schedule.accept(deadline, PLAY_TIMEOUT_MS);
        }
        // The decision/deadline and acceptance exist before synchronous player listeners run.
        emit("transportState", accepted, null, 0, null, null, null);
        try {
            mutate.accept(intent.playWhenReady());
        } catch (RuntimeException failure) {
            if ("play".equals(action) && pending != accepted) return;
            if (pending == accepted) clearPending();
            finish(new Result(revision, action, "rejected", accepted.decision(), "UNAVAILABLE"));
            return;
        }
        if ("pause".equals(action)) {
            Observation actual = observe.get();
            finish(new Result(revision, action,
                !actual.playWhenReady() && !actual.isPlaying() ? "completed" : "rejected",
                accepted.decision(), !actual.playWhenReady() && !actual.isPlaying() ? null : "UNAVAILABLE"));
        } else completeObservedPlay();
    }

    /** Called only at explicit session-control entry, never from an observation callback. */
    void system(boolean playing, Runnable mutation) {
        if (!live) { mutation.run(); return; }
        if (intent.revision() == MAX) exhaust();
        intent = new Intent(exhausted ? intent.revision() : intent.revision() + 1, playing, "system", null);
        policyReason = "none";
        supersede();
        mutation.run();
        emit("transportState", null, null, 0, null, null, null);
    }

    void policyPause(String reason) {
        if (!live) { mutate.accept(false); return; }
        if (intent.revision() == MAX) exhaust();
        intent = new Intent(exhausted ? intent.revision() : intent.revision() + 1, false, "policy", null);
        policyReason = reason;
        supersede();
        mutate.accept(false);
        emit("transportState", null, null, 0, null, null, null);
    }

    void observation(String event) {
        if (!live || exhausted) return;
        expire();
        if ("error".equals(event) && pending != null) {
            Result own = pending;
            clearPending();
            finish(new Result(own.revision(), own.action(), "rejected", own.decision(), "PLAYER_ERROR"));
        } else completeObservedPlay();
        emit(event, null, null, 0, null, null, null);
    }

    private void completeObservedPlay() {
        if (pending == null || !live || exhausted) return;
        Result own = pending;
        if (!owns(own)) return;
        if (observe.get().isPlaying()) {
            clearPending();
            finish(new Result(own.revision(), own.action(), "completed", own.decision(), null));
        }
    }

    private boolean owns(Result own) {
        return "web".equals(intent.origin()) && intent.playWhenReady()
            && intent.webRevision() != null && intent.webRevision() == own.revision()
            && own.decision() != null && intent.revision() == own.decision();
    }

    private void expire() {
        if (!live || pending == null || clock.getAsLong() < expiresAt) return;
        Result own = pending;
        boolean current = owns(own);
        clearPending();
        if (current) {
            if (intent.revision() == MAX) exhaust();
            intent = new Intent(exhausted ? intent.revision() : intent.revision() + 1, false, "policy", null);
            policyReason = "timeout";
            try { mutate.accept(false); } catch (RuntimeException ignored) { /* Report actual state below. */ }
        }
        finish(new Result(own.revision(), own.action(), "rejected", own.decision(), current ? "TIMEOUT" : "SUPERSEDED"));
    }

    private void supersede() {
        if (pending == null) return;
        Result own = pending;
        clearPending();
        finish(new Result(own.revision(), own.action(), "rejected", own.decision(), "SUPERSEDED"));
    }

    private void clearPending() {
        if (deadline != null) cancel.accept(deadline);
        pending = null;
        deadline = null;
    }

    private void finish(Result value) {
        if (!terminal.containsKey(value.revision())) {
            terminal.put(value.revision(), value);
            if (terminal.size() > 32) terminal.remove(terminal.keySet().iterator().next());
        }
        emit("transportState", terminal.get(value.revision()), null, 0, null, null, null);
    }

    private void requestError(long revision, String action, String reason) {
        emit("transportState", null, reason, revision, action, null, null);
    }

    private void emit(String event, Result result, String requestError, long revision, String action,
                      String replyTo, Long lookupRevision) {
        if (!live || exhausted) return;
        if (sequence == MAX) { exhaust(); return; }
        output.accept(new Update(bindingId, ++sequence, event, snapshot(), result,
            requestError, revision, action, replyTo, lookupRevision,
            lookupRevision == null ? null : result(lookupRevision)));
    }

    private void exhaust() { exhausted = true; clearPending(); }
    void retire() { live = false; clearPending(); terminal.clear(); }
}
