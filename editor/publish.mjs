// File → Publish saved changes: sends what the workspaces saved in public/data/ for review, the way a
// person would by hand. It commits only those files, runs the unit tests that read them (see
// scripts/affected-tests.mjs), pushes the branch and opens a pull request into dev. Merging that
// pull request, and then dev into main, is still done on GitHub, so nothing goes live from here.
// The steps are plain functions over a `run(command, args)` so they can be tested without git.

const DATA = 'public/data/';
// Branches that only take changes through pull requests.
const PROTECTED = new Set(['main', 'dev']);
// Plain names only, as CI's quick check for editor data expects (see .github/workflows/pages.yml).
const PLAIN = /^public\/data\/[A-Za-z0-9._/-]+$/;

// The saved data files that differ from the last commit, from `git status --porcelain`.
export function changedDataFiles(status) {
  return status
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).replace(/^"|"$/g, ''))
    .map((path) => (path.includes(' -> ') ? path.split(' -> ')[1] : path))
    .filter((path) => path.startsWith(DATA));
}

// What publishing would do, or why it cannot.
export function publishPlan({ status, branch, now = new Date() }) {
  const files = changedDataFiles(status);
  if (!files.length) return { problem: 'Nothing to publish: no saved changes in public/data/.' };
  const odd = files.find((f) => !PLAIN.test(f));
  if (odd) return { problem: 'Rename this file to plain letters, numbers and dashes: ' + odd };
  if (!branch) return { problem: 'The repository is not on a branch (detached HEAD).' };
  const stamp = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const target = PROTECTED.has(branch) ? 'editor/publish-' + stamp : branch;
  return { files, branch: target, newBranch: target !== branch };
}

export function commitMessage(files) {
  const names = files.map((f) => f.slice(DATA.length).replace(/\.[a-z]+$/, ''));
  return 'Update ' + names.join(', ') + ' from the editor';
}

// Runs the plan. `run(command, args)` resolves with stdout or rejects with the command's error.
// `step(text)` reports progress. Resolves with the pull request's address.
export async function publish(plan, run, step = () => {}) {
  if (plan.newBranch) {
    step('Starting branch ' + plan.branch);
    await run('git', ['switch', '-c', plan.branch]);
  }
  step('Running the tests that read the changed files');
  const tests = (await run(process.execPath, ['scripts/affected-tests.mjs', ...plan.files]))
    .split('\n')
    .filter(Boolean);
  if (tests.length) await run(process.execPath, ['--test', ...tests]);
  step('Committing');
  await run('git', ['add', '--', ...plan.files]);
  await run('git', ['commit', '-m', commitMessage(plan.files), '--', ...plan.files]);
  step('Pushing ' + plan.branch);
  await run('git', ['push', '-u', 'origin', plan.branch]);
  step('Opening the pull request');
  const existing = await run('gh', [
    'pr',
    'view',
    plan.branch,
    '--json',
    'url,state',
    '-q',
    '.state + " " + .url',
  ]).catch(() => '');
  const [state, url] = existing.trim().split(' ');
  if (state === 'OPEN' && url) return { url, existing: true };
  const created = await run('gh', [
    'pr',
    'create',
    '--base',
    'dev',
    '--head',
    plan.branch,
    '--title',
    commitMessage(plan.files),
    '--body',
    'Saved in the IoT Quest Editor and published with File → Publish saved changes.\n\n' +
      plan.files.map((f) => '- `' + f + '`').join('\n'),
  ]);
  return { url: created.trim().split('\n').pop(), existing: false };
}
