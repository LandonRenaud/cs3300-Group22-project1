import { createLocationLayer } from "./location-markers.js";
import { createGoogleMapsAdapter, normalizeGooglePlaces } from "./google-maps-adapter.js";
import { loadGoogleMaps } from "./google-maps-loader.js";
import "./location-reviews.js";
import { createSearchHistoryStore } from "./search-history-store.js";
import { createSearchHistoryView } from "./search-history-view.js";
import { formatDistance, haversineDistanceMeters, isValidCoordinate, sortLocationsByDistance } from "./distance-utils.mjs";

let map_input_location = document.querySelector(".map-input-location");
let location_form = document.querySelector(".location-input");
let google_map = document.querySelector(".google-map");
let location_results = document.querySelector(".location-results-list");
let location_results_empty = document.querySelector(".location-results-empty");
let location_results_count = document.querySelector(".location-results-count");
let location_results_loading = document.querySelector(".location-results-loading");
let location_results_load_more = document.querySelector(".location-results-load-more");
let location_error = document.querySelector(".location-error");
let location_error_message = location_error?.querySelector?.(".location-error-message");
let location_retry_button = location_error?.querySelector?.(".location-error-retry");
let place_keyword = document.querySelector(".map-input-keyword");
let radius_input = document.querySelector(".map-input-radius");
let price_input = document.querySelector(".map-input-price");
let open_now_input = document.querySelector(".map-input-open-now");
let rank_by_input = document.querySelector(".map-input-rank-by");
let place_type_input = document.querySelector(".map-input-place-type");
let location_details = document.querySelector(".location-details");
let details_heading = document.querySelector("#location-details-heading");
let details_address = document.querySelector(".location-details-address");
let details_rating = document.querySelector(".location-details-rating");
let details_types = document.querySelector(".location-details-types");
let details_coordinates = document.querySelector(".location-details-coordinates");
let details_close = document.querySelector(".location-details-close");
let nearby_layer = null;
let map_adapter = null;
let search_version = 0;
let target_marker = null;
let history_store = null;
let history_view = null;
let history_revision = 0;
let active_search = null;
let last_executed_search = null;
let selected_location_id = null;
const rendered_locations = new Map();
const googleMapsReady = loadGoogleMaps().then(() => true, () => false);
const PLACE_TYPES = new Set([
    "point_of_interest", "restaurant", "cafe", "bar", "park",
    "tourist_attraction", "supermarket", "shopping_mall"
]);
const FILTER_INPUTS = new Set([
    place_type_input, price_input, open_now_input, rank_by_input, radius_input
]);

function render_search_history() {
    if (history_store && history_view) {
        history_view.render(history_store.list(), { persistent: history_store.persistent });
    }
}

// The caller supplies the user returned by the existing Firebase token lookup.
export function initializeSearchHistory(user) {
    const root = document.querySelector(".search-history");
    history_revision++;
    history_view?.destroy();
    history_view = null;
    history_store = null;
    if (!root) return;
    root.hidden = true;
    if (typeof user?.localId !== "string" || !user.localId.trim() || user.localId.length > 128) return;
    history_store = createSearchHistoryStore({ userId: user.localId });
    history_view = createSearchHistoryView({
        root,
        onReplay(entry) {
            map_input_location.value = entry.query;
            place_keyword.value = entry.options.keyword || "";
            radius_input.value = String(entry.options.radius);
            price_input.value = entry.options.price;
            open_now_input.checked = entry.options.openNow;
            rank_by_input.value = entry.options.rankBy;
            place_type_input.value = entry.options.type;
            update_radius_state();
            return recenter_map({ preventDefault() {} }, entry.context);
        },
        onRemove(id) {
            history_revision++;
            history_store.remove(id);
            render_search_history();
        },
        onClear() {
            history_revision++;
            history_store.clear();
            render_search_history();
        }
    });
    root.hidden = false;
    render_search_history();
}

