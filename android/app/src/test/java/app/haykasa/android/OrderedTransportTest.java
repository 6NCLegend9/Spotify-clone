package app.haykasa.android;

import org.junit.Test;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

public class OrderedTransportTest {
    private static final class Fixture {
        boolean playWhenReady, playing, immediate, callbacks;
        long now;
        int writes;
        String policy = "none";
        final List<OrderedTransport.Update> events = new ArrayList<>();
        final Map<Runnable, Long> timers = new LinkedHashMap<>();
        final OrderedTransport owner;
        Fixture() {
            owner = new OrderedTransport("binding", false,
                () -> new OrderedTransport.Observation(playing, playWhenReady, "ready", 0, policy, 12, 180),
                this::mutate, events::add, () -> now,
                (task, delay) -> timers.put(task, now + delay), timers::remove);
        }
        void mutate(boolean value) {
            writes++;
            playWhenReady = value;
            playing = value && immediate;
            if (callbacks) owner.observation("transportState");
        }
        OrderedTransport.Update last() { return events.get(events.size() - 1); }
    }

    @Test public void pauseCompletesWithoutAnyCallbackAndAcceptancePrecedesMutation() {
        Fixture f = new Fixture();
        f.owner.command(1, "pause", true);
        assertEquals(1, f.writes);
        assertEquals("accepted", f.events.get(0).result().phase());
        assertEquals("completed", f.last().result().phase());
        assertFalse(f.last().snapshot().observed().isPlaying());
        assertEquals("web", f.last().snapshot().intent().origin());
        assertEquals(Long.valueOf(1), f.last().snapshot().intent().webRevision());
    }

    @Test public void synchronousObservedPlayCannotRunBeforeItsCommandRecord() {
        Fixture f = new Fixture(); f.immediate = true; f.callbacks = true;
        f.owner.command(1, "play", true);
        assertEquals("accepted", f.events.get(0).result().phase());
        assertFalse(f.events.get(0).snapshot().observed().isPlaying());
        assertEquals("completed", f.owner.result(1).phase());
        assertEquals(1L, f.owner.result(1).decision().longValue());
        assertTrue(f.last().snapshot().observed().isPlaying());
        assertTrue(f.timers.isEmpty());
    }

    @Test public void pendingPlayThenPauseDoesNotGetRestoredByAnOldCallbackArgument() {
        Fixture f = new Fixture();
        f.owner.command(1, "play", true);
        assertEquals("accepted", f.owner.result(1).phase());
        f.owner.command(2, "pause", true);
        f.owner.observation("transportState"); // Native producer reads CURRENT getters, no old boolean.
        assertEquals("SUPERSEDED", f.owner.result(1).reason());
        assertEquals("completed", f.owner.result(2).phase());
        assertFalse(f.last().snapshot().intent().playWhenReady());
        assertFalse(f.last().snapshot().observed().isPlaying());
        assertEquals(2, f.last().snapshot().processed());
    }

    @Test public void systemPlayAfterPauseCarriesPauseWatermarkAndNewerIntent() {
        Fixture f = new Fixture(); f.immediate = true;
        f.owner.command(1, "pause", true);
        OrderedTransport.Update oldAck = f.last();
        f.owner.system(true, () -> f.mutate(true));
        assertTrue(f.last().snapshot().observed().isPlaying());
        assertEquals("system", f.last().snapshot().intent().origin());
        assertEquals(1, f.last().snapshot().processed());
        assertEquals(1, f.last().snapshot().applied());
        assertNull(f.last().snapshot().intent().webRevision());
        assertTrue(f.last().sequence() > oldAck.sequence());
        assertTrue(f.last().snapshot().intent().revision() > oldAck.snapshot().intent().revision());
        assertFalse(oldAck.snapshot().intent().playWhenReady());
    }

    @Test public void duplicateCompletedPlayDoesNotUndoNewerSystemPause() {
        Fixture f = new Fixture(); f.immediate = true;
        f.owner.command(1, "play", true);
        OrderedTransport.Result historical = f.owner.result(1);
        f.owner.system(false, () -> f.mutate(false));
        int before = f.writes;
        f.owner.command(1, "play", true);
        assertEquals(before, f.writes);
        assertSame(historical, f.last().result());
        assertEquals("completed", historical.phase());
        assertFalse(f.last().snapshot().intent().playWhenReady());
        assertFalse(f.last().snapshot().observed().isPlaying());
        assertEquals("system", f.last().snapshot().intent().origin());
    }

