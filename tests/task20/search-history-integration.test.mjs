import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, place } from '../helpers/map-app.mjs';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}
const key = userId => `cs3300.search-history.v1:${encodeURIComponent(userId)}`;
const entries = (storage, userId = 'user-a') => JSON.parse(storage.getItem(key(userId)) || '{"entries":[]}').entries;
const historyRows = app => app.elements['search-history-list'].children;
const finish = (app, index = 0, status = 'OK') => app.searches[index].callback(status === 'OK' ? [place('cafe')] : null, status);

function setBounds(app, bounds = { north: 34, south: 33, east: -84, west: -85 }) {
  app.map.bounds = {
    toJSON: () => ({ ...bounds }),
    contains: ({ lat, lng }) => lat <= bounds.north && lat >= bounds.south && lng <= bounds.east && lng >= bounds.west,
  };
  return bounds;
}

test('successful searches persist the submitted filters and restore them for replay', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  const e = app.elements;
  e['map-input-keyword'].value = ' coffee ';
  e['map-input-radius'].value = '1250';
  e['map-input-price'].value = '2';
  e['map-input-open-now'].checked = true;
  e['map-input-rank-by'].value = 'distance';
  e['map-input-place-type'].value = 'cafe';
  const submitted = app.submit(' 33.78, -84.4 ');
  e['map-input-keyword'].value = 'changed before completion';
  await submitted;
  assert.equal(entries(storage).length, 0);
  finish(app);
  assert.equal(entries(storage).length, 1);
  assert.equal(entries(storage)[0].query, '33.78, -84.4');
  assert.equal(entries(storage)[0].options.keyword, 'coffee');
  assert.equal(JSON.stringify(entries(storage)).includes('place_id'), false);
  e['map-input-open-now'].checked = false;
  e['map-input-rank-by'].value = 'prominence';
  await historyRows(app)[0].children[0].emit('click');
  assert.equal(e['map-input-location'].value, '33.78, -84.4');
  assert.equal(e['map-input-keyword'].value, 'coffee');
  assert.equal(e['map-input-radius'].value, '1250');
  assert.equal(e['map-input-radius'].disabled, true);
  assert.equal(e['map-input-price'].value, '2');
  assert.equal(e['map-input-open-now'].checked, true);
  assert.equal(e['map-input-place-type'].value, 'cafe');
  assert.deepEqual(app.searches[1].request, app.searches[0].request);
  finish(app, 1);
  assert.equal(entries(storage).length, 1);
});

test('keyword history restores original center, zoom and bounds after the map moves', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  const bounds = setBounds(app);
  app.elements['map-input-keyword'].value = 'coffee';
  await app.submit('');
  finish(app);
  const savedContext = entries(storage)[0].context;
  app.map.center = { lat: 40.75, lng: -73.99 };
  app.map.zoom = 8;
  setBounds(app, { north: 41, south: 40, east: -73, west: -74 });
  await historyRows(app)[0].children[0].emit('click');
  assert.deepEqual(app.map.center, savedContext.center);
  assert.equal(app.map.zoom, 13);
  assert.deepEqual(app.searches[1].request.location, savedContext.center);
  app.searches[1].callback([place('atlanta'), place('ny', 'New York', 40.75, -73.99)], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['atlanta']);
  assert.deepEqual(entries(storage)[0].context.bounds, bounds);
  assert.equal(entries(storage).length, 1);
});

test('place-name replay uses saved bounds even before the map viewport updates', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  const bounds = setBounds(app);
  await app.submit('El Tesoro');
  app.textSearches[0].callback(null, 'ZERO_RESULTS');
  setBounds(app, { north: 41, south: 40, east: -73, west: -74 });
  await historyRows(app)[0].children[0].emit('click');
  assert.deepEqual(app.textSearches[1].request.bounds.toJSON(), bounds);
  app.textSearches[1].callback([place('local'), place('distant', 'Other', 40.7, -73.9)], 'OK');
  assert.deepEqual(app.rows().map(row => row.dataset.locationId), ['local']);
});

test('empty, failed and stale searches are excluded; valid zero-result searches are saved', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  await app.submit('');
  await app.submit('Not found');
  app.geocodes[0].callback([], 'ZERO_RESULTS');
  await app.submit('33.78, -84.4');
  finish(app, 0, 'REQUEST_DENIED');
  assert.equal(entries(storage).length, 0);
  await app.submit('33.79, -84.4');
  await app.submit('33.80, -84.4');
  finish(app, 1);
  assert.equal(entries(storage).length, 0);
  finish(app, 2, 'ZERO_RESULTS');
  assert.deepEqual(entries(storage).map(entry => entry.query), ['33.80, -84.4']);
});

