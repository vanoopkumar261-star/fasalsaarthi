import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SystemUI from "expo-system-ui";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { activeScheme, applyScheme, colors, type Scheme } from "./colors";

export type Appearance = "system" | "light" | "dark";

const KEY = "appearance";

const Ctx = createContext<{ appearance: Appearance; setAppearance: (a: Appearance) => void; scheme: Scheme }>({
  appearance: "system",
  setAppearance: () => {},
  scheme: "light",
});

export const useTheme = () => useContext(Ctx);

/**
 * Light or dark: the phone's own setting by default, or a choice saved in
 * Settings. Renders nothing until the saved choice is read, so the first
 * frame is already in the right scheme. Consumers that cache styles must
 * remount on `scheme` (the root Stack is keyed on it).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setState] = useState<Appearance | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setState(v === "light" || v === "dark" ? v : "system"))
      .catch(() => setState("system"));
  }, []);

  const setAppearance = useCallback((a: Appearance) => {
    setState(a);
    AsyncStorage.setItem(KEY, a).catch(() => {});
  }, []);

  const scheme: Scheme = appearance === "light" || appearance === "dark" ? appearance : system === "dark" ? "dark" : "light";
  // Must run before any child renders, so the roles they read are already right.
  if (activeScheme() !== scheme) applyScheme(scheme);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [scheme]);

  if (!appearance) return null;
  return <Ctx.Provider value={{ appearance, setAppearance, scheme }}>{children}</Ctx.Provider>;
}
