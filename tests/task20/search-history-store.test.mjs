import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchHistoryStore } from '../../project1/src/main/resources/static/js/search-history-store.js';

function memoryStorage() {
    const data = new Map();
    return {
        data,
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key)
    };
}

function search(query = 'Atlanta', options = {}, context = null) {
    return { query, options, context };
}

function viewport(overrides = {}) {
    return {
        center: { lat: 33.7756, lng: -84.3963 },
        bounds: { north: 34, south: 33, east: -84, west: -85 },
        zoom: 14,
        ...overrides
    };
}

test('history is scoped to the exact signed-in user, persists on reload, and clears only that user', () => {
    const storage = memoryStorage();
    const first = createSearchHistoryStore({ userId: 'user/a', storage, now: () => 100 });
    const second = createSearchHistoryStore({ userId: 'user%2Fa', storage, now: () => 200 });
    const saved = first.add(search('Atlanta'));
    second.add(search('Savannah'));
    assert.deepEqual(createSearchHistoryStore({ userId: 'user/a', storage }).list(), [saved]);
    assert.equal(storage.data.size, 2);
    assert.ok(storage.data.has('cs3300.search-history.v1:user%2Fa'));
    first.clear();
    assert.deepEqual(createSearchHistoryStore({ userId: 'user/a', storage }).list(), []);
    assert.equal(createSearchHistoryStore({ userId: 'user%2Fa', storage }).list()[0].query, 'Savannah');
});

test('missing user IDs cannot access an unscoped history', () => {
    for (const userId of [undefined, null, '', '  ', 123, 'x'.repeat(129)]) {
        assert.throws(() => createSearchHistoryStore({ userId }), TypeError);
    }
});

test('the ten most recent searches survive reload and equivalent repeated searches move to the front', () => {
    const storage = memoryStorage();
    let clock = 100;
    const store = createSearchHistoryStore({ userId: 'one', storage, now: () => ++clock });
    for (let index = 0; index < 12; index += 1) store.add(search(`City ${index}`));
    assert.equal(store.list().length, 10);
    assert.equal(store.list().at(-1).query, 'City 2');
    const original = store.list().find(({ query }) => query === 'City 5');
    const repeated = store.add(search('  CITY 5  '));
    assert.equal(repeated.id, original.id);
    assert.ok(repeated.searchedAt > original.searchedAt);
    assert.equal(store.list()[0].id, original.id);
    assert.equal(store.list().length, 10);
    assert.deepEqual(createSearchHistoryStore({ userId: 'one', storage }).list(), store.list());
});

test('keyword case deduplicates while different filters and map contexts remain separate searches', () => {
    const store = createSearchHistoryStore({ userId: 'one', storage: memoryStorage() });
    const initial = store.add(search('', { keyword: ' Coffee ' }, viewport()));
    assert.equal(store.add(search('', { keyword: 'coffee' }, viewport())).id, initial.id);
    store.add(search('', { keyword: 'coffee', openNow: true }, viewport()));
    store.add(search('', { keyword: 'coffee' }, viewport({ zoom: 15 })));
    store.add(search('', { keyword: 'coffee' }, viewport({ bounds: null, zoom: null })));
    assert.equal(store.list().length, 4);
});

test('coordinate searches deduplicate across viewports while named queries retain their context', () => {
    const store = createSearchHistoryStore({ userId: 'one', storage: memoryStorage() });
    for (const query of ['33.7756, -84.3963', '0 0', '-90,180']) {
        const first = store.add(search(query, {}, viewport()));
        const second = store.add(search(query, {}, viewport({ center: { lat: 10, lng: 10 }, zoom: 10 })));
        assert.equal(second.id, first.id);
        assert.equal(second.context.zoom, 10);
    }
    const firstNamed = store.add(search('Atlanta', {}, viewport()));
    const secondNamed = store.add(search('Atlanta', {}, viewport({ zoom: 10 })));
    assert.notEqual(secondNamed.id, firstNamed.id);
    // Out-of-range coordinate-looking text follows the regular location query path.
    const firstInvalid = store.add(search('91,0', {}, viewport()));
    const secondInvalid = store.add(search('91,0', {}, viewport({ zoom: 10 })));
    assert.notEqual(secondInvalid.id, firstInvalid.id);
});

