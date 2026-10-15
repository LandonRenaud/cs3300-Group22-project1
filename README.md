# LocalLens

## Overview

LocalLens is a app that lets you discover what's around you. It helps users find restaurants, shops, parks, and other points of interests. Users can search by location, adjust filters (e.g. place type, distance, price range, etc.), and view results on a interactive map. Users are also able to read reviews left by other members of the community and leave reviews of their own.

## Release Notes

### Functionality delivered

- Create an account and sign in with Firebase Email/Password authentication.
- Search for nearby places by address, coordinates, or the current map center;
  filter and rank results, view them on a map, and load additional result pages.
- View community ratings and reviews for a selected place.
- Use the responsive web interface to explore local places.

### Team-selected additional features

- **Community reviews:** signed-in users can add one review per place and delete
  their own review. Reviews include a 1–5 rating and comment.
- **Search history:** signed-in users can restore or remove recent searches.
  The latest 10 entries are kept per account in the current browser.

### Significant bug fixes

- A development-time Firebase authentication issue that prevented the sign-in
  flow from working correctly was debugged and resolved. No authentication bug
  is currently known.

### Known bugs, defects, and limitations

- No known application bugs or defects at this time. Google Maps, Firebase, and
  cloud deployment still depend on valid project configuration, credentials,
  service availability, and applicable quotas.
- LocalLens currently uses Google Places API (Legacy) nearby search. Migration
  to Places API (New) is not included. New Google Cloud projects may not be able
  to enable the legacy Places service; see
  [Google Places pagination](docs/google-places-pagination.md) for the API
  limitations.
- There is no known incomplete core application feature beyond those service
  and synchronization limitations.

## Installation and Run Guide

### Prerequisites

- A computer with a modern browser and internet access. No special hardware is
  required.
- JDK 21 and Apache Maven 3.6.3 or newer, available on `PATH`.
- A Firebase project configured for Email/Password Authentication and Realtime
  Database.
