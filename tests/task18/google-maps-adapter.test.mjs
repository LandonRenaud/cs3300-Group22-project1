import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createGoogleMapsAdapter,
  normalizeGooglePlaces,
} from '../../project1/src/main/resources/static/js/google-maps-adapter.js';

class ElementStub {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.value = '';
  }

  set textContent(value) { this.value = String(value); }
  get textContent() { return this.value + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { throw new Error(`Popup must not parse HTML: ${value}`); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); return child; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(handler);
  }
  removeEventListener(name, handler) { this.listeners.get(name)?.delete(handler); }
  emit(name) { for (const handler of [...(this.listeners.get(name) ?? [])]) handler(); }
  addListener(name, handler) {
    this.addEventListener(name, handler);
    return { remove: () => this.removeEventListener(name, handler) };
  }
}

function setup(t) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: tagName => new ElementStub(tagName) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });

  const markers = [];
  const windows = [];
  class AdvancedMarkerElement extends ElementStub {
    constructor(options) {
      super();
      Object.assign(this, options);
      this.element = this;
      markers.push(this);
    }
  }
  class InfoWindow extends ElementStub {
    constructor(options = {}) {
      super();
      Object.assign(this, options);
      this.openCalls = [];
      this.closeCalls = 0;
      windows.push(this);
    }
    setContent(content) { this.content = content; }
    open(options) { this.openCalls.push(options); }
    close() { this.closeCalls += 1; }
  }
  class LatLngBounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(point); return this; }
  }
  const map = new ElementStub();
  map.zoom = 12;
  map.centers = [];
  map.zooms = [];
  map.fits = [];
  map.setCenter = center => map.centers.push(center);
  map.setZoom = zoom => { map.zoom = zoom; map.zooms.push(zoom); };
  map.getZoom = () => map.zoom;
  map.fitBounds = (bounds, padding) => map.fits.push({ bounds, padding });
  const maps = {
    marker: { AdvancedMarkerElement },
    InfoWindow,
    LatLngBounds,
    event: {
      addListenerOnce(target, name, handler) {
        const listener = target.addListener(name, () => {
          listener.remove();
          handler();
        });
        return listener;
      },
      removeListener(listener) { listener.remove(); },
    },
  };
  return { adapter: createGoogleMapsAdapter(map, maps), map, maps, markers, windows };
}

function place(id, overrides = {}) {
  return {
    place_id: id,
    name: `Place ${id}`,
    geometry: { location: { lat: 33.77, lng: -84.39 } },
    ...overrides,
  };
}

function location(id, overrides = {}) {
  return { id, name: `Location ${id}`, lat: 33.77, lng: -84.39, address: '', types: [], ...overrides };
}

test('Google Places conversion supports LatLng methods and numeric coordinates without mutating input', () => {
  const coordinates = Object.freeze({
    latitude: 0,
    longitude: -180,
    lat() { return this.latitude; },
    lng() { return this.longitude; },
  });
  const input = Object.freeze([
    Object.freeze(place('first', {
      name: '  Campus Green  ',
      vicinity: '  Nearby address  ',
      formatted_address: 'Full address',
      geometry: Object.freeze({ location: coordinates }),
      types: Object.freeze([' park ', 'park']),
      rating: 0,
    })),
    Object.freeze(place('second', { formatted_address: 'Full address', rating: 4.5 })),
  ]);
  const result = normalizeGooglePlaces(input);

  assert.deepEqual(result.locations[0], {
    id: 'first', name: 'Campus Green', lat: 0, lng: -180,
    address: 'Nearby address', types: ['park'], rating: 0,
  });
  assert.equal(result.locations[1].address, 'Full address');
  assert.equal(result.locations[1].rating, 4.5);
  assert.equal(result.skippedCount, 0);
  assert.equal(result.duplicateCount, 0);
  assert.equal(input[0].name, '  Campus Green  ');
});

test('Google Places conversion rejects invalid geometry and keeps the first duplicate ID', () => {
  const result = normalizeGooglePlaces([
    place('zero', { geometry: { location: { lat: 0, lng: 0 } } }),
    place('zero', { name: 'Duplicate' }),
    null,
    place('missing', { geometry: undefined }),
    place('string', { geometry: { location: { lat: '0', lng: 0 } } }),
    place('range', { geometry: { location: { lat: 91, lng: 0 } } }),
    place('infinite', { geometry: { location: { lat: 0, lng: Infinity } } }),
  ]);

  assert.deepEqual(result.locations.map(({ id }) => id), ['zero']);
  assert.equal(result.locations[0].lat, 0);
  assert.equal(result.locations[0].lng, 0);
  assert.equal(result.skippedCount, 5);
  assert.equal(result.duplicateCount, 1);
});

