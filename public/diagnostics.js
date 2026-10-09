import { analyzeCode } from './code-analysis.js';
import { ADC_SIGNALS as ADC_LIST } from './signals.js';
// Editor diagnostics: advisory checks of the program against the installed wiring.
// Warnings predict a runtime error or a condition that can never change; tips flag
// habits that matter on real hardware. Nothing here blocks Run.
const ADC_SIGNALS = new Set(ADC_LIST),
  DIGITAL_SIGNALS = new Set(['motion', 'door', 'armed', 'occupied', 'bay', 'pedRequest']),
  RANGES = {
    vibration: [0, 100, 'vibration units'],
    spaces: [0, 1, 'spaces'],
    temp: [-10, 50, '°C'],
    outdoorTemp: [-20, 50, '°C'],
    humidity: [0, 100, '%'],
    wind: [0, 300, 'km/h'],
    cloud: [0, 100, '% cloud cover'],
    distance: [0, 300, 'cm'],
  };

// The values a device can actually return to the program.
export function readingRange(device) {
  if (ADC_SIGNALS.has(device.signal)) return [0, 4095, ''];
  if (DIGITAL_SIGNALS.has(device.signal)) return [0, 1, ''];
  return RANGES[device.signal] || null;
}

const describe = (use) => (use.name ? use.name + ' (GPIO ' + use.pin + ')' : 'GPIO ' + use.pin);
const list = (devices) => devices.map((d) => d.name + ' (GPIO ' + d.pin + ')').join(', ');

// Whether `reading op value` can ever be true / ever be false for readings in [lo, hi].
function rangeVerdict(op, v, lo, hi, digital) {
  const never = {
      '<': v <= lo,
      '<=': v < lo,
      '>': v >= hi,
      '>=': v > hi,
      '==': v < lo || v > hi || (digital && v !== 0 && v !== 1),
      '!=': false,
    }[op],
    always = {
      '<': v > hi,
      '<=': v >= hi,
      '>': v < lo,
      '>=': v <= lo,
      '==': false,
      '!=': v < lo || v > hi || (digital && v !== 0 && v !== 1),
    }[op];
  return never ? 'never' : always ? 'always' : null;
}

export function diagnose(code, language, devices = []) {
  const { uses, comparisons } = analyzeCode(code, language),
    out = [],
    seen = new Set(),
    byPin = new Map(devices.map((d) => [Number(d.pin), d])),
    referenced = new Set(uses.map((u) => u.pin));
  // One report per rule and site; a named constant or a pin's setup is reported once,
  // since fixing it in one place fixes every use.
  const add = (severity, rule, at, message, once = null) => {
    const key = rule + ':' + (once ?? (at.name ? 'name:' + at.name : at.start));
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ severity, rule, line: at.line, start: at.start, end: at.end, message });
  };
  for (const use of uses) {
    const device = byPin.get(use.pin);
    if (!device) {
      if (!devices.length) continue; // nothing installed yet: the steps panel covers this
      const direction =
          use.role === 'mode' && use.mode ? (/^OUT/.test(use.mode) ? 'write' : 'read') : use.role,
        wanted = devices.filter((d) =>
          direction === 'write' ? d.output : direction === 'read' ? !d.output : true,
        ),
        unused = wanted.filter((d) => !referenced.has(Number(d.pin))),
        preferred = use.analog ? unused.filter((d) => d.analog) : unused,
        hint = (preferred.length ? preferred : unused).slice(0, 2);
      add(
        'warning',
        'unconnected-pin',
        use,
        describe(use) +
          " isn't connected to an installed component." +
          (hint.length
            ? ' Did you mean ' + list(hint) + '? Pin numbers must match the Wiring panel.'
            : ' Install a component on this pin in Wiring, or change the number.'),
      );
      continue;
    }
    if (use.role === 'write' && !device.output)
      add(
        'warning',
        'write-to-input',
        use,
        device.name +
          ' on GPIO ' +
          use.pin +
          ' is a sensor, so it cannot be written to.' +
          (devices.some((d) => d.output)
            ? ' Outputs: ' + list(devices.filter((d) => d.output)) + '.'
            : ''),
      );
    // MicroPython value() on an output returns the level it drives, so only flag real reads.
    if (use.role === 'read' && device.output && !/\.value$/.test(use.api))
      add(
        'warning',
        'read-from-output',
        use,
        device.name + ' on GPIO ' + use.pin + ' is an output, so it has no reading.',
      );
    if (use.role === 'read' && !device.output && use.analog && DIGITAL_SIGNALS.has(device.signal))
      add(
        'info',
        'analog-on-digital',
        use,
        device.name +
          ' is digital and only reads 0 or 1. ' +
          (language === 'cpp' ? 'Use digitalRead().' : 'Use Pin(' + use.pin + ', Pin.IN).value().'),
      );
  }
  // Outputs written without being configured as outputs.
  for (const use of uses.filter((u) => u.role === 'write' && byPin.get(u.pin)?.output)) {
    if (language === 'cpp') {
      const modes = uses.filter((u) => u.api === 'pinMode' && u.pin === use.pin);
      if (!modes.some((u) => u.mode === 'OUTPUT'))
        add(
          'warning',
          'missing-pinmode',
          use,
          describe(use) +
            (modes.length ? ' is set to ' + modes[0].mode : ' is never set up') +
            '. Add pinMode(' +
            (use.name || use.pin) +
            ', OUTPUT); in setup() before writing to it.',
          'pin:' + use.pin,
        );
    } else if (use.object?.kind === 'pin' && use.object.mode !== 'OUT')
      add(
        'info',
        'missing-pin-out',
        use,
        'Create ' +
          use.api.split('.')[0] +
          ' with Pin(' +
          use.pin +
          ', Pin.OUT) so it drives the output on real hardware.',
        'pin:' + use.pin,
      );
  }
  // Comparisons that can never change because the sensor cannot reach the threshold.
  for (const c of comparisons) {
    const device = byPin.get(c.pin);
    if (!device || device.output) continue;
    const range = readingRange(device);
    if (!range) continue;
    const [lo, hi, unit] = range,
      verdict = rangeVerdict(c.op, c.value, lo, hi, DIGITAL_SIGNALS.has(device.signal));
    if (!verdict) continue;
    const scale = c.scale > 1 ? ' (' + lo * c.scale + '–' + hi * c.scale + ' with read_u16)' : '';
    add(
      'warning',
      'threshold-range',
      c,
      device.name +
        ' reads ' +
        lo +
        '–' +
        hi +
        unit +
        scale +
        ', so ' +
        c.text +
        ' is ' +
        verdict +
        ' true.' +
        (ADC_SIGNALS.has(device.signal) || !unit
          ? ''
          : ' This channel is calibrated in ' + unit + ', not raw ADC counts.'),
    );
  }
  return out.sort((a, b) => a.start - b.start);
}
