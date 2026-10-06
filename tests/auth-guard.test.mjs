import assert from 'node:assert/strict';
import test from 'node:test';

test('valid sessions bypass login and logout removes access to protected pages', async t => {
  const previous = Object.fromEntries(['fetch', 'sessionStorage', 'window', 'document'].map(
    key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]
  ));
  const values = new Map();
  const redirects = [];
  let validToken = true;
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  globalThis.window = { location: { replace: path => redirects.push(path) } };
  globalThis.document = { body: { hidden: true } };
  globalThis.fetch = async (url, options) => {
    if (url === '/api/firebase-config') return { ok: true, json: async () => ({ apiKey: 'test-key' }) };
    assert.match(url, /accounts:lookup/);
    assert.equal(JSON.parse(options.body).idToken, 'test-token');
    return { ok: validToken, json: async () => validToken ? { users: [{ email: 'test@example.com' }] } : { error: { message: 'INVALID_ID_TOKEN' } } };
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const { logOut, redirectIfAuthenticated, requireAuth } = await import('../project1/src/main/resources/static/js/auth-guard.js');
  assert.equal(await redirectIfAuthenticated(), false);
  assert.deepEqual(redirects, []);

  sessionStorage.setItem('firebaseIdToken', 'test-token');
  assert.equal(await redirectIfAuthenticated(), true);
  assert.deepEqual(redirects, ['/homepage.html']);

  logOut();
  assert.equal(sessionStorage.getItem('firebaseIdToken'), null);
  assert.equal(redirects.at(-1), '/landingpage.html');
  assert.equal(await requireAuth(), null);
  assert.equal(redirects.at(-1), '/landingpage.html');

  sessionStorage.setItem('firebaseIdToken', 'test-token');
  validToken = false;
  assert.equal(await redirectIfAuthenticated(), false);
  assert.equal(sessionStorage.getItem('firebaseIdToken'), null);
});
