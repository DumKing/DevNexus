import { MessageOutlined } from "@ant-design/icons";

import type { PluginManifest } from "@/app/plugin-registry/types";

function LanChatFloatingPlugin() {
  return null;
}

export const lanChatPlugin: PluginManifest = {
  id: "lan-chat",
  name: "LAN Chat",
  icon: <MessageOutlined />,
  version: "0.10.0",
  sidebarOrder: 900,
  showInSidebar: false,
  component: LanChatFloatingPlugin,
};
