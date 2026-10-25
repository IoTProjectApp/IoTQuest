// How the shell writes a saved file (public/data/*.js): JSON laid out for reading and diffs, one
// line per part, collider, placement, junction or road, numbers to a tenth of a millimetre. Kept
// apart from main.mjs so the tests can check it without Electron.

const tidy = (x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x);
// Nothing below needs a line of its own: no objects, and no arrays holding objects or arrays.
const flat = (v) =>
  v === null ||
  typeof v !== 'object' ||
  Object.values(v).every(
    (x) =>
      x === null ||
      typeof x !== 'object' ||
      (Array.isArray(x) && x.every((y) => typeof y !== 'object')),
  );
// One line, a space after each colon and after each comma before a string or a number (not before
// true, false, null or a bracket). Built token by token, so the text inside strings is never
// touched.
function line(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(tidy(v)) ?? 'null';
  const parts = Array.isArray(v)
    ? v.map((x) => (x === undefined || typeof x === 'function' ? 'null' : line(x)))
    : Object.entries(v)
        .filter(([, x]) => x !== undefined && typeof x !== 'function')
        .map(([k, x]) => JSON.stringify(k) + ': ' + line(x));
  const body = parts.reduce(
    (text, part, i) => text + (i ? (/^["\d-]/.test(part) ? ', ' : ',') : '') + part,
    '',
  );
  return (Array.isArray(v) ? '[' : '{') + body + (Array.isArray(v) ? ']' : '}');
}
export function format(value, indent = '') {
  if (flat(value)) return line(value);
  const inner = indent + '  ',
    lines = Array.isArray(value)
      ? value.map((v) => inner + format(v, inner))
      : Object.entries(value)
          .filter(([, v]) => v !== undefined && typeof v !== 'function')
          .map(([k, v]) => inner + JSON.stringify(k) + ': ' + format(v, inner));
  return (
    (Array.isArray(value) ? '[' : '{') +
    '\n' +
    lines.join(',\n') +
    '\n' +
    indent +
    (Array.isArray(value) ? ']' : '}')
  );
}
// The whole file: what it holds, then the data as a module.
export const storeText = (about, value) =>
  `// ${about}\n// (scripts/world-editor.sh). See editor/README.md for the format.\n` +
  'export default ' +
  format(value) +
  ';\n';
