export function shouldRunAutoUpdateCheck(input: {
  enabled: boolean;
  lastCheckAt?: string;
  now?: Date;
  intervalHours?: number;
}): boolean {
  if (!input.enabled) return false;
  if (!input.lastCheckAt) return true;
  const checkedAt = new Date(input.lastCheckAt).getTime();
  if (!Number.isFinite(checkedAt)) return true;
  const now = input.now?.getTime() ?? Date.now();
  const intervalMs = (input.intervalHours ?? 24) * 60 * 60 * 1000;
  return now - checkedAt >= intervalMs;
}
