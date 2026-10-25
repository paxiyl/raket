import { Image } from "expo-image";
import { Text, View } from "react-native";

import { BRAND } from "@/lib/brand";

/*
  The Raket lockup.

  The mark is the R-rocket from the brand artwork, as an image rather than a
  drawing: it is a hand-drawn letterform, and a path traced off a 170px JPEG
  would be an impression of it rather than the thing itself. The PNGs under
  `assets/images/` are all built from one extracted shape — the same one the
  app icon and the splash use — so the home screen and this header cannot drift
  apart.

  The name stays type: it is sharper at every size than artwork would be, and
  "Raket" in the text colour with "Delivery" in red keeps the two words reading
  as one.
*/
const markBrand = require("../../../assets/images/logo-mark.png");
const markWhite = require("../../../assets/images/logo-mark-white.png");

type Props = {
  /** "brand" renders for light surfaces, "inverse" renders white over media. */
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

/** The mark is set to roughly the cap height of each step. */
const markSize = { compact: 26, hero: 60, title: 34 } as const;

/** The red the logo is drawn in, which is the mark's own colour, not a token. */
const BRAND_RED = "#EB0A06";

export function Wordmark({ tone = "brand", size = "title", showCity = false }: Props) {
  const inverse = tone === "inverse";
  const mark = markSize[size];

  return (
    <View className="flex-row items-center gap-2">
      {/* expo-image ignores className for sizing, so the box is a style. */}
      <Image
        contentFit="contain"
        source={inverse ? markWhite : markBrand}
        style={{ height: mark, width: mark }}
      />

      <View className="gap-0.5">
        <Text
          accessibilityLabel={BRAND.fullName}
          accessibilityRole="header"
          className={`font-title ${nameSize[size]} ${inverse ? "text-white" : "text-foreground"}`}
          style={{ letterSpacing: -0.6 }}
        >
          Raket
          <Text className={inverse ? "text-white" : ""} style={inverse ? undefined : { color: BRAND_RED }}>
            Delivery
          </Text>
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
