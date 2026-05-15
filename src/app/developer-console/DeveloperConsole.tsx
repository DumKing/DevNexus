import { CopyOutlined, DeleteOutlined } from "@ant-design/icons";
import { Button, Drawer, Empty, Space, Table, Tag, Typography, message } from "antd";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";

import { clearDevLogs, listDevLogs } from "@/app/developer-console/api";
import type { DevLogEntry } from "@/app/developer-console/types";
import { appendDevLog, devLogLevelColor } from "@/app/developer-console/utils";

export function DeveloperConsole() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DevLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await listDevLogs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    void listen<DevLogEntry>("dev-log://entry", (event) => {
      setLogs((items) => appendDevLog(items, event.payload));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (open) {
      void refresh();
    }
  }, [open, refresh]);

  const serializedLogs = useMemo(() => JSON.stringify(logs, null, 2), [logs]);

  const copyLogs = async () => {
    await navigator.clipboard.writeText(serializedLogs);
    void message.success("Developer logs copied");
  };

  const clearLogs = async () => {
    await clearDevLogs();
    setLogs([]);
  };

  return (
    <Drawer
      title={
        <Space>
          <span>Developer Console</span>
          <Tag>Ctrl + Shift + D</Tag>
          <Tag>{logs.length} logs</Tag>
        </Space>
      }
      width={900}
      open={open}
      onClose={() => setOpen(false)}
      extra={
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => void copyLogs()}>
            Copy JSON
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => void clearLogs()}>
            Clear
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Hidden diagnostics for LAN Chat and app operations. Use this while debugging ports, discovery and TCP message delivery.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={logs}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No developer logs yet" /> }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        columns={[
          {
            title: "Time",
            dataIndex: "timestamp",
            width: 180,
            render: (value: string) => new Date(value).toLocaleTimeString(),
          },
          {
            title: "Level",
            dataIndex: "level",
            width: 90,
            render: (value: string) => <Tag color={devLogLevelColor(value)}>{value}</Tag>,
          },
          {
            title: "Scope",
            dataIndex: "scope",
            width: 170,
            render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: "Message",
            dataIndex: "message",
            render: (_: string, row) => (
              <Space direction="vertical" size={0}>
                <Typography.Text>{row.message}</Typography.Text>
                {row.details ? <Typography.Text type="secondary">{row.details}</Typography.Text> : null}
              </Space>
            ),
          },
        ]}
      />
    </Drawer>
  );
}
