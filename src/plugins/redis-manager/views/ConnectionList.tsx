import { App, Button, Card, Collapse, Dropdown, Empty, Input, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";

import { usePluginI18n } from "@/app/i18n/plugin";
import { ConnectionForm } from "@/plugins/redis-manager/components/ConnectionForm";
import { redisTranslations } from "@/plugins/redis-manager/i18n";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";
import type { ConnectionInfo } from "@/plugins/redis-manager/types";

export function ConnectionList() {
  const { message } = App.useApp();
  const { t } = usePluginI18n(redisTranslations);
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<ConnectionInfo | null>(null);
  const [keyword, setKeyword] = useState("");

  const loading = useConnectionsStore((state) => state.loading);
  const connections = useConnectionsStore((state) => state.connections);
  const connectedIds = useConnectionsStore((state) => state.connectedIds);
  const fetchConnections = useConnectionsStore((state) => state.fetchConnections);
  const connect = useConnectionsStore((state) => state.connect);
  const disconnect = useConnectionsStore((state) => state.disconnect);
  const removeConnection = useConnectionsStore((state) => state.removeConnection);
  const setActiveConnectionId = useWorkspaceStore((state) => state.setActiveConnectionId);
  const setActiveDbIndex = useWorkspaceStore((state) => state.setActiveDbIndex);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return connections;
    return connections.filter((item) => item.name.toLowerCase().includes(text));
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || t("defaultGroup");
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered, t]);

  const onConnect = async (item: ConnectionInfo) => {
    await connect(item.id);
    setActiveConnectionId(item.id);
    setActiveDbIndex(item.dbIndex);
    setActiveView("keys");
    message.success(t("connectedMessage", { name: item.name }));
  };

  const onDisconnect = async (item: ConnectionInfo) => {
    await disconnect(item.id);
    message.info(t("disconnectedMessage", { name: item.name }));
  };

  const onDelete = async (item: ConnectionInfo) => {
    await removeConnection(item.id);
    message.success(t("deleted", { name: item.name }));
  };

  const onSaved = async () => {
    setOpenForm(false);
    setEditing(null);
    await fetchConnections();
  };

  return (
    <Card
      title={t("connectionsTitle")}
      loading={loading}
      extra={
        <Space>
          <Input.Search
            placeholder={t("searchPlaceholder")}
            allowClear
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 220 }}
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpenForm(true);
            }}
          >
            {t("newConnection")}
          </Button>
        </Space>
      }
    >
      {grouped.length === 0 ? (
        <Empty description={t("noConnections")} />
      ) : (
        <Collapse
          className="devnexus-connection-group__collapse"
          defaultActiveKey={grouped.map(([groupName]) => groupName)}
          items={grouped.map(([groupName, items]) => ({
            key: groupName,
            label: <Typography.Text strong>{groupName}</Typography.Text>,
            children: (
              <div className="devnexus-connection-group__grid">
                {items.map((item) => {
                  const connected = connectedIds.includes(item.id);
                  return (
                    <Dropdown
                      key={item.id}
                      trigger={["contextMenu"]}
                      menu={{
                        items: [
                          {
                            key: "connect",
                            label: connected ? t("disconnect") : t("connect"),
                            onClick: () => (connected ? onDisconnect(item) : onConnect(item)),
                          },
                          {
                            key: "edit",
                            label: t("edit"),
                            onClick: () => {
                              setEditing(item);
                              setOpenForm(true);
                            },
                          },
                          {
                            key: "delete",
                            label: t("delete"),
                            danger: true,
                            onClick: () => onDelete(item),
                          },
                        ],
                      }}
                    >
                      <Card size="small" hoverable onDoubleClick={() => void onConnect(item)}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <div>
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.host}:{item.port}
                              </Typography.Text>
                            </div>
                          </div>
                          <Tag color={connected ? "green" : "default"}>
                            {connected ? t("connected") : t("disconnected")}
                          </Tag>
                        </Space>
                      </Card>
                    </Dropdown>
                  );
                })}
              </div>
            ),
          }))}
        />
      )}
      <ConnectionForm
        open={openForm}
        initialValues={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                groupName: editing.groupName,
                host: editing.host,
                port: editing.port,
                dbIndex: editing.dbIndex,
                connectionType: editing.connectionType as "Standalone" | "Sentinel" | "Cluster",
              }
            : null
        }
        onCancel={() => {
          setOpenForm(false);
          setEditing(null);
        }}
        onSaved={() => void onSaved()}
      />
    </Card>
  );
}
