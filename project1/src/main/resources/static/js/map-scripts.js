let map_input_location = document.querySelector(".map-input-location");
let location_form = document.querySelector(".location-input");
let google_map = document.querySelector(".google-map");
let location_results = document.querySelector(".location-results-list");
let location_results_empty = document.querySelector(".location-results-empty");
let location_error = document.querySelector(".location-error");

function set_location_error(message) {
    location_error.textContent = message;
    location_error.hidden = !message;
}

function add_location_pin(location, name) {
    const add_pin = () => {
        if (!google_map.innerMap || !google.maps.marker || !google.maps.marker.AdvancedMarkerElement) {
            return false;
        }

        new google.maps.marker.AdvancedMarkerElement({
            map: google_map.innerMap,
            position: location,
            title: name
        });
        return true;
    };

    if (!add_pin()) {
        google_map.addEventListener("gmp-map-ready", add_pin, { once: true });
    }
}

function recenter_map(event) {

    event.preventDefault();

    const address = map_input_location.value.trim();
    set_location_error("");

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
        add_location_pin(location, geocoded_result.formatted_address);

        const result = document.createElement("li");
        result.className = "location-result";
        result.innerHTML = `<strong></strong><span>Latitude: ${latitude}</span><br><span>Longitude: ${longitude}</span>`;
        result.querySelector("strong").textContent = geocoded_result.formatted_address;
        location_results.append(result);
        location_results_empty.hidden = true;

        map_input_location.value = "";
    });
}

location_form.addEventListener("submit", recenter_map);
