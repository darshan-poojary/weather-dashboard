"""Derive cloud-cover and thunderstorm-cell products from an INSAT-3DR L1B granule.

Input  (h5-data/*.h5): brightness-temperature channels
  IMG_TIR1 (~10.8 um)  primary cloud-top temperature
  IMG_TIR2 (~12.0 um)  split-window partner; TIR1-TIR2 (BTD) exposes thin cirrus
  IMG_WV   (~6.7 um)   upper-tropospheric water vapour

Output (public/):
  cloud-grid.json          ~12 km cloud-cover grid over India
  thunderstorm-cells.json  deep-convective cells (connected cold-cloud regions)

Cloud fraction and the storm thresholds are heuristics tuned for INSAT-3DR IR;
every tunable is a named constant below so they can be adjusted in one place.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

import h5py
import numpy as np
from scipy.ndimage import (
    gaussian_filter,
    label,
    maximum_filter,
    minimum_filter,
    minimum_position,
    uniform_filter,
)

ROOT_DIR = Path(__file__).resolve().parent.parent
H5_FOLDER = ROOT_DIR / "h5-data"
PUBLIC_FOLDER = ROOT_DIR / "public"
PUBLIC_FOLDER.mkdir(parents=True, exist_ok=True)

# --- Valid brightness-temperature window (K). Outside this is space / bad data. ---
TEMP_VALID_MIN, TEMP_VALID_MAX = 180.0, 330.0

# --- Region of interest: India bounding box (degrees). ---
INDIA_LAT = (5.0, 38.0)
INDIA_LON = (65.0, 98.0)

# --- Thunderstorm detection (deep convection) ---
STORM_TIR1_MAX_K = 233.0    # cloud top colder than ~-40 C => convective cloud
STORM_WV_MAX_K = 248.0      # cold water-vapour channel confirms a tall, moist cloud
STORM_MIN_PIXELS = 2        # ignore only single-pixel specks; INSAT TIR pixel ~4 km
PIXEL_KM = 4.0              # nominal INSAT-3DR TIR footprint, used to size cells
# Minimum spacing between storm-core icons. A large storm complex is resolved
# into one icon per cold core at least this far apart -> smaller value = more
# icons. ~18 km resolves the maximum sensible number of cores within a complex.
CORE_SEPARATION_KM = 18.0
# Severity by the cell's coldest cloud top (colder top => taller, stronger updraft).
# Kept reachable for real INSAT tops, which rarely fall below ~195 K.
SEVERITY_SEVERE_MAX_K = 200.0
SEVERITY_STRONG_MAX_K = 207.0

# --- Cloud-cover grid ---
GRID_KM = 12.0
GRID_DEG = GRID_KM / 111.0
SAMPLE_STEP = 4             # subsample stride when aggregating the grid


def find_latest_h5_file() -> Path:
    files = sorted(H5_FOLDER.glob("*.h5"))
    if not files:
        raise FileNotFoundError("No H5 files found in h5-data")
    return files[-1]


def load_channel_temperature(h5: h5py.File, data_key: str, lut_key: str) -> np.ndarray:
    """Map raw sensor counts through the granule's lookup table to Kelvin."""
    counts = np.array(h5[data_key])[0]
    lut = np.array(h5[lut_key])
    temp = lut[counts].astype(np.float32)
    temp[(temp < TEMP_VALID_MIN) | (temp > TEMP_VALID_MAX)] = np.nan
    return temp


def compute_background(temperature: np.ndarray) -> np.ndarray:
    """Estimate the clear-sky (surface) temperature field.

    In the thermal IR the warmest pixels in a neighbourhood are the clearest, so a
    local maximum filter recovers the surface even under broken cloud; a Gaussian
    blur removes speckle. Clamped to a physically plausible land-surface range.
    """
    background = maximum_filter(np.nan_to_num(temperature, nan=TEMP_VALID_MIN), size=50)
    return np.clip(gaussian_filter(background, sigma=8).astype(np.float32), 285, 318)


