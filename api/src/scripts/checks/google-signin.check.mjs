/*
  What the SERVER thinks is configured for Google sign-in, and whether that
  configuration can possibly work.

  This check exists because Google sign-in fails in a way that gives you almost
  nothing to go on. The phone says `DEVELOPER_ERROR`. The browser says nothing
  at all — the button is simply absent. Neither tells you which end is wrong,
  and the two ends are configured in different places by different means: the
  API reads `GOOGLE_CLIENT_IDS` from the hosting dashboard at RUN time, the
  admin bundle has `VITE_GOOGLE_CLIENT_ID` compiled into it at BUILD time, and
  the phone has `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` compiled into the APK plus
  an Android OAuth client it never names, read out of `google-services.json` by
  the native module.

  So this prints the server's view, in full, and then asserts the things that
  are decidable without a Google account.

  It needs no database and no network. It is safe to run against production
  configuration — it prints client IDs, which are public by design (they ship
  in a browser bundle and in an APK), and it never prints a secret.

  ---------------------------------------------------------------------------
  THE PASS/FAIL RULE, because "Google is off" is a legitimate state.

  Google sign-in is optional. An empty `GOOGLE_CLIENT_IDS` is the shipped
  default and both clients hide their button rather than offer one that cannot
  work, so an unconfigured server is CORRECT, not broken, and this check
  passes.

  What it fails on is a HALF-configured deployment: `GOOGLE_CLIENT_IDS` set to
  something that cannot verify a token, or set while the Android half of the
  setup is still missing. That is the state where a button appears and then
  refuses, which is the one outcome the rest of this codebase goes to some
  length to avoid.
  ---------------------------------------------------------------------------
*/
import { existsSync, readFileSync } from "node:fs";

const repo = new URL("../../../../", import.meta.url).pathname;
const api = new URL("../..", import.meta.url).pathname;

/*
  `env.config.ts` collects every required variable and exits the process if one
  is missing, so these two have to exist before it is imported. They are
  placeholders: nothing here connects to a database or signs a token.
*/
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/google-signin-check";
process.env.JWT_SECRET ??= "check-only-secret-long-enough-to-pass-production";

const { Env } = await import(`${api}/config/env.config.ts`);
const { isGoogleSignInConfigured } = await import(`${api}/config/google.config.ts`);

const checks = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push(pass);
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
};

/* ------------------------------------------------------------- the shape -- */

/**
 * A Google OAuth client ID: the project number, a hyphen, an opaque handle,
 * then the fixed suffix. Google has never issued one in another shape, and
 * every other shape is a paste error.
 *
 * This CANNOT tell a Web client ID from an Android or iOS one — they are
 * identical in form, and that is exactly the mistake that produces
 * `DEVELOPER_ERROR`. The Android-ID-in-the-audience case is caught further
 * down, by comparing against google-services.json, which does know the type.
 */
const CLIENT_ID = /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i;

/** Google's client SECRETS start with this. One must never reach this list. */
const SECRET_PREFIX = "GOCSPX-";

/** The same split the server does, so this reports what it actually parses. */
const parse = (raw) =>
  raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

const raw = Env.GOOGLE_CLIENT_IDS;
const ids = parse(raw);
const configured = isGoogleSignInConfigured();

/* ---------------------------------------------------- what the server sees -- */

console.log("\n=== What this server thinks is configured ===\n");
console.log(`  NODE_ENV                      ${Env.NODE_ENV}`);
console.log(`  GOOGLE_CLIENT_IDS set         ${raw.length > 0 ? "yes" : "no"}`);
console.log(`  GOOGLE_CLIENT_IDS raw length  ${raw.length} characters`);
console.log(`  audiences parsed              ${ids.length}`);

ids.forEach((id, index) => {
  const looksRight = CLIENT_ID.test(id);
  console.log(`    [${index}] ${id}`);
  console.log(`         shape: ${looksRight ? "a Google OAuth client ID" : "NOT a Google OAuth client ID"}`);
});

