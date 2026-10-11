export const DEFAULT_REVIEW_AUTHOR = "Anonymous LocalLens User";

export function canWriteReview(reviews, userId) {
  return Boolean(userId) && !reviews?.[userId];
}

export function prepareReviewDraft({ author = "", rating, comment } = {}) {
  const normalizedAuthor = String(author).trim() || DEFAULT_REVIEW_AUTHOR;
  const normalizedComment = String(comment ?? "").trim();
  const normalizedRating = Number(rating);

  if (normalizedAuthor.length > 80) {
    return { valid: false, message: "Name must be 80 characters or fewer." };
  }
  if (!normalizedComment) {
    return { valid: false, message: "Enter a review." };
  }
  if (normalizedComment.length > 2000) {
    return { valid: false, message: "Review must be 2,000 characters or fewer." };
  }
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    return { valid: false, message: "Choose a rating from 1 to 5." };
  }

  return {
    valid: true,
    value: { author: normalizedAuthor, rating: normalizedRating, comment: normalizedComment }
  };
}
