export interface AppStatusInput {
  selectedToolName: string;
  sidebarCollapsed: boolean;
  runtime: "desktop" | "browser";
  lanDevices: number;
  lanRooms: number;
  lanTransfers: number;
}

export interface AppStatusItem {
  label: string;
  value: string;
}

export function buildAppStatusItems(input: AppStatusInput): AppStatusItem[] {
  return [
    { label: "Tool", value: input.selectedToolName },
    { label: "Sidebar", value: input.sidebarCollapsed ? "Collapsed" : "Expanded" },
    { label: "Runtime", value: input.runtime },
    { label: "LAN Devices", value: String(input.lanDevices) },
    { label: "Rooms", value: String(input.lanRooms) },
    { label: "Transfers", value: String(input.lanTransfers) },
  ];
}

export function shouldDockChatInStatusBar(input: { open: boolean; minimized: boolean }): boolean {
  return input.open && input.minimized;
}
