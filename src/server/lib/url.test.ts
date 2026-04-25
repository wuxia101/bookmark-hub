import { describe, expect, test } from "bun:test";
import { normalizeUrl } from "@/server/lib/url";

describe("normalizeUrl", () => {
  test("normalizes scheme host and tracking params", () => {
    const result = normalizeUrl("Example.com/path/?utm_source=x&b=2&a=1#hello");
    expect(result.url).toBe("https://example.com/path?a=1&b=2");
    expect(result.normalizedUrl).toBe("https://example.com/path?a=1&b=2");
  });

  test("rejects unsupported protocols", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow("Only http/https URLs are supported");
  });
});
