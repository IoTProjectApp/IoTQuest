import { evaluateCondition } from './situation.js';
import { ADC_SIGNALS, ADC_SCALE } from './signals.js';
// Extra test scenarios at every threshold in a quest's conditions: just below, exactly at and just
// above each limit, with the expected outputs worked out from the quest's own conditions. Without
// them a wrong limit (soil < 3200 instead of 2400, temp >= 28 instead of > 27) passes whenever the
// hand-written scenarios sit far from the threshold.

// How far either side of a limit to test, in the units a program reads. ADC sensors read whole
// numbers; calibrated channels are fractional, so half a unit catches "> 27" written as ">= 28".
const step = (signal) => (ADC_SIGNALS.includes(signal) ? 1 : 0.5);
// A program reading converted back to the stored level a scenario uses.
const level = (signal, reading) => (ADC_SIGNALS.includes(signal) ? reading / ADC_SCALE : reading);
const THRESHOLD = /(\w+)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)/g;

export function boundaryScenarios(quest, baseEnv = {}) {
  const conditions = quest.conditions || [];
  if (!conditions.length || !quest.scenarios?.length) return [];
  const expect = (env) =>
    conditions.map((c) => (evaluateCondition(c, { ...baseEnv, ...env }) ? 1 : 0));
  const limits = new Map();
  for (const condition of conditions)
    for (const [, signal, , value] of String(condition).matchAll(THRESHOLD))
      limits.set(signal + ' ' + value, [signal, Number(value)]);
  const out = [],
    seen = new Set(quest.scenarios.map(([, env]) => JSON.stringify(env)));
  for (const [signal, limit] of limits.values()) {
    const d = step(signal);
    // Start from the first scenario where this limit decides the result.
    const base = quest.scenarios.find(([, env]) => {
      const below = expect({ ...env, [signal]: level(signal, limit - d) }),
        above = expect({ ...env, [signal]: level(signal, limit + d) });
      return below.join() !== above.join();
    });
    if (!base) continue;
    for (const [label, reading] of [
      ['just below', limit - d],
      ['at', limit],
      ['just above', limit + d],
    ]) {
      const env = { ...base[1], [signal]: level(signal, reading) },
        key = JSON.stringify(env);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([`Limit check: ${signal} ${label} ${limit}`, env, expect(env)]);
    }
  }
  return out;
}
