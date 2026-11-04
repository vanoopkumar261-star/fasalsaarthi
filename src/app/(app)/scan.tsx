import { View } from "react-native";
import { DiseaseScreen } from "@/components/DiseaseScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useT } from "@/components/i18n/LanguageProvider";

export default function ScanRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("nav.disease")} />
      <DiseaseScreen />
    </View>
  );
}
