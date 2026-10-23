import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WORKSPACES } from '../editor/ui/workspaces.js';
import componentsStoreDefault from '../public/data/components.js';
import curriculumStoreDefault from '../public/data/curriculum.js';
import climateStoreDefault from '../public/data/climate.js';
import { ComponentSession } from '../editor/workspaces/component-editor/session.js';
import { CurriculumSession } from '../editor/workspaces/curriculum-editor/session.js';
import { ClimateSession } from '../editor/workspaces/climate-editor/session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Component, Curriculum, and Climate workspaces are registered and have store & UI files', () => {
  for (const [id, writes] of [
    ['component-editor', 'public/data/components.js'],
    ['curriculum-editor', 'public/data/curriculum.js'],
    ['climate-editor', 'public/data/climate.js'],
  ]) {
    const ws = WORKSPACES.find((w) => w.id === id);
    assert.ok(ws, `Workspace ${id} is registered in WORKSPACES`);
    assert.equal(ws.writes, writes);
    assert.ok(
      fs.existsSync(path.join(ROOT, 'editor/workspaces', id, 'index.html')),
      `${id}/index.html exists`,
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, 'editor/workspaces', id, 'app.js')),
      `${id}/app.js exists`,
    );
  }

  assert.equal(componentsStoreDefault.version, 1);
  assert.equal(curriculumStoreDefault.version, 1);
  assert.equal(climateStoreDefault.version, 1);
});

test('Component & Circuit Lab session: edit built-in, add custom sensor, preview circuits & waveforms, validate, undo/redo', () => {
  const session = new ComponentSession();
  const initialCount = session.allComponents().length;
  assert.ok(initialCount > 10);

  // Edit built-in component
  session.updateComponent('ldr', { name: 'Calibrated Solar Cell', resistor: '10 kΩ pull-down' });
  assert.equal(session.isEdited('ldr'), true);
  assert.equal(session.getComponent('ldr').name, 'Calibrated Solar Cell');

  // Add custom component
  const customId = session.addCustomComponent({
    name: 'CO2 Sensor',
    icon: '◎',
    output: false,
    analog: true,
    signal: 'co2',
    area: 'Greenhouse',
    range: [400, 2000, 'ppm'],
    desc: 'Measures indoor CO2 concentration.',
  });
  assert.equal(session.allComponents().length, initialCount + 1);
  assert.equal(session.isCustom(customId), true);

  // Preview circuit on ESP32 and Raspberry Pi Pico
  const espPreview = session.circuitPreview(customId, 'ESP32');
  const picoPreview = session.circuitPreview(customId, 'Raspberry Pi Pico');
  assert.equal(espPreview.board, 'ESP32');
  assert.equal(picoPreview.board, 'Raspberry Pi Pico');
  assert.match(espPreview.cppCode, /analogRead/);
  assert.match(picoPreview.pyCode, /ADC/);
  assert.match(espPreview.serialFirmware, /IOTQ/);

  // Waveform sampling
  const wave = session.sampleWaveform(customId, 50);
  assert.equal(wave.kind, 'input');
  assert.equal(wave.reading, 1200);
  assert.equal(wave.samples.length, 24);

  // Validation catches invalid range
  session.updateComponent(customId, { range: [2000, 400, 'ppm'] });
  assert.equal(session.check().length, 1);
  session.undo();
  assert.equal(session.check().length, 0);

  // Reset built-in
  session.resetComponent('ldr');
  assert.equal(session.isEdited('ldr'), false);
});

test('Curriculum & Code Coach Editor session: edit patterns, questions, custom Coach rules, and evaluate sandbox', () => {
  const session = new CurriculumSession();
  const baseCount = session.allTechniques().length;
  assert.ok(baseCount >= 10);

  // Edit built-in technique and comprehension question
  session.updateTechnique('hold', { title: 'Hold Timer Pattern' });
  assert.equal(session.getTechnique('hold').title, 'Hold Timer Pattern');
  assert.equal(session.isEditedTechnique('hold'), true);

  // Add custom technique
  const newKey = session.addCustomTechnique({
    title: 'Switch Debounce',
  });
  assert.equal(session.allTechniques().length, baseCount + 1);
  assert.ok(session.getTechnique(newKey).question.choices.length >= 2);

  // Add custom Code Coach diagnostic rule and evaluate in sandbox
  const tipId = session.addCoachTip({
    title: 'Avoid long blocking delay()',
    pattern: 'delay\\s*\\(\\s*6000\\s*\\)',
    language: 'cpp',
    severity: 'warning',
    message: 'A 6-second delay freezes sensor polling.',
  });
  assert.ok(tipId);

  const evalResult = session.evaluateSandbox({
    questIndex: 0,
    language: 'cpp',
    board: 'ESP32',
    code: 'void setup() {}\nvoid loop() {\n  delay(6000);\n}\n',
  });
  assert.ok(evalResult.steps.length > 0);
  assert.equal(evalResult.customMatches.length, 1);
  assert.equal(evalResult.customMatches[0].title, 'Avoid long blocking delay()');
  assert.ok(evalResult.comprehension.length > 0);

  // Undo & Redo
  session.undo();
  assert.equal(session.coachTips.length, 0);
  session.redo();
  assert.equal(session.coachTips.length, 1);
});

test('Climate & Soundscape Studio session: edit city climate, diurnal curve, weather presets, soundscape, and validate', () => {
  const session = new ClimateSession();

  // Edit Kyoto practice weather & thermal insulation
  session.setCityPractice('kyoto', 'outdoorTemp', 29);
  session.setCityPractice('kyoto', 'rain', 65);
  session.setCityThermal('kyoto', 'insulation', 1.45);
  assert.equal(session.isEdited('kyoto'), true);
  assert.equal(session.cityClimate('kyoto').practice.outdoorTemp, 29);
  assert.equal(session.cityClimate('kyoto').insulation, 1.45);

  // Compute 24-hour diurnal curve
  const curve = session.diurnalCurve('kyoto');
  assert.equal(curve.length, 25);
  const maxDaylight = Math.max(...curve.map((p) => p.light));
  const minDaylight = Math.min(...curve.map((p) => p.light));
  assert.ok(maxDaylight > minDaylight, 'Diurnal curve reflects day/night solar cycle');

  // Save as preset and apply to another city
  const preset = session.saveCityAsPreset('kyoto', 'Kyoto Summer Rain');
  assert.ok(preset.id);
  session.applyPresetToCity('brisbane', preset.id);
  assert.equal(session.cityClimate('brisbane').practice.outdoorTemp, 29);
  assert.equal(session.cityClimate('brisbane').practice.rain, 65);

  // Soundscape settings
  session.updateSoundscape({ rainGain: 0.75, chimeWaveform: 'sine' });
  assert.equal(session.soundscape.rainGain, 0.75);
  assert.equal(session.savedFile().soundscape.chimeWaveform, 'sine');

  // Validation catches out-of-range temperature
  session.setCityPractice('kyoto', 'outdoorTemp', 95);
  assert.equal(session.check().length, 1);
  session.undo();
  assert.equal(session.check().length, 0);
});
