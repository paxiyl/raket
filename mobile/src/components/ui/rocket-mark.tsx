import Svg, { Circle, G, Path } from "react-native-svg";

/*
  The Raket mark.

  The same geometry as the app icon and the splash — `mobile/assets/images/`
  are renders of this, not separate drawings — so the thing on the home screen
  and the thing in the header are one object. Change the paths here and
  re-render the icons from them.

  A rocket because the name is one letter off the word, tilted because the
  product is not space travel: a rocket standing on a launchpad is an emoji,
  one already moving is a delivery. The body is a pointed arch rather than a
  cone on a cylinder — it keeps its outline at any size, and upside down it is
  a map pin.
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

/** Matches the icon renders; see `docs/design/onlinemall-design.md`. */
const TILT = 35;

type Props = {
  size?: number;
  /** "brand" for light surfaces, "inverse" for white over colour or photography. */
  tone?: "brand" | "inverse";
};

export function RocketMark({ size = 28, tone = "brand" }: Props) {
  const inverse = tone === "inverse";

  const body = inverse ? "#ffffff" : "#1FA85C";
  const fin = inverse ? "#ffffff" : "#8FD9AE";
  const trail = inverse ? "#ffffff" : "#8FD9AE";
  const window = inverse ? "#1FA85C" : "#116E3C";

  return (
    <Svg height={size} viewBox="0 0 512 512" width={size}>
      {/* Rotated about the mark's own centre of mass, which sits below the
          geometric centre because of the trail. */}
      <G transform={`translate(256 262) rotate(${TILT}) translate(-256 -262)`}>
        <Path d={BODY} fill={body} />
        <Path d={FIN_LEFT} fill={fin} />
        <Path d={FIN_RIGHT} fill={fin} />
        <Circle cx={256} cy={222} fill={window} r={44} />
        {TRAIL.map((stroke) => (
          <Path
            d={stroke.d}
            fill="none"
            key={stroke.d}
            opacity={stroke.opacity}
            stroke={trail}
            strokeLinecap="round"
            strokeWidth={stroke.width}
          />
        ))}
      </G>
    </Svg>
  );
}