function snapshot_map_context() {
    const map = google_map.innerMap;
    const center = map?.getCenter?.();
    if (!center) return null;
    return {
        center: {
            lat: typeof center.lat === "function" ? center.lat() : center.lat,
            lng: typeof center.lng === "function" ? center.lng() : center.lng
        },
        bounds: map.getBounds?.()?.toJSON?.() || null,
        zoom: map.getZoom?.() ?? null,
        searchCenter: null
    };
}

function set_location_error(message) {
    if (location_error_message) location_error_message.textContent = message;
    else location_error.textContent = message;
    location_error.hidden = !message;
    if (location_retry_button) location_retry_button.hidden = !message;
}

function show_google_maps_error() {
    if (location_error_message) location_error_message.textContent = "Google Maps could not load. Check your connection and try again.";
    else location_error.textContent = "Google Maps could not load. Check your connection and try again.";
    location_error.hidden = false;
    if (location_retry_button) location_retry_button.hidden = false;
}

function request_google_maps_load() {
    if (window.google?.maps?.importLibrary) return Promise.resolve();
    if (!google_maps_ready) {
        google_maps_ready = loadGoogleMaps().catch(error => {
            google_maps_ready = null;
            throw error;
        });
    }
    return google_maps_ready;
}

async function ensure_google_maps() {
    try {
        await request_google_maps_load();
        return true;
    } catch {
        show_google_maps_error();
        return false;
    }
}

async function retry_google_maps() {
    if (google_maps_retry) return google_maps_retry;

    const failed_search = pending_search;
    set_location_error("Retrying Google Maps…");
    google_maps_retry = (async () => {
        if (!await ensure_google_maps()) return;
        if (failed_search && pending_search === failed_search) {
            await recenter_map(
                { preventDefault() {} },
                failed_search.restored_context,
                failed_search.search_override
            );
        } else {
            set_location_error("");
        }
    })().finally(() => {
        google_maps_retry = null;
    });
    return google_maps_retry;
}

function set_results_loading(loading, message = "") {
    location_results_loading.textContent = message;
    location_results_loading.hidden = !loading;
}

function update_results_count(count) {
    location_results_count.textContent = `${count} ${count === 1 ? "location" : "locations"}`;
}

function update_pagination_control() {
    const available = Boolean(
        pagination_state
        && pagination_state.version === search_version
        && pagination_state.hasNextPage
    );
    const waiting_for_api = Boolean(
        available
        && !pagination_state.loading
        && Date.now() < pagination_state.readyAt
    );
    location_results_load_more.hidden = !available;
    location_results_load_more.disabled = !available || pagination_state.loading || waiting_for_api;
    location_results_load_more.setAttribute("aria-disabled", String(location_results_load_more.disabled));
    location_results_load_more.setAttribute("aria-busy", String(Boolean(pagination_state?.loading)));
    location_results_load_more.textContent = pagination_state?.loading
        ? "Loading More Results..."
        : "Load More Results";
}

function clear_pagination() {
    if (pagination_state?.timer) clearTimeout(pagination_state.timer);
    if (pagination_state?.readyTimer) clearTimeout(pagination_state.readyTimer);
    pagination_state = null;
    update_pagination_control();
}

function update_pagination(pagination, version) {
    if (version !== search_version) return;
    if (pagination_state?.timer) clearTimeout(pagination_state.timer);
    if (pagination_state?.readyTimer) clearTimeout(pagination_state.readyTimer);

    const hasNextPage = Boolean(
        pagination
        && pagination.hasNextPage
        && typeof pagination.nextPage === "function"
    );
    pagination_state = hasNextPage
        ? {
            version,
            pagination,
            hasNextPage: true,
            loading: false,
            readyAt: Date.now() + PLACES_PAGE_WAIT_MS,
            timer: null,
            readyTimer: null
        }
        : null;
    if (pagination_state) {
        pagination_state.readyTimer = setTimeout(() => {
            if (pagination_state?.version === version && !pagination_state.loading) {
                pagination_state.readyTimer = null;
                update_pagination_control();
            }
        }, PLACES_PAGE_WAIT_MS);
    }
    update_pagination_control();
}

