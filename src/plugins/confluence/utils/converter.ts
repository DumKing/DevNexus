/**
 * Markdown -> Confluence Storage Format converter
 * Uses unified/remark ecosystem to parse Markdown and output Confluence XML.
 * Supports: LaTeX math (inline/block), Mermaid diagrams, GFM task lists, tables, footnotes.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { Root, Content, PhrasingContent, Table, TableRow, TableCell } from "mdast";
import { drawioAttachmentFileName, drawioMacro } from "@/plugins/confluence/utils/drawio";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function confluenceCodeLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  const aliases: Record<string, string> = {
    json: "javascript",
    jsonc: "javascript",
    js: "javascript",
    ts: "typescript",
    sh: "bash",
    shell: "bash",
    yml: "yaml",
    md: "markdown",
  };
  const mapped = aliases[normalized] ?? normalized;
  const supported = new Set([
    "actionscript",
    "bash",
    "c",
    "cpp",
    "csharp",
    "css",
    "html",
    "java",
    "javascript",
    "lua",
    "markdown",
    "perl",
    "php",
    "powershell",
    "python",
    "ruby",
    "sql",
    "typescript",
    "xml",
    "yaml",
  ]);
  return supported.has(mapped) ? mapped : "";
}

function phrasingToXml(nodes: PhrasingContent[]): string {
  return nodes.map(nodeToXml).join("");
}

function processInlineMath(text: string): string {
  return text.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_match, formula) => {
    return `<ac:structured-macro ac:name="mathinline"><ac:parameter ac:name="body">${escapeXml(formula)}</ac:parameter></ac:structured-macro>`;
  });
}

function nodeToXml(node: Content | Root): string {
  switch (node.type) {
    case "root":
      return (node as Root).children.map(nodeToXml).join("\n");

    case "heading": {
      const level = node.depth;
      const content = phrasingToXml(node.children);
      return `<h${level}>${content}</h${level}>`;
    }

    case "paragraph": {
      const inner = phrasingToXml(node.children);
      const blockMathMatch = inner.match(/^\$\$([\s\S]+?)\$\$$/);
      if (blockMathMatch) {
        return `<ac:structured-macro ac:name="mathblock"><ac:plain-text-body><![CDATA[${blockMathMatch[1]}]]></ac:plain-text-body></ac:structured-macro>`;
      }
      return `<p>${inner}</p>`;
    }

    case "text": {
      const escaped = escapeXml(node.value);
      return processInlineMath(escaped);
    }

    case "strong":
      return `<strong>${phrasingToXml(node.children)}</strong>`;

    case "emphasis":
      return `<em>${phrasingToXml(node.children)}</em>`;

    case "delete":
      return `<del>${phrasingToXml(node.children)}</del>`;

    case "inlineCode":
      return `<code>${escapeXml(node.value)}</code>`;

    case "code": {
      const lang = (node.lang || "").toLowerCase();
      if (lang === "latex" || lang === "math") {
        return `<ac:structured-macro ac:name="mathblock"><ac:plain-text-body><![CDATA[${node.value}]]></ac:plain-text-body></ac:structured-macro>`;
      }
      if (lang === "mermaid") {
        return drawioMacro(drawioAttachmentFileName(node.value));
      }
      const confluenceLang = confluenceCodeLanguage(lang);
      const languageParam = confluenceLang
        ? `<ac:parameter ac:name="language">${escapeXml(confluenceLang)}</ac:parameter>`
        : "";
      return `<ac:structured-macro ac:name="code">${languageParam}<ac:plain-text-body><![CDATA[${node.value}]]></ac:plain-text-body></ac:structured-macro>`;
    }

    case "link":
      return `<a href="${escapeXml(node.url)}">${phrasingToXml(node.children)}</a>`;

    case "image":
      return `<ac:image><ri:url ri:value="${escapeXml(node.url)}" /></ac:image>`;

    case "blockquote":
      return `<blockquote>${node.children.map(nodeToXml).join("")}</blockquote>`;

    case "list": {
      const tag = node.ordered ? "ol" : "ul";
      const items = node.children.map(nodeToXml).join("");
      return `<${tag}>${items}</${tag}>`;
    }

    case "listItem": {
      if (node.checked !== null && node.checked !== undefined) {
        const status = node.checked ? "complete" : "incomplete";
        const content = node.children.map(nodeToXml).join("");
        return `<ac:task><ac:task-status>${status}</ac:task-status><ac:task-body>${content}</ac:task-body></ac:task>`;
      }
      return `<li>${node.children.map(nodeToXml).join("")}</li>`;
    }

    case "table": {
      const tableNode = node as Table;
      const rows = tableNode.children.map((row: TableRow, rowIdx: number) => {
        const cells = row.children.map((cell: TableCell) => {
          const tag = rowIdx === 0 ? "th" : "td";
          const content = phrasingToXml(cell.children as PhrasingContent[]);
          return `<${tag}>${content}</${tag}>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      return `<table><tbody>${rows}</tbody></table>`;
    }

    case "thematicBreak":
      return "<hr />";

    case "break":
      return "<br />";

    case "html":
      return node.value;

    case "footnoteReference":
      return `<sup><a href="#fn-${escapeXml(node.identifier)}">[${escapeXml(node.identifier)}]</a></sup>`;

    case "footnoteDefinition": {
      const content = node.children.map(nodeToXml).join("");
      return `<div id="fn-${escapeXml(node.identifier)}"><sup>${escapeXml(node.identifier)}</sup> ${content}</div>`;
    }

    default:
      if ("children" in node && Array.isArray(node.children)) {
        return (node.children as Content[]).map(nodeToXml).join("");
      }
      if ("value" in node && typeof node.value === "string") {
        return escapeXml(node.value);
      }
      return "";
  }
}

export function markdownToConfluence(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkGfm);
  const tree = processor.parse(markdown);
  return nodeToXml(tree);
}

export function extractMermaidSources(markdown: string): string[] {
  const sources: string[] = [];
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = mermaidRegex.exec(markdown)) !== null) {
    const source = match[1].trim();
    if (source) sources.push(source);
  }
  return sources;
}
