package app.haykasa.android;

import android.app.AlertDialog;
import android.content.Context;
import android.webkit.WebView;
import android.widget.TextView;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.TaskCompletionSource;
import com.google.android.play.core.appupdate.testing.FakeAppUpdateManager;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual updater/dialog/lifecycle; only Google's store transport is controlled. */
@RunWith(AndroidJUnit4.class)
public class PlayAppUpdaterTest {
    private static final AtomicInteger VERSIONS = new AtomicInteger(90000);
    private ActivityScenario<MainActivity> scenario;
    private PlayAppUpdater updater;
    private Store store;
    private MainActivity activity;

    private static final class Store extends FakeAppUpdateManager {
        int attempts;
        boolean throwNext;
        final List<TaskCompletionSource<Void>> completions = new ArrayList<>();
        Store(Context context) { super(context); }
        @Override public Task<Void> completeUpdate() {
            attempts++;
            if (throwNext) { throwNext = false; throw new IllegalStateException("Isolated Play failure"); }
            TaskCompletionSource<Void> completion = new TaskCompletionSource<>();
            completions.add(completion);
            return completion.getTask();
        }
    }

    private void main(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private static Object read(Object target, String name) {
        try {
            Field field = target.getClass().getDeclaredField(name); field.setAccessible(true);
            return field.get(target);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private static void write(Object target, String name, Object value) {
        try {
            Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); field.set(target, value);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }
    private AlertDialog dialog() { return (AlertDialog)read(updater, "restartDialog"); }
    private void await(String message, BooleanSupplier condition) throws Exception {
        AtomicReference<Boolean> result = new AtomicReference<>(false);
        for (int attempt = 0; attempt < 50; attempt++) {
            main(() -> result.set(condition.getAsBoolean()));
            if (result.get()) return;
            Thread.sleep(100);
        }
        fail(message);
    }
    private void awaitDialog() throws Exception {
        await("Downloaded update must offer Restart", () -> dialog() != null && dialog().isShowing());
    }
    private void awaitRetry() throws Exception {
        await("Failed Restart must retain a visible, enabled Retry", () -> {
            AlertDialog dialog = dialog();
            TextView message = dialog == null ? null : dialog.findViewById(android.R.id.message);
            return dialog != null && dialog.isShowing() && message != null
                && activity.getString(R.string.update_restart_failed).contentEquals(message.getText())
                && dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled()
                && activity.getString(R.string.try_again).contentEquals(dialog.getButton(AlertDialog.BUTTON_POSITIVE).getText());
        });
    }
    private void clickRestart() { main(() -> dialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick()); }
    private void failAttempt(int index) {
        main(() -> store.completions.get(index).setException(new IllegalStateException("Isolated Play failure")));
    }
    private void settle() { InstrumentationRegistry.getInstrumentation().waitForIdleSync(); }

    private void verifyLandscapeRetry() throws Exception {
        AtomicInteger orientation = new AtomicInteger(), requested = new AtomicInteger();
        main(() -> { orientation.set(activity.getResources().getConfiguration().orientation); requested.set(activity.getRequestedOrientation()); });
        try {
            main(() -> activity.setRequestedOrientation(android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            await("Retry layout must reach landscape", () -> activity.getResources().getConfiguration().orientation == android.content.res.Configuration.ORIENTATION_LANDSCAPE);
            awaitRetry();
            main(() -> {
                for (int button : new int[]{AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE}) {
                    android.view.View view = dialog().getButton(button);
                    android.graphics.Rect visible = new android.graphics.Rect();
                    assertTrue("Retry/Later stay visible in landscape", view.getGlobalVisibleRect(visible));
                    assertEquals(view.getHeight(), visible.height());
                    assertEquals(view.getWidth(), visible.width());
                }
            });
            AndroidPlaybackTest.screenshot("android-update-retry-landscape");
        } finally {
            main(() -> activity.setRequestedOrientation(requested.get()));
            await("Updater test must restore its original orientation", () -> activity.getResources().getConfiguration().orientation == orientation.get());
        }
    }

    @Before public void openDownloadedUpdate() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        scenario.onActivity(instance -> {
            activity = instance;
            WebView web = (WebView)read(instance, "web");
            web.stopLoading(); web.getSettings().setBlockNetworkLoads(true);
            web.loadDataWithBaseURL(MediaPolicy.ORIGIN, "<p>Isolated native updater test</p>", "text/html", "UTF-8", null);
            ((PlayAppUpdater)read(instance, "updater")).close();
            updater = new PlayAppUpdater(instance); // Debug installation has no real store manager.
            store = new Store(instance);
            store.setUpdateAvailable(VERSIONS.incrementAndGet(), AppUpdateType.FLEXIBLE);
            assertTrue(store.startUpdateFlowForResult(store.getAppUpdateInfo().getResult(), instance,
                com.google.android.play.core.appupdate.AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(), 123));
            store.userAcceptsUpdate(); store.downloadStarts(); store.downloadCompletes();
            write(updater, "manager", store);
            store.registerListener((InstallStateUpdatedListener)read(updater, "listener"));
            write(instance, "updater", updater); // Real Activity pause/resume/close callbacks reach this instance.
            updater.checkForUpdates();
        });
        awaitDialog();
    }

    @After public void close() { if (scenario != null) scenario.close(); }

    @Test public void failedRestartIsVisibleAndRetryIsSingleFlight() throws Exception {
        clickRestart();
        main(() -> {
            assertEquals(1, store.attempts);
            assertTrue(dialog().isShowing());
            assertFalse(dialog().getButton(AlertDialog.BUTTON_POSITIVE).isEnabled());
            assertTrue(dialog().getButton(AlertDialog.BUTTON_NEGATIVE).isEnabled());
            assertEquals(activity.getString(R.string.update_hide), dialog().getButton(AlertDialog.BUTTON_NEGATIVE).getText().toString());
            // Even an already-queued click must not start a second request.
            dialog().getButton(AlertDialog.BUTTON_POSITIVE).performClick();
            updater.checkForUpdates();
        });
        settle(); main(() -> assertEquals(1, store.attempts));
        failAttempt(0); awaitRetry();
        AndroidPlaybackTest.screenshot("android-update-retry");
        verifyLandscapeRetry();
        clickRestart(); main(() -> assertEquals(2, store.attempts));
        main(() -> store.completions.get(1).setResult(null));
        await("Accepted restart must dismiss its window", () -> dialog() == null);
        main(updater::checkForUpdates); settle();
        main(() -> assertNull("Accepted restart must not be offered again in this session", dialog()));
    }

    @Test public void synchronousRestartFailureAlsoAllowsRetry() throws Exception {
        main(() -> store.throwNext = true);
        clickRestart(); awaitRetry();
        main(() -> assertEquals(1, store.attempts));
        clickRestart(); main(() -> assertEquals(2, store.attempts));
        failAttempt(0); awaitRetry();
    }

    @Test public void failureAfterBackgroundingDoesNotSuppressTheNextForegroundPrompt() throws Exception {
        clickRestart();
        scenario.moveToState(Lifecycle.State.CREATED);
        failAttempt(0); settle();
        main(() -> assertNull("A background failure must not open a window", dialog()));
        scenario.moveToState(Lifecycle.State.RESUMED); awaitDialog();
        clickRestart(); main(() -> assertEquals(2, store.attempts));
        failAttempt(1); awaitRetry();
    }

    @Test public void resumeBeforeFailedCompletionRestoresRetryWithoutASecondInstall() throws Exception {
        clickRestart();
        scenario.moveToState(Lifecycle.State.CREATED);
        scenario.moveToState(Lifecycle.State.RESUMED); settle();
        main(() -> { assertNull(dialog()); assertEquals(1, store.attempts); });
        failAttempt(0); awaitRetry();
        main(() -> assertEquals(1, store.attempts));
    }

    @Test public void explicitLaterRemainsAuthoritativeAfterAFailure() throws Exception {
        clickRestart(); failAttempt(0); awaitRetry();
        main(() -> dialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick()); settle();
        main(updater::checkForUpdates); settle();
        main(() -> { assertNull(dialog()); assertEquals(1, store.attempts); });
    }

    @Test public void cancelRemainsARealDeferralAndNeverInstalls() throws Exception {
        main(() -> dialog().cancel()); settle();
        main(updater::checkForUpdates); settle();
        main(() -> { assertNull(dialog()); assertEquals(0, store.attempts); });
    }

    @Test public void hidingAPendingRestartDoesNotReopenItAfterFailure() throws Exception {
        clickRestart();
        main(() -> dialog().getButton(AlertDialog.BUTTON_NEGATIVE).performClick()); settle();
        failAttempt(0); settle();
        main(updater::checkForUpdates); settle();
        main(() -> { assertNull(dialog()); assertEquals(1, store.attempts); });
    }

    @Test public void closedUpdaterIgnoresLateFailure() throws Exception {
        clickRestart(); main(updater::close);
        failAttempt(0); settle();
        main(updater::checkForUpdates); settle();
        main(() -> { assertNull(dialog()); assertEquals(1, store.attempts); });
    }
}
