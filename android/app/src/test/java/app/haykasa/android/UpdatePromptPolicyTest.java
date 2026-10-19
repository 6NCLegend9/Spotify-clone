package app.haykasa.android;

import org.junit.Test;
import static org.junit.Assert.*;
import static app.haykasa.android.UpdatePromptPolicy.Action.*;

public class UpdatePromptPolicyTest {
    @Test public void onlyAnAvailableAllowedFlexibleUpdateRequestsConsent() {
        UpdatePromptPolicy policy = new UpdatePromptPolicy();
        assertEquals(NONE, policy.decide(0, true, true, false));
        assertEquals(NONE, policy.decide(2, false, true, false));
        assertEquals(NONE, policy.decide(2, true, false, false));
        assertEquals(OFFER_FLEXIBLE, policy.decide(2, true, true, false));
        // A failed attempt to launch Google's consent UI must not suppress it.
        assertEquals(OFFER_FLEXIBLE, policy.decide(2, true, true, false));
        policy.record(OFFER_FLEXIBLE, 2);
        assertEquals(NONE, policy.decide(2, true, true, false));
        assertEquals(OFFER_FLEXIBLE, policy.decide(3, true, true, false));
    }

    @Test public void downloadedUpdatesStillOfferRestartAfterConsentButRespectLater() {
        UpdatePromptPolicy policy = new UpdatePromptPolicy();
        policy.record(OFFER_FLEXIBLE, 2);
        assertEquals(OFFER_RESTART, policy.decide(2, false, false, true));
        // Merely displaying/dismissing for Activity pause is not a deferral.
        assertEquals(OFFER_RESTART, policy.decide(2, true, true, true));
        policy.record(OFFER_RESTART, 2);
        assertEquals(NONE, policy.decide(2, true, true, true));
        assertEquals(OFFER_RESTART, policy.decide(3, false, false, true));
    }
}
