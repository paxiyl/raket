/**
 * The readiness probe, outside the versioned API surface.
 *
 * `/health` is not under `/api/v1` — it is mounted at the root, before the
 * rate limiter, so a platform health check and a cold-start probe never spend
 * a client's request budget. That is why this does not go through the axios
 * instance in `axios-client.ts`, whose `baseURL` is the versioned path, and
 * why it is not listed in `lib/api.ts` with the endpoint functions.
 */
const apiBase =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api/v1" : "http://localhost:8000/api/v1");

/** `/api/v1` → ``, `https://host/api/v1` → `https://host`. */
export const HEALTH_URL = `${apiBase.replace(/\/api\/v1\/?$/, "")}/health`;

export type HealthResult =
  | { state: "ready"; database: string }
  /** Reachable, but not able to serve — no database. */
  | { state: "degraded"; database: string }
  /** Nothing answered: asleep, starting, or genuinely down. */
  | { state: "unreachable" };

/**
 * One attempt, with its own ceiling.
 *
 * `fetch`, not axios: this must not pick up the instance's interceptors, which
 * turn every non-2xx into a thrown `ApiError` — a 503 from a waking service is
 * an expected answer here, not a failure.
 */
export const probeHealth = async (timeoutMs = 8_000): Promise<HealthResult> => {
  try {
    const response = await fetch(HEALTH_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      const body = (await response.json()) as { database?: string };

      return { database: body.database ?? "connected", state: "ready" };
    }

    if (response.status === 503) {
      const body = (await response.json().catch(() => ({}))) as { database?: string };

      return { database: body.database ?? "unknown", state: "degraded" };
    }

    // Any other status means something answered that is not this API — a proxy
    // error page, usually. Treated as not-there rather than as healthy.
    return { state: "unreachable" };
  } catch {
    return { state: "unreachable" };
  }
};
