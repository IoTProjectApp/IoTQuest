import { tokenize } from './code-tokens.js';
// Whitespace-only formatter for the editor. It re-indents (C from braces, Python from the
// existing block structure), normalises spacing and blank lines, and refuses to return
// code whose non-whitespace tokens differ from the input.
export const INDENT = { cpp: '  ', python: '    ' };
const MAX_BLANK_LINES = { cpp: 1, python: 2 },
  BINARY = new Set(
    '= == != < > <= >= && || += -= *= /= %= &= |= ^= <<= >>= ** // + - * / % & | ^ << >> ?'.split(
      ' ',
    ),
  ),
  SPACED_BEFORE_PAREN = new Set(
    'if while for switch elif return and or not in else do case'.split(' '),
  ),
  UNARY_AFTER = new Set('return and or not if elif while in case else'.split(' '));

export class FormatError extends Error {}

function splitLines(tokens) {
  const lines = [[]];
  for (const token of tokens) {
    if (token.type === 'newline') lines.push([]);
    else if (token.type === 'comment' && token.text.includes('\n')) {
      // A block comment spanning lines is kept verbatim on each line it covers.
      const parts = token.text.split('\n');
      parts.forEach((text, i) => {
        if (i) lines.push([]);
        lines.at(-1).push({ ...token, text, raw: i > 0 });
      });
    } else lines.at(-1).push(token);
  }
  return lines;
}

const isUnary = (prev) =>
  !prev ||
  prev.type === 'operator' ||
  (prev.type === 'punctuation' && '([{,;'.includes(prev.text)) ||
  (prev.type === 'word' && UNARY_AFTER.has(prev.text));

function normaliseComment(text, language) {
  if (language === 'python') return text.replace(/^#(?![\s#!])/, '# ').replace(/\s+$/, '');
  if (text.startsWith('//')) return text.replace(/^\/\/(?![\s/!])/, '// ').replace(/\s+$/, '');
  return text.replace(/\s+$/, '');
}

// Rebuild one line's tokens with consistent spacing. `depth` is the bracket depth at line start.
function spaceLine(tokens, language, depth) {
  const python = language === 'python';
  let out = '',
    prev = null,
    hadSpace = false,
    unaryPending = false;
  for (const token of tokens) {
    if (token.type === 'space') {
      hadSpace = !!prev;
      continue;
    }
    const { type, text } = token;
    let space = hadSpace; // default: keep one space where the author had whitespace
    if (prev) {
      const p = prev.text;
      if (type === 'comment') space = true;
      else if (unaryPending) space = false;
      else if (type === 'operator' && (text === '++' || text === '--'))
        space = prev.type === 'operator' && BINARY.has(p);
      else if (prev.type === 'operator' && (p === '++' || p === '--'))
        space = type === 'word' || text === ')' ? false : space;
      else if (text === ',' || text === ';' || text === ')' || text === ']' || text === '.')
        space = false;
      else if (p === '(' || p === '[' || p === '.' || p === '!' || p === '~') space = false;
      else if (p === ',' || p === ';') space = true;
      else if (text === '(')
        space = prev.type === 'word' ? SPACED_BEFORE_PAREN.has(p) : prev.type === 'operator';
      else if (text === '[') space = !(prev.type === 'word' || p === ')' || p === ']');
      else if (text === '{') space = true;
      else if (p === '{') space = text !== '}';
      else if (text === '}') space = true;
      else if (p === '}' && text === 'else') space = true;
      else if (python && text === ':' && type === 'operator') space = false;
      else if (python && text === '=' && depth > 0)
        space = false; // keyword arguments
      else if (python && p === '=' && depth > 0) space = false;
      else if (type === 'operator' && (BINARY.has(text) || (!python && text === ':'))) space = true;
      else if (prev.type === 'operator' && (BINARY.has(p) || (!python && p === ':'))) space = true;
      else if (python && p === ':' && prev.type === 'operator') space = true;
      else if (/^(word|number|string)$/.test(type) && /^(word|number|string)$/.test(prev.type))
        space = true;
    }
    unaryPending =
      type === 'operator' &&
      ((text === '-' || text === '+') && isUnary(prev) ? true : text === '!' || text === '~');
    if (type === 'comment' && prev) out += python ? '  ' : ' ';
    else if (space && prev) out += ' ';
    out += type === 'comment' ? normaliseComment(text, language) : text;
    if (text === '(' || text === '[' || text === '{') depth++;
    if (text === ')' || text === ']' || text === '}') depth = Math.max(0, depth - 1);
    prev = token;
    hadSpace = false;
  }
  return { text: out, depth };
}

const leadingWidth = (tokens) =>
  tokens[0]?.type === 'space' ? tokens[0].text.replace(/\t/g, '    ').length : 0;
const signature = (tokens, language) =>
  tokens
    .filter((t) => t.type !== 'space' && t.type !== 'newline')
    .map((t) =>
      t.type === 'comment' ? normaliseComment(t.text, language).replace(/\s+/g, ' ') : t.text,
    )
    .join('\u0001');

export function formatCode(source, language = 'cpp') {
  const python = language === 'python',
    tokens = tokenize(source.replace(/\r\n?/g, '\n'), language),
    lines = splitLines(tokens),
    unit = INDENT[language] || INDENT.cpp,
    out = [],
    stack = [0];
  let braces = 0,
    brackets = 0,
    blank = 0;
  lines.forEach((line, number) => {
    const code = line.filter((t) => t.type !== 'space');
    if (!code.length) {
      blank++;
      return;
    }
    if (line[0].raw) {
      // Continuation of a block comment: keep its text, only trim the right side.
      out.push(
        line
          .map((t) => t.text)
          .join('')
          .replace(/\s+$/, ''),
      );
      blank = 0;
      return;
    }
    if (out.length && blank)
      out.push(...Array(Math.min(blank, MAX_BLANK_LINES[language] ?? 1)).fill(''));
    blank = 0;
    let level;
    if (python) {
      const width = leadingWidth(line);
      if (brackets > 0)
        level = stack.length; // continuation inside brackets: hanging indent
      else if (code[0].type === 'comment')
        level = stack.filter((w) => w <= width).length - 1 + (width > stack.at(-1) ? 1 : 0);
      else {
        if (width > stack.at(-1)) stack.push(width);
        while (width < stack.at(-1)) stack.pop();
        if (width !== stack.at(-1))
          throw new FormatError(
            'Line ' +
              (number + 1) +
              ' does not line up with any enclosing block. Fix its indentation first.',
          );
        level = stack.length - 1;
      }
    } else {
      const closers = code.findIndex((t) => !(t.type === 'punctuation' && t.text === '}'));
      level = Math.max(0, braces - (closers < 0 ? code.length : closers)) + (brackets > 0 ? 2 : 0);
    }
    const { text } = spaceLine(line, language, brackets);
    out.push(unit.repeat(level) + text);
    for (const t of code)
      if (t.type === 'punctuation') {
        if (t.text === '{') braces++;
        else if (t.text === '}') braces = Math.max(0, braces - 1);
        else if (t.text === '(' || t.text === '[') brackets++;
        else if (t.text === ')' || t.text === ']') brackets = Math.max(0, brackets - 1);
      }
  });
  const formatted = out.join('\n') + '\n';
  if (signature(tokenize(formatted, language), language) !== signature(tokens, language))
    throw new FormatError('Formatting would change the program, so it was not applied.');
  return formatted;
}
