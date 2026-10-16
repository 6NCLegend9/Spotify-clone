package app.haykasa.android;

import java.net.URI;

final class MediaPolicy {
    static final String ORIGIN = "https://haykasa.vercel.app";
    static boolean isWebsite(String value) {
        try {
            URI u = new URI(value);
            return "https".equals(u.getScheme()) && "haykasa.vercel.app".equals(u.getHost())
                && u.getPort() == -1 && u.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }
    static boolean isAsset(String value) {
        if (value == null || value.length() > 8192 || !isWebsite(value)) return false;
        try { URI u = new URI(value); return u.getFragment() == null && u.getPath().matches("/v1/assets/[a-f0-9]{32}") && u.getRawPath().equals(u.getPath()); }
        catch (Exception ignored) { return false; }
    }
    static boolean isId(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,80}"); }
    private MediaPolicy() {}
}
