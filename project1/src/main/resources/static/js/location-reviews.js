import { firebaseConfigReady } from "./firebase-auth.js";
import { canWriteReview, isValidReviewRating, prepareReviewDraft, summarizeReviews } from "./review-utils.mjs";

const status = document.querySelector(".reviews-status");
const summary = document.querySelector(".reviews-summary");
const list = document.querySelector(".reviews-list");
const openButton = document.querySelector(".review-open-button");
const form = document.querySelector(".review-form");
const formMessage = document.querySelector(".review-form-message");
const cancelButton = document.querySelector(".review-cancel-button");
let currentPlaceId = null;
let currentUser = null;
let requestVersion = 0;
let loadedReviewsPlaceId = null;
let currentReviews = null;
let submitting = false;

function setStatus(message) {
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}

function setSummary(reviews) {
  if (!summary) return;
  const result = summarizeReviews(reviews);
  summary.textContent = result.count
    ? `${result.average.toFixed(1)}/5 average · ${result.count} ${result.count === 1 ? "review" : "reviews"}`
    : "No community reviews yet.";
}

export function databasePath(placeId, userId = null) {
  return ["reviews", placeId, ...(userId ? [userId] : [])].map(encodeURIComponent).join("/");
}

export async function databaseRequest(path, { method = "GET", body } = {}) {
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

export function renderReviews(reviews) {
  if (!list) return;
  list.replaceChildren();
  const entries = Object.entries(reviews || {})
    .filter(([, review]) => review && typeof review === "object")
    .sort(([, first], [, second]) => Number(second.createdAt || 0) - Number(first.createdAt || 0));
  setSummary(reviews);

  for (const [reviewUserId, review] of entries) {
    const item = document.createElement("li");
    item.className = "review-item";
    item.dataset.reviewUserId = reviewUserId;
    const heading = document.createElement("header");
    const author = document.createElement("strong");
    author.textContent = typeof review.author === "string" && review.author.trim()
      ? review.author.slice(0, 80) : "Community member";
    const rating = document.createElement("span");
    rating.textContent = isValidReviewRating(review.rating)
      ? `${review.rating}/5` : "Rating unavailable";
    heading.append(author, rating);
    const comment = document.createElement("p");
    comment.textContent = typeof review.comment === "string"
      ? review.comment.slice(0, 2000) : "Review text unavailable.";
    const date = document.createElement("small");
    const createdAt = typeof review.createdAt === "number" ? new Date(review.createdAt) : new Date(NaN);
    date.textContent = Number.isFinite(createdAt.getTime()) ? createdAt.toLocaleDateString() : "";
    item.append(heading, comment, date);

    if (currentUser?.localId === reviewUserId) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "review-delete-button";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteReview(reviewUserId, deleteButton));
      item.append(deleteButton);
    }
    list.append(item);
  }
  setStatus(entries.length ? "" : "No reviews yet. Be the first to review this location.");
}

async function loadReviews(placeId) {
  const version = ++requestVersion;
  currentPlaceId = placeId;
  loadedReviewsPlaceId = null;
  currentReviews = null;
  list?.replaceChildren();
  if (summary) summary.textContent = "Loading community review summary...";
  if (form) form.hidden = true;
  if (openButton) openButton.hidden = true;
  setStatus("Loading reviews...");
  try {
    const reviews = await databaseRequest(databasePath(placeId));
    if (version === requestVersion && currentPlaceId === placeId) {
      currentReviews = reviews;
      renderReviews(reviews);
      loadedReviewsPlaceId = placeId;
      const alreadyReviewed = currentUser && !canWriteReview(reviews, currentUser.localId);
      if (openButton) openButton.hidden = !currentUser || alreadyReviewed;
      if (alreadyReviewed) setStatus("You've already reviewed this location.");
    }
  } catch (error) {
    if (version === requestVersion) {
      if (summary) summary.textContent = "Community review summary unavailable.";
      setStatus(error.message);
    }
  }
}

async function deleteReview(reviewUserId, button) {
  const placeId = currentPlaceId;
  const version = requestVersion;
  if (!placeId || !currentUser?.localId || currentUser.localId !== reviewUserId || !loadedReviewsPlaceId) return;
  if (globalThis.confirm && !globalThis.confirm("Delete your review? This cannot be undone.")) return;

  button.disabled = true;
  setStatus("Deleting review...");
  try {
    await databaseRequest(databasePath(placeId, reviewUserId), { method: "DELETE" });
    if (version !== requestVersion || currentPlaceId !== placeId) return;
    await loadReviews(placeId);
  } catch (error) {
    if (version === requestVersion && currentPlaceId === placeId) setStatus(error.message);
  } finally {
    if (version === requestVersion && currentPlaceId === placeId) button.disabled = false;
  }
}

document.addEventListener("location-selected", event => loadReviews(event.detail.id));
document.addEventListener("location-cleared", () => {
  requestVersion++;
  currentPlaceId = null;
  loadedReviewsPlaceId = null;
  currentReviews = null;
  list?.replaceChildren();
  if (summary) summary.textContent = "Select a location to view community review statistics.";
  if (form) form.hidden = true;
  if (openButton) openButton.hidden = true;
  setStatus("Select a location to view reviews.");
});
document.addEventListener("firebase-user-ready", event => {
  currentUser = typeof event.detail?.localId === "string" && event.detail.localId.trim()
    ? event.detail : null;
  if (loadedReviewsPlaceId === currentPlaceId && currentPlaceId) {
    if (currentReviews) renderReviews(currentReviews);
    if (!currentUser) {
      if (openButton) openButton.hidden = true;
      return;
    }
    const placeId = currentPlaceId;
    const version = requestVersion;
    databaseRequest(databasePath(placeId, currentUser.localId))
      .then(review => {
        if (version !== requestVersion || loadedReviewsPlaceId !== currentPlaceId) return;
        if (openButton) openButton.hidden = Boolean(review);
        if (review) setStatus("You've already reviewed this location.");
      })
      .catch(error => setStatus(error.message));
  }
});

openButton?.addEventListener("click", () => {
  form.hidden = false;
  openButton.hidden = true;
  form.querySelector("select")?.focus();
});
cancelButton?.addEventListener("click", () => {
  form.reset();
  form.hidden = true;
  formMessage.hidden = true;
  openButton.hidden = !currentPlaceId;
});
form?.addEventListener("submit", async event => {
  event.preventDefault();
  const placeId = currentPlaceId;
  const version = requestVersion;
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
    if (version !== requestVersion || currentPlaceId !== placeId) return;
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
    if (version !== requestVersion || currentPlaceId !== placeId) return;
    form.reset();
    form.hidden = true;
    await loadReviews(placeId);
  } catch (error) {
    if (version === requestVersion && currentPlaceId === placeId) {
      formMessage.textContent = error.message;
      formMessage.hidden = false;
    }
  } finally {
    submitting = false;
    submitButton.disabled = false;
  }
});
