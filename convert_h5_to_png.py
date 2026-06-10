import h5py
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import json
from collections import defaultdict
from datetime import datetime, UTC
# =========================
# H5 FILE LOCATION
# =========================

H5_FOLDER = Path(
    "h5-data"
)

# =========================
# OUTPUT PNG LOCATION
# =========================

PNG_FOLDER = Path(
    "satellite-data/png"
)

PNG_FOLDER.mkdir(
    parents=True,
    exist_ok=True
)

# =========================
# FIND H5 FILES
# =========================

files = list(
    H5_FOLDER.glob("*.h5")
)

if not files:
    print("No H5 files found")
    exit()

# =========================
# GET LATEST FILE
# =========================
files = sorted(
    Path("h5-data").glob("*.h5")
)

if not files:
    print("No H5 files found in h5-data")
    exit()

latest_file = files[-1]

print(
    "\nUsing latest file:",
    latest_file.name
)
# =========================
# OPEN H5 FILE
# =========================

with h5py.File(
    latest_file,
    "r"
) as h5:

    # =========================
    # LOAD IMAGE COUNTS
    # =========================

    counts = np.array(
        h5["IMG_TIR1"]
    )[0]


    # =========================
    # LOAD TEMPERATURE LUT
    # =========================

    temp_lut = np.array(
        h5["IMG_TIR1_TEMP"]
    )

    # =========================
# CONVERT COUNTS -> TEMP
# =========================

    temperature = temp_lut[counts]
    temperature = temperature.astype(np.float32)

    temperature[
    (temperature < 180)
    |
    (temperature > 330)
] = np.nan
    # =========================
    # TIR2
    # =========================

    tir2_counts = np.array(
        h5["IMG_TIR2"]
    )[0]

    tir2_lut = np.array(
        h5["IMG_TIR2_TEMP"]
    )

    tir2_temp = tir2_lut[
        tir2_counts
    ]
    tir2_temp = tir2_temp.astype(np.float32)

    tir2_temp[
    (tir2_temp < 180)
    |
    (tir2_temp > 330)
] = np.nan
    # =========================
    # WV
    # =========================

    wv_counts = np.array(
        h5["IMG_WV"]
    )[0]

    wv_lut = np.array(
        h5["IMG_WV_TEMP"]
    )

    wv_temp = wv_lut[
        wv_counts
    ]
    wv_temp = wv_temp.astype(np.float32)

    wv_temp[
    (wv_temp < 180)
    |
    (wv_temp > 330)
] = np.nan
    # =========================
    # BRIGHTNESS TEMPERATURE
    # DIFFERENCES
    # =========================

    # BTD TIR1 – TIR2  (10.8 – 12.0 µm)
    # Water cloud  :  0 – 1 K
    # Ice / cirrus :  2 – 8 K  ← catches thin cloud TIR1 misses
    # Clear land   :  0.5 – 2 K  (surface emissivity)
    btd_11_12 = temperature - tir2_temp

    # =========================
    # CLEAR-SKY BACKGROUND BT
    # =========================
    # Spatial maximum over ~200 km acts as an
    # upper-envelope / clear-sky surface reference.
    # Warmest pixels in the neighbourhood are most
    # likely cloud-free.

    try:
        from scipy.ndimage import (
            maximum_filter,
            gaussian_filter as _gauss,
        )

        _bg   = maximum_filter(
            temperature.astype(np.float32),
            size=50
        )
        bg_temp = _gauss(_bg, sigma=8)

    except ImportError:
        # scipy absent – fall back to a fixed estimate
        bg_temp = np.full_like(
            temperature, 305.0, dtype=np.float32
        )

    bg_temp = np.clip(
        bg_temp.astype(np.float32),
        285, 318
    )

    # =========================
    # CLOUD FRACTION
    # COMPUTATION
    # =========================

    cf = np.zeros_like(
        temperature, dtype=np.float32
    )

    # Deep convective (< 230 K) → 90-100 %
    _m = temperature < 230
    cf = np.where(
        _m,
        np.clip(90 + (230 - temperature) * 0.5, 90, 100),
        cf
    )

    # High cold cloud (230-250 K) → 65-90 %
    _m = (temperature >= 230) & (temperature < 250)
    cf = np.where(
        _m,
        np.clip(65 + (250 - temperature) * 1.25, 65, 90),
        cf
    )

    # Mid-level cloud (250-270 K) → 15-65 %
    # Radiative mixing: cf = (T_bg - T_obs) / (T_bg - T_cloud_ref)
    T_MID_REF = 245
    _m   = (temperature >= 250) & (temperature < 270)
    _raw = (bg_temp - temperature) / np.maximum(
        bg_temp - T_MID_REF, 1.0
    )
    cf = np.where(_m, np.clip(_raw * 75, 15, 65), cf)

    # Low / warm cloud (270-295 K) → 0-35 %
    T_LOW_REF = 260
    _m   = (temperature >= 270) & (temperature < 305)
    _raw = (bg_temp - temperature) / np.maximum(
        bg_temp - T_LOW_REF, 1.0
    )
    _boost = np.where(btd_11_12 < 1.0, 1.3, 1.0)   # small BTD = water cloud
    cf = np.where(
        _m,
        np.clip(_raw * 45 * _boost, 0, 35),
        cf
    )

    # Thin cirrus boost: BTD > 2 K + moderately cold
    _cirrus = (
    (btd_11_12 > 1.5)
    &
    (temperature < 260)
)
    cf = np.where(
        _cirrus,
        np.clip(cf + np.minimum(btd_11_12 * 6, 22), 0, 88),
        cf
    )

    # WV upper-cloud boost: very cold WV = deep moisture layer
    wv_boost = np.clip(
    (245 - wv_temp),
    0,
    20
)
    cf += wv_boost

    # Clear-sky suppression: very warm + typical land BTD
    _clear = (
        (temperature > 300) &
        (btd_11_12 > 0.5) &
        (btd_11_12 < 2.5)
    )
    cf = np.where(_clear, np.minimum(cf, 8), cf)

    # Final smoothing pass
    try:
        from scipy.ndimage import gaussian_filter as _gauss
        cf = _gauss(cf, sigma=1.5)
    except ImportError:
        pass

    cloud_cover_pct = np.clip(cf, 0, 100).astype(np.float32)

    # =========================
    # LOAD LAT/LON
    # =========================

    lat = np.array(
        h5["Latitude"]
    )

    lon = np.array(
        h5["Longitude"]
    )

    # Apply scale factor

    lat = lat * 0.01
    lon = lon * 0.01

    # =========================
    # INVALID SATELLITE PIXELS
    # =========================

    earth_mask = (
    (lat > -90)
    &
    (lat < 90)
    &
    (lon > 0)
    &
    (lon < 180)
)

    india_mask = (
        (lat >= 5)
        &
        (lat <= 38)
        &
        (lon >= 65)
        &
        (lon <= 98)
    )

    # =========================
    # THUNDERSTORM MASK
    # =========================

    storm_mask = (
    (temperature < 208)
    &
    (temperature > 180)
    &
    (wv_temp < 235)
    &
    earth_mask
    &
    india_mask
)

    storm_pixels = np.sum(
        storm_mask
    )

    print(
        "\nIndia Storm Pixels:",
        storm_pixels
    )

    # =========================
    # SHOW LOCATIONS
    # =========================

    storm_rows, storm_cols = np.where(
        storm_mask
    )

    # =========================
    # CREATE ALERTS
    # =========================

    alerts = []

    for i in range(
        len(storm_rows)
    ):
        r = storm_rows[i]
        c = storm_cols[i]

        alerts.append(
            {
                "lat": float(
                    lat[r, c]
                ),

                "lon": float(
                    lon[r, c]
                ),

                "temp": float(
                    temperature[r, c]
                ),
            }
        )

    print(
        "\nTotal Alerts:",
        len(alerts)
    )
    
    # =========================
    # CLUSTER ALERTS
    # =========================

    clusters = defaultdict(list)

    for alert in alerts:

        lat_key = round(alert["lat"] / 0.5)*0.5
        lon_key = round(alert["lon"] / 0.5)*0.5
        clusters[
            (
                lat_key,
                lon_key
            )
        ].append(alert)

    storm_cells = []

    for (
        lat_key,
        lon_key
    ), group in clusters.items():

        coldest = min(
            group,
            key=lambda x:
            x["temp"]
        )

        if len(group) >= 20:

         storm_cells.append(
{
    "lat": coldest["lat"],
    "lon": coldest["lon"],
    "temp": coldest["temp"],
    "count": len(group),

    "severity":
        "Severe"
        if coldest["temp"] < 190
        else "Strong"
        if coldest["temp"] < 195
        else "Moderate",

    "radius_km":
        round(
            np.sqrt(
                len(group)
            ) * 2
        ),

    "updated":
        datetime.now(UTC).strftime(
         "%d-%b-%Y %H:%M UTC"
)
}
)

    print(
        "\nStorm Cells:",
        len(storm_cells)
    )
    # =========================
    # SAVE JSON
    # =========================
    # =========================
    # SAVE CLOUD GRID
    # =========================

