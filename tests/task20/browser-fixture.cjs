const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../../project1/src/main/resources/static");
const defaultUser = { localId: "browser-fixture-user", email: "fixture@example.test" };

const mapsFixture = `
class FixtureBounds {
  constructor(bounds = {north:34,south:33,east:-84,west:-85}) { this.bounds = {...bounds}; }
  toJSON() { return {...this.bounds}; }
  contains({lat,lng}) { const b=this.bounds; return lat>=b.south && lat<=b.north && lng>=b.west && lng<=b.east; }
  extend({lat,lng}) { this.bounds.north=Math.max(this.bounds.north,lat); this.bounds.south=Math.min(this.bounds.south,lat); this.bounds.east=Math.max(this.bounds.east,lng); this.bounds.west=Math.min(this.bounds.west,lng); }
}
window.__fixtureState = { searches: [], markers: [], infoWindow: {open:false, anchor:null} };
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function resultFor(request) {
  const keyword = request.keyword || "";
  if (keyword === "empty") return { places: [], status: "ZERO_RESULTS" };
  if (keyword === "error") return { places: [], status: "ERROR" };
  if (keyword === "slow") return { places: [{place_id:"stale",name:"Stale Result",vicinity:"Old",types:["cafe"],geometry:{location:{lat:33.78,lng:-84.4}}}], status: "OK", delay: 180 };
  if (keyword === "fresh") return { places: [{place_id:"fresh",name:"Fresh Result",vicinity:"New",types:["cafe"],geometry:{location:{lat:33.79,lng:-84.41}}}], status: "OK", delay: 5 };
  if (request.type === "park") return { places: [{place_id:"fixture-park",name:"Park Result",vicinity:"Fixture Park",types:["park"],geometry:{location:{lat:33.79,lng:-84.41}}}], status: "OK" };
  return { places: [{place_id:"fixture-cafe",name:"Cafe Result",vicinity:"Fixture Cafe",types:["cafe"],rating:4.5,geometry:{location:{lat:33.78,lng:-84.4}}}], status: "OK" };
}
class FixtureMapElement extends HTMLElement {
  connectedCallback() {
    this.innerHTML = '<p style="padding:2rem;color:#19332e">Map fixture</p>';
    const map = {
      center: {lat:33.7756,lng:-84.3963}, zoom:13, bounds:new FixtureBounds(),
      getCenter(){return this.center;}, setCenter(value){this.center={...value};},
      getZoom(){return this.zoom;}, setZoom(value){this.zoom=value;}, getBounds(){return this.bounds;},
      panTo(value){this.setCenter(value);}, fitBounds(bounds){this.bounds=bounds;}
    };
    this.innerMap = map;
  }
}
class FixtureMarker extends EventTarget {
  constructor(options) { super(); Object.assign(this, options); window.__fixtureState.markers.push(this); }
}
class FixtureInfoWindow {
  setContent(content) { this.content = content; }
  open({anchor}) { window.__fixtureState.infoWindow = {open:true, anchor}; }
  close() { window.__fixtureState.infoWindow = {open:false, anchor:null}; }
}
class FixtureGeocoder {
  geocode(request, callback) {
    const location = request.address === "Atlanta"
      ? {lat:33.77,lng:-84.39}
      : {lat:33.78,lng:-84.4};
    setTimeout(() => callback([{formatted_address:request.address,geometry:{location:{lat:()=>location.lat,lng:()=>location.lng}}}], "OK"), 0);
  }
}
class FixturePlacesService {
  constructor() {}
  nearbySearch(request, callback) {
    const snapshot = clone(request);
    window.__fixtureState.searches.push(snapshot);
    const result = resultFor(snapshot);
    setTimeout(() => callback(result.places, result.status), result.delay || 10);
  }
  textSearch(request, callback) { this.nearbySearch(request, callback); }
}
customElements.define("gmp-map", FixtureMapElement);
window.google = {maps:{
  importLibrary:async() => ({}), LatLngBounds:FixtureBounds,
  marker:{AdvancedMarkerElement:FixtureMarker}, InfoWindow:FixtureInfoWindow, Geocoder:FixtureGeocoder,
  event:{addListenerOnce(map, event, callback){ callback(); return {remove(){}}; }},
  places:{RankBy:{DISTANCE:"distance",PROMINENCE:"prominence"}, PlacesServiceStatus:{OK:"OK",ZERO_RESULTS:"ZERO_RESULTS"}, PlacesService:FixturePlacesService}
}};
`;

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function jsonResponse(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function contentType(file) {
  return {
    ".html": "text/html",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml"
  }[path.extname(file)] || "application/octet-stream";
}

async function startBrowserFixture({ user = defaultUser, reviews = {} } = {}) {
  const database = { reviews: clone(reviews) || {} };
  const databaseRequests = [];
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/api/firebase-config") {
      jsonResponse(res, 200, { apiKey: "fixture", databaseUrl: "https://database.test" });
      return;
    }
    if (pathname === "/api/map-config") {
      jsonResponse(res, 200, { apiKey: "fixture-maps" });
      return;
    }
    try {
      const relative = pathname === "/" ? "/landingpage.html" : pathname;
      const file = path.resolve(root, `.${relative}`);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) throw new Error("Invalid file");
      res.setHeader("Content-Type", contentType(file));
      res.end(await fs.readFile(file));
    } catch {
      jsonResponse(res, 404, { error: "Not found" });
    }
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });

  async function createContext({ authenticated = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(token => {
      if (token) sessionStorage.setItem("firebaseIdToken", token);
    }, authenticated ? "fixture-token" : null);
    await context.route("https://maps.googleapis.com/**", route => route.fulfill({
      contentType: "text/javascript", body: mapsFixture
    }));
    await context.route("https://identitytoolkit.googleapis.com/**", route => route.fulfill({
      status: authenticated ? 200 : 400,
      contentType: "application/json",
      body: JSON.stringify(authenticated ? { users: [user] } : { error: { message: "INVALID_ID_TOKEN" } })
    }));
    await context.route("https://database.test/**", async route => {
      const request = route.request();
      const parsed = new URL(request.url());
      const segments = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean).map(decodeURIComponent);
      if (segments.length > 0) segments[segments.length - 1] = segments[segments.length - 1].replace(/\.json$/, "");
      databaseRequests.push({ method: request.method(), path: segments.join("/") });
      if (segments[0] !== "reviews" || !segments[1]) {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not found" }) });
        return;
      }
      const placeId = segments[1];
      const reviewUserId = segments[2];
      if (request.method() === "GET") {
        const result = reviewUserId
          ? database.reviews[placeId]?.[reviewUserId] || null
          : database.reviews[placeId] || null;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
        return;
      }
      if (request.method() === "PUT" && reviewUserId) {
        const body = JSON.parse(request.postData() || "{}");
        database.reviews[placeId] ||= {};
        database.reviews[placeId][reviewUserId] = body;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        return;
      }
      if (request.method() === "DELETE" && reviewUserId) {
        if (database.reviews[placeId]) delete database.reviews[placeId][reviewUserId];
        await route.fulfill({ status: 200, contentType: "application/json", body: "null" });
        return;
      }
      await route.fulfill({ status: 405, contentType: "application/json", body: JSON.stringify({ error: "Method not allowed" }) });
    });
    return context;
  }

  return {
    browser,
    database,
    databaseRequests,
    url: `http://127.0.0.1:${server.address().port}`,
    createContext,
    resetReviews(nextReviews = {}) { database.reviews = clone(nextReviews) || {}; databaseRequests.length = 0; },
    async close() {
      await browser.close();
      await new Promise(resolve => server.close(resolve));
    }
  };
}

module.exports = { startBrowserFixture };
