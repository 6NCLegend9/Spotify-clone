package app.haykasa.android;
import org.junit.Test;
import static org.junit.Assert.*;
public class MediaPolicyTest {
    @Test public void signedAssetsStayOnTheTrustedOrigin() {
        String path = "/v1/assets/0123456789abcdef0123456789abcdef";
        assertTrue(MediaPolicy.isAsset(MediaPolicy.ORIGIN + path + "?expires=123&signature=test"));
        for (String origin : new String[]{"http://haykasa.vercel.app", "https://evil.example", "https://haykasa.vercel.app.evil.example", "https://haykasa.vercel.app:444", "https://user@haykasa.vercel.app", "file://haykasa.vercel.app"}) assertFalse(origin, MediaPolicy.isAsset(origin + path));
        for (String suffix : new String[]{"/api/auth/session", path + "#fragment", path + "/../../api/auth/session", "/v1/assets/%30" + "123456789abcdef0123456789abcdef", path + "/extra"}) assertFalse(suffix, MediaPolicy.isAsset(MediaPolicy.ORIGIN + suffix));
        assertFalse(MediaPolicy.isAsset(null));
        assertFalse(MediaPolicy.isAsset(MediaPolicy.ORIGIN + path + "?" + "a".repeat(8192)));
    }
    @Test public void messageIdsAreBounded() {
        assertTrue(MediaPolicy.isId("audio_01234567-89ab-cdef"));
        assertFalse(MediaPolicy.isId("../other")); assertFalse(MediaPolicy.isId("")); assertFalse(MediaPolicy.isId("x".repeat(81)));
    }
}
