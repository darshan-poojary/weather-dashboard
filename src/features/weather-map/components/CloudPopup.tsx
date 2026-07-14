import { useEffect } from "react";
import dynamic from "next/dynamic";
import type { PopupEvent } from "leaflet";
import type { CloudPopup } from "../types";
import { ccToColor, getCloudLabel, getCloudRainRisk, getSkyIcon } from "../helpers";

function buildCloudPopupHtml(cp: CloudPopup): string {
  const risk = getCloudRainRisk(cp.temp, cp.cloudCover);
  const riskHtml = risk
    ? `<div style="font-size:12px;font-weight:600;color:${risk.color};padding:5px 9px;border-radius:8px;background:${risk.color}1a;border:1px solid ${risk.color}35;margin-bottom:10px">${risk.label}</div>`
    : "";
  const btHtml =
    cp.temp > 100
      ? `<span>BT ${cp.temp} K (${(cp.temp - 273.15).toFixed(1)}&deg;C)</span>`
      : "";

  return `
    <div style="width:160px;background:rgba(10,16,30,0.97);color:#fff;padding:8px;border-radius:14px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.09);box-shadow:0 14px 42px rgba(0,0,0,0.65);font-family:var(--font-inter),sans-serif">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase">&#9729; Cloud Cover</span>
        <button class="cloud-popup-close" style="background:rgba(255,255,255,0.06);border:none;color:#94a3b8;width:20px;height:20px;border-radius:6px;cursor:pointer;font-size:14px;line-height:20px;text-align:center">&#10005;</button>
      </div>
      <div style="display:flex;align-items:flex-end;gap:3px;margin-bottom:8px">
        <span style="font-size:32px;font-weight:800;line-height:1;color:${ccToColor(
          cp.cloudCover
        )};font-variant-numeric:tabular-nums">${cp.cloudCover}</span>
        <span style="font-size:18px;font-weight:700;color:#475569;padding-bottom:6px">%</span>
      </div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">
        <span style="font-size:18px">${getSkyIcon(cp.cloudCover)}</span>
        <span style="font-size:13px;font-weight:600;color:#e2e8f0">${getCloudLabel(cp.cloudCover)}</span>
      </div>
      ${riskHtml}
      <div style="font-size:10px;color:#475569;display:flex;justify-content:space-between">
        ${btHtml}
        <span>${cp.lat.toFixed(2)}&deg;N ${cp.lon.toFixed(2)}&deg;E</span>
      </div>
    </div>`;
}

// Imperative Leaflet popup, mirroring the AlertLayer approach. A controlled
// react-leaflet <Popup> re-opened itself on autoPan (open -> map move -> parent
// re-render -> re-open), triggering "Maximum update depth exceeded". Opening the
// popup directly on the map avoids that render loop entirely.
const WeatherMapCloudPopup = dynamic(
  async () => {
    const mod = await import("react-leaflet");
    const L = await import("leaflet");

    return function CloudPopupInner({
      cloudPopup,
      setCloudPopup,
    }: {
      cloudPopup: CloudPopup;
      setCloudPopup: (value: null) => void;
    }) {
      const map = mod.useMap();

      useEffect(() => {
        const popup = L.popup({
          closeButton: false,
          className: "cloud-info-popup",
          autoPan: true,
        })
          .setLatLng([cloudPopup.lat, cloudPopup.lon])
          .setContent(buildCloudPopupHtml(cloudPopup))
          .openOn(map);

        const close = () => setCloudPopup(null);
        const onPopupClose = (event: PopupEvent) => {
          if (event.popup === popup) close();
        };
        map.on("popupclose", onPopupClose);
        popup
          .getElement()
          ?.querySelector(".cloud-popup-close")
          ?.addEventListener("click", close);

        return () => {
          map.off("popupclose", onPopupClose);
          map.closePopup(popup);
        };
      }, [map, cloudPopup, setCloudPopup]);

      return null;
    };
  },
  { ssr: false }
);

export default WeatherMapCloudPopup;
