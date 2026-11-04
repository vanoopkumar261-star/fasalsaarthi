import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CALLBOT_URL, requestBriefingCall } from "@/lib/callbot";
import { colors, space, type, themed } from "@/theme";
import { useT } from "./i18n/LanguageProvider";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

/**
 * "Call me" — rings the farmer's phone with a spoken briefing of their farm,
 * official weather warnings, and a chance to ask questions. Useful for anyone
 * who would rather listen than read. Hidden when no call server is configured.
 */
export function CallMeCard() {
  const { t } = useT();
  const [state, setState] = useState<"idle" | "busy" | "calling" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!CALLBOT_URL) return null;

  const call = async () => {
    setState("busy");
    const r = await requestBriefingCall();
    if (r.ok) {
      setState("calling");
      setMessage(t("callMe.calling", { to: r.to }));
    } else {
      setState("error");
      setMessage(r.error === "rateLimited" ? t("callMe.rateLimited") : r.error || t("callMe.failed"));
    }
  };

  return (
    <Card>
      <View style={styles.head}>
        <MaterialCommunityIcons name="phone-in-talk" size={22} color={colors.primary} />
        <Text style={styles.title}>{t("callMe.title")}</Text>
      </View>
      <Text style={styles.body}>{t("callMe.body")}</Text>
      {message ? (
        <Text style={[styles.status, state === "error" && styles.error]} accessibilityLiveRegion="polite">
          {message}
        </Text>
      ) : null}
      <Button
        label={state === "calling" ? t("callMe.again") : t("callMe.button")}
        icon="phone"
        onPress={call}
        busy={state === "busy"}
        full
      />
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.card, fontWeight: "700", color: colors.text },
  body: { ...type.body, color: colors.textSecondary, marginTop: space.xs, marginBottom: space.md },
  status: { ...type.secondary, color: colors.primary, marginBottom: space.md },
  error: { color: colors.danger },
}));
