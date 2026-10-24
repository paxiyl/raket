import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Extends app.json rather than replacing it.
 *
 * It exists for one setting. `usesCleartextTraffic` has to be ON while the API
 * runs on http://localhost in Termux, and has to be OFF for anything shipped —
 * it permits unencrypted HTTP to any host, which on a release build means a
 * customer's address and order can be read on a café's wifi.
 *
 * Hardcoding it in app.json meant remembering to take it out before launch,
 * and a security flag you have to remember is a security flag that ships. So
 * it is derived from the API URL instead: point the app at https and the
 * permission disappears from the manifest by itself.
 */
const DEV_FALLBACK_API = "http://localhost:8000/api/v1";

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? DEV_FALLBACK_API;
  const isPlainHttp = apiUrl.startsWith("http://");

  // app.json's own plugins array, with the build-properties entry rewritten.
  // Typed as the tuple Expo expects, so the mapped result stays assignable.
  const plugins: ExpoConfig["plugins"] = (config.plugins ?? []).map((plugin) => {
    if (!Array.isArray(plugin) || plugin[0] !== "expo-build-properties") return plugin;

    const [name, options] = plugin as [string, { android?: Record<string, unknown> }];

    return [
      name,
      { ...options, android: { ...options.android, usesCleartextTraffic: isPlainHttp } },
    ] as [string, unknown];
  });

  /*
    A distributable build with no API address is refused, not warned about.

    Without `EXPO_PUBLIC_API_URL` the app falls back to localhost, which on a
    phone is the phone. The APK installs, opens, and cannot reach Raket at all
    — and the only trace of the cause is a console line in a build log nobody
    reads after a green build. `EAS_BUILD_PROFILE` is set by `eas build` and by
    nothing else, so `expo start` and a local `prebuild` are unaffected.
  */
  const easProfile = process.env.EAS_BUILD_PROFILE;
  /*
    The `development` profile is excluded on purpose: a dev client loads its
    JavaScript from a Metro server at run time, so the address it will use is
    not known when the native shell is built, and refusing it would block the
    one build that is allowed not to know.
  */
  const isDistributable = Boolean(easProfile) && easProfile !== "development";

  if (isDistributable && !process.env.EXPO_PUBLIC_API_URL) {
    throw new Error(
      `[raket] Refusing to build the "${easProfile}" profile without EXPO_PUBLIC_API_URL.` +
        " The app would look for the API on the phone itself and never reach it." +
        " Set it to the deployed API, including the /api/v1 path — for example" +
        " https://<your-service>.onrender.com/api/v1 — in eas.json's env for this" +
        " profile, or as an EAS environment variable.",
    );
  }

  if (!isPlainHttp) {
    console.log(`[raket] API is ${apiUrl} — cleartext HTTP is disabled in this build.`);
  } else {
    console.warn(
      `[raket] API is ${apiUrl} — cleartext HTTP is ENABLED. Correct for a local` +
        " API, never for a build you distribute. Set EXPO_PUBLIC_API_URL to an" +
        " https:// address before releasing.",
    );
  }

  return { ...config, name: config.name ?? "Raket", plugins, slug: config.slug ?? "raket-delivery" };
};
