import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Firebase review rules require authentication and owner-only create/delete', async () => {
  const source = await readFile(new URL('../firebase.database.rules.json', import.meta.url), 'utf8');
  const rules = JSON.parse(source).rules.reviews;
  const reviewRule = rules.$placeId.$uid;

  assert.equal(rules['.read'], 'auth != null');
  assert.match(reviewRule['.write'], /auth != null/);
  assert.match(reviewRule['.write'], /auth\.uid == \$uid/);
  assert.match(reviewRule['.write'], /!data\.exists\(\).*newData\.exists\(\)/);
  assert.match(reviewRule['.write'], /data\.exists\(\).*!newData\.exists\(\)/);
  assert.equal(reviewRule.$other['.validate'], false);
});

test('Firebase review rules validate the fields used by the review UI', async () => {
  const source = await readFile(new URL('../firebase.database.rules.json', import.meta.url), 'utf8');
  const reviewRule = JSON.parse(source).rules.reviews.$placeId.$uid;

  assert.match(reviewRule['.validate'], /author/);
  assert.match(reviewRule['.validate'], /rating/);
  assert.match(reviewRule['.validate'], /comment/);
  assert.match(reviewRule['.validate'], /createdAt/);
  assert.match(reviewRule.author['.validate'], /isString\(\)/);
  assert.match(reviewRule.rating['.validate'], /isNumber\(\)/);
  assert.match(reviewRule.comment['.validate'], /isString\(\)/);
  assert.match(reviewRule.createdAt['.validate'], /isNumber\(\)/);
});
