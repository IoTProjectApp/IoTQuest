// Climate & Soundscape Studio model: manages city practice climate profiles, extreme weather
// presets, 24-hour diurnal solar & temperature curves, and procedural WebAudio soundscape synth
// parameters (saved in public/data/climate.js). Free of the DOM so it runs under Node in tests.
import { locations, locationById } from '../../../public/locations.js';
import { calculateSky } from '../../../public/astronomy.js';

export { locations, locationById };

export const DEFAULT_SOUNDSCAPE = {
  rainGain: 0.45,
  windGain: 0.38,
  ambientPitchHz: 220,
  buzzerFreqHz: 880,
  pumpHumHz: 110,
  chimeWaveform: 'triangle', // 'sine' | 'triangle' | 'square' | 'sawtooth'
};

export const BUILTIN_WEATHER_PRESETS = [
  {
    id: 'preset-fair',
    name: 'Clear Temperate Day',
    practice: {
      outdoorTemp: 23,
      humidity: 52,
      cloud: 20,
      wind: 12,
      rain: 0,
      light: 82,
      soil: 40,
      tank: 80,
    },
  },
  {
    id: 'preset-monsoon',
    name: 'Monsoon Downpour',
    practice: {
      outdoorTemp: 25,
      humidity: 94,
      cloud: 95,
      wind: 38,
      rain: 85,
      light: 22,
      soil: 88,
      tank: 98,
    },
  },
  {
    id: 'preset-heatwave',
    name: 'Arid Heatwave & Drought',
    practice: {
      outdoorTemp: 39,
      humidity: 18,
      cloud: 5,
      wind: 14,
      rain: 0,
      light: 96,
      soil: 12,
      tank: 32,
    },
  },
  {
    id: 'preset-frost',
    name: 'Sub-Zero Alpine Frost',
    practice: {
      outdoorTemp: -4,
      humidity: 68,
      cloud: 60,
      wind: 26,
      rain: 15,
      light: 48,
      soil: 45,
      tank: 70,
    },
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const round = (v, p = 2) => Math.round((Number(v) || 0) * 10 ** p) / 10 ** p;

export class ClimateSession {
  constructor(saved = { version: 1, cities: {}, presets: [], soundscape: {} }) {
    this.cities = clone(saved?.cities || {});
    this.presets = clone(saved?.presets || []);
    this.soundscape = { ...DEFAULT_SOUNDSCAPE, ...clone(saved?.soundscape || {}) };
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
    return {
      cities: clone(this.cities),
      presets: clone(this.presets),
      soundscape: clone(this.soundscape),
    };
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
    this.cities = entry.state.cities;
    this.presets = entry.state.presets;
    this.soundscape = entry.state.soundscape;
    this.emit();
    return entry.label;
  }

  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push({ label: entry.label, state: this.snapshot() });
    this.cities = entry.state.cities;
    this.presets = entry.state.presets;
    this.soundscape = entry.state.soundscape;
    this.emit();
    return entry.label;
  }

  // ---- City Climate Profile ----
  isEdited(cityId) {
    return Boolean(this.cities[cityId] && Object.keys(this.cities[cityId]).length > 0);
  }

  originalClimate(cityId) {
    const loc = locationById(cityId) || locations[0];
    return {
      insulation: loc.insulation ?? 1.0,
      shade: loc.shade ?? 0.4,
      practice: clone(
        loc.practice || {
          outdoorTemp: 22,
          humidity: 55,
          cloud: 30,
          wind: 12,
          rain: 0,
          light: 75,
          soil: 35,
          tank: 75,
        },
      ),
    };
  }

  cityClimate(cityId) {
    const base = this.originalClimate(cityId);
    const own = this.cities[cityId] || {};
    return {
      insulation: own.insulation ?? base.insulation,
      shade: own.shade ?? base.shade,
      practice: {
        ...base.practice,
        ...(own.practice || {}),
      },
    };
  }

  setCityPractice(cityId, field, value, merge = null) {
    const base = this.originalClimate(cityId);
    return this.commit(
      `Update ${cityId} ${field}`,
      () => {
        const entry = (this.cities[cityId] ??= {});
        entry.practice ??= {};
        const num = round(value, 1);
        if (num === base.practice[field]) {
          delete entry.practice[field];
        } else {
          entry.practice[field] = num;
        }
        if (!Object.keys(entry.practice).length) delete entry.practice;
        if (!Object.keys(entry).length) delete this.cities[cityId];
      },
      merge,
    );
  }

  setCityThermal(cityId, field, value, merge = null) {
    if (!['insulation', 'shade'].includes(field)) return false;
    const base = this.originalClimate(cityId);
    return this.commit(
      `Update ${cityId} ${field}`,
      () => {
        const entry = (this.cities[cityId] ??= {});
        const num = round(value, 2);
        if (num === base[field]) delete entry[field];
        else entry[field] = num;
        if (!Object.keys(entry).length) delete this.cities[cityId];
      },
      merge,
    );
  }

  applyPresetToCity(cityId, presetId) {
    const all = [...BUILTIN_WEATHER_PRESETS, ...this.presets];
    const preset = all.find((p) => p.id === presetId);
    if (!preset) return false;
    const base = this.originalClimate(cityId);
    return this.commit(`Apply preset ${preset.name} to ${cityId}`, () => {
      const entry = (this.cities[cityId] ??= {});
      entry.practice = {};
      for (const [k, v] of Object.entries(preset.practice)) {
        if (v !== base.practice[k]) entry.practice[k] = v;
      }
      if (!Object.keys(entry.practice).length) delete entry.practice;
      if (!Object.keys(entry).length) delete this.cities[cityId];
    });
  }

  resetCity(cityId) {
    if (!this.cities[cityId]) return false;
    return this.commit(`Reset ${cityId} climate`, () => {
      delete this.cities[cityId];
    });
  }

  // ---- Weather Presets ----
  allPresets() {
    return [
      ...BUILTIN_WEATHER_PRESETS.map((p) => ({ ...clone(p), builtin: true })),
      ...this.presets.map((p) => ({ ...clone(p), builtin: false })),
    ];
  }

  saveCityAsPreset(cityId, name = 'Custom Weather Preset') {
    const climate = this.cityClimate(cityId);
    const id = 'custom-preset-' + (this.presets.length + 1) + '-' + (Date.now() % 10000);
    const preset = {
      id,
      name: String(name || 'Custom Weather Preset').trim(),
      practice: clone(climate.practice),
    };
    this.commit(`Save preset ${preset.name}`, () => {
      this.presets.push(preset);
    });
    return preset;
  }

  removePreset(presetId) {
    return this.commit('Remove weather preset', () => {
      this.presets = this.presets.filter((p) => p.id !== presetId);
    });
  }

  // ---- Soundscape Settings ----
  updateSoundscape(patch = {}, merge = null) {
    return this.commit(
      'Update soundscape settings',
      () => {
        Object.assign(this.soundscape, clone(patch));
      },
      merge,
    );
  }

  // ---- 24-Hour Diurnal Solar & Temperature Curve ----
  diurnalCurve(cityId) {
    const loc = locationById(cityId) || locations[0];
    const climate = this.cityClimate(cityId);
    const p = climate.practice;
    const points = [];

    for (let hour = 0; hour <= 24; hour++) {
      // Equinox reference date adjusted by longitude
      const utcMs = Date.UTC(2026, 2, 20, 0) + (hour - (loc.longitude || 0) / 15) * 3600000;
      const sky = calculateSky(new Date(utcMs), {
        latitude: loc.latitude || 0,
        longitude: loc.longitude || 0,
      });
      const sunAltDeg = round((sky.sun.altitude * 180) / Math.PI, 1);
      const solarFactor = Math.max(0, Math.sin(sky.sun.altitude));
      const cloudAttenuation = 1 - (p.cloud || 0) / 140;
      const light = Math.round(
        Math.min(100, (p.light || 80) * solarFactor * cloudAttenuation + (solarFactor > 0 ? 6 : 2)),
      );

      // Diurnal temperature wave peaking around 14:30 local time
      const tempWave = Math.sin(((hour - 8.5) / 24) * Math.PI * 2);
      const swing = 4.5 * (1 - (p.cloud || 0) / 160);
      const outdoorTemp = round((p.outdoorTemp ?? 22) + tempWave * swing, 1);
      const indoorTemp = round(
        outdoorTemp - tempWave * swing * Math.min(0.75, (climate.insulation || 1) * 0.35),
        1,
      );
      const humidity = Math.round(Math.max(10, Math.min(100, (p.humidity ?? 55) - tempWave * 10)));

      points.push({
        hour,
        sunAltDeg,
        light,
        outdoorTemp,
        indoorTemp,
        humidity,
      });
    }
    return points;
  }

  // ---- Validation Check ----
  check() {
    const problems = [];
    const add = (city, field, text, error = true) => problems.push({ city, field, text, error });

    for (const [cityId, entry] of Object.entries(this.cities)) {
      if (!locationById(cityId)) {
        add(cityId, null, `Unknown city "${cityId}".`);
        continue;
      }
      const p = entry.practice || {};
      if (p.outdoorTemp !== undefined && (p.outdoorTemp < -35 || p.outdoorTemp > 58)) {
        add(cityId, 'outdoorTemp', 'Outdoor temperature must be between -35 °C and 58 °C.');
      }
      for (const pctField of ['humidity', 'cloud', 'rain', 'light', 'soil', 'tank']) {
        if (p[pctField] !== undefined && (p[pctField] < 0 || p[pctField] > 100)) {
          add(cityId, pctField, `${pctField} must be between 0% and 100%.`);
        }
      }
      if (p.wind !== undefined && (p.wind < 0 || p.wind > 220)) {
        add(cityId, 'wind', 'Wind speed must be between 0 and 220 km/h.');
      }
      if (entry.insulation !== undefined && (entry.insulation < 0.2 || entry.insulation > 3.0)) {
        add(cityId, 'insulation', 'Insulation factor must be between 0.2 and 3.0.');
      }
      if (entry.shade !== undefined && (entry.shade < 0 || entry.shade > 1)) {
        add(cityId, 'shade', 'Shade factor must be between 0.0 and 1.0.');
      }
    }
    return problems;
  }

  savedFile() {
    const cleanSound = {};
    for (const [k, v] of Object.entries(this.soundscape)) {
      if (!same(v, DEFAULT_SOUNDSCAPE[k])) cleanSound[k] = v;
    }
    return {
      version: 1,
      cities: clone(this.cities),
      presets: clone(this.presets),
      soundscape: cleanSound,
    };
  }
}
