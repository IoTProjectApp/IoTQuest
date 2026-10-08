import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { locations, adaptMissions, isLocationUnlocked } from '../public/locations.js';
import { missions, defaults, baseEnv, program, validate } from '../public/missions.js';
import { Runtime } from '../public/runtime.js';
import { weatherHTML } from '../public/travel.js';
import {
  weatherURL,
  normalizeWeather,
  fallbackWeather,
  WeatherService,
  WEATHER_CACHE_MS,
  advanceEnvironment,
} from '../public/weather.js';
import { createRegionalModel } from '../public/regions.js';
import { createWorldModel } from '../public/world-model.js';
import { latLonPoint, pointLatLon, countryAt, globePick } from '../public/geography.js';
import { findFree, toWorld, collides } from '../public/world-math.js';
const features = JSON.parse(await readFile('public/data/countries.json', 'utf8')).features;
const data = {
  timezone: 'Asia/Tokyo',
  current: {
    temperature_2m: 26,
    relative_humidity_2m: 70,
    precipitation: 4,
    weather_code: 61,
    cloud_cover: 80,
    wind_speed_10m: 20,
    wind_direction_10m: 180,
    is_day: 1,
    time: 1700000000,
  },
};
for (const location of locations) {
  test(`${location.city}: real geographic boundaries contain the playable city and weather uses exact city coordinates`, () => {
    assert.ok(features.some((f) => f.properties.iso === location.iso));
    const url = new URL(weatherURL(location));
    assert.equal(Number(url.searchParams.get('latitude')), location.latitude);
    assert.equal(Number(url.searchParams.get('longitude')), location.longitude);
    assert.equal(url.searchParams.get('timezone'), 'auto');
    assert.ok(url.searchParams.get('current').includes('relative_humidity_2m'));
  });
  test(`${location.city}: distinct regional model, six interiors, garden and safe installation positions`, () => {
    const m = createRegionalModel(location.id);
    assert.equal(m.rooms.length, 6);
    assert.ok(m.architecture && m.gardenLayout);
    assert.ok(m.objects.length > 250);
    for (const [name, x, y] of [
      ['Bedroom', 19, 17],
      ['Garden path', ...location.areaOverrides['Garden path']],
      ['Plant beds', 77, 64],
      ['Water tank', 91, 43],
    ]) {
      const p = findFree({ x, y: y + 5 }, m.colliders),
        w = toWorld(p);
      assert.equal(collides(w[0], w[2], m.colliders), false, name);
    }
    assert.ok(m.actors.find((a) => a.id === 'player'));
  });
  for (const board of ['ESP32', 'Raspberry Pi Pico'])
    for (const language of ['cpp', 'python'])
      for (const m of adaptMissions(missions, location))
        test(`${location.city} / ${board} / ${language}: ${m.title}`, () => {
          const devices = defaults(m.ids, board);
          assert.deepEqual(validate(devices, board), []);
          const runtime = new Runtime(
            program(m, language, devices, true),
            language,
            devices,
            board,
          );
          for (const [name, env, expected] of m.scenarios) {
            const result = runtime.step({ ...baseEnv, ...env });
            assert.deepEqual(
              devices
                .filter((d) => d.output)
                .map((d) => ((result.outputs[d.pin] || 0) > 0 ? 1 : 0)),
              expected,
              name,
            );
          }
        });
}
test('globe geometry preserves latitude and longitude and centre picking reaches the facing country', () => {
  for (const l of locations) {
    const p = pointLatLon(latLonPoint(l.latitude, l.longitude));
    assert.ok(Math.abs(p.latitude - l.latitude) < 1e-7);
    assert.ok(Math.abs(p.longitude - l.longitude) < 1e-7);
    const hit = globePick(
      400,
      250,
      800,
      500,
      (l.longitude * Math.PI) / 180,
      (l.latitude * Math.PI) / 180,
      6.2,
    );
    assert.ok(Math.abs(hit.latitude - l.latitude) < 1e-7);
    assert.ok(Math.abs(hit.longitude - l.longitude) < 1e-7);
  }
  assert.equal(globePick(0, 0, 800, 500, 0, 0, 6.2), null);
});
test('weather cache and simultaneous requests avoid duplicate provider calls', async () => {
  let calls = 0,
    now = 1700000000000;
  const storage = new Map(),
    service = new WeatherService({
      fetchImpl: async () => {
        calls++;
        return { ok: true, json: async () => data };
      },
      now: () => now,
      storage: { getItem: (k) => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    });
  const [a, b] = await Promise.all([service.get(locations[0]), service.get(locations[0])]);
  assert.equal(calls, 1);
  assert.equal(a.status, 'live');
  assert.equal(b.temperature, 26);
  await service.get(locations[0]);
  assert.equal(calls, 1);
  now += WEATHER_CACHE_MS + 1;
  await service.get(locations[0]);
  assert.equal(calls, 2);
});
test('API failure returns a labelled simulated fallback and throttles immediate retries', async () => {
  let calls = 0;
  const service = new WeatherService({
    fetchImpl: async () => {
      calls++;
      throw Error('offline');
    },
    storage: null,
  });
  const w = await service.get(locations[1]);
  assert.equal(w.status, 'simulated');
  assert.match(w.source, /Simulated weather fallback/);
  assert.equal(w.observedAt, null);
  await service.get(locations[1]);
  assert.equal(calls, 1);
});
test('invalid weather payloads cannot masquerade as live data', () => {
  assert.throws(() => normalizeWeather({ current: {} }, locations[0]), /Incomplete/);
  assert.throws(
    () => normalizeWeather({ ...data, current: { ...data.current, is_day: 2 } }, locations[0]),
    /Invalid/,
  );
});
test('live rain wets soil, fills tanks and creates wet surfaces while sunshine dries soil', () => {
  const live = normalizeWeather(data, locations[0]),
    before = { ...baseEnv, outdoorTemp: 24, cloud: 0, wind: 0 };
  let rainy = { ...before };
  for (let i = 0; i < 200; i++)
    rainy = advanceEnvironment(rainy, [], {}, 0.2, {
      mode: 'live',
      weather: live,
      location: locations[0],
    });
  assert.ok(rainy.soil > before.soil);
  assert.ok(rainy.tank > before.tank);
  assert.ok(rainy.wetness > 0);
  let dry = { ...before, rain: 0, humidity: 25, light: 95 };
  for (let i = 0; i < 200; i++) dry = advanceEnvironment(dry, [], {}, 0.2, { mode: 'practice' });
  assert.ok(dry.soil < before.soil);
});
test('outdoor weather influences indoor temperature gradually; code-controlled cooling and insulation change its response', () => {
  const hot = { ...baseEnv, outdoorTemp: 40 },
    fan = defaults(['fan'], 'ESP32');
  const passive = advanceEnvironment(hot, fan, { 26: 0 }, 0.2, { location: locations[0] }),
    active = advanceEnvironment(hot, fan, { 26: 1 }, 0.2, { location: locations[0] });
  assert.ok(passive.temp > 24 && passive.temp < 24.1);
  assert.ok(active.temp < passive.temp);
  const insulated = advanceEnvironment(hot, [], {}, 0.2, { location: locations[1] });
  assert.ok(insulated.temp - 24 < passive.temp - 24);
});
test('weather never assigns actuator outputs; revised student code controls the irrigation interlock', () => {
  const m = adaptMissions(missions, locations[0])[2],
    ds = defaults(m.ids, 'ESP32'),
    correct = program(m, 'cpp', ds, true),
    wrong = correct.replace(' && rain < 400', ''),
    env = { ...baseEnv, soil: 10, tank: 80, rain: 90 };
  const off = new Runtime(correct, 'cpp', ds).step(env),
    on = new Runtime(wrong, 'cpp', ds).step(env);
  assert.equal(off.outputs[26], 0);
  assert.equal(on.outputs[26], 1);
  const before = Object.freeze({ 26: 0 });
  advanceEnvironment(env, ds, before, 1, {
    mode: 'live',
    weather: normalizeWeather(data, locations[0]),
  });
  assert.equal(before[26], 0);
});
test('Practice Weather ignores API variability and is repeatable', () => {
  const env = { ...baseEnv, outdoorTemp: 28, wind: 10, rain: 0 },
    a = advanceEnvironment(env, [], {}, 0.2, {
      mode: 'practice',
      weather: normalizeWeather(data, locations[0]),
    }),
    b = advanceEnvironment(env, [], {}, 0.2, {
      mode: 'practice',
      weather: { ...normalizeWeather(data, locations[0]), temperature: -10, precipitation: 100 },
    });
  assert.deepEqual(a, b);
});
test('malformed cached weather is rejected and refreshed', async () => {
  const l = locations[0],
    bad = { locationId: l.id, status: 'live', fetchedAt: Date.now() },
    service = new WeatherService({
      storage: { getItem: () => JSON.stringify(bad), setItem() {} },
      fetchImpl: async () => ({ ok: true, json: async () => data }),
    });
  const result = await service.get(l);
  assert.equal(result.status, 'live');
  assert.equal(result.temperature, 26);
});
test('older static previews fall back from a missing proxy to the browser-compatible weather API', async () => {
  const urls = [],
    service = new WeatherService({
      useProxy: true,
      storage: null,
      fetchImpl: async (url) => {
        urls.push(url);
        return urls.length === 1
          ? { status: 404, ok: false }
          : { ok: true, status: 200, json: async () => data };
      },
    });
  assert.equal((await service.get(locations[0])).status, 'live');
  assert.match(urls[0], /\/api\/weather/);
  assert.match(urls[1], /latitude=35.0116/);
});
test('synchronous fetch failures clear pending requests and allow retry after cooldown', async () => {
  let now = 100000,
    calls = 0;
  const service = new WeatherService({
    storage: null,
    now: () => now,
    fetchImpl: () => {
      calls++;
      throw Error('unavailable');
    },
  });
  await service.get(locations[0]);
  assert.equal(service.pending.size, 0);
  now += 61000;
  await service.get(locations[0]);
  assert.equal(calls, 2);
});
test('weather proxy uses city coordinates, caches requests and rejects unlisted/prototype keys', async () => {
  const { createWeatherProxy } = await import('../scripts/weather-proxy.mjs');
  let calls = 0,
    lastURL;
  const l = locations[0],
    proxy = createWeatherProxy(
      { kyoto: l },
      {
        fetchImpl: async (url) => {
          calls++;
          lastURL = url;
          return { ok: true, json: async () => data };
        },
      },
    );
  const [a, b] = await Promise.all([
    proxy(new Request('https://quest.test/api/weather?location=kyoto')),
    proxy(new Request('https://quest.test/api/weather?location=kyoto')),
  ]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(calls, 1);
  assert.equal(new URL(lastURL).searchParams.get('latitude'), String(l.latitude));
  assert.equal(
    (await proxy(new Request('https://quest.test/api/weather?location=constructor'))).status,
    400,
  );
  assert.equal(
    (await proxy(new Request('https://quest.test/api/weather?location=http://other.test'))).status,
    400,
  );
  assert.equal(calls, 1);
});
for (const failure of ['network', 'timeout', '503', 'html'])
  test(`weather recovers through direct API when proxy fails with ${failure}`, async () => {
    const urls = [],
      signals = [],
      service = new WeatherService({
        useProxy: true,
        storage: null,
        proxyTimeoutMs: 5,
        requestTimeoutMs: 100,
        fetchImpl: async (url, { signal }) => {
          urls.push(url);
          signals.push(signal);
          if (urls.length === 1) {
            if (failure === 'network') throw Error('offline proxy');
            if (failure === 'timeout')
              return new Promise((resolve, reject) =>
                signal.addEventListener('abort', () => reject(Error('aborted'))),
              );
            if (failure === '503') return { ok: false, status: 503 };
            return {
              ok: true,
              json: async () => {
                throw Error('HTML response');
              },
            };
          }
          return { ok: true, json: async () => data };
        },
      });
    const result = await service.get(locations[0]);
    assert.equal(result.status, 'live');
    assert.equal(urls.length, 2);
    assert.match(urls[1], /^https:\/\/api.open-meteo.com/);
    assert.notEqual(signals[0], signals[1]);
    assert.equal(signals[1].aborted, false);
  });
test('weather failure explains the connection issue and recovers after cooldown', async () => {
  let calls = 0,
    now = 1700000000000,
    online = false;
  const service = new WeatherService({
    now: () => now,
    storage: null,
    fetchImpl: async () => {
      calls++;
      if (!online) throw Error('network');
      return { ok: true, json: async () => data };
    },
  });
  const fallback = await service.get(locations[0]);
  assert.equal(fallback.status, 'simulated');
  assert.match(fallback.errorReason, /connect/);
  assert.equal(fallback.retryAt, now + 60000);
  online = true;
  await service.get(locations[0], { refresh: true });
  assert.equal(calls, 1);
  now += 60001;
  assert.equal((await service.get(locations[0])).status, 'live');
  assert.equal(calls, 2);
});
test('weather rate limits retain Retry-After and never bypass the proxy limit', async () => {
  let calls = 0,
    now = 1700000000000;
  const service = new WeatherService({
    useProxy: true,
    storage: null,
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) };
    },
  });
  const fallback = await service.get(locations[0]);
  assert.equal(calls, 1);
  assert.match(fallback.errorReason, /limit/);
  assert.equal(fallback.retryAt, now + 120000);
  now += 60001;
  await service.get(locations[0], { refresh: true });
  assert.equal(calls, 1);
});
test('weather proxy preserves upstream rate-limit status and cooldown', async () => {
  const { createWeatherProxy } = await import('../scripts/weather-proxy.mjs');
  let calls = 0,
    now = 1700000000000;
  const proxy = createWeatherProxy(
      { kyoto: locations[0] },
      {
        now: () => now,
        fetchImpl: async () => {
          calls++;
          return { ok: false, status: 429, headers: new Headers({ 'Retry-After': '120' }) };
        },
      },
    ),
    request = new Request('https://quest.test/api/weather?location=kyoto');
  const first = await proxy(request);
  assert.equal(first.status, 429);
  assert.equal(first.headers.get('Retry-After'), '120');
  now += 60001;
  assert.equal((await proxy(request)).status, 429);
  assert.equal(calls, 1);
});
test('weather Refresh requests new data while normal checks retain the successful cache', async () => {
  let calls = 0;
  const service = new WeatherService({
    storage: null,
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => data };
    },
  });
  await service.get(locations[0]);
  await service.get(locations[0]);
  assert.equal(calls, 1);
  await service.get(locations[0], { refresh: true });
  assert.equal(calls, 2);
});

