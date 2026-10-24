/*
  The production deployment, over the wire.

  `api.check.mjs` boots the API in development mode, which is the right place
  for the endpoints — but it means the half of `src/index.ts` that only runs
  with `NODE_ENV=production` has never been executed by anything: serving the
  admin bundle, the SPA fallback that must not swallow `/api`, the readiness
  policy on `/health`, and the refusals that are supposed to stop a
  misconfigured service from starting at all. Each of those is a one-line
  mistake away from a deploy that looks healthy and serves nothing.

  So this one starts the server the way Render starts it, and asks.

  Also here: the upload endpoint's authorisation. It needs no Cloudinary
  account, because who may write to which folder is not a question about
  credentials — which is exactly why the configuration check was moved below
  the role check in `upload.controller.ts`.
*/
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = 8600 + Math.floor(Math.random() * 300);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/api/v1`;

const api = new URL("../..", import.meta.url).pathname;
const repo = new URL("../../../../", import.meta.url).pathname;
const apiRoot = new URL("../../..", import.meta.url).pathname;

/*
  The server is spawned as `node --import tsx`, NOT as `npx tsx`.

  `npx tsx` is two processes: the npx shim, and the node process under it doing
  the work. A signal sent to the shim kills the shim — the API underneath never
  sees it, keeps running as an orphan, and the shutdown assertions below read a
  log that was never written. It cost an afternoon to find, and the symptom was
  "graceful shutdown is broken" when graceful shutdown was fine: measured on
  the real process it completes in about 20ms.

  `api.check.mjs` uses `npx tsx` with a detached process group and a group
  SIGKILL, which works for a teardown that does not care about exit codes.
  This check does care, so it addresses the process directly.
*/
const spawnServer = (env) =>
  spawn(process.execPath, ["--import", "tsx", `${api}/index.ts`], {
    cwd: apiRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
const adminIndex = `${repo}admin/dist/index.html`;
const adminBuilt = existsSync(adminIndex);

const checks = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push(pass);
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
};

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri("deploycheck");

const baseEnv = {
  ...process.env,
  JWT_SECRET: "deploy-check-secret-long-enough-for-production-rules",
  // `info`, not `error`: three of the assertions below are about what the boot
  // and shutdown lines SAY, and at `error` the log is empty and they all fail
  // for a reason that has nothing to do with the server.
  LOG_LEVEL: "info",
  MONGODB_URI: uri,
  NODE_ENV: "production",
  PORT: String(PORT),
};

/* ---------------------------------------------------- refusing to start -- */

/**
 * Starts the API and resolves with how it died, for the cases where NOT
 * starting is the correct behaviour. A server that came up instead is the
 * failure, so there is a ceiling rather than an open wait.
 */
const startAndExpectExit = (env, label) =>
  new Promise((resolve) => {
    const child = spawnServer(env);

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));

    const giveUp = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ code: null, output, timedOut: true });
    }, 30_000);

    child.on("exit", (code) => {
      clearTimeout(giveUp);
      resolve({ code, output, timedOut: false });
    });

    child.on("error", () => {
      clearTimeout(giveUp);
      resolve({ code: -1, output: `${output}\nspawn failed`, timedOut: false });
    });

    void label;
  });

console.log("\nConfiguration the service must refuse:\n");

{
  const { MONGODB_URI: _dropped, ...withoutMongo } = baseEnv;
  const result = await startAndExpectExit(withoutMongo, "no MONGODB_URI");

  check("a missing MONGODB_URI exits non-zero", result.code !== 0 && !result.timedOut, true);
  check("and the message names it", result.output.includes("MONGODB_URI"), true);
  // The whole point of collecting: one failed boot, every missing name.
  check(
    "and names every missing variable at once",
    result.output.includes("configuration is incomplete"),
    true,
  );
  check("and prints no value", !result.output.includes(uri), true);
}

{
  const result = await startAndExpectExit(
    { ...baseEnv, JWT_SECRET: "change-me-to-a-long-random-string" },
    "example JWT_SECRET",
  );

  check(
    "the published example JWT_SECRET is refused in production",
    result.code !== 0 && !result.timedOut,
    true,
  );
  check("and the message names JWT_SECRET", result.output.includes("JWT_SECRET"), true);
  check("and does not echo the secret", !result.output.includes("change-me-to-a-long"), true);
}

{
  const result = await startAndExpectExit({ ...baseEnv, JWT_SECRET: "short" }, "short JWT_SECRET");

  check("a too-short JWT_SECRET is refused in production", result.code !== 0, true);
}

{
  // A syntactically valid URI pointing at nothing. The server must fail rather
  // than listen: "reachable but no database" is the state /health exists to
  // keep out of a load balancer.
  const result = await startAndExpectExit(
    { ...baseEnv, MONGODB_URI: `mongodb://127.0.0.1:1/deploycheck` },
    "unreachable database",
  );

  check("an unreachable database exits rather than listening", result.code !== 0, true);
  check(
    "and says the connection failed",
    /Database connection failed|failed to start/i.test(result.output),
    true,
  );
}

