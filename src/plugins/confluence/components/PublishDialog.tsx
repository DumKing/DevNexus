import { Button, Input, message, Modal, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";

import { useConfluenceStore } from "@/plugins/confluence/store/confluence";
import { markdownToConfluence } from "@/plugins/confluence/utils/converter";
import { extractLocalImages, extractMermaidDiagrams, uploadLocalImages, uploadMermaidDiagrams, replaceLocalImagesInXml } from "@/plugins/confluence/utils/attachments";
import type { PageInfo, SpaceInfo } from "@/plugins/confluence/types";

export function PublishDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeConnectionId = useConfluenceStore((s) => s.activeConnectionId);
  const markdownContent = useConfluenceStore((s) => s.markdownContent);
  const currentFilePath = useConfluenceStore((s) => s.currentFilePath);
  const currentPageMapping = useConfluenceStore((s) => s.currentPageMapping);
  const fileMappings = useConfluenceStore((s) => s.fileMappings);
  const selectedTarget = useConfluenceStore((s) => s.selectedTarget);
  const listSpaces = useConfluenceStore((s) => s.listSpaces);
  const listPages = useConfluenceStore((s) => s.listPages);
  const createPage = useConfluenceStore((s) => s.createPage);
  const updatePage = useConfluenceStore((s) => s.updatePage);
  const saveFileMapping = useConfluenceStore((s) => s.saveFileMapping);
  const setCurrentPageMapping = useConfluenceStore((s) => s.setCurrentPageMapping);
  const recordPublishHistory = useConfluenceStore((s) => s.recordPublishHistory);

  const [spaces, setSpaces] = useState<SpaceInfo[]>([]);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [selectedSpace, setSelectedSpace] = useState<string>("");
  const [selectedParent, setSelectedParent] = useState<string | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [statusText, setStatusText] = useState("");

  // Detect existing mapping
  const existingMapping = (currentFilePath
    ? fileMappings.find((m) => m.filePath === currentFilePath)
    : null) ?? currentPageMapping;

  useEffect(() => {
    if (open && activeConnectionId) {
      listSpaces(activeConnectionId).then(setSpaces).catch(() => setSpaces([]));
      // Derive title from first heading or filename
      const h1Match = markdownContent.match(/^#\s+(.+)$/m);
      if (h1Match) {
        setTitle(h1Match[1]);
      } else if (currentFilePath) {
        const parts = currentFilePath.replace(/\\/g, "/").split("/");
        setTitle(parts[parts.length - 1]?.replace(/\.md$/, "") || "Untitled");
      }
      if (existingMapping) {
        setSelectedSpace(existingMapping.spaceKey);
        setTitle(existingMapping.pageTitle);
      } else if (selectedTarget) {
        setSelectedSpace(selectedTarget.spaceKey);
        setSelectedParent(selectedTarget.pageId);
      }
    }
  }, [open, activeConnectionId, markdownContent, currentFilePath, existingMapping, listSpaces, selectedTarget]);

  useEffect(() => {
    if (selectedSpace && activeConnectionId) {
      listPages(activeConnectionId, selectedSpace).then(setPages).catch(() => setPages([]));
    }
  }, [selectedSpace, activeConnectionId, listPages]);

  const handlePublish = async () => {
    if (!activeConnectionId) {
      message.error("No active connection. Configure a connection first.");
      return;
    }
    if (!title.trim()) {
      message.error("Title is required");
      return;
    }
    setPublishing(true);
    setStatusText("Converting markdown...");
    try {
      let contentXml = markdownToConfluence(markdownContent);
      let page: PageInfo;

      if (existingMapping) {
        // Update existing page
        setStatusText("Updating page...");
        page = await updatePage(
          activeConnectionId,
          existingMapping.pageId,
          title,
          contentXml,
          existingMapping.version,
        );
        // Upload local images as attachments
        const localImages = extractLocalImages(markdownContent, currentFilePath);
        if (localImages.length > 0) {
          setStatusText(`Uploading ${localImages.length} image(s)...`);
          const attachmentMap = await uploadLocalImages(activeConnectionId, page.id, localImages);
          if (attachmentMap.size > 0) {
            contentXml = replaceLocalImagesInXml(contentXml, attachmentMap);
            // Re-update the page with attachment references
            setStatusText("Updating page with attachments...");
            page = await updatePage(activeConnectionId, page.id, title, contentXml, page.version);
          }
        }
        const mermaidDiagrams = extractMermaidDiagrams(markdownContent);
        if (mermaidDiagrams.length > 0) {
          setStatusText(`Rendering ${mermaidDiagrams.length} Mermaid diagram(s)...`);
          await uploadMermaidDiagrams(activeConnectionId, page.id, mermaidDiagrams);
        }
        message.success(`Page updated (v${page.version})`);
      } else {
        // Create new page
        if (!selectedSpace) {
          message.error("Please select a Space");
          setPublishing(false);
          setStatusText("");
          return;
        }
        setStatusText("Creating page...");
        page = await createPage(activeConnectionId, selectedSpace, title, contentXml, selectedParent);

        // Upload local images as attachments
        const localImages = extractLocalImages(markdownContent, currentFilePath);
        if (localImages.length > 0) {
          setStatusText(`Uploading ${localImages.length} image(s)...`);
          const attachmentMap = await uploadLocalImages(activeConnectionId, page.id, localImages);
          if (attachmentMap.size > 0) {
            contentXml = replaceLocalImagesInXml(contentXml, attachmentMap);
            // Update the page with correct attachment references
            setStatusText("Updating page with attachments...");
            page = await updatePage(activeConnectionId, page.id, title, contentXml, page.version);
          }
        }
        const mermaidDiagrams = extractMermaidDiagrams(markdownContent);
        if (mermaidDiagrams.length > 0) {
          setStatusText(`Rendering ${mermaidDiagrams.length} Mermaid diagram(s)...`);
          await uploadMermaidDiagrams(activeConnectionId, page.id, mermaidDiagrams);
        }
        message.success("Page created successfully");
      }

      // Save mapping
      const mapping = {
        filePath: currentFilePath ?? `confluence-page:${page.id}`,
        spaceKey: page.spaceKey || selectedSpace,
        pageId: page.id,
        pageTitle: page.title,
        version: page.version,
        lastPublished: new Date().toISOString(),
      };
      if (currentFilePath) {
        saveFileMapping(mapping);
      } else {
        setCurrentPageMapping(mapping);
      }
      await recordPublishHistory({
        connectionId: activeConnectionId,
        spaceKey: page.spaceKey || selectedSpace,
        pageId: page.id,
        pageTitle: page.title,
        pageVersion: page.version,
        parentId: existingMapping ? null : selectedParent ?? null,
        parentTitle: existingMapping ? null : selectedTarget?.pageTitle ?? null,
        action: existingMapping ? "update" : "create",
        filePath: currentFilePath,
        markdownContent,
      });
      onClose();
    } catch (err) {
      message.error(String(err));
    } finally {
      setPublishing(false);
      setStatusText("");
    }
  };

  return (
    <Modal
      title={existingMapping ? "Update Confluence Page" : "Publish to Confluence"}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="publish" type="primary" loading={publishing} onClick={handlePublish}>
          {existingMapping ? "Update" : "Publish"}
        </Button>,
      ]}
    >
      {!activeConnectionId && (
        <Typography.Text type="danger">No connection configured. Open connection settings first.</Typography.Text>
      )}

      <Space direction="vertical" style={{ width: "100%", marginTop: 16 }} size="middle">
        <div>
          <Typography.Text strong>Title</Typography.Text>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" />
        </div>

        {existingMapping ? (
          <Typography.Text type="secondary">
            Updating existing page: {existingMapping.pageTitle} (v{existingMapping.version}) in space {existingMapping.spaceKey}
          </Typography.Text>
        ) : (
          <>
            <div>
              <Typography.Text strong>Space</Typography.Text>
              <Select
                style={{ width: "100%" }}
                value={selectedSpace || undefined}
                onChange={setSelectedSpace}
                placeholder="Select a space"
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                options={spaces.map((s) => ({ value: s.key, label: `${s.name} (${s.key})` }))}
              />
            </div>
            <div>
              <Typography.Text strong>Parent Page (optional)</Typography.Text>
              {selectedTarget?.pageId && selectedTarget.pageId === selectedParent && (
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                  Defaulted from left page tree: {selectedTarget.pageTitle}
                </Typography.Text>
              )}
              <Select
                style={{ width: "100%" }}
                value={selectedParent}
                onChange={setSelectedParent}
                placeholder="Root (no parent)"
                allowClear
                showSearch
                filterOption={(input, option) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase())}
                options={pages.map((p) => ({ value: p.id, label: p.title }))}
              />
            </div>
          </>
        )}

        {statusText && (
          <Typography.Text type="secondary" italic>{statusText}</Typography.Text>
        )}
      </Space>
    </Modal>
  );
}
