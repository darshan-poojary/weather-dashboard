import { buildMosdacUrl, fetchMosdacPng, snapToSlotDate } from "../../../lib/mosdac";

const MAX_CANDIDATES = 6;
const SLOT_MS = 30 * 60 * 1000;
const LAYERS = new Set(["IMG_TIR1", "IMG_TIR2", "IMG_MIR"]);
const STYLES = new Set(["boxfill/greyscale", "boxfill/rainbow", "boxfill/redblue", "boxfill/ferret"]);

type LatestFrame = { datetime: string | null; probedBack: number; available: boolean };
// These maps have at most 12 entries (the supported layer/palette combinations).
const cache = new Map<string, { value: LatestFrame; expires: number }>();
const pending = new Map<string, Promise<LatestFrame>>();

async function findLatest(layers: string, styles: string): Promise<LatestFrame> {
  const newestSlot = snapToSlotDate(new Date());
  // Probe tiny images in parallel so an outage takes at most six seconds,
  // rather than six successive network timeouts. Always select the newest hit.
  const candidates = await Promise.all(
    Array.from({ length: MAX_CANDIDATES }, async (_, i) => {
      const datetime = new Date(newestSlot.getTime() - i * SLOT_MS).toISOString();
      const params = new URLSearchParams({
        datetime, layers, styles,
        crs: "EPSG:4326", bbox: "5,65,38,98", width: "48", height: "48",
      });
      const image = await fetchMosdacPng(buildMosdacUrl(params), 6000);
      return image ? { datetime, probedBack: i, available: true } : null;
    })
  );
  return candidates.find((candidate) => candidate !== null)
    ?? { datetime: null, probedBack: -1, available: false };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layers = searchParams.get("layers") || "IMG_TIR1";
  const styles = searchParams.get("styles") || "boxfill/greyscale";
  if (!LAYERS.has(layers) || !STYLES.has(styles)) {
    return Response.json({ error: "Unsupported layer or palette" }, { status: 400 });
  }

  const key = `${layers}:${styles}`;
  let result = cache.get(key);
  if (!result || result.expires <= Date.now()) {
    let work = pending.get(key);
    if (!work) {
      work = findLatest(layers, styles).then((value) => {
        cache.set(key, { value, expires: Date.now() + (value.available ? 120_000 : 15_000) });
        return value;
      }).finally(() => pending.delete(key));
      pending.set(key, work);
    }
    const value = await work;
    result = { value, expires: cache.get(key)!.expires };
  }

  return Response.json(result.value, {
    status: result.value.available ? 200 : 503,
    headers: {
      "Cache-Control": result.value.available
        ? `public, max-age=${Math.max(0, Math.floor((result.expires - Date.now()) / 1000))}`
        : "no-store",
    },
  });
}
