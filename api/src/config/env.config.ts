import "dotenv/config";

import { getEnv } from "../utils/get-env";

/*
  Configuration is read once, here, and a deployment missing any of it is told
  about ALL of it at once.

  `getEnv` throws on the first required variable it cannot find, which on a
  fresh Render service meant deploying, reading "Missing required environment
  variable: MONGODB_URI", setting it, deploying again, and learning about
  JWT_SECRET. Required reads go through `required` below instead, which
  collects, so one failed boot names everything that has to be entered.
*/
const missing: string[] = [];

const required = (key: string): string => {
  const value = process.env[key];

  if (value !== undefined && value !== "") return value;

  missing.push(key);

  return "";
};

const envConfig = () => ({
  NODE_ENV: getEnv("NODE_ENV", "development"),
  PORT: Number(getEnv("PORT", "8000")),
  LOG_LEVEL: getEnv("LOG_LEVEL", "info"),
  CORS_ORIGIN: getEnv("CORS_ORIGIN", ""),

  MONGODB_URI: required("MONGODB_URI"),

  // Optional at boot; only upload paths need them.
  CLOUDINARY_CLOUD_NAME: getEnv("CLOUDINARY_CLOUD_NAME", ""),
  CLOUDINARY_API_KEY: getEnv("CLOUDINARY_API_KEY", ""),
  CLOUDINARY_API_SECRET: getEnv("CLOUDINARY_API_SECRET", ""),

  // Optional at boot; only the payment paths need them.
  STRIPE_SECRET_KEY: getEnv("STRIPE_SECRET_KEY", ""),
  STRIPE_PUBLISHABLE_KEY: getEnv("STRIPE_PUBLISHABLE_KEY", ""),
  STRIPE_WEBHOOK_SECRET: getEnv("STRIPE_WEBHOOK_SECRET", ""),

  // Razorpay is the default gateway for OnlineMall: it is the only one of the
  // two that does UPI, which is how most of Hindaun will pay.
  RAZORPAY_KEY_ID: getEnv("RAZORPAY_KEY_ID", ""),
  RAZORPAY_KEY_SECRET: getEnv("RAZORPAY_KEY_SECRET", ""),
  RAZORPAY_WEBHOOK_SECRET: getEnv("RAZORPAY_WEBHOOK_SECRET", ""),
  /** "razorpay" | "stripe". Stripe stays available for international cards. */
  PAYMENT_PROVIDER: getEnv("PAYMENT_PROVIDER", "razorpay"),

  /**
   * Comma-separated OAuth client ids accepted on a Google ID token. The web app
   * and the Android app are separate clients, so both belong here. Empty turns
   * Google sign-in off, which is the default.
   */
  GOOGLE_CLIENT_IDS: getEnv("GOOGLE_CLIENT_IDS", ""),

  /**
   * Path to the Firebase service account JSON on disk. Empty turns push off,
   * which is the default. A path rather than the JSON itself: a multi-line
   * private key in an env var ends up in logs and process listings.
   */
  FIREBASE_SERVICE_ACCOUNT: getEnv("FIREBASE_SERVICE_ACCOUNT", ""),

  /**
   * Creating the first administrator without a shell. Set both, deploy, sign
   * in, then delete them again — see `admin-bootstrap.ts`. Empty is off, which
   * is the default and the right state once you have an account.
   */
  ADMIN_BOOTSTRAP_EMAIL: getEnv("ADMIN_BOOTSTRAP_EMAIL", ""),
  ADMIN_BOOTSTRAP_PASSWORD: getEnv("ADMIN_BOOTSTRAP_PASSWORD", ""),
  ADMIN_BOOTSTRAP_NAME: getEnv("ADMIN_BOOTSTRAP_NAME", ""),

  JWT_SECRET: required("JWT_SECRET"),
  JWT_EXPIRES_IN: getEnv("JWT_EXPIRES_IN", "7d"),
});

const config = envConfig();

/**
 * Secrets that are published somewhere — this repository's own
 * `.env.example`, the usual tutorial placeholders — signed into production
 * would let anyone mint an admin token for this deployment. Refused rather
 * than warned about, because a warning in a Render log is a warning nobody
 * reads.
 */
const PUBLISHED_SECRETS = new Set([
  "change-me-to-a-long-random-string",
  "your-secret-key",
  "secret",
  "jwt-secret",
  "changeme",
]);

const MINIMUM_SECRET_LENGTH = 32;

const problems: string[] = [];

if (config.NODE_ENV === "production" && !missing.includes("JWT_SECRET")) {
  if (PUBLISHED_SECRETS.has(config.JWT_SECRET.trim().toLowerCase())) {
    problems.push(
      "JWT_SECRET is one of the published example values. Generate a new one and set it in the hosting dashboard.",
    );
  } else if (config.JWT_SECRET.length < MINIMUM_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET is ${config.JWT_SECRET.length} characters; production needs at least ${MINIMUM_SECRET_LENGTH}.`,
    );
  }
}

if (missing.length > 0 || problems.length > 0) {
  /*
    `console.error`, not the logger: the logger reads this config, so importing
    it here would be a cycle — and the one message that has to survive a broken
    configuration is this one.

    Variable NAMES only. Never a value, so a misconfigured boot cannot be the
    thing that puts a database password or a signing key in a log.
  */
  const lines = [
    "",
    "Raket API cannot start: its configuration is incomplete.",
    "",
    ...(missing.length > 0
      ? [
          "Missing required environment variables:",
          ...missing.map((key) => `  - ${key}`),
          "",
        ]
      : []),
    ...(problems.length > 0 ? ["Unsafe configuration:", ...problems.map((p) => `  - ${p}`), ""] : []),
    "Set these in the hosting dashboard's environment settings (never in a commit).",
    "api/.env.example lists every variable and what it is for.",
    "",
  ];

  console.error(lines.join("\n"));
  process.exit(1);
}

export const Env = config;
