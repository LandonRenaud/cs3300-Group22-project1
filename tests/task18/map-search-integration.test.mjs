import assert from 'node:assert/strict';
import test from 'node:test';

let scenario = 0;

class Element {
  constructor() {
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.value = '';
    this.hidden = false;
    this.checked = false;
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
  append(child) { this.children.push(child); }
  replaceChildren() { this.children = []; this.text = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  scrollIntoView() { this.scrolled = true; }
  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }
  removeEventListener(name, callback) { this.listeners.get(name)?.delete(callback); }
  emit(name) {
    return Promise.all([...this.listeners.get(name) || []].map(callback => callback({ preventDefault() {} })));
  }
}

async function setup(t, importLibrary = async () => ({})) {
  const selectors = [
    'map-input-location', 'location-input', 'google-map', 'location-results-list',
    'location-results-empty', 'location-error', 'map-input-keyword', 'map-input-radius',
    'map-input-price', 'map-input-open-now', 'map-input-rank-by', 'map-input-place-type',
  ];
  const elements = Object.fromEntries(selectors.map(name => [name, new Element()]));
  elements['map-input-radius'].value = '5000';
  elements['map-input-rank-by'].value = 'prominence';
  elements['map-input-place-type'].value = 'point_of_interest';
  const geocodes = [];
  const searches = [];
  const markers = [];
  const windows = [];
  const map = { centers: [], setCenter(position) { this.centers.push(position); } };
  elements['google-map'].innerMap = map;
  const google = { maps: {
    importLibrary,
    Geocoder: class { geocode(request, callback) { geocodes.push({ request, callback }); } },
    InfoWindow: class {
      constructor() { windows.push(this); }
      setContent(content) { this.content = content; }
      open(options) { this.options = options; }
      close() { this.options = null; }
    },
    marker: { AdvancedMarkerElement: class extends Element {
      constructor(options) { super(); Object.assign(this, options); markers.push(this); }
    } },
    places: {
      RankBy: { DISTANCE: 'distance-rank', PROMINENCE: 'prominence-rank' },
      PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      PlacesService: class {
        constructor(activeMap) { assert.equal(activeMap, map); }
        nearbySearch(request, callback) { searches.push({ request, callback }); }
      },
    },
  } };
  const globals = {
    google, window: { google },
    customElements: { whenDefined: async name => assert.equal(name, 'gmp-map') },
    document: {
      querySelector: selector => elements[selector.slice(1)],
      createElement: () => new Element(),
    },
  };
  const original = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, globals);
  t.after(() => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  await import(`../../project1/src/main/resources/static/js/map-scripts.js?scenario=${++scenario}`);
  return {
    elements, map, markers, windows, geocodes, searches,
    submit(address) {
      elements['map-input-location'].value = address;
      return elements['location-input'].emit('submit');
    },
    geocode(index, name, lat = 33.77, lng = -84.39) {
      geocodes[index].callback([{ formatted_address: name, geometry: {
        location: { lat: () => lat, lng: () => lng },
      } }], 'OK');
    },
    liveMarkers: () => markers.filter(marker => marker.map),
    rows: () => elements['location-results-list'].children,
  };
}

function place(id, name = id, lat = 33.78, lng = -84.4) {
  return { place_id: id, name, vicinity: 'Atlanta', geometry: { location: { lat: () => lat, lng: () => lng } } };
}

test('search snapshots all filters before awaiting readiness and geocoding', async t => {
  const app = await setup(t);
  const e = app.elements;
  e['map-input-keyword'].value = '  coffee  ';
  e['map-input-radius'].value = '1200';
  e['map-input-price'].value = '2';
  e['map-input-open-now'].checked = true;
  e['map-input-place-type'].value = 'cafe';
  const submitted = app.submit('Atlanta');
  e['map-input-keyword'].value = 'museum';
  e['map-input-radius'].value = '200';
  e['map-input-price'].value = '';
  e['map-input-open-now'].checked = false;
  e['map-input-rank-by'].value = 'distance';
  e['map-input-place-type'].value = 'park';
  await submitted;
  app.geocode(0, 'Atlanta');
  assert.deepEqual(app.searches[0].request, {
    location: { lat: 33.77, lng: -84.39 }, keyword: 'coffee', openNow: true,
    rankBy: 'prominence-rank', type: 'cafe', radius: 1200, minPriceLevel: 2, maxPriceLevel: 2,
  });
});

test('distance ranking disables radius and leaves unspecified price out of the request', async t => {
  const app = await setup(t);
  app.elements['map-input-rank-by'].value = 'distance';
  await app.elements['map-input-rank-by'].emit('change');
  assert.equal(app.elements['map-input-radius'].disabled, true);
  await app.submit('Campus');
  app.geocode(0, 'Campus');
  const request = app.searches[0].request;
  assert.equal(request.rankBy, 'distance-rank');
  assert.equal('radius' in request, false);
  assert.equal('minPriceLevel' in request, false);
  assert.equal('maxPriceLevel' in request, false);
  app.elements['map-input-rank-by'].value = 'prominence';
  await app.elements['map-input-rank-by'].emit('change');
  assert.equal(app.elements['map-input-radius'].disabled, false);
});

test('map and list show the same valid unique places, retain the target, and support selection', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  const target = app.liveMarkers()[0];
  app.searches[0].callback([
    place('one', '  First cafe  '), place('one', 'Duplicate'),
    place('zero', 'Zero coordinates', 0, 0), { place_id: 'invalid', name: 'No position' },
  ], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['one', 'zero']);
  const results = app.liveMarkers().filter(marker => marker !== target);
  assert.deepEqual(results.map(marker => marker.title), app.rows().map(row => row.children[0].textContent));
  assert.deepEqual(results[1].position, { lat: 0, lng: 0 });
  assert.equal(target.map, app.map);
  assert.equal(target.zIndex, 1000);
  assert.equal(target.content.className, 'target-location-pin');
  assert.equal(target.content.attributes.get('aria-label'), 'Search center: Atlanta center');
  assert.match(app.elements['location-error'].textContent, /1 locations.*invalid/);
  await results[1].emit('gmp-click');
  assert.equal(app.rows()[1].attributes.get('aria-current'), 'true');
  assert.equal(app.rows()[1].scrolled, true);
  assert.equal(app.windows[0].options.anchor, results[1]);
  await results[0].emit('gmp-click');
  assert.equal(app.rows()[1].attributes.has('aria-current'), false);
  assert.equal(app.rows()[0].classes.has('is-selected'), true);
  await target.emit('gmp-click');
  assert.ok(app.rows().every(row => !row.classes.has('is-selected')));
});

