/**
 * Read the FRIDAY sensor kit directly over Bluetooth Low Energy.
 *
 * The kit (an Arduino UNO reading soil moisture + temperature + humidity, feeding
 * an ESP32) used to publish to ThingSpeak over WiFi; the app read the cloud copy
 * through /api/sensors. Now the ESP32 is a BLE peripheral and the phone is the
 * central: it connects straight to the device and subscribes to one characteristic
 * that notifies `{"temp_c":..,"humidity":..,"moisture":..}` on each reading.
 *
 * The whole trick is that `useBleSensors` emits the SAME `SensorSnapshot` shape the
 * HTTP path produces (see ./sensors in the parent dir), so `SensorCard` renders a
 * BLE reading with no change to its tiles, charts or freshness badge. When no kit
 * is connected the card falls back to the cloud snapshot as before.
 *
 * Requires a native dev build (the BLE module is native) — it cannot run in Expo
 * Go, which this app already does not use.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { BleManager, type Device } from "react-native-ble-plx";

import type { MetricKey, SensorMetric, SensorReading, SensorSnapshot } from "@/lib/sensors";

// Must match the ESP32 firmware (docs/esp32code_agent_farmer_BLE.ino).
export const DEVICE_NAME = "FRIDAY-Sensor";
export const SERVICE_UUID = "f1a70001-5b3c-4b7e-9d2a-9a6f6d0c1a01";
export const READINGS_CHAR_UUID = "f1a70002-5b3c-4b7e-9d2a-9a6f6d0c1a01";

/** How many readings per metric to keep for the tile sparkline + modal table. */
const HISTORY = 100;
/** Give up a scan that finds nothing after this long. */
const SCAN_TIMEOUT_MS = 15_000;

export type BleStatus = "idle" | "scanning" | "connecting" | "connected" | "error";

const UNITS: Record<MetricKey, string> = {
  temperature: "°C",
  humidity: "%",
  soilMoisture: "%",
  npk: "kg/ha",
};

// One BleManager for the whole app; created lazily so merely importing this file
// (e.g. on web, or in a test) never touches the native module.
let _manager: BleManager | null = null;
function manager(): BleManager {
  if (!_manager) _manager = new BleManager();
  return _manager;
}

/** Decode a base64 characteristic value to its UTF-8 string (JSON is ASCII). */
function decodeBase64(b64: string): string {
  if (typeof atob === "function") return atob(b64);
  // Fallback decoder for runtimes without atob.
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  const clean = b64.replace(/=+$/, "");
  for (let bc = 0, bs = 0, i = 0; i < clean.length; i++) {
    const idx = chars.indexOf(clean[i]);
    if (idx === -1) continue;
    bs = bc % 4 ? bs * 64 + idx : idx;
    if (bc++ % 4) out += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
  }
  return out;
}

