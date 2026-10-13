// The connected world in headless Chromium: farms, community buildings, staff and sections (see
// game-harness.mjs). Run with `npm run test:browser`.
import { neighbourProfiles } from '../../public/neighbour-profiles.js';
import { civicLots } from '../../public/community-civic.js';
import { victorianFarms } from '../../public/farms.js';
import { missions, defaults, program } from '../../public/missions.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame, browser, openHome, settle, visitChat, modalOpen } from './game-harness.mjs';

startGame();

test('Victorian farms render and retain homestead and connected town navigation', async () => {
  const { page, errors } = await openHome({ reducedMotion: 'reduce' });
  for (const farm of victorianFarms) {
    await page.locator('#backToGlobe').click();
    await page.locator('#continentSelect').selectOption('Oceania');
    await page.locator('#countrySelect').selectOption('AUS');
    await page.locator(`[data-location="${farm.id}"]`).click();
    await page.locator('#enterLocation').click();
    await page.locator('.layout-switch [data-layout="world"]').click();
    await page.locator('[data-view="landscape"]').click();
    await settle(page);
    assert.equal(await page.locator('#graphicsMessage').isVisible(), false);
    await page.locator('[data-area="Garden path"]').click();
    assert.ok((await page.textContent('#location')).includes('Garden path'));
    // Whoever asked for the path's requests comes over to chat.
    if (await visitChat(page)) await page.locator('#closeModal').click();
    await page.locator('#exploreCommunity').click();
    await settle(page);
    const shop = page.locator('[data-community-building="shop"]');
    await shop.focus();
    await shop.click();
    assert.ok((await page.textContent('#location')).includes('Shop floor'));
  }
  assert.deepEqual(errors, []);
});

test('world overview keeps building names clear and restores staff labels inside buildings', async () => {
  const { page, errors } = await openHome({ reducedMotion: 'reduce' });
  await page.locator('#exploreCommunity').click();
  await settle(page);
  assert.equal(
    await page.locator('#roofToggle').getAttribute('aria-pressed'),
    'true',
    'Overview starts with complete building exteriors',
  );
  await page.locator('#roofToggle').click();
  assert.equal(await page.locator('#roofToggle').getAttribute('aria-pressed'), 'false');
  await page.locator('#roofToggle').click();
  assert.equal(await page.locator('.section-resident:visible').count(), 0);
  const school = page.locator('[data-community-building="school"]');
  await school.focus();
  await school.click();
  await page.locator('.layout-switch [data-layout="world"]').click();
  await settle(page);
  await page.waitForFunction(
    () =>
      getComputedStyle(document.getElementById('resident-civic:school')).visibility === 'visible',
  );
  assert.equal(await page.locator('[id="resident-civic:school"]').isVisible(), true);
  await page.locator('#roofToggle').click();
  assert.equal(await page.locator('#roofToggle').getAttribute('aria-pressed'), 'true');
  await page.locator('#roofToggle').click();
  assert.equal(await page.locator('#roofToggle').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(errors, []);
});

test('every new building label opens its project and the technician remains visible', async () => {
  const { page, errors } = await openHome();
  for (const [type, area] of Object.entries({
    shop: 'Shop floor',
    office: 'Business office',
    warehouse: 'Loading bay',
    factory: 'Factory floor',
    roads: 'Community roads',
    parking: 'Parking area',
    residence1: 'Willow house',
    residence2: 'Courtyard house',
    residence3: 'Garden cottage',
    residence4: 'Maple house',
    residence5: 'Cedar house',
    residence6: 'Birch house',
    hospital: 'Community hospital',
    school: 'Neighbourhood school',
    police: 'Police station',
    fire: 'Fire station',
    pool: 'Riverside swimming pool',
    gym: 'Riverside gym',
    dojo: 'Riverside judo dojo',
    park: 'Riverside fountain park',
    playground: 'Riverside children’s playground',
    playground2: 'Meadow children’s playground',
    basketball: 'Riverside basketball court',
  })) {
    await page.locator('#exploreCommunity').click();
    await settle(page);
    // Clicks use Playwright's default 30 s: the click itself is instant, but Playwright waits a
    // few rendered frames around it, and CI's software WebGL draws the community at 1-2 s a frame.
    await page.locator(`[data-community-building="${type}"]`).click();
    assert.match(await page.textContent('#location'), new RegExp(area));
    if (['pool', 'gym', 'dojo', 'park', 'playground', 'playground2', 'basketball'].includes(type)) {
      await page.locator('[data-install="led"]').click();
      assert.equal(await page.inputValue('#installArea'), area);
      await page.locator(type === 'basketball' ? '#confirmInstall' : '#closeModal').click();
    }
    assert.equal(await page.getAttribute('[data-tab].selected', 'data-tab'), 'inventory');
    assert.equal(await page.getAttribute('#adventureScreen', 'data-layout'), 'split');
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('#player')).visibility === 'visible',
      null,
      { timeout: 5000 },
    );
  }
  assert.deepEqual(errors, []);
  await page.close();
});
for (const language of ['cpp', 'python'])
  test(`new factory accepts installation, wiring and ${language} in the actual browser`, async () => {
    const { page, errors } = await openHome();
    await page.locator('#communityProgram').click();
    const q = missions.find((m) => m.communityType === 'factory');
    for (const id of q.ids) {
      await page.locator(`[data-install="${id}"]`).click();
      assert.equal(await page.inputValue('#installArea'), 'Factory floor');
      await page.locator('#confirmInstall').click();
      assert.equal(await page.locator(`[data-install="${id}"]`).isDisabled(), true);
    }
    await page.locator('[data-tab="wiring"]').click();
    await page.locator('#connectAll').click();
    await page.locator('#goCode').click();
    await page.locator('#languageSelect').selectOption(language);
    await page.locator('#codeInput').fill(program(q, language, defaults(q.ids, 'ESP32'), true));
    await page.locator('#runBtn').click();
    // CI renders the 3D world in software on two cores alongside the program's worker, several
    // times slower than a laptop, so this wait is generous; a failure shows what the page had.
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('#liveReadings .live-reading')].some(
            (row) =>
              row.textContent.includes('Conveyor motor driver') &&
              row.querySelector('.output-state')?.textContent === 'ON',
          ),
        null,
        { timeout: 90000 },
      )
      .catch(async (e) => {
        const seen = await page.evaluate(() => ({
          readings: document.getElementById('liveReadings')?.innerText,
          serial: document.getElementById('serialText')?.innerText,
        }));
        throw Error(e.message + '\n' + JSON.stringify(seen, null, 2));
      });
    await page.locator('#stopBtn').click();
    assert.deepEqual(errors, []);
    await page.close();
  });

