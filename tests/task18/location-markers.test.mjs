import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLocationLayer,
  normalizeLocations,
} from '../../project1/src/main/resources/static/js/location-markers.js';

function location(id, overrides = {}) {
  return { id, name: `Location ${id}`, lat: 33.7756, lng: -84.3963, ...overrides };
}

function createAdapter() {
  const markers = [];
  const fittedLocations = [];

  return {
    markers,
    fittedLocations,
    addMarker(place, onSelect) {
      const marker = {
        place,
        removeCalls: 0,
        remove() {
          this.removeCalls += 1;
        },
        click() {
          onSelect();
        },
      };
      markers.push(marker);
      return marker;
    },
    fitLocations(places) {
      fittedLocations.push(places);
    },
  };
}

test('normalization accepts zero and boundary coordinates but skips invalid coordinates', () => {
  const invalid = [
    null,
    {},
    location('missing', { lat: undefined }),
    location('string', { lat: '33.7756' }),
    location('nan', { lat: Number.NaN }),
    location('infinity', { lng: Number.POSITIVE_INFINITY }),
    location('north', { lat: 90.01 }),
    location('south', { lat: -90.01 }),
    location('east', { lng: 180.01 }),
    location('west', { lng: -180.01 }),
  ];
  const result = normalizeLocations([
    location('zero', { lat: 0, lng: 0 }),
    location('northeast', { lat: 90, lng: 180 }),
    location('southwest', { lat: -90, lng: -180 }),
    ...invalid,
  ]);

  assert.deepEqual(result.locations.map(({ id }) => id), ['zero', 'northeast', 'southwest']);
  assert.equal(result.skippedCount, invalid.length);
  assert.equal(result.duplicateCount, 0);
});

test('normalization requires an array', () => {
  for (const input of [undefined, null, {}, 'locations']) {
    assert.throws(() => normalizeLocations(input), TypeError);
  }
});

test('normalization fills optional fields and leaves the input unchanged', () => {
  const types = Object.freeze([' park ', '', 'park', 5, null, 'museum']);
  const input = Object.freeze([
    Object.freeze(location(42, { name: '  Campus Green  ', address: '  Atlanta  ', types })),
    Object.freeze({ lat: 0, lng: 0, name: '   ' }),
    Object.freeze({ lat: 1, lng: 1, name: null, address: null, types: 'park' }),
  ]);
  const original = JSON.stringify(input);
  const result = normalizeLocations(input);

  assert.equal(result.locations[0].id, '42');
  assert.equal(result.locations[0].name, 'Campus Green');
  assert.equal(result.locations[0].address, 'Atlanta');
  assert.deepEqual(result.locations[0].types, ['park', 'museum']);
  for (const place of result.locations.slice(1)) {
    assert.equal(place.name, 'Unnamed location');
    assert.equal(place.address, '');
    assert.deepEqual(place.types, []);
    assert.equal(typeof place.id, 'string');
    assert.ok(place.id.length > 0);
  }
  assert.equal(JSON.stringify(input), original);
  assert.notEqual(result.locations[0], input[0]);
  assert.notEqual(result.locations[0].types, types);
});

test('normalization keeps the first source ID and preserves colocated distinct places', () => {
  const result = normalizeLocations([
    location(42, { name: 'First result' }),
    location('42', { name: 'Duplicate result', lat: 35 }),
    location('different-id', { name: 'Same coordinates' }),
  ]);

  assert.equal(result.locations.length, 2);
  assert.equal(result.locations[0].name, 'First result');
  assert.equal(result.locations[1].id, 'different-id');
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skippedCount, 0);
});

test('missing IDs are stable across updates and preserve different places', () => {
  const input = [
    { name: 'Library', lat: 33, lng: -84 },
    { name: 'Cafe', lat: 33, lng: -84 },
    { name: 'Library', lat: 34, lng: -84 },
    { id: '', name: 'Park', lat: 35, lng: -84 },
  ];
  const first = normalizeLocations(input).locations.map(({ id }) => id);
  const second = normalizeLocations([...input].reverse()).locations.map(({ id }) => id);

  assert.equal(new Set(first).size, input.length);
  assert.deepEqual(first, second.reverse());
});

test('a layer requires the complete map adapter', () => {
  for (const adapter of [undefined, {}, { addMarker() {} }, { fitLocations() {} }]) {
    assert.throws(() => createLocationLayer(adapter), TypeError);
  }
});

test('each update replaces old markers and reports the accepted results', () => {
  const adapter = createAdapter();
  const layer = createLocationLayer(adapter);
  const initial = [location('one'), location('two')];

  assert.equal(layer.setLocations(initial).displayedCount, 2);
  const oldMarkers = [...adapter.markers];
  const result = layer.setLocations([
    location('three'),
    location('three', { name: 'Duplicate' }),
    location('bad', { lng: 200 }),
  ]);

  assert.equal(result.displayedCount, 1);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.ok(oldMarkers.every(({ removeCalls }) => removeCalls === 1));
  assert.equal(adapter.markers.at(-1).place.id, 'three');
  assert.equal(adapter.markers.at(-1).removeCalls, 0);
  assert.equal(adapter.fittedLocations.length, 0);
});

