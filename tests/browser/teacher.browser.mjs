// The teacher's class progress page in headless Chromium: layout on small screens, keyboard use,
// and what it does with the report files it is given.
// Run with `npm run test:browser` (needs `npx playwright install chromium` once).
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

let server, browser, origin;
before(async () => {
  server = spawn(process.execPath, ['scripts/serve.mjs', '0'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  origin = await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => {
      const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    });
    server.on('exit', () => reject(Error('The game server stopped before it was ready.')));
  });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.kill();
});
const openPages = [];
afterEach(async () => {
  for (const page of openPages.splice(0)) await page.close().catch(() => {});
});

const TITLES = ['Night light', 'Plant waterer', 'Doorbell', 'Fan control', 'Alarm', 'Blinds'];
// A handed-in progress report as a file for the file input.
function reportFile(student, classCode, { createdAt = '2026-10-02T00:00:00Z', name } = {}) {
  const report = {
    format: 'iotquest-progress',
    version: 1,
    student,
    classCode,
    createdAt,
    quests: TITLES.map((title, index) => ({
      location: 'legacy',
      locationName: 'Willowbrook (original home)',
      difficulty: 'original',
      index,
      title,
      status: index < 2 ? 'passed' : index === 2 ? 'started' : 'not-started',
      attempts: index === 2 ? 4 : 1,
      hints: 1,
      code: 'void setup() {}\nvoid loop() {}\n',
      stuck: index === 2 ? 'Compare the reading with the threshold' : null,
    })),
  };
  return {
    name: name || student.replace(/\W+/g, '-') + '.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(report)),
  };
}
const CLASS = [
  reportFile('Aaliyah Mohammed-Rahman', '10B Digital Tech'),
  reportFile('Ben', '10B Digital Tech'),
  reportFile('Chen Wei', '10B Digital Tech'),
];

async function openTeacher({ width = 1366, colorScheme = 'light', files = CLASS } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, colorScheme });
  openPages.push(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(origin + '/teacher.html');
  await page.setInputFiles('#files', files);
  await page.locator('.t-cell').first().waitFor();
  return { page, errors };
}

for (const width of [360, 600, 800, 900])
  test(`the class grid scrolls inside its own box and never widens the page (${width}px)`, async () => {
    const { page, errors } = await openTeacher({ width });
    const measure = () =>
      page.evaluate(() => ({
        page: document.documentElement.scrollWidth,
        view: innerWidth,
        wrap: document.querySelector('.t-grid-wrap').clientWidth,
        table: document.querySelector('.t-grid').scrollWidth,
      }));
    let m = await measure();
    assert.equal(m.page, m.view, 'the page is exactly as wide as the window');
    assert.ok(m.wrap <= m.view);
    if (width < 800) assert.ok(m.table > m.wrap, 'the table scrolls sideways in its box');
    // Showing a student's details (with their code) does not widen the page either.
    await page.locator('.t-cell').nth(3).click();
    m = await measure();
    assert.equal(m.page, m.view, 'still as wide as the window with details shown');
    assert.deepEqual(errors, []);
  });

test('keyboard focus stays on the chosen cell or help link and the details are announced', async () => {
  const { page, errors } = await openTeacher();
  const cell = page.locator('.t-cell[data-row="1"][data-index="2"]');
  await cell.focus();
  await page.keyboard.press('Enter');
  const focused = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return a.className.split(' ')[0] + ' ' + a.dataset.row + ' ' + a.dataset.index;
    });
  assert.equal(await focused(), 't-cell 1 2');
  assert.match(await page.textContent('#detail h2'), /Ben/);
  assert.match(await page.textContent('#announce'), /^Details: Ben, 3\. Doorbell, Needs help/);
  // Arrow-free keyboard use carries on from the chosen cell.
  await page.keyboard.press('Tab');
  assert.equal(await focused(), 't-cell 1 3');

  const link = page.locator('.t-link').nth(1);
  const { row, index } = await link.evaluate((b) => ({ ...b.dataset }));
  await link.focus();
  await page.keyboard.press('Enter');
  assert.equal(await focused(), 't-link ' + row + ' ' + index);
  assert.match(await page.textContent('#announce'), /^Details: /);
  assert.deepEqual(errors, []);
});

test('class codes that differ only in case are one class in the menu', async () => {
  const { page } = await openTeacher({
    files: [reportFile('Ann', '7A'), reportFile('Bo', '7a'), reportFile('Cy', '8B')],
  });
  assert.deepEqual(await page.$$eval('#classSelect option', (o) => o.map((x) => x.textContent)), [
    'All classes',
    '7A',
    '8B',
  ]);
  await page.selectOption('#classSelect', '7a');
  assert.equal(await page.locator('.t-grid tbody tr').count(), 2, 'both 7A students shown');
});

test('a student who handed in twice is named in a notice, and the newest report is shown', async () => {
  const { page } = await openTeacher({
    files: [
      ...CLASS,
      reportFile('ben', '10b digital tech', { createdAt: '2026-10-05T00:00:00Z', name: 'b2.json' }),
    ],
  });
  assert.equal(await page.locator('#duplicates').isVisible(), true);
  assert.match(await page.textContent('#duplicates'), /Ben \(10B Digital Tech\) · 2 reports/);
  assert.equal(await page.locator('.t-grid tbody tr').count(), 3);
  await page.click('#clearBtn');
  assert.equal(await page.locator('#duplicates').isVisible(), false);
});

test('the CSV says it covers every destination and opens as UTF-8 in spreadsheets', async () => {
  const { page } = await openTeacher({ files: [reportFile('محمد علي', '7A')] });
  assert.match(await page.textContent('#csvBtn'), /all destinations/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#csvBtn')]);
  assert.match(download.suggestedFilename(), /^iotquest-class-progress-all-destinations-.*\.csv$/);
  const bytes = await readFile(await download.path());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'starts with a UTF-8 BOM');
  assert.match(bytes.toString('utf8'), /"محمد علي","7A"/);
});

test('leaving the page asks first once reports are loaded, and not before', async () => {
  const page = await browser.newPage();
  openPages.push(page);
  await page.goto(origin + '/teacher.html');
  const prevented = () =>
    page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true });
      dispatchEvent(e);
      return e.defaultPrevented;
    });
  assert.equal(await prevented(), false, 'nothing to lose yet');
  await page.setInputFiles('#files', CLASS);
  await page.locator('.t-cell').first().waitFor();
  assert.equal(await prevented(), true);
  await page.click('#clearBtn');
  assert.equal(await prevented(), false);
});
