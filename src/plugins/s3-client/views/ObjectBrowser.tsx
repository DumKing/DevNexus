import {
  App,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { PlusOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { useMemo, useState } from "react";

import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";
import { ObjectList } from "@/plugins/s3-client/components/ObjectList";
import { ObjectMetaDrawer } from "@/plugins/s3-client/components/ObjectMetaDrawer";
import { ObjectPreview } from "@/plugins/s3-client/components/ObjectPreview";
import { PresignedUrlModal } from "@/plugins/s3-client/components/PresignedUrlModal";
import type { S3ObjectMeta, S3ObjectRow, S3ObjectTag } from "@/plugins/s3-client/types";

export function ObjectBrowser() {
  const { message } = App.useApp();
  const activeConnId = useS3ConnectionsStore((state) => state.activeConnId);
  const bucket = useS3ConnectionsStore((state) => state.selectedBucket);
  const prefix = useS3ConnectionsStore((state) => state.objectPrefix);
  const setPrefix = useS3ConnectionsStore((state) => state.setObjectPrefix);
  const objects = useS3ConnectionsStore((state) => state.objects);
  const commonPrefixes = useS3ConnectionsStore((state) => state.commonPrefixes);
  const nextToken = useS3ConnectionsStore((state) => state.nextToken);
  const loading = useS3ConnectionsStore((state) => state.objectLoading);
  const listObjects = useS3ConnectionsStore((state) => state.listObjects);
  const deleteObject = useS3ConnectionsStore((state) => state.deleteObject);
  const deleteObjects = useS3ConnectionsStore((state) => state.deleteObjects);
  const deleteFolder = useS3ConnectionsStore((state) => state.deleteFolder);
  const renameObject = useS3ConnectionsStore((state) => state.renameObject);
  const headObject = useS3ConnectionsStore((state) => state.headObject);
  const getObjectTags = useS3ConnectionsStore((state) => state.getObjectTags);
  const setObjectTags = useS3ConnectionsStore((state) => state.setObjectTags);
  const createFolder = useS3ConnectionsStore((state) => state.createFolder);
  const uploadFile = useS3ConnectionsStore((state) => state.uploadFile);
  const uploadFolder = useS3ConnectionsStore((state) => state.uploadFolder);
  const downloadObject = useS3ConnectionsStore((state) => state.downloadObject);
  const downloadFolder = useS3ConnectionsStore((state) => state.downloadFolder);
  const generatePresignedUrl = useS3ConnectionsStore((state) => state.generatePresignedUrl);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState<"name" | "size" | "lastModified">("name");
  const [keyword, setKeyword] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [metaOpen, setMetaOpen] = useState(false);
  const [meta, setMeta] = useState<S3ObjectMeta | null>(null);
  const [tags, setTags] = useState<S3ObjectTag[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [presignKey, setPresignKey] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPath, setUploadPath] = useState("");
  const [uploadKey, setUploadKey] = useState("");
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false);
  const [uploadDir, setUploadDir] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadKey, setDownloadKey] = useState("");
  const [downloadPath, setDownloadPath] = useState("");
  const [downloadFolderOpen, setDownloadFolderOpen] = useState(false);
  const [downloadFolderPrefix, setDownloadFolderPrefix] = useState("");
  const [downloadFolderPath, setDownloadFolderPath] = useState("");

  const rows = useMemo<S3ObjectRow[]>(() => {
    const folderRows = commonPrefixes.map((item) => ({
      key: `folder:${item}`,
      name: item,
      type: "folder" as const,
      size: 0,
      lastModified: "",
      storageClass: "",
    }));
    const fileRows = objects.map((item) => ({
      key: `file:${item.key}`,
      name: item.key,
      type: "file" as const,
      size: item.size,
      lastModified: item.lastModified ?? "",
      storageClass: item.storageClass ?? "",
      etag: item.etag,
    }));
    const filtered = [...folderRows, ...fileRows].filter((item) =>
      keyword.trim() ? item.name.toLowerCase().includes(keyword.trim().toLowerCase()) : true,
    );
    return filtered.sort((a, b) => {
      if (sortBy === "size") return b.size - a.size;
      if (sortBy === "lastModified") return b.lastModified.localeCompare(a.lastModified);
      return a.name.localeCompare(b.name);
    });
  }, [commonPrefixes, keyword, objects, sortBy]);

  const openFolder = (nextPrefix: string) => {
    setPrefix(nextPrefix);
    setSelectedKeys([]);
    void listObjects({ connId: activeConnId!, bucket: bucket!, prefix: nextPrefix });
  };

  const openDetails = (key: string) => {
    if (!activeConnId || !bucket) return;
    void headObject({ connId: activeConnId, bucket, key }).then((value) => {
      setMeta(value);
      setMetaOpen(true);
    });
    void getObjectTags({ connId: activeConnId, bucket, key })
      .then(setTags)
      .catch(() => setTags([]));
  };

  const openPreview = (key: string) => {
    setPreviewKey(key);
    if (activeConnId && bucket) {
      void headObject({ connId: activeConnId, bucket, key }).then(setMeta).catch(() => setMeta(null));
    }
    setPreviewOpen(true);
  };

  if (!activeConnId || !bucket) {
    return (
      <Card
        title="Objects"
        style={{ flex: 1, minHeight: 0 }}
        styles={{
          body: {
            minHeight: 0,
            height: "calc(100% - 57px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          },
        }}
      >
        <Empty description="Select a bucket first" />
      </Card>
    );
  }

  return (
    <Card
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{
        body: {
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
      title={
        <Space>
          <Typography.Text strong>Objects</Typography.Text>
          <Tag>{bucket}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Input
            placeholder="prefix (e.g. logs/2026/)"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            style={{ width: 280 }}
          />
          <Input.Search
            placeholder="Search objects"
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 220 }}
          />
          <Select
            value={sortBy}
            style={{ width: 150 }}
            onChange={setSortBy}
            options={[
              { label: "Name", value: "name" },
              { label: "Size", value: "size" },
              { label: "Modified", value: "lastModified" },
            ]}
          />
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as "list" | "grid")}
            options={[
              { label: "List", value: "list" },
              { label: "Grid", value: "grid" },
            ]}
          />
          <Button icon={<PlusOutlined />} onClick={() => setCreateFolderOpen(true)}>
            New Folder
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setUploadOpen(true)}>
            Upload File
          </Button>
          <Button onClick={() => setUploadFolderOpen(true)}>Upload Folder</Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() =>
              void listObjects({
                connId: activeConnId,
                bucket,
                prefix,
              })
            }
          >
            Refresh
          </Button>
        </Space>
      }
    >
      <Flex vertical gap={12} style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Breadcrumb
          items={[
            { title: bucket, onClick: () => openFolder("") },
            ...prefix
              .split("/")
              .filter(Boolean)
              .map((part, index, parts) => ({
                title: part,
                onClick: () => openFolder(`${parts.slice(0, index + 1).join("/")}/`),
              })),
          ]}
        />
        {selectedKeys.length > 0 ? (
          <Space>
            <Typography.Text>{selectedKeys.length} selected</Typography.Text>
            <Popconfirm
              title="Delete selected objects?"
              onConfirm={() =>
                void deleteObjects({
                  connId: activeConnId,
                  bucket,
                  keys: selectedKeys.map((key) => key.replace(/^file:/, "")),
                  prefix,
                }).then((result) => {
                  setSelectedKeys([]);
                  message.success(`Deleted ${result.deletedCount}`);
                })
              }
            >
              <Button danger>Batch Delete</Button>
            </Popconfirm>
          </Space>
        ) : null}
        <ObjectList
          rows={rows}
          loading={loading}
          viewMode={viewMode}
          style={{ flex: 1, minHeight: 0 }}
          selectedKeys={selectedKeys}
          onSelectKeys={setSelectedKeys}
          onOpenFolder={openFolder}
          onPreview={openPreview}
          onDetails={openDetails}
          onDownload={(key) => {
            setDownloadKey(key);
            setDownloadPath(key.split("/").filter(Boolean).slice(-1)[0] ?? key);
            setDownloadOpen(true);
          }}
          onDownloadFolder={(folderPrefix) => {
            setDownloadFolderPrefix(folderPrefix);
            setDownloadFolderPath(folderPrefix.split("/").filter(Boolean).slice(-1)[0] ?? "folder");
            setDownloadFolderOpen(true);
          }}
          onPresign={setPresignKey}
          onRename={(key) => {
            let nextKey = key;
            Modal.confirm({
              title: "Rename Object",
              content: <Input defaultValue={key} onChange={(event) => (nextKey = event.target.value)} />,
              onOk: () =>
                renameObject({ connId: activeConnId, bucket, oldKey: key, newKey: nextKey, prefix }).then(() =>
                  message.success("Object renamed"),
                ),
            });
          }}
          onCopyPath={(key) => {
            void navigator.clipboard?.writeText(key).then(() => message.success("Path copied"));
          }}
          onDelete={(key) =>
            void deleteObject({ connId: activeConnId, bucket, key, prefix }).then(() =>
              message.success("Object deleted"),
            )
          }
          onDeleteFolder={(folderPrefix) =>
            Modal.confirm({
              title: "Delete folder?",
              content: folderPrefix,
              okButtonProps: { danger: true },
              onOk: () =>
                deleteFolder({ connId: activeConnId, bucket, folderPrefix, prefix }).then((result) =>
                  message.success(`Deleted ${result.deletedCount} objects`),
                ),
            })
          }
        />
        {nextToken ? (
          <Button
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              void listObjects({
                connId: activeConnId,
                bucket,
                prefix,
                continuationToken: nextToken,
                append: true,
              })
            }
          >
            Load More
          </Button>
        ) : null}
      </Flex>
      <ObjectMetaDrawer
        open={metaOpen}
        meta={meta}
        tags={tags}
        onClose={() => setMetaOpen(false)}
        onReloadTags={() => {
          if (activeConnId && bucket && meta) {
            void getObjectTags({ connId: activeConnId, bucket, key: meta.key }).then(setTags);
          }
        }}
        onSaveTags={(nextTags) => {
          if (!activeConnId || !bucket || !meta) return Promise.resolve();
          return setObjectTags({ connId: activeConnId, bucket, key: meta.key, tags: nextTags }).then(() =>
            setTags(nextTags),
          );
        }}
      />
      <ObjectPreview
        open={previewOpen}
        connId={activeConnId}
        bucket={bucket}
        objectKey={previewKey}
        contentType={meta?.contentType}
        onClose={() => setPreviewOpen(false)}
      />
      <PresignedUrlModal
        open={Boolean(presignKey)}
        objectKey={presignKey}
        onClose={() => setPresignKey(null)}
        onGenerate={(expiresSecs) => {
          if (!presignKey) return Promise.resolve("");
          return generatePresignedUrl({ connId: activeConnId, bucket, key: presignKey, expiresSecs });
        }}
      />
      <Modal
        title="Create Folder"
        open={createFolderOpen}
        onCancel={() => setCreateFolderOpen(false)}
        onOk={() => {
          const value = folderName.trim();
          if (!value) {
            message.error("folder name is required");
            return;
          }
          void createFolder({
            connId: activeConnId,
            bucket,
            prefix,
            folderName: value,
          }).then(() => {
            message.success("Folder created");
            setCreateFolderOpen(false);
            setFolderName("");
          });
        }}
      >
        <Input
          placeholder="folder-name"
          value={folderName}
          onChange={(event) => setFolderName(event.target.value)}
        />
      </Modal>
      <Modal
        title="Upload File"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onOk={() => {
          if (!uploadPath.trim()) {
            message.error("local path is required");
            return;
          }
          const fileName = uploadPath.split(/[\\/]/).slice(-1)[0] ?? "upload.bin";
          const key = uploadKey.trim() || `${prefix}${fileName}`;
          void uploadFile({ connId: activeConnId, bucket, key, localPath: uploadPath, prefix }).then(() => {
            message.success("Upload complete");
            setUploadOpen(false);
            setUploadPath("");
            setUploadKey("");
          });
        }}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="Local file path" value={uploadPath} onChange={(event) => setUploadPath(event.target.value)} />
          <Input placeholder="Object key (optional)" value={uploadKey} onChange={(event) => setUploadKey(event.target.value)} />
        </Space>
      </Modal>
      <Modal
        title="Upload Folder"
        open={uploadFolderOpen}
        onCancel={() => setUploadFolderOpen(false)}
        onOk={() => {
          if (!uploadDir.trim()) {
            message.error("local dir is required");
            return;
          }
          void uploadFolder({ connId: activeConnId, bucket, prefix, localDir: uploadDir }).then(() => {
            message.success("Folder upload complete");
            setUploadFolderOpen(false);
            setUploadDir("");
          });
        }}
      >
        <Input placeholder="Local folder path" value={uploadDir} onChange={(event) => setUploadDir(event.target.value)} />
      </Modal>
      <Modal
        title="Download Object"
        open={downloadOpen}
        onCancel={() => setDownloadOpen(false)}
        onOk={() => {
          if (!downloadPath.trim()) {
            message.error("local path is required");
            return;
          }
          void downloadObject({ connId: activeConnId, bucket, key: downloadKey, localPath: downloadPath }).then(() => {
            message.success("Download complete");
            setDownloadOpen(false);
          });
        }}
      >
        <Input value={downloadPath} onChange={(event) => setDownloadPath(event.target.value)} />
      </Modal>
      <Modal
        title="Download Folder"
        open={downloadFolderOpen}
        onCancel={() => setDownloadFolderOpen(false)}
        onOk={() => {
          if (!downloadFolderPath.trim()) {
            message.error("local dir is required");
            return;
          }
          void downloadFolder({
            connId: activeConnId,
            bucket,
            folderPrefix: downloadFolderPrefix,
            localDir: downloadFolderPath,
          }).then(() => {
            message.success("Folder download complete");
            setDownloadFolderOpen(false);
          });
        }}
      >
        <Input value={downloadFolderPath} onChange={(event) => setDownloadFolderPath(event.target.value)} />
      </Modal>
    </Card>
  );
}
