import { describe, expect, it } from "vitest";

import { filterPluginManagerItems, getPluginGroupId } from "@/app/plugin-registry/plugin-groups";
import type { PluginManifest } from "@/app/plugin-registry/types";

const plugin = (id: string, name = id): PluginManifest => ({
  id,
  name,
  icon: null,
  version: "0.1.0",
  component: () => null,
  sidebarOrder: 1,
});

describe("plugin manager groups", () => {
  it("maps built-in plugins to scalable manager groups", () => {
    expect(getPluginGroupId(plugin("redis-manager"))).toBe("database");
    expect(getPluginGroupId(plugin("s3-client"))).toBe("storage");
    expect(getPluginGroupId(plugin("ssh-client"))).toBe("network");
    expect(getPluginGroupId(plugin("api-debugger"))).toBe("api");
    expect(getPluginGroupId(plugin("mq-client"))).toBe("messaging");
    expect(getPluginGroupId(plugin("confluence"))).toBe("document");
    expect(getPluginGroupId(plugin("lan-chat"))).toBe("collaboration");
    expect(getPluginGroupId(plugin("unknown-tool"))).toBe("other");
  });

  it("filters by group, enabled state, and search text", () => {
    const plugins = [plugin("redis-manager", "Redis"), plugin("ssh-client", "SSH"), plugin("lan-chat", "LAN Chat")];

    expect(
      filterPluginManagerItems({
        plugins,
        enabledPluginIds: ["redis-manager", "lan-chat"],
        groupId: "enabled",
        search: "",
        getLabel: (item) => item.name,
      }).map((item) => item.id),
    ).toEqual(["redis-manager", "lan-chat"]);

    expect(
      filterPluginManagerItems({
        plugins,
        groupId: "network",
        search: "",
        getLabel: (item) => item.name,
      }).map((item) => item.id),
    ).toEqual(["ssh-client"]);

    expect(
      filterPluginManagerItems({
        plugins,
        groupId: "all",
        search: "chat",
        getLabel: (item) => item.name,
      }).map((item) => item.id),
    ).toEqual(["lan-chat"]);
  });
});
