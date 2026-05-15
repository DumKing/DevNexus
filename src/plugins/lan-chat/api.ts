import { invoke } from "@tauri-apps/api/core";

import type {
  LanChatConversation,
  LanChatDeviceIdentity,
  LanChatMessage,
  LanChatSnapshot,
  LanChatTransfer,
} from "@/plugins/lan-chat/types";

export async function getLanChatSnapshot(): Promise<LanChatSnapshot> {
  return invoke("cmd_lan_chat_discovery_snapshot");
}

export async function updateLanChatDeviceSettings(input: {
  nickname: string;
  port: number;
}): Promise<LanChatDeviceIdentity> {
  return invoke("cmd_lan_chat_update_device_settings", { request: input });
}

export async function startLanChatNetwork(): Promise<void> {
  await invoke("cmd_lan_chat_start_network");
}

export async function createLanChatRoom(name: string, channel: "udp" | "tcp" = "udp"): Promise<void> {
  await invoke("cmd_lan_chat_create_room", { request: { name, channel } });
}

export async function joinLanChatRoom(input: {
  roomId: string;
  name: string;
  coordinatorDeviceId?: string;
  channel?: "udp" | "tcp";
}): Promise<void> {
  await invoke("cmd_lan_chat_join_room", { request: input });
}

export async function updateLanChatRoom(input: {
  roomId: string;
  name?: string;
  channel?: "udp" | "tcp";
}): Promise<void> {
  await invoke("cmd_lan_chat_update_room", { request: input });
}

export async function createDirectConversation(input: {
  peerDeviceId: string;
  peerName: string;
  peerHost?: string | null;
  peerPort?: number | null;
}): Promise<LanChatConversation> {
  return invoke("cmd_lan_chat_create_direct_conversation", { request: input });
}

export async function listLanChatConversations(): Promise<LanChatConversation[]> {
  return invoke("cmd_lan_chat_list_conversations");
}

export async function listLanChatMessages(conversationId: string): Promise<LanChatMessage[]> {
  return invoke("cmd_lan_chat_list_messages", { conversationId, limit: 200 });
}

export async function clearLanChatConversation(conversationId: string): Promise<void> {
  await invoke("cmd_lan_chat_clear_conversation", { conversationId });
}

export async function sendLanChatMessage(input: {
  conversationId: string;
  conversationType: "room" | "direct";
  content: string;
  messageType?: "text" | "image" | "audio" | "video" | "file";
  metadataJson?: string;
}): Promise<LanChatMessage> {
  return invoke("cmd_lan_chat_send_message", {
    request: {
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      messageType: input.messageType ?? "text",
      content: input.content,
      metadataJson: input.metadataJson ?? "{}",
    },
  });
}

export async function sendLanChatFileMessage(input: {
  conversationId: string;
  conversationType: "room" | "direct";
  filePath: string;
}): Promise<LanChatMessage> {
  return invoke("cmd_lan_chat_send_file_message", {
    request: {
      conversationId: input.conversationId,
      conversationType: input.conversationType,
      filePath: input.filePath,
    },
  });
}

export async function createLanChatTransfer(input: {
  conversationId: string;
  conversationType: "room" | "direct";
  fileName: string;
  fileSize: number;
  direction: "send" | "receive";
}): Promise<LanChatTransfer> {
  return invoke("cmd_lan_chat_create_transfer", { request: input });
}

export async function clearLanChatTransfers(): Promise<void> {
  await invoke("cmd_lan_chat_clear_transfers");
}

export async function saveLanChatMessageAttachment(messageId: string, targetPath: string): Promise<string> {
  return invoke("cmd_lan_chat_save_message_attachment", { messageId, targetPath });
}
