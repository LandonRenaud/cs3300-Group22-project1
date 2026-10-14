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
let location_error = document.querySelector(".location-error");
let location_search_status = document.querySelector(".location-search-status");
let location_search_status_text = document.querySelector(".location-search-status-text");
let location_search_loading = document.querySelector(".location-search-loading");
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
const SEARCH_STATES = Object.freeze({
    IDLE: "idle",
    SEARCHING: "searching",
    RESULTS: "results",
    NO_RESULTS: "no-results",
    FAILED: "failed"
});
let googleMapsReady = loadGoogleMaps().then(() => true, () => {
    googleMapsReady = null;
    return false;
});
const PLACE_TYPES = new Set([
    "point_of_interest", "restaurant", "cafe", "bar", "park",
    "tourist_attraction", "supermarket", "shopping_mall"
]);
const FILTER_INPUTS = new Set([
    place_type_input, price_input, open_now_input, rank_by_input, radius_input
]);

function wait_for_google_maps() {
    if (!googleMapsReady) {
        googleMapsReady = loadGoogleMaps().then(() => true, () => {
            googleMapsReady = null;
            return false;
        });
    }
    return googleMapsReady;
}

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
    location_error.textContent = message;
    location_error.hidden = !message;
}

function set_search_state(state, message) {
    if (!Object.values(SEARCH_STATES).includes(state)) return;
    const status_message = message || {
        [SEARCH_STATES.IDLE]: "Ready to search for nearby locations.",
        [SEARCH_STATES.SEARCHING]: "Searching nearby locations…",
        [SEARCH_STATES.RESULTS]: "Nearby locations found.",
        [SEARCH_STATES.NO_RESULTS]: "No nearby locations were found.",
        [SEARCH_STATES.FAILED]: "Search failed. Please try again."
    }[state];
    if (location_search_status_text) location_search_status_text.textContent = status_message;
    else location_search_status.textContent = status_message;
    location_search_loading.hidden = state !== SEARCH_STATES.SEARCHING;
    location_form.dataset.searchState = state;
    location_form.setAttribute("aria-busy", String(state === SEARCH_STATES.SEARCHING));
    location_results.dataset.searchState = state;
    location_results_empty.hidden = ![SEARCH_STATES.IDLE, SEARCH_STATES.NO_RESULTS].includes(state);
}

function search_context_key(context) {
    if (!context) return null;
    return {
        center: context.center && { ...context.center },
        bounds: context.bounds && { ...context.bounds },
        zoom: context.zoom ?? null,
        searchCenter: context.searchCenter && { ...context.searchCenter }
    };
}

function request_key(address, options, context, search_override) {
    return JSON.stringify({
        address,
        options,
        context: search_context_key(context),
        location: search_override?.location && { ...search_override.location }
    });
}

function is_current_search(version) {
    return version === search_version
        && active_search?.version === version
        && active_search.status === SEARCH_STATES.SEARCHING;
}

function fail_search(version, message) {
    if (version !== search_version) return false;
    active_search = null;
    set_location_error(message);
    set_search_state(SEARCH_STATES.FAILED, `Search failed. ${message}`);
    return true;
}

function geocoding_error_message(status) {
    if (status === "ZERO_RESULTS" || status === "NOT_FOUND") {
        return "Location not found. Try a more specific address or place.";
    }
    if (["ERROR", "UNKNOWN_ERROR", "OVER_QUERY_LIMIT"].includes(status)) {
        return "Location lookup is temporarily unavailable. Check your connection and try again.";
    }
    if (status === "REQUEST_DENIED") {
        return "Location lookup was denied by Google Maps. Please try again later.";
    }
    return "Location lookup failed. Check the address and try again.";
}

