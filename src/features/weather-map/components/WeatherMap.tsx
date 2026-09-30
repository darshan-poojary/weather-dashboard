"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CloudPoint,
  CloudPopup,
  GeoJsonObject,
  MosdacAlertFeature,
  ThunderstormCell,
  Palette,
  WeatherChannel,
  WeatherMode,
} from "../types";
import {
  GRID_DEG,
  LEGENDS,
  PALETTE_GRADIENTS,
} from "../config";
import { createDivIcon, createThunderstormIcon } from "../helpers";
import type { MosdacAlertFeatureProperties } from "../types";
import { snapToSlotDate } from "../../../lib/mosdac";
import WeatherMapControls from "./Controls";
import WeatherMapLegend from "./Legend";
import WeatherMapCloudPopup from "./CloudPopup";

const loadLeafletComponent = <T extends ComponentType<Record<string, unknown>>>(name: string) =>
  dynamic(async () => {
    const mod = await import("react-leaflet");
    return (mod as unknown as Record<string, T>)[name];
  }, { ssr: false }) as T;

const MapContainer = loadLeafletComponent("MapContainer");
const TileLayer = loadLeafletComponent("TileLayer");
const WMSTileLayer = loadLeafletComponent("WMSTileLayer");
const GeoJSON = loadLeafletComponent("GeoJSON");

