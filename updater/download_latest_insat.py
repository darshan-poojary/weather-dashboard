import os
import requests
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DOWNLOAD_FOLDER = ROOT_DIR / "h5-data"
DOWNLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

# Configure environment variables locally or repository secrets in CI.
DATASET_ID = "3SIMG_L1B_STD"
DOWNLOAD_TOKEN_URL = "https://mosdac.gov.in/download_api/gettoken"
DATASETS_URL = "https://mosdac.gov.in/apios/datasets.json"
DOWNLOAD_URL = "https://mosdac.gov.in/download_api/download"
CHUNK_SIZE = 1024 * 1024
REQUEST_TIMEOUT = (15, 120)


def fetch_access_token(username: str, password: str) -> str:
    response = requests.post(
        DOWNLOAD_TOKEN_URL,
        json={"username": username, "password": password},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def find_latest_dataset(session: requests.Session) -> tuple[str, str]:
    response = session.get(
        DATASETS_URL,
        params={"datasetId": DATASET_ID, "count": 1},
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()

    data = response.json()
    entries = data.get("entries") or []

    if not entries:
        raise RuntimeError("No files found")

    latest = entries[0]
    return latest["id"], latest["identifier"]


def download_file(session: requests.Session, access_token: str, file_id: str, filename: str) -> Path:
    if Path(filename).name != filename or "\\" in filename or not filename.lower().endswith(".h5"):
        raise ValueError("MOSDAC returned an invalid H5 filename")

    output_file = DOWNLOAD_FOLDER / filename
    partial_file = output_file.with_suffix(".h5.part")
    try:
        with session.get(
            DOWNLOAD_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            params={"id": file_id},
            stream=True,
            timeout=REQUEST_TIMEOUT,
        ) as response:
            response.raise_for_status()
            with partial_file.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                    if chunk:
                        handle.write(chunk)
        if partial_file.stat().st_size == 0:
            raise RuntimeError("MOSDAC returned an empty H5 download")
        partial_file.replace(output_file)
    finally:
        partial_file.unlink(missing_ok=True)

    return output_file


def main() -> None:
    username = os.environ.get("MOSDAC_USERNAME", "").strip()
    password = os.environ.get("MOSDAC_PASSWORD", "")
    if not username or not password:
        raise RuntimeError("Set MOSDAC_USERNAME and MOSDAC_PASSWORD before running the updater")

    print("Logging in...")
    access_token = fetch_access_token(username, password)
    print("Login successful")

    print("Searching latest file...")
    with requests.Session() as session:
        file_id, filename = find_latest_dataset(session)
        print("Latest:", filename)
        print("Downloading...")
        output_path = download_file(session, access_token, file_id, filename)

    print("Saved:", output_path)


if __name__ == "__main__":
    main()
