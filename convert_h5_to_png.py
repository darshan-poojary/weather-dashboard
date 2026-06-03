import h5py
import numpy as np
import matplotlib.pyplot as plt
from pathlib import Path

# =========================
# H5 FILE LOCATION
# =========================

H5_FOLDER = Path(
    r"C:\Users\DARSHAN POOJARY\OneDrive\Desktop\MOSDAC\downloads\3SIMG_L1B_STD\2026\25MAY"
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

latest_file = sorted(files)[-1]

print(
    "Processing:",
    latest_file.name
)

# =========================
# OPEN H5 FILE
# =========================

with h5py.File(
    latest_file,
    "r"
) as h5:

    print("\nAvailable datasets:\n")

    for key in h5.keys():
        print(
            key,
            type(h5[key])
        )

    # =========================
    # LOAD DATASET
    # =========================

    dataset = h5.get(
        "IMG_TIR1"
    )

    if dataset is None:
        print(
            "Dataset not found"
        )
        exit()

    # =========================
    # CONVERT TO NUMPY
    # =========================

    data = np.array(dataset)[0]

    print(
        "\nOriginal Shape:",
        data.shape
    )

    print(
        "Min:",
        np.min(data)
    )

    print(
        "Max:",
        np.max(data)
    )

    # =========================
    # CLEAN INVALID VALUES
    # =========================

    data = np.nan_to_num(data)

    data[data < 0] = 0

    # =========================
    # CROP INDIA REGION
    # =========================

    # data = data[
    #     650:1750,
    #     1050:1950
    # ]

    # =========================
    # CREATE IMAGE
    # =========================

    plt.figure(
        figsize=(8, 8)
    )

    plt.imshow(
        data,
        cmap="gray",
  )

    plt.axis("off")

    # =========================
    # SAVE PNG
    # =========================

    output_file = PNG_FOLDER / (
        latest_file.stem
        + ".png"
    )

    plt.savefig(
        output_file,
        bbox_inches="tight",
        pad_inches=0
    )

    print(
        "\nSaved:",
        output_file
    )