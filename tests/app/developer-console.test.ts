import { describe, expect, it } from "vitest";

import { appendDevLog, devLogLevelColor } from "@/app/developer-console/utils";
import type { DevLogEntry } from "@/app/developer-console/types";

const entry = (id: string): DevLogEntry => ({
  id,
  timestamp: "2026-05-14T00:00:00Z",
  level: "info",
  scope: "test",
  message: id,
});

describe("developer console utilities", () => {
  it("keeps the newest log entries inside the configured limit", () => {
    expect(appendDevLog([entry("1"), entry("2")], entry("3"), 2).map((item) => item.id)).toEqual(["2", "3"]);
  });

  it("maps log levels to stable tag colors", () => {
    expect(devLogLevelColor("error")).toBe("red");
    expect(devLogLevelColor("warn")).toBe("orange");
    expect(devLogLevelColor("debug")).toBe("blue");
    expect(devLogLevelColor("info")).toBe("green");
  });
});
