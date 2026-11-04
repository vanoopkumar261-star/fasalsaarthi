/**
 * Weather + crop-stage aware alerts. Ported from the web app's lib/alerts.ts.
 * Every alert is grounded in a real forecast signal and the crop's actual
 * growth stage — no fabricated "AI confidence" lines. Returns an empty list
 * when there's genuinely nothing to flag.
 */
import type { WeatherData } from "./weather";
import type { FarmWithCrop } from "./dashboard";
import { cropStageFor, getCropProfile } from "./agronomy";

export type Alert = { kind: "weather" | "disease" | "ai" | "critical" | "task"; title: string; body: string };

export function deriveAlerts({
  farms,
  weather,
  missedYesterday,
}: {
  farms: FarmWithCrop[];
  weather: WeatherData | null;
  missedYesterday?: { total: number; done: number; missed: number };
}): Alert[] {
  const alerts: Alert[] = [];
  const cropped = farms.filter((f) => f.crop);

  if (missedYesterday && missedYesterday.missed > 0) {
    const { missed, total } = missedYesterday;
    alerts.push({
      kind: missed >= total ? "critical" : "task",
      title: `${missed} of ${total} task${total > 1 ? "s" : ""} missed yesterday`,
      body: `You completed ${missedYesterday.done} of ${total}. Yesterday's work doesn't carry over — make sure today's list is finished before the day ends.`,
    });
  }

  if (!weather) return alerts;

  const rainSoon = weather.daily.slice(0, 3).some((d) => d.precipProb >= 50);
  const maturing = cropped.find(
    (f) => cropStageFor(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date).label === "Maturity"
  );

  if (rainSoon) {
    if (maturing) {
      alerts.push({
        kind: "critical",
        title: "Rain during harvest window",
        body: `Rain is likely within 3 days while ${maturing.crop!.chosen_crop} (Farm ${maturing.farm_index}) is maturing — plan harvest and drying, and clear field drainage.`,
      });
    } else {
      alerts.push({
        kind: "weather",
        title: "Rain likely in the next 3 days",
        body: "Hold spraying and scheduled irrigation, and ensure field drainage is clear.",
      });
    }
  }

  for (const f of cropped) {
    const p = getCropProfile(f.crop!.chosen_crop);
    const st = cropStageFor(f.crop!.chosen_crop, f.crop!.seeding_date, f.crop!.estimated_harvest_date);
    if ((st.label === "Flowering" || st.label === "Vegetative") && weather.current.temp >= p.heatThreshold) {
      alerts.push({
        kind: "critical",
        title: `Heat stress risk — ${f.crop!.chosen_crop}`,
        body: `Current ${weather.current.temp}°C at the ${st.label.toLowerCase()} stage (Farm ${f.farm_index}). Irrigate early morning to protect yield.`,
      });
      break;
    }
  }

  const frost = weather.daily.slice(0, 3).some((d) => d.tMin <= 4);
  if (frost) {
    alerts.push({
      kind: "weather",
      title: "Cold / frost risk",
      body: "Night temperatures near freezing are in the forecast — protect sensitive crops and avoid night irrigation.",
    });
  }

  return alerts;
}
