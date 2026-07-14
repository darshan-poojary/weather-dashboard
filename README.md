# Weather Dashboard

A real-time satellite weather map for India, built on Next.js and Leaflet. It
renders live INSAT-3R imagery from ISRO's [MOSDAC](https://www.mosdac.gov.in/)
feed, overlays official rain/cloudburst nowcasts and detected thunderstorm
cells, and lets you scrub through recent frames or jump to a historical time.

## Features

- **Live / Animation / History modes** — view the latest frame, loop the last
  ~10 hours of half-hourly frames, or pick a specific date & time.
- **Channels & palettes** — switch INSAT-3R channels (TIR, etc.) and color
  palettes; the WMS layer redraws in place for smooth transitions.
- **Rain & cloudburst alerts** — MOSDAC nowcasts rendered as viewport-culled,
  zoom-decluttered markers so the map never gets blanketed.
- **Thunderstorm cells** — severity-classified cells detected from cloud-top
  temperature, with impact-radius popups.
- **India boundaries** — state and district outlines with a legible "cased
  line" style that stays readable over any palette.

## Architecture

```
Browser (Leaflet map, features/weather-map)
   │
   ├── /api/mosdac-wms      → proxies INSAT-3R WMS tiles from MOSDAC
   ├── /api/mosdac-latest   → probes the newest published half-hourly frame
   └── /api/mosdac-alerts   → fetches & sanitizes the rain/cloudburst nowcast

Static data (public/):
   cloud-grid.json, thunderstorm-cells.json, geo/*.geojson

Updater (updater/, Python) — run every 30 min by GitHub Actions:
   downloads latest INSAT H5 → derives cloud grid + storm cells → commits JSON
```

The MOSDAC slot logic (frames publish on `:15` / `:45` each hour) lives in
[`src/lib/mosdac.ts`](src/lib/mosdac.ts) and is shared by all three API routes.

### Project layout

```
src/
  app/                     Next.js routes
    api/mosdac-*/          MOSDAC proxy endpoints (wms, latest, alerts)
    layout.tsx, page.tsx   root shell + entry (mounts the weather-map feature)
  features/
    weather-map/           self-contained map feature
      components/          WeatherMap (orchestrator), Controls, Legend, CloudPopup
      config.ts            channels, palettes, legends, grid constants
      helpers.ts           icon builders + cloud-cover formatting
      types.ts             shared TypeScript types
      index.ts             public entry point ({ WeatherMap })
  lib/
    mosdac.ts              shared MOSDAC slot/URL logic

updater/                   Python data pipeline (see below)
public/                    static data + geo boundaries served to the client
```

> **Note on Next.js:** this repo uses a modified Next.js build. See
> [`AGENTS.md`](AGENTS.md) — consult `node_modules/next/dist/docs/` before
> changing routing or data-fetching code.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
```

## Data updater

The Python pipeline in [`updater/`](updater/) refreshes the static weather data.
GitHub Actions runs it every 30 minutes
([`.github/workflows/update-weather.yml`](.github/workflows/update-weather.yml))
and commits any changes to `public/cloud-grid.json` and
`public/thunderstorm-cells.json`. To run it locally:

```bash
pip install -r updater/requirements.txt
python updater/update_thunderstorms.py
```

## Map boundaries

`public/geo/india-states.geojson` and `india-districts.geojson` are **simplified**
for fast client rendering (the raw survey-grade boundaries were ~57 MB and caused
frame drops when zoomed in). If you ever replace them with fresh source data,
re-simplify with [mapshaper](https://github.com/mbloch/mapshaper) before committing:

```bash
npx mapshaper raw-states.geojson -simplify 8% keep-shapes \
  -o public/geo/india-states.geojson precision=0.001 force
```

8% retains enough detail for high zoom while keeping each file a few MB;
topology preservation (mapshaper's default) stops shared borders from splitting
into doubled lines.

## Deployment

Deployable on any Next.js host (e.g. Vercel). The `/api/mosdac-*` routes must be
able to reach `mosdac.gov.in`.
