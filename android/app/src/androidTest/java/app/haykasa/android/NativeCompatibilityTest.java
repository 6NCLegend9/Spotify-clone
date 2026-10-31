package app.haykasa.android;

import android.content.Context;
import android.content.Intent;
import android.os.Looper;
import android.webkit.WebView;
import androidx.media3.datasource.ByteArrayDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaController;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ServiceTestRule;
import com.google.common.util.concurrent.ListenableFuture;
import java.lang.reflect.Field;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Latest production JS against actual native binaries; no source extraction or real account. */
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class NativeCompatibilityTest {
    @Rule public final ServiceTestRule services = new ServiceTestRule();
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private void main(Runnable run) { InstrumentationRegistry.getInstrumentation().runOnMainSync(run); }
    private String js(WebView web, String expression) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        main(() -> web.evaluateJavascript(expression, value -> { result.set(value); done.countDown(); }));
        assertTrue("WebView response", done.await(10, TimeUnit.SECONDS)); return result.get();
    }
    private void waitJs(WebView web, String expression) throws Exception {
        for (int i = 0; i < 100; i++) { if ("true".equals(js(web, expression))) return; Thread.sleep(100); }
        fail("Compatibility did not settle: " + expression + "; " + js(web, "JSON.stringify(qaSample())"));
    }
    private void evidence(String name, JSONObject value) throws Exception {
        String encoded = android.util.Base64.encodeToString(value.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8), android.util.Base64.NO_WRAP);
        String cmd = "mkdir -p /sdcard/Download/haykasa-emulator-qa; echo '" + encoded
            + "' | base64 -d > /sdcard/Download/haykasa-emulator-qa/" + name + ".json";
        try (java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(
            InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(cmd))) { in.readAllBytes(); }
    }
    @Test @SuppressWarnings("unchecked") public void latestRendererPlaysAndReportsTheNativeCapabilityTruthfully() throws Exception {
        android.os.Bundle args = InstrumentationRegistry.getArguments();
        int expected = Integer.parseInt(args.getString("expectedTransportVersion", "2"));
        assertTrue(expected >= 0 && expected <= 2);
        android.content.pm.PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        String build = args.getString("expectedNativeBuildCode");
        if (build != null) assertEquals("Must install the requested historical native binary", Integer.parseInt(build), info.versionCode);
        else assertTrue("Current binary must include D07", info.versionCode >= 5);
        PlaybackService service = ((PlaybackService.LocalBinder)services.bindService(new Intent(context, PlaybackService.class).setAction("app.haykasa.android.BIND"))).service();
        Field factory = PlaybackService.class.getDeclaredField("sourceFactory"); factory.setAccessible(true);
        Field players = PlaybackService.class.getDeclaredField("players"); players.setAccessible(true);
        byte[] audio;
        try (java.io.InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("quality-aac.m4a")) { audio = in.readAllBytes(); }
        main(() -> { try { ((DefaultMediaSourceFactory)factory.get(service)).setDataSourceFactory(() -> new ByteArrayDataSource(audio)); } catch (Exception e) { throw new AssertionError(e); } });
        String html;
        try (java.io.InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("native-qa.html")) {
            html = new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        AtomicReference<WebView> webRef = new AtomicReference<>();
        AtomicReference<MediaController> controller = new AtomicReference<>();
        try (ActivityScenario<MainActivity> activity = ActivityScenario.launch(MainActivity.class)) {
            activity.onActivity(host -> {
                try {
                    Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
                    WebView web = (WebView)field.get(host); webRef.set(web); web.stopLoading();
                    android.webkit.WebViewClient delegate = web.getWebViewClient();
                    web.setWebViewClient(new android.webkit.WebViewClient() {
                        @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
                            return new android.webkit.WebResourceResponse("text/html", "UTF-8", new java.io.ByteArrayInputStream(html.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                        }
                        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { delegate.onPageStarted(view, url, icon); }
                        @Override public void onPageFinished(WebView view, String url) { delegate.onPageFinished(view, url); }
                    });
                    web.loadUrl(MediaPolicy.ORIGIN + "/?native-compatibility-qa=1");
                } catch (Exception e) { throw new AssertionError(e); }
            });
            WebView web = webRef.get(); waitJs(web, "window.qaReady===true");
            assertEquals(String.valueOf(expected), js(web, "qaDeck.nativeTransportVersion"));
            assertEquals(String.valueOf(expected > 0), js(web, "qaDeck.orderedTransport"));
            assertEquals("true", js(web, "qaCapabilities.includes(" + expected + ")"));
            assertEquals("true", js(web, "qaDeck.androidNative && !qaSample().failure && !qaSample().transportError"));
            js(web, "document.getElementById('play').click()");
            waitJs(web, "qaDeck.nativeObservedPlaying===true && qaDeck.getCurrentTime()>.5");
            AtomicReference<ExoPlayer> player = new AtomicReference<>();
            main(() -> {
                try {
                    Map<String,ExoPlayer> current = (Map<String,ExoPlayer>)players.get(service);
                    assertEquals(1, current.size()); player.set(current.values().iterator().next());
                    assertTrue(player.get().isPlaying()); assertEquals(.5f, player.get().getVolume(), .001f);
                    androidx.media3.exoplayer.DecoderCounters counters = player.get().getAudioDecoderCounters();
                    assertNotNull(counters); counters.ensureUpdated(); assertTrue(counters.renderedOutputBufferCount > 0);
                } catch (Exception e) { throw new AssertionError(e); }
            });
            js(web, "document.getElementById('pause').click()"); waitJs(web, "qaDeck.getPlayerState()===2");
            main(() -> assertFalse(player.get().getPlayWhenReady()));
            js(web, "qaDeck.seekTo(2)"); waitJs(web, "Math.abs(qaDeck.getCurrentTime()-2)<.6");
            main(() -> assertEquals(2000, player.get().getCurrentPosition(), 600));
            AtomicReference<ListenableFuture<MediaController>> future = new AtomicReference<>();
            main(() -> future.set(new MediaController.Builder(context, service.getSessions().get(0).getToken()).setApplicationLooper(Looper.getMainLooper()).buildAsync()));
            controller.set(future.get().get(10, TimeUnit.SECONDS));
            main(() -> controller.get().play()); waitJs(web, "qaDeck.nativePlayIntent===true && qaDeck.nativeObservedPlaying===true");
            main(() -> controller.get().pause()); waitJs(web, "qaDeck.nativePlayIntent===false");
            main(() -> assertFalse(player.get().getPlayWhenReady()));
            String sample = String.valueOf(new org.json.JSONTokener(js(web, "JSON.stringify(qaSample())")).nextValue());
            evidence("compatibility-v" + expected, new JSONObject().put("expectedTransportVersion", expected)
                .put("nativeBuildCode", info.versionCode).put("appVersion", info.versionName)
                .put("nativeBaseline", args.getString("nativeBaseline", "current-checkout"))
                .put("syntheticSource", true).put("liveSource", false).put("sample", new JSONObject(sample)));
        } finally {
            main(() -> { if (controller.get() != null) controller.get().release(); service.releaseAll(); });
        }
    }
}
