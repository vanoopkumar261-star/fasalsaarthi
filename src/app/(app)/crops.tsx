import { View } from "react-native";
import { CropsScreen } from "@/components/CropsScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useT } from "@/components/i18n/LanguageProvider";

export default function CropsRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("nav.crops")} />
      <CropsScreen />
    </View>
  );
}
