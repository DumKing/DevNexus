import { describe, expect, it } from "vitest";

import {
  LAN_CHAT_MODAL_Z_INDEX,
  dockMinimizedWindow,
  formatDeviceId,
  formatLanEndpoint,
  formatTransferSize,
  parseLanEndpoint,
  pickRoomCoordinator,
  splitLanChatConversations,
} from "@/plugins/lan-chat/utils/lan-chat";
import type { LanChatConversation } from "@/plugins/lan-chat/types";
import type { LanChatDevice } from "@/plugins/lan-chat/types";

const device = (deviceId: string, online = true, isLocal = false): LanChatDevice => ({
  deviceId,
  nickname: deviceId,
  port: 45881,
  online,
  isLocal,
});

describe("lan chat utilities", () => {
  it("picks a stable online coordinator and prefers local device", () => {
    expect(
      pickRoomCoordinator([
        device("b"),
        device("a", true, true),
        device("c", false),
      ])?.deviceId,
    ).toBe("a");
  });

  it("formats transfer sizes for file cards", () => {
    expect(formatTransferSize(12)).toBe("12 B");
    expect(formatTransferSize(2048)).toBe("2.0 KB");
    expect(formatTransferSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });

  it("keeps LAN Chat modals above the floating window", () => {
    expect(LAN_CHAT_MODAL_Z_INDEX).toBeGreaterThan(1200);
  });

  it("docks minimized chat to the app bottom edge", () => {
    expect(
      dockMinimizedWindow({
        viewportWidth: 1280,
        viewportHeight: 800,
        originalX: 240,
      }),
    ).toEqual({ left: 240, bottom: 0, width: 360, height: 54 });
  });

  it("keeps device ids visible without shortening them", () => {
    expect(formatDeviceId("device-1234567890")).toBe("device-1234567890");
  });

  it("splits conversations into neutral group and direct buckets", () => {
    const conversations: LanChatConversation[] = [
      { id: "room-1", conversationType: "room", title: "Room", subtitle: "", unreadCount: 0 },
      { id: "direct:peer-1", conversationType: "direct", title: "Peer", subtitle: "", unreadCount: 0 },
    ];

    expect(splitLanChatConversations(conversations)).toEqual({
      rooms: [conversations[0]],
      directs: [conversations[1]],
    });
  });

  it("formats and parses LAN endpoints as the user-facing direct chat address", () => {
    expect(formatLanEndpoint("192.168.1.23", 45881)).toBe("192.168.1.23:45881");
    expect(formatLanEndpoint(null, 45881)).toBe(":45881");
    expect(parseLanEndpoint("192.168.1.23:45882")).toEqual({ host: "192.168.1.23", port: 45882 });
    expect(parseLanEndpoint("192.168.1.23")).toEqual({ host: "192.168.1.23", port: 45881 });
  });
});
