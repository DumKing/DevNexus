import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

import type { RedisValue } from "@/plugins/redis-manager/types";

interface ConsoleLog {
  id: string;
  command: string;
  result: RedisValue;
}

interface ConsoleState {
  input: string;
  history: string[];
  logs: ConsoleLog[];
  historyCursor: number;
  setInput: (value: string) => void;
  loadHistory: (connId: string) => Promise<void>;
  moveHistory: (direction: "up" | "down") => string | null;
  execute: (connId: string, command: string, confirmDangerous?: boolean) => Promise<RedisValue>;
}

export const useConsoleStore = create<ConsoleState>()((set) => ({
  input: "",
  history: [],
  logs: [],
  historyCursor: -1,
  setInput: (value) => set({ input: value }),
  loadHistory: async (connId) => {
    const history = await invoke<string[]>("cmd_list_query_history", { connId, limit: 200 });
    set({ history, historyCursor: -1 });
  },
  moveHistory: (direction) => {
    let current: string | null = null;
    set((state) => {
      if (state.history.length === 0) {
        return state;
      }
      if (direction === "up") {
        const next = Math.min(state.historyCursor + 1, state.history.length - 1);
        current = state.history[next] ?? null;
        return { ...state, historyCursor: next, input: current ?? state.input };
      }
      const next = state.historyCursor - 1;
      if (next < 0) {
        current = "";
        return { ...state, historyCursor: -1, input: "" };
      }
      current = state.history[next] ?? "";
      return { ...state, historyCursor: next, input: current };
    });
    return current;
  },
  execute: async (connId, command, confirmDangerous) => {
    const result = await invoke<RedisValue>("cmd_execute_raw", {
      connId,
      command,
      confirmDangerous: confirmDangerous ?? false,
    });
    set((state) => ({
      input: "",
      history: [command, ...state.history.filter((item) => item !== command)].slice(0, 200),
      historyCursor: -1,
      logs: [
        ...state.logs,
        {
          id: crypto.randomUUID(),
          command,
          result,
        },
      ],
    }));
    return result;
  },
}));
