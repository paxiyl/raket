import { useCallback, useEffect, useRef, useState } from "react";

import { probeHealth, type HealthResult } from "@/lib/health";

/**
 * Capped exponential backoff, with an overall ceiling.
 *
 * A Render free web service that has spun down takes tens of seconds to come
 * back, so the wait has to be patient. It also has to end: an indefinite
 * spinner is indistinguishable from a bug, and after two minutes the honest
 * answer is that something is wrong and here is a button.
 */
const DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000, 10_000, 10_000];
const OVERALL_LIMIT_MS = 120_000;
const PROBE_TIMEOUT_MS = 8_000;

export type WakeState = "waking" | "ready" | "failed";

export type ApiWake = {
  state: WakeState;
  /** How many probes have been sent in this round. */
  attempt: number;
  /** Whole seconds since this round started, for the copy on screen. */
  elapsedSeconds: number;
  /** The last thing the server said, when it said anything. */
  last: HealthResult | null;
  /** Start a fresh round. Safe to call while one is running. */
  retry: () => void;
};

/**
 * Polls `/health` until the API answers ready, then reports it once.
 *
 * `onReady` is what un-sticks the app: the queries that failed while the
 * service was asleep are refetched from there, rather than leaving the person
 * on a screen that is now merely out of date.
 */
export const useApiWake = (onReady: () => void): ApiWake => {
  const [state, setState] = useState<WakeState>("waking");
  const [attempt, setAttempt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [last, setLast] = useState<HealthResult | null>(null);
  const [round, setRound] = useState(0);

  // Read inside the effect without making it a dependency, so handing in an
  // inline arrow does not restart the polling on every render.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    setState("waking");
    setAttempt(0);
    setElapsedSeconds(0);

    const tick = setInterval(
      () => setElapsedSeconds(Math.round((Date.now() - startedAt) / 1000)),
      1_000,
    );

    const poll = async (index: number) => {
      if (cancelled) return;

      setAttempt(index + 1);

      const result = await probeHealth(PROBE_TIMEOUT_MS);

      if (cancelled) return;

      setLast(result);

      if (result.state === "ready") {
        setState("ready");
        onReadyRef.current();

        return;
      }

      if (Date.now() - startedAt >= OVERALL_LIMIT_MS) {
        setState("failed");

        return;
      }

      const delay = DELAYS_MS[Math.min(index, DELAYS_MS.length - 1)];
      timer = setTimeout(() => void poll(index + 1), delay);
    };

    void poll(0);

    return () => {
      cancelled = true;
      clearInterval(tick);
      if (timer) clearTimeout(timer);
    };
  }, [round]);

  const retry = useCallback(() => setRound((current) => current + 1), []);

  return { attempt, elapsedSeconds, last, retry, state };
};
