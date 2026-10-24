import { connectDatabase, disconnectDatabase } from "../config/database.config";
import { UserModel } from "../models/user.model";
import { getSettings } from "../services/settings.service";
import { logger } from "../utils/logger";

/**
 * Creates the admin account and makes sure the platform settings document
 * exists, so the rider pay rates are editable straight away.
 *
 * Run with: npm run seed:admin
 */

/**
 * Pass your own and nothing is left at a default:
 *
 *   npm run seed:admin -- --email you@example.com --password "something long"
 *
 * Without arguments it falls back to the demo account below, whose password is
 * committed in this repository and therefore public. That is fine on a laptop,
 * and in production this script refuses to run at all without both arguments —
 * see `refuseUnsafeProduction` below.
 */
const arg = (flag: string): string | undefined => {
  const index = process.argv.indexOf(`--${flag}`);

  return index === -1 ? undefined : process.argv[index + 1];
};

const DEFAULTS = {
  email: "admin@chowly.app",
  name: "Chowly Admin",
  password: "chowly12345",
};

const ADMIN = {
  email: (arg("email") ?? DEFAULTS.email).trim().toLowerCase(),
  name: arg("name") ?? DEFAULTS.name,
  password: arg("password") ?? DEFAULTS.password,
};

const usingDefaults = ADMIN.password === DEFAULTS.password;

const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * In production this script will not create a known-password admin.
 *
 * The warning it used to print afterwards was accurate and useless: the
 * account already existed, with a password anybody who can read this
 * repository can type, on a deployment with a public URL. And because the
 * script UPDATES a matching email rather than skipping it, re-running it on a
 * live database would quietly reset a real administrator's password back to
 * the committed one.
 *
 * So the refusal happens before the database is even opened, and it names the
 * command to run instead. Nothing is printed but the email — never the
 * password, so the credential does not end up in a deploy log, a scrollback,
 * or a screenshot of one.
 */
const refuseUnsafeProduction = () => {
  if (process.env.NODE_ENV !== "production") return;

  const reasons: string[] = [];

  if (arg("email") === undefined) reasons.push("--email was not given");
  if (arg("password") === undefined) reasons.push("--password was not given");
  if (usingDefaults) reasons.push("the password is this repository's committed demo password");
  if (ADMIN.email === DEFAULTS.email) reasons.push("the email is the demo account's address");
  if (!usingDefaults && ADMIN.password.length < MINIMUM_PASSWORD_LENGTH) {
    reasons.push(`the password is shorter than ${MINIMUM_PASSWORD_LENGTH} characters`);
  }

  if (reasons.length === 0) return;

  console.error(
    [
      "",
      "Refusing to seed an admin in production:",
      ...reasons.map((reason) => `  - ${reason}`),
      "",
      "Run it with credentials of your own:",
      "",
      '  NODE_ENV=production npm run seed:admin -- --email you@example.com --password "<a long unique password>"',
      "",
      "Type the password into the shell that runs this command. Do not put it in",
      "a file, a commit, or a chat message. This script never prints it.",
      "",
      "Note that an existing account with the same email is UPDATED, including its",
      "password — so on a live database, use the address you intend to keep.",
      "",
    ].join("\n"),
  );

  process.exit(1);
};

const seedAdmin = async () => {
  refuseUnsafeProduction();

  await connectDatabase();

  const existing = await UserModel.findOne({ email: ADMIN.email }).exec();

  if (existing) {
    existing.name = ADMIN.name;
    existing.role = "admin";
    existing.isActive = true;
    // Re-set the password so a forgotten test login is always recoverable.
    existing.password = ADMIN.password;

    await existing.save();
    logger.info("Updated admin", { email: ADMIN.email });
  } else {
    await UserModel.create({ ...ADMIN, role: "admin" });
    logger.info("Created admin", { email: ADMIN.email });
  }

  if (usingDefaults) {
    logger.warn(
      "Admin password is the committed default. Anyone who can read this repository can sign in. " +
        'Re-run with: npm run seed:admin -- --email you@example.com --password "something long"',
    );
  }

  const settings = await getSettings();

  logger.info("Platform settings ready", {
    driverBasePay: settings.driverBasePay,
    driverPayPerKm: settings.driverPayPerKm,
  });

  await disconnectDatabase();
};

seedAdmin().catch(async (error: unknown) => {
  logger.error("Admin seed failed", {
    error: error instanceof Error ? error.message : "Unknown error",
  });

  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
