import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";

export async function requestAppAttention(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().requestUserAttention(UserAttentionType.Critical);
}

export async function clearAppAttention(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().requestUserAttention(null);
}
