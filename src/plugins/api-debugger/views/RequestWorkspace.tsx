import { Alert, Button, Card, Checkbox, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Tabs, Tag, TreeSelect, Typography, message } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useApiDebuggerStore } from "@/plugins/api-debugger/store/api-debugger";
import type { ApiBodyConfig, ApiKeyValue } from "@/plugins/api-debugger/types";
import { emptyKeyValue, methods, normalizePairs, prettyBody } from "@/plugins/api-debugger/utils/api-debugger";

function KeyValueEditor({ value = [], onChange, secret }: { value?: ApiKeyValue[]; onChange?: (value: ApiKeyValue[]) => void; secret?: boolean }) {
  const rows = normalizePairs(value);
  const update = (idx: number, patch: Partial<ApiKeyValue>) => onChange?.(rows.map((row, rowIdx) => rowIdx === idx ? { ...row, ...patch } : row));
  const add = () => onChange?.([...rows, { ...emptyKeyValue(), secret }]);
  const remove = (idx: number) => onChange?.(rows.filter((_, rowIdx) => rowIdx !== idx));
  return <Space direction="vertical" style={{ width: "100%" }}>
    {rows.map((row, idx) => <Space key={idx} style={{ width: "100%" }} align="center">
      <Checkbox checked={row.enabled} onChange={(event) => update(idx, { enabled: event.target.checked })} />
      <Input value={row.key} onChange={(event) => update(idx, { key: event.target.value })} placeholder="Key" style={{ width: 220 }} />
      <Input.Password value={row.value} visibilityToggle={!row.secret} onChange={(event) => update(idx, { value: event.target.value })} placeholder="Value" style={{ width: 360 }} />
      <Checkbox checked={row.secret} onChange={(event) => update(idx, { secret: event.target.checked })}>secret</Checkbox>
      <Button size="small" onClick={() => remove(idx)}>Remove</Button>
    </Space>)}
    <Button size="small" onClick={add}>+ Add Row</Button>
  </Space>;
}

function ResponsePanel() {
  const response = useApiDebuggerStore((state) => state.response);
  if (!response) return <Card title="Response"><Typography.Text type="secondary">Send a request to inspect status, headers, cookies, raw body and timing.</Typography.Text></Card>;
  const statusColor = response.error ? "red" : response.status && response.status < 400 ? "green" : "orange";
  return <Card title={<Space>Response <Tag color={statusColor}>{response.error ? "ERROR" : response.status}</Tag></Space>}>
    {response.error ? <Alert type="error" showIcon message={response.error} style={{ marginBottom: 12 }} /> : null}
    <Descriptions bordered size="small" column={4} items={[
      { key: "status", label: "Status", children: response.status ? `${response.status} ${response.statusText ?? ""}` : "-" },
      { key: "duration", label: "Duration", children: `${response.durationMs} ms` },
      { key: "size", label: "Size", children: `${response.sizeBytes} bytes` },
      { key: "type", label: "Content-Type", children: response.contentType ?? "-" },
    ]} />
    <Tabs style={{ marginTop: 12 }} items={[
      { key: "body", label: "Body", children: <pre className="devnexus-api-code">{prettyBody(response.body, response.contentType)}</pre> },
      { key: "headers", label: `Headers (${response.headers.length})`, children: <pre className="devnexus-api-code">{JSON.stringify(response.headers, null, 2)}</pre> },
      { key: "cookies", label: `Cookies (${response.cookies.length})`, children: <pre className="devnexus-api-code">{JSON.stringify(response.cookies, null, 2)}</pre> },
      { key: "raw", label: "Raw", children: <pre className="devnexus-api-code">{JSON.stringify(response, null, 2)}</pre> },
      { key: "timing", label: "Timing", children: <pre className="devnexus-api-code">{JSON.stringify(response.timing, null, 2)}</pre> },
    ]} />
  </Card>;
}

function collectionTarget(id: string) {
  return `collection:${id}`;
}

function folderTarget(id: string) {
  return `folder:${id}`;
}

interface SaveTargetNode {
  title: string;
  value: string;
  children?: SaveTargetNode[];
}

