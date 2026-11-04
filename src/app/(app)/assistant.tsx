import { View } from "react-native";
import { AssistantScreen } from "@/components/AssistantScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useT } from "@/components/i18n/LanguageProvider";

export default function AssistantRoute() {
  const { t } = useT();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("nav.assistant")} />
      <AssistantScreen />
    </View>
  );
}
