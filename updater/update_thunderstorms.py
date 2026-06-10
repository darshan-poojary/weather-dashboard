import subprocess
from pathlib import Path

script_dir = Path(__file__).resolve().parent

print("Downloading latest INSAT...")

result = subprocess.run([
    "python",
    str(script_dir / "download_latest_insat.py")
])

if result.returncode != 0:
    print(
        "Download failed. Stopping."
    )
    exit(1)

print("Generating thunderstorm alerts...")

subprocess.run([
    "python",
    str(script_dir / "convert_h5_to_png.py")
])

print("Done")