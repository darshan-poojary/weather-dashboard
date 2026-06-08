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

const Leaflet =
  typeof window !==
  "undefined"
    ? require("leaflet")
    : null;

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

const blueRainIcon =
  typeof window !==
  "undefined"
    ? new Leaflet.DivIcon({
        className:
          "weather-alert-icon",

        html: `
<div style="
font-size:20px;
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
    ? new Leaflet.DivIcon({
        className:
          "weather-alert-icon",

        html: `
<div style="
font-size:20px;
filter:
grayscale(50%)
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
    ? new Leaflet.DivIcon({
        className:
          "weather-alert-icon",

        html: `
          <div style="
font-size:20px;
filter:drop-shadow(0 0 3px black);
">
⛈️
</div>
        `,

        iconSize: [18, 18],

        iconAnchor: [9, 9],
      })
    : undefined;

const nowcastRainIcon =
  typeof window !==
  "undefined"
    ? new Leaflet.DivIcon({
        className:
          "weather-alert-icon",

        html: `
<div style="
font-size:20px;
filter:drop-shadow(0 0 2px black);
">
☔
</div>
        `,

        iconSize: [14,14],

        iconAnchor: [7,7],
      })
    : undefined;    

export default function WeatherMap() {

  const [tileLoading, setTileLoading] =
  useState(false);
  
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

  const [zoom, setZoom] =
  useState(5);
  const [isMobile, setIsMobile] =
  useState(false);
  const [
  showControls,
  setShowControls,
] = useState(true);

const [
  showAlerts,
  setShowAlerts,
] = useState(true);

const [statesGeoJson, setStatesGeoJson] =
  useState(null);

const [districtGeoJson, setDistrictGeoJson] =
  useState(null);

const [
  thunderstormCells,
  setThunderstormCells
] = useState<any[]>([]);  
 

  // NEW FRAME SYSTEM

  const [frames, setFrames] =
    useState<string[]>([]);

  const [currentFrame, setCurrentFrame] =
    useState(0);
  const [displayFrame, setDisplayFrame] =
  useState(0);

  const [frameLoading, setFrameLoading] =
  useState(false);
  
  const [stormAlert, setStormAlert] =
  useState<any>(null);

    const [
  mosdacAlerts,
  setMosdacAlerts,
] = useState<any[]>([]);

 const loadedFrames =
  useMemo(
    () => new Set<string>(),
    []
  );

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
    60
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

    const latestFrame =
  generatedFrames.length - 1;

setCurrentFrame(
  latestFrame
);

setDisplayFrame(
  latestFrame
);

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
  frames.length,
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

const preloadFrame = (
  frame: string
) => {

  if (
    loadedFrames.has(frame)
  ) {
    return;
  }

  const img =
    new Image();

  img.onload = () => {
    loadedFrames.add(frame);
  };

  img.src =
    `/api/mosdac-wms?datetime=${frame}&layers=${channel}&styles=boxfill/${palette}`;
};
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
  channel,
  palette,
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
if (data.length > 0) {

  const strongest =
    data.reduce(
      (a: any, b: any) =>
        a.count > b.count
          ? a
          : b
    );

  setStormAlert(
    strongest
  );
  const geo =
  await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${strongest.lat}&lon=${strongest.lon}`
  );

const location =
  await geo.json();

setStormAlert({
  ...strongest,
  location,
});
}
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

  loadStorms();

  const interval =
    setInterval(
      loadStorms,
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
const filteredAlerts =
  useMemo(() => {

    return mosdacAlerts
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

              return (
                distance <
(
  zoom >= 9
    ? 0.15
    : zoom >= 8
    ? 0.4
    : zoom >= 7
    ? 0.8
    : zoom >= 6
    ? 1.5
    : zoom >= 5
    ? 3
    : 5
) &&
                otherIndex <
                  index
              );
            }
          );
        }
      );

  }, [
    mosdacAlerts,
    zoom
  ]);
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
              e.target.value
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
              e.target.value
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
    marginTop: "12px",
    display: "flex",
    alignItems:
      "center",
    gap: "10px",
  }}
>
  <input
    type="checkbox"
    checked={
      showAlerts
    }
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
              min="2500"
              max="4000"
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
        districtGeoJson as any
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
          feature.properties ||
          feature ||
          {};
          
        const alertName =
  props.name || "";

const alertValue =
  props.value ||
  props.rad_inf ||
  "";

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
    ? radiusKm * 1200
    : zoom >= 5
    ? radiusKm * 1600
    : zoom >= 3
    ? radiusKm * 2200
    : radiusKm * 3000
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

{visibleThunderstorms.map(
  (cell, index) => (
    <Marker
      key={`storm-${index}`}
      position={[
        cell.lat,
        cell.lon,
      ]}
      icon={
  new Leaflet.DivIcon({
    className: "",
   html: `
<div style="
  font-size:${
  zoom >= 9
    ? Math.min(
        22 + cell.count / 60,
        65
      )

    : zoom >= 6
    ? Math.min(
        18 + cell.count / 80,
        50
      )

    : 14
}px;
  color:${
    cell.temp < 190
      ? 'red'
      : cell.temp < 195
      ? 'orange'
      : 'yellow'
  };

  text-shadow:
    0 0 5px black,
    0 0 10px black;
">
&#9889;
</div>
`,
    iconSize: [40, 40],
  })
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
        {/* LABELS */}

        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap & CARTO"
          opacity={1}
        />
            </MapContainer>

      {stormAlert && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            zIndex: 9999,
            width: "340px",
            background: "rgba(15,23,42,0.95)",
            color: "white",
            padding: "18px",
            borderRadius: "16px",
            border: "1px solid orange",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}
        >
          <h3
            style={{
              marginTop: 0,
              color: "#ffb347",
            }}
          >
            ⚠ Thunderstorm Alert
          </h3>

          <div>
            <b>Severity:</b>{" "}
            {
              stormAlert.temp < 190
                ? "🔴 Severe"
                : stormAlert.temp < 195
                ? "🟠 Strong"
                : "🟡 Moderate"
            }
          </div>

          <br />

          <div>
            <b>Temperature:</b>{" "}
            {stormAlert.temp.toFixed(1)} K
          </div>

          <div>
            <b>Impact Radius:</b>{" "}
            {Math.round(
              Math.sqrt(stormAlert.count) * 2
            )} km
          </div>

          <div>
            <b>Risk Level:</b>{" "}
            {
              stormAlert.count > 1000
                ? "🔴 HIGH"
                : stormAlert.count > 500
                ? "🟠 MEDIUM"
                : "🟡 LOW"
            }
          </div>
<div>
  <b>Last Updated:</b>
  {" "}
  {stormAlert.updated}
</div>
          <br />
<div>
  <b>Location:</b>

  <br />

  {
  stormAlert.location?.display_name
  ||
  `${stormAlert.lat.toFixed(2)}°N,
    ${stormAlert.lon.toFixed(2)}°E`
}
</div>

<br />
          <div>
            <b>Possible Hazards</b>
            <br />
            • Lightning
            <br />
            • Heavy Rainfall
            <br />
            • Gusty Winds
          </div>

          <button
            onClick={() =>
              setStormAlert(null)
            }
            style={{
              marginTop: 12,
              padding: "8px 12px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
            }}
          >
            Dismiss
          </button>
        </div>
      )}

    </div>
  );
}