test('fallback panel explains retrieval failure and retains its simulated label', () => {
  const weather = fallbackWeather(
    locations[0],
    Date.now(),
    'Connection timed out <retry>',
    Date.now() + 60000,
  );
  const html = weatherHTML(weather, locations[0]);
  assert.match(html, /Simulated weather fallback/);
  assert.match(html, /Connection timed out &lt;retry&gt;/);
  assert.match(html, /automatic recovery/);
  assert.match(html, /Generated/);
  assert.doesNotMatch(html, /API valid time/);
});

test('weather proxy advertises only the remaining cache lifetime and the entry age', async () => {
  const { createWeatherProxy } = await import('../scripts/weather-proxy.mjs');
  let now = 1700000000000,
    calls = 0;
  const proxy = createWeatherProxy(
      { kyoto: locations[0] },
      {
        now: () => now,
        fetchImpl: async () => {
          calls++;
          return { ok: true, json: async () => data };
        },
      },
    ),
    request = () => new Request('https://quest.test/api/weather?location=kyoto');
  const fresh = await proxy(request());
  assert.equal(fresh.headers.get('Cache-Control'), 'public, max-age=900');
  assert.equal(fresh.headers.get('Age'), '0');
  now += 600000;
  const aged = await proxy(request());
  assert.equal(calls, 1);
  assert.equal(aged.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(aged.headers.get('Age'), '600');
  now += 300001;
  await proxy(request());
  assert.equal(calls, 2);
});
test('Retry-After accepts only seconds or an HTTP-date and is clamped to one minute..one hour', async () => {
  const { createWeatherProxy } = await import('../scripts/weather-proxy.mjs');
  const { retryAfterMs } = await import('../public/weather.js');
  const now = Date.parse('2026-01-01T00:00:00Z');
  const cases = [
    ['120', 120000],
    ['5', 60000],
    ['99999999', 3600000],
    ['-30', 60000],
    ['1e9', 60000],
    ['garbage', 60000],
    ['Thu, 01 Jan 2026 00:10:00 GMT', 600000],
    ['Wed, 21 Oct 2015 07:28:00 GMT', 60000],
    ['Sun, 04 Jan 2026 00:00:00 GMT', 3600000],
  ];
  for (const [header, expected] of cases) {
    assert.equal(retryAfterMs(header, now), expected, header);
    const proxy = createWeatherProxy(
      { kyoto: locations[0] },
      {
        now: () => now,
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          headers: new Headers({ 'Retry-After': header }),
        }),
      },
    );
    const r = await proxy(new Request('https://quest.test/api/weather?location=kyoto'));
    assert.equal(r.headers.get('Retry-After'), String(expected / 1000), header);
    const service = new WeatherService({
      storage: null,
      now: () => now,
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': header }),
      }),
    });
    assert.equal((await service.get(locations[0])).retryAt, now + expected, header);
  }
});
test('explicit weather refresh bypasses the HTTP cache, dates aged data honestly and does not join an ordinary check', async () => {
  let now = 1700000000000;
  const options = [],
    releases = [];
  const service = new WeatherService({
    storage: null,
    now: () => now,
    fetchImpl: (url, init) => {
      options.push(init);
      return new Promise((resolve) =>
        releases.push(() =>
          resolve({
            ok: true,
            headers: new Headers(init.cache === 'no-store' ? {} : { Age: '600' }),
            json: async () => data,
          }),
        ),
      );
    },
  });
  const ordinary = service.get(locations[0]);
  await Promise.resolve();
  const refreshed = service.get(locations[0], { refresh: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(options.length, 2);
  assert.equal(options[0].cache, undefined);
  assert.equal(options[1].cache, 'no-store');
  releases[1]();
  const fresh = await refreshed;
  assert.equal(fresh.fetchedAt, now);
  releases[0]();
  const aged = await ordinary;
  // The slower ordinary response is older, so the newer refresh stays cached.
  assert.equal(aged.fetchedAt, now);
  const stale = new WeatherService({
    storage: null,
    now: () => now,
    fetchImpl: async () => ({
      ok: true,
      headers: new Headers({ Age: '600' }),
      json: async () => data,
    }),
  });
  assert.equal((await stale.get(locations[0])).fetchedAt, now - 600000);
});
test('live wind direction blends along the shortest arc across north', () => {
  let env = { ...baseEnv, windDirection: 350 };
  const weather = { ...normalizeWeather(data, locations[0]), windDirection: 10 };
  for (let i = 0; i < 3; i++)
    env = advanceEnvironment(env, [], {}, 2, { mode: 'live', weather, location: locations[0] });
  assert.ok(env.windDirection >= 0 && env.windDirection < 360);
  const distance = Math.min(
    Math.abs(env.windDirection - 10),
    360 - Math.abs(env.windDirection - 10),
  );
  assert.ok(distance < 15, String(env.windDirection));
  for (let i = 0; i < 200; i++)
    env = advanceEnvironment(env, [], {}, 2, { mode: 'live', weather, location: locations[0] });
  assert.ok(Math.abs(env.windDirection - 10) < 0.01);
});
test('every animated regional mesh is part of the drawn scene and the outside garden stays intact', () => {
  for (const location of locations) {
    const m = createRegionalModel(location.id),
      drawn = new Set(m.objects);
    for (const drop of m.rain) assert.ok(drawn.has(drop), location.id + ' rain');
    for (const [name, item] of Object.entries(m.dynamic))
      if (item?.shape) assert.ok(drawn.has(item), location.id + ' dynamic.' + name);
    for (const lamp of m.lamps) assert.ok(drawn.has(lamp), location.id + ' lamp');
    for (const p of m.plants)
      for (const o of [p.stem, ...p.leaves, p.fruit])
        assert.ok(drawn.has(o), location.id + ' plant');
    assert.ok(m.dynamic.blinds, location.id + ' blinds');
    assert.equal(
      m.objects.filter((o) => o.shape === 'sphere' && Math.abs(o.pos[2] + 12.3) < 1e-9).length,
      28,
      location.id + ' back hedge',
    );
    // House styles never remove the garden's trees (trunks outside the house footprint).
    const trunks = (model) =>
      model.objects.filter(
        (o) =>
          o.shape === 'cylinder' &&
          o.color === '#9f8966' &&
          !(o.pos[0] > -13.3 && o.pos[0] < 1.6 && o.pos[2] < -1 && o.pos[2] > -11.3),
      ).length;
    assert.equal(trunks(m), trunks(createWorldModel(m.variant)), location.id + ' garden trees');
  }
});
test('Worker passes asset requests through unchanged so html_handling cannot loop', async () => {
  const worker = (await import('../scripts/asset-worker.mjs')).default,
    seen = [];
  const request = new Request('https://quest.test/');
  await worker.fetch(request, {
    ASSETS: { fetch: async (r) => (seen.push(r), new Response('ok')) },
  });
  assert.equal(seen[0], request);
});
test('every home, including the original, has roof meshes driven by the Roof toggle', () => {
  for (const id of ['legacy', ...locations.map((l) => l.id)]) {
    const m = createRegionalModel(id);
    assert.ok(m.roofs.length > 0, id + ' has no roof');
    for (const roof of m.roofs) {
      assert.ok(m.objects.includes(roof), id + ' roof mesh is not drawn');
      assert.equal(roof.opacity, 0.17, id + ' roof does not start as a cutaway');
    }
  }
});
test('without a weather proxy (static hosting) the service goes direct after one 404', async () => {
  const calls = [];
  const live = {
    current: {
      temperature_2m: 20,
      relative_humidity_2m: 50,
      precipitation: 0,
      weather_code: 1,
      cloud_cover: 10,
      wind_speed_10m: 5,
      wind_direction_10m: 90,
      is_day: 1,
      time: 1760000000,
    },
  };
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return String(url).startsWith('api/weather')
      ? { ok: false, status: 404, headers: new Headers(), json: async () => ({}) }
      : { ok: true, status: 200, headers: new Headers(), json: async () => live };
  };
  const service = new WeatherService({
    useProxy: true,
    proxyURL: 'api/weather',
    fetchImpl,
    storage: null,
  });
  const [kyoto, cusco] = [locations[0], locations.find((l) => l.id === 'cusco')];
  assert.equal((await service.get(kyoto)).status, 'live');
  assert.equal((await service.get(cusco)).status, 'live');
  assert.deepEqual(
    calls.map((u) => u.split('?')[0]),
    [
      'api/weather',
      'https://api.open-meteo.com/v1/forecast',
      'https://api.open-meteo.com/v1/forecast',
    ],
  );
});
test('live weather calls fetch the way browsers require (not as a method of the service)', async () => {
  const live = {
    current: {
      temperature_2m: 18,
      relative_humidity_2m: 60,
      precipitation: 0,
      weather_code: 2,
      cloud_cover: 40,
      wind_speed_10m: 8,
      wind_direction_10m: 200,
      is_day: 1,
      time: 1760000000,
    },
  };
  // Mimics window.fetch: throws "Illegal invocation" when called with another `this`.
  function browserFetch(url) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return Promise.resolve(
      String(url).startsWith('api/weather')
        ? { ok: false, status: 404, headers: new Headers(), json: async () => ({}) }
        : { ok: true, status: 200, headers: new Headers(), json: async () => live },
    );
  }
  for (const useProxy of [true, false]) {
    const service = new WeatherService({
      useProxy,
      proxyURL: 'api/weather',
      fetchImpl: browserFetch,
      storage: null,
    });
    const weather = await service.get(locations[0]);
    assert.equal(weather.status, 'live', 'useProxy ' + useProxy);
    assert.equal(weather.temperature, 18);
  }
});
test('the live weather code reaches the simulated environment and Practice clears it', () => {
  const kyoto = locations[0],
    weather = normalizeWeather(
      {
        current: {
          temperature_2m: 0,
          relative_humidity_2m: 90,
          precipitation: 2,
          weather_code: 73,
          cloud_cover: 100,
          wind_speed_10m: 12,
          wind_direction_10m: 10,
          is_day: 1,
          time: 1760000000,
        },
      },
      kyoto,
    );
  assert.equal(weather.code, 73);
  const live = advanceEnvironment({ ...baseEnv }, [], {}, 1, {
    mode: 'live',
    weather,
    location: kyoto,
  });
  assert.equal(live.weatherCode, 73);
  const practice = advanceEnvironment(live, [], {}, 1, { mode: 'practice', location: kyoto });
  assert.equal(practice.weatherCode, null);
});
test('Melbourne has eight playable suburbs with real coordinates, open from the start', async () => {
  const { melbourneSuburbs, MELBOURNE, MELBOURNE_MAP } = await import('../public/melbourne.js');
  assert.deepEqual(
    melbourneSuburbs.map((l) => l.city),
    [
      'Fitzroy',
      'Brunswick',
      'Footscray',
      'Richmond',
      'Box Hill',
      'St Kilda',
      'Broadmeadows',
      'Frankston',
    ],
  );
  const { west, east, north, south } = MELBOURNE_MAP.bounds;
  for (const l of [...melbourneSuburbs, MELBOURNE]) {
    assert.ok(
      l.longitude > west && l.longitude < east && l.latitude < north && l.latitude > south,
      l.city,
    );
    // Every suburb is within 50 km of the CBD.
    const km = Math.hypot(
      (l.latitude - MELBOURNE.latitude) * 111,
      (l.longitude - MELBOURNE.longitude) * 111 * Math.cos((MELBOURNE.latitude * Math.PI) / 180),
    );
    assert.ok(km < 50, l.city + ' is ' + km.toFixed(0) + ' km from the CBD');
  }
  for (const l of melbourneSuburbs) {
    assert.equal(l.timezone, 'Australia/Melbourne');
    assert.equal(l.iso, 'AUS');
    assert.equal(l.metro, 'Melbourne');
    assert.equal(l.unlockAfter, 0);
    assert.ok(locations.includes(l));
    assert.ok(isLocationUnlocked({}, l));
  }
  assert.equal(new Set(locations.map((l) => l.id)).size, locations.length, 'ids are unique');
  // Each suburb gets its own house style and weather coordinates for the proxy.
  assert.equal(new Set(melbourneSuburbs.map((l) => l.style)).size, 8);
  const styles = melbourneSuburbs.map((l) => createRegionalModel(l.id).architecture);
  assert.deepEqual(
    styles,
    melbourneSuburbs.map((l) => l.style),
  );
});
test('downloaded Melbourne street maps are well-formed and credit OpenStreetMap', async () => {
  const { melbourneSuburbs } = await import('../public/melbourne.js');
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir('public/data/melbourne')).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 1, 'at least one street map is bundled');
  for (const file of files) {
    const data = JSON.parse(await readFile('public/data/melbourne/' + file, 'utf8')),
      suburb = melbourneSuburbs.find((l) => l.id === data.id);
    assert.ok(suburb, file + ' belongs to a suburb');
    assert.equal(file, suburb.id + '.json');
    assert.match(data.attribution, /OpenStreetMap contributors/);
    assert.deepEqual(data.centre, [suburb.latitude, suburb.longitude]);
    assert.ok(
      data.roads.length > 50 && data.buildings.length > 200,
      file + ' has streets and houses',
    );
    for (const road of data.roads) {
      assert.ok([0, 1, 2, 3].includes(road[0]) && typeof road[1] === 'string');
      assert.ok(road.length >= 6 && road.length % 2 === 0);
    }
    for (const building of data.buildings)
      assert.ok(building.length >= 6 && building.length % 2 === 0);
    // Most geometry lies within the requested radius (ways may run a little beyond it).
    const points = data.buildings.flatMap((b) =>
        b.filter((_, i) => i % 2 === 0).map((x, i) => [x, b[i * 2 + 1]]),
      ),
      inside = points.filter(([x, y]) => Math.hypot(x, y) < data.radius * 1.2).length;
    assert.ok(inside / points.length > 0.95);
  }
});
test('Melbourne scenes have a street and neighbouring houses; other homes do not', () => {
  const fitzroy = createRegionalModel('fitzroy'),
    kyoto = createRegionalModel('kyoto'),
    asphalt = (m) => m.objects.filter((o) => o.color === '#4b5157');
  assert.equal(asphalt(fitzroy).length, 1);
  assert.equal(asphalt(kyoto).length, 0);
  assert.ok(fitzroy.objects.some((o) => o.streetLight));
  // Neighbours' windows glow at night like the property's.
  assert.ok(fitzroy.windows.length > kyoto.windows.length + 5);
  assert.equal(fitzroy.skyDistance, 16);
  // Neighbours stay outside the property.
  const neighbourWalls = fitzroy.objects.filter((o) => o.neighbour);
  assert.ok(neighbourWalls.length >= 8);
  for (const wall of neighbourWalls)
    assert.ok(Math.abs(wall.pos[0]) > 16.9 || wall.pos[2] > 13.75, 'neighbour inside the property');
});
