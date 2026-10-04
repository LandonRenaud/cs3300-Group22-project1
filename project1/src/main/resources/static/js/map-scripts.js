let map_input_latitude = document.querySelector(".map-input-latitude");
let map_input_longitude = document.querySelector(".map-input-longitude");
let coordinates_form = document.querySelector(".coordinates-input");
let google_map = document.querySelector(".google-map");
let location_results = document.querySelector(".location-results-list");
let location_results_empty = document.querySelector(".location-results-empty");

function recenter_map(event) {

    event.preventDefault();

    const latitude = Number(map_input_latitude.value);
    const longitude = Number(map_input_longitude.value);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
    }

    const location = { lat: latitude, lng: longitude };

    // Set the map center when the Google Maps component is ready.
    if (google_map.innerMap) {
        google_map.innerMap.setCenter(location);
    } else {
        google_map.setAttribute("center", `${latitude}, ${longitude}`);
    }

    const result = document.createElement("li");
    result.className = "location-result";
    result.innerHTML = `<strong>Location ${location_results.children.length + 1}</strong><span>Latitude: ${latitude}</span><br><span>Longitude: ${longitude}</span>`;
    location_results.append(result);
    location_results_empty.hidden = true;

    map_input_longitude.value = "";
    map_input_latitude.value = "";
}

coordinates_form.addEventListener("submit", recenter_map);
