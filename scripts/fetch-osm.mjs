// One-off data build: downloads streets and building footprints around each Melbourne suburb
// from OpenStreetMap (Overpass API) and stores them compactly in public/data/melbourne/.
// Run with `node scripts/fetch-osm.mjs` when the data needs refreshing; the game itself never
// contacts OpenStreetMap. Data © OpenStreetMap contributors, available under the ODbL.
import { access, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { melbourneSuburbs } from '../public/melbourne.js';

const RADIUS = 500; // metres around each suburb centre
// Public Overpass instances, tried in turn when one is busy.
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// Road classes, drawn widest first: 0 main road, 1 secondary road, 2 local street, 3 lane/service.
const ROAD_CLASS = {
  motorway: 0,
  trunk: 0,
  primary: 0,
  secondary: 1,
  tertiary: 1,
  unclassified: 2,
  residential: 2,
  living_street: 2,
  service: 3,
  pedestrian: 3,
};
const out = fileURLToPath(new URL('../public/data/melbourne/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Roads and buildings are requested separately: two light queries succeed more often than one
// heavy one on the shared servers.
async function query(lat, lon, filter) {
  const q = `[out:json][timeout:120];way${filter}(around:${RADIUS},${lat},${lon});out geom;`;
  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'User-Agent': 'IoTQuest-education/1.0 (one-off map data build)' },
      });
      if (res.ok) return res.json();
      console.warn(`  ${new URL(endpoint).host} HTTP ${res.status}; trying again`);
    } catch (error) {
      console.warn(`  ${new URL(endpoint).host} ${error.message}; trying again`);
    }
    await sleep(10000);
  }
  throw Error('Overpass request failed');
}

await mkdir(out, { recursive: true });
for (const suburb of melbourneSuburbs) {
  const { latitude: lat, longitude: lon } = suburb,
    metresPerLon = 111320 * Math.cos((lat * Math.PI) / 180),
    // Metres east and north of the centre, rounded to 0.5 m, as a flat [x, y, x, y, ...] list.
    flat = (geometry) =>
      geometry.flatMap((p) => [
        Math.round((p.lon - lon) * metresPerLon * 2) / 2,
        Math.round((p.lat - lat) * 111320 * 2) / 2,
      ]);
  // Already downloaded? Pass --force to refresh.
  if (!process.argv.includes('--force'))
    try {
      await access(out + suburb.id + '.json');
      console.log('Have', suburb.city);
      continue;
    } catch {}
  console.log('Fetching', suburb.city);
  const highways = Object.keys(ROAD_CLASS).join('|'),
    data = {
      elements: [
        ...(await query(lat, lon, `["highway"~"^(${highways})$"]`)).elements,
        ...(await query(lat, lon, '["building"]')).elements,
      ],
    };
  const roads = data.elements
      .filter((e) => e.tags?.highway in ROAD_CLASS && e.geometry?.length > 1)
      .map((e) => [ROAD_CLASS[e.tags.highway], e.tags.name || '', ...flat(e.geometry)])
      .sort((a, b) => a[0] - b[0]),
    buildings = data.elements
      .filter((e) => e.tags?.building && e.geometry?.length > 2)
      .map((e) => flat(e.geometry));
  await writeFile(
    out + suburb.id + '.json',
    JSON.stringify({
      id: suburb.id,
      name: suburb.city,
      centre: [lat, lon],
      radius: RADIUS,
      retrieved: new Date().toISOString().slice(0, 10),
      attribution: '© OpenStreetMap contributors (ODbL)',
      roads,
      buildings,
    }),
  );
  console.log(`  ${roads.length} roads, ${buildings.length} buildings`);
  await sleep(4000); // be polite to the shared Overpass service
}
