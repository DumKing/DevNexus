import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface LanChatWindowState {
  open: boolean;
  minimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  unreadCount: number;
  activeConversationId?: string;
}

export interface LanChatStateSnapshot {
  selectedPluginId: string;
  window: LanChatWindowState;
  conversationUnread: Record<string, number>;
}

export const chatWindowDefaults: LanChatWindowState = {
  open: false,
  minimized: false,
  x: 232,
  y: 110,
  width: 760,
  height: 560,
  unreadCount: 0,
};

export function createInitialLanChatState(
  partial: Partial<LanChatStateSnapshot> = {},
): LanChatStateSnapshot {
  return {
    selectedPluginId: partial.selectedPluginId ?? "redis-manager",
    window: {
      ...chatWindowDefaults,
      ...partial.window,
    },
    conversationUnread: partial.conversationUnread ?? {},
  };
}

export function toggleLanChatWindow(
  state: LanChatStateSnapshot,
  open = !state.window.open,
): LanChatStateSnapshot {
  return {
    ...state,
    window: {
      ...state.window,
      open,
      minimized: open ? false : state.window.minimized,
      unreadCount: open ? 0 : state.window.unreadCount,
    },
  };
}

export function updateLanChatUnread(
  state: LanChatStateSnapshot,
  count: number,
): LanChatStateSnapshot {
  const visible = state.window.open && !state.window.minimized;
  return {
    ...state,
    window: {
      ...state.window,
      unreadCount: visible ? 0 : state.window.unreadCount + count,
    },
  };
}

interface LanChatStore {
  window: LanChatWindowState;
  conversationUnread: Record<string, number>;
  openWindow: () => void;
  closeWindow: () => void;
  minimizeWindow: () => void;
  restoreWindow: () => void;
  maximizeWindow: () => void;
  setWindowBounds: (bounds: Partial<Pick<LanChatWindowState, "x" | "y" | "width" | "height">>) => void;
  addUnread: (count?: number) => void;
  clearUnread: () => void;
  addConversationUnread: (conversationId: string, count?: number) => void;
  clearConversationUnread: (conversationId: string) => void;
  setActiveConversationId: (conversationId?: string) => void;
}

export const useLanChatStore = create<LanChatStore>()(
  persist(
    (set) => ({
      window: chatWindowDefaults,
      conversationUnread: {},
      openWindow: () =>
        set((state) => ({
          window: {
            ...state.window,
            open: true,
            minimized: false,
            unreadCount: 0,
          },
        })),
      closeWindow: () =>
        set((state) => ({
          window: {
            ...state.window,
            open: false,
          },
        })),
      minimizeWindow: () =>
        set((state) => ({
          window: {
            ...state.window,
            minimized: true,
          },
        })),
      restoreWindow: () =>
        set((state) => ({
          window: {
            ...state.window,
            open: true,
            minimized: false,
            unreadCount: 0,
          },
        })),
      maximizeWindow: () =>
        set((state) => ({
          window: {
            ...state.window,
            open: true,
            minimized: false,
            x: 220,
            y: 54,
            width: Math.max(960, state.window.width),
            height: Math.max(680, state.window.height),
            unreadCount: 0,
          },
        })),
      setWindowBounds: (bounds) =>
        set((state) => ({
          window: {
            ...state.window,
            ...bounds,
          },
        })),
      addUnread: (count = 1) =>
        set((state) => updateLanChatUnread(createInitialLanChatState({ window: state.window }), count)),
      clearUnread: () =>
        set((state) => ({
          window: {
            ...state.window,
            unreadCount: 0,
          },
        })),
      addConversationUnread: (conversationId, count = 1) =>
        set((state) => {
          const visibleConversation =
            state.window.open &&
            !state.window.minimized &&
            state.window.activeConversationId === conversationId;
          if (visibleConversation) {
            return state;
          }
          return {
            window: {
              ...state.window,
              unreadCount: state.window.unreadCount + count,
            },
            conversationUnread: {
              ...state.conversationUnread,
              [conversationId]: (state.conversationUnread[conversationId] ?? 0) + count,
            },
          };
        }),
      clearConversationUnread: (conversationId) =>
        set((state) => {
          const current = state.conversationUnread[conversationId] ?? 0;
          const nextConversationUnread = { ...state.conversationUnread };
          delete nextConversationUnread[conversationId];
          return {
            window: {
              ...state.window,
              unreadCount: Math.max(0, state.window.unreadCount - current),
            },
            conversationUnread: nextConversationUnread,
          };
        }),
      setActiveConversationId: (conversationId) =>
        set((state) => ({
          window: {
            ...state.window,
            activeConversationId: conversationId,
          },
        })),
    }),
    {
      name: "devnexus-lan-chat",
      partialize: (state) => ({ window: state.window, conversationUnread: state.conversationUnread }),
    },
  ),
);
