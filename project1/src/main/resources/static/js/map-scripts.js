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
let nearby_markers = [];
let target_marker = null;
let location_info_window = null;

function set_location_error(message) {
    location_error.textContent = message;
    location_error.hidden = !message;
}

function get_location_info_content(name, address, rating) {
    const content = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = name;
    content.append(title);

    if (address) {
        const address_text = document.createElement("div");
        address_text.textContent = address;
        content.append(address_text);
    }

    if (rating) {
        const rating_text = document.createElement("div");
        rating_text.textContent = `Rating: ${rating}/5`;
        content.append(rating_text);
    }
    return content;
}

function attach_hover_info(marker, name, address, rating) {
    marker.addEventListener("mouseenter", () => {
        location_info_window.setContent(get_location_info_content(name, address, rating));
        location_info_window.open({ map: google_map.innerMap, anchor: marker });
    });
    marker.addEventListener("mouseleave", () => location_info_window.close());
}

function clear_nearby_locations() {
    nearby_markers.forEach((marker) => marker.map = null);
    nearby_markers = [];
    if (target_marker) {
        target_marker.map = null;
        target_marker = null;
    }
    location_results.replaceChildren();
    location_results_empty.hidden = false;
}

function add_target_pin(location, name) {
    const add_pin = () => {
        if (!google_map.innerMap || !google.maps.marker || !google.maps.marker.AdvancedMarkerElement) {
            return false;
        }

        if (!location_info_window) {
            location_info_window = new google.maps.InfoWindow();
        }

        const pin_content = document.createElement("div");
        pin_content.className = "target-location-pin";
        pin_content.setAttribute("aria-label", `Search center: ${name}`);

        target_marker = new google.maps.marker.AdvancedMarkerElement({
            map: google_map.innerMap,
            position: location,
            content: pin_content,
            zIndex: 1000
        });
        attach_hover_info(target_marker, name);
        return true;
    };

    if (!add_pin()) {
        google_map.addEventListener("gmp-map-ready", add_pin, { once: true });
    }
}

function add_nearby_pin(place) {
    const marker = new google.maps.marker.AdvancedMarkerElement({
        map: google_map.innerMap,
        position: place.geometry.location
    });
    nearby_markers.push(marker);
    attach_hover_info(marker, place.name || "Unnamed location", place.vicinity, place.rating);
}

function find_nearby_locations(location) {
    if (!google.maps.places || !google.maps.places.PlacesService) {
        set_location_error("Nearby location search is temporarily unavailable. Please try again.");
        return;
    }

    const request = {
        location,
        keyword: place_keyword.value.trim() || undefined,
        openNow: open_now_input.checked,
        rankBy: rank_by_input.value === "distance"
            ? google.maps.places.RankBy.DISTANCE
            : google.maps.places.RankBy.PROMINENCE,
        type: place_type_input.value
    };

    if (rank_by_input.value !== "distance") {
        request.radius = Math.max(1, Number(radius_input.value) || 5000);
    }

    if (price_input.value !== "") {
        request.minPriceLevel = Number(price_input.value);
        request.maxPriceLevel = Number(price_input.value);
    }

    const places_service = new google.maps.places.PlacesService(google_map.innerMap);
    places_service.nearbySearch(request, (places, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !places || places.length === 0) {
            set_location_error("No nearby locations were found.");
            return;
        }

        location_results_empty.hidden = true;
        places.forEach((place) => {
            if (!place.geometry || !place.geometry.location) return;

            add_nearby_pin(place);
            const result = document.createElement("li");
            result.className = "location-result";
            const name = document.createElement("strong");
            name.textContent = place.name || "Unnamed location";
            result.append(name);

            if (place.vicinity) {
                const address = document.createElement("span");
                address.textContent = place.vicinity;
                result.append(address);
            }
            location_results.append(result);
        });
    });
}

function recenter_map(event) {

    event.preventDefault();

    const address = map_input_location.value.trim();
    set_location_error("");
    clear_nearby_locations();

    if (!address) {
        set_location_error("Enter a location to search.");
        return;
    }

    if (!window.google || !google.maps || !google.maps.Geocoder) {
        set_location_error("Location search is temporarily unavailable. Please try again.");
        return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
        if (status !== "OK" || !results || results.length === 0) {
            set_location_error("Location not found. Try a more specific address or place.");
            return;
        }

        const geocoded_result = results[0];
        const coordinates = geocoded_result.geometry.location;
        const latitude = coordinates.lat();
        const longitude = coordinates.lng();
        const location = { lat: latitude, lng: longitude };

        // Set the map center when the Google Maps component is ready.
        if (google_map.innerMap) {
            google_map.innerMap.setCenter(location);
        } else {
            google_map.setAttribute("center", `${latitude}, ${longitude}`);
        }
        add_target_pin(location, geocoded_result.formatted_address);
        find_nearby_locations(location);

        map_input_location.value = "";
    });
}

location_form.addEventListener("submit", recenter_map);

rank_by_input.addEventListener("change", () => {
    const distance_selected = rank_by_input.value === "distance";
    radius_input.disabled = distance_selected;
    radius_input.setAttribute("aria-disabled", String(distance_selected));
});
