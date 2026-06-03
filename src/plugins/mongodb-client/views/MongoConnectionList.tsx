import { App, Button, Card, Col, Collapse, Input, Row, Space, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { usePluginI18n } from "@/app/i18n/plugin";
import { MongoConnectionForm } from "@/plugins/mongodb-client/components/MongoConnectionForm";
import { mongoTranslations } from "@/plugins/mongodb-client/i18n";
import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";
import type { MongoConnectionInfo } from "@/plugins/mongodb-client/types";

export function MongoConnectionList() {
  const { modal } = App.useApp();
  const { t } = usePluginI18n(mongoTranslations);
  const connections = useMongoConnectionsStore((state) => state.connections);
  const connectedIds = useMongoConnectionsStore((state) => state.connectedIds);
  const fetchConnections = useMongoConnectionsStore((state) => state.fetchConnections);
  const connect = useMongoConnectionsStore((state) => state.connect);
  const disconnect = useMongoConnectionsStore((state) => state.disconnect);
  const deleteConnection = useMongoConnectionsStore((state) => state.deleteConnection);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MongoConnectionInfo | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(
    () =>
      connections.filter((item) =>
        `${item.name} ${item.groupName ?? ""} ${item.host ?? ""}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [connections, search],
  );

  const groups = useMemo(() => {
    const map = new Map<string, MongoConnectionInfo[]>();
    for (const conn of filtered) {
      const key = conn.groupName || t("defaultGroup");
      map.set(key, [...(map.get(key) ?? []), conn]);
    }
    return [...map.entries()];
  }, [filtered, t]);

  return (
    <Card
      title={t("connectionsTitle")}
      extra={
        <Space>
          <Input.Search placeholder={t("searchPlaceholder")} allowClear onChange={(event) => setSearch(event.target.value)} />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            {t("newConnection")}
          </Button>
        </Space>
      }
      style={{ height: "100%", overflow: "auto" }}
    >
      <Collapse
        className="devnexus-connection-group__collapse"
        defaultActiveKey={groups.map(([group]) => group)}
        items={groups.map(([group, items]) => ({
          key: group,
          label: <Typography.Text strong>{group}</Typography.Text>,
          children: (
            <Row gutter={[12, 12]}>
              {items.map((conn) => {
                const connected = connectedIds.includes(conn.id);
                return (
                  <Col key={conn.id} xs={24} md={12} xl={8}>
                    <Card
                      hoverable
                      size="small"
                      onDoubleClick={() => void connect(conn.id)}
                      actions={[
                        <Button key="connect" type="link" onClick={() => (connected ? void disconnect(conn.id) : void connect(conn.id))}>
                          {connected ? t("disconnect") : t("connect")}
                        </Button>,
                        <EditOutlined
                          key="edit"
                          aria-label={t("edit")}
                          onClick={() => {
                            setEditing(conn);
                            setFormOpen(true);
                          }}
                        />,
                        <DeleteOutlined
                          key="delete"
                          aria-label={t("delete")}
                          onClick={() =>
                            modal.confirm({
                              title: t("deleteTitle"),
                              content: conn.name,
                              okButtonProps: { danger: true },
                              onOk: () => deleteConnection(conn.id),
                            })
                          }
                        />,
                      ]}
                    >
                      <Space direction="vertical" size={4}>
                        <Space>
                          <Typography.Text strong>{conn.name}</Typography.Text>
                          <Tag className="devnexus-mongo-connection-tag" color={connected ? "green" : "default"}>
                            {connected ? t("connected") : t("disconnected")}
                          </Tag>
                        </Space>
                        <Typography.Text type="secondary">
                          {conn.mode === "uri" ? t("mongoUri") : `${conn.host}:${conn.port}`}
                        </Typography.Text>
                        <Space wrap>
                          {conn.defaultDatabase ? <Tag className="devnexus-mongo-connection-tag">{conn.defaultDatabase}</Tag> : null}
                          {conn.tls ? (
                            <Tag className="devnexus-mongo-connection-tag" color="blue">
                              TLS
                            </Tag>
                          ) : null}
                          {conn.srv ? (
                            <Tag className="devnexus-mongo-connection-tag" color="purple">
                              SRV
                            </Tag>
                          ) : null}
                        </Space>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          ),
        }))}
      />
      <MongoConnectionForm open={formOpen} initial={editing} onClose={() => setFormOpen(false)} />
    </Card>
  );
}
