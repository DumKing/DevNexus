import { describe, expect, it } from "vitest";

import type { PluginManifest } from "@/app/plugin-registry/types";
import { getSidebarPlugins } from "@/app/plugin-registry/visibility";
import {
  chatWindowDefaults,
  createInitialLanChatState,
  toggleLanChatWindow,
  updateLanChatUnread,
} from "@/plugins/lan-chat/store/lan-chat";

const manifest = (id: string, showInSidebar = true): PluginManifest => ({
  id,
  name: id,
  icon: null,
  version: "0.1.0",
  component: () => null,
  sidebarOrder: 1,
  showInSidebar,
});

describe("lan chat launcher behavior", () => {
  it("filters LAN Chat out of the left sidebar plugin list", () => {
    expect(getSidebarPlugins([manifest("redis-manager"), manifest("lan-chat", false)]).map((plugin) => plugin.id)).toEqual([
      "redis-manager",
    ]);
  });

  it("opens the floating window without changing the selected tool", () => {
    const state = createInitialLanChatState({ selectedPluginId: "redis-manager" });
    const next = toggleLanChatWindow(state, true);

    expect(next.window.open).toBe(true);
    expect(next.window.minimized).toBe(false);
    expect(next.selectedPluginId).toBe("redis-manager");
  });

  it("keeps unread count when the window is closed or minimized", () => {
    const closed = createInitialLanChatState({
      window: { ...chatWindowDefaults, open: false, minimized: false, unreadCount: 0 },
    });
    expect(updateLanChatUnread(closed, 3).window.unreadCount).toBe(3);

    const minimized = createInitialLanChatState({
      window: { ...chatWindowDefaults, open: true, minimized: true, unreadCount: 1 },
    });
    expect(updateLanChatUnread(minimized, 2).window.unreadCount).toBe(3);
  });

  it("clears unread count when the open window receives focus", () => {
    const focused = createInitialLanChatState({
      window: { ...chatWindowDefaults, open: true, minimized: false, unreadCount: 8 },
    });

    expect(updateLanChatUnread(focused, 2).window.unreadCount).toBe(0);
  });
});
