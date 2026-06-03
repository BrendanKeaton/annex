export const TIME_PRESETS = [
  "1D",
  "7D",
  "1M",
  "3M",
  "6M",
  "YTD",
  "1Y",
  "MAX",
] as const;

export type TimePreset = (typeof TIME_PRESETS)[number];

export function getTimeThreshold(preset: TimePreset): number {
  const now = Date.now();
  const day = 86_400_000;
  switch (preset) {
    case "1D":
      return now - day;
    case "7D":
      return now - 7 * day;
    case "1M":
      return now - 30 * day;
    case "3M":
      return now - 90 * day;
    case "6M":
      return now - 180 * day;
    case "YTD": {
      const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
      return jan1;
    }
    case "1Y":
      return now - 365 * day;
    case "MAX":
      return 0;
  }
}
