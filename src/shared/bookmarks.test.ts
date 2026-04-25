import { describe, expect, test } from "bun:test";
import { clampPage, clampPageSize, normalizeSearchMode, parseTagsParam } from "@/shared/bookmarks";

describe("bookmark helpers", () => {
  test("parses tags without duplicates", () => {
    expect(parseTagsParam("ai, tools,ai,,search")).toEqual(["ai", "tools", "search"]);
  });

  test("clamps paging safely", () => {
    expect(clampPage("0")).toBe(1);
    expect(clampPageSize("100", { pageSize: 24, maxPageSize: 60 })).toBe(60);
  });

  test("normalizes search mode", () => {
    expect(normalizeSearchMode("ai")).toBe("ai");
    expect(normalizeSearchMode("other")).toBe("standard");
  });
});
