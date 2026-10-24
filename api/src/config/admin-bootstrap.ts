import { UserModel } from "../models/user.model";
import { getSettings } from "../services/settings.service";
import { logger } from "../utils/logger";
import { Env } from "./env.config";

/**
 * Creating the first administrator from environment variables, at boot.
 *
 * `npm run seed:admin` is the right tool when you have a shell. On a free
 * hosting plan you do not: Render's shell is a paid feature, so a
 * phone-only operator had no way to create the one account that makes the
 * backoffice usable — the service would deploy perfectly and there would be
 * nothing to sign in as.
 *
 * So the same job, through the one interface that is always available: the
 * dashboard's environment settings. Set both variables, deploy, sign in,
 * then DELETE them.
 *
 * Deliberate limits, because a bootstrap path that creates accounts is exactly
 * the kind of convenience that becomes a hole:
 *
 * - Both variables must be set. One alone does nothing and says so.
 * - The password must be at least 12 characters, and must not be this
 *   repository's committed demo password.
 * - It never prints the password, and never the email's password field.
 * - It warns on EVERY boot while the variables are still set, because a
 *   password left sitting in a dashboard is a password that leaks with the
 *   dashboard.
 * - A failure here is logged and swallowed. The API must still start: a typo
 *   in an optional variable is not a reason for the whole service to be down.
 *
 * It is idempotent in the sense that matters: run twice with the same values
 * and you get the same account. Run it with a new password and the password
 * changes — which is also the recovery path when the first one is forgotten.
 */

const MINIMUM_PASSWORD_LENGTH = 12;
const COMMITTED_DEMO_PASSWORD = "chowly12345";

export const bootstrapAdminFromEnv = async (): Promise<void> => {
  const email = Env.ADMIN_BOOTSTRAP_EMAIL.trim().toLowerCase();
  const password = Env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = Env.ADMIN_BOOTSTRAP_NAME.trim() || "Raket Admin";

  if (!email && !password) return;

  if (!email || !password) {
    logger.warn(
      "Admin bootstrap skipped: set BOTH ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD, or neither",
    );

    return;
  }

  if (password === COMMITTED_DEMO_PASSWORD) {
    logger.error(
      "Admin bootstrap refused: that is this repository's committed demo password, so it is public. Choose your own.",
    );

    return;
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    logger.error("Admin bootstrap refused: the password is too short", {
      minimumLength: MINIMUM_PASSWORD_LENGTH,
    });

    return;
  }

  try {
    const existing = await UserModel.findOne({ email }).exec();

    if (existing) {
      existing.name = name;
      existing.role = "admin";
      existing.isActive = true;
      // Assigned, not hashed here: the model's pre-save hook does that.
      existing.password = password;

      await existing.save();
      logger.info("Admin bootstrap updated an existing account", { email });
    } else {
      await UserModel.create({ email, name, password, role: "admin" });
      logger.info("Admin bootstrap created an admin", { email });
    }

    // The platform settings document, so rider pay rates are editable at once.
    // Same thing `seed:admin` does, for the same reason.
    await getSettings();

    logger.warn(
      "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are still set. Sign in, then DELETE them from this service's environment settings — a password left in a dashboard leaks with the dashboard.",
    );
  } catch (error) {
    // Logged and swallowed: an optional convenience must not keep the API down.
    logger.error("Admin bootstrap failed", {
      email,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
