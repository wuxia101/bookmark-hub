import { config } from "@/server/config";
import { errorResponse, json } from "@/server/http";
import { validateSubmissionPayload } from "@/server/lib/validation";
import { searchBookmarks } from "@/server/services/searchService";
import { authenticateApiKey, submitBookmark } from "@/server/services/submissionService";
import { clampPage, clampPageSize, normalizeSearchMode, parseTagsParam } from "@/shared/bookmarks";

function getClientIp(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function handleBookmarkSearch(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const tags = parseTagsParam(url.searchParams.get("tags"));
    const page = clampPage(url.searchParams.get("page"));
    const pageSize = clampPageSize(url.searchParams.get("pageSize"), {
      pageSize: config.pageSize,
      maxPageSize: config.maxPageSize,
    });
    const searchMode = normalizeSearchMode(url.searchParams.get("searchMode"));

    const response = await searchBookmarks({
      q,
      tags,
      page,
      pageSize,
      searchMode,
    });

    return json(response);
  } catch (error) {
    return errorResponse(500, "Failed to search bookmarks", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function handleBookmarkSubmission(request: Request): Promise<Response> {
  try {
    const apiKey = getBearerToken(request);
    const client = await authenticateApiKey(apiKey);
    if (!client) {
      return errorResponse(401, "Invalid API key");
    }

    const payload = validateSubmissionPayload(await request.json());
    const response = await submitBookmark(payload, client.name, getClientIp(request));
    return json(response, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /required|valid|characters|tagSlugs|invalid url|http\/https/i.test(message) ? 400 : 500;
    return errorResponse(status, message);
  }
}
