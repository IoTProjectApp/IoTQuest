import test from 'node:test';
import assert from 'node:assert/strict';
import { outfitFor, TECHNICIAN_OUTFIT, JUDO_GI } from '../public/character-outfits.js';

const COLOUR = /^#[0-9a-f]{6}$/;

test('everyone is dressed the same on every visit', () => {
  for (const id of ['Maya', 'bus:stop-1:0', 'worker:shop-floor:0', 'football:3'])
    assert.deepEqual(outfitFor(id), outfitFor(id));
});

test('neighbours who share a model do not all wear the same clothes', () => {
  const ids = Array.from({ length: 30 }, (_, i) => 'bus:stop-' + i + ':0'),
    looks = new Set(ids.map((id) => outfitFor(id).top + outfitFor(id).bottom));
  assert.ok(looks.size >= 12, looks.size + ' different outfits');
  for (const id of ids) {
    assert.match(outfitFor(id).top, COLOUR);
    assert.match(outfitFor(id).bottom, COLOUR);
  }
});

test('work wear goes with the job', () => {
  assert.equal(TECHNICIAN_OUTFIT.hat.kind, 'hardhat');
  assert.ok(TECHNICIAN_OUTFIT.vest.text);
  const factory = outfitFor('worker:factory-floor:4');
  assert.equal(factory.hat.kind, 'hardhat');
  assert.match(factory.vest.color, COLOUR);
  assert.ok(outfitFor('worker:loading-bay:2').vest);
  assert.equal(outfitFor('worker:shop-floor:0').vest, undefined);
  assert.equal(JUDO_GI.top, JUDO_GI.bottom);
});

test('uniforms keep their own colours and get a badge', () => {
  for (const [id, badge] of [
    ['civic:hospital', 'medical'],
    ['recreation:pool', 'lifeguard'],
    ['worker:business-office:1', 'name'],
  ]) {
    assert.equal(outfitFor(id).badge, badge);
    assert.equal(outfitFor(id).top, undefined);
  }
});

test('caps and backpacks only go to people outdoors', () => {
  const ids = Array.from({ length: 40 }, (_, i) => i);
  assert.ok(ids.some((i) => outfitFor('football:' + i).hat?.kind === 'cap'));
  assert.ok(ids.some((i) => outfitFor('bus:stop:' + i).backpack));
  assert.ok(
    !ids.some((i) => outfitFor('resident-' + i).hat || outfitFor('resident-' + i).backpack),
  );
});