- A Google Cloud project with the Google Maps JavaScript API and the Places
  service enabled, billing configured as required by Google, and a browser API
  key. See the Places API limitation in [Release Notes](#release-notes).
- For running the JavaScript and browser tests only: Node.js 22 and npm. These
  are not required to run the application.

### Dependencies and services

- The Java server uses Spring Boot Web and is built with Maven; Maven downloads
  the Java dependencies declared in `project1/pom.xml`.
- The browser uses Google Maps JavaScript API (including Maps, Marker, and
  Places libraries) for map display, geocoding, and nearby-place search.
- Firebase Authentication provides email/password sign-in, and Firebase
  Realtime Database stores community reviews.
- Optional test dependencies include Node.js test tooling and Playwright
  (declared in the root `package.json`).

### Download or clone

Clone the course repository using its Git URL:

```sh
git clone <repository-url>
cd cs3300-Group22-project1
```

Replace `<repository-url>` with the repository URL provided by the course or
your team. If you already have the project files, open the repository root
instead.

### Build

Build and run the Java tests from the `project1` directory:

```sh
cd project1
mvn clean verify
```

The first Maven build needs internet access to download dependencies. To build
without running tests, use `mvn clean package`.

### Configuration and installation

Set these environment variables in the same terminal session from which you
will start the application:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_MAPS_API_KEY` | Browser key used to load Google Maps and Places. Restrict it to the required APIs and your local/deployed website referrers. |
| `FIREBASE_API_KEY` | Firebase project's browser API key, used for Authentication. |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL, shown in Firebase Console under **Realtime Database**. |

For a Firebase setup, enable **Authentication > Sign-in method >
Email/Password**, create a Realtime Database, and apply the project's review
rules from [`firebase.database.rules.json`](firebase.database.rules.json) in
**Realtime Database > Rules**. Without the database URL, authentication can be
configured but community reviews will not work. See
[Firebase authentication](#firebase-authentication) below for details.

On macOS or Linux:

```sh
export GOOGLE_MAPS_API_KEY="your-google-maps-browser-key"
export FIREBASE_API_KEY="your-firebase-browser-key"
export FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
```

On Windows PowerShell:

```powershell
$env:GOOGLE_MAPS_API_KEY = "your-google-maps-browser-key"
$env:FIREBASE_API_KEY = "your-firebase-browser-key"
$env:FIREBASE_DATABASE_URL = "https://your-project-default-rtdb.firebaseio.com"
```

These are browser-facing API keys, not server-side passwords. Restrict each key
by API and allowed website referrer; do not commit personal credentials or
project-specific keys to source control.

### Run

From the `project1` directory, start the local server:

```sh
mvn spring-boot:run
```

Open [http://localhost:8080/](http://localhost:8080/) in a browser. Sign in or
create an account, then use
[http://localhost:8080/homepage.html](http://localhost:8080/homepage.html) to
search for places. Stop the server with `Ctrl+C`. Keep the terminal open while
using the application; the required environment variables must be set in that
terminal.

### Troubleshooting

- **The map or places do not load:** confirm `GOOGLE_MAPS_API_KEY` is set in the
  server's environment, the required Google APIs are enabled, billing and
  quotas are in order, and the key's API/referrer restrictions include the
  local site. Restart the server after changing environment variables.
- **Sign-in or registration is unavailable:** confirm
  `FIREBASE_API_KEY` is set and Email/Password sign-in is enabled in Firebase.
  Check the browser console and server output for configuration or service
  errors.
- **Reviews cannot be viewed or saved:** confirm `FIREBASE_DATABASE_URL` is the
  correct Realtime Database URL and that the rules in
  [`firebase.database.rules.json`](firebase.database.rules.json) are deployed.
  Reviews require a signed-in user.
- **Maven reports an unsupported Java version or is not found:** verify that
  JDK 21 and Maven 3.6.3 or newer are installed and that `java` and `mvn` resolve
  to those installations in the same terminal.
- **Port 8080 is already in use:** stop the other process using that port or run
  Spring Boot with a different port, for example
  `mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8081`, then open
  the corresponding localhost URL.
- **Google returns a Places API availability error:** the current integration
  uses Places API (Legacy), which may not be enabled for newly created Google
  Cloud projects. See [Google Places pagination](docs/google-places-pagination.md).

### Optional test commands

From the repository root, run the JavaScript unit and integration tests:

```sh
npm ci
node --test tests/*.test.mjs tests/task18/*.test.mjs tests/task20/*.test.mjs
```

The Chromium browser tests additionally need Playwright's browser:

```sh
npx playwright install chromium
node --test tests/task20/browser-regression.cjs
node tests/task20/browser-smoke.cjs
```

The tests use deterministic service fixtures and do not require live Google,
Firebase, or Google Cloud credentials.

## Google Maps API

Set the Google Maps browser key in the local environment before starting the
app. Restrict the key to the Maps JavaScript API and the website referrers used
by the app.

#
### Windows

```powershell
$env:GOOGLE_MAPS_API_KEY = "your-google-maps-browser-key"
mvn spring-boot:run
```

#
### Linux/MacOS
```sh
$ export GOOGLE_MAPS_API_KEY="your-google-maps-browser-key"
$ mvn spring-boot:run
```

## Firebase authentication

Enable **Authentication > Sign-in method > Email/Password** in the Firebase
project. Set its Browser Key in the local environment before starting the app:

To find the `firebase-browser-key`, go to the project on Google Cloud and go to "APIs & Services". Here, click on "Credentials" and the key should be able to be seen and able to be copy/pasted under the option titled "Browser key (auto created by Firebase)".

### Windows

```powershell
$env:FIREBASE_API_KEY = "your-firebase-browser-key"
$env:FIREBASE_DATABASE_URL = "https://your-project-default-rtdb.firebaseio.com"
mvn spring-boot:run
```

### Linux/MacOS

```sh
$ export FIREBASE_API_KEY="your-firebase-browser-key"
$ export FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
$ mvn spring-boot:run
```

The database URL is shown in Firebase Console under **Realtime Database**. Create
the database in locked mode, then deploy the canonical policy in
[`firebase.database.rules.json`](firebase.database.rules.json), or set its
**Rules** to this policy:

```json
{
  "rules": {
    "reviews": {
      ".read": "auth != null",
      "$placeId": {
        "$uid": {
          ".write": "auth != null && auth.uid == $uid && ((!data.exists() && newData.exists()) || (data.exists() && !newData.exists()))",
          ".validate": "newData.hasChildren(['author', 'rating', 'comment', 'createdAt'])",
          "author": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 80" },
          "rating": { ".validate": "newData.isNumber() && newData.val() >= 1 && newData.val() <= 5" },
          "comment": { ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 2000" },
          "createdAt": { ".validate": "newData.isNumber()" },
          "$other": { ".validate": false }
        }
      }
    }
  }
}
```

These rules allow authenticated users to read all reviews, create one review per
location under their own Firebase UID, and delete only their own existing review.
They intentionally do not allow updates/overwrites. The client uses the
location's Google Place ID as the location key. Reviewers can leave the name
blank to appear as "Anonymous LocalLens User". Review reads/writes require the
Firebase ID token already stored by the existing sign-in flow.

The application does not deploy Firebase rules. A teammate with Firebase project
access must paste [`firebase.database.rules.json`](firebase.database.rules.json)
into Firebase Console under **Realtime Database > Rules**, or deploy it with the
Firebase CLI, before relying on review deletion. Test deletion, cross-user denial,
and update denial in the Firebase emulator or Console after configuring the
project.

The GitHub Actions App Engine deploy step supplies `GOOGLE_MAPS_API_KEY`,
`FIREBASE_API_KEY`, and `FIREBASE_DATABASE_URL` as runtime environment
variables, so they do not need to be defined in `app.yaml` for CI deployments.
For manual deployments outside this workflow, configure these values in the
App Engine service's `env_variables` before deploying.

## Continuous integration and deployment

The GitHub Actions workflow runs the Maven `verify` lifecycle and the JavaScript
test suite on pull requests to `main` and on direct pushes. A push to `main`
deploys to Google App Engine only after both jobs pass; feature-branch pushes
and pull requests never receive deployment credentials. The Maven build uses
Java 21 and packages the app from
`project1/`; the App Engine deploy action deploys `project1/app.yaml` and passes
the configured GitHub Actions secrets as runtime environment variables.

Configure these GitHub repository **Variables**:

- `GCP_PROJECT_ID`: the Google Cloud project that owns the App Engine app.
- `GCP_WORKLOAD_IDENTITY_PROVIDER`: the full Workload Identity Provider resource
  name, for example `projects/123456789/locations/global/workloadIdentityPools/github/providers/github`.
- `GCP_DEPLOY_SERVICE_ACCOUNT`: the deploy service account email.

Configure these GitHub repository **Secrets** for the runtime configuration:

- `GOOGLE_MAPS_API_KEY`
- `FIREBASE_API_KEY`
- `FIREBASE_DATABASE_URL`

In Google Cloud, create the App Engine application, configure Workload Identity
Federation to trust this repository's GitHub Actions workflow, and grant the
service account the permissions needed to deploy App Engine versions and use
the project's build and staging services. Grant the GitHub identity permission
to impersonate that service account. Keep the provider restricted to this
repository and the `main` branch. The workflow uses short-lived federation
credentials instead of a stored service-account key. Browser API keys are
delivered to client code by this app, so restrict them by API and allowed site
referrers even when stored as GitHub Secrets.

Required checks and merge blocking are repository settings, not workflow code.
Configure GitHub branch protection or a ruleset for `main` to require both test
jobs before merging. A successful workflow in this repository is still required
to verify the real production deployment and live API credentials; local tests do
not establish cloud quota, key restrictions, Firebase rules, or App Engine
access.

For a manual App Engine deployment, `app.yaml` can include:
```yaml
runtime: java21
env: standard
env_variables:
    FIREBASE_API_KEY: "your-browser-key"
    FIREBASE_DATABASE_URL: "https://your-project-default-rtdb.firebaseio.com"
    GOOGLE_MAPS_API_KEY: "your-google-maps-browser-key"
service: default
```

Restrict the
Browser Key to the Firebase Authentication API and the app's website referrers
in Google Cloud. The signed-in page verifies the ID token with Firebase in the
browser; backend routes serving private data must validate Firebase ID tokens
independently.

To build and test without starting the server:

```powershell
mvn clean test
```

## Location markers (TASK-18)

The reusable location-marker module and an isolated demo are documented in
[TASK-18 integration](docs/task18-integration.md). The production Google Map uses the marker layer for search and filter results.
The isolated Leaflet demo uses synthetic places and can be run without signing in.

The Location field is the search center: named cities, landmarks, and addresses
are geocoded before a nearby Places search. A blank Location searches around the
current map center. Results are not clipped to the viewport that existed before
the search, and the selected radius is sent for prominence ranking. Google
Places' distance ranking does not accept a radius, so the radius control is
disabled in that mode. Results show straight-line distance estimates calculated
from the effective search center, while distance ranking sorts results nearest
first.

Google Places pagination support and the legacy API limitations are documented
in [Google Places pagination](docs/google-places-pagination.md).

Run its JavaScript tests from the repository root with Node.js 22:

```sh
node --test tests/task18/*.test.mjs
```

## Search history (TASK-20)

Signed-in users can reopen recent searches, restore their filters and map area,
and remove individual entries or clear their history. The latest 10 searches
are saved per account in the current browser. See
[TASK-20 behavior and verification](docs/task20-search-history.md).

Run all JavaScript tests with Node.js 22:

```sh
node --test tests/*.test.mjs tests/task18/*.test.mjs tests/task20/*.test.mjs
```

Browser regression tests run the production pages in Chromium with deterministic
Google Maps, Places, Firebase Auth, and Realtime Database fixtures:

```sh
npm ci
npx playwright install chromium
node --test tests/task20/browser-regression.cjs
node tests/task20/browser-smoke.cjs
```

GitHub Actions installs Chromium with Linux dependencies and runs both browser
suites. No Google, Firebase, or Google Cloud credentials are required.

History also stores the effective geocoded search center for named-location
replay, while keyword-only searches retain their original map center context.

# Team Developers and Main Tasks: 
1. Sergio Chavez - Authentication Setup/Code, Presentation Design, Testing Application
2. Kevin Chen - Google Maps Setup, Lat/Long Input
3. Renkai Chen - Searching / Search Filtering, Basic Map Pins, Frontend Design
4. Lijie Liu - Map Integration, Search History, Testing & Documentation
5. Landon Renaud - GCP hosting & CI/CD pipeline, User Review functionality
6. James Tan - Search Improvements, Firebase Reviews, CI/CD, Presentation Content
