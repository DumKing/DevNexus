import { Col, Row, Segmented } from "antd";
import { useEffect, useMemo } from "react";
import { DatabaseOutlined } from "@ant-design/icons";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { ConnectionList } from "@/plugins/redis-manager/views/ConnectionList";
import { ConsoleView } from "@/plugins/redis-manager/views/Console";
import { KeyBrowser } from "@/plugins/redis-manager/views/KeyBrowser";
import { ServerInfo } from "@/plugins/redis-manager/views/ServerInfo";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";

type RedisWorkspaceTab = "connections" | "keys" | "console" | "server";

function RedisManagerRoot() {
  const { t } = useI18n();
  const tab = useWorkspaceStore((state) => state.activeView);
  const setActiveView = useWorkspaceStore((state) => state.setActiveView);
  const activeConnectionId = useWorkspaceStore((state) => state.activeConnectionId);

  useEffect(() => {
    if (!activeConnectionId && tab === "keys") {
      setActiveView("connections");
    }
  }, [activeConnectionId, tab, setActiveView]);

  const content = useMemo(() => {
    if (tab === "connections") {
      return <ConnectionList />;
    }
    if (tab === "keys") {
      return <KeyBrowser />;
    }
    if (tab === "console") {
      return <ConsoleView />;
    }
    return <ServerInfo />;
  }, [tab]);

  return (
    <div className="devnexus-redis-workspace">
      <Row justify="start" align="middle" className="devnexus-redis-workspace__tabs">
        <Col>
          <Segmented<RedisWorkspaceTab>
            value={tab}
            onChange={(value) => setActiveView(value)}
            options={[
              { label: t("tabs.connections"), value: "connections" },
              { label: t("tabs.keys"), value: "keys" },
              { label: t("tabs.console"), value: "console" },
              { label: t("tabs.server"), value: "server" },
            ]}
          />
        </Col>
      </Row>
      <div className="devnexus-redis-workspace__content">{content}</div>
    </div>
  );
}

export const redisManagerPlugin: PluginManifest = {
  id: "redis-manager",
  name: "Redis",
  icon: <DatabaseOutlined />,
  version: "0.1.0",
  sidebarOrder: 10,
  component: RedisManagerRoot,
};