test('a stale tab refreshes before adding or removing and never restores another tab\'s deleted entries', () => {
    const storage = memoryStorage();
    const firstTab = createSearchHistoryStore({ userId: 'one', storage });
    const removed = firstTab.add(search('Atlanta'));
    const secondTab = createSearchHistoryStore({ userId: 'one', storage });
    assert.equal(secondTab.storageKey, firstTab.storageKey);
    firstTab.remove(removed.id);
    secondTab.add(search('Savannah'));
    assert.deepEqual(firstTab.list().map(({ query }) => query), ['Savannah']);
    firstTab.clear();
    secondTab.add(search('Augusta'));
    assert.deepEqual(firstTab.refresh().map(({ query }) => query), ['Augusta']);
    const newest = firstTab.add(search('Athens'));
    secondTab.remove(newest.id);
    assert.deepEqual(firstTab.refresh().map(({ query }) => query), ['Augusta']);
    const snapshot = firstTab.refresh();
    snapshot[0].query = 'changed';
    assert.equal(firstTab.list()[0].query, 'Augusta');
    storage.removeItem(firstTab.storageKey);
    assert.deepEqual(secondTab.refresh(), []);
});

test('a refresh read failure preserves the loaded snapshot and subsequent in-memory changes', () => {
    const storage = memoryStorage();
    const store = createSearchHistoryStore({ userId: 'one', storage });
    store.add(search('Atlanta'));
    storage.getItem = () => { throw new Error('storage blocked'); };
    assert.equal(store.refresh()[0].query, 'Atlanta');
    assert.equal(store.persistent, false);
    store.add(search('Savannah'));
    assert.deepEqual(store.list().map(({ query }) => query), ['Savannah', 'Atlanta']);
});

test('persisted data whitelists search inputs and callers cannot mutate stored snapshots', () => {
    const storage = memoryStorage();
    const store = createSearchHistoryStore({ userId: 'one', storage });
    const input = {
        ...search(' Atlanta ', { keyword: ' museums ', token: 'secret' }, viewport()),
        results: [{ name: 'Google result', rating: 5 }],
        token: 'secret'
    };
    const saved = store.add(input);
    input.options.keyword = 'changed';
    input.context.center.lat = 0;
    saved.options.keyword = 'changed again';
    saved.context.bounds.north = 0;
    const listed = store.list();
    listed[0].context.center.lng = 0;
    listed.pop();
    assert.equal(store.list()[0].options.keyword, 'museums');
    assert.equal(store.list()[0].context.center.lat, 33.7756);
    assert.equal(store.list()[0].context.center.lng, -84.3963);
    assert.equal(store.list()[0].context.bounds.north, 34);
    const raw = [...storage.data.values()][0];
    assert.equal(raw.includes('secret'), false);
    assert.equal(raw.includes('Google result'), false);
    assert.deepEqual(Object.keys(JSON.parse(raw).entries[0]), ['id', 'query', 'options', 'context', 'searchedAt']);
});

test('invalid and empty input is not recorded; keyword-only queries and antimeridian bounds are valid', () => {
    const store = createSearchHistoryStore({ userId: 'one', storage: memoryStorage() });
    const invalid = [
        null, {}, [], search('   '), search('', {}, viewport()), search('x'.repeat(501)),
        search('Atlanta', { keyword: 'x'.repeat(501) }),
        search('Atlanta', { radius: 0 }), search('Atlanta', { radius: 1.5 }),
        search('Atlanta', { radius: Infinity }), search('Atlanta', { radius: '5000' }),
        search('Atlanta', { price: 3 }), search('Atlanta', { price: '5' }),
        search('Atlanta', { type: 'unknown' }), search('Atlanta', { rankBy: 'nearest' }),
        search('Atlanta', { openNow: 'false' }), search('Atlanta', { keyword: {} }),
        search('Atlanta', {}, { center: { lat: 91, lng: 0 } }),
        search('Atlanta', {}, viewport({ bounds: { north: 10, south: 20, east: 0, west: 0 } })),
        search('Atlanta', {}, viewport({ zoom: -1 }))
    ];
    for (const input of invalid) assert.equal(store.add(input), null, JSON.stringify(input));
    assert.equal(store.list().length, 0);
    assert.ok(store.add(search('', { keyword: 'parks' }, viewport({
        bounds: { north: 90, south: -90, west: 170, east: -170 }, zoom: 0
    }))));
    assert.ok(store.add(search('0, 0', {}, { center: { lat: 0, lng: 0 } })));
});

