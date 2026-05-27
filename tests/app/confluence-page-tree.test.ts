import { describe, expect, it } from "vitest";

import { buildConfluenceTreeNodes, historyToEditorDraft } from "@/plugins/confluence/utils/page-tree";
import type { ConfluencePublishHistory, PageInfo, SpaceInfo } from "@/plugins/confluence/types";

describe("confluence page tree utilities", () => {
  it("builds lazy tree nodes for spaces and selected pages", () => {
    const spaces: SpaceInfo[] = [{ key: "DEV", name: "Development" }];
    const pagesByParent: Record<string, PageInfo[]> = {
      "space:DEV": [{ id: "1", title: "Root", version: 2, spaceKey: "DEV" }],
      "page:1": [{ id: "2", title: "Child", version: 1, spaceKey: "DEV" }],
    };

    const nodes = buildConfluenceTreeNodes(spaces, pagesByParent, "1");

    expect(nodes[0].key).toBe("space:DEV");
    expect(nodes[0].children?.[0].key).toBe("page:1");
    expect(nodes[0].children?.[0].children?.[0].title).toBe("Child");
  });

  it("loads a publish history record back into an editor draft", () => {
    const record: ConfluencePublishHistory = {
      id: "h1",
      connectionId: "c1",
      spaceKey: "DEV",
      pageId: "p1",
      pageTitle: "Saved Page",
      pageVersion: 3,
      parentId: "parent",
      parentTitle: "Parent",
      action: "create",
      filePath: "D:/docs/a.md",
      markdownContent: "# Saved Page\n\nbody",
      publishedAt: "2026-05-26T00:00:00Z",
    };

    expect(historyToEditorDraft(record)).toEqual({
      markdownContent: "# Saved Page\n\nbody",
      filePath: "D:/docs/a.md",
      pageId: "p1",
      pageTitle: "Saved Page",
      spaceKey: "DEV",
      version: 3,
    });
  });
});
