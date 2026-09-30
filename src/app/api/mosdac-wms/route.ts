import { buildMosdacUrl, fetchMosdacPng } from "../../../lib/mosdac";

function unavailable(status: number) {
  // A valid image can fire onload even for an HTTP error. Return non-image
  // data so Leaflet reliably fires tileerror and applies its transparent tile.
  return Response.json({ available: false, error: status === 400 ? "Invalid map request" : "Satellite imagery unavailable" }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-MOSDAC-Available": "false",
    },
  });
}

export async function GET(request: Request) {
  const params = new URLSearchParams();
  new URL(request.url).searchParams.forEach((value, key) => {
    params.set(key.toLowerCase(), value);
  });

  const datetime = params.get("datetime");
  if (datetime !== null && Number.isNaN(new Date(datetime).getTime())) {
    return unavailable(400);
  }

  // GetMap needs real tile bounds; incomplete preload requests only waste work.
  const bounds = params.get("bbox")?.split(",");
  const width = Number(params.get("width"));
  const height = Number(params.get("height"));
  if (
    bounds?.length !== 4 || bounds.some((value) => !value.trim() || !Number.isFinite(Number(value))) ||
    !Number.isInteger(width) || width < 1 || width > 1024 ||
    !Number.isInteger(height) || height < 1 || height > 1024
  ) {
    return unavailable(400);
  }

  const image = await fetchMosdacPng(buildMosdacUrl(params));
  if (!image) return unavailable(502);

  // Never substitute another timestamp: history and animation must represent
  // exactly the requested frame. Missing frames can become available later.
  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": datetime
        ? "public, max-age=86400, s-maxage=86400"
        : "public, max-age=120, s-maxage=120",
      "X-MOSDAC-Available": "true",
    },
  });
}
