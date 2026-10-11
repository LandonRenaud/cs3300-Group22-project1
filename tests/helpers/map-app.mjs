import assert from 'node:assert/strict';

let scenario = 0;

export class Element {
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
      contains: name => this.className?.split(" ").includes(name) || this.classes.has(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(''); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren() { this.children = []; this.text = ''; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) {
    if (this.selectors?.[selector]) return this.selectors[selector];
    return this.children.find(child => selector === 'button' ? child.type === 'button' : child.className === selector.slice(1)) || null;
  }
  closest(selector) { return this.className === selector.slice(1) ? this : this.parentElement?.closest(selector); }
  focus() { this.ownerDocument.activeElement = this; }
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

export async function setup(t, importLibrary = async () => ({}), userId = null, storage = null) {
  const selectors = [
    'map-input-location', 'location-input', 'google-map', 'location-results-list',
    'location-results-empty', 'location-error', 'map-input-keyword', 'map-input-radius',
    'map-input-price', 'map-input-open-now', 'map-input-rank-by', 'map-input-place-type',
    'location-details', 'location-details-heading', 'location-details-address',
    'location-details-rating', 'location-details-types', 'location-details-coordinates',
    'location-details-close', 'search-history', 'search-history-count', 'search-history-list',
    'search-history-empty', 'search-history-clear', 'search-history-storage',
    'search-history-warning', 'search-history-status', 'summary',
  ];
  const elements = Object.fromEntries(selectors.map(name => [name, new Element()]));
  elements['location-details'].hidden = true;
  elements['map-input-radius'].value = '5000';
  elements['map-input-rank-by'].value = 'prominence';
  elements['map-input-place-type'].value = 'point_of_interest';
  const geocodes = [];
  const searches = [];
  const textSearches = [];
  const markers = [];
  const windows = [];
  const map = {
    centers: [],
    center: { lat: 33.7756, lng: -84.3963 }, zoom: 13,
    getZoom() { return this.zoom; },
    setZoom(zoom) { this.zoom = zoom; },
    setCenter(position) { this.centers.push(position); this.center = position; },
    getCenter() { return this.center; },
    getBounds() { return this.bounds; },
  };
  elements['google-map'].innerMap = map;
  const google = { maps: {
    importLibrary,
    LatLngBounds: class {
      constructor(bounds) { this.bounds = { ...bounds }; }
      toJSON() { return { ...this.bounds }; }
      contains({ lat, lng }) {
        const b = this.bounds;
        return lat <= b.north && lat >= b.south && (b.west <= b.east
          ? lng >= b.west && lng <= b.east : lng >= b.west || lng <= b.east);
      }
    },
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
        textSearch(request, callback) { textSearches.push({ request, callback }); }
      },
    },
  } };
  const window = new Element();
  window.google = google;
  const globals = {
    google, window, localStorage: storage,
    customElements: { whenDefined: async name => assert.equal(name, 'gmp-map') },
    document: {
      querySelector: selector => elements[selector.slice(1)],
      createElement: () => { const element = new Element(); element.ownerDocument = globals.document; return element; },
    },
  };
  for (const element of Object.values(elements)) element.ownerDocument = globals.document;
  elements['search-history'].selectors = Object.fromEntries(Object.entries(elements).map(([key, value]) => [key === 'summary' ? key : '.' + key, value]));
  const original = Object.fromEntries(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, globals);
  t.after(() => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const module = await import(`../../project1/src/main/resources/static/js/map-scripts.js?scenario=${++scenario}`);
  if (userId) module.initializeSearchHistory({ localId: userId });
  return {
    storageEvent(key) {
      for (const listener of window.listeners.get('storage') || []) listener({ key });
    },
    initializeSearchHistory: module.initializeSearchHistory,
    elements, map, markers, windows, geocodes, searches, textSearches,
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

export function place(id, name = id, lat = 33.78, lng = -84.4) {
  return { place_id: id, name, vicinity: 'Atlanta', geometry: { location: { lat: () => lat, lng: () => lng } } };
}
