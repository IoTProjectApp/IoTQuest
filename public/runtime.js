import { SimulatedBroker } from './mqtt.js';
import { ADC_SIGNALS, ADC_SCALE } from './signals.js';
// A bounded AST interpreter. No eval, Function constructor, or host-object access.
const MAX_NESTING = 100,
  MAX_CALL_DEPTH = 30;
export function pythonToC(source) {
  const out = [],
    stack = [0];
  let originalLine = 0;
  for (const raw of source.replace(/\r/g, '').split('\n')) {
    originalLine++;
    try {
      if (!raw.trim() || raw.trim().startsWith('#')) continue;
      const indent = raw.match(/^ */)[0].length;
      if (raw.includes('\t')) throw Error('Use spaces, not tabs, for Python indentation.');
      let line = raw.trim();
      let quote = null,
        cut = -1;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '\\') {
          i++;
          continue;
        }
        if (quote) {
          if (line[i] === quote) quote = null;
        } else if (line[i] === '\"' || line[i] === "'") quote = line[i];
        else if (line[i] === '#') {
          cut = i;
          break;
        }
      }
      if (cut >= 0) line = line.slice(0, cut).trim();
      if (
        /^(from machine import (Pin|ADC|PWM)(,\s*(Pin|ADC|PWM))*|import time|from time import (sleep|sleep_ms|ticks_ms)(,\s*(sleep|sleep_ms|ticks_ms))*)$/.test(
          line,
        )
      )
        continue;
      if (
        /^from iotquest import (mqttConnect|mqttPublish|mqttSubscribe|mqttRead|mqttConnected|mqttReconnect|mqttLastDelivery)(,\s*(mqttConnect|mqttPublish|mqttSubscribe|mqttRead|mqttConnected|mqttReconnect|mqttLastDelivery))*$/.test(
          line,
        )
      )
        continue;
      if (/^(import |from )/.test(line))
        throw Error('Supported imports: machine Pin, ADC, PWM and time.');
      while (indent < stack.at(-1)) {
        stack.pop();
        out.push('}');
      }
      if (indent !== stack.at(-1))
        throw Error('Unexpected indentation. Use four spaces inside a block.');
      if (indent > 0 && /^def\b/.test(line))
        throw Error('Functions must be defined at top level, not inside another block.');
      // `not` stays a keyword so the parser can give it Python's lower precedence.
      line = line.replace(
        /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:True|False|and|or)\b/g,
        (t) => ({ True: 'true', False: 'false', and: '&&', or: '||' })[t] || t,
      );
      out.push('// @line ' + originalLine);
      if (line.endsWith(':')) {
        if (/^if /.test(line)) out.push('if (' + line.slice(3, -1) + ') {');
        else if (/^elif /.test(line)) out.push('else if (' + line.slice(5, -1) + ') {');
        else if (line === 'else:') out.push('else {');
        else if (/^while /.test(line)) out.push('while (' + line.slice(6, -1) + ') {');
        else if (/^def \w+\(.*\):$/.test(line)) out.push('void ' + line.slice(4, -1) + ' {');
        else throw Error('Unsupported Python block. Use if, elif, else, while, or def.');
        stack.push(indent + 4);
      } else out.push(line + ';');
    } catch (error) {
      error.line ??= originalLine;
      throw error;
    }
  }
  while (stack.length > 1) {
    stack.pop();
    out.push('}');
  }
  return out.join('\n');
}
const cTokens =
  /\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?:\d+(?:\.\d+)?)|(?:[A-Za-z_]\w*)|(?:==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=)|[{}();,.+\-*/%<>=!]/gy;
