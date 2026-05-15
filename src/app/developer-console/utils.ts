import type { DevLogEntry } from "@/app/developer-console/types";

export function appendDevLog(logs: DevLogEntry[], entry: DevLogEntry, limit = 1000): DevLogEntry[] {
  return [...logs, entry].slice(-limit);
}

export function devLogLevelColor(level: string): string {
  if (level === "error") return "red";
  if (level === "warn") return "orange";
  if (level === "debug") return "blue";
  return "green";
}
