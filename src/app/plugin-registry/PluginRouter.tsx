import { Alert } from "antd";
import { useMemo } from "react";

import { useI18n } from "@/app/i18n";
import { getAll, getById } from "@/app/plugin-registry/registry";
import { getRoutablePlugins } from "@/app/plugin-registry/visibility";
import { useSettingsStore } from "@/app/store/settings";

export function PluginRouter() {
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const enabledPluginIds = useSettingsStore((state) => state.enabledPluginIds);
  const { t } = useI18n();

  const selectedPlugin = useMemo(
    () => {
      const selected = getById(selectedPluginId);
      const routablePlugins = getRoutablePlugins(getAll(), enabledPluginIds);
      if (selected && routablePlugins.some((plugin) => plugin.id === selected.id)) {
        return selected;
      }
      return routablePlugins[0];
    },
    [enabledPluginIds, selectedPluginId],
  );

  if (!selectedPlugin) {
    return (
      <Alert
        type="warning"
        showIcon
        message={t("plugins.noneEnabledTitle")}
        description={t("plugins.noneEnabledDescription")}
      />
    );
  }

  const Component = selectedPlugin.component;
  return <Component />;
}
