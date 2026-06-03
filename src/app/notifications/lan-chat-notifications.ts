import type { LanChatConversation, LanChatMessage } from "@/plugins/lan-chat/types";

export function describeLanChatMessageForNotification(message: LanChatMessage): string {
  if (message.messageType === "image") return "[Image]";
  if (message.messageType === "audio") return "[Audio]";
  if (message.messageType === "video") return "[Video]";
  if (message.messageType === "file") return "[File]";
  return message.content.trim() || "New message";
}

export function buildLanChatNotification(input: {
  conversation: LanChatConversation;
  messages: LanChatMessage[];
  senderName?: string;
}): { title: string; body: string } | null {
  const latest = input.messages.length > 0 ? input.messages[input.messages.length - 1] : undefined;
  if (!latest) return null;
  const sender = input.senderName ? `${input.senderName}: ` : "";
  const prefix = input.messages.length > 1 ? `${input.messages.length} new messages · ` : "";
  return {
    title: `LAN Chat · ${input.conversation.title}`,
    body: `${prefix}${sender}${describeLanChatMessageForNotification(latest)}`,
  };
}