/* --------------------------------------------- the dashboard admin path -- */

/*
  Creating the first administrator with no shell, which is the only route open
  on a free plan. Asserted here because the alternative is finding out on a
  live deployment that the one account you need cannot be made.
*/
console.log("\nAdmin bootstrap from environment variables:\n");

const bootstrapEnv = (extra) => ({ ...baseEnv, PORT: String(PORT + 50), ...extra });

{
  const result = await startAndExpectExit(
    bootstrapEnv({ ADMIN_BOOTSTRAP_EMAIL: "boot@check.local" }),
    "email without password",
  );

  // It must not block the boot, so the server comes up and we stop it.
  check("one variable alone does not stop the server", result.timedOut, true);
  check("and it says both are needed", /set BOTH ADMIN_BOOTSTRAP_EMAIL/.test(result.output), true);
}

{
  const result = await startAndExpectExit(
    bootstrapEnv({
      ADMIN_BOOTSTRAP_EMAIL: "boot@check.local",
      ADMIN_BOOTSTRAP_PASSWORD: "short",
    }),
    "short password",
  );

  check("a too-short bootstrap password is refused", /password is too short/.test(result.output), true);
  check("and the API still starts", result.timedOut, true);
}

{
  const result = await startAndExpectExit(
    bootstrapEnv({
      ADMIN_BOOTSTRAP_EMAIL: "boot@check.local",
      ADMIN_BOOTSTRAP_PASSWORD: "chowly12345",
    }),
    "committed demo password",
  );

  check(
    "the committed demo password is refused here too",
    /committed demo password/.test(result.output),
    true,
  );
}

const BOOTSTRAP = { email: "bootstrapped@check.local", password: "bootstrap-password-123" };

{
  const result = await startAndExpectExit(
    bootstrapEnv({
      ADMIN_BOOTSTRAP_EMAIL: BOOTSTRAP.email,
      ADMIN_BOOTSTRAP_NAME: "Bootstrapped Admin",
      ADMIN_BOOTSTRAP_PASSWORD: BOOTSTRAP.password,
    }),
    "a valid bootstrap",
  );

  check("a valid bootstrap creates the admin", /Admin bootstrap created an admin/.test(result.output), true);
  // The whole point of the warning: a password left in a dashboard leaks with it.
  check(
    "and says to delete the variables afterwards",
    /still set/.test(result.output) && /DELETE them/.test(result.output),
    true,
  );
  check("and never prints the password", !result.output.includes(BOOTSTRAP.password), true);
}

/* ------------------------------------------------- the production server -- */

const portIsFree = async () => {
  try {
    await fetch(`${ORIGIN}/health`, { signal: AbortSignal.timeout(1000) });

    return false;
  } catch {
    return true;
  }
};

if (!(await portIsFree())) {
  console.error(`Something is already listening on ${PORT}. Refusing to test against it.`);
  await mongod.stop();
  process.exit(1);
}

console.log("\nSeeding the admin…\n");

await new Promise((resolve, reject) => {
  const child = spawn(
    "npx",
    [
      "tsx",
      `${api}/scripts/seed-admin.ts`,
      "--email",
      "deploy@check.local",
      "--password",
      "deploy-check-password-123",
    ],
    { env: baseEnv, stdio: "ignore" },
  );

  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed-admin → ${code}`))));
});

console.log(`Starting the API in production mode on ${PORT}…\n`);

const server = spawnServer(baseEnv);

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${ORIGIN}/health`);

      if (response.ok) return true;
    } catch {
      // Not up yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
};

const teardown = async () => {
  server.kill("SIGKILL");
  await mongod.stop();
};

if (!(await ready())) {
  console.error("The API never came up:\n", serverLog);
  await teardown();
  process.exit(1);
}

/* ---------------------------------------------------------------- health -- */

console.log("Readiness:\n");

