import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRegistry,
  getAll,
  getById,
  register,
} from "@/app/plugin-registry/registry";
import type { PluginManifest } from "@/app/plugin-registry/types";
import { canDisablePlugin, getRoutablePlugins, getSidebarPlugins } from "@/app/plugin-registry/visibility";

const createManifest = (id: string, sidebarOrder: number, showInSidebar = true): PluginManifest => ({
  id,
  name: id,
  icon: null,
  version: "0.1.0",
  component: () => null,
  sidebarOrder,
  showInSidebar,
});

describe("plugin registry", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("returns plugins sorted by sidebar order", () => {
    register(createManifest("redis", 20));
    register(createManifest("ssh", 10));

    expect(getAll().map((plugin) => plugin.id)).toEqual(["ssh", "redis"]);
  });

  it("ignores duplicate plugin id registration", () => {
    register(createManifest("redis", 20));
    register(createManifest("redis", 5));

    expect(getAll()).toHaveLength(1);
    expect(getById("redis")?.sidebarOrder).toBe(20);
  });

  it("filters disabled plugins from sidebar and routable plugin lists", () => {
    const redis = createManifest("redis", 10);
    const chat = createManifest("lan-chat", 20, false);
    const ssh = createManifest("ssh", 30);
    const plugins = [redis, chat, ssh];

    expect(getSidebarPlugins(plugins, ["redis", "lan-chat"]).map((plugin) => plugin.id)).toEqual(["redis"]);
    expect(getRoutablePlugins(plugins, ["redis", "lan-chat"]).map((plugin) => plugin.id)).toEqual(["redis"]);
  });

  it("keeps at least one routable workspace plugin enabled", () => {
    const redis = createManifest("redis", 10);
    const chat = createManifest("lan-chat", 20, false);

    expect(canDisablePlugin({ plugin: redis, plugins: [redis, chat], enabledPluginIds: ["redis", "lan-chat"] })).toBe(false);
    expect(canDisablePlugin({ plugin: chat, plugins: [redis, chat], enabledPluginIds: ["redis", "lan-chat"] })).toBe(true);
  });
});
