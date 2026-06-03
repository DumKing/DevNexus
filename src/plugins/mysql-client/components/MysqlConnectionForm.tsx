import { Button, Form, Input, InputNumber, message, Modal, Select, Space } from "antd";
import { useEffect } from "react";

import { usePluginI18n } from "@/app/i18n/plugin";
import { mysqlTranslations } from "@/plugins/mysql-client/i18n";
import { useMysqlConnectionsStore } from "@/plugins/mysql-client/store/mysql-connections";
import type { MysqlConnectionFormData, MysqlConnectionInfo } from "@/plugins/mysql-client/types";

interface Props {
  open: boolean;
  initial?: MysqlConnectionInfo | null;
  onClose: () => void;
}

export function MysqlConnectionForm({ open, initial, onClose }: Props) {
  const [form] = Form.useForm<MysqlConnectionFormData>();
  const saveConnection = useMysqlConnectionsStore((state) => state.saveConnection);
  const testConnection = useMysqlConnectionsStore((state) => state.testConnection);
  const { t } = usePluginI18n(mysqlTranslations);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      initial
        ? { ...initial, password: "" }
        : { port: 3306, charset: "utf8mb4", sslMode: "preferred", connectTimeout: 10 },
    );
  }, [form, initial, open]);

  const values = async () => ({ ...form.getFieldsValue(), id: initial?.id });

  const submit = async () => {
    await saveConnection(await values());
    message.success(t("saved"));
    onClose();
  };

  const test = async () => {
    const result = await testConnection(await values());
    message.success(t("connectedIn", { millis: result.millis, version: result.serverVersion ? `, ${result.serverVersion}` : "" }));
  };

  return (
    <Modal
      title={initial ? t("formEditTitle") : t("formNewTitle")}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      destroyOnHidden
      width={720}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="name" label={t("name")} rules={[{ required: true }]}>
          <Input placeholder="Production MySQL" />
        </Form.Item>
        <Form.Item name="groupName" label={t("group")}>
          <Input placeholder="DEV / TEST / PROD" />
        </Form.Item>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="host" label={t("host")} rules={[{ required: true }]} style={{ width: 360 }}>
            <Input placeholder="127.0.0.1" />
          </Form.Item>
          <Form.Item name="port" label={t("port")} rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} />
          </Form.Item>
        </Space>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="username" label={t("username")} rules={[{ required: true }]} style={{ width: 240 }}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t("password")} style={{ width: 240 }}>
            <Input.Password placeholder={initial ? t("passwordKeep") : undefined} />
          </Form.Item>
        </Space>
        <Space style={{ width: "100%" }} align="start">
          <Form.Item name="defaultDatabase" label={t("defaultDatabase")} style={{ width: 220 }}>
            <Input />
          </Form.Item>
          <Form.Item name="charset" label={t("charset")} style={{ width: 160 }}>
            <Input />
          </Form.Item>
          <Form.Item name="sslMode" label={t("sslMode")} style={{ width: 160 }}>
            <Select options={["preferred", "disabled", "required"].map((value) => ({ value, label: value }))} />
          </Form.Item>
          <Form.Item name="connectTimeout" label={t("timeout")}>
            <InputNumber min={1} max={120} />
          </Form.Item>
        </Space>
        <Button onClick={() => void test()}>{t("test")}</Button>
      </Form>
    </Modal>
  );
}
