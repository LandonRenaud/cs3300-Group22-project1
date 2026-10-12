# cs3300-project1

## Build and run

From the `project1` directory, start the website:

```powershell
mvn spring-boot:run
```

Open `http://localhost:8080/` or `http://localhost:8080/landingpage.html` for
the login page. After signing in, the map is available at
`http://localhost:8080/homepage.html`. Press `Ctrl+C` to stop
the server.

## Google Maps API

Set the Google Maps browser key in the local environment before starting the
app. Restrict the key to the Maps JavaScript API and the website referrers used
by the app.

```powershell
$env:GOOGLE_MAPS_API_KEY = "your-google-maps-browser-key"
mvn spring-boot:run
```

```sh
$ export GOOGLE_MAPS_API_KEY="your-google-maps-browser-key"
$ mvn spring-boot:run
```

## Firebase authentication

Enable **Authentication > Sign-in method > Email/Password** in the Firebase
project. Set its Browser Key in the local environment before starting the app:

To find the `firebase-browser-key`, go to the project on Google Cloud and go to "APIs & Services". Here, click on "Credentials" and the key should be able to be seen and able to be copy/pasted under the option titled "Browser key (auto created by Firebase)". 

```powershell
$env:FIREBASE_API_KEY = "your-firebase-browser-key"
$env:FIREBASE_DATABASE_URL = "https://your-project-default-rtdb.firebaseio.com"
mvn spring-boot:run
```

```sh
$ export FIREBASE_API_KEY="your-firebase-browser-key"
$ export FIREBASE_DATABASE_URL="https://your-project-default-rtdb.firebaseio.com"
$ mvn spring-boot:run
```

The database URL is shown in Firebase Console under **Realtime Database**. Create
the database in locked mode, then set its **Rules** to this preliminary policy:

```json
{
  "rules": {
    "reviews": {
      ".read": "auth !== null",
      "$placeId": {
        "$uid": {
          ".write": "auth !== null && auth.uid === $uid && !data.exists()",
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

These rules allow authenticated users to read all reviews and create one review
per location under their own Firebase UID. The client uses the location's Google
Place ID as the location key. Reviewers can leave the name blank to appear as
"Anonymous LocalLens User". This initial version does not support editing or
deleting reviews. Review reads/writes require the Firebase ID token already
stored by the existing sign-in flow.

For App Engine, configure `GOOGLE_MAPS_API_KEY`, `FIREBASE_API_KEY`, and
`FIREBASE_DATABASE_URL` in `app.yaml`'s `env_variables`.

## Continuous integration and deployment

The GitHub Actions workflow runs the Maven `verify` lifecycle and the JavaScript
test suite on pull requests to `main`. When a pull request is merged, it runs
both test jobs against the merged commit and deploys to Google App Engine only
after they pass. The Maven build uses Java 21 and packages the app from
`project1/`; App Engine deploys `project1/app.yaml`.

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

(Ignore this for local testing)
For hosting on App Engine, add the key under `env_variables` in `app.yaml`; As so: 
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

Run its JavaScript tests from the repository root with Node.js 22:

```sh
node --experimental-default-type=module --test tests/task18/*.test.mjs
```

## Search history (TASK-20)

Signed-in users can reopen recent searches, restore their filters and map area,
and remove individual entries or clear their history. The latest 10 searches
are saved per account in the current browser. See
[TASK-20 behavior and verification](docs/task20-search-history.md).

Run all JavaScript tests with Node.js 22:

```sh
node --experimental-default-type=module --test tests/*.test.mjs tests/task18/*.test.mjs tests/task20/*.test.mjs
```
