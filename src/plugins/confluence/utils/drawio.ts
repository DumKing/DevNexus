export interface DrawioXmlInput {
  fileName: string;
  svg: string;
}

export function drawioAttachmentFileName(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mermaid-${(hash >>> 0).toString(16)}.drawio`;
}

export function drawioMacro(fileName: string): string {
  const safeName = escapeXml(fileName);
  return [
    '<ac:structured-macro ac:name="drawio">',
    `<ac:parameter ac:name="diagramName">${safeName}</ac:parameter>`,
    '<ac:parameter ac:name="simpleViewer">false</ac:parameter>',
    '<ac:parameter ac:name="width">100%</ac:parameter>',
    '<ac:parameter ac:name="diagramWidth">900</ac:parameter>',
    '<ac:parameter ac:name="revision">1</ac:parameter>',
    '</ac:structured-macro>',
  ].join("");
}

export function createDrawioXml({ fileName, svg }: DrawioXmlInput): string {
  const diagramName = escapeXml(fileName.replace(/\.drawio$/i, ""));
  const { width, height } = readSvgSize(svg);
  const imageData = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  const style = `shape=image;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=0;aspect=fixed;image=${escapeXml(imageData)};`;
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<mxfile host="DevNexus" type="device">` +
    `<diagram name="${diagramName}">` +
    `<mxGraphModel dx="${width}" dy="${height}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${width}" pageHeight="${height}" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
    `<mxCell id="2" value="" style="${style}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="${width}" height="${height}" as="geometry"/></mxCell>` +
    `</root></mxGraphModel>` +
    `</diagram></mxfile>`;
}

function readSvgSize(svg: string): { width: number; height: number } {
  const width = Number(svg.match(/\bwidth="([\d.]+)/)?.[1]);
  const height = Number(svg.match(/\bheight="([\d.]+)/)?.[1]);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width: Math.ceil(width), height: Math.ceil(height) };
  }
  const viewBox = svg.match(/\bviewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/);
  const viewBoxWidth = Number(viewBox?.[1]);
  const viewBoxHeight = Number(viewBox?.[2]);
  if (Number.isFinite(viewBoxWidth) && Number.isFinite(viewBoxHeight) && viewBoxWidth > 0 && viewBoxHeight > 0) {
    return { width: Math.ceil(viewBoxWidth), height: Math.ceil(viewBoxHeight) };
  }
  return { width: 900, height: 600 };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
