import subprocess

print("Downloading latest INSAT...")

subprocess.run([
    "python",
    "download_latest_insat.py"
])

print("Generating thunderstorm alerts...")

subprocess.run([
    "python",
    "convert_h5_to_png.py"
])

print("Done")