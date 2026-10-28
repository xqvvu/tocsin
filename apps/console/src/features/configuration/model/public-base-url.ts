/**
 * Reachability class of the notification link base URL.
 *
 * `tocsin.eventUrl` is built from `SERVER_URL` (falling back to
 * `BETTER_AUTH_URL`). A missing value renders an empty link, and the Compose
 * default `http://localhost:3000` renders a link only the host itself can
 * open; both are silent failures from the recipient's point of view, so the
 * settings screen distinguishes them from a usable public origin.
 */
export type PublicBaseUrlState = "missing" | "local" | "public";

export function classifyPublicBaseUrl(value: string | null): PublicBaseUrlState {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "missing";
  }

  let hostname: string;

  try {
    hostname = new URL(trimmed).hostname;
  } catch {
    // The environment schema validates absolute URLs, so this only guards
    // against a hand-built value in a test or a future caller.
    return "missing";
  }

  return isLocalHostname(hostname) ? "local" : "public";
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "::" ||
    host === "0.0.0.0" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}
