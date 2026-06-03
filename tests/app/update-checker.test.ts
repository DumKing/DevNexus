import { describe, expect, it } from "vitest";

import { compareVersions, isNewerVersion, normalizeVersion } from "@/app/update-checker/update-checker";

describe("update checker utilities", () => {
  it("normalizes plain and tagged versions", () => {
    expect(normalizeVersion("v0.10.1")).toEqual([0, 10, 1]);
    expect(normalizeVersion("0.9.2")).toEqual([0, 9, 2]);
  });

  it("compares semantic versions with v prefixes", () => {
    expect(compareVersions("v0.10.1", "0.10.0")).toBe(1);
    expect(compareVersions("v0.10.0", "0.10.0")).toBe(0);
    expect(compareVersions("v0.9.2", "0.10.0")).toBe(-1);
    expect(isNewerVersion("v0.10.1", "0.10.0")).toBe(true);
  });
});
