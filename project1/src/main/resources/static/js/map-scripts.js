import { createLocationLayer } from "./location-markers.js";
import { createGoogleMapsAdapter, normalizeGooglePlaces } from "./google-maps-adapter.js";

let map_input_location = document.querySelector(".map-input-location");
let location_form = document.querySelector(".location-input");
let google_map = document.querySelector(".google-map");
let location_results = document.querySelector(".location-results-list");
let location_results_empty = document.querySelector(".location-results-empty");
let location_error = document.querySelector(".location-error");
let place_keyword = document.querySelector(".map-input-keyword");
let radius_input = document.querySelector(".map-input-radius");
let price_input = document.querySelector(".map-input-price");
let open_now_input = document.querySelector(".map-input-open-now");
let rank_by_input = document.querySelector(".map-input-rank-by");
let place_type_input = document.querySelector(".map-input-place-type");
let nearby_layer = null;
let map_adapter = null;
let search_version = 0;
let target_marker = null;

function set_location_error(message) {
    location_error.textContent = message;
    location_error.hidden = !message;
}

function select_location(id) {
    for (const result of location_results.children) {
        const selected = result.dataset.locationId === id;
        result.classList.toggle("is-selected", selected);
        if (selected) {
            result.setAttribute("aria-current", "true");
            result.scrollIntoView({ block: "nearest" });
        } else {
            result.removeAttribute("aria-current");
        }
    }
}

function clear_nearby_locations() {
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
    target_marker = map_adapter.addMarker({ ...location, name }, () => select_location(null), {
        content: pin_content,
        zIndex: 1000
    });
}

function get_search_options() {
    return {
        keyword: place_keyword.value.trim() || undefined,
        openNow: open_now_input.checked,
        rankBy: rank_by_input.value,
        type: place_type_input.value,
        radius: Math.max(1, Number(radius_input.value) || 5000),
        price: price_input.value
    };
}

function get_visible_bounds() {
    return google_map.innerMap?.getBounds?.() || null;
}

function is_in_visible_bounds(place, bounds) {
    if (!bounds) return true;
    return bounds.contains({ lat: place.lat, lng: place.lng });
}

function render_locations(places, version, bounds = null) {
    if (version !== search_version) return;
    const result = normalizeGooglePlaces(places);
    const scopedLocations = result.locations.filter(place => is_in_visible_bounds(place, bounds));
    try {
        nearby_layer.setLocations(scopedLocations);
    } catch {
        set_location_error("Nearby locations could not be displayed. Please try again.");
        return;
    }
    location_results.replaceChildren();
    location_results_empty.hidden = scopedLocations.length > 0;
    location_results_empty.textContent = "No nearby locations were found in the visible map area.";
    if (result.skippedCount > 0) {
        set_location_error(`${result.skippedCount} locations could not be mapped because their coordinates were invalid.`);
    }
    for (const place of scopedLocations) {
        const item = document.createElement("li");
        item.className = "location-result";
        item.dataset.locationId = place.id;
        const name = document.createElement("strong");
        name.textContent = place.name;
        item.append(name);

        if (place.address) {
            const address = document.createElement("span");
            address.textContent = place.address;
            item.append(address);
        }
        location_results.append(item);
    }
}

function find_nearby_locations(location, options, version, bounds = null) {
    if (!google.maps.places || !google.maps.places.PlacesService) {
        set_location_error("Nearby location search is temporarily unavailable. Please try again.");
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
    places_service.nearbySearch(request, (places, status) => {
        if (version !== search_version) return;
        if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            nearby_layer.setLocations([]);
            location_results_empty.textContent = "No nearby locations were found.";
            return;
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !Array.isArray(places)) {
            set_location_error("Nearby location search failed. Please try again.");
            return;
        }

        render_locations(places, version, bounds);
    });
}

