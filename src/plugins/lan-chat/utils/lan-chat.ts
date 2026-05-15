import type { LanChatConversation, LanChatDevice } from "@/plugins/lan-chat/types";

export const LAN_CHAT_FLOATING_Z_INDEX = 1200;
export const LAN_CHAT_MODAL_Z_INDEX = 1400;
export const LAN_CHAT_MINIMIZED_WIDTH = 360;
export const LAN_CHAT_MINIMIZED_HEIGHT = 54;

export function pickRoomCoordinator(devices: LanChatDevice[]): LanChatDevice | undefined {
  return [...devices]
    .filter((device) => device.online)
    .sort((left, right) => {
      if (left.isLocal !== right.isLocal) {
        return left.isLocal ? -1 : 1;
      }
      return left.deviceId.localeCompare(right.deviceId);
    })[0];
}

export function formatTransferSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDeviceId(deviceId: string): string {
  if (deviceId.length <= 18) {
    return deviceId;
  }
  return `${deviceId.slice(0, 8)}...${deviceId.slice(-6)}`;
}

export function formatLanEndpoint(host: string | null | undefined, port: number): string {
  return host ? `${host}:${port}` : `:${port}`;
}

export function parseLanEndpoint(endpoint: string): { host: string; port: number } {
  const value = endpoint.trim();
  const [host, rawPort] = value.split(":");
  return {
    host,
    port: rawPort ? Number(rawPort) : 45881,
  };
}

export function splitLanChatConversations(conversations: LanChatConversation[]): {
  rooms: LanChatConversation[];
  directs: LanChatConversation[];
} {
  return {
    rooms: conversations.filter((conversation) => conversation.conversationType === "room"),
    directs: conversations.filter((conversation) => conversation.conversationType === "direct"),
  };
}

export function dockMinimizedWindow(input: {
  viewportWidth: number;
  viewportHeight: number;
  originalX: number;
}): { left: number; bottom: number; width: number; height: number } {
  const maxLeft = Math.max(72, input.viewportWidth - LAN_CHAT_MINIMIZED_WIDTH - 12);
  return {
    left: Math.min(Math.max(72, input.originalX), maxLeft),
    bottom: 0,
    width: LAN_CHAT_MINIMIZED_WIDTH,
    height: LAN_CHAT_MINIMIZED_HEIGHT,
  };
}
