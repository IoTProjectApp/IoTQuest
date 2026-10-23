// Component & Circuit Lab model: manages built-in component edits and custom IoT devices
// (saved in public/data/components.js), breadboard & GPIO pinout previews for ESP32 and
// Raspberry Pi Pico, live signal-to-ADC waveform calculation, and validation checks.
// Free of the DOM so it runs under Node in tests.
import { components as builtinComponents, defaults } from '../../../public/missions.js';
import { ADC_SIGNALS, ADC_SCALE, programReading } from '../../../public/signals.js';
import { readingRange } from '../../../public/diagnostics.js';
import { boardProgram } from '../../../public/hardware.js';

export const BOARDS = ['ESP32', 'Raspberry Pi Pico'];
export const AREAS = [
  'Garden path',
  'Plant beds',
  'Greenhouse',
  'Water tank',
  'Entrance',
  'Living room',
  'Kitchen',
  'Workshop',
  'Utility room',
  'Garage',
  'Roof',
];
export const RESISTOR_OPTIONS = [
  { value: '', label: 'None (Internal / Module)' },
  { value: '220 Ω', label: '220 Ω current-limiting' },
  { value: '330 Ω', label: '330 Ω current-limiting' },
  { value: '4.7 kΩ pull-up', label: '4.7 kΩ pull-up' },
  { value: '10 kΩ pull-down', label: '10 kΩ pull-down' },
  { value: '10 kΩ pull-up', label: '10 kΩ pull-up' },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class ComponentSession {
  constructor(saved = { version: 1, edits: {}, custom: [] }) {
    this.edits = clone(saved?.edits || {});
    this.custom = clone(saved?.custom || []);
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  snapshot() {
    return { edits: clone(this.edits), custom: clone(this.custom) };
  }

  commit(label, mutate, merge = null) {
    const before = this.snapshot();
    mutate();
    const after = this.snapshot();
    if (same(before, after)) return false;
    const top = this.undoStack.at(-1);
    if (!(merge && top?.merge === merge && !this.redoStack.length)) {
      this.undoStack.push({ label, state: before, merge });
    }
    this.redoStack = [];
    this.emit();
    return true;
  }

  undo() {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push({ label: entry.label, state: this.snapshot() });
    this.edits = entry.state.edits;
    this.custom = entry.state.custom;
    this.emit();
    return entry.label;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, state: this.snapshot() });
    this.edits = entry.state.edits;
    this.custom = entry.state.custom;
    this.emit();
    return entry.label;
  }

  // ---- Component Catalogue & Queries ----
  isBuiltin(id) {
    return builtinComponents.some((c) => c.id === id);
  }

  isEdited(id) {
    return Boolean(this.edits[id] && Object.keys(this.edits[id]).length > 0);
  }

  isCustom(id) {
    return this.custom.some((c) => c.id === id);
  }

  builtinSpec(id) {
    return builtinComponents.find((c) => c.id === id) || null;
  }

  allComponents() {
    const builtins = builtinComponents.map((base) => {
      const edit = this.edits[base.id] || {};
      return {
        ...clone(base),
        ...clone(edit),
        id: base.id,
        builtin: true,
        edited: this.isEdited(base.id),
      };
    });
    const customs = this.custom.map((c) => ({
      ...clone(c),
      builtin: false,
      custom: true,
    }));
    return [...builtins, ...customs];
  }

  getComponent(id) {
    return this.allComponents().find((c) => c.id === id) || null;
  }

  // ---- Mutations ----
  addCustomComponent({
    id = '',
    name = 'Custom Sensor',
    icon = '◈',
    output = false,
    analog = true,
    signal = 'customSignal',
    resistor = '',
    area = 'Workshop',
    range = [0, 100, '%'],
    desc = 'A custom calibrated IoT sensor designed in the Component & Circuit Lab.',
  } = {}) {
    let baseId =
      String(id || name)
        .trim()
        .replace(/[^a-zA-Z0-9]+/g, '')
        .replace(/^[0-9]+/, '') || 'customSensor';
    baseId = baseId[0].toLowerCase() + baseId.slice(1, 24);
    let finalId = baseId;
    let n = 2;
    const existingIds = new Set(this.allComponents().map((c) => c.id));
    while (existingIds.has(finalId)) finalId = `${baseId}${n++}`;

    const entry = {
      id: finalId,
      name: String(name || 'Custom Sensor').trim(),
      icon: String(icon || '◈').trim() || '◈',
      output: Boolean(output),
      analog: output ? false : Boolean(analog),
      signal: output ? undefined : String(signal || finalId).trim(),
      resistor: resistor || undefined,
      area: area || 'Workshop',
      range: Array.isArray(range) && range.length === 3 ? range : [0, 100, 'units'],
      desc: String(desc || '').trim(),
    };
    this.commit(`Add ${entry.name}`, () => {
      this.custom.push(entry);
    });
    return finalId;
  }

  updateComponent(id, patch = {}, merge = null) {
    const isBuilt = this.isBuiltin(id);
    if (!isBuilt && !this.isCustom(id)) return false;

    return this.commit(
      `Update ${id}`,
      () => {
        if (isBuilt) {
          const base = this.builtinSpec(id);
          const edit = (this.edits[id] ??= {});
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'id') continue;
            if (v === undefined || v === null || same(v, base[k])) {
              delete edit[k];
            } else {
              edit[k] = clone(v);
            }
          }
          if (!Object.keys(edit).length) delete this.edits[id];
        } else {
          const target = this.custom.find((c) => c.id === id);
          if (!target) return;
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'id') continue;
            if (v === undefined || v === '') delete target[k];
            else target[k] = clone(v);
          }
          if (target.output) {
            delete target.signal;
            delete target.analog;
          }
        }
      },
      merge,
    );
  }

  resetComponent(id) {
    if (!this.isBuiltin(id) || !this.edits[id]) return false;
    return this.commit(`Reset ${id}`, () => {
      delete this.edits[id];
    });
  }

  removeCustomComponent(id) {
    if (!this.isCustom(id)) return false;
    return this.commit(`Delete ${id}`, () => {
      this.custom = this.custom.filter((c) => c.id !== id);
    });
  }

  // ---- Circuit, Pinout & Signal Waveform Simulation ----
  circuitPreview(id, board = 'ESP32') {
    const comp = this.getComponent(id);
    if (!comp) return null;

    let wired;
    if (this.isBuiltin(id)) {
      wired = defaults([id], board)[0] || { ...comp, pin: board === 'ESP32' ? 26 : 16 };
      wired = { ...wired, ...comp };
    } else {
      const defaultPin = comp.output
        ? board === 'ESP32'
          ? 26
          : 15
        : comp.analog
          ? board === 'ESP32'
            ? 34
            : 26
          : board === 'ESP32'
            ? 27
            : 16;
      wired = {
        ...comp,
        pin: defaultPin,
        power: true,
        ground: true,
        resistorConnected: true,
      };
    }

    const vccLabel = board === 'ESP32' ? '3V3 (3.3 V)' : '3V3(OUT)';
    const adcBits = board === 'ESP32' ? '12-bit ADC (0–4095)' : '16-bit u16 scaled to 0–4095';
    const range = comp.range || readingRange(comp) || (comp.output ? [0, 1, 'state'] : [0, 1, '']);

    // Build sample code in C++ and MicroPython plus hardware serial link sketch
    const cppVar = (comp.output ? comp.id : comp.signal || comp.id) + 'Pin';
    const pyVar = comp.output ? comp.id : (comp.signal || comp.id) + '_sensor';

    const cppCode = comp.output
      ? `const int ${cppVar} = ${wired.pin};\n\nvoid setup() {\n  pinMode(${cppVar}, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(${cppVar}, HIGH);\n  delay(500);\n  digitalWrite(${cppVar}, LOW);\n  delay(500);\n}`
      : `const int ${cppVar} = ${wired.pin};\n\nvoid setup() {\n  Serial.begin(115200);\n${comp.analog ? '' : `  pinMode(${cppVar}, INPUT);\n`}}\n\nvoid loop() {\n  int reading = ${comp.analog ? 'analogRead' : 'digitalRead'}(${cppVar});\n  Serial.println(reading);\n  delay(200);\n}`;

    const pyCode = comp.output
      ? `from machine import Pin\nimport time\n\n${pyVar} = Pin(${wired.pin}, Pin.OUT)\n\nwhile True:\n    ${pyVar}.value(1)\n    time.sleep_ms(500)\n    ${pyVar}.value(0)\n    time.sleep_ms(500)`
      : comp.analog
        ? `from machine import Pin, ADC\nimport time\n\n${pyVar} = ADC(Pin(${wired.pin}))\n\nwhile True:\n    reading = ${board === 'ESP32' ? `${pyVar}.read()` : `${pyVar}.read_u16() * 4095 // 65535`}\n    print(reading)\n    time.sleep_ms(200)`
        : `from machine import Pin\nimport time\n\n${pyVar} = Pin(${wired.pin}, Pin.IN)\n\nwhile True:\n    reading = ${pyVar}.value()\n    print(reading)\n    time.sleep_ms(200)`;

    const serialFirmware = boardProgram([wired], board);

    return {
      board,
      component: comp,
      pin: wired.pin,
      vccLabel,
      gndLabel: 'GND',
      adcBits,
      resistor: comp.resistor || 'None required',
      range,
      cppCode,
      pyCode,
      serialFirmware,
    };
  }

  // Computes a 24-sample waveform and current reading for a stimulus percentage (0..100).
  sampleWaveform(id, stimulusPercent = 50) {
    const comp = this.getComponent(id);
    if (!comp) return null;
    const pct = Math.max(0, Math.min(100, Number(stimulusPercent) || 0));
    const voltage = Number(((pct / 100) * 3.3).toFixed(2));

    if (comp.output) {
      const high = pct >= 50 ? 1 : 0;
      const pwm255 = Math.round((pct / 100) * 255);
      const samples = Array.from({ length: 24 }, (_, i) => {
        const duty = pct / 100;
        return (i % 6) / 6 < duty ? 1 : 0;
      });
      return {
        kind: 'output',
        stimulusPercent: pct,
        voltage,
        digitalValue: high,
        pwmValue: pwm255,
        unit: 'PWM / Digital',
        samples,
      };
    }

    const isAdc = ADC_SIGNALS.includes(comp.signal);
    const range = comp.range || readingRange(comp) || (comp.analog ? [0, 4095, ''] : [0, 1, '']);
    const [lo, hi, unit] = range;

    let reading;
    if (!comp.analog && lo === 0 && hi === 1) {
      reading = pct >= 50 ? 1 : 0;
    } else if (isAdc) {
      reading = programReading(comp.signal, pct);
    } else {
      reading = Math.round((lo + (pct / 100) * (hi - lo)) * 10) / 10;
    }

    const samples = Array.from({ length: 24 }, (_, i) => {
      if (!comp.analog && lo === 0 && hi === 1) {
        return pct >= 50 ? 1 : 0;
      }
      const wave = Math.sin(i * 0.45) * 0.04 * (hi - lo);
      const val = Math.max(lo, Math.min(hi, reading + wave));
      return Number(val.toFixed(1));
    });

    return {
      kind: 'input',
      stimulusPercent: pct,
      voltage,
      reading,
      min: lo,
      max: hi,
      unit: unit || (isAdc ? 'ADC (0–4095)' : ''),
      samples,
    };
  }

  // ---- Validation Check ----
  check() {
    const problems = [];
    const add = (id, field, text, error = true) => problems.push({ id, field, text, error });

    for (const comp of this.allComponents()) {
      if (!comp.edited && !comp.custom) continue;
      if (!String(comp.name || '').trim()) {
        add(comp.id, 'name', 'Component name cannot be empty.');
      } else if (/[<>]/.test(comp.name)) {
        add(comp.id, 'name', 'Component name cannot contain < or >.');
      }
      if (!String(comp.desc || '').trim()) {
        add(comp.id, 'desc', 'Description cannot be empty.');
      } else if (/[<>]/.test(comp.desc)) {
        add(comp.id, 'desc', 'Description cannot contain < or >.');
      }
      if (!comp.output) {
        if (!String(comp.signal || '').trim()) {
          add(comp.id, 'signal', 'Sensor components must define a signal channel name.');
        } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(comp.signal)) {
          add(
            comp.id,
            'signal',
            'Signal channel must be a valid identifier (letters/numbers, starting with a letter).',
          );
        }
      }
      if (Array.isArray(comp.range)) {
        const [lo, hi] = comp.range;
        if (
          !Number.isFinite(Number(lo)) ||
          !Number.isFinite(Number(hi)) ||
          Number(lo) >= Number(hi)
        ) {
          add(comp.id, 'range', 'Minimum reading must be strictly less than maximum reading.');
        }
      }
    }
    return problems;
  }

  savedFile() {
    return {
      version: 1,
      edits: clone(this.edits),
      custom: clone(this.custom),
    };
  }
}
