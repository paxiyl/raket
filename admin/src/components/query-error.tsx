import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/axios-client";

type Props = {
  /** What failed, in the operator's words: "the dashboard", "orders". */
  what: string;
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
};

/**
 * A load that failed, said out loud.
 *
 * Every card on the dashboard takes `isLoading` and a possibly-undefined
 * payload, and draws its zero state when the payload is missing. That is
 * correct for a quiet Tuesday and wrong for a failed request, because the two
 * are indistinguishable on screen: a dashboard reporting ₹0 revenue and "no
 * orders yet" is what an administrator sees when the API is erroring, and
 * acting on that figure is worse than seeing nothing at all.
 *
 * So this sits above the cards rather than replacing them. The stale or empty
 * figures stay visible — sometimes the previous load is still useful — with an
 * unambiguous banner saying they are not current, and a button.
 *
 * The message comes from the API's error body when there is one. A transport
 * failure says so in `axios-client.ts`; it is never a raw exception string,
 * and never a stack.
 */
export function QueryError({ what, error, onRetry, isRetrying = false }: Props) {
  const message =
    error instanceof ApiError
      ? error.message
      : `Something went wrong loading ${what}. Please try again.`;

  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3">
          <TriangleAlertIcon className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />

          <div className="flex flex-col gap-0.5">
            <p className="font-medium">We could not load {what}</p>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
        </div>

        <Button disabled={isRetrying} onClick={onRetry} size="sm" variant="outline">
          <RefreshCwIcon data-icon="inline-start" />
          {isRetrying ? "Retrying…" : "Try again"}
        </Button>
      </CardContent>
    </Card>
  );
}
