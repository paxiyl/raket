import { useQueryClient } from "@tanstack/react-query";
import { PlugZapIcon, RefreshCwIcon, ServerCrashIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Wordmark } from "@/components/wordmark";
import { useApiWake } from "@/features/system/use-api-wake";
import { HEALTH_URL } from "@/lib/health";

/** Held while /auth/me decides whether there is a session. */
export function SessionLoading() {
  return (
    <div className="flex flex-col gap-4 min-h-svh items-center justify-center bg-background">
      <Wordmark
      className="text-primary"
      size="lg"
      />
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );
}

/**
 * Shown when /auth/me failed for a reason that is not an answer.
 *
 * A 401 is an answer — it means signed out, and the guard sends you to login.
 * A transport failure or a 503 is not: the service is asleep, restarting, or
 * its database has dropped, and treating that as "signed out" is how an
 * administrator gets a login form, types the right password, and is told the
 * API cannot be reached. So those two land here instead, where the real reason
 * is on screen and the page recovers by itself once the service answers.
 *
 * An honest note about the limit of this, because it is easy to oversell: in
 * the production topology the API serves this very HTML. If it is fully asleep,
 * the browser has nothing to render and shows its own error page — no React
 * screen can appear before the first response arrives. What this covers is
 * everything after that: the service going to sleep or restarting while the tab
 * is open, a database drop, and a deployment where the admin is hosted
 * separately from the API.
 */
export function ApiWakingScreen() {
  const queryClient = useQueryClient();
  const wake = useApiWake(() => void queryClient.invalidateQueries());

  const degraded = wake.last?.state === "degraded";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <Wordmark className="text-primary" size="lg" />

      {wake.state === "failed" ? (
        <>
          <ServerCrashIcon className="text-muted-foreground size-10" aria-hidden />

          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-xl font-semibold">We can't reach the Raket API</h1>
            <p className="text-muted-foreground text-sm">
              {degraded
                ? "The service is answering but its database is not connected yet. Nothing has been lost — give it a moment and try again."
                : "The service did not answer for two minutes. It may be starting up, redeploying, or down."}
            </p>
            <p className="text-muted-foreground text-xs">
              Checked <code className="font-mono">{HEALTH_URL}</code> · {wake.attempt}{" "}
              {wake.attempt === 1 ? "attempt" : "attempts"}
            </p>
          </div>

          <Button onClick={wake.retry}>
            <RefreshCwIcon data-icon="inline-start" />
            Try again
          </Button>
        </>
      ) : (
        <>
          <PlugZapIcon className="text-primary size-10" aria-hidden />

          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-xl font-semibold">
              {degraded ? "Almost there…" : "Waking up our servers"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {degraded
                ? "The API is up and connecting to its database."
                : "This can take a little longer after a quiet spell. We'll carry on as soon as it answers."}
            </p>
          </div>

          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner className="size-4" />
            {wake.elapsedSeconds}s
          </div>

          {/* A way out before the two minutes are up, for an operator who
              already knows the service is not coming back. */}
          <Button onClick={wake.retry} size="sm" variant="ghost">
            <RefreshCwIcon data-icon="inline-start" />
            Check now
          </Button>
        </>
      )}
    </div>
  );
}
