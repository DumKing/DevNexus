import {
  AppstoreOutlined,
  DatabaseOutlined,
  DownOutlined,
  LeftOutlined,
  MessageOutlined,
  MoonOutlined,
  RightOutlined,
  SunOutlined,
} from "@ant-design/icons";
import { Badge, Button, Dropdown, Tooltip } from "antd";
import type { MenuProps } from "antd";
import clsx from "clsx";

import { getSidebarPlugins } from "@/app/plugin-registry/visibility";
import { getAll } from "@/app/plugin-registry/registry";
import { useSettingsStore } from "@/app/store/settings";
import { useThemeStore } from "@/app/store/theme";
import { useLanChatStore } from "@/plugins/lan-chat/store/lan-chat";

export function Sidebar() {
  const plugins = getSidebarPlugins(getAll());
  const dbPluginIds = new Set(["redis-manager", "mongodb-client", "mysql-client"]);
  const dbPlugins = plugins.filter((plugin) => dbPluginIds.has(plugin.id));
  const topLevelPlugins = plugins.filter((plugin) => !dbPluginIds.has(plugin.id));
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore(
    (state) => state.setSidebarCollapsed,
  );
  const dbToolsCollapsed = useSettingsStore((state) => state.dbToolsCollapsed);
  const setDbToolsCollapsed = useSettingsStore(
    (state) => state.setDbToolsCollapsed,
  );
  const selectedPluginId = useSettingsStore((state) => state.selectedPluginId);
  const setSelectedPluginId = useSettingsStore(
    (state) => state.setSelectedPluginId,
  );
  const mode = useThemeStore((state) => state.mode);
  const toggleMode = useThemeStore((state) => state.toggleMode);
  const openChatWindow = useLanChatStore((state) => state.openWindow);
  const unreadCount = useLanChatStore((state) => state.window.unreadCount);
  const dbGroupActive = dbPlugins.some((plugin) => plugin.id === selectedPluginId);
  const activeDbPlugin = dbPlugins.find((plugin) => plugin.id === selectedPluginId);
  const dbMenuItems: MenuProps["items"] = dbPlugins.map((plugin) => ({
    key: plugin.id,
    icon: plugin.icon,
    label: plugin.name,
  }));

  const renderPluginButton = (plugin: (typeof plugins)[number], nested = false) => {
    const selected = selectedPluginId === plugin.id;
    const button = (
      <Button
        className={clsx("devnexus-sidebar__plugin-button", {
          "devnexus-sidebar__plugin-button--active": selected,
          "devnexus-sidebar__plugin-button--nested": nested,
        })}
        type="text"
        icon={plugin.icon}
        onClick={() => setSelectedPluginId(plugin.id)}
      >
        {sidebarCollapsed ? null : (
          <span className="devnexus-sidebar__plugin-label">{plugin.name}</span>
        )}
      </Button>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip placement="right" title={plugin.name}>
          {button}
        </Tooltip>
      );
    }

    return button;
  };

  return (
    <aside
      className={clsx("devnexus-sidebar", {
        "devnexus-sidebar--collapsed": sidebarCollapsed,
      })}
    >
      <div className="devnexus-sidebar__top">
        <div className="devnexus-sidebar__brand">
          <AppstoreOutlined />
          {sidebarCollapsed ? null : <span>DevNexus</span>}
        </div>
        <Button
          type="text"
          className="devnexus-sidebar__toggle"
          icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>
      <nav className="devnexus-sidebar__plugins">
        <div className="devnexus-sidebar__group">
          {sidebarCollapsed ? (
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: dbMenuItems,
                selectedKeys: activeDbPlugin ? [activeDbPlugin.id] : [],
                onClick: ({ key }) => setSelectedPluginId(String(key)),
              }}
            >
              <Tooltip placement="right" title={activeDbPlugin ? `DB Tools: ${activeDbPlugin.name}` : "DB Tools"}>
                <Button
                  className={clsx("devnexus-sidebar__group-button", {
                    "devnexus-sidebar__group-button--active": dbGroupActive,
                  })}
                  type="text"
                  icon={activeDbPlugin?.icon ?? <DatabaseOutlined />}
                />
              </Tooltip>
            </Dropdown>
          ) : (
            <>
              <Button
                className={clsx("devnexus-sidebar__group-button", {
                  "devnexus-sidebar__group-button--active": dbGroupActive,
                })}
                type="text"
                icon={<DatabaseOutlined />}
                onClick={() => setDbToolsCollapsed(!dbToolsCollapsed)}
              >
                <span className="devnexus-sidebar__plugin-label">DB Tools</span>
                <DownOutlined
                  className={clsx("devnexus-sidebar__group-chevron", {
                    "devnexus-sidebar__group-chevron--collapsed": dbToolsCollapsed,
                  })}
                />
              </Button>
              {dbToolsCollapsed ? null : (
                <div className="devnexus-sidebar__group-items">
                  {dbPlugins.map((plugin) => (
                    <div key={plugin.id}>{renderPluginButton(plugin, true)}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        {topLevelPlugins.map((plugin) => (
          <div key={plugin.id}>{renderPluginButton(plugin)}</div>
        ))}
      </nav>
      <div className="devnexus-sidebar__bottom">
        <Tooltip placement={sidebarCollapsed ? "right" : "top"} title="LAN Chat">
          <Badge count={unreadCount} size="small" overflowCount={99}>
            <Button
              type="text"
              className="devnexus-sidebar__utility-button"
              icon={<MessageOutlined />}
              onClick={openChatWindow}
            >
              {sidebarCollapsed ? null : "Chat"}
            </Button>
          </Badge>
        </Tooltip>
        <Tooltip placement={sidebarCollapsed ? "right" : "top"} title={mode === "light" ? "Dark" : "Light"}>
          <Button
            type="text"
            className="devnexus-sidebar__utility-button"
            icon={mode === "light" ? <MoonOutlined /> : <SunOutlined />}
            onClick={toggleMode}
          >
            {sidebarCollapsed ? null : mode === "light" ? "Dark" : "Light"}
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}
