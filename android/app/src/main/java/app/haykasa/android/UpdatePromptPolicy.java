package app.haykasa.android;

import java.util.HashSet;
import java.util.Set;

/** Session-only decisions: dismissing a prompt never installs an update. */
final class UpdatePromptPolicy {
    enum Action { NONE, OFFER_FLEXIBLE, OFFER_RESTART }
    private final Set<Integer> consentPrompts = new HashSet<>();
    private final Set<Integer> restartPrompts = new HashSet<>();

    synchronized Action decide(int version, boolean available, boolean flexibleAllowed, boolean downloaded) {
        if (version <= 0) return Action.NONE;
        if (downloaded) return restartPrompts.contains(version) ? Action.NONE : Action.OFFER_RESTART;
        return available && flexibleAllowed && !consentPrompts.contains(version)
            ? Action.OFFER_FLEXIBLE : Action.NONE;
    }

    synchronized void record(Action action, int version) {
        if (version <= 0) return;
        if (action == Action.OFFER_FLEXIBLE) consentPrompts.add(version);
        if (action == Action.OFFER_RESTART) restartPrompts.add(version);
    }
}
