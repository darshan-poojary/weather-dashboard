import subprocess
from pathlib import Path

script_dir = Path(__file__).resolve().parent

print("Downloading latest INSAT...")

subprocess.run([
    "python",
    str(script_dir / "download_latest_insat.py")
])

print("Generating thunderstorm alerts...")

subprocess.run([
    "python",
    str(script_dir / "convert_h5_to_png.py")
])

print("Pushing updates...")

subprocess.run([
    "python",
    str(script_dir / "auto_commit.py")
])

print("Done")