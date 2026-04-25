import index from "./index.html";
import { handleBookmarkSearch, handleBookmarkSubmission } from "@/server/routes/bookmarks";

const server = Bun.serve({
  routes: {
    "/api/bookmarks/search": { GET: handleBookmarkSearch },
    "/api/bookmarks/submissions": { POST: handleBookmarkSubmission },
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`[BookmarkHub] server running at ${server.url}`);
