import { Image } from "expo-image";
import { View } from "react-native";

import { BRAND } from "@/lib/brand";

/*
  The Raket logo, as supplied.

  It is the artwork itself, lifted off the white page it was drawn on so it can
  sit on a coloured surface without a white square around it. Nothing else was
  done to it.

  There is no separate name beside it any more: the badge already carries
  "Raket Delivery" and "For Smart Villages", and setting the name again next to
  a logo that contains it reads as a mistake.
*/
const logo = require("../../../assets/images/logo.png");

type Props = {
  /** Kept so callers over colour and over light surfaces read the same. */
  tone?: "brand" | "inverse";
  size?: "hero" | "title" | "compact";
  /**
   * Accepted and ignored. The badge already says where this is for, and a
   * second line under it was duplicating its own ribbon.
   */
  showCity?: boolean;
};

/*
  Width in points. The badge is dense — a rider, a village, six category
  tiles and three lines of type — so the small step is still large enough for
  the wordmark inside it to be read rather than guessed at.
*/
const WIDTH = { compact: 76, hero: 216, title: 160 } as const;

export function Wordmark({ size = "title" }: Props) {
  const width = WIDTH[size];

  return (
    <View accessibilityLabel={BRAND.fullName} accessibilityRole="header">
      {/* expo-image ignores className for sizing, so the box is a style.
          The badge is very close to square; `contain` keeps it honest. */}
      <Image
        contentFit="contain"
        source={logo}
        style={{ height: width, width }}
      />
    </View>
  );
}
