export function formatViews(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0";
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    return val % 1 === 0 ? `${val}M` : `${val.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const val = n / 1_000;
    return val % 1 === 0 ? `${val}K` : `${val.toFixed(1)}K`;
  }
  return n.toString();
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function formatDateShort(iso: string): string {
  const date = new Date(iso);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

export function formatPercent(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function formatNumber(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "0";
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function getPlatformColor(platform: string): string {
  switch (platform.toLowerCase()) {
    case "tiktok":
      return "#EE1D52";
    case "youtube":
      return "#E53935";
    case "instagram":
      return "#E1306C";
    case "likee":
      return "#FF5700";
    case "pinterest":
      return "#BD081C";
    default:
      return "#888888";
  }
}

export function getPlatformLabel(platform: string): string {
  switch (platform.toLowerCase()) {
    case "tiktok":
      return "TikTok";
    case "youtube":
      return "YouTube";
    case "instagram":
      return "Instagram";
    case "likee":
      return "Likee";
    case "pinterest":
      return "Pinterest";
    default:
      return platform;
  }
}