function select_location(id) {
    const normalizedId = id === null || id === undefined ? null : String(id);
    const changed = selected_location_id !== normalizedId;
    selected_location_id = normalizedId;
    for (const result of location_results.children) {
        const selected = result.dataset.locationId === normalizedId;
        result.classList.toggle("is-selected", selected);
        result.querySelector("button")?.setAttribute("aria-pressed", String(selected));
        if (selected && changed) {
            result.setAttribute("aria-current", "true");
            result.scrollIntoView({ block: "nearest" });
        } else if (!selected) {
            result.removeAttribute("aria-current");
        }
    }
}

function clear_location_details() {
    location_details.hidden = true;
    select_location(null);
    if (active_search) active_search.selectedId = null;
    document.dispatchEvent(new Event("location-cleared"));
}

function close_location_details() {
    if (nearby_layer) nearby_layer.closeFocused();
    else map_adapter?.close?.();
    clear_location_details();
}

function show_location_details(place) {
    if (active_search) active_search.selectedId = place.id;
    select_location(place.id);
    details_heading.textContent = place.name;
    details_address.textContent = place.address;
    details_address.hidden = !place.address;
    details_rating.textContent = Number.isFinite(place.rating) ? `Rating: ${place.rating}/5` : "";
    details_rating.hidden = !Number.isFinite(place.rating);
    details_types.textContent = place.types.join(" · ").replaceAll("_", " ");
    details_types.hidden = place.types.length === 0;
    details_coordinates.textContent = `Coordinates: ${place.lat}, ${place.lng}`;
    location_details.hidden = false;
    document.dispatchEvent(new CustomEvent("location-selected", { detail: { id: place.id } }));
}

function location_is_outside_map(place) {
    const bounds = google_map.innerMap?.getBounds?.();
    if (!bounds || typeof bounds.contains !== "function") return false;
    try {
        return !bounds.contains({ lat: place.lat, lng: place.lng });
    } catch {
        return false;
    }
}

function focus_result_location(place) {
    const focused = nearby_layer?.focusLocation(place.id, {
        pan: location_is_outside_map(place)
    });
    if (!focused) {
        set_location_error("This location is no longer available on the map. Please search again.");
        close_location_details();
        return;
    }
    show_location_details(place);
}

function handle_results_click(event) {
    const button = event.target?.closest?.(".location-result-button");
    const item = button?.closest?.(".location-result");
    if (!item) return;
    const place = rendered_locations.get(item.dataset.locationId);
    if (place) focus_result_location(place);
}

function clear_nearby_locations() {
    close_location_details();
    clear_pagination();
    set_results_loading(false);
    update_results_count(0);
    nearby_layer?.clear();
    target_marker?.remove();
    target_marker = null;
    rendered_locations.clear();
    location_results.replaceChildren();
    location_results_empty.textContent = "Search for a location to see nearby places here.";
    location_results_empty.hidden = false;
}

function add_target_pin(location, name) {
    const pin_content = document.createElement("div");
    pin_content.className = "target-location-pin";
    pin_content.setAttribute("aria-label", `Search center: ${name}`);
    target_marker = map_adapter.addMarker({ ...location, name }, close_location_details, {
        content: pin_content,
        zIndex: 1000
    });
}

