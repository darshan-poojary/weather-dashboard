"use client";

import dynamic from "next/dynamic";

import type * as LeafletType
  from "leaflet";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

let L:
  typeof LeafletType;

if (
  typeof window !==
  "undefined"
) {
  L = require(
    "leaflet"
  );
}

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

const Circle = dynamic(
  async () => {
    const mod =
      await import(
        "react-leaflet"
      );

    return mod.Circle;
  },
  { ssr: false }
);

const CircleMarker = dynamic(
  async () => {
    const mod =
      await import(
        "react-leaflet"
      );

    return mod.CircleMarker;
  },
  { ssr: false }
);

const Marker = dynamic(
  async () => {
    const mod =
      await import(
        "react-leaflet"
      );

    return mod.Marker;
  },
  { ssr: false }
);

const Popup = dynamic(
  async () => {
    const mod =
      await import(
        "react-leaflet"
      );

    return mod.Popup;
  },
  { ssr: false }
);

const MapEvents = dynamic(
  async () => {
    const mod =
      await import(
        "react-leaflet"
      );

    return function Events({
      setZoom,
    }: any) {
      const map =
        mod.useMapEvents({
          zoomend() {
            setZoom(
              map.getZoom()
            );
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
];

const PALETTES = [
  "greyscale",
  "rainbow",
  "redblue",
  "ferret",
];

export default function WeatherMap() {

  const blueRainIcon =
  typeof window !==
  "undefined"
    ? new L.DivIcon({
        className:
          "weather-alert-icon",

        html: `
<div style="
font-size:13px;
filter:drop-shadow(0 0 2px black);
">
🌧️
</div>
        `,

        iconSize: [14, 14],

        iconAnchor: [7, 7],
      })
    : undefined;

const blackRainIcon =
  typeof window !==
  "undefined"
    ? new L.DivIcon({
        className:
          "weather-alert-icon",

        html: `
<div style="
font-size:13px;
filter:
grayscale(100%)
brightness(0.2)
drop-shadow(0 0 2px black);
">
🌧️
</div>
        `,

        iconSize: [14, 14],

        iconAnchor: [7, 7],
      })
    : undefined;

const cloudburstIcon =
  typeof window !==
  "undefined"
    ? new L.DivIcon({
        className:
          "weather-alert-icon",

        html: `
          <div style="
font-size:14px;
filter:drop-shadow(0 0 3px black);
">
⛈️
</div>
        `,

        iconSize: [18, 18],

        iconAnchor: [9, 9],
      })
    : undefined;

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

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [speed, setSpeed] =
    useState(2500);

  const [mode, setMode] =
    useState("LIVE");

  const [showOverlay, setShowOverlay] =
    useState(true);

  const [loading, setLoading] =
    useState(false);

  const [zoom, setZoom] =
  useState(5);

const [statesGeoJson, setStatesGeoJson] =
  useState(null);

const [districtGeoJson, setDistrictGeoJson] =
  useState(null);

  // NEW FRAME SYSTEM

  const [frames, setFrames] =
    useState<string[]>([]);

  const [currentFrame, setCurrentFrame] =
    useState(0);

    const [
  mosdacAlerts,
  setMosdacAlerts,
] = useState<any[]>([]);


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

  // GENERATE LIVE FRAMES

  useEffect(() => {
    const now =
      new Date();

    const generatedFrames =
      [];

    const current =
      new Date(now);

      current.setUTCMinutes(
  Math.floor(
    current.getUTCMinutes() /
      15
  ) * 15
);

current.setUTCSeconds(0);

current.setUTCMilliseconds(
  0
);

// IMPORTANT:
// latest valid slot

current.setUTCMinutes(
  current.getUTCMinutes() -
    45
);

    current.setUTCMinutes(
      Math.floor(
        current.getUTCMinutes() /
          15
      ) * 15
    );

    current.setUTCSeconds(0);

    current.setUTCMilliseconds(0);

    // LAST 6 HOURS

    for (
      let i = 24;
      i >= 0;
      i--
    ) {
      const frame =
        new Date(current);

      frame.setTime(
  current.getTime() -
    i *
      15 *
      60 *
      1000
);

      generatedFrames.push(
        frame.toISOString()
      );
    }

    setFrames(
      generatedFrames
    );

    setCurrentFrame(
      generatedFrames.length -
        1
    );

  }, []);

  // PLAYBACK LOOP

  useEffect(() => {
  if (
    !isPlaying ||
    frames.length === 0
  )
    return;

  const interval =
    setInterval(() => {
      setCurrentFrame(
        (prev) => {
          if (
            prev >=
            frames.length - 1
          ) {
            return 0;
          }

          return Math.min(
            prev + 1,
            frames.length - 1
          );
        }
      );
    }, speed);

  return () =>
    clearInterval(interval);

}, [
  isPlaying,
  speed,
  frames,
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
      45
  );

  return now.toISOString();
}

let utcDatetime =
  frames.length > 0
    ? frames[currentFrame]
    : getLatestMosdacTime();

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
      {/* CONTROL PANEL */}

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
          width:
            "min(90vw, 320px)",
          fontFamily:
            "sans-serif",
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

        {/* MODE BUTTONS */}

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
                padding: "8px",
                border: "none",
                borderRadius:
                  "6px",
                cursor: "pointer",
                background:
                  mode === item
                    ? "#2563eb"
                    : "#e5e7eb",
                color:
                  mode === item
                    ? "white"
                    : "black",
                fontWeight:
                  "bold",
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
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom:
              "10px",
          }}
        >
          {CHANNELS.map(
            (item) => (
              <option
                key={
                  item.layer
                }
                value={
                  item.layer
                }
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
              e.target.value
            )
          }
          style={{
            width: "100%",
            marginBottom:
              "10px",
          }}
        >
          {PALETTES.map(
            (item) => (
              <option
                key={item}
                value={item}
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
              onClick={() =>
                setIsPlaying(
                  !isPlaying
                )
              }
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
              min="1500"
              max="3500"
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
              onChange={(
                e
              ) =>
                setCurrentFrame(
                  Number(
                    e.target
                      .value
                  )
                )
              }
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

      {/* MAP */}

      {/* LIVE TIMESTAMP OVERLAY */}

<div
  style={{
    position: "absolute",
    top: 14,
    left: "50%",
    transform:
      "translateX(-50%)",
    zIndex: 3000,

    background:
      "rgba(0,0,0,0.65)",

    color: "white",

    padding:
      "8px 16px",

    borderRadius: "8px",

    fontWeight: "bold",

    fontSize: "18px",

    backdropFilter:
      "blur(4px)",

    boxShadow:
      "0 2px 10px rgba(0,0,0,0.35)",

    pointerEvents: "none",
  }}
>
  {animationLabel} | {channel}
</div>

      <MapContainer
        center={[
          22.5937,
          78.9629,
        ]}
        zoom={5}
        style={{
          height: "100%",
          width: "100%",
        }}
      >
        <MapEvents setZoom={setZoom} />

        {/* BASE MAP */}

        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

       {/* STATE BOUNDARIES */}

{statesGeoJson && (
  <GeoJSON
    data={
      statesGeoJson as any
    }

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

{zoom >= 7 &&
  districtGeoJson && (
    <GeoJSON
      data={
        districtGeoJson as any
      }

      style={() => ({
        color:
          "rgba(220,255,230,0.45)",

        weight: zoom >= 9 ? 1 : 0.6,

        opacity: 0.45,

        fillOpacity: 0,

        interactive: false,
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

  keepBuffer={20}

  updateWhenIdle={true}

  updateWhenZooming={false}

  updateInterval={500}

  tileSize={256}

  zIndex={100}

  attribution="MOSDAC"

  crossOrigin={true}

  className="smooth-wms"

  eventHandlers={{
    loading: () => {
      // keep previous tiles
    },

    load: () => {
      setLoading(false);
    },
  }}
/>

{/* LIVE MOSDAC ALERTS */}

  {mosdacAlerts
    .filter(
  (
    feature,
    index,
    self
  ) => {
    const coords =
      feature.geometry
        ?.coordinates;

    if (!coords)
      return false;

    const [lng, lat] =
      coords;

    return !self.some(
      (
        other,
        otherIndex
      ) => {
        if (
          index ===
          otherIndex
        )
          return false;

        const otherCoords =
          other.geometry
            ?.coordinates;

        if (
          !otherCoords
        )
          return false;

        const [
          otherLng,
          otherLat,
        ] = otherCoords;

        // DISTANCE CHECK

        const distance =
          Math.sqrt(
            Math.pow(
              lat -
                otherLat,
              2
            ) +
              Math.pow(
                lng -
                  otherLng,
                2
              )
          );

        // REMOVE NEARBY DUPLICATES

        return (
  distance <
    (zoom >= 8
      ? 0.12
      : zoom >= 6
      ? 0.2
      : zoom >= 3
      ? 0.3
      : 0.6) &&
  otherIndex <
    index
);
      }
    );
  }
)
    
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
          feature.properties ||
          feature ||
          {};
          console.log(props);
        const alertName =
  props.name || "";

const alertValue =
  props.value || "";

const alertDate =
  props.event_date || "";

const alertTime =
  props.event_time || "";

        const forecast =
          props.forecast ||
          "";

        const radiusKm =
          parseFloat(
            props.rad_inf ||
              "80"
          );

        const isCloudburst =
          forecast
            .toLowerCase()
            .includes(
              "cloud"
            );

            const isSevere =
  radiusKm > 120;

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
    : isSevere
    ? blackRainIcon
    : blueRainIcon
}
            >
              <Popup
  closeButton={true}
  autoPan={false}
>
  <div
    style={{
      minWidth: "170px",
      background:
        "rgba(40,40,40,0.82)",
      color: "white",
      padding: "8px",
      borderRadius: "10px",
      fontFamily:
        "sans-serif",
      lineHeight: "1.45",
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
      {alertName}
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
      <b>Date & Time :</b>
      <br />
      {alertDate}
      {" "}
      {alertTime}
    </div>

    <div
      style={{
        marginTop: "8px",
      }}
    >
      <b>Value :</b>
      <br />
      {alertValue} mm
    </div>
  </div>
</Popup>
            </Marker>

            {/* SHOW RADIUS ONLY ON HIGH ZOOM */}

            
              <Circle
  eventHandlers={{
    click: () => {},
  }}
  center={[
    lat,
    lng,
  ]}
  radius={
    zoom < 3
      ? Math.max(
          radiusKm * 500,
          25000
        )
      : Math.max(
          radiusKm * 1000,
          zoom >= 7
            ? 25000
            : zoom >= 5
            ? 40000
            : 60000
        )
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
    closeButton={true}
    autoPan={false}
  >
    <div
      style={{
        minWidth: "170px",
        background:
          "rgba(40,40,40,0.82)",
        color: "white",
        padding: "8px",
        borderRadius: "10px",
        fontFamily:
          "sans-serif",
        lineHeight: "1.45",
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
        {alertName}
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
        <b>Date & Time :</b>
        <br />
        {alertDate}
        {" "}
        {alertTime}
      </div>

      <div
        style={{
          marginTop: "8px",
        }}
      >
        <b>Value :</b>
        <br />
        {alertValue} mm
      </div>
    </div>
  </Popup>
</Circle>
            
          </Fragment>
        );
      }
    )}
        {/* LABELS */}

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
          opacity={1}
        />
      </MapContainer>
    </div>
  );
}