test('repeated results do not leave multiple live copies of the markers', () => {
  const adapter = createAdapter();
  const layer = createLocationLayer(adapter);
  const results = [location('one'), location('two')];

  layer.setLocations(results);
  layer.setLocations(results);
  layer.setLocations(results);

  assert.equal(adapter.markers.filter(({ removeCalls }) => removeCalls === 0).length, 2);
  assert.ok(adapter.markers.slice(0, -2).every(({ removeCalls }) => removeCalls === 1));
});

test('only requested nonempty results adjust the map view', () => {
  const adapter = createAdapter();
  const layer = createLocationLayer(adapter);

  layer.setLocations([location('one'), location('two')], { fitView: true });
  assert.deepEqual(adapter.fittedLocations[0].map(({ id }) => id), ['one', 'two']);

  layer.setLocations([location('one')], { fitView: false });
  assert.equal(adapter.fittedLocations.length, 1);

  const result = layer.setLocations([], { fitView: true });
  assert.equal(result.displayedCount, 0);
  assert.equal(adapter.fittedLocations.length, 1);
  assert.ok(adapter.markers.every(({ removeCalls }) => removeCalls === 1));

  layer.setLocations([location('invalid', { lat: null })], { fitView: true });
  assert.equal(adapter.fittedLocations.length, 1);
});

test('marker selection supplies the corresponding normalized location', () => {
  const adapter = createAdapter();
  const selected = [];
  const layer = createLocationLayer(adapter, { onSelect: (place) => selected.push(place) });
  layer.setLocations([location('one'), location(2, { name: '  Second place  ' })]);

  adapter.markers[1].click();
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, '2');
  assert.equal(selected[0].name, 'Second place');

  const withoutSelection = createAdapter();
  createLocationLayer(withoutSelection).setLocations([location('one')]);
  assert.doesNotThrow(() => withoutSelection.markers[0].click());
});

test('clear and destroy release markers once and are safe to repeat', () => {
  const adapter = createAdapter();
  const layer = createLocationLayer(adapter);
  layer.setLocations([location('one'), location('two')]);

  layer.clear();
  layer.clear();
  assert.ok(adapter.markers.every(({ removeCalls }) => removeCalls === 1));

  layer.setLocations([location('three')]);
  layer.destroy();
  layer.destroy();
  layer.clear();
  assert.ok(adapter.markers.every(({ removeCalls }) => removeCalls === 1));
  assert.throws(() => layer.setLocations([location('four')]));
});

test('invalid update input leaves the current markers available', () => {
  const adapter = createAdapter();
  const layer = createLocationLayer(adapter);
  layer.setLocations([location('one')]);

  assert.throws(() => layer.setLocations(null), TypeError);
  assert.equal(adapter.markers.length, 1);
  assert.equal(adapter.markers[0].removeCalls, 0);
});

test('a failed update removes partial new markers and preserves the previous result', () => {
  const adapter = createAdapter();
  const selected = [];
  const layer = createLocationLayer(adapter, { onSelect: (place) => selected.push(place.id) });
  layer.setLocations([location('previous')]);
  const addMarker = adapter.addMarker;
  const failure = new Error('Map adapter could not add a marker');
  adapter.addMarker = (place, onSelect) => {
    if (place.id === 'broken') throw failure;
    return addMarker(place, onSelect);
  };

  assert.throws(
    () => layer.setLocations([location('partial'), location('broken')], { fitView: true }),
    (error) => error === failure,
  );
  assert.equal(adapter.markers[0].removeCalls, 0);
  assert.equal(adapter.markers[1].removeCalls, 1);
  assert.equal(adapter.fittedLocations.length, 0);
  adapter.markers[0].click();
  adapter.markers[1].click();
  assert.deepEqual(selected, ['previous']);

  layer.setLocations([location('recovered')]);
  assert.equal(adapter.markers[0].removeCalls, 1);
  assert.equal(adapter.markers.at(-1).place.id, 'recovered');
  assert.equal(adapter.markers.at(-1).removeCalls, 0);
});

test('callbacks from removed markers cannot select stale locations', () => {
  const adapter = createAdapter();
  const selected = [];
  const layer = createLocationLayer(adapter, { onSelect: (place) => selected.push(place.id) });

  layer.setLocations([location('replaced')]);
  layer.setLocations([location('cleared')]);
  adapter.markers[0].click();
  adapter.markers[1].click();
  assert.deepEqual(selected, ['cleared']);

  layer.clear();
  adapter.markers[1].click();
  layer.setLocations([location('destroyed')]);
  layer.destroy();
  adapter.markers[2].click();
  assert.deepEqual(selected, ['cleared']);
});