function render_locations(places, version, append = false) {
    if (version !== search_version) return false;
    const result = normalizeGooglePlaces(places);

    const existingLocations = active_search?.results || [];
    const existingIds = new Set(existingLocations.map(place => place.id));
    const newLocations = result.locations.filter(place => !existingIds.has(place.id));
    try {
        if (append) nearby_layer.appendLocations(newLocations);
        else nearby_layer.setLocations(result.locations);
    } catch {
        set_location_error("Nearby locations could not be displayed. Please try again.");
        return false;
    }

    if (active_search) {
        active_search.results = append
            ? [...existingLocations, ...newLocations]
            : [...result.locations];
        active_search.skippedCount = (active_search.skippedCount || 0) + result.skippedCount;
    }

    let scopedLocations = active_search?.results || [];
    if (active_search?.location && active_search.options.rankBy === "distance") {
        scopedLocations = sortLocationsByDistance(scopedLocations, active_search.location);
    } else if (active_search?.location) {
        scopedLocations = scopedLocations.map(place => ({
            ...place,
            distanceMeters: haversineDistanceMeters(active_search.location, place)
        }));
    }
    try {
        nearby_layer.setLocations(scopedLocations);
    } catch {
        set_location_error("Nearby locations could not be displayed. Please try again.");
        return false;
    }
    const hadSelection = selected_location_id !== null;
    if (hadSelection) clear_location_details();
    rendered_locations.clear();
    location_results.replaceChildren();
    location_results_empty.hidden = scopedLocations.length > 0;
    location_results_empty.textContent = "No nearby locations were found.";
    update_results_count(scopedLocations.length);
    if (active_search?.skippedCount > 0) {
        set_location_error(`${active_search.skippedCount} locations could not be mapped because their coordinates were invalid.`);
    }
    for (const place of scopedLocations) {
        rendered_locations.set(place.id, place);
        const item = document.createElement("li");
        item.className = "location-result";
        item.dataset.locationId = place.id;
        const button = document.createElement("button");
        button.className = "location-result-button";
        button.type = "button";
        button.setAttribute("aria-controls", "location-details");
        button.setAttribute("aria-pressed", "false");
        const name = document.createElement("strong");
        name.textContent = place.name;
        button.append(name);

        if (place.address) {
            const address = document.createElement("span");
            address.textContent = place.address;
            button.append(address);
        }
        if (Number.isFinite(place.distanceMeters)) {
            const distance = document.createElement("span");
            distance.className = "location-result-distance";
            distance.textContent = `Straight-line distance: ${formatDistance(place.distanceMeters)}`;
            button.append(distance);
        }
        item.append(button);
        location_results.append(item);
    }
    if (selectedId && scopedLocations.some(place => place.id === selectedId)) {
        select_location(selectedId);
    }
    return true;
}

function handle_pagination_failure(version) {
    if (version !== search_version) return;
    clear_pagination();
    set_results_loading(false);
    set_location_error("Additional nearby locations could not be loaded. Please try again.");
}

function load_more_locations() {
    const state = pagination_state;
    if (!state || state.version !== search_version || !state.hasNextPage || state.loading) return;

    state.loading = true;
    update_pagination_control();
    set_results_loading(true, "Loading more nearby locations...");

    const request_next_page = () => {
        if (
            pagination_state !== state
            || state.version !== search_version
            || !state.hasNextPage
        ) return;
        state.timer = null;
        try {
            if (state.pagination.nextPage() === false) handle_pagination_failure(state.version);
        } catch {
            handle_pagination_failure(state.version);
        }
    };

    const wait = Math.max(0, state.readyAt - Date.now());
    if (wait > 0) {
        set_results_loading(true, "Waiting for more nearby locations...");
        state.timer = setTimeout(request_next_page, wait);
    } else {
        request_next_page();
    }
}

function find_nearby_locations(location, options, version, onComplete = () => {}) {
    if (!google.maps.places || !google.maps.places.PlacesService) {
        set_location_error("Nearby location search is temporarily unavailable. Please try again.");
        clear_pagination();
        set_results_loading(false);
        active_search = null;
        return;
    }

    const request = {
        location,
        keyword: options.keyword,
        openNow: options.openNow,
        rankBy: options.rankBy === "distance"
            ? google.maps.places.RankBy.DISTANCE
            : google.maps.places.RankBy.PROMINENCE,
        type: options.type
    };

    if (options.rankBy !== "distance") {
        request.radius = options.radius;
    }

    if (options.price !== "") {
        request.minPriceLevel = Number(options.price);
        request.maxPriceLevel = Number(options.price);
    }

    const places_service = new google.maps.places.PlacesService(google_map.innerMap);
    set_results_loading(true, "Loading nearby locations...");
    let initial_page = true;
    places_service.nearbySearch(request, (places, status, pagination) => {
        const is_initial_page = initial_page;
        initial_page = false;
        if (version !== search_version) return;
        if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            nearby_layer.setLocations([]);
            rendered_locations.clear();
            location_results.replaceChildren();
            clear_location_details();
            location_results_empty.textContent = "No nearby locations were found.";
            onComplete(location);
            return;
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !Array.isArray(places)) {
            if (is_initial_page) {
                set_location_error("Nearby location search failed. Please try again.");
                clear_pagination();
                set_results_loading(false);
                active_search = null;
            } else {
                handle_pagination_failure(version);
            }
            return;
        }

        if (!render_locations(places, version, !is_initial_page)) {
            clear_pagination();
            set_results_loading(false);
            return;
        }

        update_pagination(pagination, version);
        set_results_loading(false);
        if (is_initial_page) onComplete(location);
    });
}

