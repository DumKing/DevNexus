import { Col, Row, Segmented } from "antd";
import { useMemo } from "react";
import { DesktopOutlined } from "@ant-design/icons";

import { useI18n } from "@/app/i18n";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { SshConnectionList } from "@/plugins/ssh-client/views/SshConnectionList";
import { TerminalWorkspace } from "@/plugins/ssh-client/views/TerminalWorkspace";
import { KeyManager } from "@/plugins/ssh-client/views/KeyManager";
import { TunnelManager } from "@/plugins/ssh-client/views/TunnelManager";
import { useSshWorkspaceStore } from "@/plugins/ssh-client/store/workspace";

function SshClientRoot() {
  const { t } = useI18n();
  const tab = useSshWorkspaceStore((state) => state.activeView);
  const setActiveView = useSshWorkspaceStore((state) => state.setActiveView);

  const content = useMemo(() => {
    if (tab === "connections") return <SshConnectionList />;
    if (tab === "terminal") return <TerminalWorkspace />;
    if (tab === "keys") return <KeyManager />;
    return <TunnelManager />;
  }, [tab]);

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        overflow: "hidden",
      }}
    >
      <Row justify="start" align="middle">
        <Col>
          <Segmented
            value={tab}
            onChange={(value) =>
              setActiveView(
                value as "connections" | "terminal" | "keys" | "tunnels",
              )
            }
            options={[
              { label: t("tabs.connections"), value: "connections" },
              { label: t("tabs.terminal"), value: "terminal" },
              { label: t("tabs.keys"), value: "keys" },
              { label: t("tabs.tunnels"), value: "tunnels" },
            ]}
          />
        </Col>
      </Row>
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>{content}</div>
    </div>
  );
}

export const sshClientPlugin: PluginManifest = {
  id: "ssh-client",
  name: "SSH",
  icon: <DesktopOutlined />,
  version: "0.2.0-alpha",
  sidebarOrder: 20,
  component: SshClientRoot,
};
