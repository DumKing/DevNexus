import { invoke } from "@tauri-apps/api/core";

import type { DevLogEntry } from "@/app/developer-console/types";

export async function listDevLogs(): Promise<DevLogEntry[]> {
  return invoke("cmd_dev_log_list");
}

export async function clearDevLogs(): Promise<void> {
  await invoke("cmd_dev_log_clear");
}

export async function getDevLogEnabled(): Promise<boolean> {
  return invoke("cmd_dev_log_get_enabled");
}

export async function setDevLogEnabled(enabled: boolean): Promise<void> {
  await invoke("cmd_dev_log_set_enabled", { enabled });
}
