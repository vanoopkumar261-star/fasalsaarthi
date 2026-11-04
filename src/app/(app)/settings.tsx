import { View } from "react-native";
import { SettingsScreen } from "@/components/SettingsScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useT } from "@/components/i18n/LanguageProvider";

export default function SettingsRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("nav.settings")} />
      <SettingsScreen />
    </View>
  );
}