{
  const response = await fetch(`${ORIGIN}/health`);
  const body = await response.json();

  check("/health is 200 with a connected database", response.status, 200);
  check("and says so", { database: body.database, ready: body.ready, status: body.status }, {
    database: "connected",
    ready: true,
    status: "ok",
  });
  check("and reports uptime", typeof body.uptimeSeconds, "number");
}

{
  // Outside /api/v1 on purpose, so a platform health check never spends a
  // client's rate-limit budget. The limiter's headers are the evidence.
  const response = await fetch(`${ORIGIN}/health`);

  check(
    "/health is not behind the API rate limiter",
    response.headers.get("ratelimit") === null &&
      response.headers.get("ratelimit-limit") === null,
    true,
  );
}

/* ------------------------------------------------------- admin and 404s -- */

console.log("\nServing the backoffice:\n");

if (adminBuilt) {
  const shellHtml = readFileSync(adminIndex, "utf8");

  {
    const response = await fetch(`${ORIGIN}/`);
    const text = await response.text();

    check("GET / serves the admin shell", response.status, 200);
    check("and it is the built index.html", text === shellHtml, true);
    check(
      "and the shell is not cached",
      response.headers.get("cache-control"),
      "no-cache",
    );
  }

  {
    // A client-side route. A plain static server 404s here, which is the bug
    // BUILDING.md warns about for `npx serve dist`.
    const response = await fetch(`${ORIGIN}/orders/68b0f0f0f0f0f0f0f0f0f0f0`);

    check("a deep admin route falls back to the shell", response.status, 200);
  }

  {
    const response = await fetch(`${ORIGIN}/login`);

    check("/login falls back to the shell", response.status, 200);
  }

  {
    // The fingerprinted bundle, which is what the 1-year cache is for.
    const asset = /\/assets\/[^"']+\.js/.exec(shellHtml)?.[0];

    check("the shell references a fingerprinted bundle", Boolean(asset), true);

    if (asset) {
      const response = await fetch(`${ORIGIN}${asset}`);

      check("the bundle is served", response.status, 200);
      check(
        "and is cached for a year",
        /max-age=31536000/.test(response.headers.get("cache-control") ?? ""),
        true,
      );
    }
  }

  check("the boot log says where the backoffice is served from", /Backoffice served at/.test(serverLog), true);
} else {
  console.log("  admin/dist is absent — asserting the explanatory refusal instead.");
  console.log("  Run `npm run build` in admin/ and re-run this to cover the serving path.\n");

  const response = await fetch(`${ORIGIN}/`);
  const body = await response.json();

  check("GET / is a 404 without a build", response.status, 404);
  check("and names admin/dist as the reason", /admin\/dist/.test(body.message), true);
}

{
  /*
    The fallback is `^(?!\/api).*`, and the negative lookahead is the whole
    point: an unknown API path has to stay a JSON 404. Without it every typo
    under /api/v1 would be answered with the admin HTML, and the client would
    report a parse error instead of a missing route.
  */
  const response = await fetch(`${BASE}/not-a-real-route`);
  const text = await response.text();

  check("an unknown /api route is 404", response.status, 404);
  check("and answers JSON, not the admin shell", text.trimStart().startsWith("{"), true);

  const body = JSON.parse(text);

  check("with the standard error shape", body.success, false);
  check("and no stack trace", "stack" in body, false);
}

/* -------------------------------------------------------------- uploads -- */

console.log("\nUpload authorisation:\n");

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method: "POST",
  });

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

const uploadAttempt = async ({ bytes = onePixelPng, filename = "a.png", folder, token, type = "image/png" }) => {
  const form = new FormData();
  form.append("folder", folder);
  form.append("file", new Blob([bytes], { type }), filename);

  const response = await fetch(`${BASE}/admin/uploads/image`, {
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    method: "POST",
  });

  return { body: await response.json().catch(() => ({})), status: response.status };
};

const adminLogin = await post("/auth/login", {
  email: "deploy@check.local",
  password: "deploy-check-password-123",
});
const adminToken = (await adminLogin.json()).data?.accessToken;

check("the seeded admin can sign in", Boolean(adminToken), true);

// A password login must set the browser cookie as well as returning the token.
check(
  "and the login sets the HTTP-only auth cookie",
  /accessToken=.*HttpOnly/i.test(adminLogin.headers.get("set-cookie") ?? ""),
  true,
);

