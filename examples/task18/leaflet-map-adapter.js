function createPopup(location) {
  const popup = document.createElement('div');
  popup.className = 'location-popup';

  const title = document.createElement('h3');
  title.className = 'location-popup__name';
  title.textContent = location.name;
  popup.append(title);

  if (location.address) {
    const address = document.createElement('p');
    address.className = 'location-popup__address';
    address.textContent = location.address;
    popup.append(address);
  }

  if (location.types.length > 0) {
    const types = document.createElement('p');
    types.className = 'location-popup__types';
    types.textContent = location.types.join(' · ');
    popup.append(types);
  }

  return popup;
}

export function createLeafletMapAdapter(map, L) {
  return {
    addMarker(location, onSelect) {
      const marker = L.marker([location.lat, location.lng], {
        title: location.name,
        alt: location.name,
        keyboard: true,
      });
      const handleClick = () => onSelect();
      marker.bindPopup(createPopup(location), { maxWidth: 260 });
      marker.on('click', handleClick);
      marker.addTo(map);

      return {
        remove() {
          marker.closePopup();
          marker.off('click', handleClick);
          marker.unbindPopup();
          marker.remove();
        },
      };
    },

    fitLocations(locations) {
      if (locations.length === 1) {
        map.setView([locations[0].lat, locations[0].lng], 15);
        return;
      }

      map.fitBounds(locations.map(location => [location.lat, location.lng]), {
        padding: [48, 48],
        maxZoom: 16,
      });
    },
  };
}
