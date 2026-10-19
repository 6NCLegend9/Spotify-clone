package app.haykasa.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.IntentSender;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/** Google Play owns downloading, consent and installation of native updates. */
final class PlayAppUpdater implements AutoCloseable {
    private static final int UPDATE_REQUEST = 21401;
    private static final UpdatePromptPolicy PROMPTS = new UpdatePromptPolicy();
    private final Activity activity;
    private AppUpdateManager manager;
    private AlertDialog restartDialog;
    private boolean resumed, checking, refreshPending, closed;
    private final InstallStateUpdatedListener listener = state -> {
        if (state.installStatus() == InstallStatus.DOWNLOADED && resumed && !closed) checkForUpdates();
    };

    PlayAppUpdater(Activity activity) {
        this.activity = activity;
        if (!isPlayInstallation(activity)) return;
        try {
            manager = AppUpdateManagerFactory.create(activity);
            manager.registerListener(listener);
        } catch (RuntimeException unavailable) {
            manager = null;
        }
    }

    @SuppressWarnings("deprecation")
    private static boolean isPlayInstallation(Activity activity) {
        if ((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) return false;
        try {
            PackageManager packages = activity.getPackageManager();
            String installer = Build.VERSION.SDK_INT >= 30
                ? packages.getInstallSourceInfo(activity.getPackageName()).getInstallingPackageName()
                : packages.getInstallerPackageName(activity.getPackageName());
            return "com.android.vending".equals(installer);
        } catch (PackageManager.NameNotFoundException | RuntimeException unavailable) {
            return false;
        }
    }

    /** Called on foreground entry; no polling or background checks. */
    void checkForUpdates() {
        resumed = true;
        if (closed || manager == null) return;
        if (checking) { refreshPending = true; return; }
        checking = true;
        try {
            manager.getAppUpdateInfo().addOnSuccessListener(this::finishCheck)
                .addOnFailureListener(unavailable -> finishCheck(null));
        } catch (RuntimeException unavailable) {
            finishCheck(null);
        }
    }

    private void finishCheck(AppUpdateInfo info) {
        checking = false;
        if (!canPrompt()) { refreshPending = false; return; }
        // Download completion can arrive while an older status snapshot is in
        // flight. Consume one fresh check rather than losing that event.
        if (refreshPending) {
            refreshPending = false;
            checkForUpdates();
        } else if (info != null) inspect(info);
    }

    private boolean canPrompt() {
        return resumed && !closed && !activity.isFinishing() && !activity.isDestroyed();
    }

    private void inspect(AppUpdateInfo info) {
        int version = info.availableVersionCode();
        UpdatePromptPolicy.Action action = PROMPTS.decide(version,
            info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE,
            info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE),
            info.installStatus() == InstallStatus.DOWNLOADED);
        if (action == UpdatePromptPolicy.Action.OFFER_RESTART) {
            offerRestart(version);
        } else if (action == UpdatePromptPolicy.Action.OFFER_FLEXIBLE) {
            try {
                boolean started = manager.startUpdateFlowForResult(info, activity,
                    AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(), UPDATE_REQUEST);
                if (started) PROMPTS.record(action, version);
            } catch (IntentSender.SendIntentException | RuntimeException unavailable) {
                // Play may be unavailable or this update may no longer be offered.
            }
        }
    }

    private void offerRestart(int version) {
        if (!canPrompt() || restartDialog != null) return;
        try {
            restartDialog = new AlertDialog.Builder(activity)
                .setTitle(R.string.update_ready_title)
                .setMessage(R.string.update_ready_message)
                .setPositiveButton(R.string.update_restart, (dialog, which) -> {
                    PROMPTS.record(UpdatePromptPolicy.Action.OFFER_RESTART, version);
                    // Installation/restart only follows this explicit user action.
                    try { if (!closed && manager != null) manager.completeUpdate().addOnFailureListener(unavailable -> {}); }
                    catch (RuntimeException unavailable) { /* Leave the current app usable. */ }
                })
                .setNegativeButton(R.string.update_later, (dialog, which) ->
                    PROMPTS.record(UpdatePromptPolicy.Action.OFFER_RESTART, version))
                .setOnCancelListener(dialog -> PROMPTS.record(UpdatePromptPolicy.Action.OFFER_RESTART, version))
                .create();
            restartDialog.setOnDismissListener(dialog -> restartDialog = null);
            restartDialog.show();
        } catch (RuntimeException unavailable) {
            restartDialog = null;
        }
    }

    void onPause() {
        resumed = false;
        refreshPending = false;
        // A background transition is not the user's Later choice. A downloaded
        // update can be offered again when this activity next resumes.
        if (restartDialog != null) restartDialog.dismiss();
    }

    @Override public void close() {
        closed = true;
        onPause();
        if (manager != null) {
            try { manager.unregisterListener(listener); } catch (RuntimeException unavailable) { /* Nothing left to unregister. */ }
            manager = null;
        }
    }
}
