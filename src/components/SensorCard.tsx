import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./i18n/LanguageProvider";
import { ActivityIndicator, AppState, Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Ionicons } from "@expo/vector-icons";

import {
  METRIC_META,
  METRIC_LABEL_KEY,
  METRIC_ORDER,
  POLL_MS,
  getSensors,
  isFresh,
  timeAgo,
  type SensorMetric,
  type SensorSnapshot,
} from "@/lib/sensors";
import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import { FreshnessBadge } from "./ui/FreshnessBadge";
import { Sparkline } from "./ui/Sparkline";
import { useBleSensors } from "@/lib/ble/sensors";

import { themed } from "@/theme";
/** Clock time for a reading, e.g. "14:05". */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Date + time, for the readings table. */
function fullStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${clock(iso)}`;
}

/**
 * Live temperature / humidity / soil-moisture from the field sensors, mirroring
 * the web dashboard's SensorPanel.
 *
 * Two behaviours are load-bearing and easy to get wrong: "Live" means the
 * newest reading is *fresh* (under 30 min), not merely that readings exist — a
 * rig that died last week would otherwise still look live. And a failed poll
 * keeps the last good snapshot on screen instead of blanking the card, since a
 * dropped request on a rural connection says nothing about the sensors.
 */
export function SensorCard() {
  const { t } = useT();
  const [snap, setSnap] = useState<SensorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openMetric, setOpenMetric] = useState<SensorMetric | null>(null);

  const load = useCallback(async () => {
    const next = await getSensors();
    if (next) {
      setSnap(next);
      setFailed(false);
    } else {
      // Keep whatever is already on screen; only an empty card is an error.
      setSnap((prev) => {
        setFailed(prev === null);
        return prev;
      });
    }
    setLoading(false);
  }, []);

  // Poll on a timer, but only while the app is in the foreground — a
  // backgrounded app polling every minute burns battery and data for readings
  // nobody is looking at. This is the native counterpart of the web panel's
  // document.visibilityState check.
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => loadRef.current(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    loadRef.current();
    if (AppState.currentState === "active") start();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        loadRef.current(); // catch up immediately on return
        start();
      } else {
        stop();
      }
    });

    return () => {
      stop();
      sub.remove();
    };
  }, []);

  // A connected BLE kit is read directly and wins over the cloud copy; with no
  // kit connected the card shows the HTTP/ThingSpeak snapshot exactly as before.
  const ble = useBleSensors();
  const bleActive = ble.status === "connected" && !!ble.snapshot;
  const display = bleActive ? ble.snapshot : snap;

  const live = isFresh(display?.updatedAt);
  const metrics = display?.metrics ?? [];
  const configured = display?.configured ?? false;

  return (
    <View style={[styles.card, cardShadow]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{t("sensorPanel.label")}</Text>
          <Text style={styles.title}>{t("sensorPanel.title")}</Text>
        </View>
        {display ? (
          <FreshnessBadge label={live ? "LIVE" : "OFFLINE"} tone={live ? "live" : "offline"} />
        ) : null}
      </View>

      <BleConnect ble={ble} />

      {display?.updatedAt ? (
        <Text style={styles.updated}>
          {bleActive ? "Over Bluetooth · " : ""}Updated {timeAgo(display.updatedAt)}
        </Text>
      ) : null}

      {loading && !display ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : failed && !bleActive ? (
        <Text style={styles.muted}>Couldn&apos;t load sensor readings. Pull down to refresh.</Text>
      ) : !configured ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>{t("sensorPanel.notConnectedTitle")}</Text>
          <Text style={styles.muted}>
            Readings appear here once a ThingSpeak channel is publishing from the field.
          </Text>
        </View>
      ) : (
        <View style={styles.tiles}>
          {METRIC_ORDER.map((key) => {
            const metric = metrics.find((m) => m.key === key);
            // A placeholder is deliberately NOT `configured`, so it has to be
            // admitted explicitly or the NPK tile would never render.
            if (!metric || (!metric.configured && !metric.placeholder)) return null;
            return <MetricTile key={key} metric={metric} onPress={() => setOpenMetric(metric)} />;
          })}
        </View>
      )}

      <MetricModal metric={openMetric} onClose={() => setOpenMetric(null)} />
    </View>
  );
}

/** The connect / disconnect control for the FRIDAY BLE sensor kit. */
function BleConnect({ ble }: { ble: ReturnType<typeof useBleSensors> }) {
  const connected = ble.status === "connected";
  const busy = ble.status === "scanning" || ble.status === "connecting";
  const label = connected
    ? `Connected · ${ble.deviceName ?? "sensor"}`
    : ble.status === "scanning"
      ? "Scanning…"
      : ble.status === "connecting"
        ? "Connecting…"
        : ble.status === "error"
          ? "Tap to try again"
          : "Connect sensor over Bluetooth";
  const tint = connected ? colors.leaf : colors.primary;
  return (
    <View style={styles.bleWrap}>
      <Pressable
        style={styles.bleBtn}
        onPress={connected || busy ? ble.disconnect : ble.connect}
        accessibilityLabel={connected ? "Disconnect sensor" : "Connect sensor over Bluetooth"}
      >
        <Ionicons name={connected ? "bluetooth" : "bluetooth-outline"} size={14} color={tint} />
        <Text style={[styles.bleBtnText, { color: tint }]}>{label}</Text>
        {busy ? <ActivityIndicator size="small" color={tint} /> : null}
      </Pressable>
      {ble.error ? <Text style={styles.bleError}>{ble.error}</Text> : null}
    </View>
  );
}

function MetricTile({ metric, onPress }: { metric: SensorMetric; onPress: () => void }) {
  const { t } = useT();
  const { icon, color } = METRIC_META[metric.key];
  // The series arrives newest-first; a chart reads left-to-right in time.
  const chronological = [...metric.readings].reverse();
  const parts = metric.placeholder ? metric.parts ?? [] : [];

  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <View style={[styles.tileIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={icon as never} size={15} color={color} />
      </View>
      <Text style={styles.tileLabel}>{t(METRIC_LABEL_KEY[metric.key])}</Text>

      {/* Three numbers do not fit the one-big-figure shape the other tiles
          use, so a metric that arrives as parts renders them side by side. */}
      {parts.length > 0 ? (
        <View style={styles.partsRow}>
          {parts.map((part) => (
            <View key={part.label} style={styles.part}>
              <Text style={styles.partLabel}>{part.label}</Text>
              <Text style={styles.partValue}>{part.value}</Text>
            </View>
          ))}
        </View>
      ) : metric.latest ? (
        <>
          <Text style={styles.tileValue}>
            {metric.latest.value}
            <Text style={styles.tileUnit}>{metric.unit}</Text>
          </Text>
          <Sparkline
            data={chronological.slice(-24)}
            color={color}
            width={78}
            height={26}
            showLast
            style={styles.tileSpark}
          />
        </>
      ) : (
        <Text style={styles.tileNoData}>No readings yet</Text>
      )}

      {/* Where the number came from. A value with no sensor behind it has to
          say so on the tile itself — the same rule the market board follows
          with its "Demo prices" pill. These are Soil Health Card sufficiency
          levels, not a reading from this field, and the farmer must be able to
          tell the difference without opening anything. */}
      {metric.placeholder ? (
        <Text style={styles.tileProvenance}>{t("sensorPanel.noNpkSensor")}</Text>
      ) : null}

      {!metric.placeholder && (
        <Text style={[styles.tileMore, { color }]}>{t("sensorPanel.showMore")}</Text>
      )}
    </Pressable>
  );
}

function MetricModal({ metric, onClose }: { metric: SensorMetric | null; onClose: () => void }) {
  const { t } = useT();
  const { width } = useWindowDimensions();
  if (!metric) return null;

  const { icon, color } = METRIC_META[metric.key];
  const chronological = [...metric.readings].reverse();
  const last20 = metric.readings.slice(0, 20);
  const chartWidth = Math.max(240, width - 88);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={[styles.tileIcon, { backgroundColor: `${color}1A` }]}>
              <Ionicons name={icon as never} size={16} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{t(METRIC_LABEL_KEY[metric.key])}</Text>
              {metric.latest ? (
                <Text style={styles.updated}>
                  {metric.latest.value}
                  {metric.unit} · {timeAgo(metric.latest.at)}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textSoft} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={styles.sectionLabel}>{t("soilPh.history")}</Text>
            {chronological.length > 0 ? (
              <View style={styles.chartWrap}>
                <Sparkline
                  data={chronological}
                  color={color}
                  width={chartWidth}
                  height={150}
                  showLast
                />
                <View style={styles.chartAxis}>
                  <Text style={styles.axisText}>
                    {chronological[0] ? clock(chronological[0].at) : ""}
                  </Text>
                  <Text style={styles.axisText}>
                    {chronological[chronological.length - 1]
                      ? clock(chronological[chronological.length - 1].at)
                      : ""}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.muted}>No readings yet</Text>
            )}

            {last20.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Last {last20.length} readings</Text>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    <Text style={[styles.tableCell, styles.tableHeadText]}>Time</Text>
                    <Text style={[styles.tableCell, styles.tableHeadText, styles.tableRight]}>
                      Reading
                    </Text>
                  </View>
                  {last20.map((r, i) => (
                    <View key={`${r.at}-${i}`} style={styles.tableRow}>
                      <Text style={styles.tableCell}>{fullStamp(r.at)}</Text>
                      <Text style={[styles.tableCell, styles.tableRight, styles.tableValue]}>
                        {r.value}
                        {metric.unit}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 24,
    padding: 16,
    gap: 6,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.leaf },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  updated: { fontSize: 12, color: colors.textFaint },

  bleWrap: { gap: 3, marginTop: 2 },
  bleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  bleBtnText: { fontSize: 12, fontWeight: "700" },
  bleError: { fontSize: 11, color: colors.textSoft, lineHeight: 15 },

  centered: { paddingVertical: 18, alignItems: "center", gap: 4 },
  emptyTitle: { fontSize: 13, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.textSoft, textAlign: "center", lineHeight: 18 },

  tiles: { flexDirection: "row", gap: 8, marginTop: 6 },
  tile: {
    flex: 1,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    padding: 10,
    gap: 4,
  },
  tileIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: { fontSize: 12, fontWeight: "600", color: colors.textSoft },
  tileValue: { fontSize: 18, fontWeight: "700", color: colors.ink },
  tileUnit: { fontSize: 12, fontWeight: "600", color: colors.textFaint },
  tileSpark: { marginTop: 2 },
  tileNoData: { fontSize: 12, color: colors.textFaint, paddingVertical: 8 },
  tileMore: { fontSize: 12, fontWeight: "700", marginTop: 2 },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  modalBody: { padding: 18, gap: 10, paddingBottom: 34 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    color: colors.leaf,
    marginTop: 4,
  },
  chartWrap: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    padding: 12,
  },
  chartAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { fontSize: 12, color: colors.textFaint },

  table: {
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.sageLine,
  },
  tableHead: { backgroundColor: colors.sage },
  tableHeadText: { fontWeight: "700", color: colors.primary, fontSize: 12 },
  tableCell: { flex: 1, fontSize: 12, color: colors.textSoft },
  tableRight: { textAlign: "right" },
  tableValue: { fontWeight: "700", color: colors.ink },
  partsRow: { flexDirection: "row", gap: 10, marginTop: 8, alignItems: "baseline" },
  part: { flexDirection: "row", gap: 3, alignItems: "baseline" },
  partLabel: { fontSize: 10.5, fontWeight: "700", color: colors.textFaint },
  partValue: { fontSize: 17, fontWeight: "700", color: colors.ink },
  tileProvenance: { fontSize: 10.5, color: colors.textFaint, marginTop: 6, lineHeight: 14 },
}));
