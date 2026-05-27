import { describe, expect, it } from "vitest";

import { markdownToConfluence } from "@/plugins/confluence/utils/converter";
import { createDrawioXml } from "@/plugins/confluence/utils/drawio";

const cdataEnd = "]]" + ">";

describe("confluence markdown converter", () => {
  it("maps json fenced code to a Confluence-safe language", () => {
    const xml = markdownToConfluence('```json\n{"ok":true}\n```');

    expect(xml).toContain('<ac:structured-macro ac:name="code">');
    expect(xml).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>');
    expect(xml).toContain('{"ok":true}');
  });

  it("omits unsupported code macro languages instead of sending invalid language values", () => {
    const xml = markdownToConfluence("```http\nGET /api HTTP/1.1\n```");

    expect(xml).toContain('<ac:structured-macro ac:name="code">');
    expect(xml).not.toContain('<ac:parameter ac:name="language">http</ac:parameter>');
    expect(xml).toContain("GET /api HTTP/1.1");
  });

  it("converts mermaid fenced code to a draw.io macro instead of html or raster image", () => {
    const xml = markdownToConfluence('```mermaid\ngraph TD;\nA-->B;\n```');

    expect(xml).toContain('<ac:structured-macro ac:name="drawio">');
    expect(xml).toContain('<ac:parameter ac:name="diagramName">mermaid-');
    expect(xml).toContain('.drawio</ac:parameter>');
    expect(xml).not.toContain('<ac:image>');
    expect(xml).not.toContain('.png');
    expect(xml).not.toContain('ac:name="html"');
    expect(xml).not.toContain('<script');
    expect(xml).not.toContain(cdataEnd);
  });

  it("wraps rendered mermaid svg in a draw.io xml attachment", () => {
    const drawio = createDrawioXml({
      fileName: "mermaid-demo.drawio",
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><text>A</text></svg>',
    });

    expect(drawio).toContain("<mxfile");
    expect(drawio).toContain('<diagram name="mermaid-demo"');
    expect(drawio).toContain("data:image/svg+xml,");
    expect(drawio).toContain("mxGraphModel");
  });
});
