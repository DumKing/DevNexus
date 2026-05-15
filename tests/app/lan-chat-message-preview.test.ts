import { describe, expect, it } from "vitest";

import {
  classifyLanChatFile,
  isDirectConversationOnline,
  isLanChatDeviceCurrentlyOnline,
  normalizeLanChatMessageType,
  parseLanChatMessageMetadata,
  resolveLanChatSenderName,
  resolveLanChatPreviewSource,
} from "@/plugins/lan-chat/utils/message-preview";

describe("lan chat message preview utilities", () => {
  it("classifies image and audio files for inline previews", () => {
    expect(classifyLanChatFile({ type: "image/png" } as File)).toBe("image");
    expect(classifyLanChatFile({ type: "audio/mpeg" } as File)).toBe("audio");
    expect(classifyLanChatFile({ type: "video/mp4" } as File)).toBe("video");
    expect(classifyLanChatFile({ type: "application/pdf" } as File)).toBe("file");
  });

  it("parses message metadata safely", () => {
    expect(parseLanChatMessageMetadata('{"fileName":"a.png","mimeType":"image/png"}')).toEqual({
      fileName: "a.png",
      mimeType: "image/png",
    });
    expect(parseLanChatMessageMetadata("not-json")).toEqual({});
  });

  it("resolves display names for local and remote senders", () => {
    expect(
      resolveLanChatSenderName({
        senderDeviceId: "local",
        localDeviceId: "local",
        localNickname: "Alice",
        devices: [],
      }),
    ).toBe("Alice");
    expect(
      resolveLanChatSenderName({
        senderDeviceId: "remote",
        localDeviceId: "local",
        devices: [{ deviceId: "remote", nickname: "Bob" }],
      }),
    ).toBe("Bob");
  });

  it("normalizes image and audio previews when message type is missing", () => {
    expect(normalizeLanChatMessageType({ messageType: "text", content: "data:image/png;base64,abc", metadata: {} })).toBe("image");
    expect(normalizeLanChatMessageType({ messageType: "text", content: "abc", metadata: { mimeType: "audio/mpeg" } })).toBe("audio");
    expect(normalizeLanChatMessageType({ messageType: "text", content: "abc", metadata: { mimeType: "video/mp4" } })).toBe("video");
    expect(resolveLanChatPreviewSource("abc", { mimeType: "image/png" })).toBe("data:image/png;base64,abc");
  });

  it("detects direct peer online state from known devices", () => {
    const now = Date.parse("2026-05-15T10:00:00.000Z");
    expect(isLanChatDeviceCurrentlyOnline({ online: true, lastSeen: "2026-05-15T09:59:55.000Z" }, now)).toBe(true);
    expect(isLanChatDeviceCurrentlyOnline({ online: true, lastSeen: "2026-05-15T09:59:40.000Z" }, now)).toBe(false);
    expect(isDirectConversationOnline({
      conversationId: "direct:peer",
      devices: [{ deviceId: "peer", online: true, lastSeen: "2026-05-15T09:59:55.000Z" }],
      now,
    })).toBe(true);
    expect(isDirectConversationOnline({
      conversationId: "direct:peer",
      devices: [{ deviceId: "peer", online: true, lastSeen: "2026-05-15T09:59:40.000Z" }],
      now,
    })).toBe(false);
    expect(isDirectConversationOnline({ conversationId: "direct:peer", devices: [{ deviceId: "peer", online: false }] })).toBe(false);
    expect(isDirectConversationOnline({ conversationId: "room", devices: [] })).toBeUndefined();
  });
});
