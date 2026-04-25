const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "fbclid",
] as const;

export function normalizeUrl(input: string): { url: string; normalizedUrl: string } {
  const candidate = input.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(candidate) ? candidate : `https://${candidate}`;
  const url = new URL(withProtocol);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  for (const key of TRACKING_PARAMS) {
    url.searchParams.delete(key);
  }

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  }

  url.searchParams.sort();

  const normalized = new URL(url.toString());
  normalized.protocol = "https:";
  const normalizedUrl = normalized.toString().replace(/\/$/, normalized.pathname === "/" && normalized.search ? "" : "/");

  return {
    url: url.toString(),
    normalizedUrl,
  };
}
