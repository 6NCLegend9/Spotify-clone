package app.haykasa.android;

import android.content.pm.ActivityInfo;
import android.webkit.CookieManager;
import android.webkit.WebStorage;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Read-only guest tour of the deployed website in a real Android WebView.
 * Provider absence is recorded as an explicit UI state, never fabricated success.
 * No login, account creation, playlist save or real media playback is submitted.
 */
@androidx.test.filters.SdkSuppress(minSdkVersion = 33)
@RunWith(AndroidJUnit4.class)
@androidx.media3.common.util.UnstableApi
public class AndroidUiTourTest {
    private static final String DIRECTORY = "/sdcard/Download/haykasa-emulator-qa";
    private void main(Runnable action) { InstrumentationRegistry.getInstrumentation().runOnMainSync(action); }
    private WebView web(MainActivity activity) {
        try { Field field = MainActivity.class.getDeclaredField("web"); field.setAccessible(true); return (WebView)field.get(activity); }
        catch (ReflectiveOperationException error) { throw new RuntimeException(error); }
    }
    private String js(WebView web, String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1); AtomicReference<String> value = new AtomicReference<>();
        main(() -> web.evaluateJavascript(source, result -> { value.set(result); latch.countDown(); }));
        assertTrue("Tour JavaScript responds", latch.await(10, TimeUnit.SECONDS)); return value.get();
    }
    private boolean await(WebView web, String condition, int seconds) throws Exception {
        for (int i = 0; i < seconds * 4; i++) { if ("true".equals(js(web, condition))) return true; Thread.sleep(250); }
        return false;
    }
    private void require(WebView web, String condition) throws Exception {
        assertTrue("Expected UI condition: " + condition + "; state=" + js(web, "JSON.stringify({path:location.pathname,ready:document.readyState,skeletons:document.querySelectorAll('.animate-shimmer').length})"), await(web, condition, 45));
    }
    private String text(WebView web, String source) throws Exception { return new JSONArray("[" + js(web, source) + "]").getString(0); }
    private void shell(String command) throws Exception {
        try (java.io.InputStream in = new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command))) {
            byte[] buffer = new byte[2048]; while (in.read(buffer) != -1) { /* Wait for completion. */ }
        }
    }
    private void record(String message) throws Exception {
        System.out.println("ANDROID_UI_TOUR " + message);
        String encoded = android.util.Base64.encodeToString((message + "\n").getBytes(StandardCharsets.UTF_8), android.util.Base64.NO_WRAP);
        shell("mkdir -p " + DIRECTORY);
        // executeShellCommand does not parse pipes/redirection. Supply the trusted
        // script on sh's stdin; JSON itself is base64 data, never shell source.
        android.os.ParcelFileDescriptor[] descriptors = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("sh");
        try (java.io.OutputStream input = new android.os.ParcelFileDescriptor.AutoCloseOutputStream(descriptors[1])) {
            input.write(("echo " + encoded + " | base64 -d >> " + DIRECTORY + "/ui-tour.jsonl\n").getBytes(StandardCharsets.UTF_8));
        }
        try (java.io.InputStream output = new android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptors[0])) {
            while (output.read() != -1) { /* Wait for the script to finish. */ }
        }
        try (java.io.InputStream file = new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat " + DIRECTORY + "/ui-tour.jsonl"))) {
            String persisted = new String(file.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue("Tour metrics must exist in the collected JSONL artifact", persisted.endsWith(message + "\n"));
        }
    }
    private void screenshot(String name) throws Exception {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync(); Thread.sleep(400);
        shell("mkdir -p " + DIRECTORY);
        String filename = DIRECTORY + "/tour-" + name + ".png";
        shell("screencap -p " + filename);
        try (java.io.InputStream file = new android.os.ParcelFileDescriptor.AutoCloseInputStream(InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat " + filename))) {
            byte[] bytes = file.readAllBytes();
            assertTrue("Tour screenshot must contain actual PNG bytes: " + name, bytes.length > 1024);
            assertArrayEquals("Tour screenshot must have the PNG signature: " + name,
                new byte[]{(byte)137, 80, 78, 71, 13, 10, 26, 10}, java.util.Arrays.copyOf(bytes, 8));
        }
    }
    private void observe(WebView web) throws Exception {
        js(web, "(()=>{if(window.__uiTour)return;window.__uiTour={errors:[],rejections:[]};addEventListener('error',e=>__uiTour.errors.push(/^[A-Za-z]+Error$/.test(e.error?.name||'')?e.error.name:'WindowError'));addEventListener('unhandledrejection',e=>__uiTour.rejections.push(/^[A-Za-z]+Error$/.test(e.reason?.name||'')?e.reason.name:'UnhandledRejection'));})()");
    }
    private void capture(WebView web, String name) throws Exception {
        String metrics = text(web, "JSON.stringify({screen:" + org.json.JSONObject.quote(name) + ",path:location.pathname,width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,finePointer:matchMedia('(pointer:fine)').matches,nativePhone:document.querySelector('.app-shell')?.dataset.nativePhone,overflow:document.documentElement.scrollWidth-innerWidth,skeletons:document.querySelectorAll('.animate-shimmer').length,songs:document.querySelectorAll('[data-search-track],[data-home-track]').length,alerts:document.querySelectorAll('[role=alert]').length,errors:window.__uiTour||null,tabbar:[...document.querySelectorAll('.app-tabbar a,.app-tabbar button')].map(n=>({label:n.innerText||n.getAttribute('aria-label'),current:n.getAttribute('aria-current'),top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}))})");
        record(metrics); screenshot(name);
        assertEquals(name + " has no horizontal page overflow", "true", js(web, "document.documentElement.scrollWidth<=innerWidth+2"));
        assertEquals(name + " has no captured unhandled JavaScript errors", "true", js(web, "!window.__uiTour || (!__uiTour.errors.length&&!__uiTour.rejections.length)"));
    }
    private void navigate(WebView web, String path) throws Exception {
        int mainDocuments = QaCurrentWeb.mainDocumentCount();
        js(web, "window.__qaPreviousNavigationDocument=true");
        main(() -> web.loadUrl(MediaPolicy.ORIGIN + path));
        // Loading the current path can leave the previous ready document visible
        // until the navigation response arrives. Wait for this runner's new
        // HTML before checking its DOM, rather than accepting that old frame.
        if (QaCurrentWeb.enabled()) {
            for (int attempt = 0; attempt < 180 && QaCurrentWeb.mainDocumentCount() <= mainDocuments; attempt++) Thread.sleep(250);
            assertTrue("Navigation must receive this runner build, never cached deployed HTML", QaCurrentWeb.mainDocumentCount() > mainDocuments);
        }
        require(web, "window.__qaPreviousNavigationDocument!==true && location.pathname === " + org.json.JSONObject.quote(path.split("\\?")[0]) + " && document.readyState==='complete' && !!document.querySelector('.app-tabbar')");
        observe(web);
    }
    private void click(WebView web, String selector) throws Exception {
        require(web, "!!document.querySelector(" + org.json.JSONObject.quote(selector) + ")");
        js(web, "document.querySelector(" + org.json.JSONObject.quote(selector) + ").click()");
    }
    private boolean settled(WebView web, String selector) throws Exception {
        return await(web, "!document.querySelector(" + org.json.JSONObject.quote(selector + " .animate-shimmer") + ") && !!document.querySelector(" + org.json.JSONObject.quote(selector) + ")", 45);
    }
    private void requirePhoneNavigation(WebView web) throws Exception {
        require(web, "(()=>{const bar=document.querySelector('.app-tabbar');if(!bar||getComputedStyle(bar).display==='none')return false;const r=bar.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<=innerHeight+1&&[...bar.querySelectorAll('a,button')].every(n=>{const b=n.getBoundingClientRect();return b.width>=44&&b.height>=44&&b.left>=0&&b.right<=innerWidth+1&&b.top>=0&&b.bottom<=innerHeight+1})})()");
        assertEquals("A rotated phone must not show a desktop library sidebar", "true", js(web, "(()=>{const side=document.querySelector('.app-sidebar');if(!side||getComputedStyle(side).display==='none')return true;return side.getBoundingClientRect().right<=1})()"));
        assertEquals("A rotated empty phone must not show desktop transport controls", "true", js(web, "(()=>{const empty=document.querySelector('.empty-player-dock');return !empty||getComputedStyle(empty).display==='none'})()"));
    }

    @Test public void freshGuestCanTourMainScreensInPortraitAndLandscape() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            AtomicReference<WebView> reference = new AtomicReference<>();
            scenario.onActivity(activity -> { reference.set(web(activity)); activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT); });
            WebView web = reference.get();
            try {
            CountDownLatch cookies = new CountDownLatch(1);
            main(() -> { web.stopLoading(); CookieManager.getInstance().removeAllCookies(ignored -> cookies.countDown()); WebStorage.getInstance().deleteAllData(); });
            assertTrue("Disposable emulator cookies cleared", cookies.await(10, TimeUnit.SECONDS));
            main(() -> { web.clearCache(true); QaCurrentWeb.install(web); });
            record(new org.json.JSONObject().put("webMode", QaCurrentWeb.mode()).put("sourceCommit", QaCurrentWeb.sourceCommit()).toString());
            navigate(web, "/");
            js(web, "window.__guestCheck='pending';fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()).then(s=>window.__guestCheck=s?.user?'authenticated':'guest').catch(()=>window.__guestCheck='error')");
            require(web, "window.__guestCheck !== 'pending'");
            assertEquals("Fresh emulator must not display another account", "\"guest\"", js(web, "window.__guestCheck"));
            // A header alone is not a loaded homepage: require content or a finished empty/error state.
            require(web, "!!document.querySelector('.page-home') && !document.querySelector('.page-home .animate-shimmer') && (!!document.querySelector('[data-home-track],[data-home-playlist],.page-home [role=alert]') || /No recommendations|No songs to show/.test(document.querySelector('.page-home').innerText))");
            capture(web, "01-home-settled-guest");
            click(web, ".app-tabbar a[href='/search']");
            require(web, "location.pathname==='/search' && !!document.querySelector('a[aria-label=\"Browse Music playlists\"]')");
            js(web, "document.querySelector('[role=combobox]')?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
            capture(web, "02-search-browse");
            navigate(web, "/search/2pac");
            require(web, "!!document.querySelector('[aria-label=\"Search results for 2pac\"]') && document.querySelector('[aria-label=\"Search results for 2pac\"]').getAttribute('aria-busy')==='false'");
            // Allow independently loaded artist and playlist sections to finish as well.
            assertTrue("Independent search sections must finish or show their error", await(web, "!document.querySelector('.page-search .animate-shimmer') && !/Loading artists and playlists/.test(document.querySelector('.page-search')?.innerText||'')", 45));
            capture(web, "03-search-results");
            String artist = text(web, "document.querySelector('.page-search a[href^=\"/artist/UC\"]')?.getAttribute('href')||''");
            String playlist = text(web, "document.querySelector('.page-search a[href^=\"/youtube-playlist/\"]')?.getAttribute('href')||''");
            if (!artist.isEmpty()) {
                navigate(web, artist);
                require(web, "!!document.querySelector('#artist-title') && !document.querySelector('[aria-label=\"Loading artist songs\"]')");
                capture(web, "04-artist-settled");
            } else record("{\"screen\":\"artist\",\"availability\":\"No artist channel returned by live search; search result screenshot records provider state\"}");
            if (!playlist.isEmpty()) {
                navigate(web, playlist);
                assertTrue("Playlist must finish loading or display an explicit error", settled(web, "#main-content"));
                capture(web, "05-playlist-settled");
            } else record("{\"screen\":\"playlist\",\"availability\":\"No playlist returned by live search; no synthetic success substituted\"}");
            navigate(web, "/library");
            require(web, "!!document.querySelector('a[href^=\"/login\"]') && !document.querySelector('.page .animate-shimmer')");
            capture(web, "06-library-guest");
            click(web, ".app-tabbar button[aria-label='Create playlist or Jam']");
            require(web, "!!document.querySelector('[role=dialog][aria-label=Create]')");
            capture(web, "07-create-picker");
            // Guest Create is a login gate, never an account mutation.
            js(web, "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.innerText.includes('Playlist'))?.click()");
            require(web, "location.pathname==='/login' && !!document.querySelector('input[type=email]')");
            observe(web); capture(web, "08-login-guest-gate");
            navigate(web, "/settings");
            // Test the deployed Settings page, including builds before the card gained a QA marker.
            require(web, "!!document.querySelector('.page-settings h1') && !!document.querySelector('.page-settings button,.page-settings input') && !/Checking download/.test(document.querySelector('.page-settings').innerText)");
            capture(web, "09-settings-portrait");
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
            require(web, "innerWidth>innerHeight");
            requirePhoneNavigation(web);
            capture(web, "10-settings-landscape");
            navigate(web, "/search/2pac");
            require(web, "!!document.querySelector('[aria-label=\"Search results for 2pac\"]') && document.querySelector('[aria-label=\"Search results for 2pac\"]').getAttribute('aria-busy')==='false'");
            requirePhoneNavigation(web);
            capture(web, "11-search-landscape");
            scenario.onActivity(activity -> activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
            require(web, "innerHeight>innerWidth");
            click(web, ".app-tabbar a[href='/']");
            require(web, "location.pathname==='/'");
            assertEquals("Home tab reflects active route", "true", js(web, "document.querySelector('.app-tabbar a[href=\"/\"]').getAttribute('aria-current')==='page'"));
            record(new org.json.JSONObject().put("tour", "complete").put("webMode", QaCurrentWeb.mode()).put("sourceCommit", QaCurrentWeb.sourceCommit()).put("currentBuildRequests", QaCurrentWeb.requestCount()).put("currentBuildMainDocuments", QaCurrentWeb.mainDocumentCount()).put("scope", "Guest UI; live public APIs; no credentials, account writes or provider playback submitted").toString());
            } catch (Exception | AssertionError failure) {
                try { screenshot("99-failure"); record("{\"tour\":\"failed\",\"category\":" + org.json.JSONObject.quote(failure.getClass().getSimpleName()) + "}"); }
                catch (Exception | AssertionError ignored) { /* Preserve the original assertion if evidence collection fails. */ }
                throw failure;
            }
        }
    }
}
