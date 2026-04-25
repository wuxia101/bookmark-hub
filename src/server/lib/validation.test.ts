import { describe, expect, test } from "bun:test";
import { validateReviewDecisionPayload, validateSubmissionPayload } from "@/server/lib/validation";

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

  test("validates review decisions", () => {
    const payload = validateReviewDecisionPayload({
      siteId: 12,
      decision: "approved",
      name: "BookmarkHub",
      url: "https://bookmarkhub.test",
      tagSlugs: ["tools"],
      reviewNote: "looks good",
    });

    expect(payload.siteId).toBe(12);
    expect(payload.decision).toBe("approved");
    expect(payload.tagSlugs).toEqual(["tools"]);
  });
});