function places_error_message(status) {
    if (status === "REQUEST_DENIED") {
        return "Nearby location search failed because Google Maps denied the request. Please try again later.";
    }
    if (status === "OVER_QUERY_LIMIT") {
        return "Nearby location search failed temporarily because the service limit was reached. Please try again later.";
    }
    if (status === "INVALID_REQUEST") {
        return "Nearby location search failed because these filters are not supported. Please check them and try again.";
    }
    if (status === "UNKNOWN_ERROR" || status === "ERROR") {
        return "Nearby location search failed because the service could not connect. Check your connection and try again.";
    }
    return "Nearby location search failed. Please try again.";
}

set_search_state(SEARCH_STATES.IDLE);

function select_location(id) {
    for (const result of location_results.children) {
        const selected = result.dataset.locationId === id;
        result.classList.toggle("is-selected", selected);
        result.querySelector("button")?.setAttribute("aria-pressed", String(selected));
        if (selected) {
            result.setAttribute("aria-current", "true");
            result.scrollIntoView({ block: "nearest" });
        } else {
            result.removeAttribute("aria-current");
        }
    }
}

function close_location_details() {
    if (nearby_layer) nearby_layer.closeFocused();
    else map_adapter?.close?.();
    location_details.hidden = true;
    select_location(null);
    document.dispatchEvent(new Event("location-cleared"));
}

