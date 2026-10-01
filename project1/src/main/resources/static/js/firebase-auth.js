const firebaseConfigReady = fetch("/api/firebase-config").then(async (response) => {
  const config = await response.json();
  if (!response.ok) {
    throw new Error(config.error || "Firebase configuration is unavailable.");
  }
  return config;
});

async function firebaseAuthRequest(endpoint, body) {
  const config = await firebaseConfigReady;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=${encodeURIComponent(config.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message || "Firebase authentication failed.");
  }
  return result;
}

export function signInWithEmailAndPassword(email, password) {
  return firebaseAuthRequest("signInWithPassword", { email, password, returnSecureToken: true });
}

export function createUserWithEmailAndPassword(email, password) {
  return firebaseAuthRequest("signUp", { email, password, returnSecureToken: true });
}

export function getFirebaseUser(idToken) {
  return firebaseAuthRequest("lookup", { idToken });
}

export { firebaseConfigReady };