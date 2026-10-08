// Drives the real game in headless Chromium to catch what the DOM-free unit tests cannot:
// overlapping labels, clipped dialogs, theme contrast and reduced motion.
// Run with `npm run test:browser` (needs `npx playwright install chromium` once).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
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
  // SwiftShader gives headless Chromium a software WebGL, so the 3D world renders anywhere.
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});
after(async () => {
  await browser?.close();
  server?.kill();
});

async function openHome({
  colorScheme = 'light',
  reducedMotion = 'no-preference',
  width = 1440,
} = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme,
    reducedMotion,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Keep tests offline and deterministic: live weather and web fonts are not needed.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(origin + '/');
  await page.click('#resumeLegacy');
  await page.locator('#worldCanvas').waitFor();
  await settle(page);
  return { page, errors };
}
// Waits until the camera has finished moving, so labels are in their final positions.
async function settle(page) {
  const positions = () =>
    page.$$eval('[data-area]', (els) => els.map((e) => e.style.left + e.style.top).join());
  let last = null;
  for (let i = 0; i < 40; i++) {
    const now = await positions();
    if (now && now === last) return;
    last = now;
    await page.waitForTimeout(250);
  }
}
const modalOpen = (page) => page.evaluate(() => document.getElementById('modal').open);

test('every on-screen room button can be clicked in the World view', async () => {
  const { page, errors } = await openHome();
  // The element on top at the centre of each on-screen room button must be that button.
  const blocked = await page.$$eval('[data-area]', (els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return getComputedStyle(el).visibility === 'visible' && r.width && r.bottom > 0;
      })
      .filter((el) => {
        const r = el.getBoundingClientRect(),
          top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return top?.closest('[data-area]') !== el;
      })
      .map(
        (el) =>
          el.dataset.area +
          ' (under ' +
          document
            .elementFromPoint(
              el.getBoundingClientRect().x + el.getBoundingClientRect().width / 2,
              el.getBoundingClientRect().y + el.getBoundingClientRect().height / 2,
            )
            ?.outerHTML.slice(0, 60) +
          ')',
      ),
  );
  assert.deepEqual(blocked, []);
  await page.locator('[data-area="Living room"]').click();
  assert.equal(await modalOpen(page), false);
  assert.match(await page.textContent('#worldTip'), /install devices/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('at a room E installs devices and T talks to its resident', async () => {
  const { page, errors } = await openHome();
  await page.locator('[data-area="Bedroom"]').click();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await modalOpen(page), false, 'no greeting pops up on the first step');
  await page.keyboard.press('e');
  assert.equal(await modalOpen(page), false);
  assert.equal(await page.getAttribute('[data-tab].selected', 'data-tab'), 'inventory');
  await page.keyboard.press('t');
  assert.equal(await modalOpen(page), true);
  assert.match(await page.textContent('#modalTitle'), /A chat with Nina/);
  assert.deepEqual(errors, []);
  await page.close();
});

for (const colorScheme of ['light', 'dark'])
  for (const width of [1440, 390])
    test(`chat messages stay inside the dialog (${colorScheme}, ${width}px)`, async () => {
      const { page, errors } = await openHome({ colorScheme, width });
      await page.evaluate(() =>
        document.querySelector('[data-section-npc="section:Bedroom"]').click(),
      );
      await page.getByRole('button', { name: 'What will I see animated?' }).click();
      const dialog = await page.locator('#modal').boundingBox(),
        title = await page.locator('#modalTitle').boundingBox(),
        log = await page.locator('#chatMessages').boundingBox();
      // Messages scroll inside their own panel, which sits below the heading.
      assert.ok(log.y >= title.y + title.height, 'the message panel does not cover the heading');
      for (const bubble of await page.locator('.chat-message').all()) {
        const box = await bubble.boundingBox();
        assert.ok(box.x >= dialog.x && box.x + box.width <= dialog.x + dialog.width + 0.5);
        assert.ok(box.x >= log.x && box.x + box.width <= log.x + log.width + 0.5);
      }
      assert.deepEqual(errors, []);
      await page.close();
    });

// WCAG relative luminance contrast between two CSS rgb() colours.
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
for (const colorScheme of ['light', 'dark'])
  test(`chat text is readable in the ${colorScheme} theme`, async () => {
    const { page } = await openHome({ colorScheme });
    assert.equal(await page.getAttribute('html', 'data-theme'), colorScheme);
    await page.evaluate(() =>
      document.querySelector('[data-section-npc="section:Bedroom"]').click(),
    );
    const colors = await page.evaluate(() => {
      const style = (sel) => getComputedStyle(document.querySelector(sel));
      return {
        name: style('.from-resident .chat-bubble strong').color,
        text: style('.from-resident .chat-bubble p').color,
        bubble: style('.from-resident .chat-bubble').backgroundColor,
      };
    });
    assert.ok(contrast(colors.text, colors.bubble) >= 4.5, 'message text contrast');
    assert.ok(contrast(colors.name, colors.bubble) >= 4.5, 'name contrast');
    await page.close();
  });

test('the system reduced-motion setting is honoured', async () => {
  const { page, errors } = await openHome({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => document.body.classList.contains('reduced-motion')), true);
  const transition = await page.evaluate(
    () => getComputedStyle(document.querySelector('button')).transitionDuration,
  );
  assert.match(transition, /^0s(, 0s)*$/);
  assert.deepEqual(errors, []);
  await page.close();
});

test('the built game installs for offline use and still opens with no network', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const built = spawn(process.execPath, ['scripts/serve.mjs', '0'], {
    env: { ...process.env, ROOT: 'dist/client' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const url = await new Promise((resolve) =>
    built.stdout.on('data', (d) => {
      const m = String(d).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) resolve(m[0]);
    }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url + '/');
    // Wait until the service worker has stored the game and controls the page.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller));
    const manifest = await page.evaluate(() =>
      fetch(document.querySelector('link[rel=manifest]').href).then((r) => r.json()),
    );
    assert.equal(manifest.display, 'standalone');
    await context.setOffline(true);
    await page.reload();
    await page.click('#resumeLegacy');
    await page.locator('#worldCanvas').waitFor();
    assert.equal(await page.locator('#offlineBadge').isVisible(), true);
    assert.match(await page.textContent('#missionTitle'), /\S/);
    // Each page keeps its own cached copy: the teacher page is not served the game, or vice versa.
    await page.goto(url + '/teacher.html');
    assert.match(await page.title(), /Class Progress/);
    await page.goto(url + '/');
    assert.match(await page.title(), /IoT Quest: Connected World/);
  } finally {
    await context.close();
    built.kill();
  }
});

test('a teacher builds a quest, sees its tests, and downloads a file students can import', async () => {
  const page = await browser.newPage();
  await page.goto(origin + '/teacher.html');
  await page.click('.t-create summary');
  await page.fill('#qTitle', 'Frost guard');
  await page.selectOption('#qSensor', 'temp');
  await page.selectOption('#qOutput', 'buzzer');
  await page.selectOption('#qOperator', '<=');
  await page.fill('#qThreshold', '2');
  assert.match(await page.textContent('#qPreview'), /at or below 2 °C/);
  assert.equal(await page.locator('.t-quest-tests tbody tr').count(), 5);
  await page.fill('#qThreshold', '99');
  assert.match(await page.textContent('#qPreview'), /between -10 and 50/);
  assert.equal(await page.locator('#qDownload').isDisabled(), true);
  await page.fill('#qThreshold', '2');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#qDownload')]);
  const { parseQuestFile } = await import('../../public/custom-quests.js');
  const { readFile } = await import('node:fs/promises');
  const quest = parseQuestFile(await readFile(await download.path(), 'utf8'));
  assert.equal(quest.title, 'Frost guard');
  assert.equal(download.suggestedFilename(), 'iotquest-quest-frost-guard.json');
  await page.close();
});

test('the dashboard switch controls a running program and shows what it reports', async () => {
  const { page, errors } = await openHome();
  await page.click('[data-tab="dashboard"]');
  await page.click('[data-dashboard-quest="remote-fan"]');
  const { dashboardQuests } = await import('../../public/challenges.js');
  const { defaults } = await import('../../public/missions.js');
  await page.click('[data-tab="code"]');
  await page.fill('#codeInput', dashboardQuests[1].solution('cpp', defaults(['fan'], 'ESP32')));
  await page.dispatchEvent('#codeInput', 'input');
  await page.click('#runBtn');
  await page.click('[data-tab="dashboard"]');
  await page.click('[data-publish-topic="home/fan/set"]');
  await page.locator('#dashLive', { hasText: 'Fan reports' }).waitFor();
  await page.waitForFunction(() =>
    /Fan reports\s*On/.test(document.getElementById('dashLive').innerText),
  );
  assert.deepEqual(errors, []);
  await page.close();
});

test('typing in the editor offers suggestions, Enter inserts one and the hint shows the argument', async () => {
  const { page, errors } = await openHome();
  await page.click('[data-tab="code"]');
  await page.locator('#codeInput').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nconst int lightPin = 34;\nvoid loop() {\ndigi');
  assert.deepEqual(
    await page.$$eval('#acList li .ac-label', (li) => li.map((l) => l.textContent)),
    ['digitalRead(pin)', 'digitalWrite(pin, value)'],
  );
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('lightP');
  await page.keyboard.press('Tab');
  await page.keyboard.type(', ');
  assert.match(await page.inputValue('#codeInput'), /digitalWrite\(lightPin, \)$/);
  assert.equal(await page.textContent('#acSignature b'), 'value');
  const box = await page.locator('#acSignature').boundingBox(),
    editor = await page.locator('#editorWrap').boundingBox();
  assert.ok(
    box.x >= editor.x && box.x + box.width <= editor.x + editor.width + 1,
    'hint inside the editor',
  );
  assert.deepEqual(errors, []);
  await page.close();
});

// GitHub Pages lets browsers keep files for 10 minutes. This serves two releases the same way and
// checks that a returning visitor gets each deploy whole, after choosing to reload.
test('a returning visitor switches to a new deploy whole, never a mix of two releases', async () => {
  const { mkdtemp, cp, readFile, writeFile, appendFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, extname } = await import('node:path');
  const http = await import('node:http');
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const root = await mkdtemp(join(tmpdir(), 'iotquest-releases-'));
  await cp('dist/client', join(root, 'one'), { recursive: true });
  await cp('dist/client', join(root, 'two'), { recursive: true });
  await appendFile(join(root, 'two', 'game.js'), '\n// release two\n');
  const sw = join(root, 'two', 'sw.js');
  await writeFile(
    sw,
    (await readFile(sw, 'utf8')).replace(
      /const VERSION = "[a-f0-9]+"/,
      'const VERSION = "release-two"',
    ),
  );
  let release = 'one';
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(root, release, path));
      res.writeHead(200, {
        'Content-Type':
          { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(path)] ||
          'application/octet-stream',
        'Cache-Control': 'max-age=600',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    release = 'two';
    let offered = false;
    for (let i = 0; i < 4 && !offered; i++) {
      await page.reload();
      offered = await page
        .locator('#updateBar')
        .waitFor({ timeout: 3000 })
        .then(
          () => true,
          () => false,
        );
    }
    assert.ok(offered, 'the page offers the new version');
    // Until the student reloads, the open page keeps using release one, whole.
    assert.doesNotMatch(
      await page.evaluate(() => fetch('game.js').then((r) => r.text())),
      /release two/,
    );
    await Promise.all([page.waitForEvent('load'), page.click('#updateBar button')]);
    const after = await page.evaluate(async () => ({
      caches: (await caches.keys()).filter((k) => k.startsWith('iotquest-')),
      game: await fetch('game.js').then((r) => r.text()),
    }));
    assert.deepEqual(after.caches, ['iotquest-release-two']);
    assert.match(after.game, /release two/);
    assert.equal(await page.locator('#resumeLegacy').isVisible(), true);
  } finally {
    await context.close();
    server.close();
  }
});

// Browsers that still run the offline code from before the update scheme (it mixed deploys and
// has no reload bar) are taken over at once, even with another tab open.
test('pages on the earlier offline code move to a new deploy on their next visit', async () => {
  const { mkdtemp, cp, readFile, writeFile, appendFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join, extname } = await import('node:path');
  const http = await import('node:http');
  execFileSync(process.execPath, ['scripts/build.mjs']);
  const root = await mkdtemp(join(tmpdir(), 'iotquest-legacy-'));
  await cp('dist/client', join(root, 'old'), { recursive: true });
  await cp('dist/client', join(root, 'new'), { recursive: true });
  // The old release runs the service worker as it was before the update scheme.
  const built = await readFile(join(root, 'new', 'sw.js'), 'utf8'),
    // tests/fixtures/legacy-sw.js is public/sw.js as deployed before the update scheme.
    legacy = (await readFile('tests/fixtures/legacy-sw.js', 'utf8'))
      .replace("const VERSION = 'dev';", 'const VERSION = "legacy";')
      .replace('const PRECACHE = [];', built.match(/const PRECACHE = .*;/)[0]);
  await writeFile(join(root, 'old', 'sw.js'), legacy);
  await appendFile(join(root, 'new', 'game.js'), '\n// the new release\n');
  let release = 'old';
  const server = http.createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join(root, release, path));
      res.writeHead(200, {
        'Content-Type':
          { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(path)] ||
          'application/octet-stream',
        'Cache-Control': 'max-age=600',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const context = await browser.newContext();
  try {
    await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(url);
    const other = await context.newPage();
    await other.goto(url);
    release = 'new';
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForFunction(
      () =>
        fetch('game.js')
          .then((r) => r.text())
          .then((t) => t.includes('the new release')),
      null,
      { timeout: 15000, polling: 500 },
    );
    assert.equal(await page.locator('#resumeLegacy').isVisible(), true);
    const caches = await page.evaluate(() => caches.keys());
    assert.equal(caches.filter((k) => k.startsWith('iotquest-')).length, 1, 'one whole copy left');
  } finally {
    await context.close();
    server.close();
  }
});
