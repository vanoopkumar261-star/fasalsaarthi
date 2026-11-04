import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type ViewStyle } from "react-native";

import { colors, layout, radius, space, themed } from "@/theme";
import { Card } from "./Card";

/**
 * Loading placeholders that are the same shape as what replaces them.
 *
 * They were not. This file carried its own card chrome — `borderRadius: 24`,
 * `padding: 18`, and a border taken from `@/constants/colors` — while every
 * real card on screen is the `Card` component below at `radius.card` (16),
 * `layout.cardPadding` (20) and `colors.border`. Card's own docstring
 * complains that four different card radii had crept into the app; the
 * skeletons were quietly the fifth. The result was a loading state that
 * visibly re-flowed the moment the data arrived, and — because
 * `@/constants/colors` is not the theme and does not invert — a skeleton that
 * stayed pale on a dark screen.
 *
 * So the placeholders are now built FROM `Card`. There is no second set of
 * numbers to keep in step: if the card chrome changes, these change with it.
 */

/** A single pulsing placeholder block. */
export function Skeleton({
  width,
  height,
  radius: r = 8,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: r, backgroundColor: colors.bgSunken, opacity }, style]}
    />
  );
}

/**
 * A card-shaped skeleton: eyebrow, title, then N body lines.
 *
 * Mirrors the order every real card on the app uses — small label, heading,
 * body — so the blocks sit where the text lands. `gap` comes from Card, which
 * is why the children carry no margins of their own.
 */
export function SkeletonCard({ lines = 2, style }: { lines?: number; style?: ViewStyle }) {
  return (
    <Card style={style}>
      <Skeleton width="35%" height={10} radius={4} />
      <Skeleton width="65%" height={17} radius={4} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "50%" : "100%"} height={11} radius={4} />
      ))}
    </Card>
  );
}

/** A small stat-tile skeleton (big number + label), for grids like Crops' "3 ACTIVE CROPS". */
export function SkeletonTile({ style }: { style?: ViewStyle }) {
  return (
    <Card style={[styles.tile, ...(style ? [style] : [])]}>
      <Skeleton width="45%" height={20} radius={5} />
      <Skeleton width="70%" height={9} radius={4} />
    </Card>
  );
}

/** A single list-row skeleton (title line + meta line), for lists like Store Locator / Schemes. */
export function SkeletonRow({ style }: { style?: ViewStyle }) {
  return (
    <Card style={style}>
      <Skeleton width="55%" height={14} radius={4} />
      <Skeleton width="35%" height={10} radius={4} />
    </Card>
  );
}

/** Header skeleton matching every screen's eyebrow + title pattern. */
export function SkeletonHeader() {
  return (
    <View style={styles.header}>
      <Skeleton width={90} height={10} radius={4} />
      <Skeleton width={170} height={22} radius={5} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    header: { gap: space.xs, marginBottom: 4 },
    // Tiles are tighter than a full card: two to a row, so they take the
    // smaller radius and a reduced inset rather than the card's own.
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      borderRadius: radius.sm,
      padding: layout.cardPadding - 6,
    },
  }),
);
