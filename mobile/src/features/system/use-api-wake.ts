import { useCallback, useEffect, useState } from "react";

import { openApiGate } from "@/lib/api-gate";
import { probeHealth, type HealthResult } from "@/lib/health";

/*
  Capped exponential backoff with an overall ceiling.

  A Render free web service that has spun down takes tens of seconds to come
  back, so the wait has to be patient — a 10-second timeout here would declare
  a healthy deployment broken every single morning. It also has to end: a
  spinner with no limit is indistinguishable from a crash, and after two
  minutes the honest answer is that something is wrong and here is a button.

  Capped at 10s between probes rather than doubling forever, so a service that
  comes back at 70 seconds is noticed at 70 seconds and not at 120.
*/
const DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000, 10_000, 10_000];
const OVERALL_LIMIT_MS = 120_000;
const PROBE_TIMEOUT_MS = 8_000;

/** How long to wait before the screen admits it is waiting, to avoid a flash. */
export const WAKE_REVEAL_MS = 700;

export type WakeState = "waking" | "ready" | "failed";

export type ApiWake = {
  state: WakeState;
  attempt: number;
  elapsedSeconds: number;
  /** The last thing the server said, when it said anything. */
  last: HealthResult | null;
  /** Start a fresh round. */
  retry: () => void;
};

/**
 * Probes the API until it answers ready, and opens the request gate either way.
 *
 * The gate is what keeps the rest of the app from firing its queries into a
 * sleeping service; opening it on failure as well as success is what keeps a
 * failed check from trapping anybody — see `lib/api-gate.ts`.
 */
export const useApiWake = (): ApiWake => {
  const [state, setState] = useState<WakeState>("waking");
  const [attempt, setAttempt] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [last, setLast] = useState<HealthResult | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

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
        openApiGate();

        return;
      }

      if (Date.now() - startedAt >= OVERALL_LIMIT_MS) {
        setState("failed");
        // Let the app through to its own error and retry states rather than
        // holding every request behind a gate that is not going to open.
        openApiGate();

        return;
      }

      const delay = DELAYS_MS[Math.min(index, DELAYS_MS.length - 1)];
      timer = setTimeout(() => void poll(index + 1), delay);
    };

    /*
      On a timer rather than called straight out of the effect body. `poll`
      sets state before its first await, and a setState run synchronously
      inside an effect is a cascading render — which `react-hooks` is right to
      refuse: this effect starts an external process, and the state it reports
      belongs in that process's callbacks.
    */
    timer = setTimeout(() => void poll(0), 0);

    return () => {
      cancelled = true;
      clearInterval(tick);
      if (timer) clearTimeout(timer);
    };
  }, [round]);

  /**
   * A fresh round, with the counters reset HERE rather than in the effect — an
   * event handler is where a reset belongs, and it is the only thing that
   * starts a second round.
   */
  const retry = useCallback(() => {
    setState("waking");
    setAttempt(0);
    setElapsedSeconds(0);
    setLast(null);
    setRound((current) => current + 1);
  }, []);

  return { attempt, elapsedSeconds, last, retry, state };
};
