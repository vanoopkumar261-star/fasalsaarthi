import Svg, { Circle, G, Line, Path } from "react-native-svg";

type Props = {
  size?: number;
  color?: string;
  /** Fills the lower leaf pairs, as the logo's gold-on-forest lockup does. */
  fill?: string;
  strokeWidth?: number;
};

/**
 * The FasalSaarthi mark: a wheat stalk in three leaf tiers, topped by a small
 * circuit node — the "agent" half of the name. Drawn rather than imported so it
 * can be tinted per surface (gold on forest for the splash, forest on ivory in
 * headers) and animated stage by stage in `GrowthMark`.
 *
 * Geometry is authored on a 100x140 canvas with the stem on x=50.
 */
export function WheatMark({ size = 64, color = "#C9A227", fill = "none", strokeWidth = 3 }: Props) {
  const s = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size * 1.4} viewBox="0 0 100 140" fill="none">
      {/* stem */}
      <Line x1={50} y1={40} x2={50} y2={132} {...s} />

      {/* lower leaf pair — the widest, curling up from the base */}
      <G>
        <Path d="M50 118 C 30 118, 16 104, 16 86 C 34 86, 50 100, 50 118 Z" {...s} fill={fill} />
        <Path d="M50 118 C 70 118, 84 104, 84 86 C 66 86, 50 100, 50 118 Z" {...s} fill={fill} />
      </G>

      {/* middle leaf pair */}
      <G>
        <Path d="M50 92 C 34 92, 23 80, 23 65 C 38 65, 50 77, 50 92 Z" {...s} fill={fill} />
        <Path d="M50 92 C 66 92, 77 80, 77 65 C 62 65, 50 77, 50 92 Z" {...s} fill={fill} />
      </G>

      {/* upper pair, narrowing into the bud */}
      <G>
        <Path d="M50 68 C 38 68, 30 58, 30 46 C 42 46, 50 56, 50 68 Z" {...s} />
        <Path d="M50 68 C 62 68, 70 58, 70 46 C 58 46, 50 56, 50 68 Z" {...s} />
      </G>

      {/* the bud tip */}
      <Path d="M50 46 C 42 38, 42 24, 50 14 C 58 24, 58 38, 50 46 Z" {...s} />

      {/* circuit node — the mark's one piece of technology */}
      <Line x1={50} y1={38} x2={68} y2={22} {...s} strokeWidth={strokeWidth * 0.8} />
      <Circle cx={50} cy={38} r={4.5} {...s} strokeWidth={strokeWidth * 0.8} fill="none" />
      <Circle cx={69} cy={21} r={4.5} fill={color} />
      <Line x1={76} y1={34} x2={76} y2={40} {...s} strokeWidth={strokeWidth * 0.7} />
      <Line x1={76} y1={46} x2={76} y2={48} {...s} strokeWidth={strokeWidth * 0.7} />
    </Svg>
  );
}
