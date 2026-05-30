"use client";

import dynamic from "next/dynamic";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

const MapContainer = dynamic(
  async () => {
    const mod = await import(
      "react-leaflet"
    );

    return mod.MapContainer;
  },
  { ssr: false }
);

const TileLayer = dynamic(
  async () => {
    const mod = await import(
      "react-leaflet"
    );

    return mod.TileLayer;
  },
  { ssr: false }
);

const WMSTileLayer = dynamic(
  async () => {
    const mod = await import(
      "react-leaflet"
    );

    return mod.WMSTileLayer;
  },
  { ssr: false }
);

const GeoJSON = dynamic(
  async () => {
    const mod = await import(
      "react-leaflet"
    );

    return mod.GeoJSON;
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
];

const PALETTES = [
  "greyscale",
  "rainbow",
  "redblue",
  "ferret",
];

export default function WeatherMap() {
  const [opacity, setOpacity] =
    useState(0.7);

  const [channel, setChannel] =
    useState("IMG_TIR1");

  const [palette, setPalette] =
    useState("greyscale");

  const [date, setDate] =
    useState("");

  const [time, setTime] =
    useState("");

  const [refreshKey, setRefreshKey] =
    useState(Date.now());

  // Animation

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [speed, setSpeed] =
    useState(2000);

  const [frameOffset, setFrameOffset] =
    useState(0);

  const [mode, setMode] =
  useState("LIVE");

  const [showOverlay, setShowOverlay] =
  useState(true); 

const [loading, setLoading] =
  useState(false);

  const [indiaGeoJson, setIndiaGeoJson] =
  useState(null);

useEffect(() => {
  fetch("/india.geojson")
    .then((res) => res.json())
    .then((data) => {
      setIndiaGeoJson(data);
    });
}, []);

  // Auto refresh every 5 mins

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(Date.now());
    }, 5 * 60 * 1000);

    return () =>
      clearInterval(interval);
  }, []);

  // Animation playback

  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setFrameOffset((prev) => {
        if (prev >= 600) {
          return 0;
        }

        return prev + 120;
      });
    }, speed);


    return () =>
      clearInterval(interval);
  }, [isPlaying, speed]);

  // IST → UTC

  function getUtcDatetime() {
    let baseDate;

    // History mode

    if (date && time) {
      const istDate = new Date(
        `${date}T${time}:00`
      );

      baseDate = new Date(
        istDate.getTime() -
          5.5 *
            60 *
            60 *
            1000
      );
    } else {
      // Fixed working base time

      baseDate = new Date(
        "2026-05-29T06:15:00Z"
      );
    }

    // Animation offset

    baseDate.setUTCMinutes(
      baseDate.getUTCMinutes() -
        frameOffset
    );

    return baseDate.toISOString();
  }

  const utcDatetime =
    getUtcDatetime();

const layerKey = useMemo(() => {
  return `${channel}-${palette}-${utcDatetime}`;
}, [
  channel,
  palette,
  utcDatetime,
]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
      }}
    >
      {/* Control Panel */}

      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 2000,
          background: "white",
          padding: "14px",
          borderRadius: "10px",
          boxShadow:
            "0 4px 15px rgba(0,0,0,0.2)",
          width: "min(90vw, 320px)",
          fontFamily: "sans-serif",
          maxHeight: "90vh",
overflowY: "auto",
        }}
      >
        <h2
          style={{
            marginTop: 0,
          }}
        >
          INSAT-3DR
        </h2>
        <div
  style={{
    display: "flex",
    gap: "6px",
    marginBottom: "14px",
  }}
>
  {[
    "LIVE",
    "HISTORY",
    "ANIMATION",
  ].map((item) => (
    <button
      key={item}
      onClick={() => {
  setMode(item);

  // Reset history when LIVE

  if (item === "LIVE") {
    setDate("");
    setTime("");
    setFrameOffset(0);
    setIsPlaying(false);
  }

  // Reset animation

  if (item === "ANIMATION") {
    setDate("");
    setTime("");
  }
}}
      style={{
        flex: 1,
        padding: "8px",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        background:
          mode === item
            ? "#2563eb"
            : "#e5e7eb",
        color:
          mode === item
            ? "white"
            : "black",
        fontWeight: "bold",
      }}
    >
      {item}
    </button>
  ))}
