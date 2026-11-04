import { View } from "react-native";
import { useT } from "@/components/i18n/LanguageProvider";
import { SoilScreen } from "@/components/SoilScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function SoilRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("hub.soil")} />
      <SoilScreen />
    </View>
  );
}
