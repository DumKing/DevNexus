import { ApiOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";
import { useEffect } from "react";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { useApiDebuggerStore } from "@/plugins/api-debugger/store/api-debugger";
import type { ApiWorkspaceTab } from "@/plugins/api-debugger/types";
import { CollectionsView } from "@/plugins/api-debugger/views/CollectionsView";
import { EnvironmentsView } from "@/plugins/api-debugger/views/EnvironmentsView";
import { HistoryView } from "@/plugins/api-debugger/views/HistoryView";
import { RequestWorkspace } from "@/plugins/api-debugger/views/RequestWorkspace";

function ApiDebuggerRoot() {
  const { t } = useI18n();
  const tab = useApiDebuggerStore((state) => state.tab);
  const setTab = useApiDebuggerStore((state) => state.setTab);
  const fetchAll = useApiDebuggerStore((state) => state.fetchAll);
  const fetchHistory = useApiDebuggerStore((state) => state.fetchHistory);
  const activeEnvironmentId = useApiDebuggerStore((state) => state.activeEnvironmentId);
  const environments = useApiDebuggerStore((state) => state.environments);

  useEffect(() => { void fetchAll(); void fetchHistory(); }, [fetchAll, fetchHistory]);
  const activeEnvName = environments.find((env) => env.id === activeEnvironmentId)?.name;

  return <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
    <Space style={{ width: "100%", justifyContent: "space-between" }}>
      <Segmented value={tab} onChange={(value) => setTab(value as ApiWorkspaceTab)} options={[{ label: t("tabs.workspace"), value: "workspace" }, { label: t("tabs.collections"), value: "collections" }, { label: t("tabs.environments"), value: "environments" }, { label: t("tabs.history"), value: "history" }]} />
      <Typography.Text type="secondary">{t("tabs.environment")}: {activeEnvName ?? t("common.none")}</Typography.Text>
    </Space>
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      {tab === "workspace" ? <RequestWorkspace /> : null}
      {tab === "collections" ? <CollectionsView /> : null}
      {tab === "environments" ? <EnvironmentsView /> : null}
      {tab === "history" ? <HistoryView /> : null}
    </div>
  </div>;
}

export const apiDebuggerPlugin: PluginManifest = { id: "api-debugger", name: "API", icon: <ApiOutlined />, version: "0.7.0-alpha", sidebarOrder: 55, component: ApiDebuggerRoot };
