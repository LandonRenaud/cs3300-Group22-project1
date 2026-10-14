import assert from 'node:assert/strict';
import test from 'node:test';

import { setup, place } from '../helpers/map-app.mjs';

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
  assert.deepEqual(results.map(marker => marker.title), app.rows().map(row => row.children[0].children[0].textContent));
  assert.deepEqual(results[1].position, { lat: 0, lng: 0 });
  assert.equal(target.map, app.map);
  assert.equal(target.zIndex, 1000);
  assert.equal(target.content.className, 'target-location-pin');
  assert.equal(target.content.attributes.get('aria-label'), 'Search center: Atlanta center');
  assert.match(app.elements['location-error'].textContent, /1 locations.*invalid/);
  await results[1].emit('gmp-click');
  assert.equal(app.rows()[1].attributes.get('aria-current'), 'true');
  assert.equal(app.rows()[1].scrolled, true);
  assert.equal(results[1].classes.has('location-marker-selected'), true);
  assert.equal(app.elements['location-details'].hidden, false);
  assert.equal(app.elements['location-details-heading'].textContent, 'Zero coordinates');
  assert.equal(app.windows[0].options.anchor, results[1]);
  await results[0].emit('gmp-click');
  assert.equal(app.rows()[1].attributes.has('aria-current'), false);
  assert.equal(app.rows()[0].classes.has('is-selected'), true);
  assert.equal(results[1].classes.has('location-marker-selected'), false);
  assert.equal(results[0].classes.has('location-marker-selected'), true);
  await target.emit('gmp-click');
  assert.ok(app.rows().every(row => !row.classes.has('is-selected')));
  assert.ok(results.every(marker => !marker.classes.has('location-marker-selected')));
  assert.equal(app.elements['location-details'].hidden, true);
});

test('listing clicks show details, closing clears selection, and a new search hides old details', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  app.searches[0].callback([{
    ...place('cafe', 'Cafe Corner'), rating: 4.5, types: ['cafe', 'food'],
  }], 'OK');
  const button = app.rows()[0].children[0];
  assert.equal(button.type, 'button');
  await button.emit('click');
  assert.equal(app.elements['location-details'].hidden, false);
  assert.equal(app.elements['location-details-heading'].textContent, 'Cafe Corner');
  assert.equal(app.elements['location-details-address'].textContent, 'Atlanta');
  assert.equal(app.elements['location-details-rating'].textContent, 'Rating: 4.5/5');
  assert.equal(app.elements['location-details-types'].textContent, 'cafe · food');
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  assert.equal(app.windows[0].options.anchor, app.liveMarkers()[1]);

  await app.elements['location-details-close'].emit('click');
  assert.equal(app.elements['location-details'].hidden, true);
  assert.equal(button.attributes.get('aria-pressed'), 'false');
  await button.emit('click');
  await app.submit('New address');
  assert.equal(app.elements['location-details'].hidden, true);
  assert.equal(app.rows().length, 0);
});

test('listing activation pans only when its marker is outside the current map bounds', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  app.searches[0].callback([place('cafe', 'Cafe Corner', 40, -73)], 'OK');
  app.map.bounds = { contains: () => false };

  await app.rows()[0].children[0].emit('click');
  assert.deepEqual(app.map.centers.at(-1), { lat: 40, lng: -73 });

  app.map.bounds = { contains: () => true };
  const centerCount = app.map.centers.length;
  await app.rows()[0].children[0].emit('click');
  assert.equal(app.map.centers.length, centerCount);
});

test('closing a marker popup clears list, details, and marker selection', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  app.searches[0].callback([place('cafe', 'Cafe Corner')], 'OK');
  const marker = app.liveMarkers()[1];

  await marker.emit('gmp-click');
  assert.equal(app.rows()[0].classes.has('is-selected'), true);
  assert.equal(marker.classes.has('location-marker-selected'), true);
  await app.windows[0].emit('closeclick');

  assert.equal(app.rows()[0].classes.has('is-selected'), false);
  assert.equal(app.rows()[0].children[0].attributes.get('aria-pressed'), 'false');
  assert.equal(app.elements['location-details'].hidden, true);
  assert.equal(marker.classes.has('location-marker-selected'), false);
});

