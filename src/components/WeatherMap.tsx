"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CloudPoint,
  CloudPopup,
  GeoJsonObject,
  MosdacAlertFeature,
  MosdacAlertFeatureProperties,
  ThunderstormCell,
  Palette,
  WeatherChannel,
  WeatherMode,
} from "./weatherMapTypes";
import {
  GRID_DEG,
  LEGENDS,
  PALETTE_GRADIENTS,
} from "./weatherMapConfig";
import { createDivIcon } from "./weatherMapHelpers";
import WeatherMapControls from "./WeatherMapControls";
import WeatherMapLegend from "./WeatherMapLegend";
import WeatherMapAlertLayer from "./WeatherMapAlertLayer";
import WeatherMapCloudPopup from "./WeatherMapCloudPopup";

const loadLeafletComponent = <T extends ComponentType<Record<string, unknown>>>(name: string) =>
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

    return function Events({ setZoom }: { setZoom: (zoom: number) => void }) {
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
  const [leaflet, setLeaflet] = useState<typeof import("leaflet") | null>(null);

  const { blueRainIcon, cloudburstIcon, nowcastRainIcon } = useMemo(() => {
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

  const [statesGeoJson, setStatesGeoJson] = useState<GeoJsonObject | null>(null);
  const [districtGeoJson, setDistrictGeoJson] = useState<GeoJsonObject | null>(null);
  const [thunderstormCells, setThunderstormCells] = useState<ThunderstormCell[]>([]);
  const [cloudPoints, setCloudPoints] = useState<CloudPoint[]>([]);
  const [cloudPopup, setCloudPopup] = useState<CloudPopup | null>(null);
  const [mosdacAlerts, setMosdacAlerts] = useState<MosdacAlertFeature[]>([]);
  const loadedFrames = useRef(new Set<string>());

  const frames = useMemo(() => {
    const now = new Date();
    const current = new Date(now);
    current.setUTCMinutes(Math.floor(current.getUTCMinutes() / 15) * 15);
    current.setUTCSeconds(0);
    current.setUTCMilliseconds(0);
    current.setUTCMinutes(current.getUTCMinutes() - 60);
    current.setUTCMinutes(Math.floor(current.getUTCMinutes() / 15) * 15);
    current.setUTCSeconds(0);
    current.setUTCMilliseconds(0);

    return Array.from({ length: 25 }, (_, index) => {
      const frame = new Date(current);
      frame.setTime(current.getTime() - (24 - index) * 15 * 60 * 1000);
      return frame.toISOString();
    });
  }, []);

  const [currentFrame, setCurrentFrame] = useState(frames.length - 1);
  const [displayFrame, setDisplayFrame] = useState(frames.length - 1);
  const [frameLoading, setFrameLoading] = useState(false);

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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    fetch("/geo/india-states.geojson")
      .then((res) => res.json())
      .then((data) => setStatesGeoJson(data));

    fetch("/geo/india-districts.geojson")
      .then((res) => res.json())
      .then((data) => setDistrictGeoJson(data));
  }, []);

  useEffect(() => {
    if (!isPlaying || frames.length === 0 || frameLoading) return;

    const interval = setInterval(() => {
      const nextFrame = currentFrame >= frames.length - 1 ? 0 : currentFrame + 1;
      setFrameLoading(true);
      const img = new window.Image();

      img.onload = () => {
        setCurrentFrame(nextFrame);
        setDisplayFrame(nextFrame);
        setFrameLoading(false);
      };

      img.onerror = () => {
        setFrameLoading(false);
      };

      img.src = `/api/mosdac-wms?datetime=${frames[nextFrame]}&layers=${channel}&styles=boxfill/${palette}`;
    }, speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed, currentFrame, frames, frameLoading, channel, palette]);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch("/api/mosdac-alerts");
        const text = await response.text();
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        const cleanJson = text.slice(jsonStart, jsonEnd + 1);
        const parsed = JSON.parse(cleanJson);
        if (parsed.features) {
          setMosdacAlerts(parsed.features);
        }
      } catch (error) {
        console.error("MOSDAC Alerts Error:", error);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 300000);
    return () => clearInterval(interval);
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
      img.src = `/api/mosdac-wms?datetime=${frame}&layers=${channel}&styles=boxfill/${palette}`;
    },
    [channel, palette]
  );

  useEffect(() => {
    if (frames.length === 0) return;

    for (let i = 0; i < 4; i++) {
      const index = currentFrame + i;
      if (index < frames.length) {
        preloadFrame(frames[index]);
      }
    }
  }, [currentFrame, frames, preloadFrame]);

  useEffect(() => {
    const loadStorms = async () => {
      try {
        const response = await fetch("/thunderstorm-cells.json?t=" + Date.now());
        const data = await response.json();
        setThunderstormCells(data);
      } catch (error) {
        console.error(error);
      }
    };

    const loadCloudData = async () => {
      try {
        const res = await fetch("/cloud-grid.json?" + Date.now());
        const data = await res.json();
        setCloudPoints(data);
      } catch (err) {
        console.error("Cloud data error", err);
      }
    };

    loadStorms();
    loadCloudData();
    const stormInterval = setInterval(loadStorms, 1800000);
    const cloudInterval = setInterval(loadCloudData, 1800000);
    return () => {
      clearInterval(stormInterval);
      clearInterval(cloudInterval);
    };
  }, []);

  function getHistoryUtcDatetime() {
    if (!date || !time) return null;
    const istDate = new Date(`${date}T${time}:00`);
    return new Date(istDate.getTime() - 5.5 * 60 * 60 * 1000).toISOString();
  }

  function getLatestMosdacTime() {
    const now = new Date();
    now.setUTCMinutes(Math.floor(now.getUTCMinutes() / 15) * 15);
    now.setUTCSeconds(0);
    now.setUTCMilliseconds(0);
    now.setUTCMinutes(now.getUTCMinutes() - 60);
    return now.toISOString();
  }

  let utcDatetime = getLatestMosdacTime();
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

  const filteredAlerts = useMemo(() => {
    return mosdacAlerts.filter((feature, index, self) => {
      const coords = feature.geometry?.coordinates;
      if (!coords) return false;

      const props = (feature.properties || feature) as MosdacAlertFeatureProperties;
      const forecast = (props.forecast || "").toString().toLowerCase();
      if (forecast.includes("cloud")) return true;

      const [lng, lat] = coords;
      return !self.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        const otherCoords = other.geometry?.coordinates;
        if (!otherCoords) return false;

        const [otherLng, otherLat] = otherCoords;
        const distance = Math.sqrt(Math.pow(lat - otherLat, 2) + Math.pow(lng - otherLng, 2));
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

  const currentLegend = LEGENDS[channel];
  const currentGradient = PALETTE_GRADIENTS[palette];

  const handleMapClick = useCallback(
    (clickLat: number, clickLon: number) => {
      if (cloudPoints.length === 0) return;
      const gridLat = Math.round(clickLat / GRID_DEG) * GRID_DEG;
      const gridLon = Math.round(clickLon / GRID_DEG) * GRID_DEG;

      const cell = cloudPoints.reduce(
        (best, p) => {
          const dist = Math.abs(p.gridLat - gridLat) + Math.abs(p.gridLon - gridLon);
          if (!best || dist < best.dist) {
            return { dist, point: p };
          }
          return best;
        },
        null as { dist: number; point: CloudPoint } | null
      )?.point;

      if (!cell) return;
      setCloudPopup({ lat: clickLat, lon: clickLon, cloudCover: cell.cloudCover, temp: cell.temp });
    },
    [cloudPoints]
  );

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
              top: 18,
              left: "50%",
              transform: "translateX(-50%)",
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
              fontSize: isMobile ? "13px" : "22px",
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
            {frameLoading && (
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

      <MapContainer
        key="weather-map"
        bounds={[[5, 65], [38, 98]]}
        boundsOptions={{ padding: [20, 20] }}
        maxBounds={[[-5, 55], [42, 105]]}
        minZoom={4}
        zoomAnimationThreshold={8}
        preferCanvas={true}
        wheelPxPerZoomLevel={120}
        style={{ height: "100%", width: "100%", backfaceVisibility: "hidden" }}
      >
        <MapEvents setZoom={setZoom} />
        <MapClickHandler onClick={handleMapClick} />

        <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {statesGeoJson && (
          <GeoJSON
            data={statesGeoJson as object}
            interactive={false}
            style={{
              color: "rgba(80,255,120,0.75)",
              weight: zoom >= 7 ? 2.2 : 1.8,
              opacity: zoom >= 7 ? 0.85 : 0.7,
              fillOpacity: 0,
            }}
          />
        )}

        {zoom >= 8 && !isPlaying && districtGeoJson && (
          <GeoJSON
            data={districtGeoJson as object}
            interactive={false}
            style={() => ({
              color: "rgba(220,255,230,0.45)",
              weight: zoom >= 9 ? 1 : 0.6,
              opacity: 0.45,
              fillOpacity: 0,
            })}
          />
        )}

        <WMSTileLayer
          key={`${utcDatetime}-${channel}-${palette}`}
          url={`/api/mosdac-wms?datetime=${utcDatetime}`}
          className="smooth-wms"
          layers={channel}
          updateInterval={300}
          styles={`boxfill/${palette}`}
          format="image/png"
          transparent={true}
          opacity={showOverlay ? opacity : 0}
          version="1.3.0"
          keepBuffer={4}
          updateWhenIdle={false}
          updateWhenZooming={false}
          tileSize={256}
          zIndex={100}
          attribution="MOSDAC"
        />

        <WeatherMapAlertLayer
          filteredAlerts={filteredAlerts}
          zoom={zoom}
          showAlerts={showAlerts}
          showThunderstorms={showThunderstorms}
          mosdacAlertIcons={{ blueRainIcon, cloudburstIcon, nowcastRainIcon }}
          thunderstormCells={thunderstormCells}
          leaflet={leaflet}
          Marker={Marker}
          Popup={Popup}
          Circle={Circle}
        />

        {cloudPopup && (
          <WeatherMapCloudPopup
            cloudPopup={cloudPopup}
            setCloudPopup={setCloudPopup}
            Popup={Popup}
          />
        )}

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
          opacity={1}
        />
      </MapContainer>

      <WeatherMapLegend
        currentLegend={currentLegend}
        currentGradient={currentGradient}
        palette={palette}
        showLegend={showLegend}
        setShowLegend={setShowLegend}
        showAlertLegend={showAlertLegend}
        setShowAlertLegend={setShowAlertLegend}
      />
    </div>
  );
}
