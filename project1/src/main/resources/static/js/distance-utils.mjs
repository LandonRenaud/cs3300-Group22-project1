const EARTH_RADIUS_METERS = 6371008.8;

// Ensure the search coordinates are valid
function validCoordinate(value) {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && value.lat >= -90 && value.lat <= 90
    && value.lng >= -180 && value.lng <= 180);
}

/** Return the straight-line distance between two latitude/longitude points. */
export function haversineDistanceMeters(first, second) {
  if (!validCoordinate(first) || !validCoordinate(second)) {
    throw new TypeError("Haversine distance requires finite latitude/longitude points.");
  }

  const toRadians = value => value * Math.PI / 180;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;
  const normalizedA = Math.min(1, Math.max(0, a));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(normalizedA), Math.sqrt(1 - normalizedA));
}

/** Sort a copy of normalized locations by straight-line distance to reference. */
export function sortLocationsByDistance(locations, reference) {
  if (!Array.isArray(locations)) throw new TypeError("Locations must be an array.");
  if (!validCoordinate(reference)) throw new TypeError("A valid reference point is required.");
  return locations
    .map((location, index) => ({
      location,
      index,
      distanceMeters: haversineDistanceMeters(reference, location)
    }))
    .sort((first, second) => first.distanceMeters - second.distanceMeters || first.index - second.index)
    .map(entry => ({ ...entry.location, distanceMeters: entry.distanceMeters }));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters < 0) return "Distance unavailable";
  if (meters < 1000) return `${Math.round(meters)} m away`;
  return `${(meters / 1000).toFixed(1)} km away`;
}

export function isValidCoordinate(value) {
  return validCoordinate(value);
}
