import { DatabaseOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { DatabaseBrowser } from "@/plugins/mysql-client/views/DatabaseBrowser";
import { ImportExport } from "@/plugins/mysql-client/views/ImportExport";
import { IndexManager } from "@/plugins/mysql-client/views/IndexManager";
import { MysqlConnectionList } from "@/plugins/mysql-client/views/MysqlConnectionList";
import { ServerStatus } from "@/plugins/mysql-client/views/ServerStatus";
import { SqlWorkspace } from "@/plugins/mysql-client/views/SqlWorkspace";
import { TableData } from "@/plugins/mysql-client/views/TableData";
import { useMysqlConnectionsStore, type MysqlWorkspaceTab } from "@/plugins/mysql-client/store/mysql-connections";

function MysqlClientRoot() {
  const { t } = useI18n();
  const tab = useMysqlConnectionsStore((state) => state.workspaceTab);
  const setWorkspaceTab = useMysqlConnectionsStore((state) => state.setWorkspaceTab);
  const activeConnId = useMysqlConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMysqlConnectionsStore((state) => state.activeDatabase);
  const activeTable = useMysqlConnectionsStore((state) => state.activeTable);
  return <div style={{ width: "100%", height: "100%", minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
    <Space style={{ width: "100%", justifyContent: "space-between" }}>
      <Segmented value={tab} onChange={(value) => setWorkspaceTab(value as MysqlWorkspaceTab)} options={[{ label: t("tabs.connections"), value: "connections" }, { label: t("tabs.databases"), value: "databases" }, { label: t("tabs.tableData"), value: "tableData" }, { label: t("tabs.sql"), value: "sql" }, { label: t("tabs.indexes"), value: "indexes" }, { label: t("tabs.importExport"), value: "importExport" }, { label: t("tabs.server"), value: "server" }]} />
      {activeConnId ? <Typography.Text type="secondary">{t("common.active")}: {activeConnId}{activeDatabase ? ` / ${activeDatabase}` : ""}{activeTable ? `.${activeTable}` : ""}</Typography.Text> : null}
    </Space>
    <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
      {tab === "connections" ? <MysqlConnectionList /> : null}
      {tab === "databases" ? <DatabaseBrowser /> : null}
      {tab === "tableData" ? <TableData /> : null}
      {tab === "sql" ? <SqlWorkspace /> : null}
      {tab === "indexes" ? <IndexManager /> : null}
      {tab === "importExport" ? <ImportExport /> : null}
      {tab === "server" ? <ServerStatus /> : null}
    </div>
  </div>;
}

export const mysqlClientPlugin: PluginManifest = { id: "mysql-client", name: "MySQL", icon: <DatabaseOutlined />, version: "0.5.0-alpha", sidebarOrder: 45, component: MysqlClientRoot };
