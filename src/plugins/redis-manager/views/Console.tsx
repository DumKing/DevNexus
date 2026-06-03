import { App, Button, Card, Modal, Select, Space, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "xterm";
import "xterm/css/xterm.css";

import { useConsoleStore } from "@/plugins/redis-manager/store/console";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import { useWorkspaceStore } from "@/plugins/redis-manager/store/workspace";
import type { RedisValue } from "@/plugins/redis-manager/types";

function renderRedisValue(value: RedisValue, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (value.kind === "nil") return "(nil)";
  if (value.kind === "int") return String(value.value);
  if (value.kind === "bulk") return value.value || '""';
  if (value.kind === "error") return `ERR ${value.value}`;
  if (value.value.length === 0) return "(empty array)";
  return value.value
    .map((item, index) => `${indent}${index + 1}) ${renderRedisValue(item, depth + 1)}`)
    .join("\r\n");
}

function renderTerminalValue(value: RedisValue): string {
  const text = renderRedisValue(value);
  return value.kind === "error" ? `\x1b[31m${text}\x1b[0m` : text;
}

function promptFor(connectionName: string, dbIndex: number) {
  return `${connectionName || "redis"}[${dbIndex}]> `;
}

export function ConsoleView() {
  const { message } = App.useApp();
  const connId = useWorkspaceStore((state) => state.activeConnectionId);
  const dbIndex = useWorkspaceStore((state) => state.activeDbIndex);
  const setActiveConnectionId = useWorkspaceStore((state) => state.setActiveConnectionId);
  const setActiveDbIndex = useWorkspaceStore((state) => state.setActiveDbIndex);
  const connections = useConnectionsStore((state) => state.connections);
  const connectedIds = useConnectionsStore((state) => state.connectedIds);
  const selectDb = useConnectionsStore((state) => state.selectDb);
  const fetchConnections = useConnectionsStore((state) => state.fetchConnections);
  const execute = useConsoleStore((state) => state.execute);
  const loadHistory = useConsoleStore((state) => state.loadHistory);
  const history = useConsoleStore((state) => state.history);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const inputRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const historyCursorRef = useRef(-1);
  const promptRef = useRef("redis[0]> ");
  const executingRef = useRef(false);

  const activeConnection = connections.find((item) => item.id === connId);
  const prompt = promptFor(activeConnection?.name ?? activeConnection?.host ?? "redis", dbIndex);

  const connectionOptions = useMemo(
    () =>
      connections
        .filter((item) => connectedIds.includes(item.id) || item.id === connId)
        .map((item) => ({
          label: `${item.name} (${item.host}:${item.port})`,
          value: item.id,
        })),
    [connId, connectedIds, connections],
  );

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    if (!connId) return;
    void fetchConnections();
    void loadHistory(connId);
  }, [connId, fetchConnections, loadHistory]);

  const rewriteInput = useCallback((nextInput: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    inputRef.current = nextInput;
    terminal.write(`\r\x1b[2K${promptRef.current}${nextInput}`);
  }, []);

  const writePrompt = useCallback(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    inputRef.current = "";
    historyCursorRef.current = -1;
    terminal.write(promptRef.current);
  }, []);

  const runCommand = useCallback(async (command: string, confirmDangerous = false) => {
    const terminal = terminalRef.current;
    if (!terminal || !connId || executingRef.current) return;
    const trimmed = command.trim();
    if (!trimmed) {
      terminal.write("\r\n");
      writePrompt();
      return;
    }
    executingRef.current = true;
    terminal.write("\r\n");
    try {
      const result = await execute(connId, trimmed, confirmDangerous);
      terminal.writeln(renderTerminalValue(result));
      await loadHistory(connId);
      writePrompt();
    } catch (err) {
      const text = String(err);
      if (text.includes("requires confirmation")) {
        Modal.confirm({
          title: "Dangerous Redis command",
          content: "This command may modify or delete critical Redis data. Confirm execution?",
          okText: "Confirm Execute",
          cancelText: "Cancel",
          onOk: async () => runCommand(trimmed, true),
          onCancel: () => {
            terminal.writeln("\x1b[33m(command cancelled)\x1b[0m");
            writePrompt();
          },
        });
      } else {
        terminal.writeln(`\x1b[31m${text}\x1b[0m`);
        writePrompt();
      }
    } finally {
      executingRef.current = false;
    }
  }, [connId, execute, loadHistory, writePrompt]);

  useEffect(() => {
    const host = terminalHostRef.current;
    if (!host) return;
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"Cascadia Mono", Consolas, monospace',
      fontSize: 13,
      theme: {
        background: "#08111f",
        foreground: "#dbeafe",
        cursor: "#38bdf8",
        selectionBackground: "#1d4ed8",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    fitAddon.fit();
    terminal.writeln("\x1b[36mDevNexus Redis Console\x1b[0m");
    terminal.writeln("Type Redis commands and press Enter. Use ArrowUp/ArrowDown for history, Ctrl+L to clear.");
    terminal.write(promptRef.current);

    terminal.onData((data) => {
      if (executingRef.current) return;
      if (data === "\r") {
        void runCommand(inputRef.current);
        return;
      }
      if (data === "\u007F") {
        if (inputRef.current.length > 0) {
          inputRef.current = inputRef.current.slice(0, -1);
          terminal.write("\b \b");
        }
        return;
      }
      if (data === "\x03") {
        terminal.write("^C\r\n");
        writePrompt();
        return;
      }
      if (data === "\x0c") {
        terminal.clear();
        writePrompt();
        return;
      }
      if (data === "\x1b[A") {
        const next = Math.min(historyCursorRef.current + 1, historyRef.current.length - 1);
        if (next >= 0) {
          historyCursorRef.current = next;
          rewriteInput(historyRef.current[next] ?? "");
        }
        return;
      }
      if (data === "\x1b[B") {
        const next = historyCursorRef.current - 1;
        historyCursorRef.current = next;
        rewriteInput(next >= 0 ? historyRef.current[next] ?? "" : "");
        return;
      }
      if (/^[\x20-\x7e]+$/.test(data)) {
        inputRef.current += data;
        terminal.write(data);
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(host);
    return () => {
      observer.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [rewriteInput, runCommand, writePrompt]);

  if (!connId) {
    return (
      <Card title="Console">
        <Typography.Text type="secondary">Connect first to use console.</Typography.Text>
      </Card>
    );
  }

  return (
    <Card
      title="Redis Console"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      styles={{ body: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } }}
      extra={
        <Space>
          <Select
            size="small"
            style={{ width: 260 }}
            value={connId}
            options={connectionOptions}
            onChange={(nextConnId) => {
              setActiveConnectionId(nextConnId);
              const next = connections.find((item) => item.id === nextConnId);
              setActiveDbIndex(next?.dbIndex ?? 0);
              void loadHistory(nextConnId);
              terminalRef.current?.writeln(`\r\n\x1b[36mSwitched connection: ${next?.name ?? nextConnId}\x1b[0m`);
              writePrompt();
            }}
          />
          <Select
            size="small"
            style={{ width: 92 }}
            value={dbIndex}
            options={Array.from({ length: 16 }, (_, idx) => ({
              label: `DB ${idx}`,
              value: idx,
            }))}
            onChange={(nextDbIndex) => {
              void selectDb(connId, nextDbIndex)
                .then(async () => {
                  setActiveDbIndex(nextDbIndex);
                  await fetchConnections();
                  terminalRef.current?.writeln(`\r\n\x1b[36mOK, switched to DB ${nextDbIndex}\x1b[0m`);
                  writePrompt();
                })
                .catch((err: unknown) => message.error(String(err)));
            }}
          />
          <Button size="small" onClick={() => {
            terminalRef.current?.clear();
            writePrompt();
          }}>Clear</Button>
        </Space>
      }
    >
      <div
        ref={terminalHostRef}
        style={{
          flex: 1,
          minHeight: 420,
          border: "1px solid #1e293b",
          borderRadius: 10,
          overflow: "hidden",
          background: "#08111f",
        }}
      />
    </Card>
  );
}
