package app.haykasa.android;

import java.net.URI;
import java.util.Locale;

/** Fixed labels only: never return raw console text, URL paths or query data. */
final class WebDiagnostics {
    static String sourceCategory(String source) {
        try {
            String host = new URI(source).getHost();
            if (host == null) return "other";
            host = host.toLowerCase(Locale.ROOT);
            if (host.equals("haykasa.vercel.app")) return "app";
            if (host.equals("youtube.com") || host.endsWith(".youtube.com") || host.equals("youtube-nocookie.com") || host.endsWith(".youtube-nocookie.com")) return "youtube";
            if (host.equals("googlevideo.com") || host.endsWith(".googlevideo.com")) return "media_delivery";
            if (host.equals("ytimg.com") || host.endsWith(".ytimg.com") || host.equals("gstatic.com") || host.endsWith(".gstatic.com")) return "provider_static";
        } catch (Exception ignored) { /* Unknown sources always receive the same fixed label. */ }
        return "other";
    }
    static String consoleCategory(String message) {
        String text = message == null ? "" : message.toLowerCase(Locale.ROOT);
        if (text.contains("referenceerror")) return "javascript_reference";
        if (text.contains("typeerror")) return "javascript_type";
        if (text.contains("syntaxerror")) return "javascript_syntax";
        if (text.contains("autoplay") || text.contains("notallowederror")) return "autoplay";
        if (text.contains("content security policy") || text.contains("content-security-policy")) return "content_policy";
        if (text.contains("cors") || text.contains("cross-origin")) return "cross_origin";
        if (text.contains("network") || text.contains("failed to load resource") || text.contains("net::")) return "network";
        if (text.contains("media") || text.contains("codec") || text.contains("audio")) return "media";
        return "other";
    }
}
