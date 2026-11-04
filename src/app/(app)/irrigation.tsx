import { View } from "react-native";
import { useT } from "@/components/i18n/LanguageProvider";
import { IrrigationScreen } from "@/components/IrrigationScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

export default function IrrigationRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("hub.irrigation")} />
      <IrrigationScreen />
    </View>
  );
}
