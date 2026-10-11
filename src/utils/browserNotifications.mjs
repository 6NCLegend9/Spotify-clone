export function browserNotificationPermission(notification = globalThis.Notification) {
  if (!notification || typeof notification.requestPermission !== "function") return "unsupported";
  return notification.permission;
}

export function browserNotificationsEnabled(enabled, permission) {
  return enabled === true && permission === "granted";
}

export async function requestBrowserNotificationPermission(notification = globalThis.Notification) {
  const permission = browserNotificationPermission(notification);
  if (permission !== "default") return permission;
  return notification.requestPermission();
}
