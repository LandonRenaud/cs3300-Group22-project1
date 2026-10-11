const SCHEMA_VERSION = 1;
const MAX_TEXT_LENGTH = 500;
const MAX_STORED_LENGTH = 1_000_000;
const PLACE_TYPES = new Set([
    "point_of_interest", "restaurant", "cafe", "bar", "park",
    "tourist_attraction", "supermarket", "shopping_mall"
]);

function is_record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function in_range(value, minimum, maximum) {
    return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalize_context(context) {
    if (context == null) return null;
    if (!is_record(context) || !is_record(context.center)
        || !in_range(context.center.lat, -90, 90)
        || !in_range(context.center.lng, -180, 180)) return undefined;

    let bounds = null;
    if (context.bounds != null) {
        const value = context.bounds;
        if (!is_record(value) || !in_range(value.north, -90, 90)
            || !in_range(value.south, -90, 90) || value.north < value.south
            || !in_range(value.east, -180, 180)
            || !in_range(value.west, -180, 180)) return undefined;
        // West may exceed east when the viewport crosses the antimeridian.
        bounds = { north: value.north, south: value.south, east: value.east, west: value.west };
    }
    if (context.zoom != null && !in_range(context.zoom, 0, 30)) return undefined;
    return {
        center: { lat: context.center.lat, lng: context.center.lng },
        bounds,
        zoom: context.zoom ?? null
    };
}

function normalize_search(search) {
    if (!is_record(search) || typeof search.query !== "string"
        || search.query.length > MAX_TEXT_LENGTH) return null;
    if (search.options != null && !is_record(search.options)) return null;
    const source = search.options ?? {};
    if (source.keyword != null && (typeof source.keyword !== "string"
        || source.keyword.length > MAX_TEXT_LENGTH)) return null;
    const query = search.query.trim();
    const keyword = source.keyword?.trim() || undefined;
    if (!query && !keyword) return null;

    const options = {
        keyword,
        openNow: source.openNow ?? false,
        rankBy: source.rankBy ?? "prominence",
        type: source.type ?? "point_of_interest",
        radius: source.radius ?? 5000,
        price: source.price ?? ""
    };
    if (typeof options.openNow !== "boolean"
        || !["prominence", "distance"].includes(options.rankBy)
        || !PLACE_TYPES.has(options.type)
        || !Number.isSafeInteger(options.radius) || options.radius < 1
        || !["", "0", "1", "2", "3", "4"].includes(options.price)) return null;
    const context = normalize_context(search.context);
    if (context === undefined) return null;
    return { query, options, context };
}

function search_key(search) {
    const coordinates = search.query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    const has_coordinates = coordinates && in_range(Number(coordinates[1]), -90, 90)
        && in_range(Number(coordinates[2]), -180, 180);
    return JSON.stringify({
        query: search.query.toLowerCase(),
        options: { ...search.options, keyword: search.options.keyword?.toLowerCase() },
        // Coordinate searches use their radius, independently of the initial viewport.
        context: has_coordinates ? null : search.context
    });
}

function copy_entry(entry) {
    return {
        ...entry,
        options: { ...entry.options },
        context: entry.context && {
            ...entry.context,
            center: { ...entry.context.center },
            bounds: entry.context.bounds && { ...entry.context.bounds }
        }
    };
}

/**
 * Keeps only a signed-in user's submitted search inputs and map viewport.
 * Browser storage failures leave a usable, session-only in-memory history.
 */
export function createSearchHistoryStore({ userId, storage, now = () => Date.now(), limit = 10 } = {}) {
    if (typeof userId !== "string" || !userId.trim() || userId.length > 128) {
        throw new TypeError("Search history requires a signed-in user ID.");
    }
    if (typeof now !== "function") throw new TypeError("now must be a function.");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new RangeError("History limit must be an integer between 1 and 50.");
    }
    const key = `cs3300.search-history.v1:${encodeURIComponent(userId)}`;
    let persistent = true;
    let entries = [];
    let sequence = 0;

    try {
        if (storage === undefined) storage = globalThis.localStorage;
        if (!storage || typeof storage.getItem !== "function"
            || typeof storage.setItem !== "function" || typeof storage.removeItem !== "function") {
            persistent = false;
        }
    } catch {
        persistent = false;
    }

    function refresh() {
        if (!persistent) return entries.map(copy_entry);
        let raw;
        try {
            raw = storage.getItem(key);
        } catch {
            persistent = false;
            return entries.map(copy_entry);
        }
        // A missing key means another tab may have cleared its history.
        entries = [];
        if (typeof raw === "string" && raw.length <= MAX_STORED_LENGTH) {
            try {
                const stored = JSON.parse(raw);
                if (stored?.version === SCHEMA_VERSION && Array.isArray(stored.entries)) {
                    const seen_ids = new Set();
                    const seen_searches = new Set();
                    entries = stored.entries.flatMap((entry) => {
                        const search = normalize_search(entry);
                        if (!search || typeof entry.id !== "string"
                            || !/^[a-zA-Z0-9._-]{1,100}$/.test(entry.id)
                            || !Number.isSafeInteger(entry.searchedAt) || entry.searchedAt < 0) return [];
                        return [{ id: entry.id, ...search, searchedAt: entry.searchedAt }];
                    }).sort((a, b) => b.searchedAt - a.searchedAt).filter((entry) => {
                        const identity = search_key(entry);
                        if (seen_ids.has(entry.id) || seen_searches.has(identity)) return false;
                        seen_ids.add(entry.id);
                        seen_searches.add(identity);
                        return true;
                    }).slice(0, limit);
                }
            } catch {
                // Invalid or obsolete saved data must not prevent searching.
            }
        }
        return entries.map(copy_entry);
    }

    refresh();

    function persist() {
        if (!persistent) return;
        try {
            storage.setItem(key, JSON.stringify({ version: SCHEMA_VERSION, entries }));
        } catch {
            persistent = false;
        }
    }

    return {
        get persistent() { return persistent; },
        get storageKey() { return key; },
        refresh,
        list: refresh,
        add(search) {
            const normalized = normalize_search(search);
            if (!normalized) return null;
            const searchedAt = now();
            if (!Number.isSafeInteger(searchedAt) || searchedAt < 0) return null;
            refresh();
            const identity = search_key(normalized);
            const previous = entries.find((entry) => search_key(entry) === identity);
            const id = previous?.id ?? globalThis.crypto?.randomUUID?.()
                ?? `${searchedAt.toString(36)}-${++sequence}-${Math.random().toString(36).slice(2)}`;
            const entry = { id, ...normalized, searchedAt };
            entries = [entry, ...entries.filter((item) => item.id !== id)].slice(0, limit);
            persist();
            return copy_entry(entry);
        },
        remove(id) {
            refresh();
            const remaining = entries.filter((entry) => entry.id !== id);
            if (remaining.length === entries.length) return false;
            entries = remaining;
            persist();
            return true;
        },
        clear() {
            entries = [];
            try {
                // Removal may still succeed after a quota error disabled writes.
                storage?.removeItem?.(key);
            } catch {
                persistent = false;
            }
        }
    };
}
