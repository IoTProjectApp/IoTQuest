import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSky, skyTime, horizonDirection, localSkyDate } from '../public/astronomy.js';

test('sky clocks use destination time zones, daylight saving and simulated date rollover', () => {
  const inputs = { mode: 'simulated', date: '2026-10-08', startHour: 8, elapsedMs: 1234 };
  assert.equal(skyTime(inputs).toISOString(), '2026-10-07T21:00:01.234Z');
  assert.equal(
    skyTime({ ...inputs, date: '2026-06-08', elapsedMs: 0 }).toISOString(),
    '2026-06-07T22:00:00.000Z',
  );
  assert.equal(
    skyTime({ ...inputs, elapsedMs: 24 * 3600000 }).toISOString(),
    '2026-10-08T21:00:00.000Z',
  );
  assert.equal(
    skyTime({ ...inputs, elapsedMs: 0 }, { timezone: 'Asia/Tokyo' }).toISOString(),
    '2026-10-07T23:00:00.000Z',
  );
  const now = new Date('2026-10-08T14:00Z');
  assert.equal(localSkyDate(now, 'Australia/Melbourne'), '2026-10-09');
  assert.equal(skyTime({ mode: 'live' }, undefined, now).getTime(), now.getTime());
});

test('the April 8 2024 eclipse has a new moon and the full moon two weeks later has high illumination', () => {
  // NASA eclipse catalogue: https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html
  const eclipse = calculateSky(new Date('2024-04-08T18:17Z'));
  assert.ok(eclipse.moon.illumination < 0.001);
  assert.equal(eclipse.moon.phase, 'New moon');
  const full = calculateSky(new Date('2024-04-23T23:49Z'));
  assert.ok(full.moon.illumination > 0.99);
  assert.equal(full.moon.phase, 'Full moon');
  assert.ok(full.moon.angularRadius > 0.003 && full.moon.angularRadius < 0.006);
});

test('Polaris follows observer latitude, southern stars are present, and time changes their positions', () => {
  const date = new Date('2026-10-08T12:00Z'),
    north = calculateSky(date, { latitude: 51.5, longitude: 0 }),
    south = calculateSky(date);
  const polaris = north.stars.find((s) => s.name === 'Polaris');
  assert.ok(Math.abs(polaris.altitude - 51.5) < 1);
  assert.ok(south.stars.find((s) => s.name === 'Polaris').altitude < 0);
  assert.ok(south.stars.some((s) => s.name === 'Acrux'));
  const later = calculateSky(new Date(date.getTime() + 3600000));
  assert.ok(
    Math.abs(
      later.stars.find((s) => s.name === 'Sirius').altitude -
        south.stars.find((s) => s.name === 'Sirius').altitude,
    ) > 1,
  );
  for (const item of [south.sun, south.moon, ...south.stars]) {
    assert.ok(item.altitude >= -90 && item.altitude <= 90);
    assert.ok(item.azimuth >= 0 && item.azimuth < 360);
    assert.ok(Math.abs(Math.hypot(...item.direction) - 1) < 1e-10);
  }
});

test('horizontal sky directions have consistent geographic orientation', () => {
  const north = horizonDirection(0, 0),
    east = horizonDirection(0, 90),
    zenith = horizonDirection(90, 0);
  assert.equal(north[2], -1);
  assert.equal(east[0], 1);
  assert.equal(zenith[1], 1);
});
