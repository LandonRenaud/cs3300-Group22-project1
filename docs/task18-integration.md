# TASK-18: locations on the map

TASK-18 owns the location markers, their update/cleanup behavior, selection callbacks,
and requests to fit the map to results. The reusable module is
`project1/src/main/resources/static/js/location-markers.js`.

The production integration uses the team's Google Maps component in
`homepage.html` and the existing search/filter flow in `js/map-scripts.js`.
`js/google-maps-adapter.js` connects the shared marker layer to Google Advanced
Markers. Authentication, search/filter request rules, and the starred search-center
pin are preserved. The separate Leaflet example still uses synthetic data.

## Location format

| Field | Contract |
| --- | --- |
| `id` | Optional nonempty string or finite number. Prefer the provider's stable ID. |
| `name` | Optional string. Blank or missing names become `Unnamed location`. |
| `lat` | Required finite number between -90 and 90, inclusive. |
| `lng` | Required finite number between -180 and 180, inclusive. |
| `address` | Optional string. |
| `types` | Optional array of strings. |
| `rating` | Optional finite number from 0 through 5; other values become `null`. |

Coordinates of zero are valid. Numeric strings must be converted by the search
response adapter before calling this module. Invalid locations are skipped.
Duplicate IDs keep the first valid record; different IDs at the same coordinates
remain separate places. Missing IDs get a stable fallback derived from name and
coordinates, suitable for display rather than persistent storage. Text is trimmed
and duplicate/blank types are removed. Input objects are not modified.

`normalizeLocations(locations)` returns `{ locations, skippedCount, duplicateCount }`.
It can also be used by the host page to keep its text results aligned with the map.
A non-array input throws before existing markers are changed.

## Map adapter contract

Pass an adapter for an **already initialized, visible map** to
`createLocationLayer(adapter, { onSelect })`. Only two adapter methods are needed:

- `addMarker(location, onSelect)`: add a marker with a safe text popup; call the
  callback when selected; return an object with `remove()`. Removal must close its
  popup, detach listeners, and remove the marker without removing the base map.
- `fitLocations(locations)`: fit a nonempty array of valid places. Use a reasonable
  zoom for one point and cap the zoom when fitting several nearby points.

`js/google-maps-adapter.js` is the production adapter. Markers support hover and
click/keyboard selection, safe text details, and listener/popup cleanup. Its optional
third `addMarker` argument preserves the search-center pin's custom content and
z-index. `examples/task18/leaflet-map-adapter.js` remains a Leaflet 1.9.4 reference.
Both adapters build popup text with DOM nodes and `textContent`.

## Host page integration

The production `map-scripts.js`:

1. Captures the address and filter values when the form is submitted.
2. Waits for the Google maps, marker, geocoding, and places libraries and the
   `gmp-map` element before initializing one adapter and location layer.
3. Keeps the existing search-center behavior and custom starred marker.
4. Converts Google Places results using `normalizeGooglePlaces(places)`, including
   `place_id`, `LatLng` methods or literal coordinates, address, types, and rating.
5. Gives the same normalized collection to the marker layer and the text list,
   skipping invalid coordinates and duplicate IDs in both views.
6. Highlights the matching list item when its marker is selected.
7. Ignores outdated library, geocoder, and Places completions when a newer search
   has started, and distinguishes empty results from service failures.

All existing keyword, radius, price, open-now, ranking, and type filters are kept.
Production updates preserve the searched center and do not automatically fit nearby
results; this keeps the search-center pin in view. Explicit fitting is available to
other callers:

```js
import { createLocationLayer } from "./js/location-markers.js";
import { createGoogleMapsAdapter } from "./js/google-maps-adapter.js";

const adapter = createGoogleMapsAdapter(googleMapElement.innerMap, google.maps);
const layer = createLocationLayer(adapter, { onSelect: selectResult });
layer.setLocations(searchResults);
layer.setLocations(searchResults, { fitView: true });
```

`setLocations` replaces the current markers and returns
`{ displayedCount, skippedCount, duplicateCount }`. View fitting is opt-in and is
never called for empty results. Use it for a new search; omit it on filtering to
preserve the user's map position. If adding a new marker fails, markers added by
that attempt are removed and the previous set remains.

Call `clear()` for an explicit reset, or pass `[]` for a successful empty result.
Call `destroy()` when the owning page is removed; it releases the markers and
disables further updates. Both cleanup methods can be called repeatedly. Removed
markers cannot fire the layer's selection callback.

The host owns loading, search errors, and empty-result messages. Do not pass `[]`
to represent a pending or failed request. Search code must discard stale responses
before updating the map and list. Both views should receive the same current
filtered result collection. Display `skippedCount` if records could not be mapped.

The `homepage.html` body stays hidden until the existing Firebase authentication
guard succeeds. The map container has a height in the team's stylesheet. Testing
the isolated demo does not verify authentication or live Google service access.

## Run the isolated demo

From the repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/examples/task18/`. This development server exposes the
repository locally; it is not a deployment command. The page loads Leaflet and map
tiles over the internet. The example is outside Spring Boot's static directory and
is not included in the application's normal site. Its scene buttons simulate
result updates; they do not implement the team's search or filter features.

## Verification

Run the dependency-free JavaScript tests with Node.js 22:

```sh
node --experimental-default-type=module --test tests/task18/*.test.mjs
```

Run the existing application tests with Java 21 and Maven:

```sh
mvn -f project1/pom.xml test
```

The PR workflow runs these separately as `Location Marker Tests` and `Maven Tests`.
Maven alone does not verify JavaScript behavior.

In the browser, verify several points, one point, replacement, empty results,
invalid/duplicate input, popup selection, safe display of HTML-like text, and a
narrow viewport. Repeating a scenario must not add duplicate markers. Replacing
or clearing the selected place must close its popup.

The Node tests cover the shared layer, Google adapter, and search integration with
controlled service responses, including overlapping searches and filter snapshots.
They do not establish live API quota, key/referrer permissions, or Firebase login.
For an authenticated end-to-end check, run the app, sign in, search an address,
change filters, select a marker, and repeat the search. Check that the map and list
stay aligned and old popups/markers are removed.

Google API references: [Advanced markers](https://developers.google.com/maps/documentation/javascript/reference/advanced-markers)
and [Map API](https://developers.google.com/maps/documentation/javascript/reference/map).