/** Ask for the Bluetooth permissions this Android version needs. */
async function ensurePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const api = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);
  const wanted =
    api >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  try {
    const res = await PermissionsAndroid.requestMultiple(wanted);
    return wanted.every((p) => res[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

type History = Record<MetricKey, SensorReading[]>;

function emptyHistory(): History {
  return { temperature: [], humidity: [], soilMoisture: [], npk: [] };
}

function pushReading(history: History, key: MetricKey, value: unknown, at: string) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return;
  const rounded = Math.round(n * 10) / 10;
  history[key] = [{ at, value: rounded }, ...history[key]].slice(0, HISTORY);
}

function metricFrom(history: History, key: MetricKey): SensorMetric {
  const readings = history[key];
  return {
    key,
    configured: readings.length > 0,
    unit: UNITS[key],
    latest: readings[0] ?? null,
    readings,
  };
}

function snapshotFrom(history: History): SensorSnapshot {
  const metrics: SensorMetric[] = (["temperature", "humidity", "soilMoisture"] as MetricKey[]).map((k) =>
    metricFrom(history, k)
  );
  const updatedAt = metrics.map((m) => m.latest?.at).filter(Boolean).sort().at(-1) ?? null;
  return { configured: metrics.some((m) => m.configured), updatedAt, metrics };
}

/**
 * Connect to the FRIDAY kit over BLE and expose its readings as a `SensorSnapshot`.
 *
 * Returns the live connection status, the latest snapshot (null until the first
 * reading arrives), the connected device's name, and connect/disconnect actions.
 */
export function useBleSensors() {
  const [status, setStatus] = useState<BleStatus>("idle");
  const [snapshot, setSnapshot] = useState<SensorSnapshot | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const historyRef = useRef<History>(emptyHistory());
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const disconnect = useCallback(() => {
    if (scanTimer.current) {
      clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    try {
      manager().stopDeviceScan();
    } catch {
      /* manager may be gone */
    }
    const d = deviceRef.current;
    deviceRef.current = null;
    if (d) d.cancelConnection().catch(() => {});
    if (alive.current) {
      setStatus("idle");
      setDeviceName(null);
    }
  }, []);

  const onReading = useCallback((base64: string | null) => {
    if (!base64) return;
    try {
      const decoded = decodeBase64(base64);
      console.log(`[BLE] reading ${decoded}`);
      const data = JSON.parse(decoded) as Record<string, unknown>;
      const at = new Date().toISOString();
      const h = historyRef.current;
      pushReading(h, "temperature", data.temp_c, at);
      pushReading(h, "humidity", data.humidity, at);
      pushReading(h, "soilMoisture", data.moisture, at);
      if (alive.current) setSnapshot(snapshotFrom(h));
    } catch {
      /* a partial / malformed packet — ignore and wait for the next notify */
    }
  }, []);

  const connect = useCallback(async () => {
    console.log("[BLE] connect() tapped");
    setError(null);
    historyRef.current = emptyHistory();

    const ok = await ensurePermissions();
    console.log(`[BLE] permissions granted=${ok}`);
    if (!ok) {
      setStatus("error");
      setError("Bluetooth permission is needed to connect to the sensor.");
      return;
    }

    const mgr = manager();
    setStatus("scanning");
    // Scan ALL devices (null filter) and match by name below. A UUID-filtered
    // scan is unreliable when the ESP32 puts its 128-bit service UUID in the
    // scan response rather than the advertising packet, so some Android stacks
    // never surface the device; matching the advertised name always works.
    console.log(`[BLE] scanning (all devices) for name ${DEVICE_NAME}`);

    scanTimer.current = setTimeout(() => {
      if (deviceRef.current) return; // already connected
      try {
        mgr.stopDeviceScan();
      } catch {
        /* ignore */
      }
      if (alive.current && !deviceRef.current) {
        console.log("[BLE] scan timed out — no FRIDAY-Sensor found");
        setStatus("error");
        setError("No FRIDAY sensor found nearby. Make sure it is powered on.");
      }
    }, SCAN_TIMEOUT_MS);

    mgr.startDeviceScan(null, null, (scanErr, device) => {
      if (scanErr) {
        console.log(`[BLE] scan error: ${scanErr.message}`);
        if (alive.current) {
          setStatus("error");
          setError(scanErr.message);
        }
        try {
          mgr.stopDeviceScan();
        } catch {
          /* ignore */
        }
        return;
      }
      if (device) console.log(`[BLE] saw device name=${device.name ?? "?"} id=${device.id}`);
      const match =
        device && (device.name === DEVICE_NAME || device.serviceUUIDs?.includes(SERVICE_UUID));
      if (!match || !device) return;

      console.log(`[BLE] MATCH ${device.name} — connecting`);
      mgr.stopDeviceScan();
      if (scanTimer.current) {
        clearTimeout(scanTimer.current);
        scanTimer.current = null;
      }
      setStatus("connecting");

      device
        .connect()
        // Default BLE payload is 20 bytes; the JSON reading is ~45, so without a
        // bigger MTU each notification arrives truncated and fails to parse.
        .then((d) => d.requestMTU(247))
        .then((d) => d.discoverAllServicesAndCharacteristics())
        .then((d) => {
          deviceRef.current = d;
          console.log(`[BLE] connected + discovered services on ${d.name}`);
          if (alive.current) {
            setDeviceName(d.name ?? DEVICE_NAME);
            setStatus("connected");
          }
          d.onDisconnected(() => {
            deviceRef.current = null;
            if (alive.current) {
              setStatus("idle");
              setDeviceName(null);
            }
          });
          d.monitorCharacteristicForService(SERVICE_UUID, READINGS_CHAR_UUID, (monErr, ch) => {
            if (monErr) return; // monitoring ended (disconnect / cancel)
            onReading(ch?.value ?? null);
          });
        })
        .catch((e: unknown) => {
          console.log(`[BLE] connect error: ${e instanceof Error ? e.message : String(e)}`);
          deviceRef.current = null;
          if (alive.current) {
            setStatus("error");
            setError(e instanceof Error ? e.message : "Could not connect to the sensor.");
          }
        });
    });
  }, [onReading]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      disconnect();
    };
  }, [disconnect]);

  return { status, snapshot, deviceName, error, connect, disconnect };
}