function show_location_details(place) {
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

function clear_nearby_locations() {
    close_location_details();
    nearby_layer?.clear();
    target_marker?.remove();
    target_marker = null;
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

function render_locations(places, version) {
    if (!is_current_search(version)) return null;
    const result = normalizeGooglePlaces(places);
    let scopedLocations = result.locations;
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
        fail_search(version, "Nearby locations could not be displayed. Please try again.");
        return null;
    }
    location_results.replaceChildren();
    location_results_empty.hidden = scopedLocations.length > 0;
    location_results_empty.textContent = "No nearby locations were found.";
    if (result.skippedCount > 0) {
        set_location_error(`${result.skippedCount} locations could not be mapped because their coordinates were invalid.`);
    }
    for (const place of scopedLocations) {
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
        button.addEventListener("click", () => {
            nearby_layer.focusLocation(place.id);
            show_location_details(place);
        });
        item.append(button);
        location_results.append(item);
    }
    return { count: scopedLocations.length };
}

function find_nearby_locations(location, options, version, onComplete = () => {}) {
    if (!is_current_search(version)) return;
    if (!globalThis.google?.maps?.places?.PlacesService) {
        fail_search(version, "Nearby location search is temporarily unavailable. Please try again.");
        return;
    }

    try {
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
        places_service.nearbySearch(request, (places, status) => {
            if (!is_current_search(version)) return;
            try {
                const zero_results = status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS
                    || status === "ZERO_RESULTS";
                if (zero_results) {
                    const rendered = render_locations([], version);
                    if (rendered) onComplete(location, rendered.count);
                    return;
                }
                const ok = status === google.maps.places.PlacesServiceStatus.OK || status === "OK";
                if (!ok || !Array.isArray(places)) {
                    fail_search(version, places_error_message(status));
                    return;
                }

                const rendered = render_locations(places, version);
                if (rendered) onComplete(location, rendered.count);
            } catch {
                fail_search(version, "Nearby location search could not be completed. Check your connection and try again.");
            }
        });
    } catch {
        fail_search(version, "Nearby location search could not connect. Check your connection and try again.");
    }
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

    const address = search_override?.address ?? map_input_location.value.trim();
    const options = search_override?.options ?? get_search_options();
    const submitted_context = restored_context || snapshot_map_context();
    // A blank-location keyword search depends on the current viewport; an address
    // or coordinate search does not. History replay also intentionally restores
    // its saved viewport, so keep that context in its duplicate key.
    const key_context = (!address || restored_context) ? submitted_context : null;
    const submitted_key = request_key(address, options, key_context, search_override);
    if (active_search?.status === SEARCH_STATES.SEARCHING
        && active_search.requestKey === submitted_key) return;

    const version = ++search_version;
    const history_version = history_revision;
    const save_history = search_override?.saveHistory !== false;
    set_location_error("");
    clear_nearby_locations();
    active_search = null;

    if (!options) {
        fail_search(version, "Radius or search filters are invalid.");
        return;
    }
    if (!address && !options.keyword) {
        fail_search(version, "Enter a location to search.");
        return;
    }
    if (coordinate_like(address) && !parse_coordinates(address)) {
        fail_search(version, "Coordinates must use a latitude from -90 to 90 and longitude from -180 to 180.");
        return;
    }

    active_search = {
        version,
        requestKey: submitted_key,
        status: SEARCH_STATES.SEARCHING,
        address,
        options,
        context: submitted_context,
        location: search_override?.location || null
    };
    set_search_state(SEARCH_STATES.SEARCHING);

    if (!await wait_for_google_maps()) {
        fail_search(version, "Google Maps could not be loaded. Check your connection and try again.");
        return;
    }

    try {
        await Promise.all(["maps", "marker", "geocoding", "places"].map(
            library => google.maps.importLibrary(library)
        ));
        await customElements.whenDefined("gmp-map");
        if (!is_current_search(version)) return;
        if (!google_map.innerMap) throw new Error("Map is not ready.");
        if (!map_adapter) {
            map_adapter = createGoogleMapsAdapter(google_map.innerMap, google.maps);
            nearby_layer = createLocationLayer(map_adapter, {
                onSelect: show_location_details
            });
        }
    } catch {
        fail_search(version, "The map is not ready. Check your connection and try again.");
        return;
    }

    const context = submitted_context || snapshot_map_context();
    if (!restored_context && context && !context.bounds) {
        context.bounds = google_map.innerMap.getBounds?.()?.toJSON?.() || null;
    }
    if (restored_context) {
        google_map.innerMap.setCenter(restored_context.center);
        if (restored_context.zoom !== null) google_map.innerMap.setZoom(restored_context.zoom);
    }
    const record_search = (searchCenter = null, result_count = 0) => {
        if (!is_current_search(version)) return false;
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
        active_search.status = result_count > 0 ? SEARCH_STATES.RESULTS : SEARCH_STATES.NO_RESULTS;
        set_search_state(active_search.status, result_count > 0
            ? `${result_count} nearby ${result_count === 1 ? "location" : "locations"} found.`
            : "No nearby locations were found.");
        if (save_history && history_version === history_revision && history_store) {
            history_store.add({ query: address, options, context: savedContext });
            render_search_history();
        }
        return true;
    };
    const coordinates = parse_coordinates(address);
    const use_location = (location, addPin = Boolean(address), preserveMapState = false, pinName = address) => {
        if (!is_current_search(version)) return;
        try {
            active_search.location = location;
            if (!preserveMapState) google_map.innerMap.setCenter(location);
            if (addPin) add_target_pin(location, pinName);
            find_nearby_locations(location, options, version, record_search);
        } catch {
            fail_search(version, "The location search could not be completed. Check your connection and try again.");
        }
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
            fail_search(version, "The map center is not available yet. Please try again.");
            return;
        }
        use_location(location, false, true);
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

    try {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
            if (!is_current_search(version)) return;
            try {
                if (status !== "OK" || !results || results.length === 0) {
                    fail_search(version, geocoding_error_message(status));
                    return;
                }

                const geocoded_result = results[0];
                const location = read_coordinate(geocoded_result.geometry?.location);
                if (!location) {
                    fail_search(version, "Location found without usable coordinates. Try a more specific place.");
                    return;
                }
                use_location(location, true, false, geocoded_result.formatted_address || address);
            } catch {
                fail_search(version, "Location lookup could not be completed. Check your connection and try again.");
            }
        });
    } catch {
        fail_search(version, "Location lookup could not connect. Check your connection and try again.");
    }
}

location_form.addEventListener("submit", recenter_map);
details_close.addEventListener("click", close_location_details);

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
        const version = ++search_version;
        active_search = null;
        set_location_error("");
        clear_nearby_locations();
        fail_search(version, "Radius or search filters are invalid.");
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