test('Google Places conversion retains only finite numeric ratings from zero through five', () => {
  const values = [0, 5, 4.25, -1, 5.1, NaN, Infinity, '4.5', null, undefined];
  const result = normalizeGooglePlaces(values.map((rating, index) => place(String(index), { rating })));

  assert.deepEqual(result.locations.slice(0, 3).map(item => item.rating), [0, 5, 4.25]);
  assert.ok(result.locations.slice(3).every(item => item.rating == null));
  assert.equal(result.locations.length, values.length);
});

test('click opens one shared popup with literal place text and selects the location', t => {
  const { adapter, markers, windows, map } = setup(t);
  const selected = [];
  const selectedPlace = location('one', {
    name: '<img src=x onerror=alert(1)>',
    address: '<script>address</script>',
    types: ['<b>park</b>'],
    rating: 4.5,
  });
  adapter.addMarker(selectedPlace, () => selected.push(selectedPlace.id));
  adapter.addMarker(location('two'), () => {});

  assert.equal(windows.length, 1);
  assert.equal(markers[0].map, map);
  assert.deepEqual(markers[0].position, { lat: selectedPlace.lat, lng: selectedPlace.lng });
  assert.equal(markers[0].title, selectedPlace.name);
  assert.equal(markers[0].gmpClickable, true);
  markers[0].emit('gmp-click');
  assert.deepEqual(selected, ['one']);
  assert.equal(windows[0].openCalls.at(-1).anchor, markers[0]);
  assert.equal(windows[0].openCalls.at(-1).map, map);
  for (const value of [selectedPlace.name, selectedPlace.address, '<b>park</b>', '4.5']) {
    assert.ok(windows[0].content.textContent.includes(value));
  }
});

test('hover popup closes on leave while a clicked popup stays open', t => {
  const { adapter, markers, windows } = setup(t);
  let selections = 0;
  adapter.addMarker(location('one'), () => { selections += 1; });

  markers[0].emit('mouseenter');
  assert.equal(windows[0].openCalls.length, 1);
  assert.equal(selections, 0);
  markers[0].emit('mouseleave');
  assert.equal(windows[0].closeCalls, 1);

  markers[0].emit('gmp-click');
  markers[0].emit('mouseleave');
  assert.equal(windows[0].closeCalls, 1);
  assert.equal(selections, 1);
});

test('removal closes only the owned popup and detaches stale marker events', t => {
  const { adapter, markers, windows } = setup(t);
  let selections = 0;
  const first = adapter.addMarker(location('one'), () => { selections += 1; });
  const second = adapter.addMarker(location('two'), () => { selections += 1; });
  markers[1].emit('gmp-click');
  const before = windows[0].closeCalls;

  first.remove();
  first.remove();
  assert.equal(markers[0].map, null);
  assert.equal(windows[0].closeCalls, before);
  second.remove();
  second.remove();
  assert.equal(markers[1].map, null);
  assert.equal(windows[0].closeCalls, before + 1);

  for (const marker of markers) {
    assert.ok([...marker.listeners.values()].every(handlers => handlers.size === 0));
    marker.emit('gmp-click');
    marker.emit('mouseenter');
    marker.emit('mouseleave');
  }
  assert.equal(selections, 1);
  assert.equal(windows[0].openCalls.length, 1);
});

test('search center options preserve marker content and stacking order', t => {
  const { adapter, markers } = setup(t);
  const content = new ElementStub();
  adapter.addMarker(location('center'), () => {}, { content, zIndex: 100 });

  assert.equal(markers[0].content, content);
  assert.equal(markers[0].zIndex, 100);
});

test('viewport fit ignores empty results and centers one result at zoom fifteen', t => {
  const { adapter, map } = setup(t);
  adapter.fitLocations([]);
  assert.equal(map.centers.length, 0);
  assert.equal(map.zooms.length, 0);
  assert.equal(map.fits.length, 0);

  adapter.fitLocations([location('zero', { lat: 0, lng: 0 })]);
  assert.deepEqual(map.centers, [{ lat: 0, lng: 0 }]);
  assert.deepEqual(map.zooms, [15]);
  assert.equal(map.fits.length, 0);
});

test('multiple locations fit padded bounds and cap excessive zoom after the map becomes idle', t => {
  const { adapter, map } = setup(t);
  const locations = [location('one'), location('two', { lat: 34, lng: -85 })];
  adapter.fitLocations(locations);

  assert.equal(map.fits.length, 1);
  assert.equal(map.fits[0].padding, 48);
  assert.deepEqual(map.fits[0].bounds.points, locations.map(({ lat, lng }) => ({ lat, lng })));
  map.zoom = 20;
  map.emit('idle');
  assert.deepEqual(map.zooms, [16]);
  map.zoom = 18;
  map.emit('idle');
  assert.deepEqual(map.zooms, [16]);

  adapter.fitLocations(locations);
  map.zoom = 10;
  map.emit('idle');
  assert.deepEqual(map.zooms, [16]);
});
