import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { cardShadow, colors, eyebrow, radius, space, type } from "@/theme";
import {
  loadNotifications,
  markAllRead,
  notifTimeAgo,
  type NotificationRow,
} from "@/lib/notifications";
import { useT } from "./i18n/LanguageProvider";

const KIND_ICON: Record<string, React.ComponentProps<typeof Ionicons>["name"]> = {
  weather: "rainy-outline",
  task: "checkmark-circle-outline",
  disease: "bug-outline",
  market: "trending-up-outline",
  health: "pulse-outline",
};

/**
 * What the app has already told this farmer.
 *
 * Settings has carried four notification preference toggles since it was
 * built, with nothing to apply them to — no inbox, no record, nothing to look
 * back at. The website has meanwhile been writing these rows on every
 * dashboard render, so anyone using both saw a history on one and nothing on
 * the other.
 *
 * Read-only on purpose. These rows are a record of what was said, so there is
 * nothing here to act on beyond marking them seen; the live hazard check
 * below this is where a farmer goes for something happening now.
 */
export function NotificationInbox({ farmerId }: { farmerId: string }) {
  const { t } = useT();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setItems(await loadNotifications(farmerId));
  }, [farmerId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const unread = items.filter((i) => !i.read).length;

  async function onMarkAllRead() {
    // Optimistic: the rows are already on screen and the update is a no-op
    // against a table that may not exist yet.
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await markAllRead(farmerId);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.head}>
          {unread > 0
            ? t("notifications.titleWithCount", { n: unread })
            : t("notifications.title")}
        </Text>
        {unread > 0 && (
          <Pressable onPress={onMarkAllRead} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.markRead}>{t("notifications.markAllRead")}</Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <Text style={styles.empty}>{t("notifications.empty")}</Text>
      ) : (
        <View style={[styles.card, cardShadow]}>
          {items.map((n, i) => (
            <View key={n.id} style={[styles.row, i > 0 && styles.divider]}>
              <Ionicons
                name={KIND_ICON[n.kind] ?? "notifications-outline"}
                size={16}
                color={n.read ? colors.textMuted : colors.primary}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, !n.read && styles.titleUnread]}>{n.title}</Text>
                {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
                <Text style={styles.when}>{notifTimeAgo(n.created_at, t)}</Text>
              </View>
              {!n.read && <View style={styles.dot} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  loading: { paddingVertical: space.lg, alignItems: "center" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  head: { ...type.card, fontWeight: "700", color: colors.text },
  markRead: { ...type.meta, fontWeight: "700", color: colors.primary },
  empty: { ...type.secondary, color: colors.textSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, paddingHorizontal: space.md },
  row: { flexDirection: "row", gap: space.xs, paddingVertical: space.sm, alignItems: "flex-start" },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  title: { ...type.body, color: colors.textSecondary },
  titleUnread: { fontWeight: "700", color: colors.text },
  body: { ...type.meta, color: colors.textSecondary, marginTop: 2, lineHeight: 17 },
  when: { ...eyebrow, fontSize: 10, color: colors.textMuted, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
