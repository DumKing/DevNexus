import type { PluginManifest } from "@/app/plugin-registry/types";
import { isMobileRuntime } from "@/app/runtime/platform";

export function getSidebarPlugins(plugins: PluginManifest[]): PluginManifest[] {
  return plugins.filter((plugin) => plugin.showInSidebar !== false && (!isMobileRuntime() || plugin.mobileSupported === true));
}
