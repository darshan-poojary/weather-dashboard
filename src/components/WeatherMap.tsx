"use client";

import dynamic from "next/dynamic";

import type { ComponentType } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type GeoJsonObject = unknown;

type MosdacAlertFeatureProperties = {
  name?: string;
  value?: string;
  rad_inf?: string;
  event_date?: string;
  forecast_date?: string;
  event_time?: string;
  forecast_time?: string;
  forecast?: string;
  [key: string]: unknown;
};

type MosdacAlertFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: MosdacAlertFeatureProperties;
  [key: string]: unknown;
};

type CloudPoint = {
  gridLat: number;
  gridLon: number;
  cloudCover: number;
  temp: number;
  [key: string]: unknown;
};

type ThunderstormCell = {
  lat: number;
  lon: number;
  temp: number;
  count: number;
  severity: string;
  [key: string]: unknown;
};

type CloudPopup = {
  lat: number;
  lon: number;
  cloudCover: number;
  temp: number;
};

type WeatherChannel =
  | "IMG_TIR1"
  | "IMG_TIR2"
  | "IMG_MIR";

type Palette =
  | "greyscale"
  | "rainbow"
  | "redblue"
  | "ferret";

const loadLeafletComponent = <T extends ComponentType<Record<string, unknown>>>(
  name: string
) =>
  dynamic(async () => {
    const mod = await import("react-leaflet");
    return (mod as unknown as Record<string, T>)[name];
  }, { ssr: false }) as T;

const MapContainer = loadLeafletComponent("MapContainer");
const TileLayer = loadLeafletComponent("TileLayer");
const WMSTileLayer = loadLeafletComponent("WMSTileLayer");
const GeoJSON = loadLeafletComponent("GeoJSON");
const Circle = loadLeafletComponent("Circle");
const Marker = loadLeafletComponent("Marker");
const Popup = loadLeafletComponent("Popup");

const MapEvents = dynamic(
  async () => {
    const mod = await import("react-leaflet");

    return function Events({
      setZoom,
    }: {
      setZoom: (zoom: number) => void;
    }) {
      const map = mod.useMapEvents({
        zoomend() {
          setZoom(map.getZoom());
        },
      });

      return null;
    };
  },
  { ssr: false }
);

const MapClickHandler = dynamic(
  async () => {
    const mod = await import("react-leaflet");

    return function ClickHandler(
      props: {
        onClick: (lat: number, lon: number) => void;
      }
    ) {
      mod.useMapEvents({
        click: (e) => {
          props.onClick(e.latlng.lat, e.latlng.lng);
        },
      });

      return null;
    };
  },
  { ssr: false }
);

const CHANNELS = [
  {
    label: "TIR1",
    layer: "IMG_TIR1",
  },

  {
    label: "TIR2",
    layer: "IMG_TIR2",
  },

  {
    label: "MIR",
    layer: "IMG_MIR",
  },
] as const;

const PALETTES = [
  "greyscale",
  "rainbow",
  "redblue",
  "ferret",
] as const;

const MODES = [
  "LIVE",
  "HISTORY",
  "ANIMATION",
] as const;

const LEGENDS: Record<WeatherChannel, { title: string; min: string; max: string }> = {
  IMG_TIR1: {
    title: "Cloud Top Temperature (K)",
    min: "180",
    max: "320",
  },

  IMG_TIR2: {
    title: "Thermal Infrared Temperature (K)",
    min: "180",
    max: "320",
  },

  IMG_MIR: {
    title: "Mid Infrared Brightness",
    min: "180",
    max: "340",
  },
};

const PALETTE_GRADIENTS: Record<Palette, string> = {
  greyscale:
    "linear-gradient(to right,#ffffff,#d9d9d9,#a6a6a6,#737373,#404040,#000000)",

  rainbow:
    "linear-gradient(to left,#0000ff,#00ffff,#00ff00,#ffff00,#ff8000,#ff0000)",

  redblue:
    "linear-gradient(to right,#ff0000,#ff8080,#ffffff,#80bfff,#0066ff)",

  ferret:
    "linear-gradient(to left,#c94cff,#8b5cf6,#3b82f6,#22d3ee,#22c55e,#ffff00,#ff9800,#ff0000)",
};

