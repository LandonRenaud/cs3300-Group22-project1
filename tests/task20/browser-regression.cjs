const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { startBrowserFixture } = require("./browser-fixture.cjs");

let fixture;

before(async () => {
  fixture = await startBrowserFixture();
});

after(async () => {
  await fixture.close();
});

async function browserPage(t, { authenticated = true } = {}) {
  const context = await fixture.createContext({ authenticated });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  t.after(async () => {
    assert.deepEqual(errors, [], `browser page errors: ${errors.join("; ")}`);
    await context.close();
  });
  return page;
}

async function openHome(page) {
  await page.goto(`${fixture.url}/homepage.html`);
  await page.waitForFunction(() => document.body.hidden === false);
}

async function submitSearch(page, { location = "Atlanta", keyword = "coffee" } = {}) {
  await page.locator("#location").fill(location);
  await page.locator("#place-keyword").fill(keyword);
  await page.locator(".map-search-button").click();
}

async function waitForSearch(page, count) {
  await page.waitForFunction(expected => window.__fixtureState.searches.length === expected, count);
}

async function waitForResult(page, name) {
  await page.waitForFunction(expected => {
    const result = document.querySelector(".location-result-button strong");
    return result?.textContent === expected;
  }, name);
}

test("unauthenticated users are redirected away from the protected map page", async t => {
  const page = await browserPage(t, { authenticated: false });
  await page.goto(`${fixture.url}/homepage.html`);
  await page.waitForURL("**/landingpage.html");
  assert.match(new URL(page.url()).pathname, /\/landingpage\.html$/);
});

test("authenticated users can submit searches and change Location Type through real DOM events", async t => {
  const page = await browserPage(t);
  await openHome(page);
  await page.locator(".advanced-settings summary").click();
  await page.locator("#place-keyword").fill("coffee");
  await page.locator("#radius").fill("1200");
  await page.locator("#price").selectOption("2");
  await page.locator("#open-now").check();
  await submitSearch(page);
  await waitForSearch(page, 1);
  await waitForResult(page, "Cafe Result");

  const initial = await page.evaluate(() => ({
    request: window.__fixtureState.searches[0],
    markers: window.__fixtureState.markers.filter(marker => marker.map).map(marker => marker.title),
    history: document.querySelectorAll(".search-history-entry").length
  }));
  assert.equal(initial.request.keyword, "coffee");
  assert.equal(initial.request.radius, 1200);
  assert.equal(initial.request.minPriceLevel, 2);
  assert.equal(initial.request.openNow, true);
  assert.deepEqual(initial.markers, ["Atlanta", "Cafe Result"]);
  assert.equal(initial.history, 1);

  await page.evaluate(() => {
    const map = document.querySelector(".google-map").innerMap;
    map.center = { lat: 34, lng: -85 };
    map.zoom = 10;
  });
  await page.locator("#place-type").selectOption("park");
  await waitForSearch(page, 2);
  await waitForResult(page, "Park Result");

  const refreshed = await page.evaluate(() => ({
    request: window.__fixtureState.searches[1],
    markers: window.__fixtureState.markers.filter(marker => marker.map).map(marker => marker.title),
    map: document.querySelector(".google-map").innerMap,
    history: document.querySelectorAll(".search-history-entry").length
  }));
  assert.equal(refreshed.request.type, "park");
  assert.equal(refreshed.request.keyword, "coffee");
  assert.equal(refreshed.request.radius, 1200);
  assert.equal(refreshed.request.minPriceLevel, 2);
  assert.equal(refreshed.request.openNow, true);
  assert.deepEqual(refreshed.request.location, { lat: 33.77, lng: -84.39 });
  assert.deepEqual(refreshed.markers, ["Atlanta", "Park Result"]);
  assert.deepEqual(refreshed.map.center, { lat: 34, lng: -85 });
  assert.equal(refreshed.map.zoom, 10);
  assert.equal(refreshed.history, 1);
});

test("result-list clicks and map-marker clicks select the same location", async t => {
  const page = await browserPage(t);
  await openHome(page);
  await submitSearch(page, { location: "33.77, -84.39" });
  await waitForSearch(page, 1);
  await waitForResult(page, "Cafe Result");

  await page.locator('[data-location-id="fixture-cafe"] .location-result-button').click();
  await page.waitForFunction(() => document.querySelector(".location-details").hidden === false);
  assert.equal(await page.locator("#location-details-heading").textContent(), "Cafe Result");
  assert.equal(await page.locator('[data-location-id="fixture-cafe"]').getAttribute("aria-current"), "true");

  await page.locator(".location-details-close").click();
  await page.evaluate(() => {
    const marker = window.__fixtureState.markers.find(candidate => candidate.title === "Cafe Result" && candidate.map);
    marker.dispatchEvent(new Event("gmp-click"));
  });
  await page.waitForFunction(() => document.querySelector(".location-details").hidden === false);
  assert.equal(await page.locator("#location-details-heading").textContent(), "Cafe Result");
  assert.equal(await page.locator('[data-location-id="fixture-cafe"]').getAttribute("aria-current"), "true");
});

