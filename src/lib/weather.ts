/**
 * Live weather via Open-Meteo — free, no API key required.
 * Ported from src/lib/weather.ts in the web app (same API, same shape).
 */

export type DayForecast = {
  dateISO: string;
  weekday: string;
  code: number;
  icon: string;
  label: string;
  tMax: number;
  tMin: number;
  precipProb: number;
  /**
   * Rainfall total for the day, in mm.
   *
   * `precipProb` answers "will it rain"; irrigation needs "how much". A 90%
   * chance of 1 mm of drizzle changes nothing about a field's water balance,
   * while 40 mm from a single likely shower replaces a week of pumping. Kept
   * alongside the probability rather than replacing it because the weather card
   * still reads better as a percentage.
   */
  rainMm: number;
  /**
   * FAO-56 reference evapotranspiration, mm/day — the water a short green
   * grass reference crop would lose under this day's weather. Multiplied by a
   * crop coefficient it becomes that crop's actual demand.
   *
   * Open-Meteo computes this with the full Penman-Monteith equation from
   * radiation, temperature, humidity and wind, which is far better than
   * anything we could approximate from the three summary fields above. Free
   * and keyless, same as the rest of this call.
   */
  et0: number;
};

export type WeatherData = {
  current: {
    temp: number;
    apparent: number;
    humidity: number;
    windKph: number;
    code: number;
    icon: string;
    label: string;
    isDay: boolean;
  };
  daily: DayForecast[];
};

function describe(code: number): { label: string; icon: string } {
  if (code === 0) return { label: "Clear sky", icon: "☀️" };
  if (code <= 2) return { label: "Partly cloudy", icon: "⛅" };
  if (code === 3) return { label: "Overcast", icon: "☁️" };
  if (code <= 48) return { label: "Foggy", icon: "🌫️" };
  if (code <= 57) return { label: "Drizzle", icon: "🌦️" };
  if (code <= 67) return { label: "Rain", icon: "🌧️" };
  if (code <= 77) return { label: "Snow", icon: "🌨️" };
  if (code <= 82) return { label: "Rain showers", icon: "🌧️" };
  if (code <= 86) return { label: "Snow showers", icon: "🌨️" };
  if (code <= 99) return { label: "Thunderstorm", icon: "⛈️" };
  return { label: "—", icon: "🌡️" };
}

export async function getWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `,precipitation_sum,et0_fao_evapotranspiration` +
      `&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const j = await res.json();

    const cur = j.current;
    const curDesc = describe(cur.weather_code);

    const daily: DayForecast[] = (j.daily?.time ?? []).map((t: string, i: number) => {
      const desc = describe(j.daily.weather_code[i]);
      return {
        dateISO: t,
        weekday: new Date(t).toLocaleDateString("en-US", { weekday: "short" }),
        code: j.daily.weather_code[i],
        icon: desc.icon,
        label: desc.label,
        tMax: Math.round(j.daily.temperature_2m_max[i]),
        tMin: Math.round(j.daily.temperature_2m_min[i]),
        precipProb: j.daily.precipitation_probability_max?.[i] ?? 0,
        rainMm: Number(j.daily.precipitation_sum?.[i] ?? 0) || 0,
        et0: Number(j.daily.et0_fao_evapotranspiration?.[i] ?? 0) || 0,
      };
    });

    return {
      current: {
        temp: Math.round(cur.temperature_2m),
        apparent: Math.round(cur.apparent_temperature),
        humidity: Math.round(cur.relative_humidity_2m),
        windKph: Math.round(cur.wind_speed_10m),
        code: cur.weather_code,
        icon: curDesc.icon,
        label: curDesc.label,
        isDay: cur.is_day === 1,
      },
      daily,
    };
  } catch (e) {
    console.error("WEATHER error:", e);
    return null;
  }
}
