// Shared lexer for the editor's highlighter and formatter (Arduino C++ and MicroPython subsets).
// Every character of the source belongs to exactly one token, so joining texts restores it.
const OPERATORS = [
  '<<=',
  '>>=',
  '**',
  '//',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '++',
  '--',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^=',
  '<<',
  '>>',
  '->',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '!',
  '&',
  '|',
  '^',
  '~',
  '?',
  ':',
];
const PUNCTUATION = '(){}[],;.';
const patterns = {
  cpp: /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)/y,
  python: /#[^\n]*/y,
};
const STRING = /"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y,
  // C++ literals keep their suffix in the same token: 1000UL, 1.5f, 0x1Fu.
  NUMBERS = {
    cpp: /0[xX][0-9a-fA-F]+[uUlL]*|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?[uUlLfF]*/y,
    python: /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y,
  },
  WORD = /[A-Za-z_]\w*/y,
  SPACE = /[ \t\r]+/y;

function sticky(pattern, source, at) {
  pattern.lastIndex = at;
  return pattern.exec(source)?.[0];
}

export function tokenize(source, language = 'cpp') {
  const tokens = [],
    comment = patterns[language] || patterns.cpp,
    number = NUMBERS[language] || NUMBERS.cpp;
  let at = 0;
  while (at < source.length) {
    let type, text;
    if (source[at] === '\n') [type, text] = ['newline', '\n'];
    else if ((text = sticky(SPACE, source, at))) type = 'space';
    else if ((text = sticky(comment, source, at))) type = 'comment';
    else if ((text = sticky(STRING, source, at))) type = 'string';
    else if ((text = sticky(number, source, at))) type = 'number';
    else if ((text = sticky(WORD, source, at))) type = 'word';
    else if ((text = OPERATORS.find((op) => source.startsWith(op, at)))) type = 'operator';
    else if (PUNCTUATION.includes(source[at])) [type, text] = ['punctuation', source[at]];
    else [type, text] = ['other', source[at]];
    tokens.push({ type, text, start: at });
    at += text.length;
  }
  return tokens;
}
