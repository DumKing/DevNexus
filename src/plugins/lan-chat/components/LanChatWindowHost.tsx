import {
  CloseOutlined,
  CompressOutlined,
  CopyOutlined,
  DeleteOutlined,
  FileAddOutlined,
  MinusOutlined,
  ReloadOutlined,
  SendOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Empty, Form, Input, InputNumber, List, Modal, Progress, Space, Tabs, Tag, Typography, message } from "antd";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";

import {
  clearLanChatConversation,
  clearLanChatTransfers,
  createDirectConversation,
  createLanChatTransfer,
  getLanChatSnapshot,
  listLanChatConversations,
  listLanChatMessages,
  saveLanChatMessageAttachment,
  sendLanChatFileMessage,
  sendLanChatMessage,
  startLanChatNetwork,
  updateLanChatDeviceSettings,
} from "@/plugins/lan-chat/api";
import { useLanChatStore } from "@/plugins/lan-chat/store/lan-chat";
import type { LanChatConversation, LanChatDevice, LanChatDeviceIdentity, LanChatMessage, LanChatSnapshot, LanChatTransfer } from "@/plugins/lan-chat/types";
import { dockMinimizedWindow, formatDeviceId, formatLanEndpoint, formatTransferSize, parseLanEndpoint, LAN_CHAT_MODAL_Z_INDEX } from "@/plugins/lan-chat/utils/lan-chat";
import { isDirectConversationOnline, isLanChatDeviceCurrentlyOnline, normalizeLanChatMessageType, parseLanChatMessageMetadata, resolveLanChatPreviewSource, resolveLanChatSenderName } from "@/plugins/lan-chat/utils/message-preview";

const { Text } = Typography;
const MIN_WINDOW_WIDTH = 560;
const MIN_WINDOW_HEIGHT = 420;
const PUBLIC_ROOM_ID = "public-lobby";

type DragMode = "move" | "resize-window" | "resize-left-pane" | "resize-right-pane";
type WindowResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface DragSession {
  mode: DragMode;
  direction?: WindowResizeDirection;
  startX: number;
  startY: number;
  initialX: number;
  initialY: number;
  initialWidth: number;
  initialHeight: number;
  initialLeftPaneWidth: number;
  initialRightPaneWidth: number;
}

function getDirectPeerId(conversationId: string): string | null {
  return conversationId.startsWith("direct:") ? conversationId.slice("direct:".length) : null;
}

function getDirectPeer(conversationId: string, devices: LanChatDevice[]): LanChatDevice | undefined {
  const peerId = getDirectPeerId(conversationId);
  return peerId ? devices.find((item) => item.deviceId === peerId) : undefined;
}

