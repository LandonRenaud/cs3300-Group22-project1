import { normalizeLocations } from "./location-markers.js";

export function normalizeGooglePlaces(places) {
  return normalizeLocations(places.map(place => {
    const position = place?.geometry?.location;
    return {
      id: place?.place_id,
      name: place?.name,
      lat: typeof position?.lat === "function" ? position.lat() : position?.lat,
      lng: typeof position?.lng === "function" ? position.lng() : position?.lng,
      address: place?.vicinity || place?.formatted_address,
      types: place?.types,
      rating: place?.rating
    };
  }));
}

function createPopup(location) {
  const content = document.createElement("div");
  content.className = "location-popup";
  const title = document.createElement("h3");
  title.className = "location-popup__name";
  title.textContent = location.name;
  content.append(title);

  const details = [
    location.address,
    Number.isFinite(location.rating) ? `Rating: ${location.rating}/5` : "",
    location.types?.join(" · ")
  ];
  for (const text of details) {
    if (!text) continue;
    const detail = document.createElement("p");
    detail.className = "location-popup__address";
    detail.textContent = text;
    content.append(detail);
  }
  return content;
}

export function createGoogleMapsAdapter(map, maps, { onClose } = {}) {
  if (onClose !== undefined && typeof onClose !== "function") {
    throw new TypeError("onClose must be a function.");
  }

  const infoWindow = new maps.InfoWindow();
  let activeMarker = null;
  let pinnedMarker = null;
  let selectedMarker = null;
  let fitListener = null;

  function setSelectedMarker(marker) {
    if (selectedMarker === marker) return;
    selectedMarker?.classList?.toggle?.("location-marker-selected", false);
    selectedMarker?.removeAttribute?.("aria-current");
    selectedMarker = marker;
    selectedMarker?.classList?.toggle?.("location-marker-selected", true);
    if (selectedMarker) selectedMarker.setAttribute?.("aria-current", "true");
  }

  function clearPopupState() {
    infoWindow.close();
    activeMarker = null;
    pinnedMarker = null;
    setSelectedMarker(null);
  }

  if (typeof infoWindow.addListener === "function") {
    infoWindow.addListener("closeclick", () => {
      clearPopupState();
      onClose?.();
    });
  }

  return {
    addMarker(location, onSelect = () => {}, markerOptions = {}) {
      const marker = new maps.marker.AdvancedMarkerElement({
        ...markerOptions,
        map,
        position: { lat: location.lat, lng: location.lng },
        title: location.name,
        gmpClickable: true
      });
      marker.classList?.toggle?.("location-marker", true);
      marker.setAttribute?.("aria-label", location.name);
      let removed = false;
      const open = () => {
        if (removed) return;
        activeMarker = marker;
        infoWindow.setContent(createPopup(location));
        infoWindow.open({ map, anchor: marker, shouldFocus: false });
      };
      const select = () => {
        if (removed) return;
        setSelectedMarker(marker);
        pinnedMarker = marker;
        open();
        onSelect();
      };
      const focus = ({ pan = false } = {}) => {
        if (removed) return;
        setSelectedMarker(marker);
        pinnedMarker = marker;
        if (pan) map.panTo?.({ lat: location.lat, lng: location.lng });
        open();
      };
      const enter = () => {
        pinnedMarker = null;
        open();
      };
      const leave = () => {
        if (activeMarker === marker && pinnedMarker !== marker) {
          infoWindow.close();
          activeMarker = null;
        }
      };
      marker.addEventListener("gmp-click", select);
      marker.addEventListener("mouseenter", enter);
      marker.addEventListener("mouseleave", leave);

      return {
        focus,
        close() {
          if (activeMarker === marker) {
            infoWindow.close();
            activeMarker = null;
          }
          if (pinnedMarker === marker) pinnedMarker = null;
          if (selectedMarker === marker) setSelectedMarker(null);
        },
        remove() {
          if (removed) return;
          removed = true;
          marker.removeEventListener("gmp-click", select);
          marker.removeEventListener("mouseenter", enter);
          marker.removeEventListener("mouseleave", leave);
          if (activeMarker === marker) {
            infoWindow.close();
            activeMarker = null;
          }
          if (pinnedMarker === marker) pinnedMarker = null;
          if (selectedMarker === marker) setSelectedMarker(null);
          marker.map = null;
        }
      };
    },

    close() {
      clearPopupState();
    },

    fitLocations(locations) {
      fitListener?.remove();
      fitListener = null;
      if (locations.length === 0) return;
      if (locations.length === 1) {
        map.setCenter({ lat: locations[0].lat, lng: locations[0].lng });
        map.setZoom(15);
        return;
      }
      const bounds = new maps.LatLngBounds();
      for (const location of locations) bounds.extend({ lat: location.lat, lng: location.lng });
      fitListener = maps.event.addListenerOnce(map, "idle", () => {
        if (map.getZoom() > 16) map.setZoom(16);
        fitListener = null;
      });
      map.fitBounds(bounds, 48);
    }
  };
}
