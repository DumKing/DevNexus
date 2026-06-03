import { Button, Card, Collapse, Empty, Input, message, Popconfirm, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";

import { usePluginI18n } from "@/app/i18n/plugin";
import { MysqlConnectionForm } from "@/plugins/mysql-client/components/MysqlConnectionForm";
import { mysqlTranslations } from "@/plugins/mysql-client/i18n";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";
import type { MysqlConnectionInfo } from "@/plugins/mysql-client/types";

export function MysqlConnectionList() {
  const { t } = usePluginI18n(mysqlTranslations);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MysqlConnectionInfo | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const { connections, connectedIds, fetchConnections, connect, disconnect, deleteConnection } = useMysqlConnectionsStore();

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const groups = useMemo(() => {
    const filtered = connections.filter(
      (item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.host.toLowerCase().includes(search.toLowerCase()),
    );
    return filtered.reduce<Record<string, MysqlConnectionInfo[]>>((acc, item) => {
      const key = item.groupName || t("defaultGroup");
      acc[key] = [...(acc[key] ?? []), item];
      return acc;
    }, {});
  }, [connections, search, t]);

  const groupEntries = Object.entries(groups);

  return (
    <Card
      title={t("connectionsTitle")}
      extra={
        <Space>
          <Input.Search placeholder={t("searchPlaceholder")} onChange={(event) => setSearch(event.target.value)} />
          <Button
            type="primary"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            + {t("newConnection")}
          </Button>
        </Space>
      }
      style={{ height: "100%", overflow: "auto" }}
    >
      {groupEntries.length === 0 ? (
        <Empty description={t("noConnections")} />
      ) : (
        <Collapse
          className="devnexus-connection-group__collapse"
          defaultActiveKey={groupEntries.map(([group]) => group)}
          items={groupEntries.map(([group, items]) => ({
            key: group,
            label: <Typography.Text strong>{group}</Typography.Text>,
            children: (
              <div className="devnexus-connection-group__grid">
                {items.map((conn) => {
                  const connected = connectedIds.includes(conn.id);
                  return (
                    <Card key={conn.id} hoverable onDoubleClick={() => void connect(conn.id).then(() => message.success(t("connectedTo", { name: conn.name })))} size="small">
                      <Space direction="vertical" style={{ width: "100%" }}>
                        <Space style={{ justifyContent: "space-between", width: "100%" }}>
                          <Typography.Text strong>{conn.name}</Typography.Text>
                          <Tag color={connected ? "green" : "default"}>
                            {connected ? t("connected") : t("disconnected")}
                          </Tag>
                        </Space>
                        <Typography.Text type="secondary">
                          {conn.username}@{conn.host}:{conn.port}
                        </Typography.Text>
                        <Space wrap>
                          <Tag>{conn.defaultDatabase || t("noDefaultDb")}</Tag>
                          <Tag>{conn.charset || "utf8mb4"}</Tag>
                          <Tag>{conn.sslMode || "preferred"}</Tag>
                        </Space>
                        <Space>
                          <Button size="small" type="primary" onClick={() => void connect(conn.id)}>
                            {t("connect")}
                          </Button>
                          <Button size="small" onClick={() => void disconnect(conn.id)} disabled={!connected}>
                            {t("disconnect")}
                          </Button>
                          <Button
                            size="small"
                            onClick={() => {
                              setEditing(conn);
                              setFormOpen(true);
                            }}
                          >
                            {t("edit")}
                          </Button>
                          <Popconfirm title={t("deleteTitle")} onConfirm={() => void deleteConnection(conn.id)}>
                            <Button danger size="small">
                              {t("delete")}
                            </Button>
                          </Popconfirm>
                        </Space>
                      </Space>
                    </Card>
                  );
                })}
              </div>
            ),
          }))}
        />
      )}
      <MysqlConnectionForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
