import { App, Button, Form, Input, InputNumber, Modal, Radio, Space, Switch, Tabs } from "antd";
import { useEffect, useState } from "react";

import { useMongoConnectionsStore } from "@/plugins/mongodb-client/store/mongodb-connections";
import type { MongoConnectionFormData, MongoConnectionInfo } from "@/plugins/mongodb-client/types";
import { usePluginI18n } from "@/app/i18n/plugin";
import { mongoTranslations } from "@/plugins/mongodb-client/i18n";

interface MongoConnectionFormProps {
  open: boolean;
  initial?: MongoConnectionInfo | null;
  onClose: () => void;
}

export function MongoConnectionForm({ open, initial, onClose }: MongoConnectionFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<MongoConnectionFormData>();
  const mode = Form.useWatch("mode", form) ?? "uri";
  const saveConnection = useMongoConnectionsStore((state) => state.saveConnection);
  const testConnection = useMongoConnectionsStore((state) => state.testConnection);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { t } = usePluginI18n(mongoTranslations);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      id: initial?.id,
      name: initial?.name ?? "",
      groupName: initial?.groupName ?? "",
      mode: initial?.mode ?? "uri",
      host: initial?.host ?? "localhost",
      port: initial?.port ?? 27017,
      username: initial?.username ?? "",
      authDatabase: initial?.authDatabase ?? "admin",
      defaultDatabase: initial?.defaultDatabase ?? "",
      replicaSet: initial?.replicaSet ?? "",
      tls: initial?.tls ?? false,
      srv: initial?.srv ?? false,
      uri: "",
      password: "",
    });
  }, [form, initial, open]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await saveConnection(values);
      message.success(t("saved"));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    const values = await form.validateFields();
    setTesting(true);
    try {
      const result = await testConnection(values);
      message.success(t("connectedIn", { millis: result.millis, version: result.serverVersion ? ` / ${result.serverVersion}` : "" }));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={initial ? t("formEditTitle") : t("formNewTitle")}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={saving}
      width={720}
      destroyOnHidden
      footer={(_, { CancelBtn, OkBtn }) => (
        <Space>
          <Button loading={testing} onClick={test}>
            {t("test")}
          </Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical" initialValues={{ mode: "uri", port: 27017, authDatabase: "admin" }}>
        <Form.Item name="id" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="name" label={t("name")} rules={[{ required: true }]}>
          <Input placeholder="Production MongoDB" />
        </Form.Item>
        <Form.Item name="groupName" label={t("group")}>
          <Input placeholder="DEV / PROD" />
        </Form.Item>
        <Form.Item name="mode" label={t("connectionMode")}>
          <Radio.Group
            options={[
              { label: "URI", value: "uri" },
              { label: "Form", value: "form" },
            ]}
          />
        </Form.Item>
        <Tabs
          items={[
            {
              key: "basic",
              label: t("basic"),
              children:
                mode === "uri" ? (
                  <Form.Item
                    name="uri"
                    label={t("mongoUri")}
                    rules={[{ required: !initial, message: t("uriRequired") }]}
                    extra={initial ? t("uriKeep") : undefined}
                  >
                    <Input.Password placeholder="mongodb://user:password@localhost:27017/admin" />
                  </Form.Item>
                ) : (
                  <>
                    <Form.Item name="host" label={t("host")} rules={[{ required: true }]}>
                      <Input placeholder="localhost" />
                    </Form.Item>
                    <Form.Item name="port" label={t("port")} rules={[{ required: true }]}>
                      <InputNumber min={1} max={65535} style={{ width: "100%" }} />
                    </Form.Item>
                    <Form.Item name="username" label={t("username")}>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label={t("password")}
                      extra={initial ? t("passwordKeep") : undefined}
                    >
                      <Input.Password />
                    </Form.Item>
                  </>
                ),
            },
            {
              key: "advanced",
              label: t("advanced"),
              children: (
                <>
                  <Form.Item name="authDatabase" label={t("authDatabase")}>
                    <Input placeholder="admin" />
                  </Form.Item>
                  <Form.Item name="defaultDatabase" label={t("defaultDatabase")}>
                    <Input placeholder="optional" />
                  </Form.Item>
                  <Form.Item name="replicaSet" label={t("replicaSet")}>
                    <Input placeholder="rs0" />
                  </Form.Item>
                  <Space size={24}>
                    <Form.Item name="tls" label="TLS" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="srv" label="SRV" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                  </Space>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
