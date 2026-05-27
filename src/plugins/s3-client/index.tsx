import { AppstoreOutlined } from "@ant-design/icons";
import { Segmented, Space, Typography } from "antd";

import type { PluginManifest } from "@/app/plugin-registry/types";
import { ObjectBrowser } from "@/plugins/s3-client/views/ObjectBrowser";
import { useS3ConnectionsStore } from "@/plugins/s3-client/store/s3-connections";
import { BucketList } from "@/plugins/s3-client/views/BucketList";
import { S3ConnectionList } from "@/plugins/s3-client/views/S3ConnectionList";

function S3ClientRoot() {
  const tab = useS3ConnectionsStore((state) => state.workspaceTab);
  const setWorkspaceTab = useS3ConnectionsStore((state) => state.setWorkspaceTab);
  const activeConnId = useS3ConnectionsStore((state) => state.activeConnId);
  const selectedBucket = useS3ConnectionsStore((state) => state.selectedBucket);
  const listBuckets = useS3ConnectionsStore((state) => state.listBuckets);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Segmented
          value={tab}
          onChange={(value) => {
            const next = value as "connections" | "buckets" | "objects";
            setWorkspaceTab(next);
            if (next === "buckets" && activeConnId) {
              void listBuckets(activeConnId);
            }
          }}
          options={[
            { label: "Connections", value: "connections" },
            { label: "Buckets", value: "buckets" },
            { label: "Objects", value: "objects" },
          ]}
        />
        {activeConnId ? (
          <Typography.Text type="secondary">
            Active: {activeConnId}
            {selectedBucket ? ` / ${selectedBucket}` : ""}
          </Typography.Text>
        ) : null}
      </Space>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {tab === "connections" ? <S3ConnectionList /> : null}
        {tab === "buckets" ? <BucketList /> : null}
        {tab === "objects" ? <ObjectBrowser /> : null}
      </div>
    </div>
  );
}

export const s3ClientPlugin: PluginManifest = {
  id: "s3-client",
  name: "S3",
  icon: <AppstoreOutlined />,
  version: "0.3.0-alpha",
  sidebarOrder: 30,
  component: S3ClientRoot,
};
