import { config } from "@/server/config";
import { errorResponse, json } from "@/server/http";
import { validateSimilarSiteImportPayload } from "@/server/lib/validation";
import { importSimilarSites, isFindSimilarAvailable } from "@/server/services/similarSiteService";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

export async function handleAdminFindSimilar(request: Request): Promise<Response> {
  try {
    if (!config.reviewApiKey) {
      return errorResponse(503, "Review API is not configured");
    }
    const apiKey = getBearerToken(request);
    if (!apiKey || apiKey !== config.reviewApiKey) {
      return errorResponse(401, "Invalid review API key");
    }
    if (!isFindSimilarAvailable()) {
      return errorResponse(503, "Find similar is not configured");
    }

    const payload = validateSimilarSiteImportPayload(await request.json());
    return json(await importSimilarSites(payload.siteId, "review-api-find-similar"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /siteId|required|configured|not found|valid/i.test(message) ? 400 : 500;
    return errorResponse(status, message);
  }
}
