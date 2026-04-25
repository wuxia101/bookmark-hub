import { db } from "@/server/db/client";

type ApiClientRow = {
  id: number | bigint;
  name: string;
  key_hash: string;
  is_active: boolean;
};

export async function findActiveApiClientByHash(keyHash: string): Promise<{ id: number; name: string } | null> {
  const [row] = await db<ApiClientRow[]>`
    SELECT id, name, key_hash, is_active
    FROM api_clients
    WHERE key_hash = ${keyHash} AND is_active = TRUE
    LIMIT 1
  `;

  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
  };
}
