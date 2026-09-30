import { expect, test, type Page } from "@playwright/test";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAaX2RaAAAAAASUVORK5CYII=", "base64");
const datetime = "2026-09-30T16:45:00.000Z";

async function mockWeather(page: Page, unavailable = false) {
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: png }));
  await page.route("**/api/mosdac-wms?**", (route) => route.fulfill(unavailable
    ? { status: 502, json: { error: "Satellite imagery unavailable" } }
    : { contentType: "image/png", body: png }));
  await page.route("**/api/mosdac-latest?**", (route) => route.fulfill({ status: unavailable ? 503 : 200, json: { datetime: unavailable ? null : datetime } }));
  await page.route("**/api/mosdac-alerts", (route) => route.fulfill({ json: { features: [] } }));
  await page.route("**/thunderstorm-cells.json", (route) => route.fulfill({ json: [{ lat: 20, lon: 80, temp: 190, severity: "Strong", count: 5, radius_km: 12, updated: "2026-07-14T18:53:00Z" }] }));
}

test("map uses key-free tiles and defers unused data; controls update actual WMS requests", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await mockWeather(page);
  await page.goto("/");
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.locator('img[src*="tile.openstreetmap.org"]')).not.toHaveCount(0);
  await expect(page.locator('img[src*="datetime=2026-09-30"]')).not.toHaveCount(0);
  expect(requests.some((url) => url.includes("cartocdn"))).toBe(false);
  expect(requests.some((url) => /india-districts|cloud-grid/.test(url))).toBe(false);
  const wms = requests.filter((url) => url.includes("/api/mosdac-wms?"));
  expect(wms.every((url) => new URL(url).searchParams.has("bbox"))).toBe(true);
  await page.getByLabel("Channel", { exact: true }).selectOption("IMG_TIR2");
  await page.getByLabel("Palette", { exact: true }).selectOption("rainbow");
  await expect(page.locator('img[src*="layers=IMG_TIR2"][src*="rainbow"]')).not.toHaveCount(0);
  await page.getByLabel("Show Overlay", { exact: true }).uncheck();
  await expect(page.locator('img[src*="/api/mosdac-wms"]')).toHaveCount(0);
  await page.getByLabel("Show Overlay", { exact: true }).check();
  await expect(page.locator('img[src*="/api/mosdac-wms"]')).not.toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Storm data is outdated");
  expect(errors).toEqual([]);
});

for (const timezoneId of ["Asia/Kolkata", "America/New_York"]) {
  test(`history interprets IST once in ${timezoneId}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    await mockWeather(page);
    await page.goto("/");
    await page.getByRole("button", { name: "HISTORY", exact: true }).click();
    await page.getByLabel("Date (IST)").fill("2026-09-30");
    await page.getByLabel("Time (IST)").fill("22:15");
    await expect(page.locator('img[src*="datetime=2026-09-30T16%3A45"]')).not.toHaveCount(0);
    await expect(page.getByText("30-SEP-2026 16:45 UTC", { exact: true })).toHaveCount(2);
    await context.close();
  });
}

test("animation advances and stops when entering history", async ({ page }) => {
  await mockWeather(page);
  await page.goto("/");
  await page.getByRole("button", { name: "ANIMATION", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByLabel("Animation frame", { exact: true })).toHaveValue("0", { timeout: 10_000 });
  await page.getByRole("button", { name: "HISTORY", exact: true }).click();
  await page.getByRole("button", { name: "ANIMATION", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("upstream failures leave base map usable and show unavailable state", async ({ page }) => {
  await mockWeather(page, true);
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("Latest frame unavailable");
  await expect(page.getByRole("status")).toContainText("Satellite imagery unavailable");
  await expect(page.locator('img[src*="tile.openstreetmap.org"]')).not.toHaveCount(0);
});

test("cloud inspection loads on demand and district boundaries load only when zoomed in", async ({ page }) => {
  const errors: string[] = [];
  let cloudRequests = 0;
  let districtRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().includes("india-districts")) districtRequests += 1; });
  await mockWeather(page);
  const radians = Math.PI / 180;
  const centerLat = Math.atan(Math.sinh((Math.asinh(Math.tan(5 * radians)) + Math.asinh(Math.tan(38 * radians))) / 2)) / radians;
  await page.route("**/cloud-grid.json", (route) => {
    cloudRequests += 1;
    return route.fulfill({ json: [{ gridLat: centerLat, gridLon: 81.5, cloudCover: 70, temp: 240 }] });
  });
  await page.goto("/");
  const map = page.locator(".leaflet-container");
  await expect(map).toBeVisible();
  expect(cloudRequests).toBe(0);
  expect(districtRequests).toBe(0);
  await map.click({ position: { x: 640, y: 360 } });
  await expect(page.getByRole("button", { name: "Close cloud cover details" })).toBeVisible();
  await page.getByRole("button", { name: "Close cloud cover details" }).click();
  await map.click({ position: { x: 640, y: 360 } });
  await expect(page.getByRole("button", { name: "Close cloud cover details" })).toBeVisible();
  expect(cloudRequests).toBe(1);
  await page.getByRole("button", { name: "Close cloud cover details" }).click();
  await map.focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("+");
    await page.waitForTimeout(350);
  }
  await expect.poll(() => districtRequests).toBe(1);
  expect(errors).toEqual([]);
});

test("mobile controls and legends remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockWeather(page);
  await page.goto("/");
  const controls = page.getByRole("region", { name: "Weather map controls" });
  await expect(controls).toBeVisible();
  expect((await controls.boundingBox())!.y).toBeGreaterThanOrEqual(72);
  await page.getByRole("button", { name: "Hide controls", exact: true }).click();
  await page.getByRole("button", { name: "Show temperature legend", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hide temperature legend", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show weather alerts legend", exact: true }).click();
  await expect(page.getByRole("button", { name: "Show temperature legend", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show controls", exact: true }).click();
  await expect(controls).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
