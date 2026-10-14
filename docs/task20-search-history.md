# Search history (TASK-20)

After signing in, open **Search history** below the location search form.
The most recent 10 completed searches appear newest first. Select an entry to
restore the location, keyword, all advanced settings, and original map context,
then run a fresh search. Each entry has a remove button; **Clear all** removes
this account's history from this browser.

## Behavior and storage

- Successful searches with no matches are included. Empty input, provider errors,
  failed geocoding, and superseded requests are excluded.
- Automatic filter refreshes update the current results without creating an
  additional history entry; an explicit Search submission remains recordable.
- Repeating an equivalent search moves it to the top. Query/keyword comparison
  ignores case and surrounding whitespace. Filters and map context distinguish
  searches; coordinate searches ignore the previous viewport for deduplication.
- Inputs and the effective map center, zoom, and bounds are captured for replay.
  Named-location searches additionally save their resolved search center, so a
  Chicago search submitted while viewing Atlanta replays around Chicago. Saved
  context is used for the map view but never clips nearby results to an old
  viewport. Results are fetched again and can change over time.
- History starts only after the existing Firebase lookup returns a user `localId`.
  Its versioned localStorage key is
  `cs3300.search-history.v1:<encoded-localId>`. It persists across reloads and
  logout/login in the same browser. Another signed-in user gets a separate key.
- Only submitted inputs, map context, an entry ID, and a timestamp are stored;
  Google result data and authentication tokens are not saved in history.
- This is browser-local persistence, with no server database or cross-device
  sync. Namespacing separates the app's account views; it does not encrypt browser
  storage or protect it from someone with access to that browser profile.
- Invalid stored records are ignored. If storage is blocked or full, history
  remains usable in memory and the UI explains that it is kept for this page
  only. A failed write/delete cannot guarantee removal of older persisted data.
- Clear/remove invalidate pending history writes in that page. Storage events
  refresh other tabs and invalidate their pending history writes; mutations also
  reload the latest saved snapshot. Concurrent localStorage operations are best
  effort, not transactional.

The Location field is resolved as a search center through coordinates or global
geocoding, while a blank Location uses the current map center. History labels
describe saved settings; distance ranking omits radius because Google Places
rejects that combination.

## Verification

Run all JavaScript tests from the repository root with Node 22:

```sh
node --experimental-default-type=module --test tests/*.test.mjs tests/task18/*.test.mjs tests/task20/*.test.mjs
```

The TASK-20 suite covers per-account persistence, reload, deduplication, the
10-entry limit, malformed data, storage failures, cross-tab refresh, safe text
rendering, focus recovery, restored filters/map scope, stale results, and deletion
during requests. The shared map harness also runs the existing marker/search
regressions. CI runs the full JavaScript suite and the existing Maven tests:

```sh
cd project1
mvn --batch-mode test
```

An optional browser smoke test uses Playwright and an installed Google Chrome:

```sh
# Set PLAYWRIGHT_MODULE to an installed Playwright package path if it is not
# available through Node's normal module resolution.
node tests/task20/browser-smoke.cjs
```

It serves the production files locally, supplies deterministic Maps and Firebase
HTTP fixtures, and checks empty state, persistence, replay, removal, the history
limit, cross-tab clearing, and desktop/mobile layout. Screenshots and a JSON
receipt go to the system temp directory under `cs3300-task20-browser` (override
with `BROWSER_TEST_OUTPUT`). These checks do not validate live Firebase login,
Google service availability, or production deployment.
