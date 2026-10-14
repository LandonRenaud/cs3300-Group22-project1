import assert from 'node:assert/strict';
import test from 'node:test';

import { setup, place } from '../helpers/map-app.mjs';

const state = app => app.elements['location-input'].dataset.searchState;
const status = app => app.elements['location-search-status-text'].textContent;

test('searches transition from idle to searching and then results available', async t => {
  const app = await setup(t);

  assert.equal(state(app), 'idle');
  assert.match(status(app), /Ready to search/);

  await app.submit('0, 0');
  assert.equal(state(app), 'searching');
  assert.equal(app.elements['location-search-loading'].hidden, false);
  assert.equal(app.elements['location-input'].attributes.get('aria-busy'), 'true');

  app.searches[0].callback([place('coffee', 'Coffee Shop')], 'OK');
  assert.equal(state(app), 'results');
  assert.equal(app.elements['location-search-loading'].hidden, true);
  assert.equal(app.elements['location-input'].attributes.get('aria-busy'), 'false');
  assert.match(status(app), /1 nearby location found/);
});

test('empty Places responses use the no-results state and a useful message', async t => {
  const app = await setup(t);

  await app.submit('0, 0');
  app.searches[0].callback(null, 'ZERO_RESULTS');

  assert.equal(state(app), 'no-results');
  assert.equal(app.elements['location-results-empty'].hidden, false);
  assert.match(app.elements['location-results-empty'].textContent, /No nearby locations/);
  assert.match(status(app), /No nearby locations/);
  assert.equal(app.elements['location-error'].hidden, true);
});

test('invalid input and failed geocoding enter the failed state without Places requests', async t => {
  const app = await setup(t);

  await app.submit('91, -73');
  assert.equal(state(app), 'failed');
  assert.match(app.elements['location-error'].textContent, /latitude from -90/);
  assert.equal(app.geocodes.length, 0);
  assert.equal(app.searches.length, 0);

  await app.submit('Not a real place');
  assert.equal(state(app), 'searching');
  app.geocodes[0].callback([], 'ZERO_RESULTS');
  assert.equal(state(app), 'failed');
  assert.match(app.elements['location-error'].textContent, /Location not found/);
  assert.equal(app.searches.length, 0);
});

test('Places failures announce the error, do not save history, and recover on a new search', async t => {
  const storage = {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
    removeItem(key) { this.values.delete(key); },
  };
  const app = await setup(t, undefined, 'user-a', storage);

  await app.submit('0, 0');
  app.searches[0].callback(null, 'UNKNOWN_ERROR');
  assert.equal(state(app), 'failed');
  assert.match(app.elements['location-error'].textContent, /failed.*connect/i);
  assert.equal(app.elements['search-history-list'].children.length, 0);

  await app.submit('0, 0');
  app.searches[1].callback([place('recovered')], 'OK');
  assert.equal(state(app), 'results');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['recovered']);
  assert.equal(app.elements['search-history-list'].children.length, 1);
});

test('duplicate pending submissions are ignored while a new search remains valid', async t => {
  const app = await setup(t);

  await app.submit('0, 0');
  await app.submit('0, 0');
  assert.equal(app.searches.length, 1);
  assert.equal(state(app), 'searching');

  await app.submit('1, 1');
  assert.equal(app.searches.length, 2);
  app.searches[0].callback([place('stale')], 'OK');
  assert.equal(state(app), 'searching');
  assert.equal(app.rows().length, 0);
  app.searches[1].callback([place('current')], 'OK');
  assert.equal(state(app), 'results');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['current']);
});

test('stale failures cannot replace the latest success state or message', async t => {
  const app = await setup(t);

  await app.submit('2, 2');
  await app.submit('3, 3');
  app.searches[1].callback([place('latest')], 'OK');
  assert.equal(state(app), 'results');
  app.searches[0].callback(null, 'REQUEST_DENIED');

  assert.equal(state(app), 'results');
  assert.equal(app.elements['location-error'].hidden, true);
  assert.match(status(app), /latest|1 nearby location found/i);
});
