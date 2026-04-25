import { config } from "@/server/config";
import { errorResponse, json } from "@/server/http";
import { validateReviewDecisionPayload } from "@/server/lib/validation";
import { applyReviewDecision, getReviewQueue } from "@/server/services/reviewService";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function ensureReviewConfigured() {
  if (!config.reviewApiKey) {
    throw new Error("Review API is not configured");
  }
}

function requireReviewAuth(request: Request): boolean {
  const apiKey = getBearerToken(request);
  return Boolean(config.reviewApiKey) && apiKey === config.reviewApiKey;
}

export async function handleAdminReviewList(request: Request): Promise<Response> {
  try {
    ensureReviewConfigured();
    if (!requireReviewAuth(request)) {
      return errorResponse(401, "Invalid review API key");
    }

    return json(await getReviewQueue());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(/not configured/i.test(message) ? 503 : 500, message);
  }
}

export async function handleAdminReviewDecision(request: Request): Promise<Response> {
  try {
    ensureReviewConfigured();
    if (!requireReviewAuth(request)) {
      return errorResponse(401, "Invalid review API key");
    }

    const payload = validateReviewDecisionPayload(await request.json());
    return json(await applyReviewDecision(payload, "review-api"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /required|valid|characters|tagSlugs|invalid url|approved|rejected|siteId|pending_review/i.test(message)
      ? 400
      : /not configured/i.test(message)
        ? 503
        : 500;
    return errorResponse(status, message);
  }
}