// Python source arrives through pythonToC: `#` comments are already removed and only
// `// @line N` annotations remain, so `//` is the floor-division operator.
const pythonTokens =
  /\s+|\/\/ @line \d+|(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(?:\d+(?:\.\d+)?)|(?:[A-Za-z_]\w*)|(?:==|!=|<=|>=|&&|\|\||\/\/|\+=|-=)|[{}();,.+\-*/%<>=!]/gy;
function tokenize(source, python = false) {
  const tokens = [],
    lines = [];
  let line = 1,
    mapped = false;
  const re = python ? pythonTokens : cTokens;
  let at = 0;
  while (at < source.length) {
    re.lastIndex = at;
    let m = re.exec(source);
    if (!m) {
      const e = Error('Unsupported syntax near: ' + source.slice(at, at + 35));
      e.line = line;
      throw e;
    }
    at = re.lastIndex;
    const annotation = m[0].match(/^\/\/ @line (\d+)/);
    if (annotation) {
      line = Number(annotation[1]);
      mapped = true;
    }
    const comment = annotation || (!python && (m[0].startsWith('//') || m[0].startsWith('/*')));
    if (!/^\s+$/.test(m[0]) && !comment) {
      tokens.push(m[0]);
      lines.push(line);
    }
    if (!mapped) line += (m[0].match(/\n/g) || []).length;
  }
  tokens.push('<end>');
  lines.push(line);
  tokens.lines = lines;
  return tokens;
}
const types = new Set([
  'int',
  'float',
  'double',
  'bool',
  'long',
  'short',
  'unsigned',
  'signed',
  'const',
  'static',
  'volatile',
  'void',
  'auto',
  'byte',
  'size_t',
  'uint8_t',
  'int8_t',
  'uint16_t',
  'int16_t',
  'uint32_t',
  'int32_t',
]);
// Maps the words of a C declaration to a storage kind used to apply integer semantics.
function valueType(words) {
  const has = (...names) => names.some((name) => words.includes(name));
  if (has('float', 'double')) return 'float';
  if (has('bool')) return 'bool';
  if (has('byte', 'uint8_t')) return 'u8';
  if (has('int8_t')) return 's8';
  if (has('uint16_t') || (has('unsigned') && has('short'))) return 'u16';
  if (has('short', 'int16_t')) return 's16';
  if (has('unsigned', 'uint32_t', 'size_t')) return 'u32';
  if (has('int', 'long', 'signed', 'int32_t')) return 's32';
  return null;
}
// Integer variables truncate toward zero and wrap like 32-bit ESP32/Pico integers.
function coerce(type, value) {
  if (!type || type === 'float' || type === 'bool') return value;
  const n = Math.trunc(Number(value)) || 0;
  if (type === 'u8') return n & 0xff;
  if (type === 's8') return (n << 24) >> 24;
  if (type === 'u16') return n & 0xffff;
  if (type === 's16') return (n << 16) >> 16;
  if (type === 'u32') return n >>> 0;
  return n | 0;
}
const escapes = { n: '\n', t: '\t', r: '\r', 0: '\0', '\\': '\\', '"': '"', "'": "'" };
const unescape = (text) =>
  text.replace(/\\(.)/gs, (all, c) => (Object.hasOwn(escapes, c) ? escapes[c] : all));
const precedence = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '//': 6,
  '%': 6,
};
class Parser {
  constructor(s, python = false) {
    this.python = python;
    this.ts = tokenize(s, python);
    this.i = 0;
    this.nesting = 0;
  }
  peek() {
    return this.ts[this.i];
  }
  take() {
    return this.ts[this.i++];
  }
  fail(message) {
    const e = Error(message);
    e.line = this.ts.lines[Math.min(this.i, this.ts.lines.length - 1)];
    throw e;
  }
  enter() {
    if (++this.nesting > MAX_NESTING)
      this.fail(
        'Code is nested too deeply (limit ' +
          MAX_NESTING +
          ' levels). Simplify this expression or block.',
      );
  }
  want(t) {
    if (this.take() !== t) {
      const e = Error('Expected “' + t + '” near token ' + this.i);
      e.line = this.ts.lines[Math.max(0, this.i - 1)];
      throw e;
    }
  }
  expr(min = 0) {
    this.enter();
    const n = this.readExpr(min);
    this.nesting--;
    return n;
  }
  readExpr(min) {
    let t = this.take(),
      n;
    if (t === '(') {
      n = this.expr();
      this.want(')');
    } else if (this.python && t === 'not')
      // Python: `not` binds looser than comparisons but tighter than and/or.
      n = { kind: 'unary', op: '!', value: this.expr(precedence['==']) };
    else if (['!', '-', '+'].includes(t)) n = { kind: 'unary', op: t, value: this.expr(7) };
    else if (/^\d/.test(t)) n = { kind: 'literal', value: Number(t), float: t.includes('.') };
    else if (/^['"]/.test(t)) n = { kind: 'literal', value: unescape(t.slice(1, -1)) };
    else if (/^[A-Za-z_]\w*$/.test(t)) n = { kind: 'name', name: t };
    else throw Error('Expected a value, found ' + t);
    while (true) {
      if (this.peek() === '.') {
        this.take();
        n = { kind: 'member', obj: n, name: this.take() };
        continue;
      }
      if (this.peek() === '(') {
        this.take();
        const args = [];
        if (this.peek() !== ')')
          do {
            args.push(this.expr());
            if (this.peek() !== ',') break;
            this.take();
          } while (true);
        this.want(')');
        n = { kind: 'call', fn: n, args };
        continue;
      }
      let op = this.peek(),
        p = Object.hasOwn(precedence, op) ? precedence[op] : 0;
      if (!p || p < min) break;
      this.take();
      n = { kind: 'binary', op, left: n, right: this.expr(p + 1) };
    }
    return n;
  }
  block() {
    this.want('{');
    let a = [];
    while (this.peek() !== '}') {
      if (this.peek() === '<end>') throw Error('Missing closing brace.');
      a.push(this.statement());
    }
    this.want('}');
    return a;
  }
  body() {
    return this.peek() === '{' ? this.block() : [this.statement()];
  }
  statement() {
    const line = this.ts.lines[this.i];
    this.enter();
    const node = this.readStatement();
    this.nesting--;
    return { ...node, line };
  }
  name() {
    const name = this.take();
    if (!/^[A-Za-z_]\w*$/.test(name) || types.has(name))
      this.fail('Expected a variable or function name, found ' + name);
    return name;
  }
  readStatement() {
    let t = this.peek();
    if (t === ';') {
      this.take();
      return { kind: 'noop' };
    }
    if (this.python && t === 'pass') {
      this.take();
      this.want(';');
      return { kind: 'noop' };
    }
    if (this.python && t === 'global') {
      this.take();
      const names = [this.name()];
      while (this.peek() === ',') {
        this.take();
        names.push(this.name());
      }
      this.want(';');
      return { kind: 'global', names };
    }
    if (t === 'if' || t === 'while') {
      this.take();
      this.want('(');
      const cond = this.expr();
      this.want(')');
      const body = this.body();
      let other = [];
      if (t === 'if' && this.peek() === 'else') {
        this.take();
        other = this.body();
      }
      return { kind: t, cond, body, other };
    }
    if (t === 'return') {
      this.take();
      let value = this.peek() === ';' ? null : this.expr();
      this.want(';');
      return { kind: 'return', value };
    }
    // Python has no declarations; `void` is only produced by pythonToC for `def`.
    if (this.python ? t === 'void' : types.has(t)) {
      const words = [];
      while (types.has(this.peek())) words.push(this.take());
      const name = this.name();
      if (this.peek() === '(') {
        if (this.nesting > 1) this.fail('Functions must be defined at top level.');
        this.take();
        const params = [],
          paramTypes = [];
        while (this.peek() !== ')') {
          const paramWords = [];
          while (types.has(this.peek())) paramWords.push(this.take());
          params.push(this.name());
          paramTypes.push(valueType(paramWords));
          if (this.peek() !== ',') break;
          this.take();
        }
        this.want(')');
        return {
          kind: 'function',
          name,
          params,
          paramTypes,
          vtype: valueType(words),
          body: this.block(),
        };
      }
      let value = { kind: 'literal', value: 0 };
      if (this.peek() === '=') {
        this.take();
        value = this.expr();
      }
      this.want(';');
      return { kind: 'declare', name, value, vtype: valueType(words) };
    }
    const n = this.expr();
    if (['=', '+=', '-=', '++', '--'].includes(this.peek())) {
      const op = this.take();
      if (n.kind !== 'name') throw Error('Assignments need a variable name.');
      let value = ['++', '--'].includes(op) ? { kind: 'literal', value: 1 } : this.expr();
      if (op !== '=')
        value = { kind: 'binary', op: op.startsWith('+') ? '+' : '-', left: n, right: value };
      this.want(';');
      return { kind: 'assign', name: n.name, value };
    }
    this.want(';');
    return { kind: 'expression', value: n };
  }
  parse() {
    const a = [];
    try {
      while (this.peek() !== '<end>') a.push(this.statement());
    } catch (error) {
      error.line ??= this.ts.lines[Math.min(Math.max(0, this.i - 1), this.ts.lines.length - 1)];
      throw error;
    }
    return a;
  }
}
// Python: parameters and names assigned in a def are local unless declared `global`.
function pythonLocals(fn) {
  const assigned = new Set(fn.params),
    globals = new Set();
  const walk = (nodes) => {
    for (const n of nodes)
      if (n.kind === 'assign') assigned.add(n.name);
      else if (n.kind === 'global') n.names.forEach((name) => globals.add(name));
      else if (n.kind === 'if' || n.kind === 'while') {
        walk(n.body);
        walk(n.other);
      }
  };
  walk(fn.body);
  for (const name of globals) assigned.delete(name);
  return assigned;
}
const isForever = (cond) =>
  (cond.kind === 'name' && cond.name === 'true') || (cond.kind === 'literal' && !!cond.value);
const numeric = (v) => (typeof v === 'boolean' ? Number(v) : v);
const pinConstants = { IN: 0, OUT: 1, PULL_UP: 2, PULL_DOWN: 3 };
// Internal events produced by the statement executor. DELAY suspends the program until the
// next tick; STEP marks a debugger pause point.
const DELAY = { type: 'delay' },
  STEP = { type: 'step' };
export class Runtime {
  constructor(code, language, devices = [], board = 'ESP32') {
    if (code.length > 30000) throw Error('Code limit: 30,000 characters.');
    this.python = language === 'python';
    this.ast = new Parser(this.python ? pythonToC(code) : code, this.python).parse();
    this.language = language;
    this.devices = devices;
    this.board = board;
    this.vars = new Map();
    this.types = new Map();
    this.functions = new Map();
    this.outputs = {};
    this.inputs = {};
    this.outputKinds = {};
    this.logs = [];
    this.pendingLine = ''; // Serial.print text waiting for a line ending
    this.printed = 0; // completed serial lines since start, for the plotter
    this.time = 0;
    this.env = {};
    this.budget = 20000;
    this.modes = new Map();
    this.constants = {
      HIGH: 1,
      LOW: 0,
      INPUT: 0,
      OUTPUT: 1,
      INPUT_PULLUP: 2,
      true: true,
      false: false,
    };
    for (const n of this.ast)
      if (n.kind === 'function') {
        if (this.python) n.locals = pythonLocals(n);
        this.functions.set(n.name, n);
      }
    if (this.python) {
      // Top-level statements run in source order up to the main loop, like real Python.
      const loops = this.ast.filter((n) => n.kind === 'while');
      this.mainLoop = loops.find((n) => isForever(n.cond)) || loops[0] || null;
      const end = this.mainLoop ? this.ast.indexOf(this.mainLoop) : this.ast.length;
      this.prelude = this.ast.slice(0, end).filter((n) => n.kind !== 'function');
    } else this.prelude = this.ast.filter((n) => n.kind !== 'function');
    this.initialized = false;
    this.broker = new SimulatedBroker();
    this.clientId = 'controller';
    this.currentLine = 1;
    this.task = null;
    this.midTick = false;
    this.tick = 0;
    this.scope = null;
    this.depth = 0;
    this.yielded = false;
    this.debug = false;
  }
  sensor(pin) {
    const d = this.devices.find((d) => d.pin === Number(pin));
    if (!d) throw Error('GPIO ' + pin + ' is not connected. Open Wiring.');
    if (d.power === false || d.ground === false)
      throw Error(d.name + ': disconnected power or ground.');
    if (d.output) throw Error(d.name + ' is an output, not a sensor.');
    let v = Number(d.faultValue ?? this.env[d.signal] ?? 0);
    if (ADC_SIGNALS.includes(d.signal)) v = Math.round(v * ADC_SCALE);
    this.inputs[d.pin] = v;
    return v;
  }
  write(pin, value, kind = 'digital') {
    pin = Number(pin);
    const d = this.devices.find((d) => d.pin === pin);
    if (!d || !d.output) throw Error('GPIO ' + pin + ' needs a connected actuator.');
    if (this.language === 'cpp' && this.modes.get(pin) !== 1)
      throw Error('Set GPIO ' + pin + ' to OUTPUT in setup().');
    if (d.power === false || d.ground === false)
      throw Error(d.name + ': disconnected power or ground.');
    const number = Number(value);
    if (!Number.isFinite(number)) throw Error('GPIO output must be a finite number.');
    this.outputKinds[pin] = kind;
    this.outputs[pin] = Math.max(0, Math.min(65535, number));
  }
  // Variable scopes: C frames/blocks are { vars, types, parent }; Python frames are
  // { vars, locals }. `null` is the global scope.
  read(name, s) {
    for (let sc = s; sc; sc = sc.parent) if (sc.vars.has(name)) return sc.vars.get(name);
    if (s?.locals?.has(name))
      throw Error(
        'Local variable ' +
          name +
          ' is used before it is assigned. Add “global ' +
          name +
          '” inside the function to change the global variable.',
      );
    if (this.vars.has(name)) return this.vars.get(name);
    if (Object.hasOwn(this.constants, name)) return this.constants[name];
    throw Error('Unknown variable: ' + name);
  }
  assign(name, value, s) {
    if (this.python) {
      (s?.locals.has(name) ? s.vars : this.vars).set(name, value);
      return;
    }
    for (let sc = s; sc; sc = sc.parent)
      if (sc.vars.has(name)) {
        sc.vars.set(name, coerce(sc.types.get(name), value));
        return;
      }
    this.vars.set(name, coerce(this.types.get(name), value));
  }
  declare(name, type, value, s) {
    const target = s || { vars: this.vars, types: this.types };
    target.types.set(name, type);
    target.vars.set(name, coerce(type, value));
  }
  declaredType(name, s) {
    for (let sc = s; sc; sc = sc.parent) if (sc.vars.has(name)) return sc.types.get(name);
    return this.types.get(name);
  }
  // Static float-ness of a C expression, so `x / 2` with `float x` stays a float division.
  isFloat(n, s) {
    if (n.kind === 'literal') return !!n.float;
    if (n.kind === 'name') return this.declaredType(n.name, s) === 'float';
    if (n.kind === 'unary') return this.isFloat(n.value, s);
    if (n.kind === 'binary')
      return (
        ['+', '-', '*', '/', '%'].includes(n.op) &&
        (this.isFloat(n.left, s) || this.isFloat(n.right, s))
      );
    if (n.kind === 'call')
      return n.fn.kind === 'name' && this.functions.get(n.fn.name)?.vtype === 'float';
    return false;
  }
  expr(n, s) {
    if (--this.budget < 0)
      throw Error(
        'Execution limit reached. Check for an infinite loop; use delay() or time.sleep_ms() to yield.',
      );
    if (n.kind === 'literal') return n.value;
    if (n.kind === 'name') return this.read(n.name, s);
    if (n.kind === 'unary') {
      const v = this.expr(n.value, s);
      return n.op === '!' ? !v : n.op === '-' ? -v : +v;
    }
    if (n.kind === 'binary') {
      const a = this.expr(n.left, s);
      if (n.op === '&&') return a && this.expr(n.right, s);
      if (n.op === '||') return a || this.expr(n.right, s);
      const b = this.expr(n.right, s);
      switch (n.op) {
        case '+': {
          const result = a + b;
          if (typeof result === 'string' && result.length > 10000)
            throw Error('String length limit: 10,000 characters.');
          return result;
        }
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          if (b === 0 || b === false) throw Error('Division by zero.');
          if (
            !this.python &&
            Number.isInteger(a) &&
            Number.isInteger(b) &&
            !this.isFloat(n.left, s) &&
            !this.isFloat(n.right, s)
          )
            return Math.trunc(a / b);
          return a / b;
        case '//':
          if (b === 0 || b === false) throw Error('Division by zero.');
          return Math.floor(a / b);
        case '%': {
          if (b === 0 || b === false) throw Error('Division by zero.');
          const r = a % b;
          // Python's modulo takes the sign of the divisor; C's takes the sign of the dividend.
          return this.python && r !== 0 && r < 0 !== b < 0 ? r + b : r;
        }
        case '>':
          return a > b;
        case '<':
          return a < b;
        case '>=':
          return a >= b;
        case '<=':
          return a <= b;
        case '==':
          return numeric(a) === numeric(b);
        case '!=':
          return numeric(a) !== numeric(b);
      }
    }
    if (n.kind === 'member') {
      if (n.obj.kind === 'name' && n.obj.name === 'Pin' && Object.hasOwn(pinConstants, n.name))
        return pinConstants[n.name];
      throw Error('Read properties using a supported method call.');
    }
    if (n.kind === 'call') {
      const args = n.args.map((x) => this.expr(x, s));
      if (n.fn.kind === 'name') return this.call(n.fn.name, args);
      if (n.fn.kind === 'member') {
        const { obj, name } = n.fn;
        if (obj.kind === 'name' && ['Serial', 'time'].includes(obj.name))
          return this.call(obj.name + '.' + name, args);
        const device = this.expr(obj, s);
        if (!device || !['pin', 'adc', 'pwm'].includes(device.type))
          throw Error('Unsupported method ' + name);
        if (['value', 'on', 'off'].includes(name)) {
          if (name === 'on') this.write(device.pin, 1);
          else if (name === 'off') this.write(device.pin, 0);
          else if (args.length) this.write(device.pin, args[0]);
          else {
            const pin = Number(device.pin),
              d = this.devices.find((d) => d.pin === pin);
            // Reading an output pin returns the level it is driving, as on MicroPython.
            if (device.mode === pinConstants.OUT || d?.output) return this.outputs[pin] ?? 0;
            return this.sensor(device.pin);
          }
          return 0;
        }
        if (name === 'read' || name === 'read_u16') {
          const v = this.sensor(device.pin),
            result = name === 'read_u16' ? v * 16 : v;
          this.inputs[device.pin] = result;
          return result;
        }
        if (name === 'duty' || name === 'duty_u16') {
          this.write(device.pin, args[0], 'pwm');
          return 0;
        }
        if (name === 'freq') return 0;
        throw Error('Unsupported method ' + name);
      }
    }
    throw Error('Unsupported expression.');
  }
  call(name, a) {
    if (name === 'mqttConnect') {
      this.clientId = String(a[0] || this.clientId);
      return this.broker.connect(this.clientId);
    }
    if (name === 'mqttReconnect') return this.broker.connect(this.clientId);
    if (name === 'mqttConnected') return this.broker.connected(this.clientId);
    if (name === 'mqttSubscribe') return this.broker.subscribe(this.clientId, a[0]);
    if (name === 'mqttPublish') return this.broker.publish(this.clientId, a[0], a[1]);
    if (name === 'mqttRead') return this.broker.read(this.clientId, a[0]);
    if (name === 'mqttLastDelivery')
      return this.broker.clients.get(this.clientId)?.lastDelivery || 0;
    if (name === 'analogRead' || name === 'digitalRead') return this.sensor(a[0]);
    if (['digitalWrite', 'analogWrite', 'ledcWrite', 'servoWrite'].includes(name)) {
      this.write(
        a[0],
        a[1],
        name === 'digitalWrite' ? 'digital' : name === 'servoWrite' ? 'servo' : 'pwm',
      );
      return 0;
    }
    if (name === 'pinMode') {
      const pin = Number(a[0]);
      if (!Number.isInteger(pin) || pin < 0 || pin > 255)
        throw Error('pinMode needs a GPIO pin number.');
      this.modes.set(pin, Number(a[1]));
      return 0;
    }
    if (['millis', 'ticks_ms', 'time.ticks_ms'].includes(name)) return this.time;
    if (['delay', 'sleep', 'sleep_ms', 'time.sleep', 'time.sleep_ms'].includes(name)) {
      this.yielded = true;
      return 0;
    }
    if (name === 'Serial.print') {
      // Like Arduino, print continues the current line; println (or Python print) ends it.
      this.pendingLine = (this.pendingLine + a.join(' ')).slice(-1000);
      return 0;
    }
    if (name === 'Serial.println' || name === 'print') {
      this.logs.push(this.pendingLine + a.join(' '));
      this.logs = this.logs.slice(-100);
      this.pendingLine = '';
      this.printed++;
      return 0;
    }
    if (name === 'Serial.begin') return 0;
    if (name === 'Pin') return { type: 'pin', pin: a[0], mode: a[1] };
    if (name === 'ADC' || name === 'PWM')
      return { type: name.toLowerCase(), pin: typeof a[0] === 'object' ? a[0].pin : a[0] };
    if (name === 'abs') return Math.abs(a[0]);
    if (name === 'min') return Math.min(...a);
    if (name === 'max') return Math.max(...a);
    if (name === 'int') return Math.trunc(a[0]);
    if (this.functions.has(name)) {
      // Called from inside an expression: run to completion. A delay here cannot suspend
      // the enclosing expression, so it does not end the tick.
      const run = this.invoke(this.functions.get(name), a);
      for (;;) {
        const r = run.next();
        if (r.done) return r.value;
      }
    }
    throw Error(
      'Unsupported function: ' + name + '. Open Language guide for the supported subset.',
    );
  }
  // A direct statement-level call to a user function (`f();`, `x = f();`, `return f();`)
  // runs as a nested generator so delays and debugger steps inside it can suspend.
  userCall(n) {
    return n.kind === 'call' && n.fn.kind === 'name' && this.functions.has(n.fn.name)
      ? this.functions.get(n.fn.name)
      : null;
  }
  *callUser(f, n, s) {
    if (--this.budget < 0) throw Error('Execution limit reached. Check your loops.');
    return yield* this.invoke(
      f,
      n.args.map((x) => this.expr(x, s)),
    );
  }
  *invoke(f, args, entry = false) {
    if (args.length !== f.params.length)
      throw Error(
        f.name +
          '() expects ' +
          f.params.length +
          ' argument' +
          (f.params.length === 1 ? '' : 's') +
          ', got ' +
          args.length +
          '.',
      );
    if (!entry && this.depth >= MAX_CALL_DEPTH)
      throw Error('Function recursion limit reached (' + MAX_CALL_DEPTH + ' nested calls).');
    const frame = this.python
      ? { vars: new Map(), locals: f.locals, parent: null }
      : { vars: new Map(), types: new Map(), parent: null };
    f.params.forEach((p, i) =>
      this.python ? frame.vars.set(p, args[i]) : this.declare(p, f.paramTypes[i], args[i], frame),
    );
    const outer = this.scope;
    if (!entry) this.depth++;
    try {
      const r = yield* this.exec(f.body, frame);
      const value = r?.value ?? 0;
      return this.python ? value : coerce(f.vtype, value);
    } finally {
      if (!entry) this.depth--;
      this.scope = outer;
    }
  }
  pause() {
    this.yielded = false;
    return DELAY;
  }
  *exec(nodes, s, block = false) {
    if (block && s && !this.python && (nodes.declares ??= nodes.some((n) => n.kind === 'declare')))
      s = { vars: new Map(), types: new Map(), parent: s };
    for (const n of nodes) {
      this.currentLine = n.line || this.currentLine;
      this.scope = s;
      if (--this.budget < 0) throw Error('Execution limit reached. Check your loops.');
      if (n.kind === 'if') {
        const cond = this.expr(n.cond, s);
        if (this.debug) yield STEP;
        if (this.yielded) yield this.pause();
        const r = yield* this.exec(cond ? n.body : n.other, s, true);
        if (r) return r;
        continue;
      }
      if (n.kind === 'while') {
        while (this.expr(n.cond, s)) {
          if (this.debug) yield STEP;
          if (this.yielded) yield this.pause();
          const r = yield* this.exec(n.body, s, true);
          if (r) return r;
        }
        continue;
      }
      const f = n.value && this.userCall(n.value),
        value = f ? yield* this.callUser(f, n.value, s) : n.value ? this.expr(n.value, s) : 0;
      if (n.kind === 'return') {
        if (this.debug) yield STEP;
        return { value };
      }
      if (n.kind === 'declare') this.declare(n.name, n.vtype, value, s);
      else if (n.kind === 'assign') this.assign(n.name, value, s);
      if (this.debug) yield STEP;
      if (this.yielded) yield this.pause();
    }
  }
  // The whole program as one resumable task: globals, setup(), then loop() forever (C), or
  // top-level statements followed by the main loop (Python).
  *program() {
    if (!this.initialized) {
      yield* this.exec(this.prelude, null);
      if (!this.python && this.functions.has('setup'))
        yield* this.invoke(this.functions.get('setup'), [], true);
      this.initialized = true;
    }
    while (true) {
      const started = this.tick;
      if (this.python) yield* this.exec([this.mainLoop], null);
      else yield* this.invoke(this.functions.get('loop'), [], true);
      yield { type: 'loopEnd', started };
    }
  }
  beginTick(env, ms) {
    this.env = env;
    this.inputs = {};
    this.time += ms;
    this.budget = 20000;
    this.yielded = false;
    if (!this.python && !this.functions.has('loop'))
      throw Error('Arduino needs void loop() { ... }.');
    if (this.python && !this.mainLoop) throw Error('MicroPython needs a while True: main loop.');
    this.tick++;
    this.task ??= this.program();
    this.midTick = true;
  }
  // Runs the task until the tick ends: a delay/sleep suspends it, and so does finishing a
  // loop() pass (or main loop) that began in this tick. In debug mode, also stops at STEP.
  advance(debug) {
    this.debug = debug;
    try {
      for (;;) {
        const r = this.task.next();
        if (
          r.done ||
          r.value === DELAY ||
          (r.value.type === 'loopEnd' && r.value.started === this.tick)
        ) {
          if (r.done) this.task = null;
          this.midTick = false;
          return true;
        }
        if (r.value === STEP && debug) return false;
      }
    } catch (error) {
      this.task = null;
      this.midTick = false;
      this.depth = 0;
      this.scope = null;
      this.yielded = false;
      throw error;
    }
  }
  snapshot() {
    const variables = new Map(this.vars),
      chain = [];
    for (let sc = this.scope; sc; sc = sc.parent) chain.unshift(sc);
    for (const sc of chain) for (const [key, value] of sc.vars) variables.set(key, value);
    return {
      outputs: { ...this.outputs },
      logs: [...this.logs],
      pendingLine: this.pendingLine,
      printed: this.printed,
      time: this.time,
      inputs: { ...this.inputs },
      outputKinds: { ...this.outputKinds },
      variables: Object.fromEntries(variables),
      line: this.currentLine,
      messages: [...this.broker.messages],
    };
  }
  debugStep(env, ms = 200) {
    if (!this.midTick) this.beginTick(env, ms);
    const tickComplete = this.advance(true);
    return { ...this.snapshot(), tickComplete };
  }
  step(env, ms = 200) {
    if (!this.midTick) this.beginTick(env, ms);
    this.advance(false);
    return this.snapshot();
  }
}
