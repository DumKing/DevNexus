export interface AppStatusInput {
  selectedToolName: string;
  sidebarCollapsed: boolean;
  runtime: "desktop" | "browser";
  lanDevices: number;
  lanRooms: number;
  lanTransfers: number;
  labels?: {
    tool: string;
    sidebar: string;
    runtime: string;
    lanDevices: string;
    rooms: string;
    transfers: string;
    collapsed: string;
    expanded: string;
    desktop: string;
    browser: string;
  };
}

export interface AppStatusItem {
  label: string;
  value: string;
}

export function buildAppStatusItems(input: AppStatusInput): AppStatusItem[] {
  const labels = input.labels ?? {
    tool: "Tool",
    sidebar: "Sidebar",
    runtime: "Runtime",
    lanDevices: "LAN Devices",
    rooms: "Rooms",
    transfers: "Transfers",
    collapsed: "Collapsed",
    expanded: "Expanded",
    desktop: "desktop",
    browser: "browser",
  };
  return [
    { label: labels.tool, value: input.selectedToolName },
    { label: labels.sidebar, value: input.sidebarCollapsed ? labels.collapsed : labels.expanded },
    { label: labels.runtime, value: labels[input.runtime] },
    { label: labels.lanDevices, value: String(input.lanDevices) },
    { label: labels.rooms, value: String(input.lanRooms) },
    { label: labels.transfers, value: String(input.lanTransfers) },
  ];
}

export function shouldDockChatInStatusBar(input: { open: boolean; minimized: boolean }): boolean {
  return input.open && input.minimized;
}
