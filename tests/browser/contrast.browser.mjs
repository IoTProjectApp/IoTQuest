// Small text that is easy to make too faint: checks the WCAG AA contrast (4.5:1) of the computed
// colours in both themes, and that keyboard focus is visible on the world and the split handle.
// Run with `npm run test:browser` (needs `npx playwright install chromium` once).
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});
after(async () => {
  await browser?.close();
  server?.kill();
});
const openPages = [];
afterEach(async () => {
  for (const page of openPages.splice(0)) await page.close().catch(() => {});
});

async function open(path, { colorScheme = 'light', width = 1366, height = 800 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, colorScheme });
  openPages.push(page);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(origin + path);
  return page;
}

// For each selector: the contrast of the first matching element's text against the colour behind
// it (its own and its ancestors' backgrounds, with see-through layers blended over each other).
function contrasts(page, selectors) {
  return page.evaluate((selectors) => {
    const rgba = (c) => {
      const [r, g, b, a = 1] = c.match(/[\d.]+/g).map(Number);
      return { r, g, b, a };
    };
    const over = (top, under) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
      a: 1,
    });
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const behind = (el) => {
      const layers = [];
      for (let e = el; e; e = e.parentElement) {
        const c = rgba(getComputedStyle(e).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a >= 1) break;
      }
      return layers.reduceRight((under, top) => over(top, under), {
        r: 255,
        g: 255,
        b: 255,
        a: 1,
      });
    };
    const out = {};
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) {
        out[sel] = 'missing';
        continue;
      }
      const bg = behind(el),
        fg = over(rgba(getComputedStyle(el).color), bg),
        [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
      out[sel] = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
    }
    return out;
  }, selectors);
}
const tooFaint = (results) =>
  Object.entries(results).filter(([, ratio]) => ratio === 'missing' || ratio < 4.5);

const REPORT = {
  format: 'iotquest-progress',
  version: 1,
  student: 'Ann',
  classCode: '7A',
  createdAt: '2026-10-02T00:00:00Z',
  quests: ['passed', 'started', 'not-started', 'passed'].map((status, index) => ({
    location: 'legacy',
    difficulty: 'original',
    index,
    title: 'Quest ' + index,
    status,
    attempts: index === 1 ? 4 : 1,
    hints: 0,
    understood: index === 3 ? 0 : 3,
    understandAnswered: 3,
    understandTotal: 3,
  })),
};

for (const colorScheme of ['light', 'dark']) {
  test(`teacher page status text is readable (${colorScheme})`, async () => {
    const page = await open('/teacher.html', { colorScheme });
    await page.setInputFiles('#files', {
      name: 'ann.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(REPORT)),
    });
    await page.locator('.t-cell').first().waitFor();
    const results = await contrasts(page, [
      '.t-cell.none .t-cell-text',
      '.t-key.none',
      '.t-cell.help small',
      '.t-cell.review small',
      '.t-cell.passed small',
      '.t-grid th small',
    ]);
    assert.deepEqual(tooFaint(results), [], JSON.stringify(results));
  });

  test(`travel screen secondary text and buttons are readable (${colorScheme})`, async () => {
    const page = await open('/', { colorScheme });
    await page.locator('.location-choice small').first().waitFor();
    const selectors = [
      '.destination-panel > .eyebrow',
      '.location-choice small',
      '.region-progress',
      '.journey-note p',
      '#travelSources',
      '#freeExploration',
      '#enterLocation',
    ];
    const results = await contrasts(page, selectors);
    assert.deepEqual(tooFaint(results), [], JSON.stringify(results));
    await page.hover('#freeExploration');
    const hovered = await contrasts(page, ['#freeExploration']);
    assert.deepEqual(tooFaint(hovered), [], 'on hover ' + JSON.stringify(hovered));
  });

  test(`game toolbar text and primary buttons are readable (${colorScheme})`, async () => {
    const page = await open('/', { colorScheme });
    await page.click('#resumeLegacy');
    await page.locator('#worldCanvas').waitFor();
    const results = await contrasts(page, [
      '.world-tabs button:not(.selected)',
      '#dayLabel',
      '.world-density',
      '#simClock',
      '.quest-locator small',
      '#testMission',
    ]);
    assert.deepEqual(tooFaint(results), [], JSON.stringify(results));
  });
}

test('keyboard focus is visible on the 3D world and on the split handle', async () => {
  const page = await open('/', { width: 1440, height: 900 });
  await page.click('#resumeLegacy');
  await page.locator('#worldCanvas').waitFor();
  const ring = () =>
    page.evaluate(() => {
      const after = getComputedStyle(document.getElementById('world'), '::after');
      return after.content !== 'none' ? after.borderTopWidth + ' ' + after.borderTopStyle : 'none';
    });
  assert.equal(await ring(), 'none', 'no ring before focus');
  await page.keyboard.press('Shift');
  await page.evaluate(() => document.getElementById('worldCanvas').focus());
  assert.equal(await ring(), '3px solid');
  await page.evaluate(() => document.getElementById('splitHandle').focus());
  const handle = await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('splitHandle'));
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  assert.equal(handle.style, 'solid');
  assert.ok(handle.width >= 2);
});
