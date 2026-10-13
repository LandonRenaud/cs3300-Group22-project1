import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDistance,
  haversineDistanceMeters,
  sortLocationsByDistance,
} from '../../project1/src/main/resources/static/js/distance-utils.mjs';

test('Haversine distance handles known coordinates, negative longitude, and zero', () => {
  const atlantaToNewYork = haversineDistanceMeters(
    { lat: 33.7756, lng: -84.3963 },
    { lat: 40.7128, lng: -74.0060 },
  );
  assert.ok(atlantaToNewYork > 1190000 && atlantaToNewYork < 1210000);
  assert.equal(haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
});

test('distance sorting is stable for equal points and does not mutate input', () => {
  const locations = [
    { id: 'far', lat: 2, lng: 0 },
    { id: 'near', lat: 0.1, lng: 0 },
    { id: 'same', lat: 0.1, lng: 0 },
  ];
  const sorted = sortLocationsByDistance(locations, { lat: 0, lng: 0 });
  assert.deepEqual(sorted.map(location => location.id), ['near', 'same', 'far']);
  assert.deepEqual(locations.map(location => location.id), ['far', 'near', 'same']);
  assert.ok(sorted[0].distanceMeters < sorted[2].distanceMeters);
});

test('distance utilities reject invalid coordinates and format metric units', () => {
  assert.throws(() => haversineDistanceMeters({ lat: 91, lng: 0 }, { lat: 0, lng: 0 }), TypeError);
  assert.throws(() => sortLocationsByDistance([], { lat: 0, lng: 181 }), TypeError);
  assert.equal(formatDistance(350), '350 m away');
  assert.equal(formatDistance(1400), '1.4 km away');
});
