import { describe, expect, it } from "vitest";

import { pluginLabel, translate } from "@/app/i18n";

describe("i18n utilities", () => {
  it("translates built-in UI labels", () => {
    expect(translate("zh-CN", "app.settings")).toBe("设置");
    expect(translate("en-US", "app.settings")).toBe("Settings");
  });

  it("interpolates parameters", () => {
    expect(translate("zh-CN", "updates.latestContent", { latest: "v1", current: "v0" })).toContain("v1");
  });

  it("uses plugin-specific labels with a fallback", () => {
    expect(pluginLabel("zh-CN", "network-tools", "Network")).toBe("网络诊断");
    expect(pluginLabel("zh-CN", "unknown-plugin", "Unknown")).toBe("Unknown");
  });
});
