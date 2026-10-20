package app.haykasa.android;

import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Message;
import android.view.KeyEvent;
import android.webkit.ClientCertRequest;
import android.webkit.HttpAuthHandler;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SafeBrowsingResponse;
import android.webkit.SslErrorHandler;
import android.webkit.ServiceWorkerController;
import android.webkit.ServiceWorkerClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Instrumentation-only transport for the exact current production web build.
 * The APK's origin, bridge policy, cookies and external provider stay unchanged.
 * Only this test APK contains the interceptor. No listener, URL override, HTTP
 * permission or QA configuration is added to either distributed app variant.
 */
final class QaCurrentWeb {
    private static final AtomicInteger REQUESTS = new AtomicInteger();
    private static final AtomicInteger MAIN_DOCUMENTS = new AtomicInteger();
    private static final Set<String> REQUEST_HEADERS = Set.of(
        "accept", "rsc", "next-router-state-tree", "next-router-prefetch", "next-url",
        "next-router-segment-prefetch", "x-nextjs-data");
    private static final int MAX_BODY = 16 * 1024 * 1024;
    private QaCurrentWeb() {}

    static boolean enabled() {
        return "1".equals(InstrumentationRegistry.getArguments().getString("qaCurrentWeb"));
    }
    static String mode() { return enabled() ? "runner_current_production_build_with_live_public_apis" : "deployed_production"; }
    static String sourceCommit() {
        String value = InstrumentationRegistry.getArguments().getString("qaCommit", "");
        if (enabled() && !value.matches("[0-9a-f]{40}")) throw new IllegalStateException("Current-build QA requires an exact source commit");
        return value;
    }
    static int requestCount() { return REQUESTS.get(); }
    static int mainDocumentCount() { return MAIN_DOCUMENTS.get(); }

