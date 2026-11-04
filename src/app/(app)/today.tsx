import { useRouter } from "expo-router";
import { View } from "react-native";
import { HomeScreen } from "@/components/HomeScreen";
import { useT } from "@/components/i18n/LanguageProvider";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

/**
 * Home, reached by tapping the centre of the dial. Its old quick-action tiles
 * now map onto real routes rather than the tab enum they used to switch.
 */
const ROUTE_FOR: Record<string, string> = {
  scan: "/(app)/scan",
  assistant: "/(app)/assistant",
  crops: "/(app)/crops",
  settings: "/(app)/settings",
};

export default function TodayRoute() {
  const { t } = useT();
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t("hub.today")} />
      <HomeScreen
        onNavigate={(dest) => {
          const target = ROUTE_FOR[dest];
          if (target) router.push(target as never);
        }}
      />
    </View>
  );
}
