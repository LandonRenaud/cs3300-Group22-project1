import assert from 'node:assert/strict';
import test from 'node:test';

import { setup, place } from '../helpers/map-app.mjs';

function pagination(hasNextPage = true) {
  return {
    hasNextPage,
    calls: 0,
    nextPage() {
      this.calls += 1;
    },
  };
}

async function startSearch(app, address = 'Atlanta') {
  const geocodeCount = app.geocodes.length;
  await app.submit(address);
  if (app.geocodes.length > geocodeCount) app.geocode(geocodeCount, `${address} center`);
}

async function requestNextPage(app, page) {
  await app.loadMore().emit('click');
  assert.equal(app.loadMore().disabled, true);
  await app.waitForNextPage();
  assert.equal(page.calls, 1);
}

test('single-page results hide pagination and keep count/loading state accurate', async t => {
  const app = await setup(t);
  await startSearch(app);
  app.searches[0].callback([place('one'), place('two')], 'OK');

  assert.equal(app.rows().length, 2);
  assert.equal(app.elements['location-results-count'].textContent, '2 locations');
  assert.equal(app.elements['location-results-loading'].hidden, true);
  assert.equal(app.loadMore().hidden, true);
  assert.equal(app.loadMore().disabled, true);
});

test('multiple pages append results only after an explicit, delayed request', async t => {
  const app = await setup(t);
  await startSearch(app);
  const firstPage = pagination(true);
  app.searches[0].callback([place('first')], 'OK', firstPage);

  assert.equal(app.loadMore().hidden, false);
  assert.equal(app.loadMore().disabled, true);
  await requestNextPage(app, firstPage);
  assert.equal(app.elements['location-results-loading'].hidden, false);
  app.searches[0].callback([place('second')], 'OK', pagination(false));

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['first', 'second']);
  assert.equal(app.elements['location-results-count'].textContent, '2 locations');
  assert.equal(app.liveMarkers().filter(marker => marker.title !== 'Atlanta center').length, 2);
  assert.equal(app.loadMore().hidden, true);
  assert.equal(app.elements['location-results-loading'].hidden, true);
});

test('duplicate page locations are deduplicated by Google Place ID', async t => {
  const app = await setup(t);
  await startSearch(app);
  const firstPage = pagination(true);
  app.searches[0].callback([place('same', 'Original'), place('first')], 'OK', firstPage);
  const originalMarker = app.liveMarkers().find(marker => marker.title === 'Original');

  await requestNextPage(app, firstPage);
  app.searches[0].callback([
    place('same', 'Duplicate response'),
    place('second'),
  ], 'OK', pagination(false));

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['same', 'first', 'second']);
  assert.equal(app.elements['location-results-count'].textContent, '3 locations');
  assert.equal(originalMarker.map, app.map);
  assert.deepEqual(app.liveMarkers().filter(marker => marker.title !== 'Atlanta center').map(marker => marker.title), [
    'Original', 'first', 'second'
  ]);
});

test('a failed page request preserves prior results and disables pagination', async t => {
  const app = await setup(t);
  await startSearch(app);
  const firstPage = pagination(true);
  app.searches[0].callback([place('existing')], 'OK', firstPage);
  await requestNextPage(app, firstPage);
  app.searches[0].callback(null, 'REQUEST_DENIED');

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['existing']);
  assert.equal(app.liveMarkers().filter(marker => marker.title !== 'Atlanta center').length, 1);
  assert.equal(app.loadMore().hidden, true);
  assert.equal(app.loadMore().disabled, true);
  assert.match(app.elements['location-error'].textContent, /Additional nearby locations/);
  assert.equal(app.elements['location-results-loading'].hidden, true);
});

test('rapid search changes prevent an older page callback from appending', async t => {
  const app = await setup(t);
  await startSearch(app, 'Old');
  const oldPage = pagination(true);
  app.searches[0].callback([place('old')], 'OK', oldPage);

  await startSearch(app, 'New');
  app.searches[1].callback([place('new')], 'OK');
  app.searches[0].callback([place('late-old')], 'OK', pagination(false));

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['new']);
  assert.equal(app.loadMore().hidden, true);
});

test('a stale callback after a delayed page request cannot change the current search', async t => {
  const app = await setup(t);
  await startSearch(app, 'Old');
  const oldPage = pagination(true);
  app.searches[0].callback([place('old')], 'OK', oldPage);
  await requestNextPage(app, oldPage);

  await startSearch(app, 'Current');
  app.searches[1].callback([place('current')], 'OK');
  app.searches[0].callback([place('stale-page')], 'OK', pagination(false));

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['current']);
  assert.deepEqual(app.liveMarkers().map(marker => marker.title), ['Current center', 'current']);
  assert.equal(app.elements['location-error'].hidden, true);
});

test('the no-more-results page hides pagination and ignores later clicks', async t => {
  const app = await setup(t);
  await startSearch(app);
  const firstPage = pagination(true);
  app.searches[0].callback([place('first')], 'OK', firstPage);
  await requestNextPage(app, firstPage);
  const finalPage = pagination(false);
  app.searches[0].callback([place('last')], 'OK', finalPage);

  assert.equal(app.loadMore().hidden, true);
  assert.equal(app.loadMore().disabled, true);
  await app.loadMore().emit('click');
  assert.equal(finalPage.calls, 0);
  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['first', 'last']);
});

test('appended list entries and markers remain consistent while selection is retained', async t => {
  const app = await setup(t);
  app.elements['map-input-rank-by'].value = 'distance';
  await startSearch(app, '0, 0');
  const firstPage = pagination(true);
  app.searches[0].callback([place('far', 'Far', 2, 0), place('near', 'Near', .1, 0)], 'OK', firstPage);
  await app.rows()[0].children[0].emit('click');
  assert.equal(app.rows()[0].dataset.locationId, 'near');

  await requestNextPage(app, firstPage);
  app.searches[0].callback([place('closest', 'Closest', .05, 0)], 'OK', pagination(false));

  assert.deepEqual([...app.rows()].map(row => row.dataset.locationId), ['closest', 'near', 'far']);
  assert.equal(app.rows()[1].attributes.get('aria-current'), 'true');
  assert.equal(app.elements['location-details-heading'].textContent, 'Near');
  const resultMarkers = app.liveMarkers().filter(marker => marker.title !== '0, 0');
  assert.deepEqual(resultMarkers.map(marker => marker.title).sort(), ['Closest', 'Far', 'Near']);
  assert.equal(resultMarkers.length, app.rows().length);
  assert.equal(app.elements['location-results-count'].textContent, '3 locations');
});
