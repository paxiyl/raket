/*
  One order, all the way through, from the customer's side to the backoffice's
  and back.

  `api.check.mjs` calls every endpoint and checks its shape, which catches a
  response that drifted — but it only READS the order endpoints. Nothing in the
  tree has ever placed an order and then looked for it as an administrator, so
  the claim both apps rest on ("orders a customer places appear in the
  backoffice, and a change an administrator makes reaches the customer") was
  true only by inspection.

  It is a cash-on-delivery order on purpose. COD needs no gateway, so this runs
  with no Razorpay or Stripe account, which is the state a fresh deployment is
  in — and it is the payment method a fresh deployment can actually take.

  Written against the HTTP API, with one token per role, so it exercises the
  same middleware, validators and services the two clients reach.
*/
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

const api = new URL("../..", import.meta.url).pathname;
const apiRoot = new URL("../../..", import.meta.url).pathname;

const checks = [];
const check = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push(pass);
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
};

const ADMIN = { email: "flow-admin@check.local", password: "flow-check-password-123" };
const CUSTOMER = { email: "flow-shopper@check.local", name: "Flow Shopper", password: "flow-shopper-123" };

const mongod = await MongoMemoryServer.create();

const env = {
  ...process.env,
  JWT_SECRET: "order-flow-check-secret-long-enough",
  LOG_LEVEL: "error",
  MONGODB_URI: mongod.getUri("orderflow"),
  NODE_ENV: "development",
  PORT: String(PORT),
};

