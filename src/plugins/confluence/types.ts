export interface ConfluenceConnectionInfo {
  id: string;
  label: string;
  baseUrl: string;
  username: string;
  authType: "basic" | "pat";
  createdAt: string;
  updatedAt: string;
}

export interface ConfluenceConnectionForm {
  id?: string;
  label: string;
  baseUrl: string;
  username: string;
  authType?: "basic" | "pat";
  password: string;
}

export interface ConfluenceTestResult {
  success: boolean;
  durationMs: number;
  error?: string | null;
}

export interface SpaceInfo {
  key: string;
  name: string;
}

export interface PageInfo {
  id: string;
  title: string;
  version: number;
  spaceKey: string;
}

export interface AttachmentInfo {
  id: string;
  title: string;
  downloadUrl: string;
}

export interface FilePageMapping {
  filePath: string;
  spaceKey: string;
  pageId: string;
  pageTitle: string;
  version: number;
  lastPublished: string;
}

export interface ConfluencePublishHistory {
  id: string;
  connectionId: string;
  spaceKey: string;
  pageId: string;
  pageTitle: string;
  pageVersion: number;
  parentId?: string | null;
  parentTitle?: string | null;
  action: "create" | "update";
  filePath?: string | null;
  markdownContent: string;
  publishedAt: string;
}

export interface ConfluencePublishHistoryForm {
  connectionId: string;
  spaceKey: string;
  pageId: string;
  pageTitle: string;
  pageVersion: number;
  parentId?: string | null;
  parentTitle?: string | null;
  action: "create" | "update";
  filePath?: string | null;
  markdownContent: string;
}

export interface ConfluencePageTarget {
  spaceKey: string;
  pageId?: string;
  pageTitle?: string;
}