test('corrupt, unsupported, and oversized storage is ignored without preventing future writes', () => {
    for (const raw of ['{', 'null', JSON.stringify({ version: 2, entries: [] }), ' '.repeat(1_000_001)]) {
        const storage = memoryStorage();
        storage.setItem('cs3300.search-history.v1:one', raw);
        const store = createSearchHistoryStore({ userId: 'one', storage });
        assert.deepEqual(store.list(), []);
        assert.equal(store.persistent, true);
        assert.ok(store.add(search()));
        assert.equal(JSON.parse(storage.getItem('cs3300.search-history.v1:one')).version, 1);
    }
});

test('reload skips malformed records, deduplicates identities, and sorts remaining entries by date', () => {
    const storage = memoryStorage();
    const entry = (id, query, searchedAt) => ({ id, ...search(query), searchedAt });
    storage.setItem('cs3300.search-history.v1:one', JSON.stringify({
        version: 1,
        entries: [
            entry('older', 'Atlanta', 10), entry('latest', 'ATLANTA', 20),
            entry('other', 'Savannah', 15), entry('latest', 'Duplicate ID', 5),
            entry('negative-date', 'bad', -1), entry('bad id!', 'bad', 1),
            entry('bad-query', '', 25), null,
            { ...entry('bad-context', 'bad', 30), context: { center: { lat: '33', lng: -84 } } }
        ]
    }));
    const store = createSearchHistoryStore({ userId: 'one', storage });
    assert.deepEqual(store.list().map(({ id }) => id), ['latest', 'other']);
});

test('remove deletes only the selected entry and persists the change', () => {
    const storage = memoryStorage();
    const store = createSearchHistoryStore({ userId: 'one', storage });
    const first = store.add(search('Atlanta'));
    const second = store.add(search('Savannah'));
    assert.equal(store.remove('missing'), false);
    assert.equal(store.remove(first.id), true);
    assert.deepEqual(createSearchHistoryStore({ userId: 'one', storage }).list(), [second]);
});

test('unavailable storage and blocked reads fall back to working memory without throwing', () => {
    for (const storage of [null, {}, {
        ...memoryStorage(), getItem() { throw new Error('blocked'); }
    }]) {
        const store = createSearchHistoryStore({ userId: 'one', storage });
        assert.equal(store.persistent, false);
        const saved = store.add(search());
        assert.deepEqual(store.list(), [saved]);
        assert.equal(store.remove(saved.id), true);
        store.add(search());
        store.clear();
        assert.deepEqual(store.list(), []);
    }
});

test('quota failures preserve loaded and new entries in memory; clear failures are also contained', () => {
    const storage = memoryStorage();
    createSearchHistoryStore({ userId: 'one', storage }).add(search('Atlanta'));
    const failed = createSearchHistoryStore({ userId: 'one', storage: {
        ...storage, setItem() { throw new Error('quota'); }
    } });
    assert.equal(failed.persistent, true);
    failed.add(search('Savannah'));
    assert.equal(failed.persistent, false);
    assert.equal(failed.list().length, 2);
    failed.clear();
    assert.deepEqual(failed.list(), []);
    assert.deepEqual(createSearchHistoryStore({ userId: 'one', storage }).list(), []);
    createSearchHistoryStore({ userId: 'one', storage }).add(search('Atlanta'));
    const clearFailed = createSearchHistoryStore({ userId: 'one', storage: {
        ...storage, removeItem() { throw new Error('blocked'); }
    } });
    clearFailed.clear();
    assert.equal(clearFailed.persistent, false);
    assert.deepEqual(clearFailed.list(), []);
});

test('custom history bounds and an invalid clock cannot create unbounded or undated entries', () => {
    for (const limit of [0, -1, 1.5, 51, Infinity]) {
        assert.throws(() => createSearchHistoryStore({ userId: 'one', limit }), RangeError);
    }
    const limited = createSearchHistoryStore({ userId: 'one', storage: null, limit: 2 });
    for (const query of ['one', 'two', 'three']) limited.add(search(query));
    assert.deepEqual(limited.list().map(({ query }) => query), ['three', 'two']);
    const invalidClock = createSearchHistoryStore({ userId: 'one', storage: null, now: () => NaN });
    assert.equal(invalidClock.add(search()), null);
    assert.deepEqual(invalidClock.list(), []);
});
