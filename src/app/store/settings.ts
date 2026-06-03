import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AppLanguage } from "@/app/i18n/translations";

interface SettingsState {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  dbToolsCollapsed: boolean;
  setDbToolsCollapsed: (collapsed: boolean) => void;
  selectedPluginId: string;
  setSelectedPluginId: (id: string) => void;
  enabledPluginIds?: string[];
  setEnabledPluginIds: (ids?: string[]) => void;
  setPluginEnabled: (id: string, enabled: boolean, allPluginIds: string[]) => void;
  lanChatNotificationsEnabled: boolean;
  setLanChatNotificationsEnabled: (enabled: boolean) => void;
  debugLogsEnabled: boolean;
  setDebugLogsEnabled: (enabled: boolean) => void;
  autoCheckUpdates: boolean;
  setAutoCheckUpdates: (enabled: boolean) => void;
  lastUpdateCheckAt?: string;
  setLastUpdateCheckAt: (checkedAt: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "zh-CN",
      setLanguage: (language) => set({ language }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      dbToolsCollapsed: false,
      setDbToolsCollapsed: (dbToolsCollapsed) => set({ dbToolsCollapsed }),
      selectedPluginId: "redis-manager",
      setSelectedPluginId: (selectedPluginId) => set({ selectedPluginId }),
      enabledPluginIds: undefined,
      setEnabledPluginIds: (enabledPluginIds) => set({ enabledPluginIds }),
      setPluginEnabled: (id, enabled, allPluginIds) =>
        set((state) => {
          const current = new Set(state.enabledPluginIds ?? allPluginIds);
          if (enabled) {
            current.add(id);
          } else {
            current.delete(id);
          }
          return { enabledPluginIds: allPluginIds.filter((pluginId) => current.has(pluginId)) };
        }),
      lanChatNotificationsEnabled: true,
      setLanChatNotificationsEnabled: (lanChatNotificationsEnabled) => set({ lanChatNotificationsEnabled }),
      debugLogsEnabled: false,
      setDebugLogsEnabled: (debugLogsEnabled) => set({ debugLogsEnabled }),
      autoCheckUpdates: false,
      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
      lastUpdateCheckAt: undefined,
      setLastUpdateCheckAt: (lastUpdateCheckAt) => set({ lastUpdateCheckAt }),
    }),
    {
      name: "devnexus-settings",
    },
  ),
);
