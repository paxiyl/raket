import { Text, View } from "react-native";

import { BRAND } from "@/lib/brand";
import { RocketMark } from "./rocket-mark";

type Props = {
  /** "brand" renders green for light surfaces, "inverse" renders white over media. */
  tone?: "brand" | "inverse";
  size?: "hero" | "title" | "compact";
  /** Shows "(Hindaun)" under the name. On for first-run and auth, off in chrome. */
  showCity?: boolean;
};

const nameSize = {
  compact: "text-title",
  hero: "text-hero",
  title: "text-display",
} as const;

/** The mark leads the name, sized to the cap height of each step. */
const markSize = { compact: 24, hero: 56, title: 32 } as const;

/**
 * The Raket lockup: the rocket, then "Raket" in text colour and "Delivery" in
 * the brand green, so the name reads as one word while still carrying the
 * colour. Set in the title weight with tight tracking.
 *
 * The rocket is drawn (`RocketMark`), not an image: it stays sharp at every
 * size, follows the theme, and is the same geometry the app icon and splash
 * are rendered from, so the thing on the home screen and the thing in the
 * header are one object rather than two drawings that drift apart.
 */
export function Wordmark({ tone = "brand", size = "title", showCity = false }: Props) {
  const inverse = tone === "inverse";

  return (
    <View className="flex-row items-center gap-2">
      <RocketMark size={markSize[size]} tone={tone} />

      <View className="gap-0.5">
      <Text
        accessibilityLabel={BRAND.fullName}
        accessibilityRole="header"
        className={`font-title ${nameSize[size]} ${inverse ? "text-white" : "text-foreground"}`}
        style={{ letterSpacing: -0.6 }}
      >
        Raket
        <Text className={inverse ? "text-white" : "text-primary"}>Delivery</Text>
      </Text>

      {showCity ? (
        <Text
          className={`font-label text-label uppercase ${
            inverse ? "text-white/80" : "text-text-secondary"
          }`}
          style={{ letterSpacing: 1.4 }}
        >
          {BRAND.city}
        </Text>
      ) : null}
      </View>
    </View>
  );
}
