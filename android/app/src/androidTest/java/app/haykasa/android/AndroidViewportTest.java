package app.haykasa.android;

import android.content.pm.ActivityInfo;
import android.graphics.Insets;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@androidx.test.filters.SdkSuppress(minSdkVersion = 30)
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class AndroidViewportTest {
    private void main(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private WebView web(MainActivity activity) {
        try {
            Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true);
            return (WebView)field.get(activity);
        } catch (ReflectiveOperationException error) { throw new RuntimeException(error); }
    }
    private String js(WebView web, String source) throws Exception {
        CountDownLatch done = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        main(() -> web.evaluateJavascript(source, result -> { value.set(result); done.countDown(); }));
        assertTrue("WebView responds to the isolated viewport fixture", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }
    private void waitJs(WebView web, String source) throws Exception {
        for (int i = 0; i < 100; i++) {
            if ("true".equals(js(web, source))) return;
            Thread.sleep(100);
        }
        fail("Viewport condition did not become true: " + source);
    }
    private WebView loadFixture(ActivityScenario<MainActivity> scenario) {
        AtomicReference<WebView> ref = new AtomicReference<>();
        scenario.onActivity(activity -> {
            WebView web = web(activity); ref.set(web); web.stopLoading(); web.getSettings().setBlockNetworkLoads(true);
            web.loadDataWithBaseURL(MediaPolicy.ORIGIN,
                "<!doctype html><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
                + "<style>html,body{margin:0;background:#060d1b;color:white}main{height:100dvh}header,footer{position:fixed;left:0;right:0}"
                + "header{top:0;height:56px}footer{bottom:0;height:64px;padding-bottom:env(safe-area-inset-bottom,0px)}</style>"
                + "<main><header id='top'>Search</header><footer id='bottom'>Home · Search · Library</footer></main>",
                "text/html", "UTF-8", null);
        });
        return ref.get();
    }
    private void assertSafeBounds(ActivityScenario<MainActivity> scenario, WebView web) {
        scenario.onActivity(activity -> {
            View decor = activity.getWindow().getDecorView();
            WindowInsets insets = decor.getRootWindowInsets(); assertNotNull(insets);
            Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
            int[] origin = new int[2], position = new int[2]; decor.getLocationOnScreen(origin); web.getLocationOnScreen(position);
            assertTrue("WebView starts below the status bar/cutout", position[1] >= origin[1] + safe.top);
            assertTrue("WebView ends above system navigation", position[1] + web.getHeight() <= origin[1] + decor.getHeight() - safe.bottom);
            assertTrue("WebView avoids the left landscape cutout", position[0] >= origin[0] + safe.left);
            assertTrue("WebView avoids right-side system controls", position[0] + web.getWidth() <= origin[0] + decor.getWidth() - safe.right);
            assertEquals("Native insets belong outside the CSS viewport", 0, web.getPaddingTop() + web.getPaddingBottom() + web.getPaddingLeft() + web.getPaddingRight());
        });
    }
    @Test public void fixedWebControlsFitTheSafeViewportAfterRotation() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView web = loadFixture(scenario);
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            waitJs(web, "!!document.getElementById('bottom') && innerHeight > innerWidth");
            assertSafeBounds(scenario, web);
            assertEquals("Fixed controls and dvh fit the native safe viewport", "true", js(web,
                "document.getElementById('top').getBoundingClientRect().top === 0 && "
                + "Math.abs(document.getElementById('bottom').getBoundingClientRect().bottom-innerHeight) <= 1 && "
                + "Math.abs(document.querySelector('main').getBoundingClientRect().height-innerHeight) <= 1 && "
                + "getComputedStyle(document.getElementById('bottom')).paddingBottom === '0px' && document.documentElement.scrollWidth <= innerWidth"));
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            waitJs(web, "innerWidth > innerHeight");
            assertSafeBounds(scenario, web);
            assertEquals("Rotated fixed controls remain inside the safe viewport", "true", js(web,
                "Math.abs(document.getElementById('bottom').getBoundingClientRect().bottom-innerHeight) <= 1 && document.documentElement.scrollWidth <= innerWidth"));
        }
    }
    @Test public void systemCutoutAndKeyboardInsetsAreConsumedOnceOutsideWebView() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            WebView web = loadFixture(scenario);
            waitJs(web, "!!document.getElementById('bottom')");
            scenario.onActivity(activity -> {
                FrameLayout frame = (FrameLayout)web.getParent();
                WindowInsets synthetic = new WindowInsets.Builder()
                    .setInsets(WindowInsets.Type.systemBars(), Insets.of(5, 23, 7, 31))
                    .setInsets(WindowInsets.Type.displayCutout(), Insets.of(11, 29, 13, 0))
                    .setInsets(WindowInsets.Type.ime(), Insets.of(0, 0, 0, 190)).build();
                WindowInsets result = frame.dispatchApplyWindowInsets(synthetic);
                assertTrue("Children receive no duplicate system or IME insets", result.isConsumed());
                assertEquals(11, frame.getPaddingLeft()); assertEquals(29, frame.getPaddingTop()); assertEquals(13, frame.getPaddingRight());
                assertEquals("Keyboard and navigation overlap; their heights must not be added", 190, frame.getPaddingBottom());
                int width = frame.getWidth(), height = frame.getHeight();
                frame.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
                frame.layout(frame.getLeft(), frame.getTop(), frame.getRight(), frame.getBottom());
                assertEquals("The WebView's measured viewport shrinks above the keyboard", height - 29 - 190, web.getHeight());
                assertEquals(width - 11 - 13, web.getWidth());
                assertEquals(0, web.getPaddingTop() + web.getPaddingBottom());
                frame.requestApplyInsets();
            });
        }
    }
}
