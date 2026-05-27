import { Button, Popconfirm, Space, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloudUploadOutlined, FileAddOutlined, FolderOpenOutlined, SaveOutlined, SettingOutlined } from "@ant-design/icons";
import Editor from "@monaco-editor/react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import { markdownToPreviewHtml } from "@/plugins/confluence/utils/converter";
import { ConnectionSettings } from "@/plugins/confluence/components/ConnectionSettings";
import { PageTreeSidebar } from "@/plugins/confluence/components/PageTreeSidebar";
import { PublishHistoryPanel } from "@/plugins/confluence/components/PublishHistoryPanel";
import { PublishDialog } from "@/plugins/confluence/components/PublishDialog";

export function ConfluenceEditor() {
  const markdownContent = useConfluenceStore((s) => s.markdownContent);
  const setMarkdownContent = useConfluenceStore((s) => s.setMarkdownContent);
  const currentFilePath = useConfluenceStore((s) => s.currentFilePath);
  const setCurrentFilePath = useConfluenceStore((s) => s.setCurrentFilePath);
  const setCurrentPageMapping = useConfluenceStore((s) => s.setCurrentPageMapping);
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const fileMappings = useConfluenceStore((s) => s.fileMappings);
  const currentPageMapping = useConfluenceStore((s) => s.currentPageMapping);
  const fetchConnections = useConfluenceStore((s) => s.fetchConnections);
  const selectedTarget = useConfluenceStore((s) => s.selectedTarget);

  const [showSettings, setShowSettings] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  const previewHtml = useMemo(() => {
    try {
      return markdownToPreviewHtml(markdownContent);
    } catch {
      return "<p style='color:red'>Conversion error</p>";
    }
  }, [markdownContent]);

  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const nodes = Array.from(preview.querySelectorAll<HTMLElement>(".confluence-mermaid-preview"));
    if (nodes.length === 0) return;
    let cancelled = false;
    void import("mermaid").then((mermaid) => {
      if (cancelled) return;
      mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });
      nodes.forEach((node, index) => {
        const source = decodeURIComponent(node.dataset.mermaid ?? "");
        if (!source) return;
        const renderId = `preview-mermaid-${Date.now()}-${index}`;
        mermaid.default.render(renderId, source)
          .then(({ svg }) => {
            if (!cancelled) node.innerHTML = svg;
          })
          .catch((err) => {
            if (!cancelled) {
              node.innerHTML = `<pre style="white-space:pre-wrap;color:#cf1322">${escapeHtml(String(err))}</pre>`;
            }
          });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [previewHtml]);

  const currentMapping = (currentFilePath ? fileMappings.find((m) => m.filePath === currentFilePath) : null) ?? currentPageMapping;

  const handleNewDraft = useCallback(() => {
    setMarkdownContent("# Untitled\n\n");
    setCurrentFilePath(null);
    setCurrentPageMapping(null);
  }, [setMarkdownContent, setCurrentFilePath, setCurrentPageMapping]);

  const handleOpenFile = useCallback(async () => {
    const selected = await openDialog({
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      multiple: false,
    });
    if (selected) {
      const content = await readTextFile(selected);
      setMarkdownContent(content);
      setCurrentFilePath(selected);
      setCurrentPageMapping(null);
    }
  }, [setMarkdownContent, setCurrentFilePath, setCurrentPageMapping]);

  const handleSaveFile = useCallback(async () => {
    if (currentFilePath) {
      await writeTextFile(currentFilePath, markdownContent);
    } else {
      const path = await saveDialog({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (path) {
        await writeTextFile(path, markdownContent);
        setCurrentFilePath(path);
      }
    }
  }, [currentFilePath, markdownContent, setCurrentFilePath]);

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--ant-color-border, #d9d9d9)" }}>
        <Space>
          <Popconfirm
            title="Start a new Confluence page?"
            description="This clears the current editor content and page binding, but keeps the selected publish target."
            okText="New"
            cancelText="Cancel"
            onConfirm={handleNewDraft}
          >
            <Button icon={<FileAddOutlined />} size="small">New</Button>
          </Popconfirm>
          <Tooltip title="Open .md file">
            <Button icon={<FolderOpenOutlined />} size="small" onClick={handleOpenFile}>Open</Button>
          </Tooltip>
          <Tooltip title="Save file">
            <Button icon={<SaveOutlined />} size="small" onClick={handleSaveFile}>Save</Button>
          </Tooltip>
          <Tooltip title="Connection settings">
            <Button icon={<SettingOutlined />} size="small" onClick={() => setShowSettings(true)}>
              {activeConnectionId ? "Connected" : "Connect"}
            </Button>
          </Tooltip>
        </Space>
        <Space>
          {currentFilePath && (
            <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 300 }} ellipsis>
              {currentFilePath}
            </Typography.Text>
          )}
          {currentMapping && (
            <Typography.Text type="success" style={{ fontSize: 12 }}>
              → {currentMapping.pageTitle} (v{currentMapping.version})
            </Typography.Text>
          )}
          {selectedTarget && !currentMapping && (
            <Typography.Text type="secondary" style={{ fontSize: 12, maxWidth: 260 }} ellipsis>
              Target: {selectedTarget.pageTitle ? `${selectedTarget.pageTitle} (${selectedTarget.spaceKey})` : `Space root (${selectedTarget.spaceKey})`}
            </Typography.Text>
          )}
          <Tooltip title={currentMapping ? "Update page" : "Publish to Confluence"}>
            <Button type="primary" icon={<CloudUploadOutlined />} size="small" onClick={() => setShowPublish(true)}>
              {currentMapping ? "Update" : "Publish"}
            </Button>
          </Tooltip>
        </Space>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        <aside style={{ width: 300, minWidth: 260, maxWidth: 360, overflow: "auto", borderRight: "1px solid var(--ant-color-border, #d9d9d9)", padding: 12 }}>
          <PageTreeSidebar />
          <PublishHistoryPanel />
        </aside>

        {/* Editor + Preview split */}
        <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {/* Monaco Editor */}
          <div style={{ flex: 1, minWidth: 0, borderRight: "1px solid var(--ant-color-border, #d9d9d9)" }}>
            <Editor
              height="100%"
              language="markdown"
              value={markdownContent}
              onChange={(value) => setMarkdownContent(value || "")}
              options={{
                minimap: { enabled: false },
                wordWrap: "on",
                fontSize: 14,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
              }}
            />
          </div>

          {/* Confluence Preview */}
          <div ref={previewRef} style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "16px 24px", fontFamily: "Arial, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
            <div
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              style={{ maxWidth: "100%" }}
            />
          </div>
        </div>
      </div>

      <ConnectionSettings open={showSettings} onClose={() => setShowSettings(false)} />
      <PublishDialog open={showPublish} onClose={() => setShowPublish(false)} />
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
