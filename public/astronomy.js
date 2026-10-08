import Astronomy from './vendor/astronomy-engine.js';
import { brightStars } from './data/bright-stars.js';
const RAD = Math.PI / 180,
  DAY = 86400000;
export const DEFAULT_OBSERVER = {
  latitude: -37.8136,
  longitude: 144.9631,
  timezone: 'Australia/Melbourne',
};

export function localSkyDate(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function skyTime(
  { mode = 'live', date, startHour = 8, elapsedMs = 0 } = {},
  location = DEFAULT_OBSERVER,
  now = new Date(),
) {
  if (mode !== 'simulated') return new Date(now);
  const timezone = location.timezone || DEFAULT_OBSERVER.timezone;
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : localSkyDate(now, timezone);
  let midnight = Date.parse(selected + 'T00:00:00Z');
  if (!Number.isFinite(midnight)) midnight = Date.parse(localSkyDate(now, timezone) + 'T00:00:00Z');
  const target =
    midnight +
    (Number.isFinite(startHour) ? startHour : 8) * 3600000 +
    (Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let utc = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      formatter.formatToParts(new Date(utc)).map((p) => [p.type, Number(p.value)]),
    );
    const local =
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) +
      (((utc % 1000) + 1000) % 1000);
    utc += target - local;
  }
  return new Date(utc);
}

export function horizonDirection(altitude, azimuth) {
  const alt = altitude * RAD,
    az = azimuth * RAD;
  // Geographic north = -Z, east = +X, up = +Y. Independent of the camera.
  return [Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)];
}

export function calculateSky(date, location = DEFAULT_OBSERVER) {
  const time = Astronomy.MakeTime(date),
    observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const body = (name, radius) => {
    const eq = Astronomy.Equator(name, time, observer, true, true),
      hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec, 'normal');
    return {
      altitude: hor.altitude,
      azimuth: hor.azimuth,
      direction: horizonDirection(hor.altitude, hor.azimuth),
      angularRadius: Math.asin(radius / (eq.dist * Astronomy.KM_PER_AU)),
    };
  };
  const sun = body(Astronomy.Body.Sun, 695700),
    moon = body(Astronomy.Body.Moon, 1737.4),
    phaseAngle = Astronomy.MoonPhase(time),
    illumination = Astronomy.Illumination(Astronomy.Body.Moon, time).phase_fraction,
    rotation = Astronomy.Rotation_EQJ_HOR(time, observer),
    years = (date.getTime() - Date.UTC(2000, 0, 1, 12)) / (DAY * 365.25);
  const stars = brightStars.map((star) => {
    const p = star.position.map((x, i) => x + star.velocity[i] * years),
      vector = Astronomy.RotateVector(rotation, new Astronomy.Vector(...p, time)),
      hor = Astronomy.HorizonFromVector(vector, 'normal');
    return {
      ...star,
      altitude: hor.lat,
      azimuth: hor.lon,
      direction: horizonDirection(hor.lat, hor.lon),
    };
  });
  return {
    date: date.toISOString(),
    sun,
    moon: { ...moon, phaseAngle, illumination, phase: moonPhaseName(phaseAngle) },
    stars,
  };
}

export function moonPhaseName(angle) {
  const names = [
    'New moon',
    'Waxing crescent',
    'First quarter',
    'Waxing gibbous',
    'Full moon',
    'Waning gibbous',
    'Last quarter',
    'Waning crescent',
  ];
  return names[Math.floor(((angle + 22.5) % 360) / 45)];
}
