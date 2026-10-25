import { RocketMark } from "@/components/rocket-mark";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "lg";
  /** "inverse" renders white, for the coloured sign-in panel. */
  tone?: "brand" | "inverse";
};

/**
 * The Raket lockup: the rocket, then the name.
 *
 * Both are drawn rather than loaded as artwork, so they stay sharp at every
 * size, and the rocket is the same geometry the app icons are rendered from —
 * the browser tab, the sign-in page and the phone's home screen are one object.
 */
export function Wordmark({ className, size = "sm", tone = "brand" }: Props) {
  const large = size === "lg";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RocketMark className={large ? "size-11" : "size-7"} tone={tone} />

      <div className="flex flex-col">
      <span
        className={cn(
          "font-semibold tracking-tight",
          large ? "text-4xl" : "text-xl",
          tone === "inverse" ? "text-white" : "text-foreground",
        )}
      >
        Raket
        <span className={tone === "inverse" ? "text-white" : "text-primary"}>Delivery</span>
      </span>

      <span
        className={cn(
          "font-medium uppercase tracking-[0.14em]",
          large ? "text-xs" : "text-[10px]",
          tone === "inverse" ? "text-white/75" : "text-muted-foreground",
        )}
      >
        Hindaun · Operations
      </span>
      </div>
    </div>
  );
}