test('new residential resident opens its own automation request from inside the home', async () => {
  const { page, errors } = await openHome();
  await page.locator('[data-community-building="residence1"]').click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('t');
  assert.equal(await modalOpen(page), true);
  assert.equal(await page.textContent('#modalTitle'), 'A chat with Avery');
  assert.match(await page.textContent('#modalBody'), /Neighbourhood Porch Lighting/);
  assert.deepEqual(errors, []);
  await page.locator('#closeModal').click();
  await page.close();
});

test('civic staff offer their own building projects and accept wired programs', async () => {
  const { page, errors } = await openHome();
  for (const b of civicLots) {
    await page.locator('#exploreCommunity').click();
    await settle(page);
    await page.locator(`[data-community-building="${b.type}"]`).click();
    await page.keyboard.press('t');
    assert.equal(await page.textContent('#modalTitle'), 'A chat with ' + b.resident);
    const q = missions.find((m) => m.communityType === b.type);
    assert.ok((await page.textContent('#modalBody')).includes(q.title));
    await page.locator('#closeModal').click();
    for (const id of q.ids) {
      await page.locator(`[data-install="${id}"]`).click();
      assert.equal(await page.inputValue('#installArea'), b.name);
      await page.locator('#confirmInstall').click();
    }
    await page.locator('[data-tab="wiring"]').click();
    await page.locator('#connectAll').click();
    await page.locator('#goCode').click();
    await page.locator('#languageSelect').selectOption('cpp');
    await page.locator('#codeInput').fill(program(q, 'cpp', defaults(q.ids, 'ESP32'), true));
    await page.locator('#runBtn').click();
    await page.waitForTimeout(500);
    await page.locator('#stopBtn').click();
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('formerly unlabeled Melbourne houses have accessible individual sections', async () => {
  const { page, errors } = await openHome();
  await page.locator('#backToGlobe').click();
  await page.locator('#continentSelect').selectOption('Oceania');
  await page.locator('#countrySelect').selectOption('AUS');
  await page.locator('[data-location="fitzroy"]').click();
  await page.locator('#enterLocation').click();
  for (const i of [1, 9, 18]) {
    await page.locator('#exploreCommunity').click();
    await settle(page);
    const button = page.locator(`[data-community-building="neighbour${i}"]`);
    await button.focus();
    await button.click();
    assert.ok((await page.textContent('#location')).includes(neighbourProfiles[i - 1].name));
    await page.locator('[data-install="led"]').click();
    assert.equal(await page.inputValue('#installArea'), neighbourProfiles[i - 1].name);
    await page.locator('#closeModal').click();
    await page.keyboard.press('t');
    assert.equal(
      await page.textContent('#modalTitle'),
      'A chat with ' + neighbourProfiles[i - 1].resident,
    );
    await page.locator('#closeModal').click();
  }
  assert.deepEqual(errors, []);
  await page.close();
});

test('school classrooms and police office, parking and jail open as separate sections', async () => {
  const { page, errors } = await openHome();
  for (const [parent, sections] of [
    ['school', ['schoolClassroom1', 'schoolClassroom2', 'schoolClassroom3']],
    ['police', ['policeOffice', 'policeParking', 'policeJail']],
  ]) {
    await page.locator('#exploreCommunity').click();
    await settle(page);
    await page.locator(`[data-community-building="${parent}"]`).click();
    for (const type of sections) {
      const target = page.locator(`[data-civic-section="${type}"]`);
      await target.focus();
      await target.click();
      const names = {
        schoolClassroom1: 'School classroom 1',
        schoolClassroom2: 'School classroom 2',
        schoolClassroom3: 'School classroom 3',
        policeOffice: 'Police office',
        policeParking: 'Police parking',
        policeJail: 'Police jail',
      };
      assert.ok((await page.textContent('#location')).includes(names[type]));
      await page.locator('[data-install="led"]').click();
      assert.equal(await page.inputValue('#installArea'), names[type]);
      await page.locator('#closeModal').click();
    }
  }
  assert.deepEqual(errors, []);
  await page.close();
});
