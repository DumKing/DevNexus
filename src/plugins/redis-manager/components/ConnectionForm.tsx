import { App, Button, Form, Input, InputNumber, Modal, Select, Space } from "antd";
import { useEffect } from "react";

import type { ConnectionFormData } from "@/plugins/redis-manager/types";
import { useConnectionsStore } from "@/plugins/redis-manager/store/connections";
import { usePluginI18n } from "@/app/i18n/plugin";
import { redisTranslations } from "@/plugins/redis-manager/i18n";

interface ConnectionFormProps {
  open: boolean;
  initialValues?: ConnectionFormData | null;
  onCancel: () => void;
  onSaved: () => void;
}

export function ConnectionForm({
  open,
  initialValues,
  onCancel,
  onSaved,
}: ConnectionFormProps) {
  const [form] = Form.useForm<ConnectionFormData>();
  const saveConnection = useConnectionsStore((state) => state.saveConnection);
  const testConnection = useConnectionsStore((state) => state.testConnection);
  const { message } = App.useApp();
  const { t } = usePluginI18n(redisTranslations);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue(
      initialValues ?? {
        name: "",
        groupName: "",
        host: "",
        port: 6379,
        password: "",
        dbIndex: 0,
        connectionType: "Standalone",
      },
    );
  }, [open, initialValues, form]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    await saveConnection(values);
    onSaved();
    message.success(t("saved"));
  };

  const onTest = async () => {
    const values = await form.validateFields();
    const result = await testConnection(values);
    message.info(t("latency", { millis: result.millis }));
  };

  return (
    <Modal
      title={initialValues?.id ? t("formEditTitle") : t("formNewTitle")}
      open={open}
      onCancel={onCancel}
      onOk={() => void onSubmit()}
      destroyOnClose
      okText={t("save")}
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          <Button onClick={() => void onTest()}>{t("testConnection")}</Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Form.Item label={t("name")} name="name" rules={[{ required: true }]}>
          <Input placeholder="Redis Dev" />
        </Form.Item>
        <Form.Item label={t("group")} name="groupName">
          <Input placeholder={t("defaultGroup")} />
        </Form.Item>
        <Form.Item label={t("host")} name="host" rules={[{ required: true }]}>
          <Input placeholder="127.0.0.1" />
        </Form.Item>
        <Form.Item
          label={t("port")}
          name="port"
          rules={[
            { required: true },
            { type: "number", min: 1, max: 65535, message: "1-65535" },
          ]}
        >
          <InputNumber min={1} max={65535} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item label={t("password")} name="password" extra={initialValues?.id ? t("passwordKeep") : undefined}>
          <Input.Password placeholder={initialValues?.id ? t("passwordKeepPlaceholder") : t("optional")} />
        </Form.Item>
        <Form.Item label={t("db")} name="dbIndex">
          <Select
            options={Array.from({ length: 16 }, (_, idx) => ({
              label: String(idx),
              value: idx,
            }))}
          />
        </Form.Item>
        <Form.Item label={t("connectionType")} name="connectionType">
          <Select
            options={[
              { label: "Standalone", value: "Standalone" },
              { label: "Sentinel (reserved)", value: "Sentinel", disabled: true },
              { label: "Cluster (reserved)", value: "Cluster", disabled: true },
            ]}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
