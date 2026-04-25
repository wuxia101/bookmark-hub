import type { SubmissionCreateRequest } from "@/shared/bookmarks";

function countChars(value: string): number {
  return Array.from(value).length;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }

  return value.trim();
}

export function validateDescription(value: string | null | undefined, field: string): string {
  const normalized = value?.trim() ?? "";
  if (countChars(normalized) > 100) {
    throw new Error(`${field} must be 100 characters or fewer`);
  }
  return normalized;
}

export function validateAliasText(value: string | null | undefined, field: string): string {
  const normalized = value?.trim() ?? "";
  if (countChars(normalized) > 200) {
    throw new Error(`${field} must be 200 characters or fewer`);
  }
  return normalized;
}

export function validateOptionalUrl(value: string | null | undefined, field: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error(`${field} must be a valid URL`);
  }
}

export function validateTagSlugs(tagSlugs: unknown): string[] {
  if (tagSlugs === undefined || tagSlugs === null) return [];
  if (!Array.isArray(tagSlugs)) {
    throw new Error("tagSlugs must be an array");
  }

  const cleaned = [...new Set(tagSlugs.map(tag => String(tag).trim()).filter(Boolean))];
  if (cleaned.length > 12) {
    throw new Error("tagSlugs cannot contain more than 12 items");
  }

  return cleaned;
}

export function validateSubmissionPayload(payload: unknown): SubmissionCreateRequest {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body must be a JSON object");
  }

  const input = payload as Record<string, unknown>;
  return {
    name: requireString(input.name, "name"),
    url: requireString(input.url, "url"),
    logoUrl: validateOptionalUrl(input.logoUrl as string | null | undefined, "logoUrl"),
    coverUrl: validateOptionalUrl(input.coverUrl as string | null | undefined, "coverUrl"),
    descriptionZh: validateDescription(input.descriptionZh as string | null | undefined, "descriptionZh"),
    descriptionEn: validateDescription(input.descriptionEn as string | null | undefined, "descriptionEn"),
    searchAliasesZh: validateAliasText(input.searchAliasesZh as string | null | undefined, "searchAliasesZh"),
    searchAliasesEn: validateAliasText(input.searchAliasesEn as string | null | undefined, "searchAliasesEn"),
    tagSlugs: validateTagSlugs(input.tagSlugs),
    enableAiEnrichment: input.enableAiEnrichment === undefined ? true : Boolean(input.enableAiEnrichment),
  };
}
