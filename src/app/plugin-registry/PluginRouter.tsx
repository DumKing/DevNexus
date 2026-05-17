import { Alert } from "antd";
import { useMemo } from "react";

import { getAll, getById } from "@/app/plugin-registry/registry";
import { isMobileRuntime } from "@/app/runtime/platform";
import { useSettingsStore } from "@/app/store/settings";

export function PluginRouter() {
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const mobileRuntime = isMobileRuntime();

  const selectedPlugin = useMemo(
    () => {
      const registeredPlugins = getAll();
      const selected = getById(selectedPluginId) ?? registeredPlugins[0];
      if (!mobileRuntime || selected?.mobileSupported === true) {
        return selected;
      }
      return registeredPlugins.find((plugin) => plugin.mobileSupported === true);
    },
    [mobileRuntime, selectedPluginId],
  );

  if (!selectedPlugin) {
    return (
      <Alert
        type={mobileRuntime ? "info" : "warning"}
        showIcon
        message={mobileRuntime ? "DevNexus Mobile" : "No plugin registered"}
        description={
          mobileRuntime
            ? "This experimental mobile build keeps the main surface focused on LAN Chat. Use the Chat button in the bottom bar to open it."
            : "Please register at least one plugin in the registry."
        }
      />
    );
  }

  const Component = selectedPlugin.component;
  return <Component />;
}