function createDivIcon(
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

function createThunderstormIcon(
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
// ── Cloud Cover Helpers ───────────────────────────────────────

function getSkyIcon(cc: number): string {
  if (cc < 10) return "☀️";
  if (cc < 30) return "🌤️";
  if (cc < 60) return "⛅";
  if (cc < 87) return "🌥️";
  return "☁️";
}

function getCloudLabel(cc: number): string {
  if (cc < 10) return "Clear";
  if (cc < 30) return "Few Clouds";
  if (cc < 60) return "Partly Cloudy";
  if (cc < 87) return "Mostly Cloudy";
  return "Overcast";
}

function ccToColor(cc: number): string {
  if (cc < 20) return "#fbbf24"; // sunny yellow
  if (cc < 50) return "#93c5fd"; // sky blue
  if (cc < 80) return "#e2e8f0"; // light grey
  return "#94a3b8";              // overcast grey
}

function getCloudRainRisk(
  temp: number,
  cc: number
): { label: string; color: string } | null {
  if (temp > 100 && temp < 230)
    return { label: "⛈️  Convective Risk",  color: "#ef4444" };
  if (temp > 100 && temp < 252)
    return { label: "🌧️  Heavy Rain Risk", color: "#f97316" };
  if (cc > 68 && (temp === 0 || temp < 272))
    return { label: "🌦️  Rain Possible",   color: "#3b82f6" };
  return null;
}
export default function WeatherMap() {
  
  const [opacity, setOpacity] =
    useState(0.7);

  const [channel, setChannel] =
    useState<WeatherChannel>("IMG_TIR1");

  const [palette, setPalette] =
    useState<Palette>("greyscale");

  const [date, setDate] =
    useState("");

  const [time, setTime] =
    useState("");

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [speed, setSpeed] =
    useState(4000);

  const [mode, setMode] =
    useState<"LIVE" | "HISTORY" | "ANIMATION">("LIVE");

  const [showOverlay, setShowOverlay] =
    useState(true);

  const [zoom, setZoom] =
  useState(5);
  const [isMobile, setIsMobile] =
  useState(false);
  const [
  showControls,
  setShowControls,
] = useState(true);
const [
  showLegend,
  setShowLegend,
] = useState(true);
const [
  showAlertLegend,
  setShowAlertLegend,
] = useState(true);
const [
  showAlerts,
  setShowAlerts,
] = useState(true);

const [
  showThunderstorms,
  setShowThunderstorms,
] = useState(true);

const [leaflet, setLeaflet] = useState<
  typeof import("leaflet") | null
>(null);

useEffect(() => {
  let mounted = true;

  import("leaflet")
    .then((L) => {
      if (mounted) setLeaflet(L);
    })
    .catch((error) => {
      console.error("Leaflet import failed:", error);
    });

  return () => {
    mounted = false;
  };
}, []);

const {
  blueRainIcon,
  cloudburstIcon,
  nowcastRainIcon,
} = useMemo(() => {
  if (!leaflet) {
    return {
      blueRainIcon: undefined,
      cloudburstIcon: undefined,
      nowcastRainIcon: undefined,
    };
  }

  return {
    blueRainIcon: createDivIcon(
      leaflet,
      `<div style="font-size:20px;filter:drop-shadow(0 0 2px black);">🌧️</div>`,
      [14, 14],
      [7, 7]
    ),
    cloudburstIcon: createDivIcon(
      leaflet,
      `<div style="font-size:20px;filter:drop-shadow(0 0 3px black);">⛈️</div>`,
      [18, 18],
      [9, 9]
    ),
    nowcastRainIcon: createDivIcon(
      leaflet,
      `<div style="font-size:20px;filter:drop-shadow(0 0 2px black);">☔</div>`,
      [14, 14],
      [7, 7]
    ),
  };
}, [leaflet]);

const [statesGeoJson, setStatesGeoJson] =
  useState<GeoJsonObject | null>(null);

const [districtGeoJson, setDistrictGeoJson] =
  useState<GeoJsonObject | null>(null);

const [
  thunderstormCells,
  setThunderstormCells,
] = useState<ThunderstormCell[]>([]);
 
const [
  cloudPoints,
  setCloudPoints,
] = useState<CloudPoint[]>([]);

const [
  cloudPopup,
  setCloudPopup,
] = useState<CloudPopup | null>(null);

  // NEW FRAME SYSTEM

  const frames = useMemo(() => {
    const now = new Date();

    const current = new Date(now);
    current.setUTCMinutes(
      Math.floor(current.getUTCMinutes() / 15) * 15
    );
    current.setUTCSeconds(0);
    current.setUTCMilliseconds(0);

    // IMPORTANT:
    // latest valid slot
    current.setUTCMinutes(current.getUTCMinutes() - 60);
    current.setUTCMinutes(
      Math.floor(current.getUTCMinutes() / 15) * 15
    );
    current.setUTCSeconds(0);
    current.setUTCMilliseconds(0);

    return Array.from({ length: 25 }, (_, index) => {
      const frame = new Date(current);
      frame.setTime(
        current.getTime() -
          (24 - index) * 15 * 60 * 1000
      );
      return frame.toISOString();
    });
  }, []);

  const [currentFrame, setCurrentFrame] =
    useState(frames.length - 1);
  const [displayFrame, setDisplayFrame] =
    useState(frames.length - 1);

  const [frameLoading, setFrameLoading] =
  useState(false);


    const [
  mosdacAlerts,
  setMosdacAlerts,
] = useState<MosdacAlertFeature[]>([]);

 const loadedFrames =
  useRef(new Set<string>());

useEffect(() => {
  const checkMobile = () => {
    setIsMobile(
      window.innerWidth < 768
    );
  };

  checkMobile();

  window.addEventListener(
    "resize",
    checkMobile
  );

  return () =>
    window.removeEventListener(
      "resize",
      checkMobile
    );
}, []);
  // INDIA GEOJSON

  useEffect(() => {
  fetch(
    "/geo/india-states.geojson"
  )
    .then((res) => res.json())
    .then((data) => {
      setStatesGeoJson(data);
    });

  fetch(
    "/geo/india-districts.geojson"
  )
    .then((res) => res.json())
    .then((data) => {
      setDistrictGeoJson(data);
    });
}, []);

  // PLAYBACK LOOP

useEffect(() => {

  if (
  !isPlaying ||
  frames.length === 0 ||
  frameLoading
) return;

  const interval =
    setInterval(() => {

      const nextFrame =
        currentFrame >=
        frames.length - 1
          ? 0
          : currentFrame + 1;

      setFrameLoading(true);

      const img =
        new window.Image();

      img.onload = () => {

        setCurrentFrame(
          nextFrame
        );

        setDisplayFrame(
          nextFrame
        );

        setFrameLoading(
          false
        );

      };

      img.onerror = () => {

        setFrameLoading(
          false
        );

      };

      img.src =
        `/api/mosdac-wms?datetime=${frames[nextFrame]}&layers=${channel}&styles=boxfill/${palette}`;

    }, speed);

  return () =>
    clearInterval(interval);

}, [
  isPlaying,
  speed,
  currentFrame,
  frames,
  frameLoading,
  channel,
  palette,
]);


useEffect(() => {
  const fetchAlerts =
    async () => {
      try {
        const response =
          await fetch(
            "/api/mosdac-alerts"
          );

        const text =
          await response.text();

        // MOSDAC returns
        // extra timestamp text
        // before JSON

        const jsonStart =
  text.indexOf("{");

const jsonEnd =
  text.lastIndexOf("}");

const cleanJson =
  text.slice(
    jsonStart,
    jsonEnd + 1
  );

const parsed =
  JSON.parse(cleanJson);

        if (
          parsed.features
        ) {
          setMosdacAlerts(
            parsed.features
          );
        }
      } catch (error) {
        console.error(
          "MOSDAC Alerts Error:",
          error
        );
      }
    };

  fetchAlerts();

  const interval =
    setInterval(
      fetchAlerts,
      300000
    );

  return () =>
    clearInterval(
      interval
    );
}, []);

const preloadFrame = useCallback(
  (frame: string) => {
    if (loadedFrames.current.has(frame)) {
      return;
    }

    const img = new Image();

    img.onload = () => {
      loadedFrames.current.add(frame);
    };

    img.src =
      `/api/mosdac-wms?datetime=${frame}&layers=${channel}&styles=boxfill/${palette}`;
  },
  [channel, palette]
);
useEffect(() => {

  if (
    frames.length === 0
  ) {
    return;
  }

  for (
    let i = 0;
    i < 4;
    i++
  ) {

    const index =
      currentFrame + i;

    if (
      index <
      frames.length
    ) {

      preloadFrame(
        frames[index]
      );

    }
  }

}, [
  currentFrame,
  frames,
  preloadFrame,
]);

useEffect(() => {

  const loadStorms = async () => {

    try {

      const response =
        await fetch(
          "/thunderstorm-cells.json?t=" +
          Date.now()
        );

      const data =
        await response.json();

      setThunderstormCells(
        data
      );

      console.log(
        "Thunderstorm Cells:",
        data.length
      );

    } catch (error) {

      console.error(
        error
      );

    }
  };
const loadCloudData = async () => {
  try {
    const res = await fetch(
  "/cloud-grid.json?" +
    Date.now()
);

    const data =
      await res.json();
console.log(
  "Cloud grids:",
  data.length
);
    setCloudPoints(data);
  } catch (err) {
    console.error(
      "Cloud data error",
      err
    );
  }
};
  loadStorms();
  loadCloudData();
  const stormInterval =
    setInterval(
      loadStorms,
      1800000
    );
  const cloudInterval =
    setInterval(
      loadCloudData,
      1800000
    );

  return () => {
    clearInterval(stormInterval);
    clearInterval(cloudInterval);
  };

}, []);
  // HISTORY MODE

  function getHistoryUtcDatetime() {
    if (!date || !time)
      return null;

    const istDate =
      new Date(
        `${date}T${time}:00`
      );

    return new Date(
      istDate.getTime() -
        5.5 *
          60 *
          60 *
          1000
    ).toISOString();
  }

  // FINAL UTC DATETIME

function getLatestMosdacTime() {
  const now =
    new Date();

  // Round DOWN to previous
  // 15-min slot

  now.setUTCMinutes(
    Math.floor(
      now.getUTCMinutes() /
        15
    ) * 15
  );

  now.setUTCSeconds(0);

  now.setUTCMilliseconds(
    0
  );

  // MOSDAC lag
  // subtract 30 mins

  now.setUTCMinutes(
    now.getUTCMinutes() -
      60
  );

  return now.toISOString();
}

let utcDatetime =
  getLatestMosdacTime();

if (
  mode === "ANIMATION" &&
  frames.length > 0
) {
  utcDatetime =
    frames[displayFrame];
}

if (
  mode === "HISTORY"
) {
  const historyTime =
    getHistoryUtcDatetime();

  if (historyTime) {
    utcDatetime =
      historyTime;
  }
}

  // FORMAT LABEL

  function formatAnimationDate(
    iso: string
  ) {
    const date =
      new Date(iso);

    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];

    const day = String(
      date.getUTCDate()
    ).padStart(2, "0");

    const month =
      months[
        date.getUTCMonth()
      ];

    const year =
      date.getUTCFullYear();

    const hours = String(
      date.getUTCHours()
    ).padStart(2, "0");

    const mins = String(
      date.getUTCMinutes()
    ).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${mins} UTC`;
  }

  const animationLabel =
    formatAnimationDate(
      utcDatetime
    );
const filteredAlerts = useMemo(() => {
  return mosdacAlerts.filter((feature, index, self) => {
    const coords = feature.geometry?.coordinates;

    // If no coordinates, skip
    if (!coords) return false;

    // Prefer properties.forecast to detect cloudburst alerts
    const props = (feature.properties || feature) as MosdacAlertFeatureProperties;
    const forecast = (props.forecast || "").toString().toLowerCase();

    // Always keep cloudburst/"cloud" alerts
    if (forecast.includes("cloud")) return true;

    const [lng, lat] = coords;

    return !self.some((other, otherIndex) => {
      if (index === otherIndex) return false;

      const otherCoords = other.geometry?.coordinates;
      if (!otherCoords) return false;

      const [otherLng, otherLat] = otherCoords;

      const distance = Math.sqrt(
        Math.pow(lat - otherLat, 2) + Math.pow(lng - otherLng, 2)
      );

      const minDistance =
        zoom >= 9
          ? 0.08
          : zoom >= 8
          ? 0.15
          : zoom >= 7
          ? 0.25
          : zoom >= 6
          ? 0.45
          : zoom >= 5
          ? 0.8
          : 1.2;

      return distance < minDistance && otherIndex < index;
    });
  });
}, [mosdacAlerts, zoom]);

  const currentLegend =
  LEGENDS[
    channel as keyof typeof LEGENDS
  ];

const currentGradient =
  PALETTE_GRADIENTS[
    palette as keyof typeof PALETTE_GRADIENTS
  ];

const visibleThunderstorms =
  thunderstormCells.filter(
    (cell) => {

      // Always show all detected storms
      if (
        cell.severity === "Severe" ||
        cell.severity === "Strong" ||
        cell.severity === "Moderate"
      ) {
        return true;
      }

      return false;
    }
  );
const GRID_DEG = 12 / 111;

const handleMapClick = useCallback(
  (clickLat: number, clickLon: number) => {
    if (cloudPoints.length === 0) {
      return;
    }

    const gridLat =
      Math.round(clickLat / GRID_DEG) *
      GRID_DEG;

    const gridLon =
      Math.round(clickLon / GRID_DEG) *
      GRID_DEG;

    const cell =
      cloudPoints.reduce(
        (best, p) => {
          const dist =
            Math.abs(p.gridLat - gridLat) +
            Math.abs(p.gridLon - gridLon);

          if (!best || dist < best.dist) {
            return {
              dist,
              point: p,
            };
          }

          return best;
        },
        null as { dist: number; point: CloudPoint } | null
      )?.point;

    if (!cell) {
      return;
    }

    setCloudPopup({
      lat: clickLat,
      lon: clickLon,
      cloudCover: cell.cloudCover,
      temp: cell.temp,
    });
  },
  [cloudPoints, GRID_DEG]
);
  return (
    <div
      style={{
    
height: "100dvh",
width: "100%",
overflow: "hidden",
background: "#000",

      }}
    >

      

      {/* CONTROL PANEL */}
{
!showControls && (
  <button
    onClick={() =>
      setShowControls(true)
    }
    style={{
      position: "absolute",

      top: 18,
      left: 18,

      zIndex: 5000,

      width: "42px",
      height: "42px",

      borderRadius: "14px",

      border:
        "1px solid rgba(255,255,255,0.08)",

      background:
        "rgba(15,23,42,0.82)",

      backdropFilter:
        "blur(12px)",

      color: "white",

      fontSize: "22px",

      cursor: "pointer",

      boxShadow:
        "0 8px 20px rgba(0,0,0,0.4)",
    }}
  >
    ❯
  </button>
)
}

{
showControls && (

<div
  style={{
  position: "absolute",
  top: 18,
  left: 18,
animation:
  "glassFloat 6s ease-in-out infinite",

  zIndex: 2000,
maxHeight: "92vh", overflowY: "auto",
  
width: isMobile ? "calc(100vw - 24px)" : "340px",


  padding: "18px",

  borderRadius: "28px",

  background: "linear-gradient( 180deg, rgba(15,23,42,0.78), rgba(15,23,42,0.58) )",

  backdropFilter:
    "blur(20px)",

  WebkitBackdropFilter:
    "blur(14px)",

  border:
    "1px solid rgba(255,255,255,0.12)",

  boxShadow:
    "0 10px 35px rgba(0,0,0,0.45)",

  color: "white",

  fontFamily:
    "'Inter', sans-serif",

  overflow: "hidden",
}}
      >
      
<div
  style={{
    display: "flex",

    alignItems: "center",

    justifyContent:
      "space-between",

    marginBottom: "18px",
  }}
>
  <h2
    style={{
      margin: 0,

      fontSize: isMobile
        ? "28px"
        : "38px",

      fontWeight: 800,

      letterSpacing: "-1px",

      color: "white",
    }}
  >
    INSAT-3DR
  </h2>

  <button
    onClick={() =>
      setShowControls(false)
    }
    style={{
      width: "38px",
      height: "38px",

      borderRadius: "12px",

      border:
        "1px solid rgba(255,255,255,0.08)",

      background:
        "rgba(255,255,255,0.08)",

      color: "white",

      fontSize: "22px",

      cursor: "pointer",

      display: "flex",

      alignItems: "center",

      justifyContent:
        "center",
    }}
  >
    ❮
  </button>
</div>

        {/* MODE BUTTONS */}

        <div
          style={{
            display: "flex",
            gap: "6px",
            marginBottom: "14px",
          }}
        >
          {MODES.map((item) => (
            <button
              key={item}
              onClick={() => {
                setMode(item);

                if (
                  item ===
                  "LIVE"
                ) {
                  setDate("");
                  setTime("");
                  setIsPlaying(
                    false
                  );

                  setCurrentFrame(
                    frames.length -
                      1
                  );
                  setDisplayFrame(
    frames.length - 1
  );
                }

                if (
                  item ===
                  "ANIMATION"
                ) {
                  setDate("");
                  setTime("");
                }
              }}
              style={{
  flex: 1,

  padding: "10px",

  border: "none",

  borderRadius: "12px",

  cursor: "pointer",

  background:
    mode === item
      ? "linear-gradient(135deg,#2563eb,#38bdf8)"
      : "rgba(255,255,255,0.08)",

  color: "white",

  fontWeight: 700,

  fontSize: "14px",

  transition:
    "all 0.25s ease",

  boxShadow:
    mode === item
      ? "0 4px 15px rgba(37,99,235,0.45)"
      : "none",
}}
            >
              {item}
            </button>
          ))}
        </div>

        {/* CHANNEL */}

        <label>
          <b>Channel</b>
        </label>

        <select
          value={channel}
          onChange={(e) =>
            setChannel(
              e.target.value as WeatherChannel
            )
          }
          style={{
            WebkitAppearance: "none", 
            MozAppearance: "none", 
            appearance: "none",
  width: "100%",

  marginTop: "6px",

  marginBottom: "14px",

  padding: "10px",

  borderRadius: "10px",

  border:
    "1px solid rgba(255,255,255,0.1)",

  background:
    "rgba(255,255,255,0.08)",

  color: "white",

  fontSize: "14px",

  outline: "none",
}}
        >
          {CHANNELS.map(
            (item) => (
      
<option
  key={item.layer}
  value={item.layer}

  style={{
    background: "#111827",
    color: "white",
  }}
>
  {item.label}
</option>

            )
          )}
        </select>

        {/* PALETTE */}

        <label>
          <b>Palette</b>
        </label>

        <select
          value={palette}
          onChange={(e) =>
            setPalette(
              e.target.value as Palette
            )
          }
          style={{
  width: "100%",

  marginTop: "6px",

  marginBottom: "14px",

  padding: "10px",

  borderRadius: "10px",

  border:
    "1px solid rgba(255,255,255,0.1)",

  background:
    "rgba(255,255,255,0.08)",

  color: "white",

  fontSize: "14px",

  outline: "none",
}}
        >
          {PALETTES.map(
            (item) => (
             
<option
  key={item}
  value={item}

  style={{
    background: "#111827",
    color: "white",
  }}
>
  {item}
</option>

            )
          )}
        </select>

        {/* OVERLAY */}

        <label
          style={{
            display: "flex",
            alignItems:
              "center",
            gap: "8px",
            marginBottom:
              "10px",
          }}
        >
          <input
            type="checkbox"
            checked={
              showOverlay
            }
            onChange={() =>
              setShowOverlay(
                !showOverlay
              )
            }
          />

          <b>
            Show Overlay
          </b>
        </label>

        <div
  style={{
    marginTop: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  }}
>

  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      cursor: "pointer",
    }}
  >
    <input
      type="checkbox"
      checked={showAlerts}
      onChange={() =>
        setShowAlerts(
          !showAlerts
        )
      }
    />

    <b>
      Show Heavy Rain &
      Cloudburst
    </b>
  </label>

  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      cursor: "pointer",
    }}
  >
    <input
      type="checkbox"
      checked={showThunderstorms}
      onChange={() =>
        setShowThunderstorms(
          !showThunderstorms
        )
      }
    />

    <b>
      Show Thunderstorms
    </b>
  </label>
</div>

        {/* OPACITY */}

        <label>
          <b>Opacity:</b>{" "}
          {opacity}
        </label>

        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={opacity}
          onChange={(e) =>
            setOpacity(
              Number(
                e.target.value
              )
            )
          }
          style={{
  width: "100%",

  marginTop: "6px",

  marginBottom: "14px",

  padding: "10px",

  borderRadius: "10px",

  border:
    "1px solid rgba(255,255,255,0.1)",

  background:
    "rgba(255,255,255,0.08)",

  color: "white",

  fontSize: "14px",

  outline: "none",
}}
        />

        {/* ANIMATION */}

        {mode ===
          "ANIMATION" && (
          <>
            <hr />

            <h3>
              Animation
            </h3>

            <button
              onClick={() => {

  setIsPlaying(
    !isPlaying
  );

}}
              style={{
                padding:
                  "8px 14px",
                cursor:
                  "pointer",
                marginBottom:
                  "10px",
              }}
            >
              {isPlaying
                ? "Pause"
                : "Play"}
            </button>

            <label>
              <b>Speed</b>
            </label>

            <input
              type="range"
              min="3500"
              max="5000"
              step="100"
              value={speed}
              onChange={(
                e
              ) =>
                setSpeed(
                  Number(
                    e.target
                      .value
                  )
                )
              }
              style={{
                width:
                  "100%",
              }}
            />

            <p>
              {speed} ms
            </p>

            <p
              style={{
                fontWeight:
                  "bold",
                marginTop:
                  "10px",
              }}
            >
              Current
              Frame:
            </p>

            <p>
              {
                animationLabel
              }
            </p>

            {/* TIMELINE SLIDER */}

            <input
              type="range"
              min="0"
              max={
                frames.length -
                1
              }
              step="1"
              value={
                currentFrame
              }
              onChange={(e) => {

  const frame =
    Number(
      e.target.value
    );

  setCurrentFrame(frame);

  setDisplayFrame(frame);

}}
              style={{
                width:
                  "100%",
                marginBottom:
                  "10px",
              }}
            />
          </>
        )}

        {/* HISTORY */}

        {mode ===
          "HISTORY" && (
          <>
            <hr />

            <h3>
              History Mode
            </h3>

            <label>
              <b>
                Date (IST)
              </b>
            </label>

            <input
              type="date"
              value={date}
              onChange={(
                e
              ) =>
                setDate(
                  e.target
                    .value
                )
              }
              style={{
                width:
                  "100%",
                marginBottom:
                  "10px",
              }}
            />

            <label>
              <b>
                Time (IST)
              </b>
            </label>

            <input
              type="time"
              value={time}
              onChange={(
                e
              ) =>
                setTime(
                  e.target
                    .value
                )
              }
              style={{
                width:
                  "100%",
                marginBottom:
                  "10px",
              }}
            />

            <hr />

            <p>
              <b>
                UTC:
              </b>
            </p>

            <p>
              {
                animationLabel
              }
            </p>
          </>
        )}
      </div>
)
}
      {/* MAP */}

      {/* LIVE TIMESTAMP OVERLAY */}

<div
  style={{
  position: "absolute",

  top: 18,

  left: "50%",

  transform:
    "translateX(-50%)",

  zIndex: 3000,

  padding:
  isMobile
    ? "8px 14px"
    : "10px 22px",

  borderRadius: "18px",

  background:
    "rgba(0,0,0,0.62)",

  backdropFilter:
    "blur(10px)",

  WebkitBackdropFilter:
    "blur(10px)",

  color: "white",

  fontWeight: 700,

  fontSize: isMobile
  ? "14px"
  : "24px",

  letterSpacing: "0.5px",

  boxShadow:
    "0 8px 20px rgba(0,0,0,0.4)",

  border:
    "1px solid rgba(255,255,255,0.12)",

  pointerEvents: "none",
}}
>
  {animationLabel} | {channel}
</div>

<MapContainer
key="weather-map"
  bounds={[ [5, 65], [38, 98], ]} 
  boundsOptions={{ padding: [20, 20], }} 
  maxBounds={[ [-5, 55], [42, 105], ]}

  minZoom={4}

  zoomAnimationThreshold={8}

  // fadeAnimation={true}

  preferCanvas={true}

  wheelPxPerZoomLevel={120}
  
  style={{
    height: "100%",
    width: "100%",

    backfaceVisibility:
      "hidden",
  }}
>

        <MapEvents setZoom={setZoom} />
<MapClickHandler

  onClick={
    handleMapClick
    
  }
/>
        {/* BASE MAP */}

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

       {/* STATE BOUNDARIES */}

{statesGeoJson && (
  <GeoJSON
    data={
      statesGeoJson as object
    }

interactive={false}

    style={{
      color:
        "rgba(80,255,120,0.75)",

      weight:
        zoom >= 7
          ? 2.2
          : 1.8,

      opacity:
        zoom >= 7
          ? 0.85
          : 0.7,

      fillOpacity: 0,
    }}
  />
)}

{/* DISTRICT BOUNDARIES */}

{zoom >= 8 &&
  !isPlaying &&
  districtGeoJson && (
    <GeoJSON
      data={
        districtGeoJson as object
      }
      interactive= {false}
      style={() => ({
        color:
          "rgba(220,255,230,0.45)",

        weight: zoom >= 9 ? 1 : 0.6,

        opacity: 0.45,

        fillOpacity: 0,

        
      })}
    />
)}

       {/* SATELLITE */}

<WMSTileLayer
  key={`${utcDatetime}-${channel}-${palette}`}
  url={
    "/api/mosdac-wms?" +
    `datetime=${utcDatetime}`
  }
  className="smooth-wms"
  layers={channel}
  updateInterval={300}
  styles={`boxfill/${palette}`}

  format="image/png"

  transparent={true}

  opacity={
    showOverlay
      ? opacity
      : 0
  }

  version="1.3.0"

  keepBuffer={12}

  updateWhenIdle={false}
  updateWhenZooming={false}
  
  tileSize={256}

  zIndex={100}

  attribution="MOSDAC"
/>

{/* LIVE MOSDAC ALERTS */}
{
showAlerts &&

filteredAlerts
    .map(
      (
        feature,
        index
      ) => {
        const coords =
          feature.geometry
            ?.coordinates;

        if (!coords)
          return null;

        const lng =
          coords[0];

        const lat =
          coords[1];

        const props =
          (feature.properties || feature) as MosdacAlertFeatureProperties;
          
        const alertName =
  props.name || "";

const alertDate =
  props.event_date ||
  props.forecast_date ||
  "";

const alertTime =
  props.event_time ||
  props.forecast_time ||
  "";

        const forecast =
          props.forecast ||
          "";
          const radiusKm =
  parseFloat(
    props.rad_inf || "0"
  );

        const intensityColor =
  radiusKm > 120
    ? "#ff2d2d"
    : radiusKm > 80
    ? "#ff9900"
    : "#00ff66";

        const isCloudburst =
  forecast
    .toLowerCase()
    .includes(
      "cloud"
    );

const isCurrentRain =
  !!props.value;

const isNowcastRain =
  !props.value;
const showMarker =
  zoom >= 8
    ? true
    : zoom >= 6
    ? true
    : zoom >= 5
    ? index % 1 === 0
    : index % 1 === 0;

if (!isCloudburst && !showMarker)
  return null;

return (
  <Fragment
    key={`alert-${index}`}
  >
            <Marker
              position={[
                lat,
                lng,
              ]}
              icon={
  isCloudburst
    ? cloudburstIcon

    : isNowcastRain
    ? nowcastRainIcon

    : blueRainIcon
}
            >
          <Popup
    closeButton={true}
    autoPan={false}
  >
    <div
      style={{
  minWidth: "190px",

  background:
    "rgba(15,23,42,0.88)",

  color: "white",

  padding: "14px",

  borderRadius: "18px",

  backdropFilter:
    "blur(12px)",

  border:
    "1px solid rgba(255,255,255,0.08)",

  fontFamily:
    "'Inter', sans-serif",

  lineHeight: "1.6",

  boxShadow:
    "0 10px 30px rgba(0,0,0,0.4)",
}}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: "14px",
          textTransform:
            "uppercase",
          marginBottom: "8px",
          textDecoration:
            "underline",
        }}
      >
        {
  isNowcastRain
    ? "HEAVY RAIN (NOWCAST)"
    : alertName
}
      </div>

      <div>
        <b>LON LAT :</b>
        <br />
        {lng.toFixed(2)},
        {" "}
        {lat.toFixed(2)}
      </div>

      <div
  style={{
    marginTop: "8px",
  }}
>
  <b>Forecast Issued :</b>
  <br />
  {alertDate}
  {" "}
  {alertTime}
</div>

{
  isNowcastRain && (
    <div
      style={{
        marginTop: "8px",
      }}
    >
      <b>Validity :</b>

      <br />

      {alertTime}
      {" "}
      (+6 hrs)
    </div>
  )
}

      <div
  style={{
    marginTop: "8px",
  }}
>
  <b>
    {props.value
      ? "Rainfall"
      : "Radius"}
    :
  </b>

  <br />

  {props.value
    ? `${props.value} mm`
    : `${props.rad_inf} km`}
</div>
    </div>
  </Popup>
            </Marker>

            {/* SHOW RADIUS ONLY ON HIGH ZOOM */}

            
              {!isCurrentRain && (
<Circle
              
  center={[
    lat,
    lng,
  ]}
 radius={
  zoom >= 7
    ? radiusKm * 1000
    : zoom >= 5
    ? radiusKm * 1200
    : zoom >= 3
    ? radiusKm * 1500
    : radiusKm * 1800
}
  pathOptions={{
    color: "#ffe600",

    fillOpacity:
      radiusKm > 120
        ? 0.08
        : radiusKm > 80
        ? 0.05
        : 0.03,

    weight:
      radiusKm > 120
        ? 3
        : radiusKm > 80
        ? 2
        : 1.2,

    opacity:
      radiusKm > 120
        ? 1
        : 0.75,
  }}
>
  <Popup
  pane="popupPane"
    closeButton={true}
    autoPan={false}
  >
    <div
      style={{
  minWidth: "190px",

  background:
    "rgba(15,23,42,0.88)",

  color: "white",

  padding: "14px",

  borderRadius: "18px",

  backdropFilter:
    "blur(12px)",

  border:
    "1px solid rgba(255,255,255,0.08)",

  fontFamily:
    "'Inter', sans-serif",

  lineHeight: "1.6",

  boxShadow:
    "0 10px 30px rgba(0,0,0,0.4)",
}}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: "14px",
          textTransform:
            "uppercase",
          marginBottom: "8px",
          textDecoration:
            "underline",
        }}
      >
        <>
  {
    isNowcastRain &&
    (
      <span
        style={{
          color:
            intensityColor,
          marginRight:
            "6px",
        }}
      >
        ●
      </span>
    )
  }

  {
    isNowcastRain
      ? "HEAVY RAIN (NOWCAST)"
      : alertName
  }
</>
      </div>

      <div>
        <b>LON LAT :</b>
        <br />
        {lng.toFixed(2)},
        {" "}
        {lat.toFixed(2)}
      </div>

<div
  style={{
    marginTop: "8px",
  }}
>
  <b>Forecast Issued :</b>
  <br />
  {alertDate}
  {" "}
  {alertTime}
</div>

{
  isNowcastRain && (
    <div
      style={{
        marginTop: "8px",
      }}
    >
      <b>Validity :</b>

      <br />

      {alertTime}
      {" "}
      (+6 hrs)
    </div>
  )
}
<div
  style={{
    marginTop: "8px",
  }}
>
  <b>Expected Within:</b>

  <br />

  Next 6 Hours
</div>
      <div
  style={{
    marginTop: "8px",
  }}
>
  <b>
    {props.value
      ? "Rainfall"
      : "Radius"}
    :
  </b>

  <br />

  {props.value
    ? `${props.value} mm`
    : `${props.rad_inf} km`}
</div>
    </div>
  </Popup>
</Circle>
 )}           
          </Fragment>
        );
      }
    )}
    {/* THUNDERSTORM ALERTS */}

{showThunderstorms &&
visibleThunderstorms.map(
  (cell, index) => (
    <Marker
      key={`storm-${index}`}
      position={[
        cell.lat,
        cell.lon,
      ]}
      icon={
        leaflet
          ? createThunderstormIcon(
              leaflet,
              cell,
              zoom
            )
          : undefined
      }
    >
      <Popup>
  <b>Thunderstorm Cell</b>

  <br />

  Severity:
  {" "}
  {
    cell.temp < 190
      ? "🔴 Severe"
      : cell.temp < 195
      ? "🟠 Strong"
      : "🟡 Moderate"
  }

  <br />

  Temp:
  {" "}
  {cell.temp.toFixed(1)} K

  <br />

  Impact Radius:
  {" "}
  {Math.round(
    Math.sqrt(cell.count) * 2
  )} km

  <br />

  Cell Strength:
  {" "}
  {cell.count}
</Popup>
    </Marker>
  )
)}
{cloudPopup && (
  <Popup
    position={[
      cloudPopup.lat,
      cloudPopup.lon
    ]}
      autoPan={true}
      closeButton={false}
  className="cloud-info-popup"
    >
    <div style={{
      width:              "160px",
      background:         "rgba(10,16,30,0.97)",
      color:              "white",
      padding:            "8px",
      borderRadius:       "14px",
      backdropFilter:     "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border:             "1px solid rgba(255,255,255,0.09)",
      boxShadow:          "0 14px 42px rgba(0,0,0,0.65)",
      fontFamily:         "'Inter', sans-serif",
    }}>

      {/* ── HEADER ── */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        alignItems:     "center",
        marginBottom:   "10px",
      }}>
        <span style={{
          fontSize:      "11px",
          fontWeight:    700,
          letterSpacing: "1px",
          color:         "#64748b",
          textTransform: "uppercase",
        }}>
          ☁ &nbsp;Cloud Cover
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); setCloudPopup(null); }}
          style={{
            background:   "rgba(255,255,255,0.06)",
            border:       "none",
            color:        "#94a3b8",
            width:        "20px",
            height:       "20px",
            borderRadius: "6px",
            cursor:       "pointer",
            fontSize:     "14px",
            lineHeight:   "20px",
            textAlign:    "center",
          }}
        >✕</button>
      </div>

      {/* ── MAIN VALUE ── */}
      <div style={{
        display:     "flex",
        alignItems:  "flex-end",
        gap:         "3px",
        marginBottom:"8px",
      }}>
        <span style={{
          fontSize:           "32px",
          fontWeight:         800,
          lineHeight:         1,
          color:              ccToColor(cloudPopup.cloudCover),
          fontVariantNumeric: "tabular-nums",
        }}>
          {cloudPopup.cloudCover}
        </span>
        <span style={{
          fontSize:     "18px",
          fontWeight:   700,
          color:        "#475569",
          paddingBottom:"6px",
        }}>%</span>
      </div>

      {/* ── SKY CONDITION ── */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          "7px",
        marginBottom: "8px",
      }}>
        <span style={{ fontSize: "18px" }}>
          {getSkyIcon(cloudPopup.cloudCover)}
        </span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>
          {getCloudLabel(cloudPopup.cloudCover)}
        </span>
      </div>

      {/* ── RAIN RISK ── */}
      {(() => {
        const risk = getCloudRainRisk(cloudPopup.temp, cloudPopup.cloudCover);
        return risk ? (
          <div style={{
            fontSize:     "12px",
            fontWeight:   600,
            color:        risk.color,
            padding:      "5px 9px",
            borderRadius: "8px",
            background:   `${risk.color}1a`,
            border:       `1px solid ${risk.color}35`,
            marginBottom: "10px",
          }}>
            {risk.label}
          </div>
        ) : null;
      })()}

      {/* ── BT + COORDS ── */}
      <div style={{
        fontSize:       "10px",
        color:          "#475569",
        display:        "flex",
        justifyContent: "space-between",
      }}>
        {cloudPopup.temp > 100 && (
          <span>
            BT&nbsp;{cloudPopup.temp}&nbsp;K
            &nbsp;({(cloudPopup.temp - 273.15).toFixed(1)}°C)
          </span>
        )}
        <span>
          {cloudPopup.lat.toFixed(2)}°N&nbsp;
          {cloudPopup.lon.toFixed(2)}°E
        </span>
      </div>

    </div>
  </Popup>
)}
        {/* LABELS */}

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
          opacity={1}
        />
            </MapContainer>
            {
!showAlertLegend && (
  <button
    onClick={() =>
      setShowAlertLegend(true)
    }
    style={{
      position: "absolute",

      bottom: 22,
      left: 22,

      zIndex: 9999,

      width: "42px",
      height: "42px",

      borderRadius: "14px",

      border:
        "1px solid rgba(255,255,255,0.08)",

      background:
        "rgba(15,23,42,0.82)",

      backdropFilter:
        "blur(12px)",

      color: "white",

      fontSize: "22px",

      cursor: "pointer",

      boxShadow:
        "0 8px 20px rgba(0,0,0,0.4)",
    }}
  >
    ❯
  </button>
)}
  {
showAlertLegend && (     
       <div
  style={{
    position: "absolute",
    bottom: "22px",
    left: "22px",

    zIndex: 9999,

    background:
      "linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.58))",

    backdropFilter: "blur(16px)",

    border:
      "1px solid rgba(255,255,255,0.12)",

    borderRadius: "18px",

    padding: "12px",

    color: "white",

    minWidth: "190px",

    boxShadow:
      "0 10px 25px rgba(0,0,0,0.45)",

    fontFamily:
      "'Inter', sans-serif",
  }}
>
  <div
  style={{
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: "10px",
  }}
>
  <div
    style={{
      fontSize: "14px",
      fontWeight: 700,
    }}
  >
    Weather Alerts
  </div>

  <button
    onClick={() =>
      setShowAlertLegend(false)
    }
    style={{
      width: "30px",
      height: "30px",

      borderRadius: "10px",

      border:
        "1px solid rgba(255,255,255,0.08)",

      background:
        "rgba(255,255,255,0.08)",

      color: "white",

      fontSize: "18px",

      cursor: "pointer",

      display: "flex",

      alignItems: "center",

      justifyContent:
        "center",
    }}
  >
    ❮
  </button>
</div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "8px",
    }}
  >
    <span style={{ fontSize: "18px" }}>
      🌧️
    </span>

    <div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        Heavy Rain
      </div>

      <div
        style={{
          fontSize: "10px",
          color: "#94a3b8",
        }}
      >
        Forecast rainfall alert
      </div>
    </div>
  </div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "8px",
    }}
  >
    <span style={{ fontSize: "18px" }}>
      ☔
    </span>

    <div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        Nowcast Rain
      </div>

      <div
        style={{
          fontSize: "10px",
          color: "#94a3b8",
        }}
      >
        Expected within 6 hours
      </div>
    </div>
  </div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
    }}
  >
    <span
      style={{
        fontSize: "18px",
        color: "#facc15",
      }}
    >
      ⚡
    </span>

    <div>
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
        }}
      >
        Thunderstorm
      </div>

      <div
        style={{
          fontSize: "10px",
          color: "#94a3b8",
        }}
      >
        Deep convective cloud cell
      </div>
    </div>
  </div>
</div>
)}
            {
!showLegend && (
  <button
    onClick={() =>
      setShowLegend(true)
    }
    style={{
      position: "absolute",

      bottom: 22,
      right: 22,

      zIndex: 9999,

      width: "42px",
      height: "42px",

      borderRadius: "14px",

      border:
        "1px solid rgba(255,255,255,0.08)",

      background:
        "rgba(15,23,42,0.82)",

      backdropFilter:
        "blur(12px)",

      color: "white",

      fontSize: "22px",

      cursor: "pointer",
    }}
  >
    ❮
  </button>
)}
{
showLegend && (
     <div
  style={{
    position: "absolute",

    bottom: "22px",

    right: "22px",

    zIndex: 9999,

    width: "320px",

    background:
      "linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.58))",

    backdropFilter:
      "blur(16px)",

    border:
      "1px solid rgba(255,255,255,0.12)",

    borderRadius: "24px",

    padding: "14px",

    boxShadow:
      "0 12px 35px rgba(0,0,0,0.5)",

    color: "white",
  }}
>
  <div
    style={{
      fontSize: "15px",
fontWeight: 700,
letterSpacing: "0.3px",
fontFamily:
  "'Inter', sans-serif",
      marginBottom: "12px",
    }}
  >
    <div
  style={{
    display: "flex",

    justifyContent:
      "space-between",

    alignItems: "center",

    marginBottom: "10px",
  }}
>
  <div
    style={{
      fontSize: "15px",
      fontWeight: 700,
    }}
  >
  {currentLegend.title}
  <div
  style={{
    width: "60px",
    height: "3px",

    borderRadius: "999px",

    background:
      "linear-gradient(90deg, #2563eb,#38bdf8)",

    marginTop: "6px",
    marginBottom: "10px",
  }}
/>  
  </div>

  <button
    onClick={() =>
      setShowLegend(false)
    }
    style={{
  width: "38px",
  height: "38px",

  borderRadius: "12px",

  border:
    "1px solid rgba(255,255,255,0.08)",

  background:
    "rgba(255,255,255,0.08)",

  color: "white",

  fontSize: "22px",

  cursor: "pointer",

  display: "flex",

  alignItems: "center",

  justifyContent: "center",
}}
  >
    ✕
  </button>
</div>
  </div>

  <div
    style={{
      height: "18px",

      borderRadius: "12px",

      background:
        currentGradient,

      boxShadow:
        "inset 0 0 10px rgba(255,255,255,0.25)",
    }}
  />

  <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    marginTop: "8px",
  }}
>
  {[...Array(6)].map((_, i) => (
    <div
      key={i}
      style={{
        width: "2px",
        height: "10px",
        background:
          "rgba(255,255,255,0.8)",
      }}
    />
  ))}
</div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    marginTop: "6px",
    fontSize: "11px",
    fontWeight: 700,
  }}
>
  <span>180</span>
  <span>210</span>
  <span>240</span>
  <span>270</span>
  <span>300</span>
  <span>320</span>
</div>

  <div
    style={{
      marginTop: "10px",

      fontSize: "10px",

      color: "#cbd5e1",

      display: "flex",

      justifyContent:
        "space-between",
    }}
  >
    <span>
  Severe Thunderstorms
</span>

<span>
  Clear Sky / Surface
</span>
  </div>

  <div
    style={{
      marginTop: "8px",

      fontSize: "11px",

      color: "#94a3b8",
    }}
  >
    Palette: {palette}
  </div>
</div>       
)
}
    </div>
    
  );
}