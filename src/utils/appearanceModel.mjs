export const DEFAULT_APPEARANCE_ACCENT = "#00e6e6";

export function effectiveAppearance(value) {
  const appearance = value && typeof value === "object" ? value : {};
  const preview = appearance.preview && typeof appearance.preview === "object"
    ? appearance.preview
    : null;
  if (!preview) return appearance;
  return {
    ...appearance,
    activeProfile: preview.profile || appearance.activeProfile || null,
    backgroundUrl:
      typeof preview.backgroundUrl === "string"
        ? preview.backgroundUrl
        : appearance.backgroundUrl || "",
    resolvedAccent:
      /^#[0-9a-f]{6}$/i.test(preview.resolvedAccent || "")
        ? preview.resolvedAccent
        : appearance.resolvedAccent || DEFAULT_APPEARANCE_ACCENT,
    accentForeground:
      /^#[0-9a-f]{6}$/i.test(preview.accentForeground || "")
        ? preview.accentForeground
        : appearance.accentForeground || "#001014",
  };
}
