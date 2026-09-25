export function canCreateWebGLContext(
  createCanvas = () => document.createElement("canvas"),
) {
  try {
    const canvas = createCanvas();
    const context =
      canvas?.getContext?.("webgl") ||
      canvas?.getContext?.("experimental-webgl");
    if (!context) return false;
    try {
      context.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    } catch {
      // Releasing a probe context is best-effort and must not change support detection.
    }
    return true;
  } catch {
    return false;
  }
}