test('rapid list selections leave only the latest location selected', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  app.searches[0].callback([place('first', 'First'), place('second', 'Second')], 'OK');

  await app.rows()[0].children[0].emit('click');
  await app.rows()[1].children[0].emit('click');

  assert.equal(app.rows()[0].classes.has('is-selected'), false);
  assert.equal(app.rows()[1].classes.has('is-selected'), true);
  assert.equal(app.elements['location-details-heading'].textContent, 'Second');
  assert.equal(app.windows[0].options.anchor, app.liveMarkers()[2]);
  assert.equal(app.liveMarkers()[1].classes.has('location-marker-selected'), false);
  assert.equal(app.liveMarkers()[2].classes.has('location-marker-selected'), true);
});

test('filter refresh clears a selected location before replacement results arrive', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta center');
  app.searches[0].callback([place('old', 'Old result')], 'OK');
  await app.rows()[0].children[0].emit('click');

  app.elements['map-input-place-type'].value = 'cafe';
  await app.elements['map-input-place-type'].emit('change');
  assert.equal(app.rows().length, 0);
  assert.equal(app.elements['location-details'].hidden, true);
  assert.equal(app.liveMarkers().some(marker => marker.title === 'Old result'), false);

  app.searches[1].callback([place('new', 'New result')], 'OK');
  assert.equal(app.rows()[0].classes.has('is-selected'), false);
  assert.equal(app.elements['location-details'].hidden, true);
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

test('named location search geocodes globally and ignores the previous map viewport', async t => {
  const app = await setup(t);
  app.map.bounds = {
    contains: ({ lat, lng }) => lat > 33 && lat < 34 && lng > -85 && lng < -84,
  };
  app.elements['map-input-keyword'].value = 'museum';
  app.elements['map-input-radius'].value = '1000';
  await app.submit('Chicago');
  assert.equal(app.geocodes[0].request.address, 'Chicago');
  assert.equal('bounds' in app.geocodes[0].request, false);
  app.geocode(0, 'Chicago, IL', 41.8781, -87.6298);
  assert.deepEqual(app.map.centers.at(-1), { lat: 41.8781, lng: -87.6298 });
  assert.deepEqual(app.searches[0].request.location, { lat: 41.8781, lng: -87.6298 });
  assert.equal(app.searches[0].request.radius, 1000);
  app.searches[0].callback([
    place('chicago', 'Chicago Museum', 41.878, -87.63),
    place('remote', 'Remote museum', 33.78, -84.4),
  ], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['chicago', 'remote']);
});

test('coordinates recenter the map and search around the new point', async t => {
  const app = await setup(t);
  app.map.bounds = { contains: () => false };
  await app.submit('40.75, -73.99');
  assert.deepEqual(app.map.centers, [{ lat: 40.75, lng: -73.99 }]);
  assert.deepEqual(app.searches[0].request.location, { lat: 40.75, lng: -73.99 });
  app.searches[0].callback([place('new', 'New York place', 40.751, -73.991)], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['new']);
});

test('keyword alone searches from the map center without viewport clipping', async t => {
  const app = await setup(t);
  app.map.bounds = { contains: ({ lat }) => lat > 33 && lat < 34 };
  app.elements['map-input-keyword'].value = 'coffee';
  await app.submit('');
  assert.equal(app.searches[0].request.keyword, 'coffee');
  assert.deepEqual(app.searches[0].request.location, { lat: 33.7756, lng: -84.3963 });
  app.searches[0].callback([place('local'), place('distant', 'Far away', 40, -73)], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['local', 'distant']);
});

test('invalid coordinate-like input and invalid radius fail without a silent fallback', async t => {
  const app = await setup(t);
  app.elements['map-input-radius'].value = 'not-a-radius';
  await app.submit('Chicago');
  assert.match(app.elements['location-error'].textContent, /Radius/);
  assert.equal(app.geocodes.length, 0);

  app.elements['map-input-radius'].value = '5000';
  await app.submit('91, -73');
  assert.match(app.elements['location-error'].textContent, /Coordinates/);
  assert.equal(app.geocodes.length, 0);

  await app.submit('40.75,');
  assert.match(app.elements['location-error'].textContent, /Coordinates/);
  assert.equal(app.geocodes.length, 0);

  app.elements['map-input-place-type'].value = 'unsupported-type';
  await app.submit('Chicago');
  assert.match(app.elements['location-error'].textContent, /filters/i);
  assert.equal(app.geocodes.length, 0);
});

test('distance ranking sorts shuffled results and shows straight-line distances', async t => {
  const app = await setup(t);
  app.elements['map-input-rank-by'].value = 'distance';
  await app.submit('0, 0');
  app.searches[0].callback([
    place('far', 'Far', 2, 0),
    place('near', 'Near', 0.1, 0),
  ], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['near', 'far']);
  assert.match(app.rows()[0].textContent, /km away|m away/);
  assert.equal('radius' in app.searches[0].request, false);
});

test('prominence ranking preserves provider order', async t => {
  const app = await setup(t);
  await app.submit('0, 0');
  app.searches[0].callback([place('far', 'Far', 2, 0), place('near', 'Near', 0.1, 0)], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['far', 'near']);
  assert.match(app.rows()[0].textContent, /km away/);
});

test('changing an active filter refreshes once and the newest pending filter wins', async t => {
  const app = await setup(t);
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta', 33.77, -84.39);
  app.elements['map-input-place-type'].value = 'cafe';
  await app.elements['map-input-place-type'].dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(app.searches.length, 2);
  assert.equal(app.searches[1].request.type, 'cafe');
  app.elements['map-input-place-type'].value = 'park';
  await app.elements['map-input-place-type'].emit('change');
  assert.equal(app.searches.length, 3);
  assert.equal(app.searches[2].request.type, 'park');
  app.searches[1].callback([place('stale')], 'OK');
  assert.equal(app.rows().length, 0);
  app.searches[2].callback([place('current')], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['current']);
});

test('a native bubbling Location Type change refreshes results and markers without submitting or adding history', async t => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
    removeItem(key) { this.values.delete(key); },
  };
  const app = await setup(t, undefined, 'user-a', storage);
  app.elements['map-input-keyword'].value = 'coffee';
  app.elements['map-input-radius'].value = '1200';
  app.elements['map-input-price'].value = '2';
  app.elements['map-input-open-now'].checked = true;
  app.elements['map-input-rank-by'].value = 'prominence';
  await app.submit('Atlanta');
  app.geocode(0, 'Atlanta', 33.77, -84.39);
  app.searches[0].callback([place('old', 'Old result')], 'OK');
  assert.equal(app.elements['location-input'].listeners.has('change'), true);
  assert.equal(app.elements['search-history-list'].children.length, 1);

  app.map.center = { lat: 34, lng: -85 };
  app.map.zoom = 10;
  app.elements['map-input-place-type'].value = 'cafe';
  await app.elements['map-input-place-type'].dispatchEvent(new Event('change', { bubbles: true }));

  assert.equal(app.searches.length, 2);
  assert.equal(app.geocodes.length, 1);
  assert.equal(app.searches[1].request.type, 'cafe');
  assert.deepEqual(app.searches[1].request.location, { lat: 33.77, lng: -84.39 });
  assert.equal(app.searches[1].request.keyword, 'coffee');
  assert.equal(app.searches[1].request.radius, 1200);
  assert.equal(app.searches[1].request.minPriceLevel, 2);
  assert.equal(app.searches[1].request.maxPriceLevel, 2);
  assert.equal(app.searches[1].request.openNow, true);
  assert.equal(app.searches[1].request.rankBy, 'prominence-rank');
  assert.deepEqual(app.map.center, { lat: 34, lng: -85 });
  assert.equal(app.map.zoom, 10);

  app.searches[1].callback([place('new', 'New result')], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['new']);
  assert.deepEqual(app.liveMarkers().map(marker => marker.title), ['Atlanta', 'New result']);
  assert.equal(app.elements['search-history-list'].children.length, 1);
});

test('changing a filter before the first search does not launch a request', async t => {
  const app = await setup(t);
  app.elements['map-input-place-type'].value = 'cafe';
  await app.elements['map-input-place-type'].emit('change');
  assert.equal(app.searches.length, 0);
});
