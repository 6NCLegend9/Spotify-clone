package app.haykasa.android;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.IBinder;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.Collections;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

@androidx.media3.common.util.UnstableApi
public final class MainActivity extends Activity {
    private FrameLayout content;
    private WebView web;
    private PlayAppUpdater updater;
    private PlaybackService playback;
    private boolean bound;
    private boolean returningHome;
    private ValueCallback<Uri[]> fileResult;
    private final List<Runnable> waiting = new ArrayList<>();
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            playback = ((PlaybackService.LocalBinder)binder).service();
            for (Runnable r : new ArrayList<>(waiting)) r.run();
            waiting.clear();
        }
        @Override public void onServiceDisconnected(ComponentName name) { playback = null; waiting.clear(); }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        updater = new PlayAppUpdater(this);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrFinish);
        getWindow().setStatusBarColor(0xff060d1b);
        getWindow().setNavigationBarColor(0xff060d1b);
        configureContentInsets();
        bound = bindService(new Intent(this, PlaybackService.class).setAction("app.haykasa.android.BIND"), connection, Context.BIND_AUTO_CREATE);
        createWebView();
        showWebsite();
    }
    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.checkForUpdates();
    }
    @Override public void onPause() {
        if (updater != null) updater.onPause();
        super.onPause();
    }
    private String installedVersion() {
        try {
            String version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            if (version != null && !version.isEmpty()) return version;
        } catch (PackageManager.NameNotFoundException ignored) { /* Fall back if package metadata is unavailable. */ }
        return "unknown";
    }
    private void qaWebLog(String message) {
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            android.util.Log.d("HayKasaWebQA", message);
        }
    }
    private void configureContentInsets() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attributes);
        }
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        content = new FrameLayout(this);
        content.setBackgroundColor(0xff060d1b);
        content.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
                return WindowInsets.CONSUMED;
            }
            int left = insets.getSystemWindowInsetLeft(), top = insets.getSystemWindowInsetTop();
            int right = insets.getSystemWindowInsetRight(), bottom = insets.getSystemWindowInsetBottom();
            if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
                android.view.DisplayCutout cutout = insets.getDisplayCutout();
                left = Math.max(left, cutout.getSafeInsetLeft()); top = Math.max(top, cutout.getSafeInsetTop());
                right = Math.max(right, cutout.getSafeInsetRight()); bottom = Math.max(bottom, cutout.getSafeInsetBottom());
            }
            view.setPadding(left, top, right, bottom);
            WindowInsets consumed = insets.consumeSystemWindowInsets().consumeStableInsets();
            return Build.VERSION.SDK_INT >= 28 ? consumed.consumeDisplayCutout() : consumed;
        });
        setContentView(content);
        if (Build.VERSION.SDK_INT >= 30) {
            // setContentView creates the decor required by PhoneWindow's controller.
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) controller.setSystemBarsAppearance(0,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        content.requestApplyInsets();
    }
    private void showContent(View view) {
        content.removeAllViews();
        content.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        content.requestApplyInsets();
    }
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(0xff060d1b);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // The trusted renderer owns play/pause intent. Its async iframe commands
        // must not require a second gesture inside YouTube for every track.
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " HayKasaAndroid/" + installedVersion());
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                qaWebLog("console level=" + message.messageLevel().name()
                    + " category=" + WebDiagnostics.consoleCategory(message.message())
                    + " source=" + WebDiagnostics.sourceCategory(message.sourceId())
                    + " line=" + Math.max(0, message.lineNumber()));
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams params) {
                if (view != web || !MediaPolicy.isWebsite(view.getUrl())) return false;
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = result;
                try { startActivityForResult(params.createIntent(), 8); }
                catch (Exception ignored) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (view != web) return true;
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (MediaPolicy.isWebsite(url)) return false;
                String scheme = request.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl()).addCategory(Intent.CATEGORY_BROWSABLE)); }
                    catch (Exception ignored) { showError(R.string.error_no_browser); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (view == web && returningHome && MediaPolicy.isWebsite(url) && "/".equals(Uri.parse(url).getPath())) {
                    web.clearHistory(); returningHome = false;
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                qaWebLog("network code=" + error.getErrorCode() + " source=" + WebDiagnostics.sourceCategory(request.getUrl().toString()) + " mainFrame=" + request.isForMainFrame());
                if (view == web && request.isForMainFrame()) showError(R.string.error_connection);
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                qaWebLog("http status=" + response.getStatusCode() + " source=" + WebDiagnostics.sourceCategory(request.getUrl().toString()) + " mainFrame=" + request.isForMainFrame());
            }
            @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
                if (view != web) return true;
                // A renderer exit is recoverable. Android's default callback
                // terminates the host, and a dead WebView cannot be reloaded.
                waiting.clear();
                returningHome = false;
                if (fileResult != null) { fileResult.onReceiveValue(null); fileResult = null; }
                if (playback != null) playback.releaseAll();
                discardWebView();
                showError(R.string.error_renderer);
                return true;
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "HayKasaAndroidMedia", Collections.singleton(MediaPolicy.ORIGIN),
                (view, message, origin, isMainFrame, reply) -> {
                    if (view != web || !isMainFrame || !MediaPolicy.ORIGIN.equals(origin.toString()) || message.getData() == null || message.getData().length() > 12288) return;
                    try {
                        JSONObject command = new JSONObject(message.getData());
                        Runnable run = () -> {
                            if (playback == null || view != web) return;
                            try {
                                // Stop bound-only playback from disappearing when the activity closes.
                                // MediaSessionService owns the foreground notification when playing.
                                if ("play".equals(command.optString("action"))) {
                                    try { startService(new Intent(this, PlaybackService.class)); } catch (IllegalStateException ignored) {}
                                }
                                playback.command(command, json -> runOnUiThread(() -> { if (view != web) return; try { reply.postMessage(json); } catch (Exception ignored) {} }));
                            } catch (Exception ignored) {
                                try { reply.postMessage(new JSONObject().put("id", command.optString("id")).put("event", "error").toString()); }
                                catch (Exception closed) { /* A closed WebView has no recipient. */ }
                            }
                        };
                        if (playback != null) run.run(); else if (waiting.size() < 20) waiting.add(run);
                    } catch (Exception ignored) { /* Reject malformed bridge messages. */ }
                });
        }
    }
    private void discardWebView() {
        WebView previous = web;
        web = null;
        if (previous == null) return;
        if (previous.getParent() instanceof ViewGroup) ((ViewGroup)previous.getParent()).removeView(previous);
        previous.destroy();
    }
    private void showWebsite() {
        if (web == null) createWebView();
        // Size the WebView itself to the safe area. WebView padding does not
        // shrink CSS viewport units or fixed-position controls on Android 15+.
        showContent(web);
        web.loadUrl(MediaPolicy.ORIGIN + "/?utm_source=android");
    }
    private void showError(int message) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(32, 48, 32, 32); box.setBackgroundColor(0xff060d1b);
        TextView text = new TextView(this); text.setText(message); text.setTextColor(0xfff1f5ff); text.setTextSize(18); box.addView(text);
        Button retry = new Button(this); retry.setId(android.R.id.button1); retry.setText(R.string.try_again); retry.setOnClickListener(v -> showWebsite()); box.addView(retry);
        showContent(box);
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == 8 && fileResult != null) {
            Uri[] selected = WebChromeClient.FileChooserParams.parseResult(result, data);
            if (selected != null) {
                for (Uri uri : selected) if (!"content".equals(uri.getScheme())) { selected = null; break; }
            }
            fileResult.onReceiveValue(selected); fileResult = null;
        }
    }
    private void goBackOrFinish() {
        if (web == null) { finish(); return; }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets insets = web.getRootWindowInsets();
            if (insets != null && insets.isVisible(WindowInsets.Type.ime())) {
                ((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(web.getWindowToken(), 0);
                web.clearFocus();
                return;
            }
        }
        if (web.canGoBack()) { web.goBack(); return; }
        // Client-side route replacement can leave no native WebView history.
        String url = web.getUrl();
        if (MediaPolicy.isWebsite(url) && !"/".equals(Uri.parse(url).getPath())) {
            // A full document load would abandon the current audio bridge.
            // Deployed clients without the handler retain the navigation fallback.
            WebView navigating = web;
            navigating.evaluateJavascript("!window.dispatchEvent(new Event('haykasa:navigate-home', {cancelable:true}))", handled -> {
                if (navigating != web || "true".equals(handled) || isFinishing() || isDestroyed()) return;
                String current = web.getUrl();
                if (MediaPolicy.isWebsite(current) && !"/".equals(Uri.parse(current).getPath())) {
                    returningHome = true;
                    web.loadUrl(MediaPolicy.ORIGIN + "/");
                }
            });
            return;
        }
        // Root Back should leave the launcher task in the background, preserving
        // the WebView's connection to any native audio that is still playing.
        moveTaskToBack(true);
    }
    // API 33+ uses the registered native dispatcher; this fallback serves API 23–32.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { goBackOrFinish(); }
    @Override public void onDestroy() {
        if (updater != null) updater.close();
        waiting.clear();
        if (fileResult != null) { fileResult.onReceiveValue(null); fileResult = null; }
        if (playback != null) playback.detachSinks();
        if (bound) unbindService(connection);
        if (web != null) web.stopLoading();
        discardWebView(); super.onDestroy();
    }
}
