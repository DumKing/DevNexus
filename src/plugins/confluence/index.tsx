import { FileMarkdownOutlined } from "@ant-design/icons";

import type { PluginManifest } from "@/app/plugin-registry/types";
import { ConfluenceEditor } from "@/plugins/confluence/components/ConfluenceEditor";

function ConfluenceRoot() {
  return <ConfluenceEditor />;
}

export const confluencePlugin: PluginManifest = {
  id: "confluence",
  name: "Confluence",
  icon: <FileMarkdownOutlined />,
  version: "0.10.0-alpha",
  sidebarOrder: 9,
  component: ConfluenceRoot,
};
