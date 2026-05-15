import { invoke } from "@tauri-apps/api/core";

import type { DevLogEntry } from "@/app/developer-console/types";

export async function listDevLogs(): Promise<DevLogEntry[]> {
  return invoke("cmd_dev_log_list");
}

export async function clearDevLogs(): Promise<void> {
  await invoke("cmd_dev_log_clear");
}
