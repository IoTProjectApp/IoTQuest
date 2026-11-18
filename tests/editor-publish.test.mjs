import test from 'node:test';
import assert from 'node:assert/strict';
import { changedDataFiles, publishPlan, commitMessage, publish } from '../editor/publish.mjs';

test('only saved editor data is published', () => {
  const status = [
    ' M public/data/world-layout.js',
    '?? public/data/new-thing.js',
    ' M public/game.js',
    'R  public/data/old.js -> public/data/cities.js',
    '',
  ].join('\n');
  assert.deepEqual(changedDataFiles(status), [
    'public/data/world-layout.js',
    'public/data/new-thing.js',
    'public/data/cities.js',
  ]);
});

test('publishing plans a branch, and never commits straight to main or dev', () => {
  const status = ' M public/data/world-layout.js\n';
  assert.deepEqual(publishPlan({ status, branch: 'feat/new-editors' }), {
    files: ['public/data/world-layout.js'],
    branch: 'feat/new-editors',
    newBranch: false,
  });
  const now = new Date('2026-11-18T09:30:00Z');
  for (const branch of ['main', 'dev'])
    assert.deepEqual(publishPlan({ status, branch, now }), {
      files: ['public/data/world-layout.js'],
      branch: 'editor/publish-202611180930',
      newBranch: true,
    });
  assert.match(publishPlan({ status: '', branch: 'x' }).problem, /Nothing to publish/);
  assert.match(publishPlan({ status, branch: '' }).problem, /not on a branch/);
  assert.match(
    publishPlan({ status: '?? "public/data/a b.js"\n', branch: 'x' }).problem,
    /plain letters/,
  );
});

test('publishing tests, commits only the data, pushes and opens a pull request into dev', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push([command === process.execPath ? 'node' : command, ...args]);
    if (args[0] === 'scripts/affected-tests.mjs') return 'tests/world-layout.test.mjs\n';
    if (args[0] === 'pr' && args[1] === 'view') throw Error('no pull requests found');
    if (args[0] === 'pr' && args[1] === 'create')
      return 'https://github.com/IoTProjectApp/IoTQuest/pull/99\n';
    return '';
  };
  const plan = { files: ['public/data/world-layout.js'], branch: 'editor/x', newBranch: true };
  const result = await publish(plan, run);
  assert.deepEqual(result, {
    url: 'https://github.com/IoTProjectApp/IoTQuest/pull/99',
    existing: false,
  });
  const message = commitMessage(plan.files);
  assert.equal(message, 'Update world-layout from the editor');
  assert.deepEqual(calls.slice(0, 6), [
    ['git', 'switch', '-c', 'editor/x'],
    ['node', 'scripts/affected-tests.mjs', 'public/data/world-layout.js'],
    ['node', '--test', 'tests/world-layout.test.mjs'],
    ['git', 'add', '--', 'public/data/world-layout.js'],
    ['git', 'commit', '-m', message, '--', 'public/data/world-layout.js'],
    ['git', 'push', '-u', 'origin', 'editor/x'],
  ]);
  const create = calls.find((c) => c[1] === 'pr' && c[2] === 'create');
  assert.equal(create[create.indexOf('--base') + 1], 'dev');
});

test('a failing test stops publishing before anything is committed', async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push(args[0]);
    if (args[0] === 'scripts/affected-tests.mjs') return 'tests/world-layout.test.mjs\n';
    if (args[0] === '--test') throw Error('1 test failed');
    return '';
  };
  await assert.rejects(
    publish({ files: ['public/data/world-layout.js'], branch: 'b', newBranch: false }, run),
    /1 test failed/,
  );
  assert.ok(!calls.includes('commit') && !calls.includes('push'));
});

test('publishing again adds to the branch’s open pull request', async () => {
  const run = async (command, args) =>
    args[1] === 'view' ? 'OPEN https://github.com/IoTProjectApp/IoTQuest/pull/7\n' : '';
  assert.deepEqual(
    await publish({ files: ['public/data/cities.js'], branch: 'b', newBranch: false }, run),
    { url: 'https://github.com/IoTProjectApp/IoTQuest/pull/7', existing: true },
  );
});
