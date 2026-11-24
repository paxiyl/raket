# Google sign-in: the complete setup

Raket's Google sign-in code is complete on all three surfaces and has never
worked, because the configuration around it has never been finished. This is the
Google Cloud Console work, in the order it has to happen, with a way to verify
each step before moving to the next.

Steps that need your Google, Expo or Render account are marked **`[YOU]`**.
Nothing in this document has been executed — this container has no Google
credentials. Every client ID below is written as a placeholder shape, never a
value that could be mistaken for real.

- [The one thing to understand first](#the-one-thing-to-understand-first)
- [What is wrong right now](#what-is-wrong-right-now)
- [1. Pick the Google Cloud project](#1-pick-the-google-cloud-project)
- [2. The OAuth consent screen](#2-the-oauth-consent-screen)
- [3. Create the Web client](#3-create-the-web-client)
- [4. Collect every SHA-1, then create the Android clients](#4-collect-every-sha-1-then-create-the-android-clients)
- [5. Regenerate google-services.json](#5-regenerate-google-servicesjson)
- [6. Put the web client ID in all three places](#6-put-the-web-client-id-in-all-three-places)
- [7. Verify end to end](#7-verify-end-to-end)
- [Expo Go will not work](#expo-go-will-not-work)
- [The failure table](#the-failure-table)
- [Still needs you](#still-needs-you)

---

## The one thing to understand first

**The same WEB client ID goes in all three places. The Android client ID goes
nowhere in your code at all.**

| Where | Variable | Which client ID |
|---|---|---|
| API | `GOOGLE_CLIENT_IDS` | **Web** |
| Admin SPA | `VITE_GOOGLE_CLIENT_ID` | **Web** |
| Mobile | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | **Web** |
| Android OAuth client | — | *never named in code* |

This is counter-intuitive and it is correct. Your reading of `DEPLOYMENT.md` is
right, and here is the confirmation you asked for, from the primary sources.

**Why the web ID is the audience, even for the Android app.** Google's
Android backend-auth guide says to request the token with your *server's* web
client ID:

> When you configure Google Sign-in, call the `requestIdToken` method and pass
> it your **server's web client ID**.
> — <https://developers.google.com/identity/sign-in/android/backend-auth>

So the `aud` claim on the token the phone produces is the **web** client ID, and
the same page's verification rules are what `api/src/config/google.config.ts`
implements:

> - The ID token is properly signed by Google.
> - The value of `aud` in the ID token is equal to one of your app's client IDs.
> - The value of `iss` in the ID token is equal to `accounts.google.com` or `https://accounts.google.com`.
> - The expiry time (`exp`) of the ID token has not passed.

**Why `new OAuth2Client()` with no arguments is right**, and why no client
secret is involved anywhere. Google's own Node.js sample is, line for line, what
this codebase already does:

```js
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client();

const ticket = await client.verifyIdToken({
  idToken: token,
  audience: WEB_CLIENT_ID,  // Specify the WEB_CLIENT_ID of the app that accesses the backend
  // Or, if multiple clients access the backend:
  //[WEB_CLIENT_ID_1, WEB_CLIENT_ID_2, WEB_CLIENT_ID_3]
});
```

> The `verifyIdToken` function verifies the JWT signature, the `aud` claim, the
> `exp` claim, and the `iss` claim.
> — <https://developers.google.com/identity/gsi/web/guides/verify-google-id-token>

That confirms three things about `google.config.ts`: `audience` takes an array
(so the comma-split is fine), no credentials are needed on the client, and
signature/issuer/expiry are all handled for you. **The code is correct. Do not
change it.**

**Why the Android client still has to exist, despite never being named.** The
`@react-native-google-signin` docs are explicit that the Android clients are
created purely so Google recognises the app, and that you never use their IDs:

> For **each** of the SHA-1 fingerprints you obtained, create an OAuth Client ID
> of type Android in Google Cloud Console […] You will **NOT** need the created
> IDs later - the only goal here is for them to be created in the Google Cloud
> Console.
> — <https://react-native-google-signin.github.io/docs/setting-up/get-config-file>

And on what `webClientId` must be:

> `webClientId: '<FROM DEVELOPER CONSOLE>'` — client ID of type **WEB** for your
> server. **Required to get the `idToken`** on the user object, and for offline
> access.
> — <https://react-native-google-signin.github.io/docs/original>

Note "required to get the `idToken`". Without a correct web client ID the native
sign-in can *succeed* and hand back a user with **no token** — which is exactly
the branch `mobile/src/features/auth/google-sign-in.ts` already handles with
*"Google signed you in but sent no token. Check the web client id."*

And the troubleshooting page, on the error you will see if you get this wrong:

> `DEVELOPER_ERROR` or `code: 10` […] This is always (! **absolutely always** !)
> a configuration mismatch between your app and the server-side setup […] If
> you're passing `webClientId` […] make sure it's correct and that it is of type
> **web (NOT Android!)**.
> — <https://react-native-google-signin.github.io/docs/troubleshooting>

**Your understanding is confirmed on every point.** You can go into the Console
knowing the plan is right.

---

## What is wrong right now

Four separate blockers. All four must be fixed; fixing any three leaves it
broken.

### 1. `mobile/google-services.json` has an empty `oauth_client` array — confirmed

```json
"client": [
  {
    "client_info": {
      "mobilesdk_app_id": "1:1006668530225:android:…",
      "android_client_info": { "package_name": "in.raketdelivery.app" }
    },
    "oauth_client": [],
    "api_key": [ { "current_key": "AIza…" } ],
    "services": { "appinvite_service": { "other_platform_oauth_client": [] } }
  }
]
```

- **No Android client** (`client_type: 1`) — so no SHA-1 is registered, and Google rejects the app before any token exists. This is the `DEVELOPER_ERROR` path the code comments warn about.
- **No web client** (`client_type: 3`) either — you asked specifically, and the answer is no. Firebase normally writes one in. Its absence means this file was generated before any OAuth client existed in the project, so the whole file is stale, not just incomplete.
- `other_platform_oauth_client` is also `[]`.

The file is otherwise valid: project `raket-c2e81`, package name
`in.raketdelivery.app`, matching `app.json`'s `android.package`. The Android API
key present is a Firebase API key, which is public by design and not the
problem.

Verify for yourself at any time:

```bash
cd api && npx tsx ./src/scripts/checks/google-signin.check.mjs
```

### 2. `eas.json` never passes `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to the build

Neither the `preview` nor the `production` profile declares it. Since
`isGoogleConfigured()` is `Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)`
and `GoogleButton` returns `null` when that is false, **every APK you have ever
built has had the Google button hidden entirely** — before any of the Console
problems could even be reached.

An exported shell variable does not help: EAS builds run on Expo's machines and
only see what the profile declares.

**And the CI path does not fix it either.**
`.github/workflows/android-build.yml` has a *"Point the build at the API"* step
that rewrites `eas.json` before calling `eas build` — but it writes exactly one
key:

```js
json.build[profile].env = {
  ...(json.build[profile].env || {}),
  EXPO_PUBLIC_API_URL: process.env.API_URL,
};
```

So a workflow-built APK gets the API URL and still no Google client ID. Putting
the ID in `eas.json` ([§6c](#6c-mobile--compiled-into-the-apk-needs-a-new-build))
fixes both routes at once, because the spread preserves existing keys — which is
why that is the fix recommended here rather than a change to the workflow. If
you would rather pass it per-build, the workflow needs a new input and another
line in that `env` object; it is a three-line change, but it is not needed.

### 3. `render.yaml` never passes `VITE_GOOGLE_CLIENT_ID` to the build

Same failure, on the browser. The blueprint declared `GOOGLE_CLIENT_IDS` (the
server half) but no `VITE_GOOGLE_CLIENT_ID`, and that value is compiled into the
bundle at build time. `google-sign-in-button.tsx` returns `null` without it. So
the admin button has never rendered either, whatever the server reported.

**Fixed.** [`render.yaml`](render.yaml) now declares `VITE_GOOGLE_CLIENT_ID` as
a `sync: false` service variable, which Render exposes to the build as well as
the runtime, and `render-build.sh` runs the admin build, so Vite picks it up
from the environment. You still have to enter the value in the dashboard — see
[§ 6b](#6b-admin--build-time-needs-a-redeploy) — and a **redeploy**, not a
restart, is what applies a change to it.

### 4. `GOOGLE_CLIENT_IDS` is almost certainly unset on the server

With it empty, `GET /api/v1/auth/providers` reports `{ google: false }` and
*both* clients hide their button by design. Check:

```bash
curl -s https://<your-host>/api/v1/auth/providers
```

**Note the layering.** Even with the Console fully correct, blockers 2 and 3
would keep both buttons invisible, and blocker 4 would keep them invisible even
then. That is why the symptom has always been *"nothing happens"* rather than an
error — there was never a button to press.

---

## 1. Pick the Google Cloud project

> **`[YOU]`** <https://console.cloud.google.com> → project picker.
>
> Use the project that already backs `google-services.json`: **`raket-c2e81`**
> (project number `1006668530225`). Do not create a new one — a new project
> means a new `mobilesdk_app_id`, and `google-services.json` would have to be
> regenerated from scratch rather than updated.
>
> If that project was created through Firebase (the `firebasestorage.app` bucket
> says it was), you can do all of this from either console; they are the same
> project. The Firebase route is slightly easier because it generates
> `google-services.json` for you.

**Verify:** the project number shown in the Console matches `1006668530225`
from `mobile/google-services.json`. If it does not, you are in the wrong
project, and every ID you create will be useless to this app.

---

## 2. The OAuth consent screen

Nothing works until this exists, and its error messages do not say so.

> **`[YOU]`** **APIs & Services → OAuth consent screen**.
>
> | Field | Value |
> |---|---|
> | User type | **External** |
> | App name | `Raket` |
> | User support email | yours |
> | Developer contact | yours |
> | Scopes | `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` — **nothing else** |
>
> Leave it in **Testing** while you are testing, and **add your own Google
> account under *Test users***. In Testing mode only listed test users can sign
> in; everyone else gets "access blocked" — which looks exactly like a
> misconfigured client.
>
> Publish to **Production** before real customers use it. With only those three
> scopes it is non-sensitive and needs no Google review.

`mobile/src/features/auth/google-sign-in.ts` requests exactly
`["email", "profile"]`, so do not add more. Extra scopes mean a longer consent
screen and, for some, a verification review.

**Verify:** the consent screen shows "Testing" or "In production", and your own
account is in *Test users* if it is Testing.

---

## 3. Create the Web client

This is the one whose ID you will use three times.

> **`[YOU]`** **APIs & Services → Credentials → Create credentials → OAuth
> client ID → Application type: Web application**.
>
> | Field | Value |
> |---|---|
> | Name | `Raket web (admin + token audience)` |
> | Authorised JavaScript origins | `https://<your-service>.onrender.com` and `http://localhost:5173` |
> | Authorised redirect URIs | **none** |
>
> Then copy the **Client ID**. It looks like
> `<digits>-<handle>.apps.googleusercontent.com`.
>
> **Ignore the client secret.** Nothing in Raket uses it. Both clients obtain
> the ID token themselves and the server only verifies a signature — there is no
> redirect dance and no secret to store. If you ever find yourself pasting a
> value starting `GOCSPX-` into a config, stop: the diagnostic check rejects it.

A Firebase-created project usually already has a web client called something
like *"Web client (auto created by Google Service)"*. Reuse it rather than
making a second one — and if you do reuse it, **still add the JavaScript origins
above**, because an auto-created one has none.

**Authorised JavaScript origins matter only for the browser.** Google Identity
Services refuses to render the button if the page's origin is not listed. The
phone does not use them at all. Origins are scheme + host, with **no trailing
slash and no path**.

**Verify before moving on:**

1. The Credentials list shows your client with **Type: Web application**. That column is the only authority on the type — a web and an Android client ID are identical in shape.
2. Set it on the server and ask the server:

   ```bash
   # Render dashboard → your service → Environment
   GOOGLE_CLIENT_IDS=<digits>-<handle>.apps.googleusercontent.com
   ```

   then, after the restart:

   ```bash
   curl -s https://<your-host>/api/v1/auth/providers
   # {"message":"Providers","data":{"google":true}}
   ```

   `{"google":true}` means the server parsed it. It does **not** mean the ID is
   of type Web — only the Console's Type column tells you that.

---

## 4. Collect every SHA-1, then create the Android clients

The order matters: collect **all** the fingerprints first, then create one
Android client per fingerprint. Missing one means sign-in works on one build and
fails on another, which is the hardest version of this bug to diagnose.

Your app can be signed by **several different keys**, and each needs its own
Android OAuth client:

| Build | Signing key | When you need it |
|---|---|---|
| `npx expo run:android` locally | the debug keystore | developing on a device/emulator |
| EAS `preview` / `production` | the EAS-managed upload key | every APK/AAB you distribute |
| Installed from the Play Store | **Google's own app-signing key** | after you publish — Play re-signs your upload |

### Getting each SHA-1

> **`[YOU]`** **The universal method — use this one.** Works for any APK
> regardless of how it was built, which is why the library's docs call it the
> only universal option. With the app installed on a device/emulator, or the APK
> file to hand:
>
> ```bash
> npx @react-native-google-signin/config-doctor
> ```
>
> It reads the actual certificate out of the actual artifact and tells you what
> to register. If you only run one command from this document, run this one.

> **`[YOU]`** **For EAS-managed credentials** — this is the one that covers the
> APKs you distribute:
>
> ```bash
> cd mobile
> npx eas credentials
> ```
>
> Choose **Android** → the **production** (or preview) build profile → **Keystore:
> Manage everything needed to build your project** . It prints the keystore
> information including the **SHA-1 Fingerprint**. EAS generated and holds this
> key; you never see the file itself.

> **`[YOU]`** **For the local debug keystore** — only needed if you want sign-in
> to work with `npx expo run:android`:
>
> ```bash
> keytool -list -v \
>   -keystore ~/.android/debug.keystore \
>   -alias androiddebugkey \
>   -storepass android -keypass android
> ```
>
> Or, once `android/` has been generated by a prebuild:
>
> ```bash
> cd mobile/android && ./gradlew signingReport
> ```
>
> Note that `android/` is gitignored in this repository and regenerated by
> `npx expo prebuild --clean`, which does not change the debug keystore — that
> lives in `~/.android/`.

> **`[YOU]`** **For the Play Store signing key** — only after you have published:
> Play Console → your app → **Release → Setup → App signing** → copy the
> **SHA-1** under *App signing key certificate*. There can be **more than one**;
> register all of them. Skip this step entirely until the app is actually in the
> Play Store.

**SHA-1, not SHA-256.** The docs are emphatic about this and the Console accepts
either format silently.

### Creating the Android clients

**Do this in the FIREBASE console, not the Cloud Console.** Both can create an
Android OAuth client, and only one of them links it to the Firebase app that
generates `google-services.json`.

> **`[YOU]`** For **each** fingerprint collected above: **Firebase Console →
> Project settings (gear) → Your apps →** the Android app
> (`in.raketdelivery.app`) **→ SHA certificate fingerprints → Add
> fingerprint**. Paste the SHA-1 and save.
>
> Firebase creates the matching Android OAuth client in the underlying Google
> Cloud project for you, and — the part that matters — writes it into
> `google-services.json` as a `client_type: 1` entry. You never name the client
> or see its ID.

**Why not the Cloud Console.** Creating the client by hand there
(*Credentials → Create credentials → OAuth client ID → Android*) produces a
client that is real and correct and that Firebase does not know belongs to this
app. Regenerating `google-services.json` afterwards gives you a file with the
web client in it and **no `client_type: 1` entry at all**, which is
indistinguishable from having done nothing. Observed, not theorised — it is
what happened on this project.

A related tell: if the Cloud Console offered you a **downloadable credentials
JSON** for the client you just made, with an `"installed"` key in it, that is
not an Android client. Android clients have no such download. A `Desktop app`
or `iOS` client has one, looks plausible, and will never satisfy Google
Sign-In. Delete it and use the Firebase route.

**The package name must be exactly `in.raketdelivery.app`** — that is
`android.package` in `app.json` and `package_name` in `google-services.json`,
and they already agree. A mismatch here is one of the named
`DEVELOPER_ERROR` causes.

**Verify in the file, not in a console.** After § 5 regenerates
`google-services.json`, it must contain one `client_type: 1` entry per
fingerprint, each with a `certificate_hash`. The diagnostic asserts exactly
this once `GOOGLE_CLIENT_IDS` is set:

```bash
cd api && GOOGLE_CLIENT_IDS=<your web client id> \
  npx tsx ./src/scripts/checks/google-signin.check.mjs
```

---

## 5. Regenerate google-services.json

The in-repo file is stale. It must be re-downloaded **after** steps 3 and 4,
because its contents are a snapshot of the clients that existed when it was
generated.

> **`[YOU]`** **Firebase Console** (easiest) → **Project settings** → *Your
> apps* → the Android app → **Download `google-services.json`**.
>
> Before downloading, check that **Authentication → Sign-in method → Google** is
> **enabled**. If this project uses Firebase Auth and Google is not enabled
> there, sign-in fails with `DEVELOPER_ERROR` even with every OAuth client
> correct — it is the first thing the library's troubleshooting page tells you
> to check.
>
> Replace `mobile/google-services.json` with the downloaded file and commit it.
> It contains no secrets: client IDs and the Android API key are both public by
> design, which is why it is checked in.

**Verify — this is the step with a hard check:**

```bash
cd api && npx tsx ./src/scripts/checks/google-signin.check.mjs
```

You want, under `=== mobile/google-services.json ===`:

```
  oauth_client entries          2        (or more)
    client_type 1 (Android)     1        (or more — one per SHA-1)
    client_type 3 (Web)         1
```

with a SHA-1 printed against each Android entry, and — once `GOOGLE_CLIENT_IDS`
is set — the line confirming the web client appears in **both**
`google-services.json` and `GOOGLE_CLIENT_IDS`. While `client_type 1` is `0`,
nothing else you do will make the phone work.

`app.json` already wires this file in correctly, so nothing there needs editing:

```json
"android": { "googleServicesFile": "./google-services.json" },
"plugins": [ "@react-native-google-signin/google-signin", ... ]
```

That matches the library's documented Expo-with-Firebase setup exactly.

---

## 6. Put the web client ID in all three places

The **same** string, three times. The two client-side ones are **build-time**:
changing them needs a rebuild, not a restart.

### 6a. API — runtime, restart is enough

> **`[YOU]`** Render dashboard → your service → **Environment**:
>
> ```
> GOOGLE_CLIENT_IDS=<digits>-<handle>.apps.googleusercontent.com
> ```
>
> `render.yaml` declares it `sync: false`, so Render prompts for the value
> rather than taking it from the repository.

Comma-separated if you ever need several audiences, no spaces required (the
server trims). **Only web client IDs belong here.** An Android ID in this list
matches no token's `aud` and every sign-in returns 401 — the diagnostic check
detects exactly that mistake by cross-referencing `google-services.json`.

### 6b. Admin — build time, needs a redeploy

> **`[YOU]`** Render dashboard → your service → **Environment**:
>
> ```
> VITE_GOOGLE_CLIENT_ID=<digits>-<handle>.apps.googleusercontent.com
> ```
>
> The **same string** as `GOOGLE_CLIENT_IDS` above. Then **trigger a manual
> deploy**, not a restart.

On Render a service environment variable is present during the build as well as
at runtime, and `render-build.sh` runs `npm run build --prefix admin`, so Vite
reads it straight from the environment. Nothing has to pass it explicitly.

**Why a redeploy and not a restart:** Vite compiles the value into the
JavaScript it emits. A restart serves the bundle that was already built, with
whatever value was set when that build ran — so changing the variable alone
does nothing visible.

For local development, put it in `admin/.env` (`admin/.env.example` documents
it). The root `Dockerfile`'s `admin-build` stage declares a matching `ARG` for
the Northflank path, which is prepared but not in use.

### 6c. Mobile — compiled into the APK, needs a new build

> **`[YOU]`** Edit `mobile/eas.json` and add it to **both** distributable
> profiles:
>
> ```json
> "preview": {
>   "env": {
>     "EXPO_PUBLIC_API_URL": "https://<your-host>/api/v1",
>     "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<digits>-<handle>.apps.googleusercontent.com"
>   },
>   "distribution": "internal",
>   "android": { "buildType": "apk" }
> },
> "production": {
>   "env": {
>     "EXPO_PUBLIC_API_URL": "https://<your-host>/api/v1",
>     "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "<digits>-<handle>.apps.googleusercontent.com"
>   },
>   "autoIncrement": true,
>   "android": { "buildType": "app-bundle" }
> }
> ```
>
> This is blocker 2 from [What is wrong right now](#what-is-wrong-right-now) and
> it is the single easiest thing on this list to forget, because nothing warns
> about it — the button is simply absent.

For local development, `mobile/.env` (see `mobile/.env.example`).

**Verify all three:**

```bash
# API — the server parsed it
curl -s https://<your-host>/api/v1/auth/providers
# {"message":"Providers","data":{"google":true}}

# ADMIN — the ID is actually in the shipped bundle
curl -s https://<your-host>/ | grep -o 'assets/index-[^"]*\.js'
curl -s https://<your-host>/assets/index-<hash>.js \
  | grep -oiE '[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com'
# must print your web client ID. No output = the button will not render.

# MOBILE — the button is visible on the sign-in screen at all.
# If it is not, the build has no EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
```

---

## 7. Verify end to end

### The admin browser flow

1. Open `https://<your-host>/login`. **The Google button is visible.** If not: either `/auth/providers` says `false` (6a), or the bundle has no client ID (6b) — the two `curl`s above tell you which.
2. Click it. The account chooser appears. If instead the console shows an origin error, the page's origin is missing from *Authorised JavaScript origins* (step 3).
3. Pick an account. You land in the backoffice — **but only if that account's Raket user has `role: "admin"`.** Any other role is signed out with *"This account cannot use the backoffice"*, which is correct behaviour, not a bug. A brand-new Google account is created as `customer`.
4. **Reload the page.** The session must survive. This is what proves the cookie was set — and it is the exact bug that was fixed in `auth.controller.ts`, where Google sign-in returned 200 without setting the cookie and the next `/auth/me` came back 401.
5. Sign out.

So to test the admin path, sign in with Google using the **same email address as
your existing admin account**. `signInWithGoogle` links by email: an existing
user with that address gets `googleId` attached and keeps their role.

### The phone flow

Requires a dev build or a real APK — see
[Expo Go will not work](#expo-go-will-not-work).

1. The **Continue with Google** button is visible on the welcome / sign-in / sign-up screens. If not, the build has no `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (6c) or the server says `false` (6a) — `useGoogleAvailable()` requires both.
2. Tap it. The native account chooser appears.
3. Pick an account. You are signed in and land on the customer home.

If you get *"Google rejected this app's credentials…"*, that is the
`DEVELOPER_ERROR` branch: the SHA-1 of the key that signed **this specific
build** is not registered. Run `npx @react-native-google-signin/config-doctor`
against the installed app.

If you get *"Google signed you in but sent no token. Check the web client id"*,
the configured `webClientId` is not a valid **Web**-type client in this project.

---

## Expo Go will not work

**No, this cannot work in Expo Go.** The docs are unambiguous:

> This package **cannot be used in Expo Go** because it uses native code. This
> applies to both the Original and Universal modules.
>
> However, you can add custom native code to an Expo app by using a
> **development build**. That is the recommended approach for production apps […]
> — <https://react-native-google-signin.github.io/docs/setting-up/expo>

`@react-native-google-signin/google-signin` is in `mobile/package.json` as a
dependency with a config plugin in `app.json`, and config plugins only take
effect when native code is generated. Expo Go ships a fixed native binary that
does not contain this module, so `GoogleSignin.configure()` has nothing to call.
`expo-dev-client` is already a dependency, so the project is set up for this.

### The exact commands

> **`[YOU]`** **A development build** — install once, then iterate over Metro:
>
> ```bash
> cd mobile
> npx eas build --platform android --profile development
> ```
>
> Install the resulting APK, then `npx expo start --dev-client`. The
> `development` profile is `developmentClient: true`, `distribution: internal`,
> and is deliberately exempt from the `EXPO_PUBLIC_API_URL` requirement — a dev
> client gets its JavaScript from Metro at run time.
>
> **Caveat:** because it is exempt, a dev build falls back to
> `http://localhost:8000/api/v1`. Set `EXPO_PUBLIC_API_URL` in `mobile/.env` for
> the Metro process, or it will look for the API on the phone itself.

> **`[YOU]`** **A standalone preview APK** — closest to what you will ship, and
> what you want for testing release signing:
>
> ```bash
> cd mobile
> npx eas build --platform android --profile preview
> ```
>
> Do this **after** [§6c](#6c-mobile--compiled-into-the-apk-needs-a-new-build),
> or the button will not be in the build.

> **`[YOU]`** If `app.json`'s `extra.eas.projectId` is ever blank, run
> `npx eas init` first. It is currently populated, so you should not need to.

### Which SHA-1 does each build use?

| Build | Key | How to get its SHA-1 |
|---|---|---|
| `development` (EAS) | EAS-managed | `npx eas credentials` |
| `preview` (EAS) | EAS-managed — **the same key** as production by default | `npx eas credentials` |
| `production` (EAS) | EAS-managed upload key | `npx eas credentials` |
| `npx expo run:android` | local debug keystore | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android` |
| installed from Play Store | **Google's** app-signing key | Play Console → Release → Setup → App signing |
| *any of the above, universally* | whatever actually signed it | `npx @react-native-google-signin/config-doctor` |

EAS normally uses one keystore for all profiles in a project, so **one Android
OAuth client usually covers development, preview and production**. Confirm with
`npx eas credentials` rather than assuming — and if you later let Play re-sign,
its key is a *different* fingerprint that needs its own Android client. That is
the documented cause of *"login does not work when downloading from the Play
Store"*.

---

## The failure table

The checklist you asked for: every point the token path can break, in order,
with the symptom you would actually see.

| # | Stage | What breaks | Exact symptom | Fix |
|---|---|---|---|---|
| 1 | **Build-time, mobile** | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` not in the build | **No Google button anywhere in the app.** No error, no log. `isGoogleConfigured()` is false → `GoogleButton` returns `null`. | [§6c](#6c-mobile--compiled-into-the-apk-needs-a-new-build) |
| 2 | **Build-time, admin** | `VITE_GOOGLE_CLIENT_ID` not in the bundle | **No Google button on `/login`.** No error. `CLIENT_ID` undefined → component returns `null`. | [§6b](#6b-admin--build-argument-needs-a-rebuild) |
| 3 | **Runtime, server** | `GOOGLE_CLIENT_IDS` empty | Button hidden on **both** clients. `/auth/providers` → `{"google":false}`. Deliberate: both clients require server *and* own config. | [§6a](#6a-api--runtime-restart-is-enough) |
| 4 | **Native module** | running in **Expo Go** | Button may render in dev, then the native call fails — "module not found" / `GoogleSignin` undefined. | [Expo Go](#expo-go-will-not-work) |
| 5 | **Native module, release APK** | ProGuard stripped the module | Works in debug, **"module not found" in the release APK only**. Already guarded: `-keep class com.reactnativegooglesignin.** { *; }` is in `app.json`'s `extraProguardRules`. Do not remove it. | — |
| 6 | **Play Services** | missing / out of date on the device | *"Google Play Services is not available on this phone."* Handled: `PLAY_SERVICES_NOT_AVAILABLE`, with an update dialog offered first. | user's device |
| 7 | **Consent screen** | not configured, or account not a Test user while in Testing | Chooser opens, then **"Access blocked"** / "app not configured". Looks like a client error, is not. | [§2](#2-the-oauth-consent-screen) |
| 8 | **Android OAuth client** | **none exists** — today's state, `oauth_client: []` | **`DEVELOPER_ERROR` (code 10).** Surfaces as *"Google rejected this app's credentials. The signing key's SHA-1 fingerprint has to be registered on the OAuth client."* Sometimes disguised as a spurious `cancelled`. | [§4](#4-collect-every-sha-1-then-create-the-android-clients) |
| 9 | **Android OAuth client** | exists, but the **SHA-1 is for a different key** than signed this build | Identical `DEVELOPER_ERROR`. The classic *"works in debug, fails in release"* / *"works sideloaded, fails from Play Store"*. | `config-doctor` |
| 10 | **Android OAuth client** | package name ≠ `in.raketdelivery.app` | Identical `DEVELOPER_ERROR`. Named explicitly in the library's troubleshooting. | [§4](#4-collect-every-sha-1-then-create-the-android-clients) |
| 11 | **Firebase Auth** | Google not enabled as a sign-in method | Identical `DEVELOPER_ERROR`. First thing the docs say to check. | [§5](#5-regenerate-google-servicesjson) |
| 12 | **`google-services.json`** | stale / missing / not picked up | `DEVELOPER_ERROR`, or the native module cannot initialise. `app.json` already points at it. | [§5](#5-regenerate-google-servicesjson) |
| 13 | **`webClientId` wrong type** | an **Android** or iOS ID passed as `webClientId` | Sign-in *succeeds* but `idToken` is **null** → *"Google signed you in but sent no token. Check the web client id."* | [§3](#3-create-the-web-client) |
| 14 | **Browser, GIS script** | `accounts.google.com` unreachable | *"Google sign-in is unavailable right now. Use your email and password."* | network / CSP |
| 15 | **Browser, origins** | page origin not in *Authorised JavaScript origins* | Button fails to render; a `403`/origin error in the devtools console. **Not** visible in the UI. | [§3](#3-create-the-web-client) |
| 16 | **Transport** | token posted to `/auth/google` | Normal API failures. Mobile sends `{ idToken, intendedRole }`; admin sends `{ idToken }`. | — |
| 17 | **Server, audience** | `GOOGLE_CLIENT_IDS` holds an **Android** ID, or a different project's web ID | `verifyIdToken` throws on `aud` → **401**. Client shows *"Google sign-in failed."* The server is working correctly; the audience is wrong. | [§6a](#6a-api--runtime-restart-is-enough) + the diagnostic check |
| 18 | **Server, audience** | a client **secret** (`GOCSPX-…`) pasted into `GOOGLE_CLIENT_IDS` | Every token 401s. Caught by `google-signin.check.mjs`. | [§6a](#6a-api--runtime-restart-is-enough) |
| 19 | **Server, signature/expiry** | clock skew, or a replayed old token | 401. `verifyIdToken` checks `exp` and `iss` for you. | — |
| 20 | **Server, email** | Google account has no **verified** email | 401 *"This Google account has no verified email address."* | — |
| 21 | **Server, account state** | the Raket user is `isActive: false` | 401 *"This account has been deactivated"*. | backoffice |
| 22 | **Server, role** | `intendedRole` sent from the app ≠ the stored role | 401 *"This account is not registered as a …"*. Correct: Google proves identity, not authorisation. | — |
| 23 | **Server, role** | an **admin** account signing in from the phone | 401 *"Admin accounts sign in on the Raket backoffice, not the app."* Deliberate. | — |
| 24 | **Admin, role** | a non-admin signing in at `/login` | Signed straight back out: *"This account cannot use the backoffice"*. Deliberate — and it means a fresh Google account (created as `customer`) cannot get in. | sign in with the admin's email |
| 25 | **Admin, cookie** | cookie not set, or not `Secure` behind the proxy | 200, then the next `/auth/me` is **401** and you bounce back to `/login`. **Already fixed** — `setJwtAuthCookie` is called, and `trust proxy` is set. If this returns, check `NODE_ENV=production` and that you are on HTTPS. | — |

Stages 1–3 are where you are now. Stages 8–12 are where you will be after
fixing 1–3, until the Console work is done.

---

## Still needs you

| # | What | Where |
|---|---|---|
| 1 | Confirm the Console project is `raket-c2e81` / `1006668530225` | [§1](#1-pick-the-google-cloud-project) |
| 2 | Configure the OAuth consent screen; add yourself as a Test user | [§2](#2-the-oauth-consent-screen) |
| 3 | Create (or adopt) the **Web** client; add the JavaScript origins | [§3](#3-create-the-web-client) |
| 4 | Collect **every** SHA-1, create one **Android** client per fingerprint | [§4](#4-collect-every-sha-1-then-create-the-android-clients) |
| 5 | Enable Google in Firebase Auth, re-download `google-services.json`, commit it | [§5](#5-regenerate-google-servicesjson) |
| 6 | Set the web client ID in all three places; rebuild admin **and** APK | [§6](#6-put-the-web-client-id-in-all-three-places) |
| 7 | Build a dev build or preview APK — Expo Go cannot work | [Expo Go](#expo-go-will-not-work) |
| 8 | Walk the verification in [§7](#7-verify-end-to-end) | [§7](#7-verify-end-to-end) |

### What could not be verified without your accounts

| | |
|---|---|
| Everything in Google Cloud Console | No Google credentials here. All Console state is inferred from `google-services.json`, which is in the repository. |
| Whether a Web client already exists in `raket-c2e81` | Likely (Firebase usually creates one), but `google-services.json` has no `client_type: 3` entry, so it cannot be confirmed from here. |
| Any SHA-1 fingerprint | Needs your EAS credentials or your machine's debug keystore. |
| Whether the deployed server has `GOOGLE_CLIENT_IDS` set | One `curl` to `/api/v1/auth/providers` answers it. |
| Whether any existing APK carries the web client ID | Needs the artifact. Given `eas.json`, almost certainly not. |
| A real sign-in, on either surface | Needs a Google account and a device. |

**What *was* verified here, by running it:** `npm run check` passes with the
new `google-signin.check.mjs` wired into it (16 suites, 0 failures); that check
correctly PASSES on this unconfigured tree and correctly FAILS when given a
client secret, a semicolon separator, a duplicate, a malformed id, a
well-formed id with the Android half still missing, and an Android client id
used as an audience. Also, in the built container: Google sign-in reports
`{"google":false}` on `/auth/providers` with `GOOGLE_CLIENT_IDS` unset, and a
password login sets `accessToken=…; HttpOnly; Secure; SameSite=Lax` with
`/auth/me` then succeeding on the cookie alone — which is the half of failure
mode 25 that can be checked without Google.

**What was verified by reading the primary sources:** the client-ID semantics
([The one thing to understand first](#the-one-thing-to-understand-first)); that
`google-services.json` has an empty `oauth_client` with neither an Android nor a
web client; that `eas.json` and `render.yaml` omit the two build-time variables;
and that `api/src/config/google.config.ts` matches Google's own Node.js sample
for `verifyIdToken`. The server-side code needs no changes.
