export const ANDROID_NAVIGATE_HOME_EVENT = "haykasa:navigate-home";

// Native Back uses the client router so a route change keeps the player and
// its connection to Android's media service in the same document.
export function installAndroidNavigation(router, target = window) {
  const navigateHome = (event) => {
    router.replace("/");
    event.preventDefault();
  };
  target.addEventListener(ANDROID_NAVIGATE_HOME_EVENT, navigateHome);
  return () => target.removeEventListener(ANDROID_NAVIGATE_HOME_EVENT, navigateHome);
}
