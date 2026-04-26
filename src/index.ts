import index from "./index.html";
import { handleAdminReviewDecision, handleAdminReviewList } from "@/server/routes/admin";
import { handleAdminFindSimilar } from "@/server/routes/similar";
import { handleBookmarkSearch, handleBookmarkSubmission } from "@/server/routes/bookmarks";

function resolvePort(value: string | undefined): number {
  const parsed = Number(value ?? 3000);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3000;
  return Math.floor(parsed);
}

const server = Bun.serve({
  hostname: process.env.HOST || "0.0.0.0",
  port: resolvePort(process.env.PORT),
  routes: {
    "/api/bookmarks/search": { GET: handleBookmarkSearch },
    "/api/bookmarks/submissions": { POST: handleBookmarkSubmission },
    "/api/admin/reviews": { GET: handleAdminReviewList },
    "/api/admin/reviews/decision": { POST: handleAdminReviewDecision },
    "/api/admin/similar-sites": { POST: handleAdminFindSimilar },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`[BookmarkHub] server running at ${server.url}`);
