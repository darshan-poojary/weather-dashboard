import { MOSDAC_HEADERS } from "../../../lib/mosdac";

export async function GET() {
  try {
    const response = await fetch(
      "https://www.mosdac.gov.in/live/backend/rain_cloudburst.php",
      { headers: MOSDAC_HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`MOSDAC returned HTTP ${response.status}`);
    }

    const text = await response.text();

    // The upstream response occasionally has stray characters around the JSON,
    // so slice from the first "{" to the last "}" before parsing — server-side,
    // so the client can just call res.json().
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error("MOSDAC returned no alert data");
    }

    const parsed = JSON.parse(text.slice(start, end + 1));
    if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
      throw new Error("MOSDAC returned invalid GeoJSON");
    }
    return Response.json(parsed, {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch (error) {
    console.error("MOSDAC alerts fetch failed:", error);
    return Response.json(
      { type: "FeatureCollection", features: [], available: false },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
