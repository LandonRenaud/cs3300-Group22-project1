# TASK-18: locations on the map

TASK-18 owns the location markers, their update/cleanup behavior, selection callbacks,
and requests to fit the map to results. The reusable module is
`project1/src/main/resources/static/js/location-markers.js`.

The map provider (TASK-14), search requests (TASK-17), and filter rules (TASK-19)
remain separate. No production page, authentication flow, backend, or database is
changed by this feature. The example uses synthetic data, not live search results.

## Location format

| Field | Contract |
| --- | --- |
| `id` | Optional nonempty string or finite number. Prefer the provider's stable ID. |
| `name` | Optional string. Blank or missing names become `Unnamed location`. |
| `lat` | Required finite number between -90 and 90, inclusive. |
| `lng` | Required finite number between -180 and 180, inclusive. |
| `address` | Optional string. |
| `types` | Optional array of strings. |

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

`examples/task18/leaflet-map-adapter.js` is a working reference for Leaflet 1.9.4.
It does not choose or initialize the team's production map. Another provider only
needs an implementation of these two methods. Popup text must be built with text
nodes or `textContent`, not interpolated into HTML.

## Host page integration

The following snippet assumes the host already has a ready `mapAdapter` and a
`selectResult` callback for its text list; these are integration points, not
existing TASK-14/17 APIs:

```js
import { createLocationLayer } from "./js/location-markers.js";

const locationLayer = createLocationLayer(mapAdapter, {
  onSelect: location => selectResult(location.id)
});

locationLayer.setLocations(searchResults, { fitView: true });
locationLayer.setLocations(filteredResults);
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

TASK-14 should create the map after its container is visible and has a height.
The current `logged-in.html` starts hidden during authentication, so initialization
must wait for that page state. If results arrive first, retain the latest collection
and render it after map readiness; do not create another map for each result update.

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

These checks establish the standalone module and demo. End-to-end TASK-18
integration still requires the actual TASK-14 map, TASK-17 search results, TASK-19
filter output, and the team's production page to be tested together.
