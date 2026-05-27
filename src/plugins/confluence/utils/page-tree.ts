import type { DataNode } from "antd/es/tree";

import type { ConfluencePublishHistory, PageInfo, SpaceInfo } from "@/plugins/confluence/types";

export type ConfluenceTreeNode = DataNode & {
  key: string;
  title: string;
  children?: ConfluenceTreeNode[];
  isLeaf?: boolean;
};

export interface EditorDraftFromHistory {
  markdownContent: string;
  filePath: string | null;
  pageId: string;
  pageTitle: string;
  spaceKey: string;
  version: number;
}

export function buildConfluenceTreeNodes(
  spaces: SpaceInfo[],
  pagesByParent: Record<string, PageInfo[]>,
  selectedPageId?: string,
): ConfluenceTreeNode[] {
  return spaces.map((space) => ({
    key: `space:${space.key}`,
    title: `${space.name} (${space.key})`,
    selectable: true,
    children: buildPageChildren(space.key, pagesByParent, `space:${space.key}`, selectedPageId),
  }));
}

function buildPageChildren(
  spaceKey: string,
  pagesByParent: Record<string, PageInfo[]>,
  parentKey: string,
  selectedPageId?: string,
): ConfluenceTreeNode[] | undefined {
  const pages = pagesByParent[parentKey];
  if (!pages) return undefined;
  return pages.map((page) => ({
    key: `page:${page.id}`,
    title: page.title,
    selectable: true,
    isLeaf: false,
    className: selectedPageId === page.id ? "confluence-tree-node-selected" : undefined,
    children: buildPageChildren(spaceKey, pagesByParent, `page:${page.id}`, selectedPageId),
  }));
}

export function historyToEditorDraft(record: ConfluencePublishHistory): EditorDraftFromHistory {
  return {
    markdownContent: record.markdownContent,
    filePath: record.filePath ?? null,
    pageId: record.pageId,
    pageTitle: record.pageTitle,
    spaceKey: record.spaceKey,
    version: record.pageVersion,
  };
}
