let map_input_latitude = document.querySelector(".map-input-latitude");
let map_input_longitude = document.querySelector(".map-input-longitude");
let map_search_button = document.querySelector(".map-search-button");
let coordinates_form = document.querySelector(".coordinates-input");
let google_map = document.querySelector(".google-map");

function recenter_map(event) {

    event.preventDefault();

    console.log(map_input_longitude.value);
    console.log(map_input_latitude.value)

    // Get place ID and stuff with google places api - For search, not required right now

    // Set new center
    google_map.innerMap.setCenter({lat: +map_input_latitude.value, lng: +map_input_longitude.value}); 

    // Clear search input
    map_input_longitude.value = "";
    map_input_latitude.value = "";

    console.log("Success?");


}

map_search_button.addEventListener("click", recenter_map);
coordinates_form.addEventListener("submit", (event) => event.preventDefault());

console.log("testing");