import { TravelGlobe } from './globe.js';
import {
  locations,
  continents,
  adaptMissions,
  progressForLocation,
  isLocationUnlocked,
} from './locations.js';
import { WeatherService } from './weather.js';
import { MELBOURNE, MELBOURNE_MAP } from './melbourne.js';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function weatherHTML(weather, location, mode = 'live', env = null) {
  const localTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: location.timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  if (mode === 'practice')
    return (
      '<div class="weather-main"><div><strong>' +
      Math.round(env?.outdoorTemp ?? location.practice.outdoorTemp) +
      '°C</strong><small>' +
      location.city +
      ' · ' +
      localTime +
      ' local time</small></div><span>Practice weather<br>Adjust conditions below</span></div><p class="weather-source">Simulated climate. Mission tests use fixed scenarios and do not depend on API weather.</p>'
    );
  if (!weather)
    return (
      '<p class="destination-description">Retrieving local weather for ' + location.city + '…</p>'
    );
  const updated = new Intl.DateTimeFormat('en-GB', {
    timeZone: location.timezone,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  }).format(new Date(weather.fetchedAt));
  return (
    '<div class="weather-main"><div><strong>' +
    weather.temperature.toFixed(1) +
    '°C</strong><small>' +
    location.city +
    ' · ' +
    localTime +
    ' local time</small></div><span>' +
    esc(weather.condition) +
    '<br>' +
    (weather.isDay ? '☀ Daytime' : '☾ Nighttime') +
    '</span></div><div class="weather-metrics"><span>Humidity <strong>' +
    Math.round(weather.humidity) +
    '%</strong></span><span>Precip. <strong>' +
    weather.precipitation.toFixed(1) +
    ' mm</strong></span><span>Wind <strong>' +
    weather.wind.toFixed(1) +
    ' km/h</strong></span><span>Direction <strong>' +
    Math.round(weather.windDirection) +
    '°</strong></span></div><p class="weather-source ' +
    (weather.status === 'simulated' ? 'fallback' : '') +
    '">' +
    (weather.sourceURL
      ? '<a href="' +
        weather.sourceURL +
        '" target="_blank" rel="noopener">' +
        esc(weather.source) +
        '</a>'
      : esc(weather.source)) +
    '<br>' +
    (weather.status === 'simulated' ? 'Generated ' : 'Last fetched ') +
    updated +
    (weather.cached ? ' · cached' : '') +
    (weather.observedAt
      ? '<br>API valid time ' +
        new Intl.DateTimeFormat('en-GB', {
          timeZone: location.timezone,
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(weather.observedAt))
      : '') +
    (weather.errorReason ? '<br>' + esc(weather.errorReason) : '') +
    (weather.retryAt > Date.now()
      ? '<br>Retry available shortly; automatic recovery checks every minute.'
      : '') +
    '</p>'
  );
}
// One label per named street (main roads first): placed on the middle of its longest segment,
// rotated along it and kept readable, within the visible square.
function streetLabels(roads, radius, limit = 16) {
  const best = new Map();
  for (const road of roads) {
    const [kind, name] = road;
    if (!name || kind > 2) continue;
    for (let i = 2; i + 3 < road.length; i += 2) {
      const [x1, y1, x2, y2] = [road[i], -road[i + 1], road[i + 2], -road[i + 3]],
        length = Math.hypot(x2 - x1, y2 - y1),
        mx = (x1 + x2) / 2,
        my = (y1 + y2) / 2;
      if (Math.max(Math.abs(mx), Math.abs(my)) > radius * 0.85) continue;
      const score = (3 - kind) * 1000 + length,
        current = best.get(name);
      if (!current || score > current.score) {
        let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;
        best.set(name, { score, label: [name, mx, my, angle] });
      }
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((b) => b.label);
}
// Label placement for the inner suburbs, which sit close together: [dx, dy, text-anchor].
const METRO_LABELS = {
  fitzroy: [10, -8, 'start'],
  brunswick: [0, -13, 'middle'],
  richmond: [10, 16, 'start'],
  footscray: [-12, 5, 'end'],
  stkilda: [-12, 14, 'end'],
  boxhill: [12, 5, 'start'],
  broadmeadows: [12, 5, 'start'],
  frankston: [12, 5, 'start'],
};
export async function setupTravel({
  getState,
  onEnter,
  onLegacy,
  onWeather,
  onMode,
  onSave,
  modal,
  missions,
  weatherService,
}) {
  const $ = (id) => document.getElementById(id),
    service = weatherService || new WeatherService();
  let features = [],
    globe = null,
    selectedCountry = null,
    selectedLocation = locations[0],
    selectedWeather = null,
    selectionVersion = 0,
    weatherLoading = false;
  // Grouped destinations (Melbourne suburbs, Victorian farms) share one globe marker. The
  // Melbourne group also has its own map, which opens when one of its suburbs is chosen.
  const metroSuburbs = locations.filter((l) => l.metro === 'Melbourne'),
    groupNames = [...new Set(locations.map((l) => l.group).filter(Boolean))],
    groupMarker = (name) => {
      const members = locations.filter((l) => l.group === name),
        centre =
          name === 'Melbourne'
            ? MELBOURNE
            : {
                latitude: members.reduce((sum, l) => sum + l.latitude, 0) / members.length,
                longitude: members.reduce((sum, l) => sum + l.longitude, 0) / members.length,
              };
      return {
        id: 'group-' + name.toLowerCase().replace(/\W+/g, '-'),
        city: name,
        latitude: centre.latitude,
        longitude: centre.longitude,
        country: members[0].country,
        iso: members[0].iso,
        metroGroup: true,
        group: name,
        count: members.length,
        noun: members[0].farm ? 'farms' : 'suburbs',
      };
    },
    globePlaces = [...locations.filter((l) => !l.group), ...groupNames.map(groupMarker)];
  let metroDismissed = false,
    // 'streets' shows the chosen suburb's real streets; 'overview' the whole of Melbourne.
    metroView = 'streets';
  const streetData = new Map();
  if ($('destinationCount')) $('destinationCount').textContent = locations.length;
  if ($('homeCount')) $('homeCount').textContent = locations.length;
  $('continentSelect').innerHTML = continents.map((c) => '<option>' + c + '</option>').join('');
  $('continentSelect').value = 'Asia';
  $('resumeLegacy').onclick = onLegacy;
  function renderCountries() {
    const list = features
      .filter((f) => f.properties.continent === $('continentSelect').value)
      .sort((a, b) => a.properties.name.localeCompare(b.properties.name));
    $('countrySelect').innerHTML = list
      .map(
        (f) =>
          '<option value="' +
          f.properties.iso +
          '">' +
          esc(f.properties.name) +
          (locations.some((l) => l.iso === f.properties.iso) ? ' · playable' : '') +
          '</option>',
      )
      .join('');
    if (selectedCountry && list.includes(selectedCountry))
      $('countrySelect').value = selectedCountry.properties.iso;
    else selectedCountry = list[0] || null;
  }
  async function selectCountry(feature, targetLocationId = null) {
    selectedCountry = feature;
    $('continentSelect').value = feature.properties.continent;
    renderCountries();
    $('countrySelect').value = feature.properties.iso;
    globe?.select(feature);
    const places = locations.filter((l) => l.iso === feature.properties.iso),
      choice = (l) =>
        '<button class="location-choice" data-location="' +
        l.id +
        '"><span>⌂</span><div><strong>' +
        l.city +
        '</strong><small>' +
        esc(l.architecture) +
        '</small></div></button>',
      groups = [...new Set(places.map((l) => l.group).filter(Boolean))];
    $('locationChoices').innerHTML =
      '<label class="travel-label">03 &nbsp; Playable location</label>' +
      places
        .filter((l) => !l.group)
        .map(choice)
        .join('') +
      groups
        .map(
          (group) =>
            '<div class="metro-group"><span>' +
            esc(group === 'Melbourne' ? 'Melbourne suburbs' : group) +
            '</span>' +
            (group === 'Melbourne'
              ? '<button class="text-btn" data-open-metro="' + esc(group) + '">Open map</button>'
              : '') +
            '</div>' +
            places
              .filter((l) => l.group === group)
              .map(choice)
              .join(''),
        )
        .join('');
    document.querySelectorAll('[data-open-metro]').forEach(
      (b) =>
        (b.onclick = () => {
          const current =
            selectedLocation?.metro === b.dataset.openMetro
              ? selectedLocation
              : places.find((l) => l.metro === b.dataset.openMetro);
          metroDismissed = false;
          metroView = 'overview';
          selectLocation(current);
        }),
    );
    if (!places.length) {
      selectedLocation = null;
      selectionVersion++;
      $('destinationDetail').innerHTML =
        '<div class="no-location"><strong>' +
        esc(feature.properties.name) +
        '</strong><p>This country is on the atlas, but has no playable home in this release.</p><p>Choose one of the countries marked playable to begin an expedition.</p></div>';
      return;
    }
    document.querySelectorAll('[data-location]').forEach(
      (b) =>
        (b.onclick = () => {
          metroView = 'streets';
          selectLocation(locations.find((l) => l.id === b.dataset.location));
        }),
    );
    await selectLocation(places.find((l) => l.id === targetLocationId) || places[0]);
  }
  function renderDetail() {
    if (!selectedLocation) return;
    const l = selectedLocation,
      progress = progressForLocation(getState(), l.id),
      regionalMissions = adaptMissions(missions, l, getState().difficulty || 'beginner'),
      unlocked = isLocationUnlocked(getState(), l);
    $('destinationDetail').innerHTML =
      '<div class="destination-detail"><h2>' +
      esc(l.title) +
      '</h2><p class="architecture-label">' +
      esc(l.country + ' · ' + l.region + ' · ' + l.architecture) +
      '</p><p class="destination-description">' +
      esc(l.description) +
      '</p><div class="destination-weather"><div class="weather-title"><span>LOCAL WEATHER</span><span>' +
      l.latitude.toFixed(4) +
      '°, ' +
      l.longitude.toFixed(4) +
      '°</span></div>' +
      weatherHTML(selectedWeather, l) +
      '<button class="text-btn weather-retry" id="destinationWeatherRetry" ' +
      (weatherLoading ? 'disabled' : '') +
      '>' +
      (weatherLoading
        ? 'Connecting…'
        : selectedWeather?.status === 'live'
          ? 'Refresh weather'
          : 'Retry live weather') +
      '</button></div><div class="region-progress"><span>' +
      progress.completed +
      ' / ' +
      progress.total +
      ' quests complete</span><progress value="' +
      progress.completed +
      '" max="' +
      progress.total +
      '" aria-label="Location mission progress"></progress></div><button class="primary enter-location" id="enterLocation" ' +
      (unlocked ? '' : 'disabled') +
      '>' +
      (unlocked ? 'Enter ' + l.city : 'Complete ' + l.unlockAfter + ' quests to unlock') +
      '</button><p class="destination-missions">Your first quests: ' +
      regionalMissions
        .slice(0, 3)
        .map((m) => esc(m.title))
        .join(' · ') +
      '</p></div>';
    $('enterLocation').onclick = () => onEnter(l.id, selectedWeather);
    $('destinationWeatherRetry').onclick = () => fetchSelectedWeather(true);
  }
  async function fetchSelectedWeather(refresh = false) {
    if (!selectedLocation) return;
    const location = selectedLocation,
      version = ++selectionVersion;
    weatherLoading = true;
    renderDetail();
    const weather = await service.get(location, { refresh });
    if (version !== selectionVersion) return;
    selectedWeather = weather;
    weatherLoading = false;
    renderDetail();
    if (getState().activeLocation === location.id) onWeather(weather);
  }
  async function selectLocation(location) {
    selectedLocation = location;
    globe?.focus(location);
    selectedWeather = null;
    renderMetroMap();
    document
      .querySelectorAll('[data-location]')
      .forEach((b) => b.classList.toggle('selected', b.dataset.location === location?.id));
    await fetchSelectedWeather();
  }
  function metroHead(title, subtitle) {
    return (
      '<div class="metro-head"><strong>' +
      title +
      '</strong><span>' +
      subtitle +
      '</span><div class="metro-tabs" role="group" aria-label="Map view"><button data-metro-view="overview" aria-pressed="' +
      (metroView === 'overview') +
      '">Melbourne</button><button data-metro-view="streets" aria-pressed="' +
      (metroView === 'streets') +
      '">' +
      esc(selectedLocation.city) +
      ' streets</button></div><button class="text-btn" id="metroBack">← World globe</button></div>'
    );
  }
  function bindMetroHead(map) {
    $('metroBack').onclick = () => {
      metroDismissed = true;
      map.hidden = true;
      globe?.wake?.();
    };
    map.querySelectorAll('[data-metro-view]').forEach(
      (b) =>
        (b.onclick = () => {
          metroView = b.dataset.metroView;
          renderMetroMap();
        }),
    );
  }
  // Street map of the chosen suburb: real roads (widest first), building footprints and the
  // IoT home at the centre, from OpenStreetMap data bundled in data/melbourne/.
  async function renderStreetMap(map) {
    const suburb = selectedLocation,
      canvas = () => map.querySelector('.metro-canvas');
    map.innerHTML =
      metroHead(
        esc(suburb.city) + ' streets',
        'Real streets and buildings · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>',
      ) + '<div class="metro-canvas"><p class="street-note">Loading streets…</p></div>';
    bindMetroHead(map);
    let data = streetData.get(suburb.id);
    if (!data)
      try {
        const response = await fetch('data/melbourne/' + suburb.id + '.json');
        if (!response.ok) throw Error('missing');
        data = await response.json();
        streetData.set(suburb.id, data);
      } catch {
        if (selectedLocation === suburb && metroView === 'streets')
          canvas().innerHTML =
            '<p class="street-note">The street map for ' +
            esc(suburb.city) +
            ' is not available yet. Use the Melbourne view to see where it is.</p>';
        return;
      }
    // The user may have moved on while the data loaded.
    if (selectedLocation !== suburb || metroView !== 'streets' || map.hidden) return;
    const R = data.radius,
      line = (flat, start, close) => {
        let d = '';
        for (let i = start; i + 1 < flat.length; i += 2)
          d += (i === start ? 'M' : 'L') + flat[i] + ' ' + -flat[i + 1];
        return close ? d + 'Z' : d;
      },
      buildings = data.buildings.map((b) => line(b, 0, true)).join(''),
      roads = [3, 2, 1, 0].map(
        (kind) =>
          '<path class="street-road street-road-' +
          kind +
          '" d="' +
          data.roads
            .filter((r) => r[0] === kind)
            .map((r) => line(r, 2, false))
            .join('') +
          '"/>',
      ),
      labels = streetLabels(data.roads, R),
      bar = 100;
    canvas().innerHTML =
      '<svg viewBox="' +
      [-R, -R, R * 2, R * 2].join(' ') +
      '" role="img" aria-label="Street map of ' +
      esc(suburb.city) +
      ' showing ' +
      data.roads.length +
      ' street segments and ' +
      data.buildings.length +
      ' buildings"><clipPath id="streetClip"><rect x="' +
      -R +
      '" y="' +
      -R +
      '" width="' +
      R * 2 +
      '" height="' +
      R * 2 +
      '"/></clipPath><g clip-path="url(#streetClip)"><rect class="street-land" x="' +
      -R +
      '" y="' +
      -R +
      '" width="' +
      R * 2 +
      '" height="' +
      R * 2 +
      '"/><path class="street-buildings" d="' +
      buildings +
      '"/>' +
      roads.join('') +
      labels
        .map(
          ([name, x, y, angle]) =>
            '<text class="street-label" transform="translate(' +
            x.toFixed(1) +
            ' ' +
            y.toFixed(1) +
            ') rotate(' +
            angle.toFixed(1) +
            ')">' +
            esc(name) +
            '</text>',
        )
        .join('') +
      '</g><circle class="street-home-ring" r="26"/><circle class="street-home" r="9"/><text class="street-home-label" y="-34">Your IoT home</text>' +
      '<g class="metro-scale" transform="translate(' +
      (R - bar - 24) +
      ' ' +
      (R - 24) +
      ')"><path d="M0 0 H' +
      bar +
      ' M0 -6 V6 M' +
      bar +
      ' -6 V6"/><text x="' +
      bar / 2 +
      '" y="-10">100 m</text></g><g class="metro-north" transform="translate(' +
      (R - 34) +
      ' ' +
      (-R + 44) +
      ')"><path d="M0 -26 L9 4 L0 -2 L-9 4 Z"/><text y="22">N</text></g></svg>';
  }
  // Schematic Melbourne map: Port Phillip Bay, the Yarra and Maribyrnong rivers, the CBD and
  // a pin per suburb at its real coordinates. Shown over the globe while a suburb is selected.
  function renderMetroMap() {
    const map = $('metroMap');
    if (!map) return;
    const show = selectedLocation?.metro === 'Melbourne' && !metroDismissed;
    map.hidden = !show;
    if (!show) return;
    if (metroView === 'streets') {
      renderStreetMap(map);
      return;
    }
    const { west, east, north, south } = MELBOURNE_MAP.bounds,
      scale = Math.cos((((north + south) / 2) * Math.PI) / 180),
      width = (east - west) * scale * 1000,
      height = (north - south) * 1000,
      x = (lon) => (lon - west) * scale * 1000,
      y = (lat) => (north - lat) * 1000,
      path = (points) =>
        points
          .map(([lon, lat], i) => (i ? 'L' : 'M') + x(lon).toFixed(1) + ' ' + y(lat).toFixed(1))
          .join(' '),
      kilometres10 = (10 / 111.32) * scale * 1000,
      cbd = [x(MELBOURNE.longitude), y(MELBOURNE.latitude)];
    map.innerHTML =
      metroHead('Melbourne &amp; suburbs', 'Choose a suburb · schematic map, not for navigation') +
      '<div class="metro-canvas"><svg viewBox="0 0 ' +
      width.toFixed(0) +
      ' ' +
      height.toFixed(0) +
      '" role="img" aria-label="Schematic map of Melbourne with Port Phillip Bay, the Yarra River and suburb pins">' +
      // Clip to the map frame: the bay outline extends past it.
      '<clipPath id="metroClip"><rect width="' +
      width.toFixed(0) +
      '" height="' +
      height.toFixed(0) +
      '"/></clipPath><g clip-path="url(#metroClip)">' +
      '<rect class="metro-land" width="100%" height="100%"/>' +
      '<path class="metro-bay" d="' +
      path(MELBOURNE_MAP.bay) +
      ' Z"/>' +
      MELBOURNE_MAP.rivers.map((r) => '<path class="metro-river" d="' + path(r) + '"/>').join('') +
      '<text class="metro-water-label" x="' +
      x(144.84).toFixed(0) +
      '" y="' +
      y(-38.09).toFixed(0) +
      '">Port Phillip Bay</text><text class="metro-river-label" x="' +
      x(145.13).toFixed(0) +
      '" y="' +
      y(-37.752).toFixed(0) +
      '">Yarra River</text></g>' +
      '<rect class="metro-cbd" x="' +
      (cbd[0] - 5).toFixed(0) +
      '" y="' +
      (cbd[1] - 5).toFixed(0) +
      '" width="10" height="10" rx="2"/><text class="metro-cbd-label" x="' +
      (cbd[0] - 7).toFixed(0) +
      '" y="' +
      (cbd[1] + 19).toFixed(0) +
      '" text-anchor="end">CBD</text>' +
      '<g class="metro-scale" transform="translate(' +
      (width - kilometres10 - 30).toFixed(0) +
      ' ' +
      (height - 30).toFixed(0) +
      ')"><path d="M0 0 H' +
      kilometres10.toFixed(0) +
      ' M0 -6 V6 M' +
      kilometres10.toFixed(0) +
      ' -6 V6"/><text x="' +
      (kilometres10 / 2).toFixed(0) +
      '" y="-10">10 km</text></g>' +
      '<g class="metro-north" transform="translate(' +
      (width - 40).toFixed(0) +
      ' 46)"><path d="M0 -26 L9 4 L0 -2 L-9 4 Z"/><text y="22">N</text></g>' +
      // Suburb pins are part of the map, so they stay on their suburbs at any size.
      metroSuburbs
        .map((l) => {
          const [dx, dy, anchor] = METRO_LABELS[l.id] || [12, 5, 'start'],
            px = x(l.longitude),
            py = y(l.latitude),
            selected = l.id === selectedLocation.id;
          return (
            '<g class="metro-pin' +
            (selected ? ' selected' : '') +
            '" data-metro-location="' +
            l.id +
            '" role="button" tabindex="0" aria-pressed="' +
            selected +
            '" aria-label="' +
            esc(l.city + ', ' + l.architecture) +
            '"><circle class="metro-pin-hit" cx="' +
            px.toFixed(1) +
            '" cy="' +
            py.toFixed(1) +
            '" r="18"/><circle cx="' +
            px.toFixed(1) +
            '" cy="' +
            py.toFixed(1) +
            '" r="5.5"/><text x="' +
            (px + dx).toFixed(1) +
            '" y="' +
            (py + dy).toFixed(1) +
            '" text-anchor="' +
            anchor +
            '">' +
            esc(l.city) +
            '</text></g>'
          );
        })
        .join('') +
      '</svg></div>';
    bindMetroHead(map);
    map.querySelectorAll('[data-metro-location]').forEach((pin) => {
      const choose = () => {
        metroDismissed = false;
        metroView = 'streets';
        selectLocation(locations.find((l) => l.id === pin.dataset.metroLocation));
      };
      pin.addEventListener('click', choose);
      pin.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        choose();
      });
    });
  }
  $('continentSelect').onchange = () => {
    selectedCountry = null;
    renderCountries();
    if (selectedCountry) selectCountry(selectedCountry);
  };
  $('countrySelect').onchange = () => {
    const f = features.find((f) => f.properties.iso === $('countrySelect').value);
    if (f) selectCountry(f);
  };
  $('globeMarkers').innerHTML = globePlaces
    .map(
      (l) =>
        '<button class="globe-city' +
        (l.metroGroup ? ' metro' : '') +
        '" id="globe-marker-' +
        l.id +
        '" data-globe-location="' +
        l.id +
        '">' +
        l.city +
        '<span>' +
        (l.metroGroup ? l.count + ' ' + l.noun : l.country) +
        '</span></button>',
    )
    .join('');
  document.querySelectorAll('[data-globe-location]').forEach(
    (b) =>
      (b.onclick = () => {
        const place = globePlaces.find((l) => l.id === b.dataset.globeLocation),
          f = features.find((f) => f.properties.iso === place.iso),
          // A group marker opens its current (or first) member; Melbourne also opens its map.
          members = locations.filter((l) => l.group === place.group),
          target = place.metroGroup
            ? (selectedLocation?.group === place.group ? selectedLocation : members[0]).id
            : place.id;
        if (place.group === 'Melbourne') {
          metroDismissed = false;
          metroView = 'overview';
        }
        if (f) selectCountry(f, target);
      }),
  );
  function mapMode(force = null) {
    const map = force ?? globe?.mode !== 'map';
    if (globe) globe.mode = map ? 'map' : 'globe';
    $('flatMapCanvas').hidden = !map;
    $('globeCanvas').hidden = map;
    $('globeMarkers').hidden = map;
    $('mapAlternative').textContent = map ? 'Rotate 3D globe' : 'Accessible 2D map';
    $('mapAlternative').setAttribute('aria-pressed', String(map));
    const no3d = !globe?.gl || globe.contextLost;
    $('mapAlternative').disabled = map && no3d;
    if (map && no3d) $('mapAlternative').textContent = '2D map enabled';
    $('globe-controls')?.classList.toggle('map-mode', map);
    if (!map) globe?.wake();
  }
  $('mapAlternative').onclick = () => mapMode();
  for (const [id, x, y] of [
    ['globeLeft', -1, 0],
    ['globeRight', 1, 0],
    ['globeUp', 0, -1],
    ['globeDown', 0, 1],
  ])
    $(id).onclick = () => globe?.rotate(x, y);
  $('globeZoomIn').onclick = () => globe?.zoom(-1);
  $('globeZoomOut').onclick = () => globe?.zoom(1);
  $('travelSources').onclick = () =>
    modal(
      'Architecture, geography & weather',
      '<div class="guide travel-sources"><p>These are specific regional learning properties, adapted for the IoT missions. They do not describe every home in a country.</p>' +
        locations
          .map(
            (l) =>
              '<h3>' +
              l.city +
              ', ' +
              l.country +
              '</h3><ul>' +
              l.sources
                .map(
                  ([name, url]) =>
                    '<li><a href="' +
                    url +
                    '" target="_blank" rel="noopener">' +
                    esc(name) +
                    '</a></li>',
                )
                .join('') +
              '</ul>',
          )
          .join('') +
        '<h3>Geography & weather</h3><p><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Natural Earth 1:110m country boundaries · public domain</a>. Boundaries are simplified for viewing at world scale.</p><p><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo current weather documentation</a>. API values are modelled current weather for city coordinates. Local caches last 15 minutes. Free API usage is for non-commercial education.</p></div>',
    );
  $('weatherModeSelect').value = getState().weatherMode;
  $('weatherModeSelect').onchange = () => {
    onMode($('weatherModeSelect').value);
    onSave();
  };
  try {
    const response = await fetch('data/countries.json');
    if (!response.ok) throw Error('Atlas data unavailable');
    features = (await response.json()).features;
    renderCountries();
    try {
      globe = new TravelGlobe($('globeCanvas'), $('flatMapCanvas'), features, globePlaces, {
        onSelect: selectCountry,
        onProject: (points) => {
          const placed = [];
          const selectedMarker = selectedLocation?.group
            ? globePlaces.find((p) => p.metroGroup && p.group === selectedLocation.group)?.id
            : selectedLocation?.id;
          points.sort((a, b) => Number(b.id === selectedMarker) - Number(a.id === selectedMarker));
          const clashes = (x, y) =>
            placed.some((v) => Math.abs(v.x - x) < 110 && Math.abs(v.y - y) < 32);
          for (const p of points) {
            const el = $('globe-marker-' + p.id),
              group = globePlaces.find((g) => g.id === p.id)?.metroGroup;
            let y = p.y;
            // Group markers (Melbourne, Victorian farms) step down rather than hide on a clash.
            for (let step = 0; group && clashes(p.x, y) && step < 3; step++) y += 34;
            const visible = p.visible && !clashes(p.x, y);
            el.style.left = p.x + 'px';
            el.style.top = y + 'px';
            el.style.visibility = visible ? 'visible' : 'hidden';
            if (visible) placed.push({ ...p, y });
          }
        },
        isActive: () => getState().travelScreen,
        reduced: () => getState().reduced,
        onError: (m) => {
          $('atlasMessage').textContent = m;
          mapMode(true);
        },
        // Graphics recovered: re-enable the globe option while keeping the 2D atlas in view.
        onRestore: () => {
          $('atlasMessage').textContent = '3D globe graphics recovered.';
          mapMode(true);
        },
      });
      if (globe.mode === 'map') mapMode(true);
    } catch {
      $('atlasMessage').textContent = 'Use the 2D atlas and country selectors to travel.';
      mapMode(true);
    }
    const f = features.find((f) => f.properties.iso === 'JPN');
    await selectCountry(f);
    if (globe && selectedCountry === f && !globe.userInteracted) globe.auto = !getState().reduced;
  } catch {
    $('atlasMessage').textContent =
      'The atlas could not load. Playable locations are still available below.';
    $('locationChoices').innerHTML = locations
      .map(
        (l) =>
          '<button class="location-choice" data-direct-location="' +
          l.id +
          '">' +
          l.city +
          ', ' +
          l.country +
          '</button>',
      )
      .join('');
    document.querySelectorAll('[data-direct-location]').forEach(
      (b) =>
        (b.onclick = () => {
          selectLocation(locations.find((l) => l.id === b.dataset.directLocation));
        }),
    );
    await fetchSelectedWeather();
  }
  return {
    service,
    refresh: renderDetail,
    refreshWeather: fetchSelectedWeather,
    releaseGraphics: () => globe?.releaseGraphics(),
    restoreGraphics: () => globe?.restoreGraphics(),
    selectLocation,
    selectCountry,
    features,
    globe,
  };
}