def compute_cloud_fraction(
    temperature: np.ndarray,
    btd_11_12: np.ndarray,
    bg_temp: np.ndarray,
    wv_temp: np.ndarray,
) -> np.ndarray:
    """Estimate cloud fraction (0-100%) per pixel from IR brightness temperatures.

    Colder-than-background cloud tops are increasingly cloudy; the split-window
    difference (BTD) adds thin cirrus the single IR window misses, and a cold
    water-vapour channel nudges genuinely high/moist columns upward. NaN (space /
    bad data) is treated as clear so it can never leak into the output.
    """
    cf = np.zeros_like(temperature, dtype=np.float32)

    # Very cold tops: essentially overcast (deep/high cloud).
    mask = temperature < 230
    cf = np.where(mask, np.clip(90 + (230 - temperature) * 0.5, 90, 100), cf)

    # Cold tops: mostly cloudy.
    mask = (temperature >= 230) & (temperature < 250)
    cf = np.where(mask, np.clip(65 + (250 - temperature) * 1.25, 65, 90), cf)

    # Mid tops: scale by depth below the clear-sky background.
    T_MID_REF = 245
    mask = (temperature >= 250) & (temperature < 270)
    raw = (bg_temp - temperature) / np.maximum(bg_temp - T_MID_REF, 1.0)
    cf = np.where(mask, np.clip(raw * 75, 15, 65), cf)

    # Warm tops: shallow/low cloud, boosted where BTD hints at cloud.
    T_LOW_REF = 260
    mask = (temperature >= 270) & (temperature < 305)
    raw = (bg_temp - temperature) / np.maximum(bg_temp - T_LOW_REF, 1.0)
    boost = np.where(btd_11_12 < 1.0, 1.3, 1.0)
    cf = np.where(mask, np.clip(raw * 45 * boost, 0, 35), cf)

    # Thin cirrus: high split-window difference over cold-ish tops.
    cirrus_mask = (btd_11_12 > 1.5) & (temperature < 260)
    cf = np.where(cirrus_mask, np.clip(cf + np.minimum(btd_11_12 * 6, 22), 0, 88), cf)

    # Water-vapour nudge: only where a cloud already exists, so a moist-but-clear
    # upper troposphere does not paint phantom cloud over warm ground.
    wv_boost = np.clip(245 - wv_temp, 0, 20)
    cf = np.where((cf > 10) & (temperature < 290), cf + wv_boost, cf)

    # Warm, spectrally clear pixels: force near-zero cloud.
    clear_mask = (temperature > 300) & (btd_11_12 > 0.5) & (btd_11_12 < 2.5)
    cf = np.where(clear_mask, np.minimum(cf, 8), cf)

    cf = np.nan_to_num(cf, nan=0.0)
    cf = gaussian_filter(cf, sigma=1.5)
    return np.clip(cf, 0, 100).astype(np.float32)


def _severity(coldest_k: float) -> str:
    if coldest_k < SEVERITY_SEVERE_MAX_K:
        return "Severe"
    if coldest_k < SEVERITY_STRONG_MAX_K:
        return "Strong"
    return "Moderate"


def detect_storm_cells(
    lat: np.ndarray, lon: np.ndarray, temperature: np.ndarray, storm_mask: np.ndarray
) -> list[dict]:
    """Place one icon per deep-convective cold core.

    A local-minimum search over the storm pixels finds each coldest core that is
    at least CORE_SEPARATION_KM from the next, so a large storm complex is
    resolved into several cores (strong updrafts) rather than a single blob. Each
    core is anchored at its coldest pixel; its strength/radius come from the count
    of storm pixels in the surrounding window.
    """
    if not storm_mask.any():
        return []

    window = max(3, round(CORE_SEPARATION_KM / PIXEL_KM))

    # Cores = storm pixels that are the coldest within a `window`-sized box.
    guarded = np.where(storm_mask, temperature, np.inf).astype(np.float32)
    core_pixels = (guarded == minimum_filter(guarded, size=window)) & np.isfinite(guarded)

    # Merge adjacent tie pixels (flat cold plateaus) into one core, anchored coldest.
    core_labels, n_cores = label(core_pixels, structure=np.ones((3, 3), dtype=int))
    if n_cores == 0:
        return []
    positions = cast(
        list, minimum_position(guarded, core_labels, list(range(1, n_cores + 1)))
    )

    # Local storm-pixel count in the window -> cell strength and radius.
    density = uniform_filter(storm_mask.astype(np.float32), size=window) * (window * window)
    updated = datetime.now(UTC).strftime("%d-%b-%Y %H:%M UTC")

    cells = []
    for r, c in positions:
        count = int(round(float(density[r, c])))
        if count < STORM_MIN_PIXELS:  # drop isolated specks
            continue
        coldest_k = float(temperature[r, c])
        area_km2 = count * PIXEL_KM * PIXEL_KM
        cells.append(
            {
                "lat": float(lat[r, c]),
                "lon": float(lon[r, c]),
                "temp": coldest_k,
                "count": count,
                "severity": _severity(coldest_k),
                "radius_km": round(float(np.sqrt(area_km2 / np.pi))),
                "updated": updated,
            }
        )

    cells.sort(key=lambda cell: cell["temp"])  # coldest / strongest first
    return cells


