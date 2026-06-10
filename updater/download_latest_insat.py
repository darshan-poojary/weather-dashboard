# download_latest_insat.py

import requests
from pathlib import Path

# =========================
# CONFIG
# =========================

USERNAME = "darshanpoojary"
PASSWORD = "Darshan05#"

DATASET_ID = "3SIMG_L1B_STD"

DOWNLOAD_FOLDER = Path(
    "./h5-data"
)

DOWNLOAD_FOLDER.mkdir(
    parents=True,
    exist_ok=True
)

# =========================
# LOGIN
# =========================

print("Logging in...")

login = requests.post(
    "https://mosdac.gov.in/download_api/gettoken",
    json={
        "username": USERNAME,
        "password": PASSWORD,
    },
)

login.raise_for_status()

tokens = login.json()

access_token = tokens[
    "access_token"
]

print("Login successful")

# =========================
# SEARCH LATEST FILE
# =========================

print("Searching latest file...")

search = requests.get(
    "https://mosdac.gov.in/apios/datasets.json",
    params={
        "datasetId": DATASET_ID,
        "count": 1,
    },
)

search.raise_for_status()

data = search.json()

entries = data["entries"]

if not entries:
    raise Exception(
        "No files found"
    )

latest = entries[0]

file_id = latest["id"]

filename = latest[
    "identifier"
]

print(
    "Latest:",
    filename
)

# =========================
# DOWNLOAD
# =========================

print("Downloading...")

download = requests.get(
    "https://mosdac.gov.in/download_api/download",
    headers={
        "Authorization":
        f"Bearer {access_token}",

        "User-Agent":
        "Mozilla/5.0",

        "Accept":
        "*/*",

        "Referer":
        "https://mosdac.gov.in/"
    },
    params={
        "fileId": file_id,
    },
)

print("Status:", download.status_code)
print("Headers:", download.headers)

if download.status_code != 200:
    print(download.text[:1000])
    raise Exception(
        f"Download failed: {download.status_code}"
    )

output_file = (
    DOWNLOAD_FOLDER
    / filename
)

temp_file = str(output_file) + ".part"

with open(
    temp_file,
    "wb"
) as f:

    for chunk in download.iter_content(
        chunk_size=1024 * 1024
    ):
        if chunk:
            f.write(chunk)

import os

os.replace(
    temp_file,
    output_file
)

print(
    "Saved:",
    output_file
)