export interface LanChatDeviceIdentity {
  deviceId: string;
  nickname: string;
  port: number;
  downloadDir: string;
  nicknameRequired: boolean;
}

export interface LanChatDevice {
  deviceId: string;
  nickname: string;
  host?: string | null;
  port: number;
  online: boolean;
  isLocal: boolean;
  lastSeen?: string | null;
  clientVersion?: string | null;
}

export interface LanChatRoom {
  id: string;
  name: string;
  coordinatorDeviceId: string;
  channel: "udp" | "tcp";
  isSystem: boolean;
  status: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface LanChatConversation {
  id: string;
  conversationType: "room" | "direct";
  title: string;
  subtitle: string;
  unreadCount: number;
}

export interface LanChatMessage {
  id: string;
  conversationId: string;
  conversationType: "room" | "direct";
  senderDeviceId: string;
  messageType: "text" | "image" | "audio" | "video" | "file";
  content: string;
  metadataJson: string;
  status: string;
  createdAt: string;
}

export interface LanChatTransfer {
  id: string;
  conversationId: string;
  conversationType: "room" | "direct";
  peerDeviceId?: string | null;
  fileName: string;
  fileSize: number;
  sha256?: string | null;
  savePath?: string | null;
  direction: string;
  status: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface LanChatSnapshot {
  identity: LanChatDeviceIdentity;
  devices: LanChatDevice[];
  rooms: LanChatRoom[];
  transfers: LanChatTransfer[];
}
