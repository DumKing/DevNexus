import { beforeEach, describe, expect, it } from "vitest";

import { clearRegistry, getAll, register } from "@/app/plugin-registry/registry";
import { apiDebuggerPlugin } from "@/plugins/api-debugger";
import { lanChatPlugin } from "@/plugins/lan-chat";
import { mqClientPlugin } from "@/plugins/mq-client";
import { networkToolsPlugin } from "@/plugins/network-tools";
import { getSidebarPlugins } from "@/app/plugin-registry/visibility";

describe("network tools plugin manifest", () => {
  beforeEach(() => {
    clearRegistry();
  });

  it("can be registered in the plugin registry", () => {
    register(networkToolsPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["network-tools"]);
  });

  it("registers the api debugger plugin manifest", () => {
    register(apiDebuggerPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["api-debugger"]);
  });

  it("registers the mq client plugin manifest", () => {
    register(mqClientPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["mq-client"]);
  });

  it("registers LAN Chat as a floating plugin manifest outside the sidebar", () => {
    register(lanChatPlugin);

    expect(getAll().map((plugin) => plugin.id)).toEqual(["lan-chat"]);
    expect(getSidebarPlugins(getAll()).map((plugin) => plugin.id)).toEqual([]);
  });
});
