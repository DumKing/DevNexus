import { MessageOutlined } from "@ant-design/icons";
import { Badge, Button, Layout, Space, Tag, Typography } from "antd";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { DeveloperConsole } from "@/app/developer-console/DeveloperConsole";
import { Sidebar } from "@/app/layout/Sidebar";
import { buildAppStatusItems, shouldDockChatInStatusBar } from "@/app/layout/status-bar";
import { Titlebar } from "@/app/layout/Titlebar";
import { PluginRouter } from "@/app/plugin-registry/PluginRouter";
import { getById } from "@/app/plugin-registry/registry";
import { useSettingsStore } from "@/app/store/settings";
import { getLanChatSnapshot, listLanChatConversations, listLanChatMessages, startLanChatNetwork } from "@/plugins/lan-chat/api";
import { LanChatWindowHost } from "@/plugins/lan-chat/components/LanChatWindowHost";
import { useLanChatStore } from "@/plugins/lan-chat/store/lan-chat";
import type { LanChatSnapshot } from "@/plugins/lan-chat/types";

const { Content, Footer } = Layout;
type ResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

export function AppShell() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const chatWindow = useLanChatStore((state) => state.window);
  const restoreChatWindow = useLanChatStore((state) => state.restoreWindow);
  const addConversationUnread = useLanChatStore((state) => state.addConversationUnread);
  const [lanSnapshot, setLanSnapshot] = useState<LanChatSnapshot | null>(null);
  const seenLanMessageIds = useRef<Set<string>>(new Set());
  const lanMonitorReady = useRef(false);
  const desktopRuntime = isTauri();
  const appWindow = isTauri() ? getCurrentWindow() : null;
  const edgeSize = 6;
  const selectedToolName = getById(selectedPluginId)?.name ?? selectedPluginId;
  const statusItems = useMemo(
    () =>
      buildAppStatusItems({
        selectedToolName,
        sidebarCollapsed,
        runtime: desktopRuntime ? "desktop" : "browser",
        lanDevices: lanSnapshot?.devices.length ?? 0,
        lanRooms: lanSnapshot?.rooms.length ?? 0,
        lanTransfers: lanSnapshot?.transfers.length ?? 0,
      }),
    [desktopRuntime, lanSnapshot?.devices.length, lanSnapshot?.rooms.length, lanSnapshot?.transfers.length, selectedToolName, sidebarCollapsed],
  );
  const dockChat = shouldDockChatInStatusBar(chatWindow);

  useEffect(() => {
    if (!desktopRuntime) {
      return undefined;
    }
    const refreshLanStatus = () => {
      void startLanChatNetwork()
        .then(getLanChatSnapshot)
        .then(async (snapshot) => {
          setLanSnapshot(snapshot);
          const conversations = await listLanChatConversations();
          const visibleConversation = useLanChatStore.getState().window.open && !useLanChatStore.getState().window.minimized
            ? useLanChatStore.getState().window.activeConversationId
            : undefined;
          for (const conversation of conversations) {
            const messages = await listLanChatMessages(conversation.id);
            const unseen = messages.filter((item) => item.senderDeviceId !== snapshot.identity.deviceId && !seenLanMessageIds.current.has(item.id));
            for (const item of messages) {
              seenLanMessageIds.current.add(item.id);
            }
            if (lanMonitorReady.current && unseen.length > 0 && conversation.id !== visibleConversation) {
              addConversationUnread(conversation.id, unseen.length);
            }
          }
          lanMonitorReady.current = true;
        })
        .catch(() => undefined);
    };
    const startTimer = window.setTimeout(refreshLanStatus, 1800);
    const timer = window.setInterval(refreshLanStatus, 5000);
    return () => {
      window.clearTimeout(startTimer);
      window.clearInterval(timer);
    };
  }, [addConversationUnread, desktopRuntime]);

  const edgeOverlays: Array<{
    key: string;
    direction: ResizeDirection;
    style: CSSProperties;
  }> = [
    {
      key: "top",
      direction: "North",
      style: { top: 0, left: edgeSize, right: edgeSize, height: edgeSize, cursor: "ns-resize" },
    },
    {
      key: "right",
      direction: "East",
      style: { top: edgeSize, right: 0, bottom: edgeSize, width: edgeSize, cursor: "ew-resize" },
    },
    {
      key: "bottom",
      direction: "South",
      style: { left: edgeSize, right: edgeSize, bottom: 0, height: edgeSize, cursor: "ns-resize" },
    },
    {
      key: "left",
      direction: "West",
      style: { top: edgeSize, left: 0, bottom: edgeSize, width: edgeSize, cursor: "ew-resize" },
    },
    {
      key: "nw",
      direction: "NorthWest",
      style: { top: 0, left: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nwse-resize" },
    },
    {
      key: "ne",
      direction: "NorthEast",
      style: { top: 0, right: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nesw-resize" },
    },
    {
      key: "se",
      direction: "SouthEast",
      style: {
        right: 0,
        bottom: 0,
        width: edgeSize * 2,
        height: edgeSize * 2,
        cursor: "nwse-resize",
      },
    },
    {
      key: "sw",
      direction: "SouthWest",
      style: { left: 0, bottom: 0, width: edgeSize * 2, height: edgeSize * 2, cursor: "nesw-resize" },
    },
  ];

  return (
    <Layout className="devnexus-layout">
      {appWindow &&
        edgeOverlays.map((item) => (
          <div
            key={item.key}
            style={{
              position: "fixed",
              zIndex: 9999,
              ...item.style,
            }}
            onMouseDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              void appWindow.startResizeDragging(item.direction);
            }}
          />
        ))}
      <Titlebar />
      <Layout hasSider className="devnexus-layout__main">
        <Sidebar />
        <LanChatWindowHost />
        <DeveloperConsole />
        <Layout>
          <Content className="devnexus-layout__content">
            <div className="devnexus-layout__content-card">
              <PluginRouter />
            </div>
          </Content>
          <Footer className="devnexus-layout__footer">
            <Space size={8} className="devnexus-layout__footer-status">
              {statusItems.map((item) => (
                <Typography.Text key={item.label} type="secondary" className="devnexus-layout__footer-status-item">
                  {item.label}:
                  <Tag>{item.value}</Tag>
                </Typography.Text>
              ))}
            </Space>
            {dockChat ? (
              <Button
                size="small"
                type="text"
                className="devnexus-layout__footer-chat"
                icon={<MessageOutlined />}
                onClick={restoreChatWindow}
              >
                <Badge count={chatWindow.unreadCount} size="small" overflowCount={99}>
                  <span>LAN Chat</span>
                </Badge>
              </Button>
            ) : null}
          </Footer>
        </Layout>
      </Layout>
    </Layout>
  );
}
