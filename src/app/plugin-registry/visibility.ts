import type { PluginManifest } from "@/app/plugin-registry/types";

export function normalizeEnabledPluginIds(plugins: PluginManifest[], enabledPluginIds?: string[]): string[] {
  const ids = plugins.map((plugin) => plugin.id);
  if (!enabledPluginIds) return ids;
  const idSet = new Set(ids);
  return enabledPluginIds.filter((id) => idSet.has(id));
}

export function isPluginEnabled(plugin: PluginManifest, enabledPluginIds?: string[]): boolean {
  return !enabledPluginIds || enabledPluginIds.includes(plugin.id);
}

export function getEnabledPlugins(plugins: PluginManifest[], enabledPluginIds?: string[]): PluginManifest[] {
  return plugins.filter((plugin) => isPluginEnabled(plugin, enabledPluginIds));
}

export function getSidebarPlugins(plugins: PluginManifest[], enabledPluginIds?: string[]): PluginManifest[] {
  return getEnabledPlugins(plugins, enabledPluginIds).filter((plugin) => plugin.showInSidebar !== false);
}

export function getRoutablePlugins(plugins: PluginManifest[], enabledPluginIds?: string[]): PluginManifest[] {
  return getEnabledPlugins(plugins, enabledPluginIds).filter((plugin) => plugin.component !== null && plugin.showInSidebar !== false);
}

export function canDisablePlugin(input: {
  plugin: PluginManifest;
  plugins: PluginManifest[];
  enabledPluginIds?: string[];
}): boolean {
  if (input.plugin.showInSidebar === false) return true;
  const enabledRoutable = getRoutablePlugins(input.plugins, input.enabledPluginIds);
  return enabledRoutable.length > 1 || !isPluginEnabled(input.plugin, input.enabledPluginIds);
}
