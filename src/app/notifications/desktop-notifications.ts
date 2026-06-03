import { isTauri } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export function canUseDesktopNotifications(): boolean {
  return isTauri() || (typeof window !== "undefined" && "Notification" in window);
}

export async function ensureDesktopNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === "granted";
  }

  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission === "denied") {
    return false;
  }
  return (await Notification.requestPermission()) === "granted";
}

export async function showDesktopNotification(title: string, body: string): Promise<boolean> {
  if (!(await ensureDesktopNotificationPermission())) {
    return false;
  }

  if (isTauri()) {
    sendNotification({
      title,
      body,
      autoCancel: true,
      group: "lan-chat",
    });
    return true;
  }

  new Notification(title, {
    body,
    silent: false,
  });
  return true;
}
