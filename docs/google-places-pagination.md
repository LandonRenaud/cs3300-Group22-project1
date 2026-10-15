# Google Places pagination

LocalLens currently uses the Maps JavaScript API's legacy `google.maps.places.PlacesService.nearbySearch` method in `map-scripts.js`. This is the only Places search method used by the application.

All three LocalLens search paths use that same nearby search after the search center is resolved:

- A named address is geocoded first, then nearby search runs around the geocoded point.
- Explicit coordinates run nearby search directly.
- A keyword-only search runs nearby search around the current map center.

Geocoding is a separate single-response operation and is not paginated. The application does not use `textSearch`, `findPlaceFromQuery`, or a Places REST endpoint, so those modes are not changed or implicitly supported by this feature.

## Supported behavior

The legacy nearby-search callback supplies an optional `PlaceSearchPagination` object. LocalLens exposes a **Load More Results** button only when that object reports `hasNextPage` and provides `nextPage()`. The button is disabled while a page is loading and while the required delay between pages is pending. Pages are fetched only after an explicit click; LocalLens never automatically walks all available pages.

Accumulated results are deduplicated by Google `place_id` when present, normalized before display, and appended to the existing marker layer. Distance-ranked searches re-sort the complete accumulated set after every page so the list remains globally ranked by distance.

## API limitations

The legacy API returns up to 20 results per page and up to 60 results across three pages. Google requires waiting about two seconds before requesting the next page and documents the paginated search as one request against usage limits. Additional page retrieval still creates extra work, so it remains explicitly user-triggered rather than automatic. A page failure or unavailable pagination object leaves already displayed results intact, reports an error for a failed additional page, and disables pagination until the user starts another search.

The Places Library is now a legacy product. Existing projects remain supported, but new Google Cloud projects can no longer enable Places API (Legacy) as of October 2026. This change deliberately retains the existing integration and credentials; migrating to Places API (New) is outside the scope of this PR.