console.log(
  `\n  GET /api/v1/auth/providers will report  { google: ${configured} }`,
);
console.log(
  configured
    ? "  -> Both clients will SHOW their Google button (if their own build carries a client ID)."
    : "  -> Both clients will HIDE their Google button. This is the shipped default.",
);

if (!configured) {
  console.log(
    "\n  Nothing else is wrong yet: Google sign-in is off, and off is a valid\n" +
      "  configuration. Set GOOGLE_CLIENT_IDS to the WEB client ID to turn it on,\n" +
      "  and read GOOGLE_SIGNIN_SETUP.md first — the Console work has to be done\n" +
      "  in order or the phone fails with DEVELOPER_ERROR.",
  );
}

/* -------------------------------------------- google-services.json, Android -- */

/*
  The one client-side artefact that is IN the repository and therefore checkable
  from here. It carries the Android OAuth client and, usually, the web one too,
  and the native module reads it rather than being told about them in JS.
*/
const servicesPath = `${repo}mobile/google-services.json`;
const servicesExists = existsSync(servicesPath);

let androidClients = [];
let webClients = [];
let servicesPackage = null;
let servicesReadable = false;

if (servicesExists) {
  try {
    const services = JSON.parse(readFileSync(servicesPath, "utf8"));
    const clients = Array.isArray(services.client) ? services.client : [];

    servicesPackage = clients[0]?.client_info?.android_client_info?.package_name ?? null;
    servicesReadable = true;

    const oauth = clients.flatMap((entry) =>
      Array.isArray(entry.oauth_client) ? entry.oauth_client : [],
    );

    // 1 = Android, 3 = Web. Google's own numbering, used in this file format.
    androidClients = oauth.filter((entry) => entry.client_type === 1);
    webClients = oauth.filter((entry) => entry.client_type === 3);
  } catch (error) {
    console.log(`\n  google-services.json could not be parsed: ${error.message}`);
  }
}

console.log("\n=== mobile/google-services.json ===\n");

if (!servicesExists) {
  console.log("  Not present. The Android build has no Google configuration at all.");
} else if (!servicesReadable) {
  console.log("  Present but not valid JSON.");
} else {
  console.log(`  package_name                  ${servicesPackage ?? "(none)"}`);
  console.log(`  oauth_client entries          ${androidClients.length + webClients.length}`);
  console.log(`    client_type 1 (Android)     ${androidClients.length}`);
  console.log(`    client_type 3 (Web)         ${webClients.length}`);

  androidClients.forEach((entry) => {
    const fingerprint = entry.android_info?.certificate_hash ?? "(no certificate_hash)";
    console.log(`    Android ${entry.client_id}`);
    console.log(`            package ${entry.android_info?.package_name ?? "(none)"}`);
    console.log(`            SHA-1   ${fingerprint}`);
  });

  webClients.forEach((entry) => {
    console.log(`    Web     ${entry.client_id}`);
  });

  if (androidClients.length === 0) {
    console.log(
      "\n  NO ANDROID OAUTH CLIENT. This is the DEVELOPER_ERROR path: the native\n" +
        "  module has no client to present and no registered SHA-1 to be recognised\n" +
        "  by, so Google rejects the app before any ID token exists. Regenerate this\n" +
        "  file after creating an Android OAuth client for each signing key —\n" +
        "  GOOGLE_SIGNIN_SETUP.md § 4, then § 5 to regenerate this file.",
    );
  }
}

/* ------------------------------------------------------------- assertions -- */

console.log("\n=== Assertions ===\n");

console.log("The audience list parses");
check("no stray separator left an empty audience", parse(raw).length, ids.length);
check(
  "GOOGLE_CLIENT_IDS is comma-separated, not semicolon-separated",
  raw.includes(";"),
  false,
);
check("no duplicate audiences", new Set(ids).size, ids.length);

console.log("\nEvery audience is a client ID and nothing else");
check(
  "no client SECRET in GOOGLE_CLIENT_IDS",
  ids.some((id) => id.toUpperCase().startsWith(SECRET_PREFIX)),
  false,
);
check(
  "every audience has the shape of a Google OAuth client ID",
  ids.filter((id) => !CLIENT_ID.test(id)),
  [],
);

