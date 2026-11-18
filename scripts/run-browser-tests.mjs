// Runs browser test files and gives each failed test one more try. A test that passes on its second
// try is reported as flaky (a GitHub warning on CI) without failing the run, so a timing hiccup on a
// slow runner does not block a merge, while the warning keeps it from being forgotten. A test that
// fails twice fails the run.
//   node scripts/run-browser-tests.mjs tests/browser/app-world.browser.mjs [...more files]
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) throw Error('Name the browser test files to run.');

// Runs node --test, showing its usual output, and returns the names of the top-level tests that
// failed (from a TAP copy of the results).
async function run(args) {
  const tap = join(await mkdtemp(join(tmpdir(), 'browser-tests-')), 'results.tap');
  const code = await new Promise((resolve) =>
    spawn(
      process.execPath,
      [
        '--test',
        '--test-reporter=spec',
        '--test-reporter-destination=stdout',
        '--test-reporter=tap',
        '--test-reporter-destination=' + tap,
        ...args,
      ],
      { stdio: 'inherit' },
    ).on('exit', resolve),
  );
  const failed = (await readFile(tap, 'utf8').catch(() => ''))
    .split('\n')
    .map((line) => line.match(/^not ok \d+ - (.*?)(?: # .*)?$/)?.[1])
    .filter(Boolean)
    .map((name) => name.replace(/\\#/g, '#').replace(/\\\\/g, '\\'));
  return { code, failed };
}
export const exactName = (name) => '^' + name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '$';

const first = await run(files);
if (first.code === 0) process.exit(0);
// A failure outside any test (a file that would not load) is not retried.
if (!first.failed.length) process.exit(first.code || 1);
console.log('\nTrying the failed tests once more:\n- ' + first.failed.join('\n- ') + '\n');
const again = await run([
  ...first.failed.map((name) => '--test-name-pattern=' + exactName(name)),
  ...files,
]);
const stillFailing = first.failed.filter((name) => again.code !== 0 && again.failed.includes(name));
for (const name of first.failed.filter((n) => !stillFailing.includes(n))) {
  const note = `Flaky browser test passed on its second try: ${name}`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning title=Flaky test::${note}` : note);
}
process.exit(again.code === 0 ? 0 : 1);
