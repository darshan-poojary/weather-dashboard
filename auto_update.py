import subprocess
import time

while True:

    print("\nUpdating thunderstorms...\n")

    subprocess.run(
        ["python", "update_thunderstorms.py"]
    )

    print(
        "\nWaiting 30 minutes...\n"
    )

    time.sleep(1800)