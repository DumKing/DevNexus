import { App, Button, Card, Collapse, Dropdown, Empty, Input, Space, Tag, Typography } from "antd";
import { PlusOutlined, CloudServerOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { usePluginI18n } from "@/app/i18n/plugin";
import { S3ConnectionForm } from "@/plugins/s3-client/components/S3ConnectionForm";
import { s3Translations } from "@/plugins/s3-client/i18n";
import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";
import type { S3ConnectionInfo, S3Provider } from "@/plugins/s3-client/types";

function providerTag(provider: S3Provider) {
  const map: Record<S3Provider, { text: string; color: string }> = {
    aws: { text: "AWS", color: "gold" },
    minio: { text: "MinIO", color: "red" },
    aliyun: { text: "Aliyun", color: "orange" },
    tencent: { text: "Tencent", color: "blue" },
    r2: { text: "R2", color: "cyan" },
    custom: { text: "Custom", color: "default" },
  };
  const item = map[provider];
  return <Tag color={item.color}>{item.text}</Tag>;
}

export function S3ConnectionList() {
  const { message } = App.useApp();
  const { t } = usePluginI18n(s3Translations);
  const [keyword, setKeyword] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<S3ConnectionInfo | null>(null);

  const connections = useS3ConnectionsStore((state) => state.connections);
  const connectedIds = useS3ConnectionsStore((state) => state.connectedIds);
  const loading = useS3ConnectionsStore((state) => state.loading);
  const fetchConnections = useS3ConnectionsStore((state) => state.fetchConnections);
  const connect = useS3ConnectionsStore((state) => state.connect);
  const disconnect = useS3ConnectionsStore((state) => state.disconnect);
  const deleteConnection = useS3ConnectionsStore((state) => state.deleteConnection);
  const setActive = useS3ConnectionsStore((state) => state.setActive);
  const setWorkspaceTab = useS3ConnectionsStore((state) => state.setWorkspaceTab);
  const listBuckets = useS3ConnectionsStore((state) => state.listBuckets);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return connections;
    return connections.filter((item) => {
      const endpoint = item.endpoint ?? "";
      return item.name.toLowerCase().includes(text) || item.provider.toLowerCase().includes(text) || endpoint.toLowerCase().includes(text);
    });
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, S3ConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || t("defaultGroup");
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered, t]);

  const openBuckets = async (item: S3ConnectionInfo) => {
    if (!connectedIds.includes(item.id)) {
      await connect(item.id);
    }
    setActive(item.id);
    await listBuckets(item.id);
    setWorkspaceTab("buckets");
    message.success(t("connectedMessage", { name: item.name }));
  };

  return (
    <Card
      title={t("connectionsTitle")}
      loading={loading}
      extra={
        <Space>
          <Input.Search placeholder={t("searchPlaceholder")} onChange={(event) => setKeyword(event.target.value)} style={{ width: 260 }} />
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
                            key: "open",
                            label: t("connectOpenBuckets"),
                            onClick: () => void openBuckets(item),
                          },
                          {
                            key: "disconnect",
                            label: t("disconnect"),
                            disabled: !connected,
                            onClick: () => void disconnect(item.id).then(() => message.info(t("disconnectedMessage", { name: item.name }))),
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
                            onClick: () => void deleteConnection(item.id).then(() => message.success(t("deleted", { name: item.name }))),
                          },
                        ],
                      }}
                    >
                      <Card size="small" hoverable onDoubleClick={() => void openBuckets(item)}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <div>
                            <Typography.Text strong>
                              <CloudServerOutlined style={{ marginRight: 6 }} />
                              {item.name}
                            </Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.endpoint || t("region", { region: item.region })}
                              </Typography.Text>
                            </div>
                          </div>
                          <Space>
                            {providerTag(item.provider)}
                            <Tag color={connected ? "green" : "default"}>
                              {connected ? t("connected") : t("disconnected")}
                            </Tag>
                          </Space>
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

      <S3ConnectionForm
        open={openForm}
        initialValues={editing}
        onCancel={() => {
          setOpenForm(false);
          setEditing(null);
        }}
        onSaved={() => {
          setOpenForm(false);
          setEditing(null);
          void fetchConnections();
        }}
      />
    </Card>
  );
}