cloud_grids = defaultdict(list)

GRID_KM = 12

GRID_DEG = GRID_KM / 111.0

for r in range(0, temperature.shape[0], 4):
    for c in range(0, temperature.shape[1], 4):

        if not earth_mask[r, c]:
            continue

        if not india_mask[r, c]:
            continue

        grid_lat = (
            round(lat[r, c] / GRID_DEG)
            * GRID_DEG
        )

        grid_lon = (
            round(lon[r, c] / GRID_DEG)
            * GRID_DEG
        )

        cloud_grids[
            (
                round(grid_lat, 4),
                round(grid_lon, 4)
            )
        ].append({
            "cc": float(cloud_cover_pct[r, c]),
            "temp": float(temperature[r, c])
        })
cloud_grid = []

for (
    grid_lat,
    grid_lon
), pixels in cloud_grids.items():

    avg_cc = np.mean(
        [
            p["cc"]
            for p in pixels
        ]
    )

    avg_temp = np.mean(
        [
            p["temp"]
            for p in pixels
        ]
    )

    cloud_grid.append({

        "gridLat":
            round(
                grid_lat,
                4
            ),

        "gridLon":
            round(
                grid_lon,
                4
            ),

        "cloudCover":
            int(
                round(
                    avg_cc
                )
            ),

        "temp":
            int(
                round(
                    avg_temp
                )
            )
    })
print(
    "Unique grids:",
    len(cloud_grids)
)
print(
    "Cloud grid records:",
    len(cloud_grid)
)
with open(
        "public/cloud-grid.json",
        "w"
    ) as f:

    json.dump(
            cloud_grid,
            f
        )
print(
        "Saved cloud-grid.json:",
        len(cloud_grid), "points"
    )

with open(
        "public/thunderstorm-cells.json",
        "w"
    ) as f:

    json.dump(
            storm_cells,
            f,
            indent=2
        )

    print(
        "\nSaved thunderstorm-cells.json"
    )
    
    # =========================
    # CLEAN INVALID VALUES
    # =========================

    temperature = np.nan_to_num(
        temperature
    )

    # =========================
    # CREATE IMAGE
    # =========================

    print(
        "Saved JSON:",
        len(storm_cells)
    )