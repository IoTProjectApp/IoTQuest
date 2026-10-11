import { clamp } from './world-math.js';
import { outputLevel } from './signals.js';
// How far a servo has turned, 0–1 (1 is 180°, or digital HIGH). Without a known scale a value of 1
// is HIGH and anything larger an angle, as servoWrite takes 0–180.
export const servoLevel = (value, scale) =>
  outputLevel(value, scale ?? (Number(value) === 1 ? 1 : 180));
export const WEATHER_CACHE_MS = 15 * 60 * 1000;
const fields =
  'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day';
export function weatherURL(location) {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: fields,
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '1',
    wind_speed_unit: 'kmh',
  });
  return u.toString();
}
export function conditionName(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return ['Clear sky', 'Mainly clear', 'Partly cloudy', 'Overcast'][code];
  if ([45, 48].includes(code)) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Variable conditions';
}
export function normalizeWeather(data, location, now = Date.now()) {
  const c = data?.current;
  for (const f of [
    'temperature_2m',
    'relative_humidity_2m',
    'precipitation',
    'wind_speed_10m',
    'wind_direction_10m',
    'cloud_cover',
    'weather_code',
    'is_day',
    'time',
  ])
    if (typeof c?.[f] !== 'number' || !Number.isFinite(c[f]))
      throw Error('Incomplete weather response');
  if (
    ![0, 1].includes(c.is_day) ||
    c.precipitation < 0 ||
    c.relative_humidity_2m < 0 ||
    c.relative_humidity_2m > 100
  )
    throw Error('Invalid weather measurements');
  return {
    locationId: location.id,
    status: 'live',
    source: 'Open-Meteo · modelled current weather',
    sourceURL: 'https://open-meteo.com/',
    fetchedAt: now,
    observedAt: c.time * 1000,
    timezone: data.timezone || location.timezone,
    temperature: c.temperature_2m,
    humidity: c.relative_humidity_2m,
    precipitation: c.precipitation,
    wind: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    cloud: c.cloud_cover,
    isDay: !!c.is_day,
    condition: conditionName(c.weather_code),
    code: c.weather_code,
    latitude: location.latitude,
    longitude: location.longitude,
  };
}
export function fallbackWeather(location, now = Date.now(), errorReason = null, retryAt = null) {
  const p = location.practice;
  return {
    locationId: location.id,
    status: 'simulated',
    source: 'Simulated weather fallback · API unavailable',
    sourceURL: null,
    fetchedAt: now,
    observedAt: null,
    timezone: location.timezone,
    temperature: p.outdoorTemp,
    humidity: p.humidity,
    precipitation: 0,
    wind: p.wind,
    windDirection: 90,
    cloud: p.cloud,
    isDay: true,
    condition: 'Simulated fair weather',
    code: null,
    latitude: location.latitude,
    longitude: location.longitude,
    errorReason,
    retryAt,
  };
}
// Retry-After: delay-seconds or an IMF-fixdate HTTP-date only, clamped to [1 min, 1 h].
export function retryAfterMs(value, now = Date.now()) {
  const text = String(value ?? '').trim();
  let ms = NaN;
  if (/^\d+$/.test(text)) ms = Number(text) * 1000;
  else if (/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text))
    ms = Date.parse(text) - now;
  return Math.min(3600000, Math.max(60000, Number.isFinite(ms) ? ms : 60000));
}
export class WeatherService {
  constructor({
    fetchImpl = globalThis.fetch,
    storage = globalThis.localStorage,
    now = () => Date.now(),
    useProxy = false,
    proxyURL = '/api/weather',
    proxyTimeoutMs = 6500,
    requestTimeoutMs = 10000,
  } = {}) {
    Object.assign(this, {
      useProxy,
      proxyURL,
      // Browsers reject window.fetch called as a method of another object ("Illegal
      // invocation"), so always call it as a plain function.
      fetchImpl: (...args) => fetchImpl(...args),
      storage,
      now,
      proxyTimeoutMs,
      requestTimeoutMs,
    });
    this.pending = new Map();
    this.cache = new Map();
    this.failedUntil = new Map();
    this.failureReasons = new Map();
  }
  async request(url, location, timeoutMs, refresh = false) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        credentials: 'omit',
        // An explicit refresh must not be answered from the browser HTTP cache.
        ...(refresh ? { cache: 'no-store' } : {}),
      });
      if (!response.ok) {
        const error = Error(
          response.status === 429
            ? 'Weather request limit reached. Please wait before retrying.'
            : 'Weather service returned HTTP ' + response.status + '.',
        );
        error.status = response.status;
        const retry = response.headers?.get?.('Retry-After');
        if (retry) error.retryAt = this.now() + retryAfterMs(retry, this.now());
        throw error;
      }
      // A cached response (proxy or HTTP cache) reports its Age; date the data accordingly.
      const ageText = String(response.headers?.get?.('Age') ?? ''),
        age = /^\d+$/.test(ageText) ? Math.min(Number(ageText), WEATHER_CACHE_MS / 1000) : 0;
      return normalizeWeather(await response.json(), location, this.now() - age * 1000);
    } catch (error) {
      if (controller.signal.aborted) {
        const timeout = Error('The weather connection timed out.');
        timeout.status = 408;
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async get(location, { refresh = false } = {}) {
    const key = location.id + ':' + location.latitude + ':' + location.longitude,
      now = this.now();
    let cached = this.cache.get(key);
    if (!cached) {
      try {
        cached = JSON.parse(this.storage?.getItem('iot-weather:' + key) || 'null');
      } catch {}
    }
    if (
      !refresh &&
      cached?.locationId === location.id &&
      [
        'temperature',
        'humidity',
        'precipitation',
        'wind',
        'windDirection',
        'cloud',
        'fetchedAt',
        'observedAt',
      ].every((k) => Number.isFinite(cached[k])) &&
      typeof cached.isDay === 'boolean' &&
      cached.status === 'live' &&
      now - cached.fetchedAt < WEATHER_CACHE_MS &&
      now >= cached.fetchedAt
    ) {
      this.cache.set(key, cached);
      return { ...cached, cached: true };
    }
    // A refresh may not reuse an in-flight ordinary check, which could be served from a cache.
    const inFlight = this.pending.get(key);
    if (inFlight && (!refresh || inFlight.refresh)) return inFlight.promise;
    if ((this.failedUntil.get(key) || 0) > now)
      return fallbackWeather(
        location,
        now,
        this.failureReasons.get(key),
        this.failedUntil.get(key),
      );
    const request = Promise.resolve().then(async () => {
      try {
        let weather;
        if (this.useProxy) {
          try {
            weather = await this.request(
              this.proxyURL + '?location=' + encodeURIComponent(location.id),
              location,
              this.proxyTimeoutMs,
              refresh,
            );
          } catch (error) {
            // Keep each attempt's own timeout. Do not bypass explicit access/rate limits.
            if ([400, 401, 403, 429].includes(error.status)) throw error;
            // Static hosting (e.g. GitHub Pages) has no proxy: go direct for the rest of the session.
            if (error.status === 404 || error.status === 405) this.useProxy = false;
            weather = await this.request(
              weatherURL(location),
              location,
              this.requestTimeoutMs,
              refresh,
            );
          }
        } else
          weather = await this.request(
            weatherURL(location),
            location,
            this.requestTimeoutMs,
            refresh,
          );
        // An overlapping refresh may already have stored newer data.
        const current = this.cache.get(key);
        if (current?.status === 'live' && current.fetchedAt > weather.fetchedAt) return current;
        this.cache.set(key, weather);
        try {
          this.storage?.setItem('iot-weather:' + key, JSON.stringify(weather));
        } catch {}
        this.failedUntil.delete(key);
        this.failureReasons.delete(key);
        return weather;
      } catch (error) {
        const retryAt = Math.max(
          this.now() + 60000,
          Number.isFinite(error.retryAt) ? error.retryAt : 0,
        );
        const reason = error.status
          ? error.message
          : 'Could not connect to live weather. Check your internet connection or browser network restrictions.';
        this.failedUntil.set(key, retryAt);
        this.failureReasons.set(key, reason);
        return fallbackWeather(location, this.now(), reason, retryAt);
      } finally {
        if (this.pending.get(key)?.promise === request) this.pending.delete(key);
      }
    });
    this.pending.set(key, { promise: request, refresh });
    return request;
  }
}
export function weatherTargets(weather) {
  return {
    outdoorTemp: weather.temperature,
    humidity: weather.humidity,
    rain: clamp(weather.precipitation * 10, 0, 100),
    wind: weather.wind,
    windDirection: weather.windDirection,
    cloud: weather.cloud,
    light: weather.isDay ? clamp(95 - weather.cloud * 0.65, 18, 95) : 3,
    isDay: weather.isDay,
    precipitation: weather.precipitation,
    weatherCode: Number.isFinite(weather.code) ? weather.code : null,
  };
}
// What the 3D world should show: thunderstorms, fog and snow come from the WMO weather code
// when live weather supplies one; snow also falls when it rains at freezing temperatures.
export function weatherEffects({ weatherCode = null, rain = 0, outdoorTemp = 20 } = {}) {
  const code = Number.isFinite(weatherCode) ? weatherCode : null;
  return {
    thunder: code !== null && code >= 95,
    fog: code === 45 || code === 48,
    snow:
      (code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) ||
      (rain > 0 && Number.isFinite(outdoorTemp) && outdoorTemp <= 1),
  };
}
export function advanceEnvironment(
  env,
  devices,
  outputs,
  dt,
  {
    mode = 'practice',
    weather = null,
    location = null,
    tankCapacity = 100,
    collectionFactor = 1,
    // Full scale of each output's last write (Runtime#outputScales), for PWM fan speeds.
    scales = {},
  } = {},
) {
  dt = clamp(dt, 0, 2);
  const next = { ...env };
  if (mode === 'live' && weather) {
    const target = weatherTargets(weather),
      relax = 1 - Math.exp(-dt / 6);
    for (const key of [
      'outdoorTemp',
      'humidity',
      'rain',
      'wind',
      'windDirection',
      'cloud',
      'light',
    ]) {
      const old = Number.isFinite(next[key]) ? next[key] : target[key];
      if (key === 'windDirection') {
        // Shortest arc across north; keep the bearing in [0, 360).
        const delta = ((((target[key] - old) % 360) + 540) % 360) - 180;
        next[key] = (((old + delta * relax) % 360) + 360) % 360;
      } else next[key] = old + (target[key] - old) * relax;
    }
    next.isDay = target.isDay;
    next.precipitation = target.precipitation;
    next.weatherCode = target.weatherCode;
  } else {
    // Practice conditions have no reported weather type.
    next.weatherCode = null;
    next.outdoorTemp = Number.isFinite(next.outdoorTemp) ? next.outdoorTemp : next.temp;
    next.wind = Number(next.wind || 0);
    next.cloud = Number(next.cloud || 0);
  }
  const rain = clamp(next.rain || 0, 0, 100),
    sun = clamp(next.light || 0, 0, 100) / 100,
    wind = clamp(next.wind || 0, 0, 120);
  next.wetness = clamp((next.wetness || 0) + rain * 0.0008 * dt - sun * 0.006 * dt, 0, 1);
  next.soil = clamp(
    next.soil +
      rain * 0.004 * dt -
      sun * (1 + (1 - (next.humidity ?? 50) / 100)) * dt * 0.014 * (1 + wind / 80),
    0,
    100,
  );
  next.tank = clamp(
    next.tank + ((rain * 0.003 * dt * 100) / tankCapacity) * collectionFactor,
    0,
    100,
  );
  const cooling = devices
    .filter((d) => ['fan', 'ac'].includes(d.id) && (outputs[d.pin] || 0) > 0)
    .reduce(
      (sum, d) => sum + (d.id === 'ac' ? 0.23 : 0.12) * outputLevel(outputs[d.pin], scales[d.pin]),
      0,
    );
  // On the horse farm, misting sprinklers cool the paddock shelters.
  const misting =
    location?.farm && location.style === 'horse'
      ? devices.some((d) => d.id === 'valve' && (outputs[d.pin] || 0) > 0) && next.tank > 0
      : false;
  // The bedroom blind comes down as its servo turns on (digital HIGH, or toward 180°), which
  // shades the room. The level uses the scale of the call that wrote it (servoWrite is 0–180).
  const blind = devices.find((d) => d.id === 'servo'),
    blindShade = blind ? 0.2 * servoLevel(outputs[blind.pin], scales[blind.pin]) : 0;
  const shade = (location?.shade ?? 0.2) + blindShade,
    insulation = location?.insulation ?? 1;
  const equilibrium = next.outdoorTemp + sun * (1 - shade) * 1.5;
  next.temp = clamp(
    next.temp +
      ((equilibrium - next.temp) * dt) / (240 * insulation) -
      (cooling + (misting ? 0.1 : 0)) * dt,
    -15,
    50,
  );
  // A pump wired with a level probe fills the trough or pond instead of watering the beds.
  const refill = devices.some((d) => d.id === 'pond');
  // The flock slowly drinks the stock trough down.
  if (location?.farm && location.style === 'sheep')
    next.pond = clamp((next.pond ?? 60) - 0.15 * dt, 0, 100);
  for (const d of devices)
    if (['pump', 'valve'].includes(d.id) && (outputs[d.pin] || 0) > 0 && next.tank > 0) {
      const rate = d.id === 'pump' ? 1.1 : 0.4,
        used = Math.min((next.tank / 100) * tankCapacity, rate * dt),
        delivered = 2.5 * dt * (dt ? used / (rate * dt) : 0);
      if (refill && d.id === 'pump') next.pond = clamp((next.pond ?? 60) + delivered, 0, 100);
      else next.soil = clamp(next.soil + delivered, 0, 100);
      next.tank = clamp(next.tank - (used / tankCapacity) * 100, 0, 100);
    }
  return next;
}
