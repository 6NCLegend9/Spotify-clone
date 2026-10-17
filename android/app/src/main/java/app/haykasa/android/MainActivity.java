package app.haykasa.android;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.IBinder;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import android.webkit.WebViewClient;
import android.widget.Button;
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
    private WebView web;
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
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrFinish);
        getWindow().setStatusBarColor(0xff060d1b);
        getWindow().setNavigationBarColor(0xff060d1b);
        bound = bindService(new Intent(this, PlaybackService.class).setAction("app.haykasa.android.BIND"), connection, Context.BIND_AUTO_CREATE);
        web = new WebView(this);
        web.setBackgroundColor(0xff060d1b);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " HayKasaAndroid/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams params) {
                if (!MediaPolicy.isWebsite(view.getUrl())) return false;
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = result;
                try { startActivityForResult(params.createIntent(), 8); }
                catch (Exception ignored) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
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
                if (returningHome && MediaPolicy.isWebsite(url) && "/".equals(Uri.parse(url).getPath())) {
                    web.clearHistory(); returningHome = false;
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError(R.string.error_connection);
            }
        });
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "HayKasaAndroidMedia", Collections.singleton(MediaPolicy.ORIGIN),
                (view, message, origin, isMainFrame, reply) -> {
                    if (!isMainFrame || !MediaPolicy.ORIGIN.equals(origin.toString()) || message.getData() == null || message.getData().length() > 12288) return;
                    try {
                        JSONObject command = new JSONObject(message.getData());
                        Runnable run = () -> {
                            if (playback == null) return;
                            try {
                                // Stop bound-only playback from disappearing when the activity closes.
                                // MediaSessionService owns the foreground notification when playing.
                                if ("play".equals(command.optString("action"))) {
                                    try { startService(new Intent(this, PlaybackService.class)); } catch (IllegalStateException ignored) {}
                                }
                                playback.command(command, json -> runOnUiThread(() -> { try { reply.postMessage(json); } catch (Exception ignored) {} }));
                            } catch (Exception ignored) {
                                try { reply.postMessage(new JSONObject().put("id", command.optString("id")).put("event", "error").toString()); }
                                catch (Exception closed) { /* A closed WebView has no recipient. */ }
                            }
                        };
                        if (playback != null) run.run(); else if (waiting.size() < 20) waiting.add(run);
                    } catch (Exception ignored) { /* Reject malformed bridge messages. */ }
                });
        }
        web.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        showWebsite();
    }
    private void showWebsite() {
        setContentView(web);
        web.loadUrl(MediaPolicy.ORIGIN + "/?utm_source=android");
    }
    private void showError(int message) {
        LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(32, 48, 32, 32); box.setBackgroundColor(0xff060d1b);
        TextView text = new TextView(this); text.setText(message); text.setTextColor(0xfff1f5ff); text.setTextSize(18); box.addView(text);
        Button retry = new Button(this); retry.setText(R.string.try_again); retry.setOnClickListener(v -> showWebsite()); box.addView(retry);
        setContentView(box);
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
            returningHome = true;
            web.loadUrl(MediaPolicy.ORIGIN + "/");
            return;
        }
        finish();
    }
    // API 33+ uses the registered native dispatcher; this fallback serves API 23–32.
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override public void onBackPressed() { goBackOrFinish(); }
    @Override public void onDestroy() {
        waiting.clear();
        if (fileResult != null) { fileResult.onReceiveValue(null); fileResult = null; }
        if (playback != null) playback.detachSinks();
        if (bound) unbindService(connection);
        web.stopLoading();
        if (web.getParent() instanceof ViewGroup) ((ViewGroup)web.getParent()).removeView(web);
        web.destroy(); super.onDestroy();
    }
}
