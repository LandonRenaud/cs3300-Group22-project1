import assert from 'node:assert/strict';
import test from 'node:test';

let scenario = 0;

class Script {
  constructor() {
    this.attributes = new Map();
    this.removed = false;
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  remove() {
    this.removed = true;
    this.parentNode = null;
  }
}

async function installLoader(t) {
  const names = ['window', 'document', 'fetch'];
  const previous = Object.fromEntries(names.map(name => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]));
  const scripts = [];
  let fetchCalls = 0;
  const document = {
    head: {
      append(script) {
        script.parentNode = this;
        scripts.push(script);
      },
    },
    createElement(tagName) {
      assert.equal(tagName, 'script');
      return new Script();
    },
    querySelector(selector) {
      assert.equal(selector, 'script[data-locallens-google-maps]');
      return scripts.find(script => !script.removed) || null;
    },
  };
  globalThis.window = {};
  globalThis.document = document;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({ apiKey: 'test-key' }) };
  };
  t.after(() => {
    for (const [name, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });

  const loader = await import(`../../project1/src/main/resources/static/js/google-maps-loader.js?scenario=${++scenario}`);
  return {
    loader,
    scripts,
    activeScripts: () => scripts.filter(script => !script.removed),
    fetchCalls: () => fetchCalls,
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Timed out waiting for Google Maps loader state.');
}

test('loads Google Maps once on a successful initial attempt', async t => {
  const { loader, scripts, activeScripts, fetchCalls } = await installLoader(t);
  const loading = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 1);

  globalThis.window.google = { maps: { importLibrary() {} } };
  scripts[0].onload();
  await loading;

  assert.equal(fetchCalls(), 1);
  assert.equal(activeScripts().length, 1);
  assert.equal(scripts[0].attributes.get('data-locallens-google-maps'), 'true');
});

test('recovers after a failed initial script load', async t => {
  const { loader, scripts, activeScripts, fetchCalls } = await installLoader(t);
  const loading = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 1);
  scripts[0].onerror();
  await waitFor(() => scripts.length === 2);

  globalThis.window.google = { maps: { importLibrary() {} } };
  scripts[1].onload();
  await loading;

  assert.equal(fetchCalls(), 2);
  assert.equal(scripts[0].removed, true);
  assert.equal(activeScripts().length, 1);
});

test('coalesces concurrent loading attempts and injects one script', async t => {
  const { loader, scripts, fetchCalls } = await installLoader(t);
  const first = loader.loadGoogleMaps({ retryDelayMs: 0 });
  const second = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 1);

  assert.strictEqual(first, second);
  globalThis.window.google = { maps: { importLibrary() {} } };
  scripts[0].onload();
  await Promise.all([first, second]);
  assert.equal(fetchCalls(), 1);
});

test('stops after three repeated failures and permits a later recovery', async t => {
  const { loader, scripts, activeScripts, fetchCalls } = await installLoader(t);
  const failed = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 1);
  scripts[0].onerror();
  await waitFor(() => scripts.length === 2);
  scripts[1].onerror();
  await waitFor(() => scripts.length === 3);
  scripts[2].onerror();

  await assert.rejects(failed, /Google Maps failed to load/);
  assert.equal(fetchCalls(), 3);
  assert.equal(activeScripts().length, 0);

  const recovered = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 4);
  globalThis.window.google = { maps: { importLibrary() {} } };
  scripts[3].onload();
  await recovered;
  assert.equal(fetchCalls(), 4);
  assert.equal(activeScripts().length, 1);
});

test('does not inject or fetch again after successful recovery', async t => {
  const { loader, scripts, fetchCalls } = await installLoader(t);
  const loading = loader.loadGoogleMaps({ retryDelayMs: 0 });
  await waitFor(() => scripts.length === 1);
  globalThis.window.google = { maps: { importLibrary() {} } };
  scripts[0].onload();
  await loading;

  await loader.loadGoogleMaps({ retryDelayMs: 0 });
  assert.equal(fetchCalls(), 1);
  assert.equal(scripts.length, 1);
});
