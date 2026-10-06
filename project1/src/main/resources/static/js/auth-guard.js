import { getFirebaseUser } from "./firebase-auth.js";

export function logOut() {
  sessionStorage.removeItem("firebaseIdToken");
  window.location.replace("/landingpage.html");
}

export async function redirectIfAuthenticated() {
  const token = sessionStorage.getItem("firebaseIdToken");
  if (!token) return false;

  try {
    const result = await getFirebaseUser(token);
    if (!result.users?.length) throw new Error("Invalid Firebase user token.");
    window.location.replace("/homepage.html");
    return true;
  } catch {
    sessionStorage.removeItem("firebaseIdToken");
    return false;
  }
}

export async function requireAuth() {
  const token = sessionStorage.getItem("firebaseIdToken");

  if (!token) {
    window.location.replace("/landingpage.html");
    return null;
  }

  try {
    const result = await getFirebaseUser(token);
    if (!result.users?.length) throw new Error("Invalid Firebase user token.");

    document.body.hidden = false;
    return result.users[0];
  } catch {
    sessionStorage.removeItem("firebaseIdToken");
    window.location.replace("/landingpage.html");
    return null;
  }
}
