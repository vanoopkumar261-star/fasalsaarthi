import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop, Circle } from "react-native-svg";

import { colors } from "@/constants/colors";

type Point = { value: number };

type Props = {
  /** Plotted left-to-right in the order given — pass oldest first. */
  data: Point[];
  color?: string;
  width: number;
  height: number;
  /** Draws a dot on the final point — reads as "this is the current value". */
  showLast?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A small filled area chart.
 *
 * Hand-drawn rather than pulled from a charting library: the app only ever
 * needs one line and a soft fill under it, and a chart library would bring a
 * whole layout/axis/legend system to draw two SVG paths. Sized by the caller so
 * it can sit in a tile or fill a modal.
 */
export function Sparkline({ data, color = colors.leaf, width, height, showLast, style }: Props) {
  const { line, area, lastX, lastY } = useMemo(() => {
    const pts = data.filter((d) => Number.isFinite(d.value));
    if (pts.length === 0) return { line: "", area: "", lastX: 0, lastY: 0 };

    // Inset so the stroke and the end dot aren't clipped by the viewBox edge.
    const pad = 3;
    const w = Math.max(1, width - pad * 2);
    const h = Math.max(1, height - pad * 2);

    const values = pts.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // A flat series has no range to scale against; draw it down the middle
    // rather than dividing by zero.
    const span = max - min || 1;

    const x = (i: number) => pad + (pts.length === 1 ? w / 2 : (i / (pts.length - 1)) * w);
    const y = (v: number) => pad + h - ((v - min) / span) * h;

    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(" ");
    const base = pad + h;
    const fill = `${d} L${x(pts.length - 1).toFixed(2)},${base} L${x(0).toFixed(2)},${base} Z`;

    return {
      line: d,
      area: fill,
      lastX: x(pts.length - 1),
      lastY: y(pts[pts.length - 1].value),
    };
  }, [data, width, height]);

  if (!line) return <View style={[{ width, height }, style]} />;

  // Unique per colour so two charts on one screen don't share a gradient id.
  const gradientId = `spark-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={style}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <Stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill={`url(#${gradientId})`} />
        <Path
          d={line}
          stroke={color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {showLast && <Circle cx={lastX} cy={lastY} r={3} fill={color} />}
      </Svg>
    </View>
  );
}
