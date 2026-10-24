/**
 * One gate every API request waits behind at launch, opened once the warm-up
 * has an answer.
 *
 * The problem it solves is the shape of a cold start on a free hosting tier.
 * The home screen alone opens banners, categories, product rails, stores and
 * restaurants, and the session restore runs alongside them — so a service that
 * has spun down turns one slow wake-up into six or seven simultaneous
 * failures, each one a screen full of "Can't reach Raket" that the customer
 * has to retry by hand, several of them behind tabs they have not opened yet.
 * Retrying per query makes it worse: the same sleeping service gets hit
 * eighteen times while it boots.
 *
 * So the requests are made to wait rather than to fail. The warm-up probes
 * `/health` on its own (through `fetch`, not this instance, so there is no
 * deadlock), and opens the gate when it knows.
 *
 * It opens on FAILURE too, and that is deliberate: a customer whose network is
 * genuinely down must still reach the app, see its normal error states and be
 * able to retry. A gate that only opened on success would be a blank screen
 * with no way out — exactly the trap it exists to prevent.
 *
 * What this is NOT: a retry. Nothing here re-sends a request, so no order and
 * no payment can be submitted twice by it. A request held at the gate is a
 * request that has not been sent yet.
 */

type Resolver = () => void;

let open = false;
let resolvers: Resolver[] = [];

/** Resolved immediately once the gate is open, so the steady-state cost is nil. */
export const waitForApi = (): Promise<void> => {
  if (open) return Promise.resolve();

  return new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });
};

/** Called by the warm-up once it has an answer — ready or not. */
export const openApiGate = (): void => {
  if (open) return;

  open = true;

  const waiting = resolvers;
  resolvers = [];
  waiting.forEach((resolve) => resolve());
};

export const isApiGateOpen = (): boolean => open;

/**
 * Only for the checks and for a fresh retry round in development. Production
 * code opens the gate once per launch and leaves it open: closing it again
 * would park in-flight screens behind a probe they did not ask for.
 */
export const resetApiGate = (): void => {
  open = false;
  resolvers = [];
};
