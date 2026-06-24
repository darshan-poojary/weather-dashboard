import type { ThunderstormCell } from "./weatherMapTypes";

export function createDivIcon(
  leaflet: typeof import("leaflet"),
  html: string,
  iconSize: [number, number],
  iconAnchor: [number, number]
) {
  return new leaflet.DivIcon({
    className: "weather-alert-icon",
    html,
    iconSize,
    iconAnchor,
  });
}

export function createThunderstormIcon(
  leaflet: typeof import("leaflet"),
  cell: ThunderstormCell,
  zoom: number
) {
  const fontSize =
    zoom >= 9
      ? Math.min(22 + cell.count / 60, 65)
      : zoom >= 6
      ? Math.min(18 + cell.count / 80, 50)
      : 14;

  const color =
    cell.temp < 190 ? "red" : cell.temp < 195 ? "orange" : "yellow";

  return new leaflet.DivIcon({
    className: "",
    html: `
<div style="
  font-size:${fontSize}px;
  color:${color};
  text-shadow:
    0 0 5px black,
    0 0 10px black;
">
&#9889;
</div>
`,
    iconSize: [40, 40],
  });
}

export function getSkyIcon(cc: number): string {
  if (cc < 10) return "☀️";
  if (cc < 30) return "🌤️";
  if (cc < 60) return "⛅";
  if (cc < 87) return "🌥️";
  return "☁️";
}

export function getCloudLabel(cc: number): string {
  if (cc < 10) return "Clear";
  if (cc < 30) return "Few Clouds";
  if (cc < 60) return "Partly Cloudy";
  if (cc < 87) return "Mostly Cloudy";
  return "Overcast";
}

export function ccToColor(cc: number): string {
  if (cc < 20) return "#fbbf24";
  if (cc < 50) return "#93c5fd";
  if (cc < 80) return "#e2e8f0";
  return "#94a3b8";
}

export function getCloudRainRisk(
  temp: number,
  cc: number
): { label: string; color: string } | null {
  if (temp > 100 && temp < 230)
    return { label: "⛈️  Convective Risk", color: "#ef4444" };
  if (temp > 100 && temp < 252)
    return { label: "🌧️  Heavy Rain Risk", color: "#f97316" };
  if (cc > 68 && (temp === 0 || temp < 272))
    return { label: "🌦️  Rain Possible", color: "#3b82f6" };
  return null;
}
