const all = [
  {
    id: 'fixture-reading-room',
    name: 'Demo Reading Room',
    lat: 33.7772,
    lng: -84.3964,
    address: '100 Example Walk · fictional address',
    types: ['Library', 'Fixture'],
  },
  {
    id: 'fixture-coffee-stop',
    name: 'Demo Coffee Stop',
    lat: 33.7737,
    lng: -84.3897,
    address: '200 Example Avenue · fictional address',
    types: ['Cafe', 'Fixture'],
  },
  {
    id: 'fixture-garden',
    name: 'Demo Pocket Garden',
    lat: 33.7696,
    lng: -84.3957,
    address: '300 Example Lane · fictional address',
    types: ['Park', 'Fixture'],
  },
];

export const scenarios = {
  all: {
    description: 'Three synthetic locations near Atlanta. Repeating this set should keep exactly three markers.',
    locations: all,
    fitView: true,
  },
  subset: {
    description: 'A fixed one-location subset. Removed locations disappear while the current map view stays in place.',
    locations: [all[0]],
    fitView: false,
  },
  alternate: {
    description: 'A replacement set with two new locations. No markers from the previous set should remain.',
    locations: [
      {
        id: 'fixture-workshop',
        name: 'Demo Workshop',
        lat: 33.7815,
        lng: -84.4008,
        address: '400 Example Drive · fictional address',
        types: ['Workshop', 'Fixture'],
      },
      {
        id: 'fixture-gallery',
        name: 'Demo Gallery',
        lat: 33.7838,
        lng: -84.3915,
        address: '500 Example Street · fictional address',
        types: ['Gallery', 'Fixture'],
      },
    ],
    fitView: true,
  },
  empty: {
    description: 'An empty successful result: all location markers and open popups are removed. The base map remains.',
    locations: [],
    fitView: false,
  },
  validation: {
    description: 'Two valid points, including (0, 0); four invalid records; one duplicate ID. HTML-like text must remain plain text.',
    locations: [
      {
        id: 'fixture-zero',
        name: 'Demo Zero Coordinates',
        lat: 0,
        lng: 0,
        address: 'Synthetic origin point · no real venue',
        types: ['Fixture'],
      },
      {
        id: 'fixture-literal-text',
        name: '<b>Demo plain text</b>',
        lat: 33.7762,
        lng: -84.3948,
        address: '<img src=x onerror=alert(1)>',
        types: ['<em>Fixture</em>'],
      },
      { id: 'fixture-invalid-lat', name: 'Invalid latitude', lat: 95, lng: -84.39 },
      { id: 'fixture-invalid-lng', name: 'Invalid longitude', lat: 33.77, lng: -181 },
      { id: 'fixture-missing', name: 'Missing coordinate', lat: 33.77 },
      { id: 'fixture-string', name: 'String coordinate', lat: '33.77', lng: -84.39 },
      { id: 'fixture-zero', name: 'Duplicate origin ID', lat: 0, lng: 0 },
    ],
    fitView: true,
  },
};
