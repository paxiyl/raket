import mongoose from "mongoose";

import { logger } from "../utils/logger";
import { Env } from "./env.config";

/**
 * Defence in depth against query-selector injection: filters can never carry
 * operators that did not come from server code. Set before the first query.
 */
mongoose.set("sanitizeFilter", true);

/**
 * Losing the database later, said out loud.
 *
 * The connection is made once at boot and then never mentioned again, so an
 * Atlas failover — or a free-tier network blip — turned every request into a
 * timeout with nothing in the log between "Database connected" at startup and
 * the errors. `/health` reports the same state as a 503, which is what takes
 * the instance out of rotation; this is what tells whoever is reading the log
 * why.
 *
 * Registered once, before connecting. Mongoose reconnects on its own, so these
 * are observations, not recovery.
 */
let eventsAttached = false;
/** Set by `disconnectDatabase`, so a deliberate shutdown is not reported as a fault. */
let shuttingDown = false;

const attachConnectionEvents = () => {
  if (eventsAttached) return;

  eventsAttached = true;

  mongoose.connection.on("disconnected", () => {
    if (shuttingDown) return;

    logger.warn("Database connection lost — requests will fail until it reconnects");
  });

  mongoose.connection.on("reconnected", () => logger.info("Database reconnected"));

  // Never the error object wholesale: a driver error can carry the connection
  // string, credentials and all, and this is a line in a hosting log.
  mongoose.connection.on("error", (error: unknown) =>
    logger.error("Database error", {
      error: error instanceof Error ? error.name : "Unknown error",
    }),
  );
};

export const connectDatabase = async (): Promise<void> => {
  attachConnectionEvents();

  try {
    const connection = await mongoose.connect(Env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10_000,
    });

    logger.info("Database connected", { host: connection.connection.host });
  } catch (error) {
    logger.error("Database connection failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  shuttingDown = true;
  await mongoose.disconnect();
  logger.info("Database disconnected");
};