/*
  The mistake the shapes cannot catch, caught a different way.

  An Android client ID looks exactly like a Web one, and putting it in
  GOOGLE_CLIENT_IDS is the single most natural thing to do — it is the client
  the phone is, after all. It is also wrong: Google writes the WEB client ID
  into the `aud` of every ID token, the Android app's included, so an Android ID
  in this list matches nothing and every token is rejected with a 401 the client
  reports as "Google sign-in failed".

  google-services.json knows which is which, so when both are present this is
  decidable.
*/
console.log("\nNo Android client ID is being used as an audience");
check(
  "GOOGLE_CLIENT_IDS contains no client_type 1 (Android) ID from google-services.json",
  ids.filter((id) => androidClients.some((entry) => entry.client_id === id)),
  [],
);

/*
  Only meaningful once the server has been configured. Before that, a repository
  with no Android client is simply a repository where Google sign-in has not
  been set up, which is the state this project ships in.
*/
if (configured) {
  console.log("\nThe server is configured, so the Android half has to exist too");
  check("google-services.json is present", servicesExists, true);
  check("it declares at least one Android OAuth client", androidClients.length > 0, true);
  check(
    "every Android client carries a SHA-1 certificate_hash",
    androidClients.filter((entry) => !entry.android_info?.certificate_hash).length,
    0,
  );

  /*
    Not fatal and not asserted: the web client is usually written into
    google-services.json by Firebase, and `webClientId` is passed explicitly in
    `mobile/src/features/auth/google-sign-in.ts` either way. Worth saying,
    because its absence means the file was generated before the web client
    existed — which usually means the rest of the file is stale too.
  */
  if (webClients.length === 0) {
    console.log(
      "\n  NOTE  google-services.json declares no client_type 3 (Web) entry. Not\n" +
        "        fatal — the app passes webClientId from\n" +
        "        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — but it means this file predates\n" +
        "        the web client, so regenerate it rather than trusting it.",
    );
  }

  if (webClients.length > 0) {
    const shared = webClients.filter((entry) => ids.includes(entry.client_id));

    if (shared.length === 0) {
      console.log(
        "\n  NOTE  none of google-services.json's Web client IDs appear in\n" +
          "        GOOGLE_CLIENT_IDS. Either the server is configured with a client\n" +
          "        from a different Google Cloud project, or this file is stale.\n" +
          "        The same WEB client ID has to be in all three places — see\n" +
          "        GOOGLE_SIGNIN_SETUP.md § 6.",
      );
    } else {
      console.log(
        `\n  The web client ${shared[0].client_id}\n` +
          "  is in both google-services.json and GOOGLE_CLIENT_IDS, which is what\n" +
          "  the phone and the server have to agree on.",
      );
    }
  }
}

/* ------------------------------------------------- what this cannot answer -- */

console.log("\n=== What this check CANNOT tell you ===\n");
console.log(
  [
    "  - Whether the ID in GOOGLE_CLIENT_IDS is of type WEB. An Android, iOS and",
    "    Web client ID are indistinguishable by shape. The only authority is the",
    "    Google Cloud Console's own 'Type' column, and google-services.json when it",
    "    happens to list the ID (checked above when it does).",
    "  - Whether the SHA-1 registered on the Android client matches the key that",
    "    signed the APK on the phone. Run `npx @react-native-google-signin/config-doctor`",
    "    against the installed app for that — it is the only universal answer.",
    "  - What the ADMIN BUNDLE was built with. VITE_GOOGLE_CLIENT_ID is compiled in",
    "    at build time and is not visible to this process. Check the served bundle:",
    "      curl -s https://<service>/ | grep -o 'assets/index-[^\"]*\\.js'",
    "      curl -s https://<service>/assets/index-<hash>.js | grep -oiE '[0-9]+-[a-z0-9_]+\\.apps\\.googleusercontent\\.com'",
    "  - What the APK was built with. EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is compiled",
    "    into the bundle the same way, and it is NOT declared in eas.json's build",
    "    profiles today, so a build made from them carries none.",
  ].join("\n"),
);

const failed = checks.filter((x) => !x).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed === 0 ? 0 : 1);
