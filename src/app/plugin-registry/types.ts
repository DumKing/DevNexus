import type { ReactNode } from "react";

export type PluginComponent = () => ReactNode;

export interface PluginManifest {
  id: string;
  name: string;
  icon: ReactNode;
  version: string;
  component: PluginComponent;
  sidebarOrder: number;
  showInSidebar?: boolean;
}
