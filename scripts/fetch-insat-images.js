const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(
  __dirname,
  "..",
  "public",
  "insat-cache"
);

async function fetchLatestINSAT() {
  try {
    console.log(
      "Fetching latest INSAT image..."
    );

    // CURRENT UTC TIME
    const now = new Date();

    // ROUND TO PREVIOUS 15 MIN SLOT
    const minutes =
      Math.floor(
        now.getUTCMinutes() / 15
      ) * 15;

// MOSDAC DELAY
now.setUTCMinutes(
  minutes - 45
);

    now.setUTCSeconds(0);

    // FORMAT DATE
    const dd = String(
      now.getUTCDate()
    ).padStart(2, "0");

    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC",
    ];

    const mon =
      months[
        now.getUTCMonth()
      ];

    const yyyy =
      now.getUTCFullYear();

    const hh = String(
      now.getUTCHours()
    ).padStart(2, "0");

    const mm = String(
      now.getUTCMinutes()
    ).padStart(2, "0");

    // MOSDAC DATE FORMAT
    const mosdacDate =
      `${dd}${mon}${yyyy}`;

    const time =
      `${hh}${mm}`;

    // IMAGE URL
    const imageUrl =
      `https://www.mosdac.gov.in/live_data/wms/live3RL1BSTD4km/products/Insat3r/3R_IMG/${yyyy}/${dd}${mon}/3RIMG_${mosdacDate}_${time}_L1B_STD_V01R00.h5?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=IMG_TIR1&COLORSCALERANGE=265,929&BELOWMINCOLOR=extend&ABOVEMAXCOLOR=extend&transparent=true&format=image/png&STYLES=boxfill/greyscale&WIDTH=2048&HEIGHT=2048&CRS=EPSG:3857&BBOX=5009377,2504688,6261721,3757032`;

    console.log(
      imageUrl
    );

    // FETCH IMAGE
    const response =
      await fetch(imageUrl);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer()
      );

    // FILE NAME
    const filename =
      `${yyyy}${String(
        now.getUTCMonth() + 1
      ).padStart(
        2,
        "0"
      )}${dd}_${hh}${mm}.png`;

    const filepath =
      path.join(
        CACHE_DIR,
        filename
      );

    // SAVE FILE
    fs.writeFileSync(
      filepath,
      buffer
    );

    console.log(
      `Saved: ${filename}`
    );
  } catch (err) {
    console.error(err);
  }
}

fetchLatestINSAT();