test('deletion and clear persist and in-flight callbacks cannot bring history back', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  await app.submit('33.78, -84.4');
  finish(app);
  await app.submit('33.79, -84.4');
  await historyRows(app)[0].children[1].emit('click');
  finish(app, 1);
  assert.equal(entries(storage).length, 0);
  assert.equal(app.rows().length, 1);
  await app.submit('33.80, -84.4');
  finish(app, 2);
  await app.submit('33.81, -84.4');
  await app.elements['search-history-clear'].emit('click');
  finish(app, 3);
  assert.equal(storage.getItem(key('user-a')), null);
  assert.equal(historyRows(app).length, 0);
  await app.submit('33.82, -84.4');
  finish(app, 4);
  assert.equal(historyRows(app).length, 1);
});

test('history loads only for a verified user ID and remains separate per account', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, null, storage);
  app.initializeSearchHistory({ email: 'email-is-not-a-uid@example.com' });
  await app.submit('33.78, -84.4');
  finish(app);
  assert.equal(storage.values.size, 0);
  app.initializeSearchHistory({ localId: 'user-a' });
  await app.submit('33.78, -84.4');
  finish(app, 1);
  assert.equal(entries(storage).length, 1);
  app.initializeSearchHistory({ localId: 'user-b' });
  assert.equal(historyRows(app).length, 0);
  await app.submit('33.79, -84.4');
  finish(app, 2);
  assert.deepEqual(entries(storage).map(entry => entry.query), ['33.78, -84.4']);
  assert.deepEqual(entries(storage, 'user-b').map(entry => entry.query), ['33.79, -84.4']);
  app.initializeSearchHistory({ localId: 'user-a' });
  assert.equal(historyRows(app).length, 1);
});

test('storage failure keeps searching and replay working with an honest warning', async t => {
  const app = await setup(t, undefined, 'user-a', {
    getItem: () => null, setItem() { throw new Error('Quota exceeded'); }, removeItem() {},
  });
  await app.submit('33.78, -84.4');
  finish(app);
  assert.equal(app.rows().length, 1);
  assert.equal(historyRows(app).length, 1);
  assert.equal(app.elements['search-history-warning'].hidden, false);
  await historyRows(app)[0].children[0].emit('click');
  assert.equal(app.searches.length, 2);
});

test('waiting on libraries cannot change the submitted map context or save stale history', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const storage = memoryStorage();
  const app = await setup(t, () => waiting, 'user-a', storage);
  const bounds = setBounds(app);
  app.elements['map-input-keyword'].value = 'coffee';
  const pending = app.submit('');
  app.map.center = { lat: 40.75, lng: -73.99 };
  setBounds(app, { north: 41, south: 40, east: -73, west: -74 });
  release({});
  await pending;
  assert.deepEqual(app.searches[0].request.location, { lat: 33.7756, lng: -84.3963 });
  finish(app);
  assert.deepEqual(entries(storage)[0].context.bounds, bounds);
});

test('bounds that become ready during library loading are saved for consistent replay', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const storage = memoryStorage();
  const app = await setup(t, () => waiting, 'user-a', storage);
  const pending = app.submit('El Tesoro');
  const bounds = setBounds(app);
  release({});
  await pending;
  app.textSearches[0].callback(null, 'ZERO_RESULTS');
  assert.deepEqual(entries(storage)[0].context.bounds, bounds);
  setBounds(app, { north: 41, south: 40, east: -73, west: -74 });
  await historyRows(app)[0].children[0].emit('click');
  assert.equal(app.geocodes.length, 0);
  assert.deepEqual(app.textSearches[1].request.bounds.toJSON(), bounds);
});

test('storage events refresh only this user and invalidate in-flight history writes', async t => {
  const storage = memoryStorage();
  const app = await setup(t, undefined, 'user-a', storage);
  await app.submit('33.78, -84.4');
  finish(app);
  await historyRows(app)[0].children[0].emit('click');
  app.storageEvent(key('unrelated-user'));
  assert.equal(historyRows(app).length, 1);
  storage.removeItem(key('user-a'));
  app.storageEvent(key('user-a'));
  assert.equal(historyRows(app).length, 0);
  finish(app, 1);
  assert.equal(entries(storage).length, 0);
  assert.equal(app.rows().length, 1);
  app.initializeSearchHistory(null);
  assert.equal(app.elements['search-history'].hidden, true);
  await app.submit('33.79, -84.4');
  finish(app, 2);
  assert.equal(entries(storage).length, 0);
});
