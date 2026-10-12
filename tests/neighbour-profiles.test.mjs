import test from 'node:test';
import assert from 'node:assert/strict';
import { neighbourProfiles, migrateNeighbourAreas } from '../public/neighbour-profiles.js';

test('saved neighbour installations retain wiring and follow their renamed homes', () => {
  const original = { id: 'led', area: 'Neighbour home 1', pin: 7, wired: true };
  const state = {
    projects: { free: { devices: [original] } },
    locationProgress: {
      fitzroy: {
        projects: {
          free: {
            devices: [
              { id: 'fan', area: 'Neighbour home 18', pin: 9 },
              { id: 'pump', area: 'Garden path', pin: 3 },
            ],
          },
        },
      },
    },
  };
  migrateNeighbourAreas(state);
  assert.deepEqual(original, { id: 'led', area: 'Wattle Terrace', pin: 7, wired: true });
  assert.equal(state.locationProgress.fitzroy.projects.free.devices[0].area, 'Lavender Cottage');
  assert.equal(state.locationProgress.fitzroy.projects.free.devices[1].area, 'Garden path');
  const saved = JSON.stringify(state);
  migrateNeighbourAreas(state);
  assert.equal(JSON.stringify(state), saved);
  assert.equal(new Set(neighbourProfiles.map((p) => p.name)).size, 18);
  assert.equal(new Set(neighbourProfiles.map((p) => p.resident)).size, 18);
});
