/**
 * The readiness probe, outside the versioned API surface.
 *
 * `/health` is mounted at the API's root, before the rate limiter, so a
 * cold-start probe never spends a customer's request budget. That is why this
 * does not go through the axios instance in `axios-client.ts` — whose baseURL
 * is the versioned path, and whose interceptors would turn an expected 503
 * from a still-connecting service into a thrown error — and why it is not in
 * `lib/api.ts` with the endpoint functions.
 */
const DEV_FALLBACK = "http://localhost:8000/api/v1";

/**
 * Whether this build was given an API address at all.
 *
 * The fallback below is right for a laptop and wrong for every APK: a release
 * built without `EXPO_PUBLIC_API_URL` points at the phone's own localhost,
 * where nothing is listening, and the only symptom is that the whole app
 * cannot reach Raket. `app.config.ts` refuses an EAS release build in that
 * state; this is for the ones built by hand, so the warm-up screen can say
 * what is actually wrong instead of blaming the customer's connection.
 */
export const API_URL_CONFIGURED = Boolean(process.env.EXPO_PUBLIC_API_URL);

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? DEV_FALLBACK;

/** `https://host/api/v1` → `https://host/health`. */
export const HEALTH_URL = `${API_BASE.replace(/\/api\/v1\/?$/, "")}/health`;

export type HealthResult =
  | { state: "ready"; database: string }
  /** Reachable, but not able to serve — no database. */
  | { state: "degraded"; database: string }
  /** Nothing answered: asleep, starting, or no connection on this phone. */
  | { state: "unreachable" };

/**
 * One attempt, with its own ceiling.
 *
 * An `AbortController` and a timer rather than `AbortSignal.timeout`, which is
 * not in every Hermes build this app ships on — and a probe that throws
 * `TypeError: AbortSignal.timeout is not a function` on exactly the devices
 * with the slowest networks would be worse than no probe at all.
 */
export const probeHealth = async (timeoutMs = 8_000): Promise<HealthResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal });

    if (response.ok) {
      const body = (await response.json()) as { database?: string };

      return { database: body.database ?? "connected", state: "ready" };
    }

    if (response.status === 503) {
      const body = (await response.json().catch(() => ({}))) as { database?: string };

      return { database: body.database ?? "unknown", state: "degraded" };
    }

    // Anything else answered that is not this API — a proxy error page, most
    // likely. Treated as not-there rather than as healthy.
    return { state: "unreachable" };
  } catch {
    return { state: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
};
