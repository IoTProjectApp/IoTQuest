// Downloads the character models into public/models/people from the private repository
// IoTProjectApp/iotquest-models (Mixamo's terms allow the models inside the game but not as files
// in this public repository). Run with: node scripts/fetch-models.mjs
//
// Needs read access to that repository: MODELS_TOKEN (CI) or GH_TOKEN, or the GitHub CLI's login.
// Without it the script warns and stops without failing, and the game draws its own jointed
// figures in place of the characters.
import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY = 'IoTProjectApp/iotquest-models';
// The models this version of the game is built and tested with.
const COMMIT = '96daa0ce0445f8e6273f1f5a06f07976aa81f8e7';
const OUT = fileURLToPath(new URL('../public/models/people/', import.meta.url));
const STAMP = OUT + '.commit';

const current = await readFile(STAMP, 'utf8').catch(() => '');
if (current.trim() === COMMIT) {
  console.log('Character models are up to date (' + COMMIT.slice(0, 7) + ').');
  process.exit(0);
}
let token = process.env.MODELS_TOKEN || process.env.GH_TOKEN;
if (!token)
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {}
const skip = (why) => {
  console.warn(
    `::warning::Character models not downloaded: ${why}. The game draws its own figures.`,
  );
  process.exit(0);
};
if (!token) skip('no MODELS_TOKEN, GH_TOKEN or GitHub CLI login');
const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/tarball/${COMMIT}`, {
  headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
});
if (!response.ok) skip(`${REPOSITORY} answered ${response.status} (does the token have access?)`);
const work = await mkdtemp(join(tmpdir(), 'iotquest-models-'));
try {
  await writeFile(join(work, 'models.tgz'), Buffer.from(await response.arrayBuffer()));
  execFileSync('tar', ['-xzf', 'models.tgz'], { cwd: work });
  const [folder] = (await readdir(work)).filter((f) => f !== 'models.tgz');
  const people = join(work, folder, 'people');
  const files = await readdir(people);
  for (const required of ['animations.glb', 'animations.json'])
    if (!files.includes(required)) throw Error(`${REPOSITORY} has no people/${required}`);
  await mkdir(OUT, { recursive: true });
  for (const f of files) await copyFile(join(people, f), OUT + f);
  await writeFile(STAMP, COMMIT + '\n');
  console.log(`Downloaded ${files.length} character model files (${COMMIT.slice(0, 7)}).`);
} finally {
  await rm(work, { recursive: true, force: true });
}
