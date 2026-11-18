import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedTests } from '../scripts/affected-tests.mjs';

// (The made-up path is built from two parts, or this file would name it.)
test('a data change selects the tests that import it or name it, and only those', async () => {
  const layout = await affectedTests(['public/data/world-layout.js']);
  for (const t of [
    'tests/world-layout.test.mjs',
    'tests/map-editor.test.mjs',
    'tests/world3d.test.mjs',
  ])
    assert.ok(layout.includes(t), t);
  assert.ok(!layout.includes('tests/astronomy.test.mjs'));
  // Named by path rather than imported.
  assert.ok(
    (await affectedTests(['public/data/countries.json'])).includes(
      'tests/connected-world.test.mjs',
    ),
  );
  assert.deepEqual(await affectedTests(['public/data/' + 'nothing-reads-this.js']), []);
});
