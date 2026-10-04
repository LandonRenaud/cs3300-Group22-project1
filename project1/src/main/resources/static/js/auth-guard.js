import { getFirebaseUser } from "./firebase-auth.js";

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