const MapEvents = dynamic(
  async () => {
    const mod = await import("react-leaflet");

    return function Events({
      onView,
    }: {
      onView: (zoom: number, bounds: [number, number, number, number]) => void;
    }) {
      const report = useCallback((map: import("leaflet").Map) => {
        const b = map.getBounds().pad(0.25);
        onView(map.getZoom(), [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
      }, [onView]);
      const map = mod.useMapEvents({
        zoomend() {
          report(map);
        },
        moveend() {
          report(map);
        },
      });

      useEffect(() => { report(map); }, [map, report]);

      return null;
    };
  },
  { ssr: false }
);

const MapClickHandler = dynamic(
  async () => {
    const mod = await import("react-leaflet");

    return function ClickHandler(props: { onClick: (lat: number, lon: number) => void }) {
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

// Imperative alert + thunderstorm layer. Building Leaflet markers/circles/popups
// directly (instead of hundreds of react-leaflet <Marker>/<Popup> components)
// removes the per-marker React reconciliation and eager popup DOM that made
// zoom/pan janky. Popups are bound lazily so their HTML is built only on open.
const AlertLayer = dynamic(
  async () => {
    const mod = await import("react-leaflet");
    const L = await import("leaflet");

    const rainIcon = createDivIcon(
      L,
      `<div style="font-size:15px;line-height:15px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));">🌧️</div>`,
      [15, 15],
      [7.5, 7.5]
    );
    const nowcastIcon = createDivIcon(
      L,
      `<div style="font-size:15px;line-height:15px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.7));">☔</div>`,
      [15, 15],
      [7.5, 7.5]
    );
    const cloudburstIcon = createDivIcon(
      L,
      `<div style="font-size:17px;line-height:17px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.75));">⛈️</div>`,
      [17, 17],
      [8.5, 8.5]
    );

    const card = (inner: string) =>
      `<div style="min-width:186px;font-family:var(--font-inter),sans-serif;color:#fff;line-height:1.55">${inner}</div>`;
    const row = (label: string, value: string) =>
      `<div style="margin-top:8px;font-size:12px;color:#cbd5e1"><b style="color:#fff">${label}</b><br/>${value}</div>`;
    const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]!);
    const heading = (accent: string, text: string) =>
      `<div style="display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px;letter-spacing:.4px;margin-bottom:6px"><span style="width:8px;height:8px;border-radius:50%;background:${accent};box-shadow:0 0 8px ${accent}"></span>${text}</div>`;

    return function AlertLayerInner({
      alerts,
      storms,
      zoom,
      showAlerts,
      showThunderstorms,
    }: {
      alerts: MosdacAlertFeature[];
      storms: ThunderstormCell[];
      zoom: number;
      showAlerts: boolean;
      showThunderstorms: boolean;
    }) {
      const map = mod.useMap();

      // Rain / nowcast / cloudburst markers — rebuild when the on-screen set
      // changes (pan / zoom / data), which is cheap because it's viewport-culled.
      useEffect(() => {
        if (!showAlerts) return;
        const group = L.layerGroup();

        for (const feature of alerts) {
          const coords = feature.geometry?.coordinates;
          if (!coords) continue;
          const [lng, lat] = coords;
          const props = (feature.properties || feature) as MosdacAlertFeatureProperties;
          const forecast = (props.forecast || "").toString().toLowerCase();
          const isCloudburst = forecast.includes("cloud");
          const isCurrentRain = !!props.value;
          const radiusKm = parseFloat(props.rad_inf || "0");

          if (!isCurrentRain && radiusKm > 0) {
            L.circle([lat, lng], {
              radius: radiusKm * 1000,
              interactive: false,
              color: isCloudburst ? "#fb923c" : "#facc15",
              weight: 1.3,
              opacity: 0.7,
              fillColor: isCloudburst ? "#fb923c" : "#facc15",
              fillOpacity: 0.05,
            }).addTo(group);
          }

          const icon = isCloudburst
            ? cloudburstIcon
            : isCurrentRain
            ? rainIcon
            : nowcastIcon;

          const marker = L.marker([lat, lng], { icon });
          marker.bindPopup(
            () => {
              const accent = isCloudburst ? "#f97316" : "#38bdf8";
              if (isCurrentRain) {
                return card(
                  heading(accent, "HEAVY RAIN (CURRENT)") +
                    row("Location", `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`) +
                    row("Rainfall", `${parseFloat(props.value as string).toFixed(1)} mm`)
                );
              }
              const date = props.forecast_date || props.event_date || "";
              const time = props.forecast_time || props.event_time || "";
              return card(
                heading(accent, isCloudburst ? "CLOUDBURST (NOWCAST)" : "HEAVY RAIN (NOWCAST)") +
                  row("Location", `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`) +
                  (date || time ? row("Forecast issued", escapeHtml(`${date} ${time}`)) : "") +
                  row("Validity", "Next 6 hours") +
                  (radiusKm > 0 ? row("Radius of influence", `${radiusKm.toFixed(1)} km`) : "")
              );
            },
            { closeButton: true }
          );
          marker.addTo(group);
        }

        group.addTo(map);
        return () => {
          map.removeLayer(group);
        };
      }, [map, alerts, showAlerts]);

      // Thunderstorm cells — rebuild only when the data or zoom (icon size)
      // changes, so panning never touches these markers.
      useEffect(() => {
        if (!showThunderstorms) return;
        const group = L.layerGroup();

        for (const cell of storms) {
          if (
            cell.severity !== "Severe" &&
            cell.severity !== "Strong" &&
            cell.severity !== "Moderate"
          )
            continue;

          const marker = L.marker([cell.lat, cell.lon], {
            icon: createThunderstormIcon(L, cell, zoom),
          });
          const severityLabel =
            cell.severity === "Severe"
              ? "🔴 Severe"
              : cell.severity === "Strong"
              ? "🟠 Strong"
              : "🟡 Moderate";
          marker.bindPopup(() =>
            card(
              heading("#facc15", "⚡ THUNDERSTORM CELL") +
                `<div style="font-size:12px;color:#cbd5e1">Severity: ${severityLabel}<br/>Cloud-top temp: ${cell.temp.toFixed(
                  1
                )} K<br/>Impact radius: ${cell.radius_km} km<br/>Cell strength: ${cell.count}</div>` +
                row("Observed", escapeHtml(cell.updated))
            )
          );
          marker.addTo(group);
        }

        group.addTo(map);
        return () => {
          map.removeLayer(group);
        };
      }, [map, storms, zoom, showThunderstorms]);

      return null;
    };
  },
  { ssr: false }
);

// INSAT-3R live frames are half-hourly (:15 / :45). The timeline shows the last
// FRAME_COUNT frames, stepping back in true 30-minute increments.
const FRAME_COUNT = 20;
const SLOT_MS = 30 * 60 * 1000;
const EMPTY_TILE = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export default function WeatherMap() {
  const [opacity, setOpacity] = useState(0.7);
  const [channel, setChannel] = useState<WeatherChannel>("IMG_TIR1");
  const [palette, setPalette] = useState<Palette>("greyscale");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(4000);
  const [mode, setMode] = useState<WeatherMode>("LIVE");
  const [showOverlay, setShowOverlay] = useState(true);
  const [zoom, setZoom] = useState(5);
  const [isMobile, setIsMobile] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAlertLegend, setShowAlertLegend] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [showThunderstorms, setShowThunderstorms] = useState(true);
  const [liveDatetime, setLiveDatetime] = useState<string | null>(null);
  // Padded viewport [south, west, north, east] — used to only render alerts on screen.
  const [viewBounds, setViewBounds] = useState<[number, number, number, number] | null>(null);

  const [statesGeoJson, setStatesGeoJson] = useState<GeoJsonObject | null>(null);
  const [districtGeoJson, setDistrictGeoJson] = useState<GeoJsonObject | null>(null);
  const [thunderstormCells, setThunderstormCells] = useState<ThunderstormCell[]>([]);
  const cloudData = useRef<{ points: CloudPoint[]; loadedAt: number } | null>(null);
  const cloudRequest = useRef<Promise<CloudPoint[]> | null>(null);
  const cloudClick = useRef(0);
  const [cloudPopup, setCloudPopup] = useState<CloudPopup | null>(null);
  const [mosdacAlerts, setMosdacAlerts] = useState<MosdacAlertFeature[]>([]);
  const [feedErrors, setFeedErrors] = useState<Record<string, string>>({});
  const [latestStatus, setLatestStatus] = useState("Checking latest frame");
  const tileFailed = useRef(false);
  const baseTileFailed = useRef(false);
  const reportError = useCallback((feed: string, message: string) => {
    setFeedErrors((previous) => previous[feed] === message ? previous : { ...previous, [feed]: message });
  }, []);
  const handleView = useCallback((nextZoom: number, bounds: [number, number, number, number]) => {
    setZoom(nextZoom);
    setViewBounds(bounds);
  }, []);

  // Anchor the timeline on the newest frame that actually exists (probed via
  // /api/mosdac-latest) and step back so animation has no duplicate frames.
  const frames = useMemo(() => {
    const anchor = liveDatetime ? new Date(liveDatetime) : snapToSlotDate(new Date());

    return Array.from({ length: FRAME_COUNT }, (_, index) => {
      const frame = new Date(anchor.getTime() - (FRAME_COUNT - 1 - index) * SLOT_MS);
      return frame.toISOString();
    });
  }, [liveDatetime]);

  const [currentFrame, setCurrentFrame] = useState(frames.length - 1);
  const [displayFrame, setDisplayFrame] = useState(frames.length - 1);
  const [frameLoading, setFrameLoading] = useState(false);

  useEffect(() => {
    let wasMobile = false;
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && !wasMobile) {
        setShowLegend(false);
        setShowAlertLegend(false);
      }
      wasMobile = mobile;
    };
    const initialLayout = requestAnimationFrame(() => {
      checkMobile();
    });
    window.addEventListener("resize", checkMobile);
    return () => {
      cancelAnimationFrame(initialLayout);
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<GeoJsonObject>("/geo/india-states.geojson", controller.signal)
      .then(setStatesGeoJson)
      .catch(() => { if (!controller.signal.aborted) reportError("states", "State boundaries unavailable."); });
    return () => controller.abort();
  }, [reportError]);

  const needsDistricts = zoom >= 8;
  useEffect(() => {
    if (!needsDistricts || districtGeoJson) return;
    const controller = new AbortController();
    fetchJson<GeoJsonObject>("/geo/india-districts.geojson", controller.signal)
      .then((data) => { setDistrictGeoJson(data); reportError("districts", ""); })
      .catch(() => { if (!controller.signal.aborted) reportError("districts", "District boundaries unavailable."); });
    return () => controller.abort();
  }, [needsDistricts, districtGeoJson, reportError]);

  useEffect(() => () => {
    cloudClick.current += 1;
  }, []);

  // Track the newest satellite frame that is actually available on MOSDAC.
  useEffect(() => {
    const controller = new AbortController();

    const fetchLatest = async () => {
      try {
        const data = await fetchJson<{ datetime: string | null }>(
          `/api/mosdac-latest?layers=${channel}&styles=boxfill/${palette}`, controller.signal
        );
        if (!controller.signal.aborted && data?.datetime && Number.isFinite(Date.parse(data.datetime))) {
          setLiveDatetime((prev) => (prev === data.datetime ? prev : data.datetime));
          setLatestStatus("");
        } else if (!controller.signal.aborted) {
          setLatestStatus("Latest frame unavailable");
        }
      } catch {
        if (!controller.signal.aborted) setLatestStatus("Latest frame unavailable");
      }
    };

    fetchLatest();
    const interval = setInterval(fetchLatest, 5 * 60 * 1000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [channel, palette]);

  useEffect(() => {
    if (mode !== "ANIMATION" || !isPlaying || !showOverlay || frameLoading) return;

    const timeout = setTimeout(() => {
      const nextFrame = currentFrame >= frames.length - 1 ? 0 : currentFrame + 1;
      setCurrentFrame(nextFrame);
      setDisplayFrame(nextFrame);
    }, speed);

    return () => clearTimeout(timeout);
  }, [mode, isPlaying, showOverlay, speed, currentFrame, frames.length, frameLoading]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchAlerts = async () => {
      try {
        const parsed = await fetchJson<{ features: MosdacAlertFeature[] }>("/api/mosdac-alerts", controller.signal);
        if (!controller.signal.aborted && Array.isArray(parsed.features)) {
          setMosdacAlerts(parsed.features);
          reportError("alerts", "");
        }
      } catch {
        if (!controller.signal.aborted) reportError("alerts", "Rain alerts unavailable; previously loaded alerts may be outdated.");
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 300000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [reportError]);

  useEffect(() => {
    const controller = new AbortController();
    const loadStorms = async () => {
      try {
        const data = await fetchJson<ThunderstormCell[]>("/thunderstorm-cells.json", controller.signal);
        if (controller.signal.aborted) return;
        if (!Array.isArray(data)) throw new Error("Invalid storm data");
        setThunderstormCells(data);
        const timestamps = data.map((cell) => Date.parse(cell.updated)).filter(Number.isFinite);
        const newest = timestamps.length ? Math.max(...timestamps) : NaN;
        reportError("storms", data.length && (!Number.isFinite(newest) || Date.now() - newest > 3 * 60 * 60 * 1000)
          ? `Storm data is outdated${Number.isFinite(newest) ? ` (updated ${new Date(newest).toISOString().slice(0, 16).replace("T", " ")} UTC)` : ""}.`
          : "");
      } catch {
        if (!controller.signal.aborted) reportError("storms", "Storm data unavailable.");
      }
    };

    loadStorms();
    const stormInterval = setInterval(loadStorms, 1800000);
    return () => {
      controller.abort();
      clearInterval(stormInterval);
    };
  }, [reportError]);

  function getHistoryUtcDatetime() {
    if (!date || !time) return null;
    const istDate = new Date(`${date}T${time}:00+05:30`);
    return Number.isFinite(istDate.getTime()) ? snapToSlotDate(istDate).toISOString() : null;
  }

  // Fallback frame shown before the /api/mosdac-latest probe resolves. Snap to
  // the live half-hourly slot (shared with the proxy), then step back an hour
  // for safety since the newest slot may not be published yet.
  function getLatestMosdacTime() {
    const slot = snapToSlotDate(new Date());
    slot.setUTCMinutes(slot.getUTCMinutes() - 60);
    return slot.toISOString();
  }

  let utcDatetime = liveDatetime ?? getLatestMosdacTime();
  if (mode === "ANIMATION" && frames.length > 0) {
    utcDatetime = frames[displayFrame];
  }

  if (mode === "HISTORY") {
    const historyTime = getHistoryUtcDatetime();
    if (historyTime) {
      utcDatetime = historyTime;
    }
  }

  function formatAnimationDate(iso: string) {
    const dateValue = new Date(iso);
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

    const day = String(dateValue.getUTCDate()).padStart(2, "0");
    const month = months[dateValue.getUTCMonth()];
    const year = dateValue.getUTCFullYear();
    const hours = String(dateValue.getUTCHours()).padStart(2, "0");
    const mins = String(dateValue.getUTCMinutes()).padStart(2, "0");

    return `${day}-${month}-${year} ${hours}:${mins} UTC`;
  }

  const animationLabel = formatAnimationDate(utcDatetime);

  // Feed the frame time as a WMS param (updated via setParams) instead of the URL
  // or the React key, so changing frames redraws in place rather than tearing
  // down and rebuilding the whole tile layer — much smoother LIVE + animation.
  const wmsParams = useMemo(() => ({ datetime: utcDatetime }), [utcDatetime]);
  const tileEvents = useMemo(() => ({
    loading: () => { tileFailed.current = false; setFrameLoading(true); },
    tileerror: () => {
      tileFailed.current = true;
      reportError("satellite", "Satellite imagery unavailable for this frame. Try another time or channel.");
    },
    load: () => {
      setFrameLoading(false);
      if (!tileFailed.current) reportError("satellite", "");
    },
  }), [reportError]);
  const baseTileEvents = useMemo(() => ({
    loading: () => { baseTileFailed.current = false; },
    tileerror: () => {
      baseTileFailed.current = true;
      reportError("base", "Base map tiles could not load. Check your connection.");
    },
    load: () => { if (!baseTileFailed.current) reportError("base", ""); },
  }), [reportError]);

  // The MOSDAC feed carries thousands of alerts. Rendering them all as DOM
  // markers is what made zoom lag. Instead we render only what's on screen,
  // decluttered by zoom (more markers as you zoom in — like MOSDAC), and hard
  // capped so the marker count — and therefore zoom cost — stays bounded.
  const visibleAlerts = useMemo(() => {
    // Keep a CONSTANT on-screen spacing between current-rain icons (~64px) at
    // every zoom. Deriving the degree gap from zoom this way means the visual
    // density stays steady while zooming — icons don't pop in/out — and you get
    // finer detail as you zoom in without ever blanketing the overview.
    const degPerPixel = 360 / (256 * Math.pow(2, zoom));
    const minGap = Math.max(0.05, 64 * degPerPixel);
    const MAX_CURRENT = 260;

    const [south, west, north, east] = viewBounds ?? [-90, -180, 90, 180];
    const inView = (lat: number, lng: number) =>
      lat >= south && lat <= north && lng >= west && lng <= east;

    // Nowcast forecasts declutter a bit more loosely than current rain so they
    // read as distinct alerts, not a blanket.
    const nowcastGap = minGap * 1.6;

    const grid = new Map<string, true>();
    const nowcastGrid = new Map<string, true>();
    const nowcast: MosdacAlertFeature[] = [];
    const current: MosdacAlertFeature[] = [];

    for (const feature of mosdacAlerts) {
      const coords = feature.geometry?.coordinates;
      if (!coords) continue;
      const [lng, lat] = coords;

      const props = (feature.properties || feature) as MosdacAlertFeatureProperties;
      const value = props.value;

      if (!value) {
        // Cloudbursts are rare and critical — always shown.
        const isCloudburst = (props.forecast || "").toString().toLowerCase().includes("cloud");
        if (isCloudburst) {
          nowcast.push(feature);
          continue;
        }
        // Nowcast rain: viewport-culled + decluttered like the rain field.
        if (!inView(lat, lng)) continue;
        const key = `${Math.floor(lng / nowcastGap)}:${Math.floor(lat / nowcastGap)}`;
        if (nowcastGrid.has(key)) continue;
        nowcastGrid.set(key, true);
        nowcast.push(feature);
        continue;
      }

      // Current-rain is viewport-culled + capped for performance.
      if (!inView(lat, lng) || current.length >= MAX_CURRENT) continue;

      const key = `${Math.floor(lng / minGap)}:${Math.floor(lat / minGap)}`;
      if (grid.has(key)) continue;
      grid.set(key, true);
      current.push(feature);
    }

    return [...current, ...nowcast];
  }, [mosdacAlerts, zoom, viewBounds]);

  const visibleStorms = useMemo(() => {
    if (!viewBounds) return [];
    const [south, west, north, east] = viewBounds;
    return thunderstormCells.filter((cell) =>
      cell.lat >= south && cell.lat <= north && cell.lon >= west && cell.lon <= east
    );
  }, [thunderstormCells, viewBounds]);

  const currentLegend = LEGENDS[channel];
  const currentGradient = PALETTE_GRADIENTS[palette];

  // Boundaries use a "cased line" — a dark halo under a bright core — so they
  // stay legible over any palette (greyscale, rainbow, …) instead of blending
  // in. Memoized on coarse zoom buckets to avoid re-styling on every zoom step.
  const statesZoomBucket = zoom >= 7;
  const statesCasingStyle = useMemo(
    () => ({
      color: "rgba(0,0,0,0.6)",
      weight: statesZoomBucket ? 5 : 4,
      opacity: 0.55,
      fillOpacity: 0,
      lineJoin: "round" as const,
    }),
    [statesZoomBucket]
  );
  const statesLineStyle = useMemo(
    () => ({
      color: "rgba(255,255,255,0.95)",
      weight: statesZoomBucket ? 1.8 : 1.4,
      opacity: 0.95,
      fillOpacity: 0,
      lineJoin: "round" as const,
    }),
    [statesZoomBucket]
  );

  const districtsZoomBucket = zoom >= 9;
  const districtCasingStyle = useMemo(
    () => () => ({
      color: "rgba(0,0,0,0.45)",
      weight: districtsZoomBucket ? 2.2 : 1.7,
      opacity: 0.4,
      fillOpacity: 0,
    }),
    [districtsZoomBucket]
  );
  const districtLineStyle = useMemo(
    () => () => ({
      color: "rgba(255,255,255,0.8)",
      weight: districtsZoomBucket ? 0.9 : 0.6,
      opacity: 0.7,
      fillOpacity: 0,
    }),
    [districtsZoomBucket]
  );

  const handleMapClick = useCallback(
    async (clickLat: number, clickLon: number) => {
      const clickId = ++cloudClick.current;
      try {
        // The 3 MB cloud grid is only needed when inspecting a location.
        if (!cloudData.current || Date.now() - cloudData.current.loadedAt > 1800000) {
          cloudRequest.current ??= fetchJson<CloudPoint[]>("/cloud-grid.json").finally(() => {
            cloudRequest.current = null;
          });
          const points = await cloudRequest.current;
          if (!Array.isArray(points)) throw new Error("Invalid cloud grid");
          cloudData.current = { points, loadedAt: Date.now() };
        }
        if (clickId !== cloudClick.current) return;
        const cloudPoints = cloudData.current.points;
      const gridLat = Math.round(clickLat / GRID_DEG) * GRID_DEG;
      const gridLon = Math.round(clickLon / GRID_DEG) * GRID_DEG;

      const nearest = cloudPoints.reduce(
        (best, p) => {
          const dist = Math.abs(p.gridLat - gridLat) + Math.abs(p.gridLon - gridLon);
          if (!best || dist < best.dist) {
            return { dist, point: p };
          }
          return best;
        },
        null as { dist: number; point: CloudPoint } | null
      );

      // Do not present a distant cell as an observation at the clicked location.
      if (!nearest || nearest.dist > GRID_DEG * 2) {
        setCloudPopup(null);
        reportError("cloud", "No cloud observation available at this location.");
        return;
      }
      const cell = nearest.point;
      reportError("cloud", "");
      setCloudPopup({ lat: clickLat, lon: clickLon, cloudCover: cell.cloudCover, temp: cell.temp });
      } catch {
        if (clickId === cloudClick.current) reportError("cloud", "Cloud observations unavailable.");
      }
    },
    [reportError]
  );

  const notices = [mode === "LIVE" ? latestStatus : "Rain, storms and cloud details use the latest observations, independently of the satellite timeline.", ...Object.entries(feedErrors)
    .filter(([feed]) => (feed !== "satellite" || showOverlay) && (feed !== "storms" || showThunderstorms) && (feed !== "alerts" || showAlerts))
    .map(([, message]) => message)].filter(Boolean);

  return (
    <div style={{ height: "100dvh", width: "100%", overflow: "hidden", background: "#000" }}>
      <WeatherMapControls
        channel={channel}
        setChannel={setChannel}
        palette={palette}
        setPalette={setPalette}
        showOverlay={showOverlay}
        setShowOverlay={setShowOverlay}
        showAlerts={showAlerts}
        setShowAlerts={setShowAlerts}
        showThunderstorms={showThunderstorms}
        setShowThunderstorms={setShowThunderstorms}
        opacity={opacity}
        setOpacity={setOpacity}
        mode={mode}
        setMode={setMode}
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        speed={speed}
        setSpeed={setSpeed}
        currentFrame={currentFrame}
        setCurrentFrame={setCurrentFrame}
        setDisplayFrame={setDisplayFrame}
        lastFrameIndex={frames.length - 1}
        animationLabel={animationLabel}
        isMobile={isMobile}
        showControls={showControls}
        setShowControls={setShowControls}
      />

      {(() => {
        const statusColor =
          mode === "LIVE" ? "#34d399" : mode === "HISTORY" ? "#fbbf24" : "#38bdf8";
        return (
          <div
            style={{
              position: "absolute",
              top: "calc(env(safe-area-inset-top, 0px) + 16px)",
              left: isMobile ? "74px" : "50%",
              right: isMobile ? "16px" : undefined,
              transform: isMobile ? "none" : "translateX(-50%)",
              zIndex: 3000,
              display: "flex",
              alignItems: "center",
              gap: isMobile ? "8px" : "12px",
              padding: isMobile ? "8px 14px" : "10px 22px",
              borderRadius: "18px",
              background: "rgba(0,0,0,0.62)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              color: "white",
              fontWeight: 700,
              fontSize: isMobile ? "11px" : "22px",
              letterSpacing: "0.5px",
              boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
              border: "1px solid rgba(255,255,255,0.12)",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              maxWidth: "calc(100vw - 36px)",
            }}
          >
            <span
              style={{
                width: isMobile ? "8px" : "10px",
                height: isMobile ? "8px" : "10px",
                borderRadius: "50%",
                background: statusColor,
                flexShrink: 0,
                animation: mode === "LIVE" ? "livePulse 1.8s infinite" : "none",
              }}
            />
            <span style={{ color: statusColor, fontSize: isMobile ? "11px" : "14px", letterSpacing: "1px" }}>
              {mode}
            </span>
            <span style={{ opacity: 0.35 }}>|</span>
            <span style={{ fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" }}>
              {animationLabel}
            </span>
            <span
              style={{
                fontSize: isMobile ? "10px" : "13px",
                fontWeight: 700,
                padding: isMobile ? "2px 7px" : "3px 10px",
                borderRadius: "999px",
                background: "rgba(56,189,248,0.18)",
                border: "1px solid rgba(56,189,248,0.35)",
                color: "#7dd3fc",
                letterSpacing: "0.5px",
              }}
            >
              {channel.replace("IMG_", "")}
            </span>
            {showOverlay && frameLoading && (
              <span
                style={{
                  width: isMobile ? "12px" : "16px",
                  height: isMobile ? "12px" : "16px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.25)",
                  borderTopColor: "#38bdf8",
                  animation: "spin 0.7s linear infinite",
                  flexShrink: 0,
                }}
              />
            )}
          </div>
        );
      })()}

      {notices.length > 0 && (
        <div role="status" style={{ position: "absolute", bottom: isMobile ? 68 : 30, left: "50%", transform: "translateX(-50%)", zIndex: 1500, maxWidth: "min(520px, 90vw)", width: "max-content", padding: "8px 12px", borderRadius: 10, background: "rgba(15,23,42,0.92)", color: "#fde68a", fontSize: 12, pointerEvents: "none" }}>
          {notices.map((notice) => <div key={notice}>{notice}</div>)}
        </div>
      )}

      <MapContainer
        key="weather-map"
        bounds={[[5, 65], [38, 98]]}
        boundsOptions={{ padding: [20, 20] }}
        maxBounds={[[-5, 55], [42, 105]]}
        minZoom={4}
        maxZoom={18}
        zoomAnimationThreshold={8}
        preferCanvas={true}
        wheelPxPerZoomLevel={120}
        style={{ height: "100%", width: "100%", backfaceVisibility: "hidden" }}
      >
        <MapEvents onView={handleView} />
        <MapClickHandler onClick={handleMapClick} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          keepBuffer={2}
          updateWhenIdle={true}
          eventHandlers={baseTileEvents}
        />

        {statesGeoJson && (
          <>
            <GeoJSON
              key="states-casing"
              data={statesGeoJson as object}
              interactive={false}
              style={statesCasingStyle}
            />
            <GeoJSON
              key="states-line"
              data={statesGeoJson as object}
              interactive={false}
              style={statesLineStyle}
            />
          </>
        )}

        {zoom >= 8 && !isPlaying && districtGeoJson && (
          <>
            <GeoJSON
              key="districts-casing"
              data={districtGeoJson as object}
              interactive={false}
              style={districtCasingStyle}
            />
            <GeoJSON
              key="districts-line"
              data={districtGeoJson as object}
              interactive={false}
              style={districtLineStyle}
            />
          </>
        )}

        {showOverlay && <WMSTileLayer
          key={`${channel}-${palette}`}
          url="/api/mosdac-wms"
          params={wmsParams}
          className="smooth-wms"
          layers={channel}
          updateInterval={300}
          styles={`boxfill/${palette}`}
          format="image/png"
          transparent={true}
          opacity={opacity}
          version="1.3.0"
          keepBuffer={2}
          updateWhenIdle={true}
          updateWhenZooming={false}
          tileSize={256}
          zIndex={100}
          attribution="MOSDAC"
          eventHandlers={tileEvents}
          errorTileUrl={EMPTY_TILE}
        />}

        <AlertLayer
          alerts={visibleAlerts}
          storms={visibleStorms}
          zoom={zoom}
          showAlerts={showAlerts}
          showThunderstorms={showThunderstorms}
        />

        {cloudPopup && (
          <WeatherMapCloudPopup cloudPopup={cloudPopup} setCloudPopup={setCloudPopup} />
        )}

      </MapContainer>

      <WeatherMapLegend
        currentLegend={currentLegend}
        currentGradient={currentGradient}
        palette={palette}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showAlertLegend={showAlertLegend}
        setShowAlertLegend={setShowAlertLegend}
        isMobile={isMobile}
      />
    </div>
  );
}
