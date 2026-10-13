// The game in headless Chromium for the browser tests: one game server and browser per test file,
// pages closed after each test (with a screenshot and trace on failure), and helpers shared by
// the test files.
import { before, after, afterEach } from 'node:test';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { useRenderer } from './renderer.mjs';

export let server, browser, origin;
// Pages a test opened, closed after it (openHome adds to it; tests opening their own add them too).
export const openPages = [];
// Starts the game server and browser for this test file, and tidies pages after each test.
export function startGame() {
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
    browser = useRenderer(
      await chromium.launch({
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      }),
    );
  });
  after(async () => {
    await browser?.close();
    server?.kill();
  });
  // A failed test never reaches its page.close(); a page left open keeps rendering the 3D world and
  // slows every later test, so close whatever openHome opened. A failed test leaves a screenshot
  // and a Playwright trace (DOM snapshots of every step) in test-results/, which CI uploads.
  afterEach(async (t) => {
    const name = t.name.replace(/[^a-z0-9]+/gi, '-').slice(0, 80);
    for (const [i, page] of openPages.splice(0).entries()) {
      const path = t.passed === false ? `test-results/${name}-${i}` : null;
      if (path) await page.screenshot({ path: path + '.png' }).catch(() => {});
      await page
        .context()
        .tracing.stop(path ? { path: path + '.zip' } : {})
        .catch(() => {});
      await page.close().catch(() => {});
    }
  });
}

export async function openHome({
  colorScheme = 'light',
  reducedMotion = 'no-preference',
  width = 1440,
} = {}) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme,
    reducedMotion,
  });
  openPages.push(page);
  await page.context().tracing.start({ snapshots: true });
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
// Waits until the camera has finished moving, so labels are in their final positions. Readings
// are a few rendered frames apart rather than a fixed delay: on CI's software WebGL a frame can
// take longer than any short delay, and two readings with no frame between them look settled.
// A visiting resident walks over before the chat opens (or nobody comes when the room has
// nothing to ask): waits for the chat, and returns whether it opened.
export const visitChat = (page, timeout = 30000) =>
  page
    .waitForFunction(() => document.getElementById('modal').open, null, { timeout })
    .then(
      () => true,
      () => false,
    );
export async function settle(page) {
  const positions = () =>
    page.evaluate(async () => {
      for (let i = 0; i < 3; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
      return [...document.querySelectorAll('[data-area], [data-community-building]')]
        .map((e) => e.style.left + e.style.top + e.style.visibility)
        .join();
    });
  const deadline = Date.now() + 20000;
  let last = null;
  while (Date.now() < deadline) {
    const now = await positions();
    if (now && now === last) return;
    last = now;
  }
}
export const modalOpen = (page) => page.evaluate(() => document.getElementById('modal').open);

// WCAG relative luminance contrast between two CSS rgb() colours.
export function contrast(a, b) {
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