{
  // The account the bootstrap made, over the wire. Creating a row is not the
  // same as being able to sign in with it.
  const login = await post("/auth/login", BOOTSTRAP);
  const body = await login.json();

  check("the bootstrapped admin can sign in", login.status, 200);
  check("and is an admin", body.data?.user?.role, "admin");
  check("with the name it was given", body.data?.user?.name, "Bootstrapped Admin");
}

const customerRegister = await post("/auth/register", {
  email: "shopper@check.local",
  name: "Shopper",
  password: "shopper-password-123",
});
const customerToken = (await customerRegister.json()).data?.accessToken;

check("a customer can register", Boolean(customerToken), true);

{
  const result = await uploadAttempt({ folder: "products" });

  check("an upload with no token is 401", result.status, 401);
}

{
  const result = await uploadAttempt({ folder: "products", token: customerToken });

  check("a customer cannot upload at all", result.status, 403);
}

{
  const result = await uploadAttempt({ folder: "not-a-folder", token: adminToken });

  check("an unknown folder is refused", result.status, 400);
  check("and the message lists the real ones", /banners/.test(result.body.message ?? ""), true);
}

{
  // The admin is allowed everywhere, so this reaches the capability check —
  // which is the honest answer on a deployment with no Cloudinary keys.
  const result = await uploadAttempt({ folder: "banners", token: adminToken });
  const configured = Boolean(process.env.CLOUDINARY_CLOUD_NAME);

  check(
    configured
      ? "an admin banner upload is accepted"
      : "an admin reaches the configuration check, not a permission error",
    result.status,
    configured ? 201 : 400,
  );

  if (!configured) {
    check(
      "and is told image hosting is off rather than given a stack trace",
      /not configured/i.test(result.body.message ?? ""),
      true,
    );
  }
}

{
  const result = await uploadAttempt({
    filename: "notes.txt",
    folder: "products",
    token: adminToken,
    type: "text/plain",
  });

  check("a non-image is refused as a bad request, not a 500", result.status, 400);
  check(
    "and the message names the accepted types",
    /PNG|JPEG|WebP|AVIF/i.test(result.body.message ?? ""),
    true,
  );
}

{
  const result = await uploadAttempt({
    // 6 MB against a 5 MB limit. Multer aborts mid-stream, and left alone that
    // reaches the error handler as an unhandled error and a 500.
    bytes: Buffer.alloc(6 * 1024 * 1024, 1),
    folder: "products",
    token: adminToken,
  });

  check("an oversized image is a bad request, not a 500", result.status, 400);
  check("and the message names the limit", /MB/.test(result.body.message ?? ""), true);
}

/* ----------------------------------------------------- role separation -- */

console.log("\nWhat a customer cannot reach:\n");

const asCustomer = (path) =>
  fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${customerToken}` } });

for (const path of [
  "/admin/orders",
  "/admin/customers",
  "/admin/restaurants",
  "/admin/riders",
  "/admin/settings",
  "/admin/analytics/overview",
  "/admin/settlements/outstanding",
]) {
  const response = await asCustomer(path);

  check(`a customer is refused ${path}`, response.status, 403);
}

/* -------------------------------------------------------------- logout -- */

{
  const response = await fetch(`${BASE}/auth/logout`, { method: "POST" });
  const cookie = response.headers.get("set-cookie") ?? "";

  check("logout clears the auth cookie", /accessToken=;/.test(cookie), true);
  check("and keeps it HTTP-only while doing so", /HttpOnly/i.test(cookie), true);
}

/* ------------------------------------------------------ clean shutdown -- */

console.log("\nShutdown:\n");

{
  const startedAt = Date.now();

  server.kill("SIGTERM");

  const exitCode = await new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve("did not exit within 15s"), 15_000);

    server.on("exit", (code) => {
      clearTimeout(giveUp);
      resolve(code);
    });
  });

  // Render sends SIGTERM and SIGKILLs what is still alive after its grace
  // period, so "eventually" is not good enough: anything in flight when the
  // hammer falls is lost.
  check("SIGTERM stops the server", exitCode, 0);
  check("well inside a platform grace period", Date.now() - startedAt < 10_000, true);
  check("and it says it is shutting down", /Shutting down API/.test(serverLog), true);
  check("and disconnects the database", /Database disconnected/.test(serverLog), true);
}

await mongod.stop();

const failed = checks.filter((x) => !x).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);

if (failed > 0) {
  console.log("\nServer log:\n", serverLog);
}

process.exit(failed === 0 ? 0 : 1);
