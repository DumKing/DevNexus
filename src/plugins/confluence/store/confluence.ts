import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import type {
  AttachmentInfo,
  ConfluencePageTarget,
  ConfluenceConnectionForm,
  ConfluenceConnectionInfo,
  ConfluencePublishHistory,
  ConfluencePublishHistoryForm,
  ConfluenceTestResult,
  FilePageMapping,
  PageInfo,
  SpaceInfo,
} from "@/plugins/confluence/types";

export type ConfluenceTab = "editor" | "connections";

interface ConfluenceState {
  activeTab: ConfluenceTab;
  connections: ConfluenceConnectionInfo[];
  activeConnectionId: string | null;
  markdownContent: string;
  currentFilePath: string | null;
  currentPageMapping: FilePageMapping | null;
  fileMappings: FilePageMapping[];
  selectedTarget: ConfluencePageTarget | null;
  publishHistory: ConfluencePublishHistory[];
  loading: boolean;
  setActiveTab: (tab: ConfluenceTab) => void;
  setMarkdownContent: (content: string) => void;
  setCurrentFilePath: (path: string | null) => void;
  setCurrentPageMapping: (mapping: FilePageMapping | null) => void;
  setSelectedTarget: (target: ConfluencePageTarget | null) => void;
  fetchConnections: () => Promise<void>;
  saveConnection: (form: ConfluenceConnectionForm) => Promise<string>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (form: ConfluenceConnectionForm) => Promise<ConfluenceTestResult>;
  setActiveConnectionId: (id: string | null) => void;
  listSpaces: (connId: string) => Promise<SpaceInfo[]>;
  listPages: (connId: string, spaceKey: string, parentId?: string) => Promise<PageInfo[]>;
  createPage: (connId: string, spaceKey: string, title: string, contentXml: string, parentId?: string) => Promise<PageInfo>;
  updatePage: (connId: string, pageId: string, title: string, contentXml: string, version: number) => Promise<PageInfo>;
  uploadAttachment: (connId: string, pageId: string, fileName: string, fileBase64: string, contentType: string) => Promise<AttachmentInfo>;
  fetchPublishHistory: (connId?: string | null) => Promise<void>;
  recordPublishHistory: (form: ConfluencePublishHistoryForm) => Promise<string>;
  deletePublishHistory: (id: string) => Promise<void>;
  loadFileMappings: () => void;
  saveFileMapping: (mapping: FilePageMapping) => void;
  removeFileMapping: (filePath: string) => void;
}

const MAPPINGS_KEY = "devnexus_confluence_file_mappings";

function loadMappingsFromStorage(): FilePageMapping[] {
  try {
    const raw = localStorage.getItem(MAPPINGS_KEY);
    if (raw) return JSON.parse(raw) as FilePageMapping[];
  } catch { /* ignore */ }
  return [];
}

function saveMappingsToStorage(mappings: FilePageMapping[]) {
  localStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappings));
}

export const useConfluenceStore = create<ConfluenceState>()((set, get) => ({
  activeTab: "editor",
  connections: [],
  activeConnectionId: null,
  markdownContent: "",
  currentFilePath: null,
  currentPageMapping: null,
  fileMappings: loadMappingsFromStorage(),
  selectedTarget: null,
  publishHistory: [],
  loading: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  setMarkdownContent: (markdownContent) => set({ markdownContent }),
  setCurrentFilePath: (currentFilePath) => set({ currentFilePath }),
  setCurrentPageMapping: (currentPageMapping) => set({ currentPageMapping }),
  setSelectedTarget: (selectedTarget) => set({ selectedTarget }),
  setActiveConnectionId: (activeConnectionId) => set({ activeConnectionId }),
  fetchConnections: async () => {
    const connections = await invoke<ConfluenceConnectionInfo[]>("cmd_confluence_list_connections");
    set({ connections });
  },
  saveConnection: async (form) => {
    const id = await invoke<string>("cmd_confluence_save_connection", { form });
    await get().fetchConnections();
    return id;
  },
  deleteConnection: async (id) => {
    await invoke("cmd_confluence_delete_connection", { id });
    await get().fetchConnections();
  },
  testConnection: async (form) => {
    set({ loading: true });
    try {
      return await invoke<ConfluenceTestResult>("cmd_confluence_test_connection", { form });
    } finally {
      set({ loading: false });
    }
  },
  listSpaces: async (connId) => {
    return invoke<SpaceInfo[]>("cmd_confluence_list_spaces", { connId });
  },
  listPages: async (connId, spaceKey, parentId) => {
    return invoke<PageInfo[]>("cmd_confluence_list_pages", { connId, spaceKey, parentId: parentId ?? null });
  },
  createPage: async (connId, spaceKey, title, contentXml, parentId) => {
    return invoke<PageInfo>("cmd_confluence_create_page", { connId, spaceKey, title, contentXml, parentId: parentId ?? null });
  },
  updatePage: async (connId, pageId, title, contentXml, version) => {
    return invoke<PageInfo>("cmd_confluence_update_page", { connId, pageId, title, contentXml, version });
  },
  uploadAttachment: async (connId, pageId, fileName, fileBase64, contentType) => {
    return invoke<AttachmentInfo>("cmd_confluence_upload_attachment", { connId, pageId, fileName, fileBase64, contentType });
  },
  fetchPublishHistory: async (connId) => {
    const publishHistory = await invoke<ConfluencePublishHistory[]>("cmd_confluence_list_publish_history", { connId: connId ?? null });
    set({ publishHistory });
  },
  recordPublishHistory: async (form) => {
    const id = await invoke<string>("cmd_confluence_record_publish_history", { form });
    await get().fetchPublishHistory(form.connectionId);
    return id;
  },
  deletePublishHistory: async (id) => {
    await invoke("cmd_confluence_delete_publish_history", { id });
    await get().fetchPublishHistory(get().activeConnectionId);
  },
  loadFileMappings: () => set({ fileMappings: loadMappingsFromStorage() }),
  saveFileMapping: (mapping) => {
    const mappings = get().fileMappings.filter((m) => m.filePath !== mapping.filePath);
    mappings.push(mapping);
    saveMappingsToStorage(mappings);
    set({ fileMappings: mappings, currentPageMapping: mapping });
  },
  removeFileMapping: (filePath) => {
    const mappings = get().fileMappings.filter((m) => m.filePath !== filePath);
    saveMappingsToStorage(mappings);
    set({ fileMappings: mappings });
  },
}));
