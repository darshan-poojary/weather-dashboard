/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS regression harness. */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

// Compile the actual route modules in memory, without starting Next.js or
// requiring a second TypeScript runner dependency. Each load isolates caches.
function loadTs(filename, modules = new Map()) {
  const path = resolve(__dirname, "..", filename.endsWith(".ts") ? filename : `${filename}.ts`);
  if (modules.has(path)) return modules.get(path).exports;
  const loadedModule = { exports: {} };
  modules.set(path, loadedModule);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => name.startsWith(".")
    ? loadTs(resolve(dirname(path), name), modules)
    : require(name);
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAaX2RaAAAAAASUVORK5CYII=",
  "base64"
);
const png = () => new Response(PNG, { headers: { "Content-Type": "image/png" } });
const wmsRequest = (params = {}) => new Request(`http://localhost/api/mosdac-wms?${new URLSearchParams({
  layers: "IMG_TIR1", styles: "boxfill/greyscale", crs: "EPSG:4326",
  bbox: "5,65,38,98", width: "256", height: "256", ...params,
})}`);

test("MOSDAC slots and product paths handle hour/day/year rollover", () => {
  const { snapToSlotDate, buildMosdacUrl, getFallbackDatetime } = loadTs("src/lib/mosdac.ts");
  for (const [input, expected] of [
    ["2026-01-01T00:05:59Z", "2025-12-31T23:45:00.000Z"],
    ["2026-09-30T18:14:59Z", "2026-09-30T17:45:00.000Z"],
    ["2026-09-30T18:15:00Z", "2026-09-30T18:15:00.000Z"],
    ["2026-09-30T18:44:59Z", "2026-09-30T18:15:00.000Z"],
    ["2026-09-30T18:45:00Z", "2026-09-30T18:45:00.000Z"],
  ]) assert.equal(snapToSlotDate(new Date(input)).toISOString(), expected);

  const url = new URL(buildMosdacUrl(new URLSearchParams({
    DATETIME: "2026-01-01T00:05:00Z", STYLES: "boxfill/rainbow", _t: "123",
  })));
  assert.match(url.pathname, /2025\/31DEC\/3RIMG_31DEC2025_2345_/);
  assert.equal(url.searchParams.get("STYLES"), "boxfill/rainbow");
  assert.equal(url.searchParams.has("DATETIME"), false);
  assert.equal(url.searchParams.has("_T"), false);
  assert.equal(getFallbackDatetime("2026-01-01T00:15:00Z"), "2025-12-31T23:45:00.000Z");
  assert.doesNotThrow(() => getFallbackDatetime(""));
});

test("WMS works without datetime and caches explicit frames", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => png());
  const { GET } = loadTs("src/app/api/mosdac-wms/route.ts");
  const live = await GET(wmsRequest());
  assert.equal(live.status, 200);
  assert.match(live.headers.get("cache-control"), /max-age=120/);
  assert.doesNotMatch(calls.mock.calls[0].arguments[0], /NaN|Invalid/);
  const history = await GET(wmsRequest({ datetime: "2026-09-30T16:45:00Z" }));
  assert.equal(history.status, 200);
  assert.match(history.headers.get("cache-control"), /max-age=86400/);
  assert.deepEqual(Buffer.from(await history.arrayBuffer()), PNG);
});

test("WMS rejects invalid requests before contacting MOSDAC", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => png());
  const { GET } = loadTs("src/app/api/mosdac-wms/route.ts");
  for (const params of [{ datetime: "bad-date" }, { bbox: "" }, { width: "99999" }, { height: "0" }]) {
    assert.equal((await GET(wmsRequest(params))).status, 400);
  }
  assert.equal(calls.mock.callCount(), 0);
});

test("missing WMS history returns an undecodable image error and is never cached or replaced with an older frame", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  const { GET } = loadTs("src/app/api/mosdac-wms/route.ts");
  const response = await GET(wmsRequest({ datetime: "2026-09-30T16:45:00Z" }));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.equal(response.headers.get("x-mosdac-available"), "false");
  assert.equal(calls.mock.callCount(), 1);
  const body = await response.text();
  assert.equal(JSON.parse(body).available, false);
  assert.notDeepEqual(Buffer.from(body).subarray(0, 8), PNG.subarray(0, 8));
});

test("HTTP 200 XML errors and fake PNG responses cannot become cached map tiles", async (t) => {
  const { GET } = loadTs("src/app/api/mosdac-wms/route.ts");
  for (const contentType of ["application/xml", "image/png"]) {
    t.mock.method(globalThis, "fetch", async () => new Response("<ServiceException/>", {
      headers: { "Content-Type": contentType },
    }));
    const response = await GET(wmsRequest());
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");
    t.mock.restoreAll();
  }
});

test("PNG fetch timeout remains active through body consumption", async (t) => {
  let signal;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    signal = options.signal;
    return {
      ok: true,
      headers: new Headers({ "Content-Type": "image/png" }),
      arrayBuffer: () => new Promise((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error("timeout was not enforced")), 500);
        signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(signal.reason);
        }, { once: true });
      }),
    };
  });
  const { fetchMosdacPng } = loadTs("src/lib/mosdac.ts");
  assert.equal(await fetchMosdacPng("https://www.mosdac.gov.in/test", 20), null);
  assert.equal(signal.aborted, true);
});

test("latest probes run concurrently, pick newest published slot, and share cached work", async (t) => {
  let count = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  t.mock.method(globalThis, "fetch", async () => {
    const index = count++;
    if (count === 6) release();
    await gate;
    return index < 2 ? new Response("not ready", { status: 404 }) : png();
  });
  const { GET } = loadTs("src/app/api/mosdac-latest/route.ts");
  const request = new Request("http://localhost/api/mosdac-latest");
  const [one, two] = await Promise.all([GET(request), GET(request)]);
  assert.equal(one.status, 200);
  const value = await one.json();
  assert.equal(value.probedBack, 2);
  assert.equal(value.available, true);
  assert.deepEqual(await two.json(), value);
  assert.deepEqual(await (await GET(request)).json(), value);
  assert.equal(count, 6, "concurrent and repeated requests must not start another probe batch");
});

test("latest reports unavailable without inventing a frame, and rejects unknown layers", async (t) => {
  const calls = t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  const { GET } = loadTs("src/app/api/mosdac-latest/route.ts");
  const response = await GET(new Request("http://localhost/api/mosdac-latest"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { datetime: null, probedBack: -1, available: false });
  assert.equal((await GET(new Request("http://localhost/api/mosdac-latest?layers=unsupported"))).status, 400);
  assert.equal(calls.mock.callCount(), 6);
});

test("alerts accepts prefixed GeoJSON but reports upstream/malformed responses as unavailable", async (t) => {
  const { GET } = loadTs("src/app/api/mosdac-alerts/route.ts");
  const collection = { type: "FeatureCollection", features: [] };
  t.mock.method(globalThis, "fetch", async () => new Response(`30-SEP-2026$16:45$${JSON.stringify(collection)}`));
  const response = await GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), collection);
  t.mock.restoreAll();
  for (const upstream of [
    () => new Response("down", { status: 503 }),
    () => new Response("<html>maintenance</html>"),
    () => new Response('{"features":"bad"}'),
  ]) {
    t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async () => upstream());
    const unavailable = await GET();
    assert.equal(unavailable.status, 502);
    assert.equal((await unavailable.json()).available, false);
    t.mock.restoreAll();
  }
});
