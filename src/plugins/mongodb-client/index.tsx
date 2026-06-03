import { ClusterOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { DatabaseBrowser } from "@/plugins/mongodb-client/views/DatabaseBrowser";
import { DocumentBrowser } from "@/plugins/mongodb-client/views/DocumentBrowser";
import { ImportExport } from "@/plugins/mongodb-client/views/ImportExport";
import { IndexManager } from "@/plugins/mongodb-client/views/IndexManager";
import { MongoConnectionList } from "@/plugins/mongodb-client/views/MongoConnectionList";
import { QueryWorkspace } from "@/plugins/mongodb-client/views/QueryWorkspace";
import { ServerStatus } from "@/plugins/mongodb-client/views/ServerStatus";
import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";

function MongoClientRoot() {
  const { t } = useI18n();
  const tab = useMongoConnectionsStore((state) => state.workspaceTab);
  const setWorkspaceTab = useMongoConnectionsStore((state) => state.setWorkspaceTab);
  const activeConnId = useMongoConnectionsStore((state) => state.activeConnId);
  const activeDatabase = useMongoConnectionsStore((state) => state.activeDatabase);
  const activeCollection = useMongoConnectionsStore((state) => state.activeCollection);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Segmented
          value={tab}
          onChange={(value) =>
            setWorkspaceTab(
              value as
                | "connections"
                | "databases"
                | "documents"
                | "query"
                | "indexes"
                | "importExport"
                | "server",
            )
          }
          options={[
            { label: t("tabs.connections"), value: "connections" },
            { label: t("tabs.databases"), value: "databases" },
            { label: t("tabs.documents"), value: "documents" },
            { label: t("tabs.query"), value: "query" },
            { label: t("tabs.indexes"), value: "indexes" },
            { label: t("tabs.importExport"), value: "importExport" },
            { label: t("tabs.server"), value: "server" },
          ]}
        />
        {activeConnId ? (
          <Typography.Text type="secondary">
            {t("common.active")}: {activeConnId}
            {activeDatabase ? ` / ${activeDatabase}` : ""}
            {activeCollection ? `.${activeCollection}` : ""}
          </Typography.Text>
        ) : null}
      </Space>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {tab === "connections" ? <MongoConnectionList /> : null}
        {tab === "databases" ? <DatabaseBrowser /> : null}
        {tab === "documents" ? <DocumentBrowser /> : null}
        {tab === "query" ? <QueryWorkspace /> : null}
        {tab === "indexes" ? <IndexManager /> : null}
        {tab === "importExport" ? <ImportExport /> : null}
        {tab === "server" ? <ServerStatus /> : null}
      </div>
    </div>
  );
}

export const mongodbClientPlugin: PluginManifest = {
  id: "mongodb-client",
  name: "MongoDB",
  icon: <ClusterOutlined />,
  version: "0.4.0-alpha",
  sidebarOrder: 40,
  component: MongoClientRoot,
};
