import type { PluginManifest } from "@/app/plugin-registry/types";
import { isPluginEnabled } from "@/app/plugin-registry/visibility";

export type PluginGroupId =
  | "all"
  | "enabled"
  | "database"
  | "storage"
  | "network"
  | "api"
  | "messaging"
  | "document"
  | "collaboration"
  | "other";

const groupByPluginId: Record<string, Exclude<PluginGroupId, "all" | "enabled">> = {
  "redis-manager": "database",
  "mongodb-client": "database",
  "mysql-client": "database",
  "s3-client": "storage",
  "ssh-client": "network",
  "network-tools": "network",
  "api-debugger": "api",
  "mq-client": "messaging",
  confluence: "document",
  "lan-chat": "collaboration",
};

export function getPluginGroupId(plugin: PluginManifest): Exclude<PluginGroupId, "all" | "enabled"> {
  return groupByPluginId[plugin.id] ?? "other";
}

export function pluginGroupLabelKey(groupId: PluginGroupId): string {
  return `plugins.group.${groupId}`;
}

export function filterPluginManagerItems(input: {
  plugins: PluginManifest[];
  enabledPluginIds?: string[];
  groupId: PluginGroupId;
  search: string;
  getLabel: (plugin: PluginManifest) => string;
}): PluginManifest[] {
  const keyword = input.search.trim().toLowerCase();
  return input.plugins.filter((plugin) => {
    if (input.groupId === "enabled" && !isPluginEnabled(plugin, input.enabledPluginIds)) return false;
    if (input.groupId !== "all" && input.groupId !== "enabled" && getPluginGroupId(plugin) !== input.groupId) return false;
    if (!keyword) return true;
    return `${input.getLabel(plugin)} ${plugin.name} ${plugin.id}`.toLowerCase().includes(keyword);
  });
}