export function RequestWorkspace() {
  const [form] = Form.useForm();
  const request = useApiDebuggerStore((state) => state.activeRequest);
  const requestName = useApiDebuggerStore((state) => state.activeRequestName);
  const collections = useApiDebuggerStore((state) => state.collections);
  const folders = useApiDebuggerStore((state) => state.folders);
  const environments = useApiDebuggerStore((state) => state.environments);
  const activeEnvironmentId = useApiDebuggerStore((state) => state.activeEnvironmentId);
  const loading = useApiDebuggerStore((state) => state.loading);
  const preview = useApiDebuggerStore((state) => state.preview);
  const updateRequest = useApiDebuggerStore((state) => state.updateRequest);
  const sendRequest = useApiDebuggerStore((state) => state.sendRequest);
  const previewRequest = useApiDebuggerStore((state) => state.previewRequest);
  const cancelRequest = useApiDebuggerStore((state) => state.cancelRequest);
  const saveRequest = useApiDebuggerStore((state) => state.saveRequest);
  const importCurl = useApiDebuggerStore((state) => state.importCurl);
  const setActiveEnvironment = useApiDebuggerStore((state) => state.setActiveEnvironment);
  const [saving, setSaving] = useState(false);
  const [importingCurl, setImportingCurl] = useState(false);
  const [curlModalOpen, setCurlModalOpen] = useState(false);
  const [curlText, setCurlText] = useState("");
  const [saveTarget, setSaveTarget] = useState<{ collectionId?: string; folderId?: string }>({});

  useEffect(() => form.setFieldsValue({ ...request, name: requestName }), [form, request, requestName]);
  useEffect(() => {
    setSaveTarget((target) => {
      if (!collections.length) return {};
      if (target.collectionId && collections.some((collection) => collection.id === target.collectionId)) return target;
      return { collectionId: collections[0].id, folderId: undefined };
    });
  }, [collections]);

  const sync = (_: unknown, values: Record<string, unknown>) => {
    updateRequest({
      method: String(values.method ?? request.method),
      url: String(values.url ?? request.url),
      params: values.params as ApiKeyValue[] ?? request.params,
      headers: values.headers as ApiKeyValue[] ?? request.headers,
      cookies: values.cookies as ApiKeyValue[] ?? request.cookies,
      auth: values.auth as typeof request.auth,
      body: values.body as ApiBodyConfig,
      timeoutMs: Number(values.timeoutMs ?? request.timeoutMs),
      followRedirects: Boolean(values.followRedirects),
      validateSsl: Boolean(values.validateSsl),
    });
  };

  const run = async () => {
    await form.validateFields();
    await sendRequest();
    message.success("Request completed");
  };

  const confirmSave = async () => {
    const name = String(form.getFieldValue("name") || requestName || "").trim();
    if (!name) {
      message.warning("Request name is required");
      return;
    }
    if (!saveTarget.collectionId) {
      message.warning("Choose a collection before saving");
      return;
    }
    setSaving(true);
    try {
      await saveRequest(name, saveTarget.collectionId, saveTarget.folderId);
      const collectionName = collections.find((item) => item.id === saveTarget.collectionId)?.name ?? "selected collection";
      const folderName = folders.find((item) => item.id === saveTarget.folderId)?.name;
      message.success(`Saved to ${folderName ? `${collectionName} / ${folderName}` : collectionName}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const confirmImportCurl = async () => {
    const text = curlText.trim();
    if (!text) {
      message.warning("Paste a cURL command first");
      return;
    }
    setImportingCurl(true);
    try {
      await importCurl(text);
      setCurlModalOpen(false);
      setCurlText("");
      message.success("cURL imported into Workspace");
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setImportingCurl(false);
    }
  };

  const saveTargetValue = saveTarget.folderId ? folderTarget(saveTarget.folderId) : saveTarget.collectionId ? collectionTarget(saveTarget.collectionId) : undefined;

  const saveTargetTree = useMemo<SaveTargetNode[]>(() => {
    const buildFolderNodes = (collectionId: string, parentId?: string | null): SaveTargetNode[] =>
      folders
        .filter((folder) => folder.collectionId === collectionId && (folder.parentId ?? null) === (parentId ?? null))
        .map((folder) => ({
          title: folder.name,
          value: folderTarget(folder.id),
          children: buildFolderNodes(collectionId, folder.id),
        }));
    return collections.map((collection) => ({
      title: collection.name,
      value: collectionTarget(collection.id),
      children: buildFolderNodes(collection.id),
    }));
  }, [collections, folders]);

  const selectSaveTarget = (value?: string) => {
    if (!value) {
      setSaveTarget({});
      return;
    }
    if (value.startsWith("collection:")) {
      setSaveTarget({ collectionId: value.slice("collection:".length), folderId: undefined });
      return;
    }
    if (value.startsWith("folder:")) {
      const folderId = value.slice("folder:".length);
      const folder = folders.find((item) => item.id === folderId);
      setSaveTarget({ collectionId: folder?.collectionId, folderId });
    }
  };

  return <div style={{ height: "100%", overflow: "auto", paddingRight: 4 }}>
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card title="API Request" extra={<Space>
        <Select allowClear placeholder="Environment" value={activeEnvironmentId} onChange={setActiveEnvironment} style={{ width: 220 }} options={environments.map((env) => ({ label: env.name, value: env.id }))} />
        <TreeSelect
          allowClear
          treeDefaultExpandAll
          placeholder="Save to collection/folder"
          value={saveTargetValue}
          style={{ width: 260 }}
          treeData={saveTargetTree}
          onChange={selectSaveTarget}
        />
        <Button onClick={() => setCurlModalOpen(true)}>Import cURL</Button>
        <Button loading={saving} onClick={confirmSave}>Save</Button>
        <Button onClick={previewRequest}>Preview</Button>
        <Button onClick={cancelRequest} disabled={!loading}>Cancel</Button>
        <Button type="primary" loading={loading} onClick={run}>Send</Button>
      </Space>}>
        <Form form={form} layout="vertical" onValuesChange={sync} initialValues={request}>
          <Space align="start" style={{ width: "100%" }}>
            <Form.Item name="method" rules={[{ required: true }]}><Select style={{ width: 120 }} options={methods.map((method) => ({ label: method, value: method }))} /></Form.Item>
            <Form.Item name="url" rules={[{ required: true }]} style={{ flex: 1 }}><Input placeholder="https://api.example.com/users/{{id}}" style={{ minWidth: 620 }} /></Form.Item>
          </Space>
          <Form.Item name="name" label="Request Name"><Input /></Form.Item>
          <Tabs items={[
            { key: "params", label: "Params", children: <Form.Item name="params"><KeyValueEditor /></Form.Item> },
            { key: "headers", label: "Headers", children: <Form.Item name="headers"><KeyValueEditor /></Form.Item> },
            { key: "cookies", label: "Cookies", children: <Form.Item name="cookies"><KeyValueEditor secret /></Form.Item> },
            { key: "auth", label: "Auth", children: <Space direction="vertical" style={{ width: "100%" }}>
              <Form.Item name={["auth", "authType"]} label="Type"><Select options={["none", "basic", "bearer", "apiKey"].map((value) => ({ label: value, value }))} /></Form.Item>
              <Form.Item name={["auth", "username"]} label="Username"><Input /></Form.Item>
              <Form.Item name={["auth", "password"]} label="Password"><Input.Password /></Form.Item>
              <Form.Item name={["auth", "token"]} label="Bearer Token"><Input.Password /></Form.Item>
              <Space><Form.Item name={["auth", "key"]} label="API Key"><Input /></Form.Item><Form.Item name={["auth", "value"]} label="Value"><Input.Password /></Form.Item><Form.Item name={["auth", "addTo"]} label="Add To"><Select style={{ width: 140 }} options={[{ label: "Header", value: "header" }, { label: "Query", value: "query" }]} /></Form.Item></Space>
            </Space> },
            { key: "body", label: "Body", children: <Space direction="vertical" style={{ width: "100%" }}>
              <Form.Item name={["body", "bodyType"]} label="Body Type"><Select options={["none", "raw", "json", "xml", "form", "multipart", "binary"].map((value) => ({ label: value, value }))} /></Form.Item>
              <Form.Item name={["body", "contentType"]} label="Content-Type"><Input placeholder="application/json" /></Form.Item>
              <Form.Item name={["body", "raw"]} label="Raw Body"><Input.TextArea rows={10} /></Form.Item>
              <Form.Item name={["body", "form"]} label="Form URL Encoded"><KeyValueEditor /></Form.Item>
              <Form.Item name={["body", "multipart"]} label="Multipart"><KeyValueEditor /></Form.Item>
              <Form.Item name={["body", "binaryPath"]} label="Binary File Path"><Input placeholder="Select or paste a binary file path" /></Form.Item>
            </Space> },
            { key: "settings", label: "Settings", children: <Space align="start">
              <Form.Item name="timeoutMs" label="Timeout (ms)"><InputNumber min={500} max={300000} /></Form.Item>
              <Form.Item name="followRedirects" valuePropName="checked"><Checkbox>Follow Redirects</Checkbox></Form.Item>
              <Form.Item name="validateSsl" valuePropName="checked"><Checkbox>Validate SSL</Checkbox></Form.Item>
            </Space> },
          ]} />
        </Form>
        {preview ? <Alert style={{ marginTop: 12 }} type={preview.missingVariables.length ? "warning" : "success"} showIcon message={preview.missingVariables.length ? `Missing variables: ${preview.missingVariables.join(", ")}` : "Preview resolved"} description={<pre className="devnexus-api-preview">{JSON.stringify(preview, null, 2)}</pre>} /> : null}
      </Card>
      <ResponsePanel />
    </Space>
    <Modal
      title="Import cURL"
      open={curlModalOpen}
      okText="Import"
      confirmLoading={importingCurl}
      onOk={confirmImportCurl}
      onCancel={() => setCurlModalOpen(false)}
      width={760}
    >
      <Typography.Paragraph type="secondary">
        Paste a cURL command copied from browser DevTools, Postman or terminal. DevNexus will import method, URL, headers, cookies, auth and body into the current workspace.
      </Typography.Paragraph>
      <Input.TextArea
        autoFocus
        rows={10}
        value={curlText}
        onChange={(event) => setCurlText(event.target.value)}
        placeholder={"curl -X POST https://api.example.com/users \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer token' \\\n  -d '{\"name\":\"DevNexus\"}'"}
      />
    </Modal>
  </div>;
}
