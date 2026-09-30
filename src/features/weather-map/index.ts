"use client";

import dynamic from "next/dynamic";

// The map uses browser-only Leaflet APIs and the current clock. Avoid baking
// a build-time timestamp into HTML that would disagree during hydration.
export const WeatherMap = dynamic(() => import("./components/WeatherMap"), { ssr: false });
