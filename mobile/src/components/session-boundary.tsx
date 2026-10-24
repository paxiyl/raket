import { Image } from "expo-image";
import { ActivityIndicator, View } from "react-native";
import { useUniwind } from "uniwind";

const mark = require("../../assets/images/logo-mark-white.png");

/**
 * Shown while the stored token and /auth/me decide which screen comes first.
 * The redirect itself lives in `useProtectedRoute`, mounted by the root layout.
 *
 * Deliberately identical to the splash screen — same colour, same mark, same
 * size — so the handover from the native splash is invisible.
 *
 * The colour was still Chowly's teal, `#00BFA5`, while app.json's
 * `expo-splash-screen` block had moved to Raket green and grown a dark
 * variant. The comment above it claimed the two matched, so nothing read as
 * wrong until the app ran: the native splash faded out green and this faded in
 * teal, on every single launch. Both values now come from the same place the
 * native splash is built from.
 */
const SPLASH_BACKGROUND = { dark: "#10140F", light: "#1FA85C" } as const;
const MARK_WIDTH = 144;

export function SessionLoading() {
  const { theme } = useUniwind();

  return (
    <View
      className="flex-1 items-center justify-center gap-3"
      style={{ backgroundColor: SPLASH_BACKGROUND[theme === "dark" ? "dark" : "light"] }}
    >
      {/* expo-image ignores className for sizing, so the box is a style. */}
      <Image
        contentFit="contain"
        source={mark}
        style={{ height: MARK_WIDTH, width: MARK_WIDTH }}
      />
      <ActivityIndicator color="white" size="large" />
    </View>
  );
}
