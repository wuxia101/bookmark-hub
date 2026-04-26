import { config } from "@/server/config";

function normalizePatterns(raw: string) {
  return raw
    .split(/[,\s]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
}

function matchesPattern(scope: string, pattern: string) {
  if (!pattern) return false;
  if (pattern === "*" || pattern === "true" || pattern === "all" || pattern === "debug") return true;

  const normalizedScope = scope.toLowerCase();
  const normalizedPattern = pattern.endsWith(":*") ? pattern.slice(0, -2) : pattern;
  if (normalizedScope === normalizedPattern) return true;
  if (normalizedScope.startsWith(`${normalizedPattern}:`)) return true;
  return pattern.endsWith("*") && normalizedScope.startsWith(pattern.slice(0, -1));
}

export function isDebugEnabled(scope: string) {
  const patterns = normalizePatterns(config.debug);
  if (!patterns.length) return false;
  return patterns.some(pattern => matchesPattern(scope, pattern));
}

export function debugLog(scope: string, ...args: unknown[]) {
  if (!isDebugEnabled(scope)) return;
  console.log(`[BookmarkHub][${scope}]`, ...args);
}