    static void install(WebView web) {
        if (!enabled()) return;
        sourceCommit();
        ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return stages(request.getUrl().toString(), request.getMethod()) ? stage(request.getUrl(), request.getRequestHeaders()) : null;
            }
        });
        if (!(web.getWebViewClient() instanceof CurrentBuildClient)) {
            web.setWebViewClient(new CurrentBuildClient(web.getWebViewClient()));
        }
    }

    static boolean stages(String url, String method) {
        if (!"GET".equals(method) || !MediaPolicy.isWebsite(url)) return false;
        String path;
        try { path = new java.net.URI(url).getPath(); }
        catch (java.net.URISyntaxException failure) { return false; }
        // Authorization, source delivery and every other API remain on the real
        // public service. The guest tests clear cookies before using this mode.
        return path != null && !path.equals("/api") && !path.startsWith("/api/")
            && !path.equals("/v1") && !path.startsWith("/v1/");
    }
    private static WebResourceResponse failure() {
        return new WebResourceResponse("text/plain", "UTF-8", 502, "QA build unavailable",
            Map.of("Cache-Control", "no-store"), new ByteArrayInputStream("Current-build QA transport failed".getBytes(StandardCharsets.UTF_8)));
    }
    private static WebResourceResponse stage(Uri uri, Map<String, String> requestHeaders) {
        if ("/sw.js".equals(uri.getPath()) || "/service-worker.js".equals(uri.getPath())) {
            // A production service worker would replace the branch's tested
            // resources. The runner compiles with DISABLE_PWA=1 as well.
            return new WebResourceResponse("application/javascript", "UTF-8", 404, "Not Found",
                Map.of("Cache-Control", "no-store"), new ByteArrayInputStream(new byte[0]));
        }
        String target = uri.getEncodedPath() + (uri.getEncodedQuery() == null ? "" : "?" + uri.getEncodedQuery());
        if (target.length() > 16384 || target.contains("\r") || target.contains("\n")) return failure();
        try (Socket socket = new Socket()) {
            // Raw HTTP is deliberately limited to an instrumentation-only
            // loopback socket; adb reverse maps this port to the CI runner.
            // There is no application cleartext/network-security override.
            socket.connect(new java.net.InetSocketAddress("127.0.0.1", 3011), 10000);
            socket.setSoTimeout(30000);
            StringBuilder request = new StringBuilder("GET ").append(target).append(" HTTP/1.1\r\nHost: 127.0.0.1:3011\r\nConnection: close\r\nAccept-Encoding: identity\r\n");
            for (Map.Entry<String, String> header : requestHeaders.entrySet()) {
                if (REQUEST_HEADERS.contains(header.getKey().toLowerCase(Locale.ROOT))
                    && header.getValue().length() <= 16384 && !header.getValue().contains("\r") && !header.getValue().contains("\n")) {
                    request.append(header.getKey()).append(": ").append(header.getValue()).append("\r\n");
                }
            }
            request.append("\r\n");
            socket.getOutputStream().write(request.toString().getBytes(StandardCharsets.ISO_8859_1));
            socket.getOutputStream().flush();
            InputStream input = new BufferedInputStream(socket.getInputStream());
            String[] status = line(input).split(" ", 3);
            if (status.length < 2 || !status[0].startsWith("HTTP/1.")) throw new IOException("Invalid local build response");
            int statusCode = Integer.parseInt(status[1]);
            // WebResourceResponse cannot represent redirects. None of the tour
            // routes require one; fail visibly instead of falling back to old UI.
            if (statusCode < 200 || statusCode >= 600 || statusCode >= 300 && statusCode <= 399) return failure();
            Map<String, String> headers = new LinkedHashMap<>();
            int bytes = 0;
            for (String header; !(header = line(input)).isEmpty();) {
                bytes += header.length();
                if (bytes > 65536) throw new IOException("Local build headers exceed bound");
                int colon = header.indexOf(':');
                if (colon < 1) throw new IOException("Invalid local build header");
                headers.put(header.substring(0, colon).toLowerCase(Locale.ROOT), header.substring(colon + 1).trim());
            }
            byte[] body;
            if ("chunked".equalsIgnoreCase(headers.remove("transfer-encoding"))) body = chunks(input);
            else body = bounded(input, headers.containsKey("content-length") ? Integer.parseInt(headers.get("content-length")) : -1);
            headers.remove("content-length");
            headers.remove("connection");
            headers.remove("set-cookie"); // Local NextAuth/SSR cannot seed an app session.
            headers.put("cache-control", "no-store");
            headers.put("x-haykasa-qa-source", "runner-current-production-build");
            headers.put("x-haykasa-qa-commit", sourceCommit());
            String type = headers.getOrDefault("content-type", "application/octet-stream");
            String mime = type.split(";", 2)[0];
            String encoding = type.toLowerCase(Locale.ROOT).contains("charset=utf-8") ? "UTF-8" : null;
            REQUESTS.incrementAndGet();
            // A service-worker navigation fetch may not retain isForMainFrame.
            // Count newly delivered HTML as well as direct navigation responses.
            if (statusCode == 200 && "text/html".equalsIgnoreCase(mime)) MAIN_DOCUMENTS.incrementAndGet();
            return new WebResourceResponse(mime, encoding, statusCode, status.length > 2 && !status[2].isEmpty() ? status[2] : "Response", headers, new ByteArrayInputStream(body));
        } catch (IOException | IllegalArgumentException failure) {
            return failure();
        }
    }
    private static String line(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        for (int value; (value = input.read()) != -1;) {
            if (value == '\n') return bytes.toString(StandardCharsets.ISO_8859_1).replaceFirst("\\r$", "");
            if (bytes.size() >= 65536) throw new IOException("Local response line exceeds bound");
            bytes.write(value);
        }
        throw new IOException("Truncated local response");
    }
    private static byte[] bounded(InputStream input, int length) throws IOException {
        if (length > MAX_BODY || length < -1) throw new IOException("Local response body exceeds bound");
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        while (length < 0 || output.size() < length) {
            int count = input.read(buffer, 0, length < 0 ? buffer.length : Math.min(buffer.length, length - output.size()));
            if (count == -1) {
                if (length >= 0) throw new IOException("Truncated local response body");
                break;
            }
            output.write(buffer, 0, count);
            if (output.size() > MAX_BODY) throw new IOException("Local response body exceeds bound");
        }
        return output.toByteArray();
    }
    private static byte[] chunks(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while (true) {
            int size = Integer.parseInt(line(input).split(";", 2)[0].trim(), 16);
            if (size == 0) { while (!line(input).isEmpty()) { /* Discard trailer headers. */ } return output.toByteArray(); }
            if (size < 0 || size > MAX_BODY - output.size()) throw new IOException("Local chunked body exceeds bound");
            output.write(bounded(input, size));
            if (!line(input).isEmpty()) throw new IOException("Invalid local chunk delimiter");
        }
    }

    @SuppressWarnings("deprecation")
    private static final class CurrentBuildClient extends WebViewClient {
        private final WebViewClient original;
        CurrentBuildClient(WebViewClient original) { this.original = original; }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return stages(request.getUrl().toString(), request.getMethod()) ? stage(request.getUrl(), request.getRequestHeaders()) : original.shouldInterceptRequest(view, request);
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            Uri uri = Uri.parse(url);
            return stages(url, "GET") ? stage(uri, Collections.emptyMap()) : original.shouldInterceptRequest(view, url);
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return original.shouldOverrideUrlLoading(view, request); }
        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return original.shouldOverrideUrlLoading(view, url); }
        @Override public void onPageStarted(WebView view, String url, Bitmap icon) { original.onPageStarted(view, url, icon); }
        @Override public void onPageFinished(WebView view, String url) { original.onPageFinished(view, url); }
        @Override public void onLoadResource(WebView view, String url) { original.onLoadResource(view, url); }
        @Override public void onPageCommitVisible(WebView view, String url) { original.onPageCommitVisible(view, url); }
        @Override public void onTooManyRedirects(WebView view, Message cancel, Message proceed) { original.onTooManyRedirects(view, cancel, proceed); }
        @Override public void onReceivedError(WebView view, int code, String description, String url) { original.onReceivedError(view, code, description, url); }
        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) { original.onReceivedError(view, request, error); }
        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) { original.onReceivedHttpError(view, request, response); }
        @Override public void onFormResubmission(WebView view, Message dontResend, Message resend) { original.onFormResubmission(view, dontResend, resend); }
        @Override public void doUpdateVisitedHistory(WebView view, String url, boolean reload) { original.doUpdateVisitedHistory(view, url, reload); }
        @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) { original.onReceivedSslError(view, handler, error); }
        @Override public void onReceivedClientCertRequest(WebView view, ClientCertRequest request) { original.onReceivedClientCertRequest(view, request); }
        @Override public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) { original.onReceivedHttpAuthRequest(view, handler, host, realm); }
        @Override public boolean shouldOverrideKeyEvent(WebView view, KeyEvent event) { return original.shouldOverrideKeyEvent(view, event); }
        @Override public void onUnhandledKeyEvent(WebView view, KeyEvent event) { original.onUnhandledKeyEvent(view, event); }
        @Override public void onScaleChanged(WebView view, float oldScale, float newScale) { original.onScaleChanged(view, oldScale, newScale); }
        @Override public void onReceivedLoginRequest(WebView view, String realm, String account, String args) { original.onReceivedLoginRequest(view, realm, account, args); }
        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) { return original.onRenderProcessGone(view, detail); }
        @Override public void onSafeBrowsingHit(WebView view, WebResourceRequest request, int type, SafeBrowsingResponse response) { original.onSafeBrowsingHit(view, request, type, response); }
    }
}
