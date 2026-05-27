import { Button, Empty, List, Popconfirm, Space, Tag, Typography, message } from "antd";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { useEffect } from "react";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import type { ConfluencePublishHistory } from "@/plugins/confluence/types";
import { historyToEditorDraft } from "@/plugins/confluence/utils/page-tree";

export function PublishHistoryPanel() {
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const publishHistory = useConfluenceStore((s) => s.publishHistory);
  const fetchPublishHistory = useConfluenceStore((s) => s.fetchPublishHistory);
  const deletePublishHistory = useConfluenceStore((s) => s.deletePublishHistory);
  const setMarkdownContent = useConfluenceStore((s) => s.setMarkdownContent);
  const setCurrentFilePath = useConfluenceStore((s) => s.setCurrentFilePath);
  const setCurrentPageMapping = useConfluenceStore((s) => s.setCurrentPageMapping);
  const saveFileMapping = useConfluenceStore((s) => s.saveFileMapping);
  const setSelectedTarget = useConfluenceStore((s) => s.setSelectedTarget);

  useEffect(() => {
    void fetchPublishHistory(activeConnectionId);
  }, [activeConnectionId, fetchPublishHistory]);

  const openHistory = (record: ConfluencePublishHistory) => {
    const draft = historyToEditorDraft(record);
    setMarkdownContent(draft.markdownContent);
    setCurrentFilePath(draft.filePath);
    const mapping = {
      filePath: draft.filePath ?? `confluence-history:${record.id}`,
      spaceKey: draft.spaceKey,
      pageId: draft.pageId,
      pageTitle: draft.pageTitle,
      version: draft.version,
      lastPublished: record.publishedAt,
    };
    if (draft.filePath) {
      saveFileMapping(mapping);
    } else {
      setCurrentPageMapping(mapping);
    }
    setSelectedTarget({ spaceKey: draft.spaceKey, pageId: draft.pageId, pageTitle: draft.pageTitle });
    message.success(`Loaded ${draft.pageTitle} from publish history`);
  };

  return (
    <div style={{ marginTop: 16 }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 8 }}>
        <Typography.Text strong>Publish History</Typography.Text>
        <Button size="small" onClick={() => void fetchPublishHistory(activeConnectionId)}>Refresh</Button>
      </Space>
      {publishHistory.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No publish history" />
      ) : (
        <List
          size="small"
          dataSource={publishHistory}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button key="open" type="text" size="small" icon={<EditOutlined />} onClick={() => openHistory(item)} />,
                <Popconfirm key="delete" title="Delete local history record?" onConfirm={() => void deletePublishHistory(item.id)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={4} wrap>
                    <Typography.Text style={{ maxWidth: 150 }} ellipsis>{item.pageTitle}</Typography.Text>
                    <Tag color={item.action === "create" ? "green" : "blue"}>{item.action}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={0}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.spaceKey} · v{item.pageVersion}</Typography.Text>
                    {item.parentTitle && <Typography.Text type="secondary" style={{ fontSize: 12 }}>Under {item.parentTitle}</Typography.Text>}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{new Date(item.publishedAt).toLocaleString()}</Typography.Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