function parse_coordinates(value) {
    const match = value.trim().match(/^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,|\s)\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return isValidCoordinate({ lat, lng }) ? { lat, lng } : null;
}

function coordinate_like(value) {
    const trimmed = value.trim();
    return /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*(?:,|\s)\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(trimmed)
        || (trimmed.includes(",") && !/[A-Za-z]/.test(trimmed));
}

function read_coordinate(value) {
    const lat = typeof value?.lat === "function" ? value.lat() : value?.lat;
    const lng = typeof value?.lng === "function" ? value.lng() : value?.lng;
    return isValidCoordinate({ lat, lng }) ? { lat, lng } : null;
}

function get_search_options() {
    const radius = Number(radius_input.value);
    if (!Number.isSafeInteger(radius) || radius < 1 || radius > 50000) return null;
    if (!["prominence", "distance"].includes(rank_by_input.value)) return null;
    if (!["", "0", "1", "2", "3", "4"].includes(price_input.value)) return null;
    if (!PLACE_TYPES.has(place_type_input.value)) return null;
    return {
        keyword: place_keyword.value.trim() || undefined,
        openNow: open_now_input.checked,
        rankBy: rank_by_input.value,
        type: place_type_input.value,
        radius,
        price: price_input.value
    };
}

async function recenter_map(event, restored_context = null, search_override = null) {

    event.preventDefault();

    const version = ++search_version;
    const address = search_override?.address ?? map_input_location.value.trim();
    const options = search_override?.options ?? get_search_options();
    const history_version = history_revision;
    const save_history = search_override?.saveHistory !== false;
    const submitted_context = restored_context || snapshot_map_context();
    set_location_error("");

    if (!options) {
        set_location_error("Radius or search filters are invalid.");
        return;
    }
    if (!address && !options.keyword) {
        set_location_error("Enter a location to search.");
        return;
    }
    if (coordinate_like(address) && !parse_coordinates(address)) {
        set_location_error("Coordinates must use a latitude from -90 to 90 and longitude from -180 to 180.");
        return;
    }

    active_search = {
        address,
        options,
        context: submitted_context,
        location: search_override?.location || null,
        results: [],
        skippedCount: 0,
        selectedId: null
    };
    pending_search = {
        restored_context: restored_context && { ...restored_context },
        search_override: {
            ...search_override,
            address,
            options: { ...options },
            location: search_override?.location && { ...search_override.location },
            saveHistory: search_override?.saveHistory
        }
    };

    if (!await ensure_google_maps()) {
        if (version === search_version) active_search = null;
        return;
    }

    try {
        await Promise.all(["maps", "marker", "geocoding", "places"].map(
            library => google.maps.importLibrary(library)
        ));
        await customElements.whenDefined("gmp-map");
        if (version !== search_version) return;
        if (!google_map.innerMap) throw new Error("Map is not ready.");
        if (!map_adapter) {
            map_adapter = createGoogleMapsAdapter(google_map.innerMap, google.maps, {
                onClose: clear_location_details
            });
            nearby_layer = createLocationLayer(map_adapter, {
                onSelect: show_location_details
            });
        }
    } catch {
        if (version === search_version) {
            show_google_maps_error();
            active_search = null;
        }
        return;
    }

    if (version !== search_version) return;
    pending_search = null;
    clear_nearby_locations();

    const context = submitted_context || snapshot_map_context();
    if (!restored_context && context && !context.bounds) {
        context.bounds = google_map.innerMap.getBounds?.()?.toJSON?.() || null;
    }
    if (restored_context) {
        google_map.innerMap.setCenter(restored_context.center);
        if (restored_context.zoom !== null) google_map.innerMap.setZoom(restored_context.zoom);
    }
    const record_search = (searchCenter = null) => {
        if (version !== search_version) return;
        const savedContext = context && {
            ...context,
            center: { ...context.center },
            searchCenter: searchCenter && { ...searchCenter }
        };
        last_executed_search = {
            address,
            options: { ...options },
            context: savedContext,
            location: searchCenter && { ...searchCenter }
        };
        active_search.status = "complete";
        if (save_history && history_version === history_revision && history_store) {
            history_store.add({ query: address, options, context: savedContext });
            render_search_history();
        }
    };
    const coordinates = parse_coordinates(address);
    const use_location = (location, addPin = Boolean(address), preserveMapState = false) => {
        if (version !== search_version) return;
        active_search.location = location;
        if (!preserveMapState) google_map.innerMap.setCenter(location);
        if (addPin) add_target_pin(location, address);
        find_nearby_locations(location, options, version, record_search);
    };

    if (search_override?.location) {
        use_location(
            search_override.location,
            Boolean(address),
            search_override.preserveMapState === true
        );
        return;
    }

    if (!address) {
        const center = context?.center || google_map.innerMap.getCenter?.();
        const location = read_coordinate(center);
        if (!location) {
            set_location_error("The map center is not available yet. Please try again.");
            active_search = null;
            return;
        }
        active_search.location = location;
        find_nearby_locations(location, options, version, record_search);
        return;
    }

    if (coordinates) {
        use_location(coordinates);
        return;
    }

    const savedSearchCenter = read_coordinate(restored_context?.searchCenter);
    if (savedSearchCenter) {
        use_location(savedSearchCenter);
        return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
        if (version !== search_version) return;
        if (status !== "OK" || !results || results.length === 0) {
            set_location_error("Location not found. Try a more specific address or place.");
            active_search = null;
            return;
        }

        const geocoded_result = results[0];
        const location = read_coordinate(geocoded_result.geometry?.location);
        if (!location) {
            set_location_error("Location found without usable coordinates. Try a more specific place.");
            active_search = null;
            return;
        }
        if (version !== search_version) return;
        active_search.location = location;
        google_map.innerMap.setCenter(location);
        add_target_pin(location, geocoded_result.formatted_address || address);
        find_nearby_locations(location, options, version, record_search);
    });
}

