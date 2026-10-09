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

For App Engine, configure `FIREBASE_DATABASE_URL` alongside `FIREBASE_API_KEY`
in `app.yaml`'s `env_variables`.

(Ignore this for local testing)
For hosting on App Engine, add the key under `env_variables` in `app.yaml`; As so: 
```yaml
runtime: java21
env: standard
env_variables:
    FIREBASE_API_KEY: "your-browser-key"
    FIREBASE_DATABASE_URL: "https://your-project-default-rtdb.firebaseio.com"
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
