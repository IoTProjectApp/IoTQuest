import { TravelGlobe } from './globe.js';
import {
  locations,
  continents,
  adaptMissions,
  progressForLocation,
  isLocationUnlocked,
} from './locations.js';
import { WeatherService } from './weather.js';
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
    const places = locations.filter((l) => l.iso === feature.properties.iso);
    $('locationChoices').innerHTML =
      '<label class="travel-label">03 &nbsp; Playable location</label>' +
      places
        .map(
          (l) =>
            '<button class="location-choice" data-location="' +
            l.id +
            '"><span>⌂</span><div><strong>' +
            l.city +
            '</strong><small>' +
            esc(l.architecture) +
            '</small></div></button>',
        )
        .join('');
    if (!places.length) {
      selectedLocation = null;
      selectionVersion++;
      $('destinationDetail').innerHTML =
        '<div class="no-location"><strong>' +
        esc(feature.properties.name) +
        '</strong><p>This country is on the atlas, but has no playable home in this release.</p><p>Choose one of the countries marked playable to begin an expedition.</p></div>';
      return;
    }
    document
      .querySelectorAll('[data-location]')
      .forEach(
        (b) =>
          (b.onclick = () => selectLocation(locations.find((l) => l.id === b.dataset.location))),
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
    await fetchSelectedWeather();
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
  $('globeMarkers').innerHTML = locations
    .map(
      (l) =>
        '<button class="globe-city" id="globe-marker-' +
        l.id +
        '" data-globe-location="' +
        l.id +
        '">' +
        l.city +
        '<span>' +
        l.country +
        '</span></button>',
    )
    .join('');
  document.querySelectorAll('[data-globe-location]').forEach(
    (b) =>
      (b.onclick = () => {
        const l = locations.find((l) => l.id === b.dataset.globeLocation),
          f = features.find((f) => f.properties.iso === l.iso);
        if (f) selectCountry(f, l.id);
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
    const response = await fetch('/data/countries.json');
    if (!response.ok) throw Error('Atlas data unavailable');
    features = (await response.json()).features;
    renderCountries();
    try {
      globe = new TravelGlobe($('globeCanvas'), $('flatMapCanvas'), features, locations, {
        onSelect: selectCountry,
        onProject: (points) => {
          const placed = [];
          points.sort(
            (a, b) => Number(b.id === selectedLocation?.id) - Number(a.id === selectedLocation?.id),
          );
          for (const p of points) {
            const el = $('globe-marker-' + p.id),
              visible =
                p.visible &&
                !placed.some((v) => Math.abs(v.x - p.x) < 110 && Math.abs(v.y - p.y) < 32);
            el.style.left = p.x + 'px';
            el.style.top = p.y + 'px';
            el.style.visibility = visible ? 'visible' : 'hidden';
            if (visible) placed.push(p);
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
    selectLocation,
    selectCountry,
    features,
    globe,
  };
}
