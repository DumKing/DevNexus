import {
  Button,
  Checkbox,
  Dropdown,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  LinkOutlined,
} from "@ant-design/icons";

import type { S3ObjectRow } from "@/plugins/s3-client/types";

interface ObjectListProps {
  rows: S3ObjectRow[];
  loading: boolean;
  viewMode: "list" | "grid";
  style?: CSSProperties;
  selectedKeys: string[];
  onSelectKeys: (keys: string[]) => void;
  onOpenFolder: (prefix: string) => void;
  onPreview: (key: string) => void;
  onDetails: (key: string) => void;
  onDownload: (key: string) => void;
  onDownloadFolder: (prefix: string) => void;
  onPresign: (key: string) => void;
  onRename: (key: string) => void;
  onCopyPath: (key: string) => void;
  onDelete: (key: string) => void;
  onDeleteFolder: (prefix: string) => void;
}

function formatBytes(size: number) {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export function ObjectList({
  rows,
  loading,
  viewMode,
  style,
  selectedKeys,
  onSelectKeys,
  onOpenFolder,
  onPreview,
  onDetails,
  onDownload,
  onDownloadFolder,
  onPresign,
  onRename,
  onCopyPath,
  onDelete,
  onDeleteFolder,
}: ObjectListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tableHeight, setTableHeight] = useState(520);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateHeight = () => {
      const nextHeight = Math.floor(node.getBoundingClientRect().height) - 8;
      setTableHeight(Math.max(260, nextHeight));
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [viewMode]);

  if (viewMode === "grid") {
    return (
      <div
        ref={containerRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          ...style,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {rows.map((row) => (
            <Dropdown
              key={row.key}
              trigger={["contextMenu"]}
              menu={{
                items:
                  row.type === "folder"
                    ? [
                        { key: "open", label: "Open", onClick: () => onOpenFolder(row.name) },
                        { key: "download", label: "Download Folder", onClick: () => onDownloadFolder(row.name) },
                        { key: "copy", label: "Copy Path", onClick: () => onCopyPath(row.name) },
                        { key: "delete", label: "Delete Folder", danger: true, onClick: () => onDeleteFolder(row.name) },
                      ]
                    : [
                        { key: "preview", label: "Preview", onClick: () => onPreview(row.name) },
                        { key: "detail", label: "Details", onClick: () => onDetails(row.name) },
                        { key: "download", label: "Download", onClick: () => onDownload(row.name) },
                        { key: "presign", label: "Presigned URL", onClick: () => onPresign(row.name) },
                        { key: "rename", label: "Rename", onClick: () => onRename(row.name) },
                        { key: "copy", label: "Copy Path", onClick: () => onCopyPath(row.name) },
                        { key: "delete", label: "Delete", danger: true, onClick: () => onDelete(row.name) },
                      ],
              }}
            >
              <div
                style={{
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 116,
                  cursor: "default",
                }}
                onDoubleClick={() =>
                  row.type === "folder" ? onOpenFolder(row.name) : onPreview(row.name)
                }
              >
                <Space direction="vertical" size={8} style={{ width: "100%" }}>
                  {row.type === "folder" ? <FolderOpenOutlined /> : <FileOutlined />}
                  <Typography.Text ellipsis={{ tooltip: row.name }} strong>
                    {row.name.split("/").filter(Boolean).slice(-1)[0] ?? row.name}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {row.type === "folder" ? "Folder" : formatBytes(row.size)}
                  </Typography.Text>
                </Space>
              </div>
            </Dropdown>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        ...style,
      }}
    >
      <Table
        rowKey="key"
        loading={loading}
        dataSource={rows}
        virtual
        scroll={{ y: tableHeight, x: 1100 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => onSelectKeys(keys.map(String)),
          getCheckboxProps: (record) => ({ disabled: record.type === "folder" }),
        }}
        onRow={(record) => ({
          onDoubleClick: () =>
            record.type === "folder" ? onOpenFolder(record.name) : onPreview(record.name),
        })}
        columns={[
          {
            title: "Name",
            dataIndex: "name",
            render: (value: string, record) =>
              record.type === "folder" ? (
                <Button
                  type="link"
                  icon={<FolderOpenOutlined />}
                  onClick={() => onOpenFolder(value)}
                >
                  {value}
                </Button>
              ) : (
                <Space>
                  <FileOutlined />
                  <Typography.Text>{value}</Typography.Text>
                </Space>
              ),
          },
          {
            title: "Type",
            dataIndex: "type",
            width: 100,
            render: (value: string) =>
              value === "folder" ? <Tag color="blue">Folder</Tag> : <Tag>File</Tag>,
          },
          {
            title: "Size",
            dataIndex: "size",
            width: 130,
            render: (value: number, record) => (record.type === "folder" ? "-" : formatBytes(value)),
          },
          {
            title: "Storage",
            dataIndex: "storageClass",
            width: 130,
            render: (value: string, record) => (record.type === "folder" ? "-" : value || "-"),
          },
          {
            title: "Last Modified",
            dataIndex: "lastModified",
            width: 220,
            render: (value: string) => value || "-",
          },
          {
            title: "Actions",
            key: "actions",
            width: 250,
            render: (_, record) =>
              record.type === "folder" ? (
                <Space>
                  <Tooltip title="Open">
                    <Button size="small" icon={<FolderOpenOutlined />} onClick={() => onOpenFolder(record.name)} />
                  </Tooltip>
                  <Tooltip title="Copy path">
                    <Button size="small" icon={<CopyOutlined />} onClick={() => onCopyPath(record.name)} />
                  </Tooltip>
                  <Tooltip title="Download folder">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => onDownloadFolder(record.name)} />
                  </Tooltip>
                  <Tooltip title="Delete folder">
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onDeleteFolder(record.name)} />
                  </Tooltip>
                </Space>
              ) : (
                <Space>
                  <Tooltip title="Preview">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => onPreview(record.name)} />
                  </Tooltip>
                  <Tooltip title="Details">
                    <Button size="small" icon={<InfoCircleOutlined />} onClick={() => onDetails(record.name)} />
                  </Tooltip>
                  <Tooltip title="Download">
                    <Button size="small" icon={<DownloadOutlined />} onClick={() => onDownload(record.name)} />
                  </Tooltip>
                  <Tooltip title="Presigned URL">
                    <Button size="small" icon={<LinkOutlined />} onClick={() => onPresign(record.name)} />
                  </Tooltip>
                  <Tooltip title="Rename">
                    <Button size="small" icon={<EditOutlined />} onClick={() => onRename(record.name)} />
                  </Tooltip>
                  <Tooltip title="Delete">
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onDelete(record.name)} />
                  </Tooltip>
                </Space>
              ),
          },
        ]}
        title={() =>
          selectedKeys.length > 0 ? (
            <Space>
              <Checkbox checked />
              <Typography.Text>{selectedKeys.length} selected</Typography.Text>
            </Space>
          ) : null
        }
      />
    </div>
  );
}