export function LanChatWindowHost() {
  const windowState = useLanChatStore((state) => state.window);
  const closeWindow = useLanChatStore((state) => state.closeWindow);
  const minimizeWindow = useLanChatStore((state) => state.minimizeWindow);
  const maximizeWindow = useLanChatStore((state) => state.maximizeWindow);
  const setWindowBounds = useLanChatStore((state) => state.setWindowBounds);
  const conversationUnread = useLanChatStore((state) => state.conversationUnread);
  const clearConversationUnread = useLanChatStore((state) => state.clearConversationUnread);
  const setActiveConversationId = useLanChatStore((state) => state.setActiveConversationId);
  const dragSession = useRef<DragSession | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [snapshot, setSnapshot] = useState<LanChatSnapshot | null>(null);
  const [conversations, setConversations] = useState<LanChatConversation[]>([]);
  const [messages, setMessages] = useState<LanChatMessage[]>([]);
  const [transfers, setTransfers] = useState<LanChatTransfer[]>([]);
  const [activeConversation, setActiveConversation] = useState<LanChatConversation | null>(null);
  const [draft, setDraft] = useState("");
  const [directModalOpen, setDirectModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nicknameSetupDismissed, setNicknameSetupDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leftPaneWidth, setLeftPaneWidth] = useState(220);
  const [rightPaneWidth, setRightPaneWidth] = useState(240);
  const [form] = Form.useForm();

  const identity: LanChatDeviceIdentity | null = snapshot?.identity ?? null;
  const devices = snapshot?.devices ?? [];
  const visibleConversations = conversations;
  const activeDirectPeer = activeConversation ? getDirectPeer(activeConversation.id, devices) : undefined;
  const activeDirectOnline = activeConversation ? isDirectConversationOnline({ conversationId: activeConversation.id, devices }) : undefined;
  const activeRoom = activeConversation?.conversationType === "room" ? snapshot?.rooms.find((room) => room.id === activeConversation.id) : undefined;
  const activeRoomMembers = activeConversation?.conversationType === "room"
    ? devices.filter((item) => item.isLocal || isLanChatDeviceCurrentlyOnline(item) || messages.some((messageItem) => messageItem.senderDeviceId === item.deviceId))
    : devices;

  const style = useMemo(() => {
    if (windowState.minimized) {
      const docked = dockMinimizedWindow({
        viewportWidth: typeof window === "undefined" ? 1280 : window.innerWidth,
        viewportHeight: typeof window === "undefined" ? 800 : window.innerHeight,
        originalX: windowState.x,
      });
      return { left: docked.left, bottom: docked.bottom, width: docked.width, height: docked.height };
    }
    return { left: windowState.x, top: windowState.y, width: windowState.width, height: windowState.height };
  }, [windowState.height, windowState.minimized, windowState.width, windowState.x, windowState.y]);

  const refresh = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const nextSnapshot = await getLanChatSnapshot();
      const nextConversations = await listLanChatConversations();
      setSnapshot(nextSnapshot);
      setTransfers(nextSnapshot.transfers);
      setConversations(nextConversations);
      setActiveConversation((current) => current && nextConversations.some((item) => item.id === current.id) ? current : nextConversations[0] ?? null);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (windowState.open && !windowState.minimized) void startLanChatNetwork().finally(() => refresh());
  }, [windowState.open, windowState.minimized]);

  useEffect(() => {
    if (!windowState.open || windowState.minimized) return undefined;
    const timer = window.setInterval(() => void refresh(false), 3000);
    return () => window.clearInterval(timer);
  }, [windowState.open, windowState.minimized]);

  useEffect(() => {
    if (!activeConversation) {
      setMessages([]);
      setActiveConversationId(undefined);
      return;
    }
    setActiveConversationId(activeConversation.id);
    clearConversationUnread(activeConversation.id);
    void listLanChatMessages(activeConversation.id).then(setMessages).catch((error) => message.error(error instanceof Error ? error.message : String(error)));
  }, [activeConversation, clearConversationUnread, setActiveConversationId]);

  useEffect(() => {
    if (!windowState.open || windowState.minimized || !activeConversation) return undefined;
    const timer = window.setInterval(() => void listLanChatMessages(activeConversation.id).then(setMessages).catch(() => undefined), 1500);
    return () => window.clearInterval(timer);
  }, [activeConversation, windowState.minimized, windowState.open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, activeConversation?.id]);

  useEffect(() => {
    if (!identity?.nicknameRequired || nicknameSetupDismissed) return;
    form.setFieldsValue({ nickname: "", port: identity.port });
    setSettingsOpen(true);
  }, [form, identity, nicknameSetupDismissed]);

  if (!windowState.open || windowState.minimized) return null;

  const stopDrag = () => {
    dragSession.current = null;
    window.removeEventListener("mousemove", onGlobalMouseMove);
    window.removeEventListener("mouseup", stopDrag);
  };

  const onGlobalMouseMove = (event: MouseEvent) => {
    const session = dragSession.current;
    if (!session) return;
    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (session.mode === "move") {
      setWindowBounds({ x: Math.max(72, session.initialX + deltaX), y: Math.max(46, session.initialY + deltaY) });
      return;
    }
    if (session.mode === "resize-left-pane") {
      setLeftPaneWidth(Math.min(380, Math.max(160, session.initialLeftPaneWidth + deltaX)));
      return;
    }
    if (session.mode === "resize-right-pane") {
      setRightPaneWidth(Math.min(420, Math.max(180, session.initialRightPaneWidth - deltaX)));
      return;
    }
    const direction = session.direction ?? "se";
    let nextX = session.initialX;
    let nextY = session.initialY;
    let nextWidth = session.initialWidth;
    let nextHeight = session.initialHeight;
    if (direction.includes("e")) nextWidth = session.initialWidth + deltaX;
    if (direction.includes("s")) nextHeight = session.initialHeight + deltaY;
    if (direction.includes("w")) { nextX = session.initialX + deltaX; nextWidth = session.initialWidth - deltaX; }
    if (direction.includes("n")) { nextY = session.initialY + deltaY; nextHeight = session.initialHeight - deltaY; }
    if (nextWidth < MIN_WINDOW_WIDTH) {
      if (direction.includes("w")) nextX = session.initialX + session.initialWidth - MIN_WINDOW_WIDTH;
      nextWidth = MIN_WINDOW_WIDTH;
    }
    if (nextHeight < MIN_WINDOW_HEIGHT) {
      if (direction.includes("n")) nextY = session.initialY + session.initialHeight - MIN_WINDOW_HEIGHT;
      nextHeight = MIN_WINDOW_HEIGHT;
    }
    setWindowBounds({ x: Math.max(72, nextX), y: Math.max(46, nextY), width: nextWidth, height: nextHeight });
  };

  const startDrag = (event: ReactMouseEvent, mode: DragMode, direction?: WindowResizeDirection) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragSession.current = {
      mode,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      initialX: windowState.x,
      initialY: windowState.y,
      initialWidth: windowState.width,
      initialHeight: windowState.height,
      initialLeftPaneWidth: leftPaneWidth,
      initialRightPaneWidth: rightPaneWidth,
    };
    window.addEventListener("mousemove", onGlobalMouseMove);
    window.addEventListener("mouseup", stopDrag);
  };

  const copyText = async (text: string, label = "Copied") => {
    await navigator.clipboard.writeText(text);
    void message.success(label);
  };

  const ensureDirectPeerOnline = () => {
    if (!activeConversation || activeConversation.conversationType !== "direct") return true;
    const online = isDirectConversationOnline({ conversationId: activeConversation.id, devices });
    if (online === false) {
      void message.warning("对方已下线，无法发送消息");
      return false;
    }
    return true;
  };

  const handleCreateDirect = async (values: { peerName: string; peerDeviceId: string; peerHost?: string | null; peerPort?: number | null }) => {
    const conversation = await createDirectConversation(values);
    setDirectModalOpen(false);
    await refresh();
    setActiveConversation(conversation);
  };

  const handleStartDirectFromDevice = async (device: { deviceId: string; nickname: string; host?: string | null; port: number }) => {
    const conversation = await createDirectConversation({ peerDeviceId: device.deviceId, peerName: device.nickname, peerHost: device.host, peerPort: device.port });
    await refresh();
    setActiveConversation(conversation);
  };

  const handleSend = async () => {
    if (!activeConversation || !draft.trim() || !ensureDirectPeerOnline()) return;
    const sent = await sendLanChatMessage({ conversationId: activeConversation.id, conversationType: activeConversation.conversationType, content: draft.trim() }).catch((error) => {
      void message.error(error instanceof Error ? error.message : String(error));
      return null;
    });
    if (!sent) return;
    setDraft("");
    setMessages((items) => [...items, sent]);
  };

  const handleSelectedFile = async () => {
    if (!activeConversation) {
      void message.warning("Select a conversation first");
      return;
    }
    if (!ensureDirectPeerOnline()) return;
    const conversation = activeConversation;
    const selected = await open({ multiple: false, directory: false, title: "选择要发送的文件" });
    if (!selected || Array.isArray(selected)) return;
    const fileName = selected.split(/[\\/]/).pop() ?? "File";
    const transfer = await createLanChatTransfer({ conversationId: conversation.id, conversationType: conversation.conversationType, fileName, fileSize: 0, direction: "send" });
    setTransfers((items) => [{ ...transfer, progress: 20, status: "sharing" }, ...items]);
    try {
      const sent = await sendLanChatFileMessage({ conversationId: conversation.id, conversationType: conversation.conversationType, filePath: selected });
      setMessages((items) => conversation.id === activeConversation?.id ? [...items, sent] : items);
      setTransfers((items) => items.map((item) => item.id === transfer.id ? { ...item, progress: 100, status: "shared" } : item));
    } catch (error) {
      setTransfers((items) => items.map((item) => item.id === transfer.id ? { ...item, progress: 100, status: "failed" } : item));
      void message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleDownloadAttachment = async (item: LanChatMessage) => {
    try {
      const metadata = parseLanChatMessageMetadata(item.metadataJson);
      const targetPath = await save({
        title: "保存聊天附件",
        defaultPath: metadata.fileName ?? "attachment.bin",
      });
      if (!targetPath) return;
      const path = await saveLanChatMessageAttachment(item.id, targetPath);
      void message.success(`已保存到 ${path}`);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleClearCurrentConversation = async () => {
    if (!activeConversation) return;
    if (activeConversation.id === PUBLIC_ROOM_ID) {
      void message.warning("公共聊天室不可删除");
      return;
    }
    await clearLanChatConversation(activeConversation.id);
    setActiveConversation(null);
    setMessages([]);
    await refresh();
  };

  const handleSaveSettings = async (values: { nickname: string; port: number }) => {
    const nextIdentity = await updateLanChatDeviceSettings(values);
    setNicknameSetupDismissed(!nextIdentity.nicknameRequired);
    setSnapshot((current) => current ? { ...current, identity: nextIdentity } : current);
    form.setFieldsValue({ nickname: nextIdentity.nickname, port: nextIdentity.port });
    setSettingsOpen(false);
    await startLanChatNetwork();
    await refresh(false);
  };

  const renderConversation = (item: LanChatConversation) => {
    const online = item.conversationType === "direct" ? isDirectConversationOnline({ conversationId: item.id, devices }) : undefined;
    const unread = conversationUnread[item.id] ?? 0;
    const isPublic = item.id === PUBLIC_ROOM_ID;
    const className = [
      "devnexus-lan-chat-window__session",
      isPublic ? "devnexus-lan-chat-window__session--public" : "devnexus-lan-chat-window__session--direct",
      item.id === activeConversation?.id ? "devnexus-lan-chat-window__session--active" : "",
    ].filter(Boolean).join(" ");
    return (
      <List.Item className={className} onClick={() => setActiveConversation(item)}>
        {unread > 0 ? <span className="devnexus-lan-chat-window__session-unread">{unread > 99 ? "99+" : unread}</span> : null}
        <div className="devnexus-lan-chat-window__session-title">
          {item.conversationType === "direct" ? <span className={online ? "devnexus-lan-chat-window__presence-dot devnexus-lan-chat-window__presence-dot--online" : "devnexus-lan-chat-window__presence-dot devnexus-lan-chat-window__presence-dot--offline"} /> : null}
          {isPublic ? <TeamOutlined /> : null}
          <strong>{item.title}</strong>
          <Tag color={isPublic ? "blue" : online ? "green" : "default"}>{isPublic ? "公共" : "私聊"}</Tag>
        </div>
        <Text type="secondary">{item.conversationType === "direct" ? (online ? "在线" : "已下线") : item.subtitle}</Text>
      </List.Item>
    );
  };

  const renderMessageContent = (item: LanChatMessage) => {
    const metadata = parseLanChatMessageMetadata(item.metadataJson);
    const messageType = normalizeLanChatMessageType({ messageType: item.messageType, content: item.content, metadata });
    const sender = devices.find((device) => device.deviceId === item.senderDeviceId);
    const host = item.senderDeviceId === identity?.deviceId ? "127.0.0.1" : sender?.host;
    const pullSource = metadata.transferMode === "pull" && metadata.fileId && metadata.token && metadata.filePort && host
      ? `http://${host}:${metadata.filePort}/lan-chat/file/${metadata.fileId}?token=${metadata.token}`
      : undefined;
    const previewSource = pullSource ?? resolveLanChatPreviewSource(item.content, metadata);
    if (messageType === "image") {
      return <Space direction="vertical" size={6} className="devnexus-lan-chat-window__attachment"><img className="devnexus-lan-chat-window__preview-image" src={previewSource} alt={metadata.fileName ?? "image"} />{metadata.fileName ? <Text type="secondary">{metadata.fileName}</Text> : null}</Space>;
    }
    if (messageType === "audio") {
      return <Space direction="vertical" size={6} className="devnexus-lan-chat-window__attachment"><audio className="devnexus-lan-chat-window__preview-audio" src={previewSource} controls />{metadata.fileName ? <Text type="secondary">{metadata.fileName}</Text> : null}</Space>;
    }
    if (messageType === "video") {
      return <Space direction="vertical" size={6} className="devnexus-lan-chat-window__attachment"><video className="devnexus-lan-chat-window__preview-video" src={previewSource} controls />{metadata.fileName ? <Text type="secondary">{metadata.fileName}</Text> : null}</Space>;
    }
    if (messageType === "file") {
      return <Space direction="vertical" size={2} className="devnexus-lan-chat-window__attachment"><Text strong>{metadata.fileName ?? "File"}</Text><Text type="secondary">{metadata.fileSize ? formatTransferSize(metadata.fileSize) : "Attachment"}</Text><Button size="small" onClick={() => void handleDownloadAttachment(item)}>下载到本地</Button></Space>;
    }
    return <div className="devnexus-lan-chat-window__message-text">{item.content}</div>;
  };

  const bodyStyle = { "--lan-chat-left": String(leftPaneWidth) + "px", "--lan-chat-right": String(rightPaneWidth) + "px" } as CSSProperties;

  return (
    <section className="devnexus-lan-chat-window" style={style}>
      <header className="devnexus-lan-chat-window__header" onMouseDown={(event) => startDrag(event, "move")}>
        <div>
          <strong>LAN Chat</strong>
          <Text type="secondary">{identity ? identity.nickname + " · ID: " + formatDeviceId(identity.deviceId) + " · :" + identity.port : "Local room and P2P chat"}</Text>
        </div>
        <Space size={4} onMouseDown={(event) => event.stopPropagation()}>
          <Tag color="green">v0.9.2</Tag>
          <Button size="small" type="text" icon={<ReloadOutlined />} loading={loading} onClick={() => void refresh()} />
          <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => { form.setFieldsValue({ nickname: identity?.nicknameRequired ? "" : identity?.nickname, port: identity?.port ?? 45881 }); setSettingsOpen(true); }} />
          <Button size="small" type="text" icon={<MinusOutlined />} onClick={minimizeWindow} />
          <Button size="small" type="text" icon={<CompressOutlined />} onClick={maximizeWindow} />
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={closeWindow} />
        </Space>
      </header>
      <div className="devnexus-lan-chat-window__body" style={bodyStyle}>
        <aside className="devnexus-lan-chat-window__sessions">
          <Button block icon={<UserOutlined />} onClick={() => setDirectModalOpen(true)}>New Direct</Button>
          <Button block danger icon={<DeleteOutlined />} disabled={!activeConversation || activeConversation.id === PUBLIC_ROOM_ID} onClick={() => void handleClearCurrentConversation()}>Clear Current</Button>
          <List size="small" dataSource={visibleConversations} locale={{ emptyText: "公共聊天室会自动创建，可添加私聊对象" }} renderItem={renderConversation} />
        </aside>
        <div className="devnexus-lan-chat-window__pane-divider" role="separator" aria-label="Resize conversation list" onMouseDown={(event) => startDrag(event, "resize-left-pane")} />
        <main className="devnexus-lan-chat-window__chat">
          {activeConversation ? <>
            <div className="devnexus-lan-chat-window__chat-title">
              <Space direction="vertical" size={0}>
                <strong>{activeConversation.title}</strong>
                {activeConversation.conversationType === "room" ? <Text type="secondary" copyable={{ text: activeConversation.id }}>{activeRoom?.isSystem ? "Public room" : "Invite / Room ID"}: {activeConversation.id} · {activeRoom?.channel?.toUpperCase() ?? "UDP"}</Text> : <Text type="secondary">{activeDirectOnline === false ? "对方已下线" : "P2P · " + formatLanEndpoint(activeDirectPeer?.host, activeDirectPeer?.port ?? 45881)}</Text>}
              </Space>
              <Text type="secondary">{activeConversation.conversationType === "room" ? "公共聊天室" : "Direct P2P"}</Text>
            </div>
            <div className="devnexus-lan-chat-window__messages">
              {messages.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No messages yet" /> : messages.map((item) => {
                const mine = item.senderDeviceId === identity?.deviceId;
                return <div key={item.id} className={mine ? "devnexus-lan-chat-window__message-row devnexus-lan-chat-window__message-row--mine" : "devnexus-lan-chat-window__message-row"}>
                  <Text className="devnexus-lan-chat-window__message-sender" type="secondary">{resolveLanChatSenderName({ senderDeviceId: item.senderDeviceId, localDeviceId: identity?.deviceId, localNickname: identity?.nickname, devices })} · {new Date(item.createdAt).toLocaleTimeString()}</Text>
                  <div className="devnexus-lan-chat-window__message-bubble">{renderMessageContent(item)}</div>
                </div>;
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="devnexus-lan-chat-window__composer">
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} value={draft} placeholder="输入消息，支持图片、音频和文件" onChange={(event) => setDraft(event.target.value)} onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); void handleSend(); } }} />
              <Button icon={<FileAddOutlined />} onClick={() => void handleSelectedFile()} />
              <Button type="primary" icon={<SendOutlined />} onClick={() => void handleSend()} />
            </div>
          </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Create or select a room/direct conversation" />}
        </main>
        <div className="devnexus-lan-chat-window__pane-divider" role="separator" aria-label="Resize member panel" onMouseDown={(event) => startDrag(event, "resize-right-pane")} />
        <aside className="devnexus-lan-chat-window__meta">
          <Tabs size="small" items={[{ key: "members", label: activeConversation?.conversationType === "room" ? "群聊成员" : "Members", children: <Space direction="vertical" size={8} style={{ width: "100%" }}>{identity ? <div className="devnexus-lan-chat-window__identity-card"><Text type="secondary">Your Device ID</Text><Space><Text code>{formatDeviceId(identity.deviceId)}</Text><Button size="small" icon={<CopyOutlined />} onClick={() => void copyText(identity.deviceId, "Device ID copied")} /></Space></div> : null}<List size="small" dataSource={activeRoomMembers} renderItem={(item) => <List.Item actions={item.isLocal ? [] : [<Button key="chat" size="small" type="link" disabled={!isLanChatDeviceCurrentlyOnline(item)} onClick={() => void handleStartDirectFromDevice(item)}>Chat</Button>]}><Space direction="vertical" size={0} className="devnexus-lan-chat-window__member-item"><Text strong><span className={isLanChatDeviceCurrentlyOnline(item) ? "devnexus-lan-chat-window__presence-dot devnexus-lan-chat-window__presence-dot--online" : "devnexus-lan-chat-window__presence-dot devnexus-lan-chat-window__presence-dot--offline"} /><UserOutlined /> {item.nickname}</Text><Text type="secondary">{item.isLocal ? "Local device" : isLanChatDeviceCurrentlyOnline(item) ? "在线" : "已下线"}{" · " + formatLanEndpoint(item.host, item.port)}</Text><Space size={4}><Text className="devnexus-lan-chat-window__device-id" code>{formatDeviceId(item.deviceId)}</Text><Button size="small" icon={<CopyOutlined />} onClick={() => void copyText(item.deviceId, "Device ID copied")} /></Space></Space></List.Item>} /></Space> }, { key: "transfers", label: "Transfers", children: <Space direction="vertical" size={8} style={{ width: "100%" }}><Button block danger size="small" icon={<DeleteOutlined />} disabled={transfers.length === 0} onClick={() => void clearLanChatTransfers().then(() => setTransfers([]))}>Clear Transfers</Button><List size="small" dataSource={transfers} locale={{ emptyText: "No transfers" }} renderItem={(item) => <List.Item><Space direction="vertical" style={{ width: "100%" }}><Text strong>{item.fileName}</Text><Progress percent={item.progress} size="small" /><Text type="secondary">{item.status} · {formatTransferSize(item.fileSize)}</Text></Space></List.Item>} /></Space> }]} />
        </aside>
      </div>
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as WindowResizeDirection[]).map((direction) => <button key={direction} className={"devnexus-lan-chat-window__resize-handle devnexus-lan-chat-window__resize-handle--" + direction} type="button" aria-label={"Resize LAN Chat window " + direction} onMouseDown={(event) => startDrag(event, "resize-window", direction)} />)}
      <Modal title="Create P2P Direct Chat" zIndex={LAN_CHAT_MODAL_Z_INDEX} open={directModalOpen} onCancel={() => setDirectModalOpen(false)} onOk={() => { const name = document.querySelector<HTMLInputElement>("#lan-chat-peer-name"); const id = document.querySelector<HTMLInputElement>("#lan-chat-peer-id"); const endpoint = document.querySelector<HTMLInputElement>("#lan-chat-peer-endpoint"); const parsed = endpoint?.value ? parseLanEndpoint(endpoint.value) : null; void handleCreateDirect({ peerName: name?.value || parsed?.host || "LAN Peer", peerDeviceId: id?.value || (parsed ? "ip:" + parsed.host + ":" + parsed.port : "manual-" + Date.now()), peerHost: parsed?.host, peerPort: parsed?.port }); }}><Space direction="vertical" style={{ width: "100%" }}><Input id="lan-chat-peer-endpoint" placeholder="Peer IP:Port, e.g. 192.168.1.23:45881" /><Input id="lan-chat-peer-name" placeholder="Peer nickname (optional)" /><Input id="lan-chat-peer-id" placeholder="Device ID (optional, advanced)" /><Text type="secondary">推荐在 Members 里点已发现设备的 Chat；手动直连只需要填写对方局域网 IP:Port。</Text></Space></Modal>
      <Modal title={identity?.nicknameRequired ? "请先设置聊天昵称" : "LAN Chat Settings"} zIndex={LAN_CHAT_MODAL_Z_INDEX} open={settingsOpen || Boolean(identity?.nicknameRequired)} closable={!identity?.nicknameRequired} maskClosable={!identity?.nicknameRequired} onCancel={() => { if (identity?.nicknameRequired) { void message.warning("LAN Chat 需要先设置一个可识别的昵称"); return; } setSettingsOpen(false); }} onOk={() => void form.validateFields().then(handleSaveSettings)}>
        <Form form={form} layout="vertical">
          {identity ? <Form.Item label="Device ID"><Space><Text code>{formatDeviceId(identity.deviceId)}</Text><Button size="small" icon={<CopyOutlined />} onClick={() => void copyText(identity.deviceId, "Device ID copied")} /></Space></Form.Item> : null}
          <Form.Item name="nickname" label="Device nickname" rules={[{ required: true, message: "请输入一个便于别人识别的昵称" }]} extra="昵称会显示在群聊和私聊消息上，不再默认使用电脑名。"><Input placeholder="例如：研发同学" /></Form.Item>
          <Form.Item name="port" label="Listen port" rules={[{ required: true }]}><InputNumber min={1} max={65535} style={{ width: "100%" }} /></Form.Item>
          <Text type="secondary">Download dir: {identity?.downloadDir ?? "Will be created on first use"}</Text>
        </Form>
      </Modal>
    </section>
  );
}
