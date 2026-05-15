import type { PluginManifest } from "@/app/plugin-registry/types";

export function getSidebarPlugins(plugins: PluginManifest[]): PluginManifest[] {
  return plugins.filter((plugin) => plugin.showInSidebar !== false);
}
