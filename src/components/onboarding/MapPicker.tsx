import { colors as themeColors } from "@/theme/colors";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { Pressable } from "@/components/ui/Pressable";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

import { colors } from "@/constants/colors";
import { cardShadow } from "@/constants/effects";
import {
  INDIA_CENTER,
  geocode,
  reverseGeocode,
  type SelectedLocation,
} from "@/lib/geocode";
import { themed } from "@/theme";

/**
 * OpenFreeMap's Liberty style — OpenStreetMap vector tiles, no API key and no
 * usage cap, served under ODbL. Chosen over MapTiler/Mapbox styles because
 * those need an account key that would have to ship inside the app bundle.
 */
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

type Props = {
  value?: SelectedLocation;
  onChange: (loc: SelectedLocation) => void;
};

/**
 * House-location picker: search a place, tap the map, or use the device GPS.
 * Mirrors the web app's Leaflet MapSelector, including its rule that a GPS fix
 * must never overwrite a location the farmer chose deliberately.
 */
export function MapPicker({ value, onChange }: Props) {
  const [pos, setPos] = useState<SelectedLocation>(value ?? INDIA_CENTER);
  const [zoom, setZoom] = useState(value ? 14 : 4);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  /**
   * True once the farmer has chosen a location themselves. The GPS lookup below
   * can land seconds after mount — long enough for them to have searched for
   * their district already — and without this guard it would silently replace
   * their choice with wherever the phone happens to be.
   */
  const userPicked = useRef(false);

  useEffect(() => {
    if (value) return;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled || userPicked.current) return;

        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled || userPicked.current) return;

        const lat = fix.coords.latitude;
        const lng = fix.coords.longitude;
        const place = await reverseGeocode(lat, lng);
        if (cancelled || userPicked.current) return;

        const next = { lat, lng, ...place };
        setPos(next);
        setZoom(14);
        onChange(next);
      } catch {
        /* location unavailable — the farmer can still search or tap */
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(lat: number, lng: number) {
    userPicked.current = true;
    setBusy(true);
    setNotFound(false);

    // Show the pin immediately; the address and PIN catch up when Nominatim answers.
    setPos({ lat, lng });
    const place = await reverseGeocode(lat, lng);
    const next = { lat, lng, ...place };
    setPos(next);
    onChange(next);
    setBusy(false);
  }

  async function handleSearch() {
    if (!query.trim()) return;
    userPicked.current = true;
    setBusy(true);
    setNotFound(false);

    const result = await geocode(query);
    if (result) {
      setPos(result);
      setZoom(13);
      onChange(result);
    } else {
      setNotFound(true);
    }
    setBusy(false);
  }

  async function handleUseGPS() {
    setBusy(true);
    setNotFound(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setBusy(false);
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setZoom(15);
      await pick(fix.coords.latitude, fix.coords.longitude);
    } catch {
      setBusy(false);
    }
  }

  return (
    <View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.search}
          placeholder="Search a village, town or PIN code"
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={handleSearch} disabled={busy}>
          <Ionicons name="search" size={18} color={themeColors.onPrimary} />
        </Pressable>
      </View>

      {notFound && (
        <Text style={styles.notFound}>
          No place found for that search. Try a nearby town, or tap the map.
        </Text>
      )}

      <View style={[styles.mapWrap, cardShadow]}>
        <Map
          style={styles.map}
          mapStyle={STYLE_URL}
          onPress={(e) => {
            const [lng, lat] = e.nativeEvent.lngLat;
            pick(lat, lng);
          }}
        >
          <Camera center={[pos.lng, pos.lat]} zoom={zoom} duration={600} />
          <Marker lngLat={[pos.lng, pos.lat]} anchor="bottom">
            <Ionicons name="location" size={38} color={colors.primary} />
          </Marker>
        </Map>

        <Pressable style={styles.gpsBtn} onPress={handleUseGPS} disabled={busy}>
          <Ionicons name="locate" size={20} color={colors.primary} />
        </Pressable>

        {busy && (
          <View style={styles.busy}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
      </View>

      <Text style={styles.hint}>Tap anywhere on the map to move the pin.</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  search: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.sageLine,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.ink,
  },
  searchBtn: {
    width: 48,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  notFound: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  mapWrap: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.sage,
  },
  map: { flex: 1 },
  gpsBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...cardShadow,
  },
  busy: {
    position: "absolute",
    left: 12,
    top: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 8,
  },
  hint: { fontSize: 12, color: colors.textFaint, marginTop: 8 },
}));
