import { Fragment } from "react";
import type { ComponentType } from "react";
import type {
  MosdacAlertFeature,
  MosdacAlertFeatureProperties,
  ThunderstormCell,
} from "./weatherMapTypes";
import { createThunderstormIcon } from "./weatherMapHelpers";

interface WeatherMapAlertLayerProps {
  filteredAlerts: MosdacAlertFeature[];
  zoom: number;
  showAlerts: boolean;
  showThunderstorms: boolean;
  mosdacAlertIcons: {
    blueRainIcon?: L.DivIcon;
    cloudburstIcon?: L.DivIcon;
    nowcastRainIcon?: L.DivIcon;
  };
  thunderstormCells: ThunderstormCell[];
  leaflet: typeof import("leaflet") | null;
  Marker: ComponentType<any>;
  Popup: ComponentType<any>;
  Circle: ComponentType<any>;
}

export default function WeatherMapAlertLayer({
  filteredAlerts,
  zoom,
  showAlerts,
  showThunderstorms,
  mosdacAlertIcons,
  thunderstormCells,
  leaflet,
  Marker,
  Popup,
  Circle,
}: WeatherMapAlertLayerProps) {
  const visibleThunderstorms = thunderstormCells.filter((cell) => {
    return cell.severity === "Severe" || cell.severity === "Strong" || cell.severity === "Moderate";
  });

  return (
    <>
      {showAlerts &&
        filteredAlerts.map((feature, index) => {
          const coords = feature.geometry?.coordinates;
          if (!coords) return null;

          const [lng, lat] = coords;
          const props = (feature.properties || feature) as MosdacAlertFeatureProperties;
          const alertName = props.name || "";
          const alertDate = props.event_date || props.forecast_date || "";
          const alertTime = props.event_time || props.forecast_time || "";
          const forecast = props.forecast || "";
          const radiusKm = parseFloat(props.rad_inf || "0");
          const intensityColor = radiusKm > 120 ? "#ff2d2d" : radiusKm > 80 ? "#ff9900" : "#00ff66";
          const isCloudburst = forecast.toLowerCase().includes("cloud");
          const isCurrentRain = !!props.value;
          const isNowcastRain = !props.value;
          // Thin out rain markers at low zoom to reduce clutter; cloudbursts always show.
          const density = zoom >= 6 ? 1 : zoom >= 5 ? 2 : 3;
          const showMarker = index % density === 0;
          if (!isCloudburst && !showMarker) return null;

          return (
            <Fragment key={`alert-${index}`}>
              <Marker
                position={[lat, lng]}
                icon={
                  isCloudburst
                    ? mosdacAlertIcons.cloudburstIcon
                    : isNowcastRain
                    ? mosdacAlertIcons.nowcastRainIcon
                    : mosdacAlertIcons.blueRainIcon
                }
              >
                <Popup closeButton={true} autoPan={false}>
                  <div
                    style={{
                      minWidth: "190px",
                      background: "rgba(15,23,42,0.88)",
                      color: "white",
                      padding: "14px",
                      borderRadius: "18px",
                      backdropFilter: "blur(12px)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      fontFamily: "var(--font-inter), sans-serif",
                      lineHeight: "1.6",
                      boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                        fontSize: "14px",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                        textDecoration: "underline",
                      }}
                    >
                      {isNowcastRain ? "HEAVY RAIN (NOWCAST)" : alertName}
                    </div>
                    <div>
                      <b>LON LAT :</b>
                      <br />
                      {lng.toFixed(2)}, {lat.toFixed(2)}
                    </div>
                    <div style={{ marginTop: "8px" }}>
                      <b>Forecast Issued :</b>
                      <br />
                      {alertDate} {alertTime}
                    </div>
                    {isNowcastRain && (
                      <div style={{ marginTop: "8px" }}>
                        <b>Validity :</b>
                        <br />
                        {alertTime} (+6 hrs)
                      </div>
                    )}
                    <div style={{ marginTop: "8px" }}>
                      <b>{props.value ? "Rainfall" : "Radius"} :</b>
                      <br />
                      {props.value ? `${props.value} mm` : `${props.rad_inf} km`}
                    </div>
                  </div>
                </Popup>
              </Marker>

              {!isCurrentRain && (
                <Circle
                  center={[lat, lng]}
                  radius={
                    zoom >= 7 ? radiusKm * 1000 : zoom >= 5 ? radiusKm * 1200 : zoom >= 3 ? radiusKm * 1500 : radiusKm * 1800
                  }
                  pathOptions={{
                    color: "#ffe600",
                    fillOpacity: radiusKm > 120 ? 0.08 : radiusKm > 80 ? 0.05 : 0.03,
                    weight: radiusKm > 120 ? 3 : radiusKm > 80 ? 2 : 1.2,
                    opacity: radiusKm > 120 ? 1 : 0.75,
                  }}
                >
                  <Popup pane="popupPane" closeButton={true} autoPan={false}>
                    <div
                      style={{
                        minWidth: "190px",
                        background: "rgba(15,23,42,0.88)",
                        color: "white",
                        padding: "14px",
                        borderRadius: "18px",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        fontFamily: "var(--font-inter), sans-serif",
                        lineHeight: "1.6",
                        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
                      }}
                    >
                      <div
                        style={{
                          fontWeight: "bold",
                          fontSize: "14px",
                          textTransform: "uppercase",
                          marginBottom: "8px",
                          textDecoration: "underline",
                        }}
                      >
                        <>
                          {isNowcastRain && (
                            <span style={{ color: intensityColor, marginRight: "6px" }}>●</span>
                          )}
                          {isNowcastRain ? "HEAVY RAIN (NOWCAST)" : alertName}
                        </>
                      </div>
                      <div>
                        <b>LON LAT :</b>
                        <br />
                        {lng.toFixed(2)}, {lat.toFixed(2)}
                      </div>
                      <div style={{ marginTop: "8px" }}>
                        <b>Forecast Issued :</b>
                        <br />
                        {alertDate} {alertTime}
                      </div>
                      {isNowcastRain && (
                        <div style={{ marginTop: "8px" }}>
                          <b>Validity :</b>
                          <br />
                          {alertTime} (+6 hrs)
                        </div>
                      )}
                      <div style={{ marginTop: "8px" }}>
                        <b>Expected Within:</b>
                        <br />
                        Next 6 Hours
                      </div>
                      <div style={{ marginTop: "8px" }}>
                        <b>{props.value ? "Rainfall" : "Radius"} :</b>
                        <br />
                        {props.value ? `${props.value} mm` : `${props.rad_inf} km`}
                      </div>
                    </div>
                  </Popup>
                </Circle>
              )}
            </Fragment>
          );
        })}

      {showThunderstorms &&
        visibleThunderstorms.map((cell, index) => (
          <Marker
            key={`storm-${index}`}
            position={[cell.lat, cell.lon]}
            icon={leaflet ? createThunderstormIcon(leaflet, cell, zoom) : undefined}
          >
            <Popup>
              <b>Thunderstorm Cell</b>
              <br />
              Severity: {cell.temp < 190 ? "🔴 Severe" : cell.temp < 195 ? "🟠 Strong" : "🟡 Moderate"}
              <br />
              Temp: {cell.temp.toFixed(1)} K
              <br />
              Impact Radius: {Math.round(Math.sqrt(cell.count) * 2)} km
              <br />
              Cell Strength: {cell.count}
            </Popup>
          </Marker>
        ))}
    </>
  );
}
