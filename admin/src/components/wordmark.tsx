import logo from "@/assets/raket-logo.png";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "lg";
  /** Kept so callers over colour and over light surfaces read the same. */
  tone?: "brand" | "inverse";
};

/**
 * The Raket logo, as supplied.
 *
 * The artwork itself, lifted off the white page it was drawn on so it sits on
 * the coloured sign-in panel without a white square around it. The same file
 * the phone uses, so the two cannot drift.
 *
 * No name set beside it: the badge already carries "Raket Delivery" and "For
 * Smart Villages", and repeating that in type next to it reads as a mistake.
 */
export function Wordmark({ className, size = "sm" }: Props) {
  return (
    <img
      alt="Raket Delivery"
      className={cn(
        "shrink-0 object-contain",
        // The sidebar is `collapsible="icon"`, so the small step has to fit a
        // narrow rail as well as the open header.
        size === "lg" ? "size-40" : "size-10 group-data-[collapsible=icon]:size-8",
        className,
      )}
      src={logo}
    />
  );
}
