import assert from "node:assert/strict";
import test from "node:test";
import { createSearchHistoryView } from "../../project1/src/main/resources/static/js/search-history-view.js";

class Element {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.className = "";
    this.classList = { contains: name => this.className.split(" ").includes(name) };
  }
  set innerHTML(_) { throw new Error("History must never interpret saved data as HTML."); }
  set textContent(value) { this.text = value; this.replaceChildren(); }
  get textContent() { return this.text || this.children.map(child => child.textContent).join(""); }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren() {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  removeEventListener(name, listener) {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }
  click() { this.listeners.get("click")?.(); }
  focus() { this.ownerDocument.activeElement = this; }
  matches(selector) {
    return selector.startsWith(".") ? this.classList.contains(selector.slice(1)) : this.tagName === selector;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  closest(selector) {
    return this.matches(selector) ? this : this.parentElement?.closest(selector);
  }
}

function setup() {
  const document = { createElement: tag => new Element(document, tag), activeElement: null };
  const root = document.createElement("details");
  const summary = document.createElement("summary");
  root.append(summary);
  const elements = Object.fromEntries([
    ["list", "ol"], ["count", "span"], ["empty", "p"], ["clear", "button"],
    ["storage", "p"], ["warning", "p"], ["status", "p"]
  ].map(([name, tag]) => {
    const element = document.createElement(tag);
    element.className = `search-history-${name}`;
    root.append(element);
    return [name, element];
  }));
  const calls = { replay: [], remove: [], clear: 0 };
  const view = createSearchHistoryView({
    root,
    onReplay: entry => calls.replay.push(entry),
    onRemove: id => calls.remove.push(id),
    onClear: () => calls.clear++
  });
  return { document, root, summary, elements, calls, view };
}

function entry(id, overrides = {}) {
  return {
    id, query: "Atlanta", searchedAt: "2026-10-10T13:30:00.000Z", context: null,
    options: { keyword: "coffee", type: "cafe", openNow: true, rankBy: "prominence", radius: 5000, price: 0 },
    ...overrides
  };
}

test("empty history exposes a friendly empty state and storage availability", () => {
  const { elements, view } = setup();
  view.render([]);
  assert.equal(elements.count.textContent, "(0)");
  assert.equal(elements.empty.hidden, false);
  assert.equal(elements.clear.hidden, true);
  assert.equal(elements.warning.hidden, true);
  assert.equal(elements.storage.hidden, false);
  assert.equal(elements.status.textContent, "");
  view.render([], { persistent: false });
  assert.equal(elements.warning.hidden, false);
  assert.equal(elements.storage.hidden, true);
  view.render([], { persistent: true });
  assert.equal(elements.warning.hidden, true);
  assert.equal(elements.storage.hidden, false);
});

test("history is newest first, displays saved filters and dates, and renders user text literally", () => {
  const { elements, view } = setup();
  const unsafe = '<img src=x onerror="alert(1)">';
  const earlier = entry("earlier");
  const latest = entry("latest", { query: unsafe, searchedAt: Date.parse("2026-10-10T14:30:00.000Z") });
  const entries = [earlier, latest];
  view.render(entries);
  assert.deepEqual(entries.map(value => value.id), ["earlier", "latest"]);
  assert.deepEqual(elements.list.children.map(row => row.dataset.historyId), ["latest", "earlier"]);
  const replay = elements.list.children[0].querySelector(".search-history-replay");
  assert.equal(replay.querySelector("strong").textContent, unsafe);
  assert.equal(replay.querySelector("strong").children.length, 0);
  assert.equal(replay.attributes.get("aria-label"), `Search again: ${unsafe}`);
  assert.equal(replay.querySelector(".search-history-filters").textContent,
    "Keyword: coffee · Cafe · Radius: 5 km · Free · Open now · Rank: prominence");
  const timestamp = replay.querySelector("time");
  assert.equal(timestamp.dateTime, "2026-10-10T14:30:00.000Z");
  assert.match(timestamp.textContent, /2026/);
  assert.equal(elements.count.textContent, "(2)");
  assert.equal(elements.empty.hidden, true);
  assert.equal(elements.clear.hidden, false);
});

test("keyword-only and current-area labels remain usable, and distance mode omits radius", () => {
  const { elements, view } = setup();
  const keywordOnly = entry("keyword", { query: "", options: {
    keyword: "museums", type: "point_of_interest", rankBy: "distance", radius: 5000, price: null, openNow: false
  } });
  view.render([keywordOnly]);
  const row = elements.list.children[0];
  assert.equal(row.querySelector("strong").textContent, "museums");
  assert.equal(row.querySelector(".search-history-filters").textContent, "Rank: distance");
  view.render([entry("area", { query: "", options: { ...keywordOnly.options, keyword: "" } })]);
  assert.equal(elements.list.children[0].querySelector("strong").textContent, "Current map area");
});

test("replay, removal, and clear controls invoke their own callbacks", () => {
  const { elements, calls, view } = setup();
  const saved = entry("saved");
  view.render([saved]);
  const row = elements.list.children[0];
  row.querySelector(".search-history-replay").click();
  row.querySelector(".search-history-remove").click();
  elements.clear.click();
  assert.deepEqual(calls.replay, [saved]);
  assert.deepEqual(calls.remove, ["saved"]);
  assert.equal(calls.clear, 1);
  assert.equal(row.querySelector(".search-history-remove").attributes.get("aria-label"), "Remove search: Atlanta");
});

test("removing focused rows retains keyboard position and announces the change", () => {
  const { document, summary, elements, view } = setup();
  const first = entry("first");
  const second = entry("second", { searchedAt: "2026-10-09T13:30:00.000Z" });
  view.render([first, second]);
  elements.list.children[0].querySelector(".search-history-remove").focus();
  view.render([second]);
  assert.equal(document.activeElement, elements.list.children[0].querySelector(".search-history-remove"));
  assert.equal(elements.status.textContent, "1 search removed from history.");
  view.render([]);
  assert.equal(document.activeElement, summary);
  assert.equal(elements.status.textContent, "Search history cleared.");
});

test("rerender preserves focus by entry and clear-all returns focus to the summary", () => {
  const { document, summary, elements, view } = setup();
  const first = entry("first");
  const second = entry("second", { searchedAt: "2026-10-10T14:30:00.000Z" });
  view.render([first]);
  elements.list.children[0].querySelector(".search-history-replay").focus();
  view.render([first, second]);
  assert.equal(document.activeElement, elements.list.children[1].querySelector(".search-history-replay"));
  assert.equal(elements.status.textContent, "");
  elements.clear.focus();
  view.render([]);
  assert.equal(document.activeElement, summary);
  assert.equal(elements.status.textContent, "Search history cleared.");
});

test("destroy detaches the persistent clear button before another account initializes", () => {
  const { root, elements, calls, view } = setup();
  view.render([entry("first")]);
  view.destroy();
  view.destroy();
  elements.clear.click();
  assert.equal(calls.clear, 0);
  let nextAccountClears = 0;
  const next = createSearchHistoryView({ root, onReplay() {}, onRemove() {}, onClear() { nextAccountClears++; } });
  next.render([entry("second")]);
  elements.clear.click();
  assert.equal(nextAccountClears, 1);
  assert.equal(calls.clear, 0);
});