    @Test public void rejectedNewestCommandAdvancesOnlyProcessedWatermark() {
        Fixture f = new Fixture();
        f.owner.command(1, "pause", true);
        f.owner.command(2, "play", false);
        assertEquals(2, f.last().snapshot().processed());
        assertEquals(1, f.last().snapshot().applied());
        assertNull(f.last().result().decision());
        assertEquals("UNAVAILABLE", f.last().result().reason());
        assertFalse(f.last().snapshot().intent().playWhenReady());
    }

    @Test public void noOpPlayCompletesFromFreshPostCommandStateWithoutCallback() {
        Fixture f = new Fixture(); f.immediate = true; f.playing = true; f.playWhenReady = true;
        f.owner.command(1, "play", true);
        assertEquals("completed", f.owner.result(1).phase());
        assertTrue(f.timers.isEmpty());
    }

    @Test public void observationsAndFocusDoNotInventSystemIntent() {
        Fixture f = new Fixture(); f.owner.command(1, "play", true);
        long revision = f.owner.intent().revision();
        f.playWhenReady = false; f.policy = "focus";
        f.owner.observation("waiting");
        assertEquals(revision, f.owner.intent().revision());
        assertTrue(f.owner.intent().playWhenReady());
        assertEquals("web", f.owner.intent().origin());
        assertEquals("focus", f.last().snapshot().observed().policyReason());
    }

    @Test public void supersededAndRetiredDeadlinesCannotPauseNewIntent() {
        Fixture f = new Fixture(); f.owner.command(1, "play", true);
        Runnable oldTimer = f.timers.keySet().iterator().next();
        f.owner.system(true, () -> f.mutate(true));
        f.now = 40_000; int writes = f.writes;
        oldTimer.run();
        assertEquals(writes, f.writes);
        assertTrue(f.owner.intent().playWhenReady());
        f.owner.command(2, "play", true);
        Runnable beforeRebind = f.timers.keySet().iterator().next();
        f.owner.retire(); f.now += 40_000;
        beforeRebind.run();
        assertEquals(writes + 1, f.writes);
        assertTrue(f.timers.isEmpty());
    }

    @Test public void elapsedDeadlineWinsOverLaterObservationWithoutTouchingAnotherOwner() {
        Fixture f = new Fixture(); f.owner.command(1, "play", true);
        f.now = 30_001; f.playing = true;
        f.owner.observation("progress");
        assertEquals("TIMEOUT", f.owner.result(1).reason());
        assertEquals("policy", f.owner.intent().origin());
        assertFalse(f.playWhenReady);
        assertFalse(f.playing);
        assertEquals("timeout", f.last().snapshot().observed().policyReason());
    }

    @Test public void terminalCacheEvictionNeverReplaysACommand() {
        Fixture f = new Fixture();
        for (int i = 1; i <= 40; i++) f.owner.command(i, "pause", true);
        int writes = f.writes;
        f.owner.command(1, "pause", true);
        assertEquals("REPLAY_EXPIRED", f.last().requestError());
        f.owner.command(40, "play", true);
        assertEquals("COMMAND_CONFLICT", f.last().requestError());
        f.owner.command(105, "pause", true);
        assertEquals("REVISION_GAP", f.last().requestError());
        assertEquals(40, f.last().snapshot().processed());
        assertEquals(writes, f.writes);
        f.owner.read("lookup", 1L);
        assertEquals(Long.valueOf(1), f.last().lookupRevision());
        assertNull(f.last().lookupResult());
    }

    @Test public void exhaustedEventCounterNeverWrapsOrRestartsAudio() throws Exception {
        Fixture f = new Fixture();
        Field seq = OrderedTransport.class.getDeclaredField("sequence"); seq.setAccessible(true);
        seq.setLong(f.owner, OrderedTransport.MAX);
        f.owner.read("request", null);
        assertTrue(f.owner.exhausted());
        assertTrue(f.events.isEmpty());
        assertEquals(0, f.writes);
        f.owner.system(true, () -> f.mutate(true));
        assertTrue(f.playWhenReady);
        assertTrue(f.events.isEmpty());
    }
}
