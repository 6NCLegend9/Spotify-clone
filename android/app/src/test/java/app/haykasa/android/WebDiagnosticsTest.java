package app.haykasa.android;

import org.junit.Test;
import static org.junit.Assert.*;

public class WebDiagnosticsTest {
    @Test public void urlsProduceOnlyFixedSourceLabels() {
        assertEquals("app", WebDiagnostics.sourceCategory("https://haykasa.vercel.app/api/example?token=sensitive-user-value"));
        assertEquals("youtube", WebDiagnostics.sourceCategory("https://www.youtube.com/embed/private-id?session=sensitive-user-value"));
        assertEquals("media_delivery", WebDiagnostics.sourceCategory("https://r1.googlevideo.com/videoplayback?signature=sensitive-user-value"));
        assertEquals("other", WebDiagnostics.sourceCategory("https://user:sensitive-user-value@private.example/"));
        assertEquals("other", WebDiagnostics.sourceCategory("data:text/plain,sensitive-user-value"));
        assertEquals("other", WebDiagnostics.sourceCategory(null));
    }
    @Test public void consoleTextNeverBecomesTheDiagnosticOutput() {
        assertEquals("network", WebDiagnostics.consoleCategory("Failed to load resource: https://private.example?token=sensitive-user-value"));
        assertEquals("autoplay", WebDiagnostics.consoleCategory("NotAllowedError: sensitive-user-value"));
        assertEquals("javascript_reference", WebDiagnostics.consoleCategory("Uncaught ReferenceError: sensitive-user-value"));
        assertEquals("javascript_type", WebDiagnostics.consoleCategory("TypeError: sensitive-user-value"));
        assertEquals("javascript_syntax", WebDiagnostics.consoleCategory("SyntaxError: sensitive-user-value"));
        assertEquals("other", WebDiagnostics.consoleCategory("Cookie password sensitive-user-value"));
        assertEquals("other", WebDiagnostics.consoleCategory(null));
    }
}
