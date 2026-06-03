export interface DrawioXmlInput {
  fileName: string;
  svg: string;
  mermaidSource?: string;
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
    '<ac:parameter ac:name="simpleViewer">true</ac:parameter>',
    '<ac:parameter ac:name="width">100%</ac:parameter>',
    '<ac:parameter ac:name="diagramWidth">1100</ac:parameter>',
    '<ac:parameter ac:name="tbstyle">top</ac:parameter>',
    '<ac:parameter ac:name="lbox">1</ac:parameter>',
    '<ac:parameter ac:name="revision">1</ac:parameter>',
    '</ac:structured-macro>',
  ].join("");
}

export function createDrawioXml({ fileName, svg, mermaidSource }: DrawioXmlInput): string {
  const diagramName = escapeXml(fileName.replace(/\.drawio$/i, ""));
  const source = mermaidSource?.trim() ?? "";
  const sourceCell = source
    ? `<mxCell id="4" value="${escapeXml(source)}" style="text;html=1;strokeColor=none;fillColor=none;opacity=0;" vertex="1" parent="1" visible="0"><mxGeometry x="0" y="0" width="1" height="1" as="geometry"/></mxCell>`
    : "";
  const svgSize = readSvgSize(svg);
  const layout = drawioLayout(svgSize);
  const imageData = `data:image/svg+xml,${encodeURIComponent(normalizeSvg(svg, svgSize))}`;
  const imageStyle = `shape=image;html=1;verticalLabelPosition=bottom;verticalAlign=top;imageAspect=1;aspect=fixed;image=${escapeXml(imageData)};`;
  const backgroundStyle = "rounded=1;whiteSpace=wrap;html=1;arcSize=3;fillColor=#ffffff;strokeColor=#d9e2f3;shadow=0;";
  return `<?xml version="1.0" encoding="UTF-8"?>` +
    `<mxfile host="DevNexus" agent="DevNexus Confluence Publisher" version="0.10.0" type="device" compressed="false">` +
    `<diagram id="${diagramId(fileName)}" name="${diagramName}">` +
    `<mxGraphModel dx="${layout.pageWidth}" dy="${layout.pageHeight}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${layout.pageWidth}" pageHeight="${layout.pageHeight}" math="0" shadow="0">` +
    `<root><mxCell id="0"/><mxCell id="1" parent="0"/>` +
    `<mxCell id="2" value="" style="${backgroundStyle}" vertex="1" parent="1"><mxGeometry x="0" y="0" width="${layout.pageWidth}" height="${layout.pageHeight}" as="geometry"/></mxCell>` +
    `<mxCell id="3" value="" style="${imageStyle}" vertex="1" parent="1"><mxGeometry x="${layout.x}" y="${layout.y}" width="${layout.imageWidth}" height="${layout.imageHeight}" as="geometry"/></mxCell>` +
    sourceCell +
    `</root></mxGraphModel>` +
    `</diagram></mxfile>`;
}

function drawioLayout({ width, height }: { width: number; height: number }) {
  const padding = 32;
  const maxImageWidth = 1200;
  const minImageWidth = 360;
  const scale = width > maxImageWidth ? maxImageWidth / width : width < minImageWidth ? minImageWidth / width : 1;
  const imageWidth = Math.ceil(width * scale);
  const imageHeight = Math.ceil(height * scale);
  return {
    x: padding,
    y: padding,
    imageWidth,
    imageHeight,
    pageWidth: imageWidth + padding * 2,
    pageHeight: imageHeight + padding * 2,
  };
}

function readSvgSize(svg: string): { width: number; height: number } {
  const width = Number(svg.match(/\bwidth="([\d.]+)(?:px)?"/)?.[1]);
  const height = Number(svg.match(/\bheight="([\d.]+)(?:px)?"/)?.[1]);
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

function normalizeSvg(svg: string, size: { width: number; height: number }): string {
  let normalized = svg.trim();
  if (!normalized.includes("xmlns=")) {
    normalized = normalized.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  normalized = normalized.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");
  normalized = normalized.replace("<svg", `<svg width="${size.width}" height="${size.height}"`);
  if (!/<rect\b[^>]*data-devnexus-bg=/.test(normalized)) {
    normalized = normalized.replace(
      /(<svg\b[^>]*>)/,
      `$1<rect data-devnexus-bg="1" width="100%" height="100%" fill="#ffffff"/>`,
    );
  }
  return normalized;
}

function diagramId(fileName: string): string {
  let hash = 5381;
  for (let i = 0; i < fileName.length; i++) {
    hash = Math.imul(hash, 33) ^ fileName.charCodeAt(i);
  }
  return `devnexus-${(hash >>> 0).toString(16)}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
