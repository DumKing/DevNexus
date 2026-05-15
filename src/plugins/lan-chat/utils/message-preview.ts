export interface LanChatMessageMetadata {
  transferMode?: "pull" | string;
  fileId?: string;
  token?: string;
  filePort?: number;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export function parseLanChatMessageMetadata(value: string): LanChatMessageMetadata {
  try {
    const parsed = JSON.parse(value) as LanChatMessageMetadata;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function classifyLanChatFile(file: Pick<File, "type">): "image" | "audio" | "video" | "file" {
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (file.type.startsWith("audio/")) {
    return "audio";
  }
  if (file.type.startsWith("video/")) {
    return "video";
  }
  return "file";
}

export function normalizeLanChatMessageType(input: {
  messageType: string;
  content: string;
  metadata: LanChatMessageMetadata;
}): "text" | "image" | "audio" | "video" | "file" {
  if (input.messageType === "image" || input.messageType === "audio" || input.messageType === "video" || input.messageType === "file") {
    return input.messageType;
  }
  if (input.content.startsWith("data:image/") || input.metadata.mimeType?.startsWith("image/")) {
    return "image";
  }
  if (input.content.startsWith("data:audio/") || input.metadata.mimeType?.startsWith("audio/")) {
    return "audio";
  }
  if (input.content.startsWith("data:video/") || input.metadata.mimeType?.startsWith("video/")) {
    return "video";
  }
  return "text";
}

export function resolveLanChatPreviewSource(content: string, metadata: LanChatMessageMetadata): string {
  if (content.startsWith("data:")) {
    return content;
  }
  if (metadata.mimeType) {
    return `data:${metadata.mimeType};base64,${content}`;
  }
  return content;
}

export function resolveLanChatSenderName(input: {
  senderDeviceId: string;
  localDeviceId?: string;
  localNickname?: string;
  devices: Array<{ deviceId: string; nickname: string }>;
}): string {
  if (input.senderDeviceId === input.localDeviceId) {
    return input.localNickname || "Me";
  }
  return input.devices.find((item) => item.deviceId === input.senderDeviceId)?.nickname ?? input.senderDeviceId;
}

export function isLanChatDeviceCurrentlyOnline(
  device: { online: boolean; isLocal?: boolean; lastSeen?: string | null },
  now = Date.now(),
): boolean {
  if (device.isLocal) {
    return true;
  }
  if (!device.online || !device.lastSeen) {
    return false;
  }
  const lastSeen = Date.parse(device.lastSeen);
  if (Number.isNaN(lastSeen)) {
    return false;
  }
  return now - lastSeen <= 9000;
}

export function isDirectConversationOnline(input: {
  conversationId: string;
  devices: Array<{ deviceId: string; online: boolean; isLocal?: boolean; lastSeen?: string | null }>;
  now?: number;
}): boolean | undefined {
  if (!input.conversationId.startsWith("direct:")) {
    return undefined;
  }
  const peerId = input.conversationId.slice("direct:".length);
  const device = input.devices.find((item) => item.deviceId === peerId);
  return device ? isLanChatDeviceCurrentlyOnline(device, input.now) : undefined;
}
