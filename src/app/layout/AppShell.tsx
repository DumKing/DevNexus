import { MessageOutlined, SettingOutlined } from "@ant-design/icons";
import { Badge, Button, Layout, Modal, Space, Tag, Typography } from "antd";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { DeveloperConsole } from "@/app/developer-console/DeveloperConsole";
import { setDevLogEnabled } from "@/app/developer-console/api";
import { useI18n, pluginLabel } from "@/app/i18n";
import { Sidebar } from "@/app/layout/Sidebar";
import { buildAppStatusItems, shouldDockChatInStatusBar } from "@/app/layout/status-bar";
import { buildLanChatNotification } from "@/app/notifications/lan-chat-notifications";
import { showDesktopNotification } from "@/app/notifications/desktop-notifications";
import { clearAppAttention, requestAppAttention } from "@/app/notifications/window-attention";
import { Titlebar } from "@/app/layout/Titlebar";
import { PluginRouter } from "@/app/plugin-registry/PluginRouter";
import { getAll, getById } from "@/app/plugin-registry/registry";
import { getRoutablePlugins, isPluginEnabled } from "@/app/plugin-registry/visibility";
import { isMacOsRuntime } from "@/app/runtime/platform";
import { AppSettingsDrawer } from "@/app/settings/AppSettingsDrawer";
import { useSettingsStore } from "@/app/store/settings";
import { shouldRunAutoUpdateCheck } from "@/app/update-checker/auto-check";
import { checkLatestRelease } from "@/app/update-checker/update-checker";
import packageJson from "../../../package.json";
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
  const { language, t } = useI18n();
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const setSelectedPluginId = useSettingsStore((state) => state.setSelectedPluginId);
  const enabledPluginIds = useSettingsStore((state) => state.enabledPluginIds);
  const lanChatNotificationsEnabled = useSettingsStore((state) => state.lanChatNotificationsEnabled);
  const debugLogsEnabled = useSettingsStore((state) => state.debugLogsEnabled);
  const autoCheckUpdates = useSettingsStore((state) => state.autoCheckUpdates);
  const lastUpdateCheckAt = useSettingsStore((state) => state.lastUpdateCheckAt);
  const setLastUpdateCheckAt = useSettingsStore((state) => state.setLastUpdateCheckAt);
  const chatWindow = useLanChatStore((state) => state.window);
  const restoreChatWindow = useLanChatStore((state) => state.restoreWindow);
  const addConversationUnread = useLanChatStore((state) => state.addConversationUnread);
  const [lanSnapshot, setLanSnapshot] = useState<LanChatSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const seenLanMessageIds = useRef<Set<string>>(new Set());
  const lanMonitorReady = useRef(false);
  const desktopRuntime = isTauri();
  const nativeTitlebar = isMacOsRuntime();
  const appWindow = desktopRuntime && !nativeTitlebar ? getCurrentWindow() : null;
  const edgeSize = 6;
  const allPlugins = useMemo(() => getAll(), []);
  const lanChatEnabled = useMemo(() => {
    const plugin = getById("lan-chat");
    return plugin ? isPluginEnabled(plugin, enabledPluginIds) : true;
  }, [enabledPluginIds]);
  const selectedManifest = getById(selectedPluginId);
  const selectedToolName = selectedManifest ? pluginLabel(language, selectedManifest.id, selectedManifest.name) : selectedPluginId;
  const statusItems = useMemo(
    () =>
      buildAppStatusItems({
        selectedToolName,
        sidebarCollapsed,
        runtime: desktopRuntime ? "desktop" : "browser",
        lanDevices: lanSnapshot?.devices.length ?? 0,
        lanRooms: lanSnapshot?.rooms.length ?? 0,
        lanTransfers: lanSnapshot?.transfers.length ?? 0,
        labels: {
          tool: t("status.tool"),
          sidebar: t("status.sidebar"),
          runtime: t("status.runtime"),
          lanDevices: t("status.lanDevices"),
          rooms: t("status.rooms"),
          transfers: t("status.transfers"),
          collapsed: t("status.collapsed"),
          expanded: t("status.expanded"),
          desktop: t("status.desktop"),
          browser: t("status.browser"),
        },
      }),
    [desktopRuntime, lanSnapshot?.devices.length, lanSnapshot?.rooms.length, lanSnapshot?.transfers.length, selectedToolName, sidebarCollapsed, t],
  );
  const dockChat = shouldDockChatInStatusBar(chatWindow);

  useEffect(() => {
    const routablePlugins = getRoutablePlugins(allPlugins, enabledPluginIds);
    if (routablePlugins.length > 0 && !routablePlugins.some((plugin) => plugin.id === selectedPluginId)) {
      setSelectedPluginId(routablePlugins[0].id);
    }
  }, [allPlugins, enabledPluginIds, selectedPluginId, setSelectedPluginId]);

  useEffect(() => {
    if (desktopRuntime) {
      void setDevLogEnabled(debugLogsEnabled).catch(() => undefined);
    }
  }, [debugLogsEnabled, desktopRuntime]);

  useEffect(() => {
    if (!desktopRuntime) return undefined;
    const unlistenPromise = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void getCurrentWindow().hide();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [desktopRuntime]);

  useEffect(() => {
    if (!desktopRuntime || !shouldRunAutoUpdateCheck({ enabled: autoCheckUpdates, lastCheckAt: lastUpdateCheckAt })) {
      return;
    }
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const currentVersion = await getVersion().catch(() => packageJson.version);
          const result = await checkLatestRelease(currentVersion);
          setLastUpdateCheckAt(new Date().toISOString());
          if (result.hasUpdate) {
            Modal.info({
              title: t("updates.latestTitle"),
              content: t("updates.latestContent", { latest: result.latestVersion, current: result.currentVersion }),
              okText: t("updates.openRelease"),
              onOk: () => openUrl(result.releaseUrl),
            });
          }
        } catch {
          setLastUpdateCheckAt(new Date().toISOString());
        }
      })();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [autoCheckUpdates, desktopRuntime, lastUpdateCheckAt, setLastUpdateCheckAt, t]);

  useEffect(() => {
    if (!desktopRuntime || !lanChatEnabled) {
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
              void requestAppAttention().catch(() => undefined);
              if (lanChatNotificationsEnabled) {
                const latest = unseen.length > 0 ? unseen[unseen.length - 1] : undefined;
                const senderName = latest
                  ? snapshot.devices.find((device) => device.deviceId === latest.senderDeviceId)?.nickname
                  : undefined;
                const notification = buildLanChatNotification({ conversation, messages: unseen, senderName });
                if (notification) {
                  void showDesktopNotification(notification.title, notification.body).catch(() => undefined);
                }
              }
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
  }, [addConversationUnread, desktopRuntime, lanChatEnabled, lanChatNotificationsEnabled]);

  useEffect(() => {
    if (!desktopRuntime) return undefined;
    const unlistenPromise = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) {
        void clearAppAttention().catch(() => undefined);
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [desktopRuntime]);

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
    <Layout className={nativeTitlebar ? "devnexus-layout devnexus-layout--native-titlebar" : "devnexus-layout"}>
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
        {lanChatEnabled ? <LanChatWindowHost /> : null}
        <AppSettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
            {lanChatEnabled && dockChat ? (
              <Button
                size="small"
                type="text"
                className="devnexus-layout__footer-chat"
                icon={<MessageOutlined />}
                onClick={restoreChatWindow}
              >
                <Badge count={chatWindow.unreadCount} size="small" overflowCount={99}>
                  <span>{t("lan.title")}</span>
                </Badge>
              </Button>
            ) : null}
            <Button
              size="small"
              type="text"
              className="devnexus-layout__footer-settings"
              icon={<SettingOutlined />}
              onClick={() => setSettingsOpen(true)}
            >
              {t("app.settings")}
            </Button>
          </Footer>
        </Layout>
      </Layout>
    </Layout>
  );
}
