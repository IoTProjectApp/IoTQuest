// Lists the unit test files that import any of the given files, directly or through other modules.
// CI uses it for pull requests that change only saved editor data (public/data/): those run just
// the tests that read that data instead of the whole suite. A test counts when it imports a changed
// file (statically or with a literal import()) or names its path, such as 'public/data/cities.js'.
//   node scripts/affected-tests.mjs public/data/world-layout.js [...more files]
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

const importsOf = new Map();
async function imports(file) {
  if (importsOf.has(file)) return importsOf.get(file);
  const found = [];
  importsOf.set(file, found);
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch {
    return found;
  }
  for (const m of source.matchAll(IMPORT)) {
    const spec = m[1] || m[2];
    if (spec.startsWith('.')) found.push(resolve(dirname(file), spec));
  }
  return found;
}
async function reaches(file, targets, seen = new Set()) {
  if (targets.has(file)) return true;
  if (seen.has(file)) return false;
  seen.add(file);
  for (const next of await imports(file)) if (await reaches(next, targets, seen)) return true;
  return false;
}

export async function affectedTests(changed) {
  const targets = new Set(changed.map((f) => resolve(root, f)));
  const tests = (await readdir(resolve(root, 'tests')))
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => resolve(root, 'tests', f));
  const out = [];
  const named = [...targets].map((f) => relative(root, f));
  for (const t of tests) {
    const source = await readFile(t, 'utf8');
    if (named.some((f) => source.includes(f)) || (await reaches(t, targets)))
      out.push(relative(root, t));
  }
  return out.sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  console.log((await affectedTests(process.argv.slice(2))).join('\n'));
