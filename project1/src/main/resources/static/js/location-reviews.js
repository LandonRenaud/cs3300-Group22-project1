import { firebaseConfigReady } from "./firebase-auth.js";
import { canWriteReview, prepareReviewDraft } from "./review-utils.mjs";

const status = document.querySelector(".reviews-status");
const list = document.querySelector(".reviews-list");
const openButton = document.querySelector(".review-open-button");
const form = document.querySelector(".review-form");
const formMessage = document.querySelector(".review-form-message");
const cancelButton = document.querySelector(".review-cancel-button");
let currentPlaceId = null;
let currentUser = null;
let requestVersion = 0;
let loadedReviewsPlaceId = null;
let submitting = false;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function databasePath(placeId, userId = null) {
  return ["reviews", placeId, ...(userId ? [userId] : [])].map(encodeURIComponent).join("/");
}

async function databaseRequest(path, { method = "GET", body } = {}) {
  const config = await firebaseConfigReady;
  if (!config.databaseUrl) throw new Error("Configure FIREBASE_DATABASE_URL to enable reviews.");
  const token = sessionStorage.getItem("firebaseIdToken");
  if (!token) throw new Error("Sign in again to access reviews.");
  const response = await fetch(`${config.databaseUrl.replace(/\/$/, "")}/${path}.json?auth=${encodeURIComponent(token)}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Firebase denied access. Check your Realtime Database rules and sign-in status.");
    }
    throw new Error(result?.error || "The review service is unavailable.");
  }
  return result;
}

function renderReviews(reviews) {
  list.replaceChildren();
  const entries = Object.entries(reviews || {}).sort(([, a], [, b]) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  for (const [, review] of entries) {
    const item = document.createElement("li");
    item.className = "review-item";
    const heading = document.createElement("header");
    const author = document.createElement("strong");
    author.textContent = review.author || "Community member";
    const rating = document.createElement("span");
    rating.textContent = `${review.rating}/5`;
    heading.append(author, rating);
    const comment = document.createElement("p");
    comment.textContent = review.comment;
    const date = document.createElement("small");
    date.textContent = new Date(review.createdAt).toLocaleDateString();
    item.append(heading, comment, date);
    list.append(item);
  }
  setStatus(entries.length ? "" : "No reviews yet. Be the first to review this location.");
}

async function loadReviews(placeId) {
  const version = ++requestVersion;
  currentPlaceId = placeId;
  loadedReviewsPlaceId = null;
  list.replaceChildren();
  form.hidden = true;
  openButton.hidden = true;
  setStatus("Loading reviews...");
  try {
    const reviews = await databaseRequest(databasePath(placeId));
    if (version === requestVersion && currentPlaceId === placeId) {
      renderReviews(reviews);
      loadedReviewsPlaceId = placeId;
      const alreadyReviewed = currentUser && !canWriteReview(reviews, currentUser.localId);
      openButton.hidden = !currentUser || alreadyReviewed;
      if (alreadyReviewed) setStatus("You've already reviewed this location.");
    }
  } catch (error) {
    if (version === requestVersion) setStatus(error.message);
  }
}

document.addEventListener("location-selected", event => loadReviews(event.detail.id));
document.addEventListener("location-cleared", () => {
  requestVersion++;
  currentPlaceId = null;
  loadedReviewsPlaceId = null;
  list.replaceChildren();
  form.hidden = true;
  openButton.hidden = true;
  setStatus("Select a location to view reviews.");
});
document.addEventListener("firebase-user-ready", event => {
  currentUser = event.detail;
  if (loadedReviewsPlaceId === currentPlaceId && currentPlaceId) {
    databaseRequest(databasePath(currentPlaceId, currentUser.localId))
      .then(review => {
        if (loadedReviewsPlaceId !== currentPlaceId) return;
        openButton.hidden = Boolean(review);
        if (review) setStatus("You've already reviewed this location.");
      })
      .catch(error => setStatus(error.message));
  }
});

openButton.addEventListener("click", () => {
  form.hidden = false;
  openButton.hidden = true;
  form.querySelector("select").focus();
});
cancelButton.addEventListener("click", () => {
  form.reset();
  form.hidden = true;
  formMessage.hidden = true;
  openButton.hidden = !currentPlaceId;
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  const placeId = currentPlaceId;
  if (!placeId || !currentUser?.localId || loadedReviewsPlaceId !== placeId || submitting) return;
  const draft = prepareReviewDraft({
    author: form.elements.author.value,
    rating: form.elements.rating.value,
    comment: form.elements.comment.value
  });
  if (!draft.valid) {
    formMessage.textContent = draft.message;
    formMessage.hidden = false;
    return;
  }
  const submitButton = form.querySelector('[type="submit"]');
  submitting = true;
  submitButton.disabled = true;
  formMessage.hidden = true;
  try {
    const existingReview = await databaseRequest(databasePath(placeId, currentUser.localId));
    if (!canWriteReview(existingReview ? { [currentUser.localId]: existingReview } : null, currentUser.localId)) {
      form.hidden = true;
      openButton.hidden = true;
      setStatus("You've already reviewed this location.");
      return;
    }
    await databaseRequest(databasePath(placeId, currentUser.localId), {
      method: "PUT",
      body: { ...draft.value, createdAt: Date.now() }
    });
    form.reset();
    form.hidden = true;
    if (currentPlaceId === placeId) await loadReviews(placeId);
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.hidden = false;
  } finally {
    submitting = false;
    submitButton.disabled = false;
  }
});
