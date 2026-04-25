import { describe, expect, test } from "bun:test";
import { validateSubmissionPayload } from "@/server/lib/validation";

describe("validateSubmissionPayload", () => {
  test("accepts valid payloads", () => {
    const payload = validateSubmissionPayload({
      name: "BookmarkHub",
      url: "https://bookmarkhub.test",
      descriptionZh: "中文简介",
      descriptionEn: "English summary",
      tagSlugs: ["tools", "search"],
    });

    expect(payload.name).toBe("BookmarkHub");
    expect(payload.tagSlugs).toEqual(["tools", "search"]);
  });

  test("rejects long descriptions", () => {
    expect(() =>
      validateSubmissionPayload({
        name: "BookmarkHub",
        url: "https://bookmarkhub.test",
        descriptionZh: "超".repeat(101),
      }),
    ).toThrow("descriptionZh must be 100 characters or fewer");
  });
});
