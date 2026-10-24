import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useUniwind } from "uniwind";

import { Button } from "@/components/ui/button";
import { useApiWake, WAKE_REVEAL_MS } from "@/features/system/use-api-wake";
import { BRAND } from "@/lib/brand";
import { API_URL_CONFIGURED } from "@/lib/health";

const mark = require("../../assets/images/logo-mark-white.png");

/*
  The same two colours `expo-splash-screen` is configured with in app.json, so
  the hand-off from the native splash to this is a continuation rather than a
  flash. They are literals for that reason: these have to match the native
  splash, which is built from app.json at prebuild time and cannot read a
  CSS variable.
*/
const SPLASH_BACKGROUND = { dark: "#10140F", light: "#1FA85C" } as const;
const MARK_WIDTH = 144;

type Props = {
  /** Rendered once the API answers. */
  children: React.ReactNode;
};

/**
 * The launch warm-up, over the app rather than instead of it.
 *
 * Two things had to be true at once. The router has to stay mounted — swapping
 * the navigator for a loading screen leaves expo-router on a route whose
 * navigator no longer exists, which is the blank-screen wedge
 * `use-protected-route.ts` already documents. And the API's queries must not
 * fire into a sleeping service. So the navigator is always rendered, this sits
 * on top of it, and the holding-back happens in the request gate
 * (`lib/api-gate.ts`) instead of here.
 *
 * The native splash is NOT held while this runs. It is hidden as soon as the
 * fonts are ready, which is a local task that finishes in milliseconds —
 * holding a native splash on a network call is how an app looks frozen, with
 * no spinner, no copy and no way to retry, for as long as the network takes.
 */
export function ApiWakeScreen({ children }: Props) {
  const wake = useApiWake();
  const { theme } = useUniwind();
  const queryClient = useQueryClient();

  /*
    Nothing for the first beat.

    A warm API answers in well under a second, which is every launch after the
    first of the day. Showing "Waking up our servers" for 200ms and taking it
    away again reads as a glitch, so the screen waits before admitting it is
    waiting.
  */
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), WAKE_REVEAL_MS);

    return () => clearTimeout(timer);
  }, []);

  /*
    Anything that went out while the API was unreachable has already failed and
    is sitting in the cache as an error. Reaching `ready` after that has to
    refetch, or the customer is returned to an app full of error states by a
    screen that just told them everything is fine.
  */
  const hadFailed = useRef(false);

  useEffect(() => {
    if (wake.state === "failed") {
      hadFailed.current = true;

      return;
    }

    if (wake.state !== "ready" || !hadFailed.current) return;

    hadFailed.current = false;
    void queryClient.invalidateQueries();
  }, [queryClient, wake.state]);

  const background = SPLASH_BACKGROUND[theme === "dark" ? "dark" : "light"];
  const degraded = wake.last?.state === "degraded";
  /*
    A release build with no API address is not a network problem, and telling
    someone to check their connection would send them looking for a fault that
    is not theirs. In development the localhost fallback is correct, so this
    only speaks up in a shipped build.
  */
  const misconfigured = !API_URL_CONFIGURED && !__DEV__;

  return (
    <View className="flex-1">
      {children}

      {wake.state === "ready" ? null : (
        <View
          accessibilityLiveRegion="polite"
          className="absolute inset-0 items-center justify-center px-gutter"
          style={{ backgroundColor: background }}
        >
          <Image
            contentFit="contain"
            source={mark}
            style={{ height: MARK_WIDTH, width: MARK_WIDTH }}
          />

          {/* Before the reveal this is the splash and nothing else, so a warm
              launch never shows a message about waiting. */}
          {!revealed ? null : wake.state === "failed" ? (
            <View className="mt-6 items-center">
              <Ionicons color="rgba(255,255,255,0.9)" name="cloud-offline-outline" size={30} />

              <Text className="mt-4 text-center font-title text-title text-white">
                We can&apos;t reach {BRAND.name}
              </Text>

              <Text className="mt-2 max-w-xs text-center font-sans text-body text-white/85">
                {misconfigured
                  ? "This build has no API address. It was built without EXPO_PUBLIC_API_URL, so it is looking for the server on this phone."
                  : degraded
                    ? "Our server is up but still connecting to its database. Nothing is lost — give it a moment."
                    : "Check your connection, or try again in a minute. Our servers may still be starting up."}
              </Text>

              <View className="mt-6 self-stretch px-4">
                <Button label="Try again" onPress={wake.retry} variant="outline-inverse" />
              </View>

              <Text className="mt-4 text-center font-sans text-caption text-white/60">
                {wake.attempt} {wake.attempt === 1 ? "attempt" : "attempts"} over{" "}
                {wake.elapsedSeconds}s
              </Text>
            </View>
          ) : (
            <View className="mt-6 items-center">
              <ActivityIndicator color="white" size="large" />

              <Text className="mt-5 text-center font-title text-section text-white">
                {degraded ? `Almost there…` : `Starting ${BRAND.name}…`}
              </Text>

              <Text className="mt-2 max-w-xs text-center font-sans text-body text-white/85">
                {degraded
                  ? "Our server is connecting to its database."
                  : "Waking up our servers — this can take a little longer after a quiet spell."}
              </Text>

              {/* Only once the wait is long enough that a way out is worth
                  offering, rather than a button that flickers past. */}
              {wake.elapsedSeconds >= 8 ? (
                <Text className="mt-4 text-center font-sans text-caption text-white/60">
                  {wake.elapsedSeconds}s
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
