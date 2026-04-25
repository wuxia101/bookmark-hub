const databaseUrl =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.PGURL ?? process.env.PG_URL ?? "";

export const db = databaseUrl ? new Bun.SQL(databaseUrl) : Bun.sql;
