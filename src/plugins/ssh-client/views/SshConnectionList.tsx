import { App, Button, Card, Collapse, Dropdown, Empty, Input, Space, Tag, Typography } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";

import { usePluginI18n } from "@/app/i18n/plugin";
import { SshConnectionForm } from "@/plugins/ssh-client/components/SshConnectionForm";
import { sshTranslations } from "@/plugins/ssh-client/i18n";
import { useSshConnectionsStore } from "@/plugins/ssh-client/store/ssh-connections";
import { useSshSessionsStore } from "@/plugins/ssh-client/store/sessions";
import { useSshWorkspaceStore } from "@/plugins/ssh-client/store/workspace";
import type { SshConnectionInfo } from "@/plugins/ssh-client/types";

function authTypeTag(authType: string, label: (key: string) => string) {
  if (authType === "password") return <Tag color="default">{label("passwordAuth")}</Tag>;
  if (authType === "key") return <Tag color="blue">{label("keyAuth")}</Tag>;
  return <Tag color="purple">{label("keyPassphraseAuth")}</Tag>;
}

export function SshConnectionList() {
  const { message } = App.useApp();
  const { t } = usePluginI18n(sshTranslations);
  const [keyword, setKeyword] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<SshConnectionInfo | null>(null);

  const connections = useSshConnectionsStore((state) => state.connections);
  const connectedIds = useSshConnectionsStore((state) => state.connectedIds);
  const loading = useSshConnectionsStore((state) => state.loading);
  const fetchConnections = useSshConnectionsStore((state) => state.fetchConnections);
  const connect = useSshConnectionsStore((state) => state.connect);
  const disconnect = useSshConnectionsStore((state) => state.disconnect);
  const deleteConnection = useSshConnectionsStore((state) => state.deleteConnection);

  const setActiveView = useSshWorkspaceStore((state) => state.setActiveView);
  const setActiveConnectionId = useSshWorkspaceStore((state) => state.setActiveConnectionId);
  const openSession = useSshSessionsStore((state) => state.openSession);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return connections;
    return connections.filter((item) => item.name.toLowerCase().includes(text) || item.host.toLowerCase().includes(text));
  }, [connections, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, SshConnectionInfo[]>();
    filtered.forEach((item) => {
      const key = item.groupName || t("defaultGroup");
      map.set(key, [...(map.get(key) ?? []), item]);
    });
    return [...map.entries()];
  }, [filtered, t]);

  const openTerminal = async (item: SshConnectionInfo, newTab: boolean) => {
    if (!connectedIds.includes(item.id)) {
      await connect(item.id);
    }
    setActiveConnectionId(item.id);
    setActiveView("terminal");
    await openSession(item.id, newTab ? `${item.name} #new` : item.name);
    message.success(t("connectedMessage", { target: `${item.username}@${item.host}:${item.port}` }));
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
                            label: t("connectOpen"),
                            onClick: () => void openTerminal(item, false),
                          },
                          {
                            key: "new-tab",
                            label: t("openNewTab"),
                            onClick: () => void openTerminal(item, true),
                          },
                          {
                            key: "disconnect",
                            label: t("disconnect"),
                            onClick: () => void disconnect(item.id).then(() => message.info(t("disconnectedMessage", { name: item.name }))),
                            disabled: !connected,
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
                      <Card size="small" hoverable onDoubleClick={() => void openTerminal(item, false)}>
                        <Space style={{ width: "100%", justifyContent: "space-between" }}>
                          <div>
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <div>
                              <Typography.Text type="secondary">
                                {item.username}@{item.host}:{item.port}
                              </Typography.Text>
                            </div>
                          </div>
                          <Space>
                            {authTypeTag(item.authType, t)}
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

      <SshConnectionForm
        open={openForm}
        initialValues={editing}
        allConnections={connections}
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
