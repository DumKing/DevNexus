export interface DevLogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error" | string;
  scope: string;
  message: string;
  details?: string | null;
}
