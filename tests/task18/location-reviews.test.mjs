import assert from 'node:assert/strict';
import test from 'node:test';

class Element {
  constructor(document, tagName = 'div') {
    this.ownerDocument = document;
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.text = '';
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) { this.children = []; this.text = ''; this.append(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  matches(selector) {
    if (selector.startsWith('.')) return this.className === selector.slice(1);
    if (selector === 'button') return this.tagName === 'button';
    if (selector === 'select') return this.tagName === 'select';
    if (selector === '[type="submit"]') return this.type === 'submit';
    return false;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  reset() {
    for (const field of Object.values(this.elements || {})) field.value = '';
  }
  async emit(name, event = {}) {
    return Promise.all([...this.listeners.get(name) || []].map(listener => listener({ preventDefault() {}, ...event })));
  }
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

async function setup(t, initialResponses) {
  const previous = new Map([
    ['document', Object.getOwnPropertyDescriptor(globalThis, 'document')],
    ['fetch', Object.getOwnPropertyDescriptor(globalThis, 'fetch')],
    ['sessionStorage', Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')],
    ['confirm', Object.getOwnPropertyDescriptor(globalThis, 'confirm')],
  ]);
  const documentListeners = new Map();
  const elements = {};
  const document = {
    activeElement: null,
    createElement: tagName => new Element(document, tagName),
    querySelector: selector => elements[selector.slice(1)],
    addEventListener(name, listener) {
      if (!documentListeners.has(name)) documentListeners.set(name, new Set());
      documentListeners.get(name).add(listener);
    },
    dispatchEvent(event) {
      for (const listener of documentListeners.get(event.type) || []) listener(event);
    },
  };
  for (const [name, tag] of [
    ['reviews-status', 'p'], ['reviews-summary', 'p'], ['reviews-list', 'ol'],
    ['review-open-button', 'button'], ['review-form', 'form'],
    ['review-form-message', 'p'], ['review-cancel-button', 'button'],
  ]) {
    elements[name] = new Element(document, tag);
    elements[name].className = name;
  }
  elements['review-open-button'].type = 'button';
  elements['review-cancel-button'].type = 'button';
  const author = new Element(document, 'input');
  const rating = new Element(document, 'select');
  const comment = new Element(document, 'textarea');
  const submit = new Element(document, 'button');
  submit.type = 'submit';
  elements['review-form'].elements = { author, rating, comment };
  elements['review-form'].append(rating, submit);

  const requests = [];
  const responses = [...initialResponses];
  const fetch = async (url, init = {}) => {
    requests.push({ url, init });
    if (url === '/api/firebase-config') return response({ apiKey: 'test', databaseUrl: 'https://database.test' });
    const next = responses.shift();
    if (!next) throw new Error(`No response configured for ${url}`);
    return typeof next === 'function' ? next(url, init) : next;
  };
  const sessionStorage = { getItem: key => key === 'firebaseIdToken' ? 'token' : null };
  Object.assign(globalThis, { document, fetch, sessionStorage, confirm: () => true });
  t.after(() => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const module = await import(`../../project1/src/main/resources/static/js/location-reviews.js?reviews=${Date.now()}-${Math.random()}`);
  return { document, elements, requests, responses, module, submit };
}

const review = (rating, createdAt = 1) => ({ author: 'Reviewer', rating, comment: 'Good', createdAt });
const selected = (document, id) => document.dispatchEvent(new CustomEvent('location-selected', { detail: { id } }));

test('renders owner-only deletion, deletes the exact Firebase path, refreshes statistics, and allows recreation', async t => {
  const app = await setup(t, [
    response({ owner: review(5, 2), other: review(3, 1) }),
    response(null),
    response({ other: review(3, 1) }),
  ]);
  app.document.dispatchEvent(new CustomEvent('firebase-user-ready', { detail: { localId: 'owner' } }));
  selected(app.document, 'place/one');
  await new Promise(resolve => setTimeout(resolve, 0));

  const items = app.elements['reviews-list'].children;
  assert.equal(items.length, 2);
  assert.equal(items[0].querySelector('.review-delete-button') !== null, true);
  assert.equal(items[1].querySelector('.review-delete-button'), null);
  assert.match(app.elements['reviews-summary'].textContent, /4\.0\/5 average · 2 reviews/);

  await items[0].querySelector('.review-delete-button').emit('click');
  await new Promise(resolve => setTimeout(resolve, 0));
  const deletion = app.requests.find(request => request.init.method === 'DELETE');
  assert.equal(deletion.url, 'https://database.test/reviews/place%2Fone/owner.json?auth=token');
  assert.match(app.elements['reviews-summary'].textContent, /3\.0\/5 average · 1 review/);
  assert.equal(app.elements['review-open-button'].hidden, false);
});

test('delete failure leaves the review rendered and reports the Firebase error', async t => {
  const app = await setup(t, [
    response({ owner: review(4) }),
    response({ error: 'denied' }, false, 403),
  ]);
  app.document.dispatchEvent(new CustomEvent('firebase-user-ready', { detail: { localId: 'owner' } }));
  selected(app.document, 'place/failure');
  await new Promise(resolve => setTimeout(resolve, 0));
  const button = app.elements['reviews-list'].children[0].querySelector('.review-delete-button');
  await button.emit('click');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(app.elements['reviews-list'].children.length, 1);
  assert.match(app.elements['reviews-status'].textContent, /denied|Firebase denied/i);
  assert.equal(button.disabled, false);
});

test('a location switch invalidates a pending delete and prevents a stale reload', async t => {
  let resolveDelete;
  const pendingDelete = new Promise(resolve => { resolveDelete = resolve; });
  const app = await setup(t, [
    response({ owner: review(5) }),
    () => pendingDelete,
    response({ other: review(2) }),
    response({ other: review(2) }),
  ]);
  app.document.dispatchEvent(new CustomEvent('firebase-user-ready', { detail: { localId: 'owner' } }));
  selected(app.document, 'place/old');
  await new Promise(resolve => setTimeout(resolve, 0));
  const pending = app.elements['reviews-list'].children[0].querySelector('.review-delete-button').emit('click');
  selected(app.document, 'place/new');
  await new Promise(resolve => setTimeout(resolve, 0));
  resolveDelete(response(null));
  await pending;
  await new Promise(resolve => setTimeout(resolve, 0));
  const oldGets = app.requests.filter(request => request.url.includes('place%2Fold') && request.init.method === 'GET');
  assert.equal(oldGets.length, 1);
  assert.match(app.elements['reviews-summary'].textContent, /2\.0\/5 average/);
});

test('malformed Firebase reviews render safe fallback text and do not enter the summary', async t => {
  const app = await setup(t, [
    response({ malformed: { author: {}, rating: '5', comment: {}, createdAt: 'not-a-date' } }),
  ]);
  app.document.dispatchEvent(new CustomEvent('firebase-user-ready', { detail: { localId: 'owner' } }));
  selected(app.document, 'place/malformed');
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(app.elements['reviews-list'].children.length, 1);
  assert.match(app.elements['reviews-list'].textContent, /Community member/);
  assert.match(app.elements['reviews-list'].textContent, /Rating unavailable/);
  assert.match(app.elements['reviews-list'].textContent, /Review text unavailable/);
  assert.match(app.elements['reviews-summary'].textContent, /No community reviews/);
});