function parse_coordinates(value) {
    const match = value.trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function search_place_name(query, options, version, bounds) {
    const places_service = new google.maps.places.PlacesService(google_map.innerMap);
    const textQuery = [query, options.keyword].filter(Boolean).join(" ");
    const request = { query: textQuery, bounds, type: options.type };
    places_service.textSearch(request, (places, status) => {
        if (version !== search_version) return;
        if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
            nearby_layer.setLocations([]);
            location_results_empty.textContent = "No matching locations were found in the visible map area.";
            return;
        }
        if (status !== google.maps.places.PlacesServiceStatus.OK || !Array.isArray(places)) {
            set_location_error("Location search failed. Try a more specific place name.");
            return;
        }
        const filteredPlaces = places.filter(place =>
            (!options.openNow || place.opening_hours?.open_now === true) &&
            (options.price === "" || place.price_level === Number(options.price))
        );
        render_locations(filteredPlaces, version, bounds);
    });
}

async function recenter_map(event) {

    event.preventDefault();

    const version = ++search_version;
    const address = map_input_location.value.trim();
    const options = get_search_options();
    set_location_error("");
    clear_nearby_locations();

    if (!address && !options.keyword) {
        set_location_error("Enter a location to search.");
        return;
    }

    if (!window.google?.maps?.importLibrary) {
        set_location_error("Location search is temporarily unavailable. Please try again.");
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
            map_adapter = createGoogleMapsAdapter(google_map.innerMap, google.maps);
            nearby_layer = createLocationLayer(map_adapter, {
                onSelect: location => select_location(location.id)
            });
        }
    } catch {
        if (version === search_version) {
            set_location_error("The map is not ready. Please try again.");
        }
        return;
    }

    const visibleBounds = get_visible_bounds();
    const coordinates = parse_coordinates(address);
    if (!address) {
        const center = google_map.innerMap.getCenter?.();
        const location = center && typeof center.lat === "function"
            ? { lat: center.lat(), lng: center.lng() }
            : center;
        if (!location) {
            set_location_error("The map center is not available yet. Please try again.");
            return;
        }
        find_nearby_locations(location, options, version, visibleBounds);
        return;
    }

    if (coordinates) {
        google_map.innerMap.setCenter(coordinates);
        add_target_pin(coordinates, `${coordinates.lat}, ${coordinates.lng}`);
        // The map is being moved to this new point. Do not use the old
        // viewport bounds while the Google map is still updating; the nearby
        // search radius is the scope for this coordinate search.
        find_nearby_locations(coordinates, options, version);
        return;
    }

    // A plain name is a Places query, not an address to geocode globally.
    if (visibleBounds && !/\d/.test(address)) {
        search_place_name(address, options, version, visibleBounds);
        return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address, ...(visibleBounds ? { bounds: visibleBounds } : {}) }, (results, status) => {
        if (version !== search_version) return;
        if (status !== "OK" || !results || results.length === 0) {
            set_location_error("Location not found. Try a more specific address or place.");
            return;
        }

        const geocoded_result = results[0];
        const coordinates = geocoded_result.geometry.location;
        const latitude = coordinates.lat();
        const longitude = coordinates.lng();
        const location = { lat: latitude, lng: longitude };

        // A place-name geocode can resolve to an unrelated city or country. When
        // the result is outside the map's current scope, use Places text search
        // with the visible bounds instead of accepting that distant result.
        if (!options.keyword && visibleBounds && !visibleBounds.contains(location)) {
            search_place_name(address, options, version, visibleBounds);
            return;
        }

        google_map.innerMap.setCenter(location);
        add_target_pin(location, geocoded_result.formatted_address);
        find_nearby_locations(location, options, version);

    });
}

location_form.addEventListener("submit", recenter_map);

rank_by_input.addEventListener("change", () => {
    const distance_selected = rank_by_input.value === "distance";
    radius_input.disabled = distance_selected;
    radius_input.setAttribute("aria-disabled", String(distance_selected));
});
