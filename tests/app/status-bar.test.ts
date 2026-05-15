import { describe, expect, it } from "vitest";

import { buildAppStatusItems, shouldDockChatInStatusBar } from "@/app/layout/status-bar";

describe("app status bar", () => {
  it("uses real app state labels instead of placeholder connection telemetry", () => {
    const labels = buildAppStatusItems({
      selectedToolName: "Redis Manager",
      sidebarCollapsed: false,
      runtime: "desktop",
      lanDevices: 2,
      lanRooms: 1,
      lanTransfers: 3,
    }).map((item) => item.label);

    expect(labels).toEqual(["Tool", "Sidebar", "Runtime", "LAN Devices", "Rooms", "Transfers"]);
    expect(labels).not.toContain("Connection");
    expect(labels).not.toContain("Latency");
  });

  it("docks chat in the status bar only when the chat window is minimized", () => {
    expect(shouldDockChatInStatusBar({ open: true, minimized: true })).toBe(true);
    expect(shouldDockChatInStatusBar({ open: true, minimized: false })).toBe(false);
    expect(shouldDockChatInStatusBar({ open: false, minimized: true })).toBe(false);
  });
});