location_form.addEventListener("submit", recenter_map);
location_results.addEventListener("click", handle_results_click);
details_close.addEventListener("click", close_location_details);
location_retry_button?.addEventListener("click", retry_google_maps);
location_results_load_more?.addEventListener("click", load_more_locations);

function update_radius_state() {
    const distance_selected = rank_by_input.value === "distance";
    radius_input.disabled = distance_selected;
    radius_input.setAttribute("aria-disabled", String(distance_selected));
}

function refresh_active_search() {
    const base = active_search || last_executed_search;
    if (!base) return;
    const options = get_search_options();
    if (!options) {
        set_location_error("Radius or search filters are invalid.");
        return;
    }
    if (JSON.stringify(options) === JSON.stringify(base.options)) return;
    return recenter_map({ preventDefault() {} }, null, {
        address: base.address,
        options,
        location: base.location,
        preserveMapState: Boolean(base.location),
        saveHistory: false
    });
}

function handle_filter_change(event) {
    if (!FILTER_INPUTS.has(event.target)) return;
    update_radius_state();
    return refresh_active_search();
}

location_form.addEventListener("change", handle_filter_change);

window.addEventListener("storage", event => {
    if (history_store && (event.key === null || event.key === history_store.storageKey)) {
        // A deletion in another tab must also invalidate pending history writes.
        history_revision++;
        render_search_history();
    }
});

// Start loading while the page renders, but do not cache a rejected result.
// Searches and the Retry action can request a fresh bounded loader sequence.
void request_google_maps_load().catch(() => {
    if (!active_search) show_google_maps_error();
});
