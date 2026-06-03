import { GlobalOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { useNetworkToolsStore, type NetworkWorkspaceTab } from "@/plugins/network-tools/store/network-tools";
import { Diagnostics } from "@/plugins/network-tools/views/Diagnostics";
import { History } from "@/plugins/network-tools/views/History";

function NetworkToolsRoot() {
  const { t } = useI18n();
  const tab = useNetworkToolsStore((state) => state.workspaceTab);
  const setWorkspaceTab = useNetworkToolsStore((state) => state.setWorkspaceTab);
  const activeTool = useNetworkToolsStore((state) => state.activeTool);

  return <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
    <Space style={{ width: "100%", justifyContent: "space-between" }}>
      <Segmented value={tab} onChange={(value) => setWorkspaceTab(value as NetworkWorkspaceTab)} options={[{ label: t("tabs.diagnostics"), value: "diagnostics" }, { label: t("tabs.history"), value: "history" }]} />
      <Typography.Text type="secondary">{t("network.activeTool")}: {activeTool.toUpperCase()}</Typography.Text>
    </Space>
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      {tab === "diagnostics" ? <Diagnostics /> : null}
      {tab === "history" ? <History /> : null}
    </div>
  </div>;
}

export const networkToolsPlugin: PluginManifest = { id: "network-tools", name: "Network", icon: <GlobalOutlined />, version: "0.6.0-alpha", sidebarOrder: 50, component: NetworkToolsRoot };
