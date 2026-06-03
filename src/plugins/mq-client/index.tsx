import { ClusterOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";
import { useEffect } from "react";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { useMqStore } from "@/plugins/mq-client/store/mq-client";
import type { MqTab } from "@/plugins/mq-client/types";
import { BrowserView } from "@/plugins/mq-client/views/BrowserView";
import { ConnectionsView } from "@/plugins/mq-client/views/ConnectionsView";
import { HistoryView } from "@/plugins/mq-client/views/HistoryView";
import { MessageStudio } from "@/plugins/mq-client/views/MessageStudio";

function MqClientRoot() {
  const { t } = useI18n();
  const tab = useMqStore((state) => state.tab);
  const setTab = useMqStore((state) => state.setTab);
  const fetchConnections = useMqStore((state) => state.fetchConnections);
  const connections = useMqStore((state) => state.connections);
  const activeConnId = useMqStore((state) => state.activeConnId);
  const active = connections.find((item) => item.id === activeConnId);

  useEffect(() => { void fetchConnections(); }, [fetchConnections]);

  return <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
    <Space style={{ width: "100%", justifyContent: "space-between" }}>
      <Segmented value={tab} onChange={(value) => setTab(value as MqTab)} options={[{ label: t("tabs.connections"), value: "connections" }, { label: t("tabs.browser"), value: "browser" }, { label: t("tabs.messageStudio"), value: "studio" }, { label: t("tabs.history"), value: "history" }]} />
      <Typography.Text type="secondary">{t("common.active")}: {active ? `${active.name} / ${active.brokerType}` : t("common.none")}</Typography.Text>
    </Space>
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      {tab === "connections" ? <ConnectionsView /> : null}
      {tab === "browser" ? <BrowserView /> : null}
      {tab === "studio" ? <MessageStudio /> : null}
      {tab === "history" ? <HistoryView /> : null}
    </div>
  </div>;
}

export const mqClientPlugin: PluginManifest = { id: "mq-client", name: "MQ", icon: <ClusterOutlined />, version: "0.8.0-alpha", sidebarOrder: 60, component: MqClientRoot };
