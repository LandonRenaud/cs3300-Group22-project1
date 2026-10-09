import assert from 'node:assert/strict';
import test from 'node:test';
import { canWriteReview, DEFAULT_REVIEW_AUTHOR, prepareReviewDraft } from '../../project1/src/main/resources/static/js/review-utils.mjs';

test('review drafts trim values and use the anonymous author when the name is blank', () => {
  assert.deepEqual(prepareReviewDraft({ author: '   ', rating: '5', comment: '  Great place!  ' }), {
    valid: true,
    value: { author: DEFAULT_REVIEW_AUTHOR, rating: 5, comment: 'Great place!' }
  });
  assert.deepEqual(prepareReviewDraft({ author: '  Alex  ', rating: 4, comment: ' Nice ' }), {
    valid: true,
    value: { author: 'Alex', rating: 4, comment: 'Nice' }
  });
});

test('review draft validation accepts the limits and rejects invalid names, comments, and ratings', () => {
  assert.equal(prepareReviewDraft({ author: 'n'.repeat(80), rating: 1, comment: 'x'.repeat(2000) }).valid, true);
  assert.match(prepareReviewDraft({ author: 'n'.repeat(81), rating: 4, comment: 'Fine' }).message, /Name/);
  assert.match(prepareReviewDraft({ rating: 4, comment: '  ' }).message, /review/i);
  assert.match(prepareReviewDraft({ rating: 4, comment: 'x'.repeat(2001) }).message, /2,000/);
  for (const rating of ['', '0', '6', '2.5', 'bad']) {
    assert.match(prepareReviewDraft({ rating, comment: 'Valid comment' }).message, /rating/i);
  }
});

test('a user can review only when they have an ID and no review exists for that ID', () => {
  assert.equal(canWriteReview(null, 'user-1'), true);
  assert.equal(canWriteReview({ 'user-2': { rating: 5 } }, 'user-1'), true);
  assert.equal(canWriteReview({ 'user-1': { rating: 5 } }, 'user-1'), false);
  assert.equal(canWriteReview({}, null), false);
});
