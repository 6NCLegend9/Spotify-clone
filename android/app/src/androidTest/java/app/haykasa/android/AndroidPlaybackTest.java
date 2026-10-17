package app.haykasa.android;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ServiceTestRule;
import androidx.media3.datasource.ByteArrayDataSource;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

@androidx.test.filters.SdkSuppress(minSdkVersion = 33)
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class AndroidPlaybackTest {
    @Rule public final ServiceTestRule serviceRule = new ServiceTestRule();
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private PlaybackService bind() throws Exception {
        IBinder binder = serviceRule.bindService(new Intent(context, PlaybackService.class).setAction("app.haykasa.android.BIND"));
        return ((PlaybackService.LocalBinder)binder).service();
    }
    private void main(Runnable r) { InstrumentationRegistry.getInstrumentation().runOnMainSync(r); }
    private String js(WebView web, String code) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        main(() -> web.evaluateJavascript(code, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView JavaScript reply", done.await(10, TimeUnit.SECONDS)); return result.get();
    }
    private void waitJs(WebView web, String code) throws Exception {
        for (int i = 0; i < 100; i++) { if ("true".equals(js(web, code))) return; Thread.sleep(200); }
        fail("Condition did not become true: " + code + "; state=" + js(web, "JSON.stringify(window.qaSample?.())"));
    }
    private void shell(String command) throws Exception {
        try (java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command))) {
            byte[] buffer = new byte[1024]; while (in.read(buffer) != -1) { /* Consume command completion. */ }
        }
    }
    private void screenshot(String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        Thread.sleep(500); // Allow the committed WebView frame to reach the emulator display.
        shell("mkdir -p /sdcard/Download/haykasa-emulator-qa");
        shell("screencap -p /sdcard/Download/haykasa-emulator-qa/" + name + ".png");
    }
    private boolean keyboardVisible(WebView web) {
        AtomicReference<Boolean> visible = new AtomicReference<>(false);
        main(() -> { android.view.WindowInsets insets = web.getRootWindowInsets(); visible.set(insets != null && insets.isVisible(android.view.WindowInsets.Type.ime())); });
        return visible.get();
    }
    private byte[] tone() {
        int rate = 8000, samples = rate * 120;
        ByteBuffer b = ByteBuffer.allocate(44 + samples * 2).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{82,73,70,70}).putInt(36+samples*2).put(new byte[]{87,65,86,69,102,109,116,32}).putInt(16).putShort((short)1).putShort((short)1).putInt(rate).putInt(rate*2).putShort((short)2).putShort((short)16).put(new byte[]{100,97,116,97}).putInt(samples*2);
        for (int i=0;i<samples;i++) b.putShort((short)(1200*Math.sin(2*Math.PI*440*i/rate)));
        return b.array();
    }
    @Test public void appControlledTrackChangesDoNotRequireAnIframeTap() throws Exception {
        AtomicReference<WebView> ref = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(instance -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                    WebView web = (WebView)field.get(instance); ref.set(web); web.stopLoading(); web.getSettings().setBlockNetworkLoads(true);
                    String source = "data:audio/wav;base64," + android.util.Base64.encodeToString(tone(), android.util.Base64.NO_WRAP);
                    String fixture = "<div id='media'></div><script>window.qaTrack=0;window.qaSample=()=>({track:qaTrack,error:window.qaError});window.qaNext=()=>{const old=document.querySelector('audio');if(old)old.pause();const audio=document.createElement('audio');audio.src=" + org.json.JSONObject.quote(source) + ";document.getElementById('media').replaceChildren(audio);setTimeout(()=>audio.play().then(()=>{qaTrack++;},e=>{window.qaError=e.name;}),0);};</script>";
                    web.loadDataWithBaseURL(MediaPolicy.ORIGIN, fixture, "text/html", "UTF-8", null);
                } catch (Exception error) { throw new RuntimeException(error); }
            });
            WebView web = ref.get(); waitJs(web, "typeof qaNext === 'function'");
            js(web, "qaNext()"); waitJs(web, "qaTrack === 1 || !!window.qaError");
            assertEquals("App playback must not require a separate tap inside the media iframe", "true", js(web, "qaTrack === 1 && !window.qaError"));
            js(web, "qaNext()"); waitJs(web, "qaTrack === 2 || !!window.qaError");
            assertEquals("An asynchronous next track must start without another iframe gesture", "true", js(web, "qaTrack === 2 && !window.qaError"));
        }
    }
    @Test public void rendererExitIsHandledAndRetryRecreatesTheWebView() throws Exception {
        AtomicReference<WebView> original = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(instance -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                    WebView web = (WebView)field.get(instance); original.set(web);
                    boolean handled = web.getWebViewClient().onRenderProcessGone(web, new android.webkit.RenderProcessGoneDetail() {
                        @Override public boolean didCrash() { return true; }
                        @Override public int rendererPriorityAtExit() { return android.webkit.WebView.RENDERER_PRIORITY_BOUND; }
                    });
                    assertTrue("Renderer exit must not escalate into a host app crash", handled);
                    android.widget.Button retry = instance.findViewById(android.R.id.button1);
                    assertNotNull("Renderer failure offers a native Retry button", retry);
                    assertTrue("Retry is visible after renderer failure", retry.isShown());
                    retry.performClick();
                    WebView replacement = (WebView)field.get(instance);
                    assertNotNull(replacement); assertNotSame("Retry must never reuse a dead WebView", original.get(), replacement);
                    assertTrue("Retry opens the trusted website", MediaPolicy.isWebsite(replacement.getUrl()));
                } catch (ReflectiveOperationException error) { throw new RuntimeException(error); }
            });
        }
    }
    @Test public void actualRendererCrashKeepsTheAppAliveAndCanRecover() throws Exception {
        AtomicReference<WebView> original = new AtomicReference<>(), replacement = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(instance -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                    WebView web = (WebView)field.get(instance); original.set(web);
                    web.loadUrl("chrome://crash"); // Deliberately kill this disposable test renderer.
                } catch (ReflectiveOperationException error) { throw new RuntimeException(error); }
            });
            for (int i = 0; i < 100 && replacement.get() == null; i++) {
                activity.onActivity(instance -> {
                    android.widget.Button retry = instance.findViewById(android.R.id.button1);
                    try {
                        Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                        if (field.get(instance) == null && retry != null && retry.isShown()) {
                            retry.performClick();
                            replacement.set((WebView)field.get(instance));
                        }
                    } catch (ReflectiveOperationException error) { throw new RuntimeException(error); }
                });
                if (replacement.get() == null) Thread.sleep(100);
            }
            assertNotNull("The app survives renderer death and offers Retry", replacement.get());
            assertNotSame(original.get(), replacement.get());
            waitJs(replacement.get(), "!!document.querySelector('.app-tabbar a[href=\"/search\"]')");
            screenshot("renderer-crash-recovered");
        }
    }
    @Test public void guestWebsiteLaunchSearchAndAndroidBack() throws Exception {
        AtomicReference<WebView> ref = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(instance -> {
                try { Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true); ref.set((WebView)field.get(instance)); }
                catch (Exception e) { throw new RuntimeException(e); }
            });
            WebView web = ref.get();
            try { waitJs(web, "!!document.querySelector('.app-tabbar a[href=\"/search\"]')"); }
            finally { screenshot("website-home-guest"); }
            waitJs(web, "!!document.querySelector('.home-header h1')");
            screenshot("website-home-ready");
            assertEquals("Mobile page has no horizontal overflow", "true", js(web, "document.documentElement.scrollWidth <= innerWidth + 2"));
            js(web, "document.querySelector('.app-tabbar a[href=\"/search\"]').click()");
            waitJs(web, "location.pathname === '/search'");
            waitJs(web, "!!document.querySelector('a[aria-label=\"Browse Music playlists\"]')");
            screenshot("website-search-guest");
            System.out.println("ANDROID_QA_NAVIGATION " + js(web, "JSON.stringify({path:location.pathname,history:history.length})"));
            main(() -> System.out.println("ANDROID_QA_NATIVE_BACK canGoBack=" + web.canGoBack() + " path=" + android.net.Uri.parse(web.getUrl()).getPath()));
            if (keyboardVisible(web)) {
                shell("input keyevent KEYCODE_BACK");
                for (int i = 0; i < 30 && keyboardVisible(web); i++) Thread.sleep(100);
                assertFalse("Back first dismisses the keyboard", keyboardVisible(web));
                assertEquals("Dismissing the keyboard keeps Search open", "true", js(web, "location.pathname === '/search'"));
            }
            shell("input keyevent KEYCODE_BACK"); waitJs(web, "location.pathname === '/'");
        }
    }
    @Test public void serviceRegistersItsSession() throws Exception {
        PlaybackService service = bind(); AtomicReference<Integer> count = new AtomicReference<>();
        main(() -> count.set(service.getSessions().size()));
        assertEquals("Native session must be registered with its foreground service", Integer.valueOf(1), count.get());
    }
    @Test public void nativeBridgePlaysInBackgroundAndHonorsMediaControls() throws Exception {
        PlaybackService service = bind(); byte[] audio = tone();
        Field factoryField = PlaybackService.class.getDeclaredField("sourceFactory"); factoryField.setAccessible(true);
        main(() -> { try { ((DefaultMediaSourceFactory)factoryField.get(service)).setDataSourceFactory(() -> new ByteArrayDataSource(audio)); } catch (Exception e) { throw new RuntimeException(e); } });
        String fixture;
        try (java.io.InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-qa.html")) { fixture = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8); }
        AtomicReference<WebView> ref = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(instance -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                    WebView web = (WebView)field.get(instance); ref.set(web); web.stopLoading(); web.getSettings().setBlockNetworkLoads(true);
                    web.loadDataWithBaseURL(MediaPolicy.ORIGIN + "/?android-qa=1", fixture, "text/html", "UTF-8", null);
                } catch (Exception e) { throw new RuntimeException(e); }
            });
            WebView web = ref.get(); waitJs(web, "window.qaReady === true");
            assertEquals("Production resolver reached the isolated API", "true", js(web, "qaResolveRequests > 0"));
            System.out.println("ANDROID_QA_WEBVIEW " + WebView.getCurrentWebViewPackage().versionName);
            System.out.println("ANDROID_QA_ABORT_ANY " + js(web, "typeof AbortSignal.any"));
            js(web, "document.getElementById('play').click()"); waitJs(web, "qaDeck.getCurrentTime() > 1 && qaDeck.getPlayerState() === 1");
            screenshot("native-playing");
            ActivityManager manager = (ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE);
            assertTrue("Playing audio needs a foreground notification service", manager.getRunningServices(100).stream().anyMatch(s -> s.service.getClassName().equals(PlaybackService.class.getName()) && s.foreground));
            js(web, "window.qaDocumentIdentity = {}; window.qaOriginalBridge = HayKasaAndroidMedia; history.replaceState(null, '', '/search?android-qa=1')");
            main(web::clearHistory);
            AtomicReference<Boolean> noNativeHistory = new AtomicReference<>();
            main(() -> noNativeHistory.set(!web.canGoBack() && "/search".equals(android.net.Uri.parse(web.getUrl()).getPath())));
            assertTrue("Search fallback is exercised without native WebView history", noNativeHistory.get());
            double beforeRouteBack = Double.parseDouble(js(web, "qaDeck.getCurrentTime()"));
            shell("input keyevent KEYCODE_BACK");
            waitJs(web, "location.pathname === '/' && qaDeck.getPlayerState() === 1 && qaDeck.getCurrentTime() > " + (beforeRouteBack + 1));
            assertEquals("Route Back preserves the document and native bridge", "true", js(web, "!!window.qaDocumentIdentity && window.qaOriginalBridge === HayKasaAndroidMedia && qaDeck.androidNative === true"));
            shell("input keyevent KEYCODE_HOME");
            Thread.sleep(4000);
            assertTrue("Playback must advance after leaving the app", Double.parseDouble(js(web, "qaDeck.getCurrentTime()")) > 4);
            shell("cmd media_session dispatch pause");
            waitJs(web, "qaDeck.getPlayerState() === 2"); double paused = Double.parseDouble(js(web, "qaDeck.getCurrentTime()")); Thread.sleep(1000);
            assertEquals("Pause remains paused", paused, Double.parseDouble(js(web, "qaDeck.getCurrentTime()")), .15);
            shell("cmd media_session dispatch play"); waitJs(web, "qaDeck.getPlayerState() === 1");
            js(web, "qaDeck.seekTo(45)"); waitJs(web, "qaDeck.getCurrentTime() >= 45");
            // Exercise the actual notification intent, rather than a test-only launch flag.
            main(() -> {
                try { service.getSessions().get(0).getSessionActivity().send(); }
                catch (android.app.PendingIntent.CanceledException error) { throw new RuntimeException(error); }
            });
            for (int i = 0; i < 30 && activity.getState() != androidx.lifecycle.Lifecycle.State.RESUMED; i++) Thread.sleep(100);
            assertEquals("Notification resumes the original activity and playback bridge", androidx.lifecycle.Lifecycle.State.RESUMED, activity.getState());
            screenshot("native-resumed");
            main(web::clearHistory);
            double beforeRootBack = Double.parseDouble(js(web, "qaDeck.getCurrentTime()"));
            shell("input keyevent KEYCODE_BACK");
            for (int i = 0; i < 30 && activity.getState() != androidx.lifecycle.Lifecycle.State.CREATED; i++) Thread.sleep(100);
            assertEquals("Root Back backgrounds the activity without destroying its playback bridge", androidx.lifecycle.Lifecycle.State.CREATED, activity.getState());
            waitJs(web, "qaDeck.getCurrentTime() > " + (beforeRootBack + 1));
            shell("am start -W -f 0x00020000 -n " + context.getPackageName() + "/" + MainActivity.class.getName());
            for (int i = 0; i < 30 && activity.getState() != androidx.lifecycle.Lifecycle.State.RESUMED; i++) Thread.sleep(100);
            assertEquals("Returning after root Back resumes the original activity", androidx.lifecycle.Lifecycle.State.RESUMED, activity.getState());
            assertEquals("Returning after root Back retains the original playback fixture", "true", js(web, "window.qaReady === true && qaDeck.getPlayerState() === 1"));
            screenshot("native-back-resumed");
            js(web, "qaDeck.loadVideoById({videoId:'synthetic02',title:'HayKasa next emulator tone',startSeconds:0})");
            waitJs(web, "qaDeck.getVideoData().video_id === 'synthetic02' && qaDeck.getPlayerState() === 1 && qaDeck.getCurrentTime() > 1 && qaDeck.getCurrentTime() < 30");
            AtomicReference<String> notificationTitle = new AtomicReference<>();
            main(() -> notificationTitle.set(String.valueOf(service.getSessions().get(0).getPlayer().getMediaMetadata().title)));
            assertEquals("Reusing the native deck updates Android media-session metadata", "HayKasa next emulator tone", notificationTitle.get());
            js(web, "qaDeck.cueVideoById({videoId:'synthetic03',title:'Cued emulator tone'})");
            AtomicReference<Boolean> emptySession = new AtomicReference<>(false);
            for (int i = 0; i < 30; i++) {
                main(() -> emptySession.set(service.getSessions().get(0).getPlayer().getCurrentMediaItem() == null));
                if (emptySession.get()) break;
                Thread.sleep(100);
            }
            assertTrue("Cueing a new track releases the previous native session", emptySession.get());
            shell("cmd media_session dispatch play");
            assertEquals("System Play cannot resume the retired source", "false", js(web, "qaDeck.getPlayerState() === 1"));
            js(web, "qaDeck.playVideo()");
            waitJs(web, "qaDeck.getVideoData().video_id === 'synthetic03' && qaDeck.getPlayerState() === 1");
            js(web, "qaDeck.destroy()");
        } finally { main(service::releaseAll); context.stopService(new Intent(context, PlaybackService.class)); }
    }
}
