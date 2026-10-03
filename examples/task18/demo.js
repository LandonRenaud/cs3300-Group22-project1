import { createLocationLayer } from '../../project1/src/main/resources/static/js/location-markers.js';
import { createLeafletMapAdapter } from './leaflet-map-adapter.js';
import { scenarios } from './locations-fixture.js';

const buttons = [...document.querySelectorAll('[data-scenario]')];
const list = document.querySelector('#locations-list');
const count = document.querySelector('#result-count');
const resultStatus = document.querySelector('#result-status');
const selectionStatus = document.querySelector('#selection-status');
const description = document.querySelector('#scenario-description');
const emptyState = document.querySelector('#empty-state');
const mapNotice = document.querySelector('#map-notice');

function showMapNotice(message) {
  mapNotice.textContent = message;
  mapNotice.hidden = false;
}

function renderLocations(locations) {
  list.replaceChildren();
  count.textContent = String(locations.length);
  emptyState.hidden = locations.length > 0;

  for (const location of locations) {
    const item = document.createElement('li');
    item.dataset.locationId = location.id;

    const title = document.createElement('p');
    title.className = 'location-title';
    title.textContent = location.name;
    item.append(title);

    if (location.address) {
      const address = document.createElement('p');
      address.className = 'location-address';
      address.textContent = location.address;
      item.append(address);
    }

    if (location.types.length > 0) {
      const types = document.createElement('p');
      types.className = 'location-types';
      types.textContent = location.types.join(' · ');
      item.append(types);
    }

    list.append(item);
  }
}

function startDemo() {
  const L = window.L;
  const map = L.map('map').setView([33.7753, -84.394], 14);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });

  tiles.on('tileerror', () => {
    showMapNotice('Some map tiles could not load. Check your connection. Fixture markers can still be tested.');
  });
  tiles.addTo(map);

  const adapter = createLeafletMapAdapter(map, L);
  let displayedLocations = [];
  const layer = createLocationLayer({
    addMarker(location, onSelect) {
      const marker = adapter.addMarker(location, onSelect);
      displayedLocations.push(location);
      return marker;
    },
    fitLocations: locations => adapter.fitLocations(locations),
  }, {
    onSelect(location) {
      selectionStatus.textContent = location.name;
      for (const item of list.children) {
        item.classList.toggle('is-selected', item.dataset.locationId === String(location.id));
      }
    },
  });

  function showScenario(name) {
    const scenario = scenarios[name];
    displayedLocations = [];
    const result = layer.setLocations(scenario.locations, { fitView: scenario.fitView });
    renderLocations(displayedLocations);
    description.textContent = scenario.description;
    selectionStatus.textContent = result.displayedCount > 0
      ? 'Select a marker on the map.'
      : 'No marker selected.';
    resultStatus.textContent = `${result.displayedCount} displayed · ${result.skippedCount} invalid skipped · ${result.duplicateCount} duplicate IDs ignored`;

    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.scenario === name));
    }
  }

  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => showScenario(button.dataset.scenario));
  }

  showScenario('all');
  window.addEventListener('pagehide', event => {
    if (!event.persisted) {
      layer.destroy();
      map.remove();
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  if (window.L) {
    startDemo();
  } else {
    showMapNotice('The map library could not load. Check your connection and reload this page.');
    description.textContent = 'The demonstration is unavailable until the map library loads.';
    resultStatus.textContent = 'Map initialization failed.';
  }
});
