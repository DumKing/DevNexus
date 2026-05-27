import { Alert, Button, Empty, Popconfirm, Select, Space, Spin, Tree, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import type { EventDataNode } from "antd/es/tree";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import type { PageInfo, SpaceInfo } from "@/plugins/confluence/types";
import { buildConfluenceTreeNodes, type ConfluenceTreeNode } from "@/plugins/confluence/utils/page-tree";

export function PageTreeSidebar() {
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const listSpaces = useConfluenceStore((s) => s.listSpaces);
  const listPages = useConfluenceStore((s) => s.listPages);
  const selectedTarget = useConfluenceStore((s) => s.selectedTarget);
  const setSelectedTarget = useConfluenceStore((s) => s.setSelectedTarget);
  const setMarkdownContent = useConfluenceStore((s) => s.setMarkdownContent);
  const setCurrentFilePath = useConfluenceStore((s) => s.setCurrentFilePath);
  const setCurrentPageMapping = useConfluenceStore((s) => s.setCurrentPageMapping);

  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string>();
  const [pagesByParent, setPagesByParent] = useState<Record<string, PageInfo[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageIndex = useMemo(() => {
    const entries = Object.values(pagesByParent).flat().map((page) => [page.id, page] as const);
    return new Map(entries);
  }, [pagesByParent]);

  useEffect(() => {
    if (!activeConnectionId) {
      setSpaces([]);
      setSelectedSpace(undefined);
      setPagesByParent({});
      setSelectedTarget(null);
      return;
    }
    setLoading(true);
    setError(null);
    listSpaces(activeConnectionId)
      .then((nextSpaces) => {
        setSpaces(nextSpaces);
        const nextSpace = selectedTarget?.spaceKey ?? nextSpaces[0]?.key;
        setSelectedSpace(nextSpace);
        if (nextSpace) setSelectedTarget({ spaceKey: nextSpace });
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [activeConnectionId, listSpaces, selectedTarget?.spaceKey, setSelectedTarget]);

  useEffect(() => {
    if (!activeConnectionId || !selectedSpace) return;
    const key = `space:${selectedSpace}`;
    if (pagesByParent[key]) return;
    setLoading(true);
    listPages(activeConnectionId, selectedSpace)
      .then((pages) => setPagesByParent((current) => ({ ...current, [key]: pages })))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [activeConnectionId, listPages, pagesByParent, selectedSpace]);

  const treeData = useMemo(
    () => buildConfluenceTreeNodes(spaces.filter((space) => !selectedSpace || space.key === selectedSpace), pagesByParent, selectedTarget?.pageId),
    [pagesByParent, selectedSpace, selectedTarget?.pageId, spaces],
  );

  const loadData = async (node: EventDataNode<ConfluenceTreeNode>) => {
    if (!activeConnectionId) return;
    const key = String(node.key);
    if (pagesByParent[key]) return;
    if (key.startsWith("space:")) {
      const spaceKey = key.slice("space:".length);
      const pages = await listPages(activeConnectionId, spaceKey);
      setPagesByParent((current) => ({ ...current, [key]: pages }));
      return;
    }
    if (key.startsWith("page:")) {
      const pageId = key.slice("page:".length);
      const page = pageIndex.get(pageId);
      if (!page) return;
      const pages = await listPages(activeConnectionId, page.spaceKey, page.id);
      setPagesByParent((current) => ({ ...current, [key]: pages }));
    }
  };

  const handleSelect = (keys: Key[]) => {
    const key = String(keys[0] ?? "");
    if (key.startsWith("space:")) {
      const spaceKey = key.slice("space:".length);
      setSelectedSpace(spaceKey);
      setSelectedTarget({ spaceKey });
      return;
    }
    if (key.startsWith("page:")) {
      const page = pageIndex.get(key.slice("page:".length));
      if (page) setSelectedTarget({ spaceKey: page.spaceKey, pageId: page.id, pageTitle: page.title });
    }
  };

  const startNewPageHere = () => {
    setMarkdownContent("# Untitled\n\n");
    setCurrentFilePath(null);
    setCurrentPageMapping(null);
  };

  if (!activeConnectionId) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Connect Confluence first" />;
  }

  return (
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between" }}>
        <Typography.Text strong>Confluence Tree</Typography.Text>
        <Popconfirm
          title="New page under current target?"
          description="The editor will switch to a fresh draft and publish under the selected space/page."
          okText="New"
          cancelText="Cancel"
          onConfirm={startNewPageHere}
        >
          <Button size="small" disabled={!selectedTarget}>New here</Button>
        </Popconfirm>
      </Space>
      <Select
        size="small"
        style={{ width: "100%" }}
        placeholder="Select space"
        value={selectedSpace}
        options={spaces.map((space) => ({ value: space.key, label: `${space.name} (${space.key})` }))}
        onChange={(spaceKey) => {
          setSelectedSpace(spaceKey);
          setSelectedTarget({ spaceKey });
        }}
        showSearch
        optionFilterProp="label"
      />
      {error && <Alert type="error" showIcon message={error} />}
      <Spin spinning={loading}>
        <Tree
          blockNode
          showLine
          selectedKeys={selectedTarget?.pageId ? [`page:${selectedTarget.pageId}`] : selectedSpace ? [`space:${selectedSpace}`] : []}
          treeData={treeData}
          loadData={loadData}
          onSelect={handleSelect}
          style={{ background: "transparent" }}
        />
      </Spin>
    </Space>
  );
}
