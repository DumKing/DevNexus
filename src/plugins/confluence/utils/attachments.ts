/**
 * Attachment utilities for Confluence Publisher.
 * Handles: local image detection, upload, and URL replacement.
 */
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";

import type { AttachmentInfo } from "@/plugins/confluence/types";
import { createDrawioXml, drawioAttachmentFileName } from "@/plugins/confluence/utils/drawio";
import { extractMermaidSources } from "@/plugins/confluence/utils/converter";

export interface LocalImageRef {
  originalPath: string;
  absolutePath: string;
  fileName: string;
}

export interface MermaidDiagramRef {
  source: string;
  fileName: string;
}

export function extractLocalImages(markdown: string, basePath: string | null): LocalImageRef[] {
  const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
  const refs: LocalImageRef[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageRegex.exec(markdown)) !== null) {
    const rawPath = match[1].trim();
    if (rawPath.startsWith("http://") || rawPath.startsWith("https://") || rawPath.startsWith("data:")) continue;
    let absolutePath = rawPath;
    if (basePath && !/^[a-zA-Z]:[/\\]/.test(rawPath) && !rawPath.startsWith("/") && !rawPath.startsWith("\\\\")) {
      const dir = basePath.replace(/[/\\][^/\\]*$/, "");
      absolutePath = dir + "\\" + rawPath.replace(/^\.\//, "").replace(/\//g, "\\");
    }
    const fileName = rawPath.replace(/^.*[/\\]/, "");
    refs.push({ originalPath: rawPath, absolutePath, fileName });
  }
  return refs;
}

export function extractMermaidDiagrams(markdown: string): MermaidDiagramRef[] {
  return extractMermaidSources(markdown).map((source) => ({
    source,
    fileName: drawioAttachmentFileName(source),
  }));
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
    bmp: "image/bmp",
  };
  return mimeMap[ext] || "application/octet-stream";
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  return uint8ArrayToBase64(new TextEncoder().encode(text));
}

export async function uploadLocalImages(
  connId: string,
  pageId: string,
  images: LocalImageRef[],
): Promise<Map<string, AttachmentInfo>> {
  const results = new Map<string, AttachmentInfo>();
  for (const img of images) {
    try {
      const bytes = await readFile(img.absolutePath);
      const base64 = uint8ArrayToBase64(bytes);
      const contentType = getMimeType(img.fileName);
      const attachment = await invoke<AttachmentInfo>("cmd_confluence_upload_attachment", {
        connId, pageId, fileName: img.fileName, fileBase64: base64, contentType,
      });
      results.set(img.originalPath, attachment);
    } catch (err) {
      console.warn("Failed to upload " + img.fileName, err);
    }
  }
  return results;
}

export async function uploadMermaidDiagrams(
  connId: string,
  pageId: string,
  diagrams: MermaidDiagramRef[],
): Promise<Map<string, AttachmentInfo>> {
  const results = new Map<string, AttachmentInfo>();
  if (diagrams.length === 0) return results;

  const mermaid = await import("mermaid");
  mermaid.default.initialize({ startOnLoad: false, securityLevel: "strict" });

  for (const diagram of diagrams) {
    try {
      const renderId = `devnexus-${diagram.fileName.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const rendered = await mermaid.default.render(renderId, diagram.source);
      const drawioXml = createDrawioXml({ fileName: diagram.fileName, svg: rendered.svg });
      const base64 = textToBase64(drawioXml);
      const attachment = await invoke<AttachmentInfo>("cmd_confluence_upload_attachment", {
        connId,
        pageId,
        fileName: diagram.fileName,
        fileBase64: base64,
        contentType: "application/xml",
      });
      results.set(diagram.fileName, attachment);
    } catch (err) {
      console.warn("Failed to render/upload Mermaid draw.io diagram " + diagram.fileName, err);
    }
  }
  return results;
}

export function replaceLocalImagesInXml(xml: string, attachmentMap: Map<string, AttachmentInfo>): string {
  let result = xml;
  for (const [originalPath, att] of attachmentMap.entries()) {
    const escapedPath = escapeXml(originalPath).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `<ac:image><ri:url ri:value="${escapedPath}"\\s*/></ac:image>`, "g"
    );
    result = result.replace(pattern, `<ac:image><ri:attachment ri:filename="${att.title}" /></ac:image>`);
  }
  return result;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
