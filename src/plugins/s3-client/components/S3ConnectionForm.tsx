import { App, Button, Form, Input, Modal, Select, Space, Switch, Tabs } from "antd";
import { useEffect } from "react";

import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";
import type { S3ConnectionFormData, S3ConnectionInfo, S3Provider } from "@/plugins/s3-client/types";

interface S3ConnectionFormProps {
  open: boolean;
  initialValues?: S3ConnectionInfo | null;
  onCancel: () => void;
  onSaved: () => void;
}

const providerOptions: Array<{ label: string; value: S3Provider }> = [
  { label: "AWS S3", value: "aws" },
  { label: "MinIO", value: "minio" },
  { label: "Aliyun OSS", value: "aliyun" },
  { label: "Tencent COS", value: "tencent" },
  { label: "Cloudflare R2", value: "r2" },
  { label: "Custom", value: "custom" },
];

const regionOptions = [
  "us-east-1",
  "us-west-2",
  "ap-southeast-1",
  "ap-northeast-1",
  "ap-east-1",
  "cn-hangzhou",
  "ap-guangzhou",
  "auto",
];

function buildEndpoint(provider: S3Provider, region: string): string | undefined {
  if (!region.trim()) return undefined;
  if (provider === "aliyun") return `https://oss-${region}.aliyuncs.com`;
  if (provider === "tencent") return `https://cos.${region}.myqcloud.com`;
  if (provider === "r2") return `https://${region}.r2.cloudflarestorage.com`;
  return undefined;
}

export function S3ConnectionForm({
  open,
  initialValues,
  onCancel,
  onSaved,
}: S3ConnectionFormProps) {
  const [form] = Form.useForm<S3ConnectionFormData>();
  const saveConnection = useS3ConnectionsStore((state) => state.saveConnection);
  const testConnection = useS3ConnectionsStore((state) => state.testConnection);
  const { message } = App.useApp();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue(
      initialValues
        ? {
            id: initialValues.id,
            name: initialValues.name,
            groupName: initialValues.groupName,
            provider: initialValues.provider,
            endpoint: initialValues.endpoint,
            region: initialValues.region,
            accessKeyId: initialValues.accessKeyId,
            pathStyle: initialValues.pathStyle,
            defaultBucket: initialValues.defaultBucket,
          }
        : {
            name: "",
            groupName: "",
            provider: "aws",
            region: "us-east-1",
            endpoint: "",
            accessKeyId: "",
            secretAccessKey: "",
            pathStyle: false,
            defaultBucket: "",
          },
    );
  }, [open, initialValues, form]);

  const provider = Form.useWatch("provider", form);
  const region = Form.useWatch("region", form);

  useEffect(() => {
    if (!open) return;
    const nextEndpoint = buildEndpoint(provider ?? "aws", region ?? "");
    if (nextEndpoint && provider !== "custom" && provider !== "minio") {
      form.setFieldValue("endpoint", nextEndpoint);
    }
    if (provider === "minio") {
      form.setFieldValue("pathStyle", true);
    }
  }, [provider, region, open, form]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    await saveConnection(values);
    message.success("S3 connection saved.");
    onSaved();
  };

  const onTest = async () => {
    const values = await form.validateFields();
    const result = await testConnection(values);
    message.info(`S3 connection success: ${result.millis} ms`);
  };

  return (
    <Modal
      title={initialValues?.id ? "Edit S3 Connection" : "New S3 Connection"}
      open={open}
      onCancel={onCancel}
      onOk={() => void onSubmit()}
      width={760}
      destroyOnClose
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          <Button onClick={() => void onTest()}>Test Connection</Button>
          <CancelBtn />
          <OkBtn />
        </Space>
      )}
    >
      <Form form={form} layout="vertical">
        <Tabs
          items={[
            {
              key: "basic",
              label: "Basic",
              children: (
                <>
                  <Form.Item label="Name" name="name" rules={[{ required: true }]}>
                    <Input placeholder="S3 Production" />
                  </Form.Item>
                  <Form.Item label="Group" name="groupName">
                    <Input placeholder="Default" />
                  </Form.Item>
                  <Form.Item label="Provider" name="provider" rules={[{ required: true }]}>
                    <Select options={providerOptions} />
                  </Form.Item>
                  <Space style={{ width: "100%" }} align="start">
                    <Form.Item
                      label="Region"
                      name="region"
                      rules={[{ required: true }]}
                      style={{ flex: 1 }}
                    >
                      <Select
                        showSearch
                        options={regionOptions.map((value) => ({ label: value, value }))}
                        placeholder="us-east-1"
                      />
                    </Form.Item>
                    <Form.Item
                      label="Endpoint"
                      name="endpoint"
                      style={{ flex: 1.2 }}
                      rules={[
                        {
                          validator: async (_, value) => {
                            const currentProvider = form.getFieldValue("provider") as S3Provider;
                            if (currentProvider === "custom" && !String(value ?? "").trim()) {
                              throw new Error("endpoint is required for custom provider");
                            }
                          },
                        },
                      ]}
                    >
                      <Input placeholder="https://s3.amazonaws.com" />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    label="Access Key ID"
                    name="accessKeyId"
                    rules={[{ required: true }]}
                  >
                    <Input placeholder="AKIA..." />
                  </Form.Item>
                  <Form.Item
                    label="Secret Access Key"
                    name="secretAccessKey"
                    rules={
                      initialValues?.id
                        ? []
                        : [{ required: true, message: "secretAccessKey is required" }]
                    }
                    extra={initialValues?.id ? "Leave empty to keep current secret." : undefined}
                  >
                    <Input.Password placeholder="secret" />
                  </Form.Item>
                </>
              ),
            },
            {
              key: "advanced",
              label: "Advanced",
              children: (
                <>
                  <Form.Item
                    label="Path Style"
                    name="pathStyle"
                    valuePropName="checked"
                    extra="Enable for MinIO and some S3-compatible providers."
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item
                    label="Manual Buckets"
                    name="defaultBucket"
                    extra="Optional. Use this when the account cannot call ListBuckets, for example Aliyun OSS policies scoped to specific buckets. Separate multiple buckets with commas or new lines."
                  >
                    <Input.TextArea
                      autoSize={{ minRows: 2, maxRows: 5 }}
                      placeholder={"bucket-a\nbucket-b"}
                    />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Modal>
  );
}
