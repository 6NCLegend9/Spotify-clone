export const DEFAULT_APPEARANCE_ACCENT = "#096192";

export function foregroundForAccent(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ""));
  if (!match) return "#030814";
  const luminance = (rgb) => rgb.reduce((sum, channel, index) => {
    const value = channel / 255;
    return sum + (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
  }, 0);
  const background = luminance(match.slice(1).map((value) => Number.parseInt(value, 16)));
  return (background + 0.05) / (luminance([3, 8, 20]) + 0.05) >= 4.5 ? "#030814" : "#ffffff";
}

export function effectiveAppearance(value) {
  const appearance = value && typeof value === "object" ? value : {};
  const preview = appearance.preview && typeof appearance.preview === "object"
    ? appearance.preview
    : null;
  const resolvedAccent = /^#[0-9a-f]{6}$/i.test(preview?.resolvedAccent || "")
    ? preview.resolvedAccent : appearance.resolvedAccent || DEFAULT_APPEARANCE_ACCENT;
  if (!preview && appearance.resolvedAccent && appearance.accentForeground) return appearance;
  if (!preview) return {
    ...appearance, resolvedAccent,
    accentForeground: appearance.accentForeground || foregroundForAccent(resolvedAccent),
  };
  return {
    ...appearance,
    activeProfile: preview.profile || appearance.activeProfile || null,
    backgroundUrl:
      typeof preview.backgroundUrl === "string"
        ? preview.backgroundUrl
        : appearance.backgroundUrl || "",
    resolvedAccent,
    accentForeground:
      /^#[0-9a-f]{6}$/i.test(preview.accentForeground || "")
        ? preview.accentForeground
        : foregroundForAccent(resolvedAccent),
  };
}
