function generateMosdacPath(
  utcDatetime: string
) {
  const date =
    new Date(utcDatetime);

  // IMPORTANT:
  // Always use PREVIOUS valid
  // 15-minute slot

  let minutes =
  date.getUTCMinutes();

// CUSTOM GROUPING

if (
  minutes >= 15 &&
  minutes <= 44
) {
  minutes = 15;
} else {
  // 45 → 59
  // 00 → 14

  minutes = 45;

  // IMPORTANT:
  // if current mins are
  // 00 → 14,
  // go back 1 hour

  if (
    date.getUTCMinutes() <= 14
  ) {
    date.setUTCHours(
      date.getUTCHours() - 1
    );
  }
}
  date.setUTCMinutes(
    minutes
  );

  date.setUTCSeconds(0);

  date.setUTCMilliseconds(0);

  const year =
    date.getUTCFullYear();

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

  const month =
    months[
      date.getUTCMonth()
    ];

  const day = String(
    date.getUTCDate()
  ).padStart(2, "0");

  const hours = String(
    date.getUTCHours()
  ).padStart(2, "0");

  const mins = String(
    minutes
  ).padStart(2, "0");

  const folder =
    `${day}${month}`;

  const filename =
    `3RIMG_${day}${month}${year}_${hours}${mins}_L1B_STD_V01R00.h5`;

  return `https://www.mosdac.gov.in/live_data/wms/live3RL1BSTD4km/products/Insat3r/3R_IMG/${year}/${folder}/${filename}`;
}

export function buildMosdacUrl(
  params: URLSearchParams
) {
  // Get datetime from frontend

  const datetime =
    params.get("datetime");

  // LIVE MODE fallback

  const utcDatetime =
    datetime ||
    "2026-05-29T06:15:00Z";

  // Generate dynamic path

  const baseUrl =
    generateMosdacPath(
      utcDatetime
    );

  const url =
    new URL(baseUrl);

  // Copy incoming params

  params.forEach((value, key) => {
    if (
      key !== "_t" &&
      key !== "datetime"
    ) {
      url.searchParams.set(
        key.toUpperCase(),
        value
      );
    }
  });

  // Required WMS params

  url.searchParams.set(
    "SERVICE",
    "WMS"
  );

  url.searchParams.set(
    "REQUEST",
    "GetMap"
  );

  url.searchParams.set(
    "VERSION",
    "1.3.0"
  );

  url.searchParams.set(
    "FORMAT",
    "image/png"
  );

  url.searchParams.set(
    "TRANSPARENT",
    "true"
  );

  // Stable working scaling

  url.searchParams.set(
    "COLORSCALERANGE",
    "462,946"
  );

  url.searchParams.set(
    "BELOWMINCOLOR",
    "extend"
  );

  url.searchParams.set(
    "ABOVEMAXCOLOR",
    "extend"
  );

  // Preserve palette rendering

  url.searchParams.set(
    "STYLES",
    params.get("styles") ||
      "boxfill/greyscale"
  );

  console.log(
    "MOSDAC URL:"
  );

  console.log(
    url.toString()
  );

  return url.toString();
}
export function getFallbackDatetime(
  utcDatetime: string
) {
  const date =
    new Date(utcDatetime);

  date.setUTCMinutes(
    date.getUTCMinutes() - 30
  );

  return date.toISOString();
}