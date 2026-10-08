import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../public/missions.js';
import { securityCases, dashboardQuests, GATE_CODE } from '../public/challenges.js';

const passes = (results) => results.length > 0 && results.every((r) => r.pass);

for (const board of ['ESP32', 'Raspberry Pi Pico'])
  for (const language of ['cpp', 'python']) {
    for (const c of securityCases)
      test(`${c.title} (${board}, ${language}): unsafe program fails, repaired one passes`, () => {
        const devices = defaults(c.ids, board);
        assert.equal(passes(c.tests(c.source(language, devices), language, devices, board)), false);
        assert.equal(
          passes(c.tests(c.source(language, devices, true), language, devices, board)),
          true,
        );
      });
    for (const q of dashboardQuests)
      test(`${q.title} (${board}, ${language}): blank starter fails, a working program passes`, () => {
        const devices = defaults(q.ids, board);
        assert.equal(
          passes(q.tests(q.starter(language, devices), language, devices, board)),
          false,
        );
        assert.equal(
          passes(q.tests(q.solution(language, devices), language, devices, board)),
          true,
        );
      });
  }

test('each unsafe program fails only the test for its weakness', () => {
  const failing = (c) => {
    const devices = defaults(c.ids, 'ESP32');
    return c
      .tests(c.source('cpp', devices), 'cpp', devices, 'ESP32')
      .filter((r) => !r.pass)
      .map((r) => r.name);
  };
  const byId = Object.fromEntries(securityCases.map((c) => [c.id, failing(c)]));
  assert.deepEqual(byId.spoof, ['A stranger sends 1', 'A stranger guesses 9999']);
  assert.deepEqual(byId.leak, ['The door code is never published']);
  // It never reconnects: the stale "open" survives the outage and the close command never arrives.
  assert.deepEqual(byId.failsafe, ['The network drops', 'The dashboard closes the valve']);
  assert.deepEqual(byId.flood, ['No more than about one a second']);
});

test('a delay-based fix passes like a millis() timer, as on real hardware', () => {
  const flood = securityCases.find((c) => c.id === 'flood'),
    devices = defaults(flood.ids, 'ESP32');
  const delayed = flood.source('cpp', devices).replace('delay(10)', 'delay(1000)');
  assert.equal(passes(flood.tests(delayed, 'cpp', devices, 'ESP32')), true);
});

test('the gate opens only for the shared code, not a near guess', () => {
  const spoof = securityCases.find((c) => c.id === 'spoof'),
    devices = defaults(spoof.ids, 'ESP32');
  const offByOne = spoof
    .source('cpp', devices, true)
    .replace('== ' + GATE_CODE, '>= ' + (GATE_CODE - 1));
  assert.equal(passes(spoof.tests(offByOne, 'cpp', devices, 'ESP32')), false);
});

test('a program error is reported as a failed test, not thrown', () => {
  const q = dashboardQuests[0],
    devices = defaults(q.ids, 'ESP32');
  const [result] = q.tests('void setup() {', 'cpp', devices, 'ESP32');
  assert.equal(result.name, 'Program execution');
  assert.equal(result.pass, false);
});
