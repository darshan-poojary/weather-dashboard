import requests
from pathlib import Path
from datetime import datetime, timedelta

# =========================
# OUTPUT FOLDER
# =========================

DOWNLOAD_FOLDER = Path(
    r"C:\Users\DARSHAN POOJARY\weather-dashboard\h5-data"
)

DOWNLOAD_FOLDER.mkdir(
    parents=True,
    exist_ok=True
)

# =========================
# GET CURRENT UTC TIME
# =========================

now = datetime.utcnow()

# INSAT images every 30 mins
minute = "00" if now.minute < 30 else "30"

timestamp = now.strftime(
    f"%d%b%Y_%H{minute}"
).upper()

date_folder = now.strftime(
    "%d%b"
).upper()

year = now.strftime("%Y")

# =========================
# BUILD MOSDAC URL
# =========================

filename = (
    f"3SIMG_{timestamp}_L1B_STD_V01R00.h5"
)

url = (
    "https://www.mosdac.gov.in/"
    f"live_data/wms/live3RL1BSTD4km/products/"
    f"Insat3r/3R_IMG/{year}/{date_folder}/"
    f"{filename}"
)

print(
    "Downloading:",
    filename
)

print(
    "URL:",
    url
)

# =========================
# DOWNLOAD FILE
# =========================

response = requests.get(url)

if response.status_code == 200:

    output_path = DOWNLOAD_FOLDER / filename

    with open(
        output_path,
        "wb"
    ) as f:
        f.write(response.content)

    print(
        "Saved:",
        output_path
    )

else:

    print(
        "Failed:",
        response.status_code
    )