const runScript = (script, args = []) =>
  new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", `${api}/scripts/${script}`, ...args], {
      cwd: apiRoot,
      env,
      stdio: "ignore",
    });

    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} → ${code}`))));
  });

console.log("Seeding a catalogue…");
// Categories first: the store seeder files its products under them, and
// without this they land under none at all.
await runScript("seed-categories.ts");
await runScript("seed-stores.ts");
await runScript("seed-admin.ts", ["--email", ADMIN.email, "--password", ADMIN.password]);

console.log(`Starting the API on ${PORT}…\n`);

const server = spawn(process.execPath, ["--import", "tsx", `${api}/index.ts`], {
  cwd: apiRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

const ready = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);

      if (response.ok) return true;
    } catch {
      // Not up yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
};

const finish = async (code) => {
  server.kill("SIGKILL");
  await mongod.stop();
  process.exit(code);
};

if (!(await ready())) {
  console.error("The API never came up:\n", serverLog);
  await finish(1);
}

/* ------------------------------------------------------------- plumbing -- */

const call = async (method, path, { body, token } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    method,
  });

  return { body: await response.json().catch(() => ({})), status: response.status };
};

/** Fails the whole run rather than reporting twenty consequences of one cause. */
const required = (label, value) => {
  if (value) return value;

  console.error(`\nFAIL  ${label} — cannot continue.`);
  console.error("\nServer log:\n", serverLog);
  void finish(1);

  throw new Error(label);
};

/* ------------------------------------------------- 1. sign in, both ends -- */

console.log("Accounts:\n");

const adminLogin = await call("POST", "/auth/login", { body: ADMIN });
check("the seeded admin signs in", adminLogin.status, 200);
const adminToken = required("admin token", adminLogin.body.data?.accessToken);

check("and is an admin", adminLogin.body.data?.user?.role, "admin");

const register = await call("POST", "/auth/register", { body: CUSTOMER });
check("a customer registers", register.status, 201);
const customerToken = required("customer token", register.body.data?.accessToken);

// The role on the account, not the one asked for at sign-up. A staff role is
// only ever granted by an admin approving an application.
check("and is a customer", register.body.data?.user?.role, "customer");
const customerId = required("customer id", register.body.data?.user?._id);

{
  // Session restore: the token alone, as the app does on every launch.
  const me = await call("GET", "/auth/me", { token: customerToken });

  check("the session restores from the token", me.status, 200);
  check("and is the same account", me.body.data?.user?.email, CUSTOMER.email);
  check("with no address yet", me.body.data?.hasAddress, false);
}

/* ------------------------------------------------------- 2. an address -- */

console.log("\nAddress:\n");

const address = await call("POST", "/addresses", {
  body: {
    city: "Hindaun City",
    isDefault: true,
    label: "Home",
    line1: "12 Bazaar Road",
    postcode: "322230",
  },
  token: customerToken,
});

check("the customer saves an address", address.status, 201);
const addressId = required("address id", address.body.data?.address?._id);

{
  const me = await call("GET", "/auth/me", { token: customerToken });

  check("and /auth/me now reports one", me.body.data?.hasAddress, true);
}

/* ---------------------------------------------------- 3. browse and add -- */

console.log("\nCatalogue and basket:\n");

const stores = await call("GET", "/stores");
check("the catalogue is readable signed out", stores.status, 200);

const store = required("a seeded store", stores.body.data?.stores?.[0]);
check("and has at least one shop", Boolean(store.slug), true);

const products = await call("GET", `/products?store=${store.slug}&limit=5`);
check("the shop has products", products.status, 200);

const product = required("a product in stock", (products.body.data?.products ?? []).find((p) => p.stock > 0));

check("priced in paise, as an integer", Number.isInteger(product.price), true);

// A listed product carries its category populated, so the shelf can be named
// without a second request. The id underneath is what a write wants back.
const categoryId = required("the product's category id", product.categoryId?._id ?? product.categoryId);

const search = await call("GET", `/search?q=${encodeURIComponent(product.name.split(" ")[0])}`);
check("search answers", search.status, 200);
check(
  "with all four result groups the app reads",
  ["products", "stores", "restaurants", "dishes"].every((key) => key in (search.body.data ?? {})),
  true,
);

const added = await call("POST", "/basket/products", {
  body: { productId: product._id, quantity: 2 },
  token: customerToken,
});

check("the product goes into the basket", added.status, 201);

const basket = await call("GET", "/basket", { token: customerToken });
check("the basket reads back", basket.status, 200);
check("with one line", basket.body.data?.basket?.items?.length, 1);
check("of two", basket.body.data?.basket?.items?.[0]?.quantity, 2);

const basketTotal = basket.body.data?.totals?.total;
check("and a total in paise", Number.isInteger(basketTotal) && basketTotal > 0, true);

/* ------------------------------------------------- 4. a cash order -- */

console.log("\nPlacing a cash-on-delivery order:\n");

{
  // What the app asks before it offers anything but cash. With no gateway
  // configured the honest answer is that online payment is unavailable.
  const methods = await call("GET", "/payment-methods", { token: customerToken });

  check("payment methods are reported", methods.status, 200);
  check(
    "online payment is unavailable with no gateway configured",
    methods.body.data?.online?.available,
    false,
  );
  check("and cash on delivery is", methods.body.data?.cod?.available, true);
  // Each unavailable method carries a reason, so the app can grey it out and
  // say why rather than failing at the Pay button.
  check(
    "every unavailable method gives a reason",
    (methods.body.data?.methods ?? [])
      .filter((entry) => !entry.available)
      .every((entry) => typeof entry.reason === "string" && entry.reason.length > 0),
    true,
  );
}

const order = await call("POST", "/orders", {
  body: { addressId, contactPhone: "9876543210", paymentMethod: "cod" },
  token: customerToken,
});

check("the order is created", order.status, 201);
const orderId = required("order id", order.body.data?.order?._id);

check("placed outright, with no gateway step", order.body.data?.checkout, null);
check("and confirmed rather than awaiting payment", order.body.data?.order?.status, "confirmed");
check("with the basket total", order.body.data?.order?.total, basketTotal);
check("and the cash owed at the door", order.body.data?.order?.codAmountDue, basketTotal);

{
  const emptied = await call("GET", "/basket", { token: customerToken });

  check("the basket is emptied by the order", emptied.body.data?.basket, null);
  check("and counts nothing", emptied.body.data?.totals?.itemCount, 0);
}

{
  const list = await call("GET", "/orders", { token: customerToken });

  check("the customer's order list has it", list.status, 200);
  check(
    "exactly once",
    (list.body.data?.orders ?? []).filter((o) => o._id === orderId).length,
    1,
  );
}

/* ---------------------------------------- 5. the backoffice sees the same -- */

console.log("\nThe same order, in the backoffice:\n");

{
  const adminList = await call("GET", "/admin/orders?limit=50", { token: adminToken });

  check("the admin order list loads", adminList.status, 200);
  check(
    "and contains the customer's order",
    (adminList.body.data?.orders ?? []).some((o) => o._id === orderId),
    true,
  );
}

{
  const detail = await call("GET", `/admin/orders/${orderId}`, { token: adminToken });

  check("the admin can open it", detail.status, 200);
  check("it is the same order", detail.body.data?.order?._id, orderId);
  check("attributed to the right customer", detail.body.data?.order?.userId, customerId);
  check("for the same money", detail.body.data?.order?.total, basketTotal);
}

{
  // The shared database is the whole point of the single API: this is the one
  // assertion that would fail if the two apps were ever pointed at different
  // deployments.
  const overview = await call("GET", "/admin/analytics/overview?days=7", { token: adminToken });

  check("the dashboard counts it", overview.status, 200);
  check("as a live order", (overview.body.data?.liveOrders ?? 0) >= 1, true);
  check(
    "and files it under cash on delivery",
    (overview.body.data?.paymentSplit ?? []).some(
      (row) => row.paymentMethod === "cod" && row.orders >= 1,
    ),
    true,
  );
}

/* ------------------------------------- 6. a status change reaches back -- */

console.log("\nA status change, admin to customer:\n");

{
  const update = await call("PATCH", `/admin/orders/${orderId}/status`, {
    body: { status: "preparing" },
    token: adminToken,
  });

  check("the admin advances the status", update.status, 200);
  check("to preparing", update.body.data?.order?.status, "preparing");
}

{
  const seen = await call("GET", `/orders/${orderId}`, { token: customerToken });

  check("the customer sees the new status", seen.body.data?.order?.status, "preparing");
  check(
    "and the history records both steps",
    (seen.body.data?.order?.statusHistory ?? []).map((entry) => entry.status),
    ["confirmed", "preparing"],
  );
}

{
  const update = await call("PATCH", `/admin/orders/${orderId}/status`, {
    body: { status: "ready" },
    token: adminToken,
  });

  check("and again, to ready", update.body.data?.order?.status, "ready");
}

/* ----------------------------- 7. a customer cannot do an admin's job -- */

console.log("\nWhat the customer cannot do:\n");

{
  const attempt = await call("PATCH", `/admin/orders/${orderId}/status`, {
    body: { status: "cancelled" },
    token: customerToken,
  });

  // Enforced in the API, not by hiding a button: the role check runs before the
  // handler, so a hand-made request gets the same answer.
  check("a customer cannot change an order's status", attempt.status, 403);
}

{
  const stillReady = await call("GET", `/orders/${orderId}`, { token: customerToken });

  check("and the order is untouched", stillReady.body.data?.order?.status, "ready");
}

{
  const attempt = await call("POST", `/stores/${store._id}/products`, {
    body: {
      categoryId: categoryId,
      name: "Smuggled Product",
      price: 100,
      unit: "1 kg",
    },
    token: customerToken,
  });

  check("a customer cannot add a product", attempt.status, 403);
}

{
  const other = await call("POST", "/auth/register", {
    body: {
      email: "flow-other@check.local",
      name: "Other Shopper",
      password: "other-shopper-123",
    },
  });
  const otherToken = other.body.data?.accessToken;

  const attempt = await call("GET", `/orders/${orderId}`, { token: otherToken });

  // Another customer's order is not theirs to read, and the answer is "no such
  // order" rather than "forbidden": a 403 would confirm the id exists.
  check("another customer cannot read this order", attempt.status, 404);
}

/* ------------------------- 8. an admin edit reaches the customer app -- */

console.log("\nAn admin edit, reaching the customer catalogue:\n");

const created = await call("POST", `/stores/${store._id}/products`, {
  body: {
    categoryId,
    description: "Added by the order-flow check.",
    imagePreset: "",
    isAvailable: true,
    maxPerOrder: 5,
    name: "Check Brand Atta",
    price: 4550,
    stock: 20,
    unit: "5 kg",
  },
  token: adminToken,
});

check("the admin creates a product", created.status, 201);
const createdId = required("created product id", created.body.data?.product?._id);

{
  const visible = await call("GET", `/products/${createdId}`);

  check("and a signed-out customer can see it", visible.status, 200);
  check("with the price the admin entered", visible.body.data?.product?.price, 4550);
}

{
  /*
    Clearing the tile. The validator accepts `""` for "no preset" and the
    Mongoose enum used to refuse it, so this exact request — which is what
    pressing the selected tile a second time in the backoffice sends — came
    back 500 "Internal server error" on both create and update.
  */
  const cleared = await call("PATCH", `/products/${createdId}`, {
    body: { imagePreset: "" },
    token: adminToken,
  });

  check("clearing the preset tile is accepted", cleared.status, 200);

  const withPreset = await call("PATCH", `/products/${createdId}`, {
    body: { imagePreset: "atta-rice" },
    token: adminToken,
  });

  check("and setting a real preset key still is", withPreset.status, 200);
  check("which is stored", withPreset.body.data?.product?.imagePreset, "atta-rice");

  const invalid = await call("PATCH", `/products/${createdId}`, {
    body: { imagePreset: "not-a-preset" },
    token: adminToken,
  });

  // A key nothing can draw is still refused, and as a validation error rather
  // than a crash — the enum is doing its job, just not on the empty string.
  check("but an unknown key is a validation error", invalid.status, 400);
}

{
  const hidden = await call("PATCH", `/products/${createdId}`, {
    body: { isAvailable: false },
    token: adminToken,
  });

  check("the admin can take it off the shelf", hidden.status, 200);

  const listed = await call("GET", `/products?store=${store.slug}&limit=100`);

  check(
    "and it leaves the shop listing",
    (listed.body.data?.products ?? []).some((p) => p._id === createdId),
    false,
  );
}

/* ------------------------------------------------- 9. errors a user sees -- */

console.log("\nErrors, as the client will read them:\n");

{
  const wrong = await call("POST", "/auth/login", {
    body: { email: CUSTOMER.email, password: "not-the-password" },
  });

  check("a wrong password is 401", wrong.status, 401);
  check("with one message for both halves", wrong.body.message, "Invalid email or password");
  check("and no stack trace", "stack" in wrong.body, false);
}

{
  const unknown = await call("POST", "/auth/login", {
    body: { email: "nobody@check.local", password: "not-the-password" },
  });

  // Identical to the above on purpose: a different message would let someone
  // enumerate which addresses have accounts.
  check("an unknown email gives the same answer", unknown.body.message, "Invalid email or password");
}

{
  const invalid = await call("POST", "/addresses", {
    body: { city: "", line1: "", postcode: "" },
    token: customerToken,
  });

  check("a validation failure is 400", invalid.status, 400);
  check("with per-field messages", Array.isArray(invalid.body.errors), true);
  check("naming the fields", (invalid.body.errors ?? []).length >= 2, true);
}

{
  const expired = await call("GET", "/auth/me", { token: `${customerToken}tampered` });

  check("a tampered token is 401", expired.status, 401);
}

{
  const missing = await call("GET", "/orders/000000000000000000000000", { token: customerToken });

  check("a missing order is 404", missing.status, 404);
}

{
  const malformed = await call("GET", "/orders/not-an-id", { token: customerToken });

  check("a malformed id is a validation error, not a 500", malformed.status, 400);
}

/* ------------------------------------------------------------------ end -- */

const failed = checks.filter((x) => !x).length;
console.log(`\n${checks.length - failed}/${checks.length} passed`);

if (failed > 0) console.log("\nServer log:\n", serverLog);

await finish(failed === 0 ? 0 : 1);