test("search history survives reload and replays through the real history controls", async t => {
  const page = await browserPage(t);
  await openHome(page);
  await page.locator(".advanced-settings summary").click();
  await page.locator("#place-keyword").fill("coffee");
  await page.locator("#radius").fill("1250");
  await page.locator("#price").selectOption("2");
  await page.locator("#place-type").selectOption("cafe");
  await submitSearch(page, { location: "Atlanta" });
  await waitForSearch(page, 1);
  await waitForResult(page, "Cafe Result");
  assert.equal(await page.locator(".search-history-entry").count(), 1);

  await page.reload();
  await page.waitForFunction(() => document.body.hidden === false);
  await page.locator(".search-history summary").click();
  assert.equal(await page.locator(".search-history-entry").count(), 1);
  await page.locator(".search-history-replay").click();
  await waitForSearch(page, 1);
  await waitForResult(page, "Cafe Result");
  assert.equal(await page.locator("#place-keyword").inputValue(), "coffee");
  assert.equal(await page.locator("#radius").inputValue(), "1250");
  assert.equal(await page.locator("#price").inputValue(), "2");
  assert.equal(await page.locator("#place-type").inputValue(), "cafe");
});

test("review creation and deletion controls are limited to the signed-in owner", async t => {
  fixture.resetReviews({
    "fixture-cafe": {
      "other-user": { author: "Another Local", rating: 4, comment: "Already here", createdAt: 1 }
    }
  });
  const page = await browserPage(t);
  await openHome(page);
  await submitSearch(page, { location: "33.77, -84.39" });
  await waitForSearch(page, 1);
  await waitForResult(page, "Cafe Result");
  await page.locator('[data-location-id="fixture-cafe"] .location-result-button').click();
  await page.waitForFunction(() => document.querySelectorAll(".review-item").length === 1);
  assert.equal(await page.locator(".review-delete-button").count(), 0);

  await page.locator(".review-open-button").click();
  await page.locator("#review-author").fill("Browser Owner");
  await page.locator("#review-rating").selectOption("5");
  await page.locator("#review-comment").fill("A browser-tested review.");
  await page.locator(".review-form [type=submit]").click();
  await page.waitForFunction(() => document.querySelectorAll(".review-item").length === 2);
  assert.equal(await page.locator(".review-delete-button").count(), 1);
  assert.match(await page.locator(".reviews-summary").textContent(), /2 reviews/);

  page.once("dialog", dialog => dialog.accept());
  await page.locator(".review-delete-button").click();
  await page.waitForFunction(() => document.querySelectorAll(".review-item").length === 1);
  assert.equal(await page.locator(".review-delete-button").count(), 0);
  assert.match(await page.locator(".reviews-summary").textContent(), /1 review/);
  assert.ok(fixture.databaseRequests.some(request => request.method === "PUT"));
  assert.ok(fixture.databaseRequests.some(request => request.method === "DELETE"));
});

test("empty and failed searches expose their appropriate UI states", async t => {
  const page = await browserPage(t);
  await openHome(page);
  await submitSearch(page, { location: "Atlanta", keyword: "empty" });
  await waitForSearch(page, 1);
  await page.waitForFunction(() => document.querySelector(".location-results-empty").textContent === "No nearby locations were found.");
  assert.equal(await page.locator(".location-result").count(), 0);

  await page.locator("#place-keyword").fill("error");
  await page.locator(".map-search-button").click();
  await waitForSearch(page, 2);
  await page.waitForFunction(() => document.querySelector(".location-error").hidden === false);
  assert.match(await page.locator(".location-error").textContent(), /search failed/i);
});

test("a late response from an older search cannot replace the newer results", async t => {
  const page = await browserPage(t);
  await openHome(page);
  await submitSearch(page, { location: "33.77, -84.39", keyword: "slow" });
  await waitForSearch(page, 1);
  assert.equal(await page.locator(".location-results-empty").isVisible(), true);
  await page.locator("#place-keyword").fill("fresh");
  await page.locator(".map-search-button").click();
  await waitForSearch(page, 2);
  await waitForResult(page, "Fresh Result");
  await page.waitForTimeout(240);
  assert.equal(await page.locator(".location-result-button strong").textContent(), "Fresh Result");
  const visibleMarkers = await page.evaluate(() => window.__fixtureState.markers.filter(marker => marker.map).map(marker => marker.title));
  assert.deepEqual(visibleMarkers, ["33.77, -84.39", "Fresh Result"]);
});