</div>
        {/* Channel */}

        <label>
          <b>Channel</b>
        </label>

        <select
          value={channel}
          onChange={(e) =>
            setChannel(
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom: "10px",
          }}
        >
          {CHANNELS.map((item) => (
            <option
              key={item.layer}
              value={item.layer}
            >
              {item.label}
            </option>
          ))}
        </select>

        {/* Palette */}

        <label>
          <b>Palette</b>
        </label>

        <select
          value={palette}
          onChange={(e) =>
            setPalette(
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom: "10px",
          }}
        >
          {PALETTES.map((item) => (
            <option
              key={item}
              value={item}
            >
              {item}
            </option>
          ))}
        </select>
        <label
  style={{
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "10px",
  }}
>
  <input
    type="checkbox"
    checked={showOverlay}
    onChange={() =>
      setShowOverlay(
        !showOverlay
      )
    }
  />

  <b>Show Overlay</b>
</label>

        {/* Opacity */}

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
          }}
        />
        {mode === "ANIMATION" && (
  <>

        {/* Animation */}

        <hr />

        <h3>
          Animation
        </h3>

        <button
          onClick={() =>
            setIsPlaying(
              !isPlaying
            )
          }
          style={{
            padding:
              "8px 14px",
            cursor: "pointer",
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
          min="300"
          max="3000"
          step="100"
          value={speed}
          onChange={(e) =>
            setSpeed(
              Number(
                e.target.value
              )
            )
          }
          style={{
            width: "100%",
          }}
        />

        <p>
          {speed} ms
        </p>

        <p>
          <b>
            Frame Offset:
          </b>{" "}
          {frameOffset} mins
        </p>
          </>
)}
        <hr />
       {mode === "HISTORY" && (
  <>
        {/* History Mode */}

        <h3>
          History Mode
        </h3>

        <label>
          <b>Date (IST)</b>
        </label>

        <input
          type="date"
          value={date}
          onChange={(e) =>
            setDate(
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom: "10px",
          }}
        />

        <label>
          <b>Time (IST)</b>
        </label>

        <input
          type="time"
          value={time}
          onChange={(e) =>
            setTime(
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom: "10px",
          }}
        />

        <hr />

        <p>
          <b>UTC:</b>
        </p>

        <p>
          {utcDatetime ||
            "Live Mode"}
        </p>
          </>
)}
      </div>

      {/* MAP */}
      
      {loading && (
  <div
    style={{
      position: "absolute",
      top: "50%",
      left: "50%",
      transform:
        "translate(-50%, -50%)",
      zIndex: 5000,
      background: "white",
      padding: "12px 18px",
      borderRadius: "10px",
      boxShadow:
        "0 4px 10px rgba(0,0,0,0.2)",
    }}
  >
    Loading Satellite...
  </div>
)}

      <MapContainer
        center={[22.5937, 78.9629]}
        zoom={5}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        {/* Base Map */}

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {indiaGeoJson && (
  <GeoJSON
    data={indiaGeoJson as any}
    style={{
      color: "cyan",
      weight: 2,
      fillOpacity: 0,
    }}
  />
)}

        {/* Satellite Layer */}

        <WMSTileLayer
          key={layerKey}
          url={
            "/api/mosdac-wms?" +
            `_t=${Date.now()}` +
            `&datetime=${utcDatetime}`
          }
          layers={channel}
          styles={`boxfill/${palette}`}
          format="image/png"
          transparent={true}
          opacity={
  showOverlay
    ? opacity
    : 0
}
          version="1.3.0"
          updateWhenIdle={false}
          keepBuffer={1}

          eventHandlers={{
  loading: () =>
    setLoading(true),

  load: () =>
    setLoading(false),
}}

        />

        {/* Labels Layer */}

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
          opacity={1}
        />
      </MapContainer>
    </div>
  );
}