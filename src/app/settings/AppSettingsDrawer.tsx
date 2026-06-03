import { AppstoreOutlined, BellOutlined, BugOutlined, GlobalOutlined, PoweroffOutlined, SettingOutlined, SyncOutlined } from "@ant-design/icons";
import { Alert, Card, Drawer, Empty, Input, Select, Space, Switch, Tabs, Tag, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { getDevLogEnabled, setDevLogEnabled } from "@/app/developer-console/api";
import { useI18n, pluginLabel } from "@/app/i18n";
import { languageOptions } from "@/app/i18n/translations";
import { ensureDesktopNotificationPermission } from "@/app/notifications/desktop-notifications";
import { filterPluginManagerItems, getPluginGroupId, pluginGroupLabelKey, type PluginGroupId } from "@/app/plugin-registry/plugin-groups";
import { getAll } from "@/app/plugin-registry/registry";
import { canDisablePlugin, isPluginEnabled } from "@/app/plugin-registry/visibility";
import { getAutostartEnabled, setAutostartEnabled } from "@/app/settings/autostart";
import { useSettingsStore } from "@/app/store/settings";
import { UpdateCheckButton } from "@/app/update-checker/UpdateCheckButton";

interface AppSettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AppSettingsDrawer({ open, onClose }: AppSettingsDrawerProps) {
  const { language, t } = useI18n();
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const setSelectedPluginId = useSettingsStore((state) => state.setSelectedPluginId);
  const enabledPluginIds = useSettingsStore((state) => state.enabledPluginIds);
  const setPluginEnabled = useSettingsStore((state) => state.setPluginEnabled);
  const lanChatNotificationsEnabled = useSettingsStore((state) => state.lanChatNotificationsEnabled);
  const setLanChatNotificationsEnabled = useSettingsStore((state) => state.setLanChatNotificationsEnabled);
  const debugLogsEnabled = useSettingsStore((state) => state.debugLogsEnabled);
  const setDebugLogsEnabled = useSettingsStore((state) => state.setDebugLogsEnabled);
  const autoCheckUpdates = useSettingsStore((state) => state.autoCheckUpdates);
  const setAutoCheckUpdates = useSettingsStore((state) => state.setAutoCheckUpdates);
  const [syncingDebugLogs, setSyncingDebugLogs] = useState(false);
  const [syncingAutostart, setSyncingAutostart] = useState(false);
  const [autostartEnabled, setLocalAutostartEnabled] = useState(false);
  const [pluginSearch, setPluginSearch] = useState("");
  const [pluginGroup, setPluginGroup] = useState<PluginGroupId>("all");
  const plugins = getAll();
  const allPluginIds = plugins.map((plugin) => plugin.id);
  const enabledPluginCount = plugins.filter((plugin) => isPluginEnabled(plugin, enabledPluginIds)).length;
  const groupOptions = useMemo(
    () =>
      (["all", "enabled", "database", "storage", "network", "api", "messaging", "document", "collaboration"] as PluginGroupId[]).map((value) => ({
        value,
        label: t(pluginGroupLabelKey(value)),
      })),
    [t],
  );
  const visiblePlugins = useMemo(
    () =>
      filterPluginManagerItems({
        plugins,
        enabledPluginIds,
        groupId: pluginGroup,
        search: pluginSearch,
        getLabel: (plugin) => pluginLabel(language, plugin.id, plugin.name),
      }),
    [enabledPluginIds, language, pluginGroup, pluginSearch, plugins],
  );

  useEffect(() => {
    if (!open) return;
    void getDevLogEnabled()
      .then(setDebugLogsEnabled)
      .catch(() => undefined);
    void getAutostartEnabled()
      .then(setLocalAutostartEnabled)
      .catch(() => undefined);
  }, [open, setDebugLogsEnabled]);

  const toggleNotifications = async (enabled: boolean) => {
    if (enabled) {
      const allowed = await ensureDesktopNotificationPermission();
      if (!allowed) {
        void message.warning(t("settings.notificationDenied"));
        setLanChatNotificationsEnabled(false);
        return;
      }
    }
    setLanChatNotificationsEnabled(enabled);
  };

  const toggleDebugLogs = async (enabled: boolean) => {
    setSyncingDebugLogs(true);
    try {
      await setDevLogEnabled(enabled);
      setDebugLogsEnabled(enabled);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncingDebugLogs(false);
    }
  };

  const toggleAutostart = async (enabled: boolean) => {
    setSyncingAutostart(true);
    try {
      await setAutostartEnabled(enabled);
      setLocalAutostartEnabled(enabled);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncingAutostart(false);
    }
  };

  const togglePlugin = (id: string, enabled: boolean) => {
    const plugin = plugins.find((item) => item.id === id);
    if (!plugin) return;
    if (!enabled && !canDisablePlugin({ plugin, plugins, enabledPluginIds })) {
      void message.warning(t("plugins.keepOne"));
      return;
    }
    setPluginEnabled(id, enabled, allPluginIds);
    if (!enabled && selectedPluginId === id) {
      const next = plugins.find((item) => item.id !== id && item.showInSidebar !== false && isPluginEnabled(item, enabledPluginIds));
      if (next) setSelectedPluginId(next.id);
    }
  };

  const basicSettings = (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small" title={<Space><GlobalOutlined />{t("app.language")}</Space>}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Select value={language} options={languageOptions} onChange={setLanguage} style={{ width: 180 }} />
          <Typography.Text type="secondary">{t("app.languageHelp")}</Typography.Text>
        </Space>
      </Card>

      <Card size="small" title={<Space><SyncOutlined />{t("settings.updates")}</Space>}>
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Paragraph type="secondary">
            {t("settings.updateDescription")}
          </Typography.Paragraph>
          <Space wrap>
            <UpdateCheckButton />
            <Switch checked={autoCheckUpdates} onChange={setAutoCheckUpdates} checkedChildren={t("settings.auto")} unCheckedChildren={t("settings.manual")} />
          </Space>
          <Alert type="info" showIcon message={t("settings.autoCheckInfo")} />
        </Space>
      </Card>

      <Card size="small" title={<Space><PoweroffOutlined />{t("settings.startup")}</Space>}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Typography.Text>{t("settings.autostart")}</Typography.Text>
            <Switch loading={syncingAutostart} checked={autostartEnabled} onChange={(value) => void toggleAutostart(value)} />
          </Space>
          <Typography.Text type="secondary">
            {t("settings.autostartHelp")}
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small" title={<Space><BellOutlined />{t("settings.notifications")}</Space>}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Typography.Text>{t("settings.lanChatNotifications")}</Typography.Text>
            <Switch checked={lanChatNotificationsEnabled} onChange={(value) => void toggleNotifications(value)} />
          </Space>
          <Typography.Text type="secondary">
            {t("settings.lanChatNotificationsHelp")}
          </Typography.Text>
        </Space>
      </Card>

      <Card size="small" title={<Space><BugOutlined />{t("settings.developerDiagnostics")}</Space>}>
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Space align="center" style={{ justifyContent: "space-between", width: "100%" }}>
            <Typography.Text>{t("settings.developerLogs")}</Typography.Text>
            <Switch loading={syncingDebugLogs} checked={debugLogsEnabled} onChange={(value) => void toggleDebugLogs(value)} />
          </Space>
          <Typography.Text type="secondary">
            {t("settings.developerLogsHelp")}
          </Typography.Text>
        </Space>
      </Card>
    </Space>
  );

  const pluginSettings = (
    <Card size="small" title={<Space><AppstoreOutlined />{t("plugins.manager")}</Space>}>
      <Space direction="vertical" size={10} style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary">{t("plugins.managerDescription")}</Typography.Paragraph>
        <div className="devnexus-settings__plugin-toolbar">
          <Input.Search
            allowClear
            placeholder={t("plugins.searchPlaceholder")}
            value={pluginSearch}
            onChange={(event) => setPluginSearch(event.target.value)}
          />
          <Select value={pluginGroup} options={groupOptions} onChange={setPluginGroup} style={{ minWidth: 160 }} />
          <Tag color="green">{t("plugins.enabledCount", { enabled: enabledPluginCount, total: plugins.length })}</Tag>
        </div>
        {visiblePlugins.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("plugins.noMatches")} />
        ) : null}
        {visiblePlugins.map((plugin) => {
          const enabled = isPluginEnabled(plugin, enabledPluginIds);
          const disableAllowed = canDisablePlugin({ plugin, plugins, enabledPluginIds });
          return (
            <div key={plugin.id} className="devnexus-settings__plugin-row">
              <Space>
                {plugin.icon}
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{pluginLabel(language, plugin.id, plugin.name)}</Typography.Text>
                  <Space size={6}>
                    <Tag>{t(pluginGroupLabelKey(getPluginGroupId(plugin)))}</Tag>
                    <Tag>{plugin.showInSidebar === false ? t("plugins.floatingEntry") : t("plugins.sidebarEntry")}</Tag>
                  </Space>
                </Space>
              </Space>
              <Switch
                checked={enabled}
                disabled={enabled && !disableAllowed}
                checkedChildren={t("plugins.enabled")}
                unCheckedChildren={t("plugins.disabled")}
                onChange={(value) => togglePlugin(plugin.id, value)}
              />
            </div>
          );
        })}
      </Space>
    </Card>
  );

  return (
    <Drawer title={<Space><SettingOutlined />{t("app.settingsTitle")}</Space>} width={640} open={open} onClose={onClose}>
      <Tabs
        items={[
          {
            key: "basic",
            label: t("settings.tabBasic"),
            children: basicSettings,
          },
          {
            key: "plugins",
            label: t("settings.tabPlugins"),
            children: pluginSettings,
          },
        ]}
      />
    </Drawer>
  );
}
