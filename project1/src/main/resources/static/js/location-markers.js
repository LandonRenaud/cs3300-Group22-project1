export function normalizeLocations(locations) {
  if (!Array.isArray(locations)) {
    throw new TypeError("Locations must be an array.");
  }

  const normalized = [];
  const seen = new Set();
  let skippedCount = 0;
  let duplicateCount = 0;

  for (const location of locations) {
    if (!location || typeof location !== "object"
        || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90
        || !Number.isFinite(location.lng) || Math.abs(location.lng) > 180) {
      skippedCount += 1;
      continue;
    }

    const name = typeof location.name === "string" && location.name.trim()
      ? location.name.trim() : "Unnamed location";
    const sourceId = typeof location.id === "string" ? location.id.trim()
      : Number.isFinite(location.id) ? String(location.id) : "";
    const id = sourceId || `generated:${JSON.stringify([name, location.lat, location.lng])}`;

    if (seen.has(id)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(id);

    normalized.push({
      id,
      name,
      lat: location.lat,
      lng: location.lng,
      address: typeof location.address === "string" ? location.address.trim() : "",
      types: Array.isArray(location.types)
        ? [...new Set(location.types.filter(type => typeof type === "string")
          .map(type => type.trim()).filter(Boolean))]
        : []
    });
  }

  return { locations: normalized, skippedCount, duplicateCount };
}

export function createLocationLayer(mapAdapter, { onSelect } = {}) {
  if (!mapAdapter || typeof mapAdapter.addMarker !== "function"
      || typeof mapAdapter.fitLocations !== "function") {
    throw new TypeError("A map adapter must provide addMarker and fitLocations.");
  }
  if (onSelect !== undefined && typeof onSelect !== "function") {
    throw new TypeError("onSelect must be a function.");
  }

  let markers = [];
  let destroyed = false;

  function removeMarkers(entries) {
    for (const entry of entries) {
      entry.active = false;
      entry.marker.remove();
    }
  }

  function clear() {
    removeMarkers(markers);
    markers = [];
  }

  function setLocations(locations, { fitView = false } = {}) {
    if (destroyed) {
      throw new Error("This location layer has been destroyed.");
    }

    const result = normalizeLocations(locations);
    const nextMarkers = [];

    try {
      for (const location of result.locations) {
        const entry = { marker: null, active: false };
        entry.marker = mapAdapter.addMarker(location, () => {
          if (entry.active && !destroyed) onSelect?.(location);
        });
        if (!entry.marker || typeof entry.marker.remove !== "function") {
          throw new TypeError("addMarker must return an object with remove().");
        }
        nextMarkers.push(entry);
      }
    } catch (error) {
      removeMarkers(nextMarkers);
      throw error;
    }

    clear();
    markers = nextMarkers;
    for (const entry of markers) entry.active = true;

    if (fitView && result.locations.length > 0) {
      mapAdapter.fitLocations(result.locations);
    }

    return {
      displayedCount: result.locations.length,
      skippedCount: result.skippedCount,
      duplicateCount: result.duplicateCount
    };
  }

  function destroy() {
    destroyed = true;
    clear();
  }

  return { setLocations, clear, destroy };
}