test('a late geocoder response cannot replace the latest search center or results', async t => {
  const app = await setup(t);
  await app.submit('Old address');
  await app.submit('New address');
  app.geocode(1, 'New center', 40, -73);
  app.searches[0].callback([place('new')], 'OK');
  app.geocode(0, 'Old center');
  assert.equal(app.searches.length, 1);
  assert.deepEqual(app.map.centers, [{ lat: 40, lng: -73 }]);
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['new']);
  assert.equal(app.liveMarkers().length, 2);
});

test('late Places responses cannot restore stale markers or errors', async t => {
  const app = await setup(t);
  await app.submit('Old success');
  app.geocode(0, 'Old center');
  await app.submit('Old failure');
  app.geocode(1, 'Other old center');
  await app.submit('Newest');
  app.geocode(2, 'Current center');
  app.searches[2].callback([place('current')], 'OK');
  app.searches[0].callback([place('stale')], 'OK');
  app.searches[1].callback(null, 'REQUEST_DENIED');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['current']);
  assert.deepEqual(app.liveMarkers().map(marker => marker.title), ['Current center', 'current']);
  assert.equal(app.elements['location-error'].hidden, true);
});

test('a search waiting on library readiness cannot overtake a newer search', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const app = await setup(t, () => ++calls <= 4 ? waiting : Promise.resolve({}));
  const oldSearch = app.submit('Waiting address');
  await app.submit('Ready address');
  assert.equal(app.geocodes.length, 1);
  assert.equal(app.geocodes[0].request.address, 'Ready address');
  app.geocode(0, 'Ready center');
  app.searches[0].callback([place('ready')], 'OK');
  release({});
  await oldSearch;
  assert.equal(app.geocodes.length, 1);
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['ready']);
  assert.equal(app.liveMarkers().length, 2);
});

test('empty searches show an empty state while failed searches show an error', async t => {
  const app = await setup(t);
  await app.submit('Initial');
  app.geocode(0, 'Initial center');
  app.searches[0].callback([place('old')], 'OK');
  await app.submit('Empty');
  app.geocode(1, 'Empty center');
  app.searches[1].callback(null, 'ZERO_RESULTS');
  assert.equal(app.rows().length, 0);
  assert.deepEqual(app.liveMarkers().map(marker => marker.title), ['Empty center']);
  assert.equal(app.elements['location-results-empty'].hidden, false);
  assert.match(app.elements['location-results-empty'].textContent, /No nearby locations/);
  assert.equal(app.elements['location-error'].hidden, true);
  await app.submit('Failure');
  app.geocode(2, 'Failure center');
  app.searches[2].callback(null, 'REQUEST_DENIED');
  assert.equal(app.rows().length, 0);
  assert.equal(app.elements['location-error'].hidden, false);
  assert.match(app.elements['location-error'].textContent, /search failed/);
  assert.deepEqual(app.liveMarkers().map(marker => marker.title), ['Failure center']);
});
