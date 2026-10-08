// Fixed-city proxy: no user-supplied URL, API secret or arbitrary upstream target.
const CACHE_MS = 900000;
// Retry-After is either delay-seconds or an HTTP-date; anything else uses the default. Clamped to [1 min, 1 h].
function retryAfterMs(value, nowMs) {
  const text = String(value ?? '').trim();
  let ms = NaN;
  if (/^\d+$/.test(text)) ms = Number(text) * 1000;
  else if (/^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(text))
    ms = Date.parse(text) - nowMs;
  return Math.min(3600000, Math.max(60000, Number.isFinite(ms) ? ms : 60000));
}
export function createWeatherProxy(
  locationMap,
  { fetchImpl = globalThis.fetch, now = () => Date.now() } = {},
) {
  const cache = new Map(),
    pending = new Map(),
    failures = new Map();
  const reply = (body, status = 200, retryAt = null, at = now()) => {
    // Downstream caches may keep a success only for the remainder of this proxy's cache window.
    const age = Math.min(CACHE_MS / 1000, Math.max(0, Math.floor((now() - at) / 1000)));
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': status === 200 ? 'public, max-age=' + (CACHE_MS / 1000 - age) : 'no-store',
        ...(status === 200 ? { Age: String(age) } : {}),
        ...(retryAt
          ? { 'Retry-After': String(Math.max(1, Math.ceil((retryAt - now()) / 1000))) }
          : {}),
      },
    });
  };
  return async function weatherProxy(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/weather') return null;
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const id = url.searchParams.get('location'),
      location = Object.hasOwn(locationMap, id) ? locationMap[id] : null;
    if (!location) return reply(JSON.stringify({ error: 'Unknown playable location' }), 400);
    const existing = cache.get(id);
    if (existing && now() - existing.at < CACHE_MS && now() >= existing.at)
      return reply(existing.body, 200, null, existing.at);
    const failure = failures.get(id);
    if (failure?.until > now())
      return reply(
        JSON.stringify({ error: 'Weather temporarily unavailable' }),
        failure.status,
        failure.until,
      );
    if (!pending.has(id)) {
      const task = Promise.resolve().then(async () => {
        const params = new URLSearchParams({
          latitude: String(location.latitude),
          longitude: String(location.longitude),
          current:
            'temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day',
          timezone: 'auto',
          timeformat: 'unixtime',
          forecast_days: '1',
          wind_speed_unit: 'kmh',
        });
        const controller = new AbortController(),
          timeout = setTimeout(() => controller.abort(), 6500);
        try {
          const response = await fetchImpl('https://api.open-meteo.com/v1/forecast?' + params, {
            signal: controller.signal,
          });
          if (!response.ok) {
            const error = Error('Weather upstream unavailable');
            error.status = [400, 401, 403, 429].includes(response.status) ? response.status : 503;
            error.retryMs = retryAfterMs(response.headers?.get?.('Retry-After'), now());
            throw error;
          }
          const data = await response.json();
          if (
            !data.current ||
            ![
              'temperature_2m',
              'relative_humidity_2m',
              'precipitation',
              'weather_code',
              'cloud_cover',
              'wind_speed_10m',
              'wind_direction_10m',
              'is_day',
              'time',
            ].every((k) => Number.isFinite(data.current[k]))
          )
            throw Error('Invalid upstream weather');
          const body = JSON.stringify(data),
            at = now();
          cache.set(id, { at, body });
          failures.delete(id);
          return { body, status: 200, at };
        } catch (error) {
          const failure = {
            until: now() + (Number.isFinite(error.retryMs) ? error.retryMs : 60000),
            status: error.status || 503,
          };
          failures.set(id, failure);
          return {
            body: JSON.stringify({ error: 'Weather temporarily unavailable' }),
            status: failure.status,
            retryAt: failure.until,
          };
        } finally {
          clearTimeout(timeout);
          pending.delete(id);
        }
      });
      pending.set(id, task);
    }
    const result = await pending.get(id);
    return reply(result.body, result.status, result.retryAt, result.at);
  };
}
