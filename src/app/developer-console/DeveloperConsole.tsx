import { CopyOutlined, DeleteOutlined } from "@ant-design/icons";
import { Alert, Button, Drawer, Empty, Space, Switch, Table, Tag, Typography, message } from "antd";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";

import { clearDevLogs, listDevLogs, setDevLogEnabled } from "@/app/developer-console/api";
import type { DevLogEntry } from "@/app/developer-console/types";
import { appendDevLog, devLogLevelColor } from "@/app/developer-console/utils";
import { useI18n } from "@/app/i18n";
import { useSettingsStore } from "@/app/store/settings";

export function DeveloperConsole() {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DevLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const debugLogsEnabled = useSettingsStore((state) => state.debugLogsEnabled);
  const setDebugLogsEnabled = useSettingsStore((state) => state.setDebugLogsEnabled);

  const refresh = useCallback(async () => {
    if (!debugLogsEnabled) {
      setLogs([]);
      return;
    }
    setLoading(true);
    try {
      setLogs(await listDevLogs());
    } finally {
      setLoading(false);
    }
  }, [debugLogsEnabled]);

  const toggleDebugLogs = async (enabled: boolean) => {
    setDebugLogsEnabled(enabled);
    await setDevLogEnabled(enabled);
    if (!enabled) {
      setLogs([]);
    }
  };

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
      if (useSettingsStore.getState().debugLogsEnabled) {
        setLogs((items) => appendDevLog(items, event.payload));
      }
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
    void message.success(t("developer.copied"));
  };

  const clearLogs = async () => {
    await clearDevLogs();
    setLogs([]);
  };

  return (
    <Drawer
      title={
        <Space>
          <span>{t("developer.title")}</span>
          <Tag>Ctrl + Shift + D</Tag>
          <Tag>{logs.length} logs</Tag>
        </Space>
      }
      width={900}
      open={open}
      onClose={() => setOpen(false)}
      extra={
        <Space>
          <Switch
            checked={debugLogsEnabled}
            checkedChildren={t("developer.logsOn")}
            unCheckedChildren={t("developer.logsOff")}
            onChange={(value) => void toggleDebugLogs(value)}
          />
          <Button icon={<CopyOutlined />} onClick={() => void copyLogs()}>
            {t("developer.copyJson")}
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => void clearLogs()}>
            {t("developer.clear")}
          </Button>
        </Space>
      }
    >
      {!debugLogsEnabled ? (
        <Alert
          showIcon
          type="info"
          message={t("developer.disabledTitle")}
          description={t("developer.disabledDescription")}
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Typography.Paragraph type="secondary">
        {t("developer.description")}
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        loading={loading}
        dataSource={logs}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("developer.empty")} /> }}
        pagination={{ pageSize: 50, showSizeChanger: true }}
        columns={[
          {
            title: t("developer.time"),
            dataIndex: "timestamp",
            width: 180,
            render: (value: string) => new Date(value).toLocaleTimeString(),
          },
          {
            title: t("developer.level"),
            dataIndex: "level",
            width: 90,
            render: (value: string) => <Tag color={devLogLevelColor(value)}>{value}</Tag>,
          },
          {
            title: t("developer.scope"),
            dataIndex: "scope",
            width: 170,
            render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
          },
          {
            title: t("developer.message"),
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
