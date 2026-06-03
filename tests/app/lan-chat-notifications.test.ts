import { describe, expect, it } from "vitest";

import { buildLanChatNotification, describeLanChatMessageForNotification } from "@/app/notifications/lan-chat-notifications";
import type { LanChatConversation, LanChatMessage } from "@/plugins/lan-chat/types";

const conversation: LanChatConversation = {
  id: "public",
  conversationType: "room",
  title: "公共聊天室",
  subtitle: "LAN",
  unreadCount: 0,
};

const message = (id: string, content: string, messageType: LanChatMessage["messageType"] = "text"): LanChatMessage => ({
  id,
  conversationId: "public",
  conversationType: "room",
  senderDeviceId: "peer",
  messageType,
  content,
  metadataJson: "{}",
  status: "received",
  createdAt: "2026-06-02T00:00:00.000Z",
});

describe("lan chat notifications", () => {
  it("uses media labels instead of raw attachment payloads", () => {
    expect(describeLanChatMessageForNotification(message("1", "base64", "image"))).toBe("[Image]");
    expect(describeLanChatMessageForNotification(message("2", "base64", "audio"))).toBe("[Audio]");
    expect(describeLanChatMessageForNotification(message("3", "base64", "video"))).toBe("[Video]");
    expect(describeLanChatMessageForNotification(message("4", "payload", "file"))).toBe("[File]");
  });

  it("builds a compact notification from the latest unseen message", () => {
    expect(buildLanChatNotification({ conversation, senderName: "Alice", messages: [message("1", "hello"), message("2", "world")] })).toEqual({
      title: "LAN Chat · 公共聊天室",
      body: "2 new messages · Alice: world",
    });
  });
});
