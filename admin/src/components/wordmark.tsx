import markBrand from "@/assets/raket-mark.png";
import markWhite from "@/assets/raket-mark-white.png";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "lg";
  /** "inverse" renders white, for the coloured sign-in panel. */
  tone?: "brand" | "inverse";
};

/** The red the logo is drawn in — the mark's own colour, not a theme token. */
const BRAND_RED = "#EB0A06";

/**
 * The Raket lockup.
 *
 * The mark is the R-rocket from the brand artwork, as an image: it is a
 * hand-drawn letterform, and a path traced off a small JPEG would be an
 * impression of it rather than the thing itself. It is built from the same
 * extracted shape as the phone's app icon, so the browser tab, this header and
 * the home screen are one object.
 *
 * The name stays type — sharper at every size than artwork, and it follows the
 * theme without a second asset.
 */
export function Wordmark({ className, size = "sm", tone = "brand" }: Props) {
  const large = size === "lg";
  const inverse = tone === "inverse";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        alt=""
        className={cn("shrink-0 object-contain", large ? "size-11" : "size-7")}
        src={inverse ? markWhite : markBrand}
      />

      <div className="flex flex-col">
        <span
          className={cn(
            "font-semibold tracking-tight",
            large ? "text-4xl" : "text-xl",
            inverse ? "text-white" : "text-foreground",
          )}
        >
          Raket
          <span style={inverse ? undefined : { color: BRAND_RED }}>Delivery</span>
        </span>

        <span
          className={cn(
            "font-medium uppercase tracking-[0.14em]",
            large ? "text-xs" : "text-[10px]",
            inverse ? "text-white/75" : "text-muted-foreground",
          )}
        >
          Hindaun · Operations
        </span>
      </div>
    </div>
  );
}