def build_cloud_grid(
    lat: np.ndarray,
    lon: np.ndarray,
    cloud_cover_pct: np.ndarray,
    temperature: np.ndarray,
    roi_mask: np.ndarray,
) -> list[dict]:
    """Aggregate subsampled pixels into a ~12 km cloud-cover grid over the ROI."""
    sub = (slice(None, None, SAMPLE_STEP), slice(None, None, SAMPLE_STEP))
    keep = roi_mask[sub]
    la, lo = lat[sub][keep], lon[sub][keep]
    cc, tp = cloud_cover_pct[sub][keep], temperature[sub][keep]

    valid = ~(np.isnan(cc) | np.isnan(tp))
    la, lo, cc, tp = la[valid], lo[valid], cc[valid], tp[valid]

    grid_lat = np.round(np.round(la / GRID_DEG) * GRID_DEG, 4)
    grid_lon = np.round(np.round(lo / GRID_DEG) * GRID_DEG, 4)

    keys = np.stack([grid_lat, grid_lon], axis=1)
    uniq, inv = np.unique(keys, axis=0, return_inverse=True)
    inv = inv.ravel()
    counts = np.bincount(inv)
    cc_mean = np.bincount(inv, weights=cc) / counts
    tp_mean = np.bincount(inv, weights=tp) / counts

    return [
        {
            "gridLat": round(float(uniq[i, 0]), 4),
            "gridLon": round(float(uniq[i, 1]), 4),
            "cloudCover": int(round(cc_mean[i])),
            "temp": int(round(tp_mean[i])),
        }
        for i in range(len(uniq))
    ]


def save_json(data, path: Path, indent: int | None = None) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=indent, allow_nan=False)


def main() -> None:
    latest_file = find_latest_h5_file()
    print("Using latest file:", latest_file.name)

    with h5py.File(latest_file, "r") as h5:
        temperature = load_channel_temperature(h5, "IMG_TIR1", "IMG_TIR1_TEMP")
        tir2_temp = load_channel_temperature(h5, "IMG_TIR2", "IMG_TIR2_TEMP")
        wv_temp = load_channel_temperature(h5, "IMG_WV", "IMG_WV_TEMP")

        btd_11_12 = temperature - tir2_temp
        bg_temp = compute_background(temperature)
        cloud_cover_pct = compute_cloud_fraction(temperature, btd_11_12, bg_temp, wv_temp)

        lat = np.array(h5["Latitude"]) * 0.01
        lon = np.array(h5["Longitude"]) * 0.01

        india_mask = (
            (lat >= INDIA_LAT[0]) & (lat <= INDIA_LAT[1])
            & (lon >= INDIA_LON[0]) & (lon <= INDIA_LON[1])
        )

        storm_mask = (
            (temperature < STORM_TIR1_MAX_K)
            & (temperature > TEMP_VALID_MIN)
            & (wv_temp < STORM_WV_MAX_K)
            & india_mask
        )
        print("India storm pixels:", int(np.sum(storm_mask)))

        storm_cells = detect_storm_cells(lat, lon, temperature, storm_mask)
        print("Storm cells:", len(storm_cells))

        cloud_grid = build_cloud_grid(lat, lon, cloud_cover_pct, temperature, india_mask)
        print("Cloud grid records:", len(cloud_grid))

        save_json(cloud_grid, PUBLIC_FOLDER / "cloud-grid.json")
        save_json(storm_cells, PUBLIC_FOLDER / "thunderstorm-cells.json", indent=2)
        print("Saved cloud-grid.json and thunderstorm-cells.json")


if __name__ == "__main__":
    main()
