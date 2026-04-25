import { runMigrations } from "@/server/db/migrations";

async function main() {
  await runMigrations();
  console.log("[BookmarkHub] migrations complete");
}

main().catch(error => {
  console.error("[BookmarkHub] migration failed", error);
  process.exit(1);
});
