import { tokenize } from './code-tokens.js';
// Static pin analysis shared by the serial plotter (thresholds) and editor diagnostics.
// It resolves pin numbers through constants, reading variables and MicroPython pin objects,
// and reports where each pin is set up, read or written, with source ranges for the editor.
const COMPARISONS = new Set(['<', '>', '<=', '>=', '==', '!=']),
  FLIP = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '==': '==', '!=': '!=' },
  C_READS = { analogRead: true, digitalRead: false },
  C_WRITES = new Set(['digitalWrite', 'analogWrite', 'ledcWrite', 'servoWrite']);

export function analyzeCode(code, language = 'cpp') {
  const tokens = tokenize(code, language).filter(
      (t) => t.type !== 'space' && t.type !== 'comment' && t.type !== 'newline',
    ),
    constants = new Map(),
    pinObjects = new Map(),
    readings = new Map(),
    uses = [],
    comparisons = [],
    lineOf = (t) => code.slice(0, t.start).split('\n').length,
    range = (from, to = from) => ({
      start: tokens[from].start,
      end: tokens[to].start + tokens[to].text.length,
      line: lineOf(tokens[from]),
    });
  // A numeric value at token i: a literal, a known constant, or a negated literal.
  const value = (i) => {
    const t = tokens[i];
    if (t?.type === 'number') return { value: Number(t.text), end: i };
    if (t?.type === 'word' && constants.has(t.text))
      return { value: constants.get(t.text), end: i, name: t.text };
    if (t?.text === '-' && tokens[i + 1]?.type === 'number')
      return { value: -Number(tokens[i + 1].text), end: i + 1 };
    return null;
  };
  // A reading source starting at token i: analogRead(p), digitalRead(p), obj.read(), or a
  // variable previously assigned from one of those.
  const source = (i) => {
    const t = tokens[i];
    if (!t || t.type !== 'word') return null;
    if (t.text in C_READS && tokens[i + 1]?.text === '(') {
      const v = value(i + 2);
      return v ? { pin: v.value, scale: 1, end: v.end + 1 } : null;
    }
    if (
      pinObjects.has(t.text) &&
      tokens[i + 1]?.text === '.' &&
      /^(read|read_u16|value)$/.test(tokens[i + 2]?.text) &&
      tokens[i + 3]?.text === '('
    )
      return {
        pin: pinObjects.get(t.text).pin,
        scale: tokens[i + 2].text === 'read_u16' ? 16 : 1,
        end: i + 4,
      };
    if (readings.has(t.text)) return { ...readings.get(t.text), end: i };
    return null;
  };
  // Pass 1: assignments define constants, pin objects and reading variables.
  for (let i = 0; i + 2 < tokens.length; i++) {
    const [name, eq] = [tokens[i], tokens[i + 1]];
    if (name.type !== 'word' || eq.text !== '=') continue;
    const v = value(i + 2);
    if (v && !/^[(.]$/.test(tokens[v.end + 1]?.text || '')) {
      if (!constants.has(name.text)) constants.set(name.text, v.value);
      continue;
    }
    let j = i + 2,
      kind = 'pin';
    if (/^(ADC|PWM)$/.test(tokens[j]?.text) && tokens[j + 1]?.text === '(') {
      kind = tokens[j].text.toLowerCase();
      j += 2;
    }
    if (tokens[j]?.text === 'Pin' && tokens[j + 1]?.text === '(') {
      const pin = value(j + 2);
      if (!pin) continue;
      // Pin(p, Pin.OUT) / Pin(p, Pin.IN): record the mode written after the pin number.
      const modeAt = pin.end + 1;
      const mode =
        tokens[modeAt]?.text === ',' && tokens[modeAt + 1]?.text === 'Pin'
          ? tokens[modeAt + 3]?.text || null
          : null;
      pinObjects.set(name.text, { pin: pin.value, kind, mode });
      uses.push({
        pin: pin.value,
        role: kind === 'adc' ? 'read' : kind === 'pwm' ? 'write' : 'mode',
        api: kind === 'pin' ? 'Pin' : tokens[i + 2].text,
        analog: kind === 'adc',
        mode,
        name: pin.name,
        ...range(j + 2, pin.end),
      });
      continue;
    }
    const s = source(i + 2);
    if (s && !readings.has(name.text)) readings.set(name.text, { pin: s.pin, scale: s.scale });
  }
  // Pass 2: calls and method uses.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'word') continue;
    if (tokens[i + 1]?.text === '(' && tokens[i - 1]?.text !== '.') {
      const pin = value(i + 2);
      if (!pin) continue;
      const at = range(i + 2, pin.end);
      if (t.text === 'pinMode') {
        const mode = tokens[pin.end + 2]?.text;
        uses.push({ pin: pin.value, role: 'mode', api: 'pinMode', mode, name: pin.name, ...at });
      } else if (t.text in C_READS)
        uses.push({
          pin: pin.value,
          role: 'read',
          api: t.text,
          analog: C_READS[t.text],
          name: pin.name,
          ...at,
        });
      else if (C_WRITES.has(t.text))
        uses.push({ pin: pin.value, role: 'write', api: t.text, name: pin.name, ...at });
    } else if (pinObjects.has(t.text) && tokens[i + 1]?.text === '.') {
      const object = pinObjects.get(t.text),
        method = tokens[i + 2]?.text;
      if (tokens[i + 3]?.text !== '(') continue;
      const noArgs = tokens[i + 4]?.text === ')';
      const role =
        method === 'read' || method === 'read_u16' || (method === 'value' && noArgs)
          ? 'read'
          : /^(value|on|off|duty|duty_u16)$/.test(method)
            ? 'write'
            : null;
      if (role)
        uses.push({
          pin: object.pin,
          role,
          api: t.text + '.' + method,
          analog: method === 'read' || method === 'read_u16',
          object,
          name: t.text,
          ...range(i, i + 2),
        });
    }
  }
  // Pass 3: comparisons between a reading and a number (either order).
  for (let i = 1; i < tokens.length; i++) {
    if (tokens[i].type !== 'operator' || !COMPARISONS.has(tokens[i].text)) continue;
    let op = tokens[i].text,
      limit = value(i + 1),
      left = i - 1;
    if (tokens[left]?.text === ')') {
      let depth = 0;
      for (; left >= 0; left--) {
        if (tokens[left].text === ')') depth++;
        else if (tokens[left].text === '(' && --depth === 0) break;
      }
      left = tokens[left - 2]?.text === '.' ? left - 3 : left - 1;
    }
    let reading = source(left),
      from = left,
      to = limit?.end;
    if (!reading || !limit) {
      const before = value(i - 1) || (tokens[i - 2]?.text === '-' ? value(i - 2) : null),
        after = source(i + 1);
      if (!before || !after) continue;
      from = tokens[i - 2]?.text === '-' && !value(i - 1) ? i - 2 : i - 1;
      to = after.end;
      [reading, limit, op] = [after, before, FLIP[op]];
    }
    const at = range(Math.max(0, from), to ?? i);
    comparisons.push({
      pin: reading.pin,
      scale: reading.scale,
      op,
      value: limit.value / reading.scale,
      raw: limit.value,
      text: code.slice(at.start, at.end),
      ...at,
    });
  }
  return { uses, comparisons, constants, pinObjects };
}
