import { cn } from "@/lib/utils";

/*
  The Raket mark, in the backoffice.

  The same path data as `mobile/src/components/ui/rocket-mark.tsx` and the same
  geometry the app icons are rendered from, so the phone, the browser tab and
  the sign-in page are one object. Change it in one and change it in both.
*/

const BODY = `M256 60
  C 320 128 350 222 350 312
  L 350 366
  C 350 388 332 406 310 406
  L 202 406
  C 180 406 162 388 162 366
  L 162 312
  C 162 222 192 128 256 60 Z`;

const FIN_LEFT = `M162 306
  C 122 332 96 378 88 432
  C 130 424 154 406 162 392 Z`;

const FIN_RIGHT = `M350 306
  C 390 332 416 378 424 432
  C 382 424 358 406 350 392 Z`;

const TRAIL = [
  { d: "M256 424 L 256 494", opacity: 1, width: 30 },
  { d: "M206 420 L 188 470", opacity: 0.72, width: 24 },
  { d: "M306 420 L 324 470", opacity: 0.72, width: 24 },
];

const TILT = 35;

type Props = {
  className?: string;
  /** "inverse" renders white, for the coloured sign-in panel. */
  tone?: "brand" | "inverse";
};

export function RocketMark({ className, tone = "brand" }: Props) {
  const inverse = tone === "inverse";

  const body = inverse ? "#ffffff" : "#1FA85C";
  const fin = inverse ? "#ffffff" : "#8FD9AE";
  const trail = inverse ? "#ffffff" : "#8FD9AE";
  const windowFill = inverse ? "#1FA85C" : "#116E3C";

  return (
    <svg aria-hidden className={cn("shrink-0", className)} viewBox="0 0 512 512">
      <g transform={`translate(256 262) rotate(${TILT}) translate(-256 -262)`}>
        <path d={BODY} fill={body} />
        <path d={FIN_LEFT} fill={fin} />
        <path d={FIN_RIGHT} fill={fin} />
        <circle cx={256} cy={222} fill={windowFill} r={44} />
        {TRAIL.map((stroke) => (
          <path
            d={stroke.d}
            fill="none"
            key={stroke.d}
            opacity={stroke.opacity}
            stroke={trail}
            strokeLinecap="round"
            strokeWidth={stroke.width}
          />
        ))}
      </g>
    </svg>
  );
}
