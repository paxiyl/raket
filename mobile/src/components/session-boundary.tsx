import { Image } from "expo-image";
import { ActivityIndicator, View } from "react-native";
import { useUniwind } from "uniwind";

const mark = require("../../assets/images/logo.png");

/*
  The two colours `expo-splash-screen` is configured with in app.json.

  Literals, and they have to stay in step with that file by hand: the native
  splash is built from app.json at prebuild time and cannot read a CSS
  variable. They are the LOGO's red rather than a theme token, because what
  this has to match is the app icon the person just tapped — a white mark on a
  green field after a red icon reads as the wrong app opening.
*/
const SPLASH_BACKGROUND = { dark: "#8E0603", light: "#EB0A06" } as const;
// Wider than the old mark: the badge carries the name and a ribbon of type,
// and at 144 those were present but unreadable.
const MARK_WIDTH = 230;

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
