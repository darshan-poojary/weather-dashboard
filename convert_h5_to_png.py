import h5py
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path
import json
from collections import defaultdict
from datetime import datetime
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
    print("\nALL DATASETS:\n")

    def print_tree(name, obj):
        print(name)

    h5.visititems(print_tree)

    # =========================
    # LOAD IMAGE COUNTS
    # =========================

    counts = np.array(
        h5["IMG_TIR1"]
    )[0]

    print(
        "\nCounts Shape:",
        counts.shape
    )

    print(
        "Counts Min:",
        np.min(counts)
    )

    print(
        "Counts Max:",
        np.max(counts)
    )

    # =========================
    # LOAD TEMPERATURE LUT
    # =========================

    temp_lut = np.array(
        h5["IMG_TIR1_TEMP"]
    )

    print(
        "\nLUT Shape:",
        temp_lut.shape
    )

    print(
        "LUT Min:",
        np.min(temp_lut)
    )

    print(
        "LUT Max:",
        np.max(temp_lut)
    )

    # =========================
# CONVERT COUNTS -> TEMP
# =========================

    temperature = temp_lut[counts]

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

    print(
        "\nLatitude Shape:",
        lat.shape
    )

    print(
        "Longitude Shape:",
        lon.shape
    )

    print(
        "\nLatitude Min:",
        np.min(lat)
    )

    print(
        "Latitude Max:",
        np.max(lat)
    )

    print(
        "\nLongitude Min:",
        np.min(lon)
    )

    print(
        "Longitude Max:",
        np.max(lon)
    )

    # =========================
    # TEMPERATURE STATS
    # =========================

    print(
        "\nTemperature Shape:",
        temperature.shape
    )

    print(
        "Temperature Min:",
        np.min(temperature)
    )

    print(
        "Temperature Max:",
        np.max(temperature)
    )

    print(
        "Temperature Mean:",
        np.mean(temperature)
    )

    # =========================
    # TEMPERATURE PERCENTILES
    # =========================

    print("\nTEMPERATURE PERCENTILES\n")

    for p in [
        1,
        5,
        10,
        25,
        50,
        75,
        90,
        95,
        99
    ]:
        print(
            f"{p}%:",
            np.percentile(
                temperature,
                p
            )
        )

    # =========================
    # INVALID SATELLITE PIXELS
    # =========================

    earth_mask = (
        (lat != 327.67)
        &
        (lon != 327.67)
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
        (temperature < 203)
        &
        (temperature > 180)
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

    print(
        "\nFirst Alert:"
    )

    print(
        alerts[0]
    )
    
    # =========================
    # CLUSTER ALERTS
    # =========================

    clusters = defaultdict(list)

    for alert in alerts:

        lat_key = round(alert["lat"] / 8) * 8
        lon_key = round(alert["lon"] / 8) * 8
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

        if len(group) >= 50:

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
        datetime.utcnow().strftime(
            "%d-%b-%Y %H:%M UTC"
        )
}
)

    print(
        "\nStorm Cells:",
        len(storm_cells)
    )
    print(
    "First Cell:",
    storm_cells[0]
)
    print(
        "\nFirst 10 Storm Cells:\n"
    )

    for cell in storm_cells[:10]:

        print(cell)    
    # =========================
    # SAVE JSON
    # =========================

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
    print(
        "\nFirst 10 Storm Locations:\n"
    )

    for i in range(
        min(10, len(storm_rows))
    ):
        r = storm_rows[i]
        c = storm_cols[i]

    print(
            f"Lat: {lat[r,c]:.2f}",
            f"Lon: {lon[r,c]:.2f}",
            f"Temp: {temperature[r,c]:.2f} K"
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

    plt.figure(
        figsize=(10, 10)
    )

    plt.imshow(
        storm_mask.astype(int),
        cmap="Reds"
    )

    plt.colorbar(
        label="Temperature (K)"
    )

    plt.title(
        "INSAT Cloud Top Temperature"
    )

    plt.axis("off")
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
        "Saved JSON:",
        len(storm_cells)
    )