export function shouldDeferYoutubeResume({ hidden = false, explicitUserAction = false } = {}) {
  return Boolean(hidden) && !explicitUserAction;
}
