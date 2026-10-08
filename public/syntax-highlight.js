import { esc } from './html.js';
import { tokenize } from './code-tokens.js';
const words = (list) => new Set(list.split(' '));
const vocabulary = {
  cpp: {
    keyword: words('if else while for do switch case default break continue return'),
    type: words(
      'void int long short float double bool boolean char byte unsigned signed const static String word size_t uint8_t uint16_t uint32_t int8_t int16_t int32_t',
    ),
    constant: words('true false'),
    builtin: words(
      'pinMode digitalWrite digitalRead analogRead analogWrite ledcWrite servoWrite millis delay Serial begin print println abs min max mqttConnect mqttPublish mqttSubscribe mqttRead mqttConnected mqttReconnect',
    ),
  },
  python: {
    keyword: words(
      'if elif else while for in def return global import from as and or not is pass break continue',
    ),
    type: words(''),
    constant: words('True False None'),
    builtin: words(
      'machine time Pin ADC PWM sleep sleep_ms ticks_ms print int abs min max value on off read read_u16 duty duty_u16 freq iotquest mqttConnect mqttPublish mqttSubscribe mqttRead mqttConnected mqttReconnect',
    ),
  },
};
const OPENERS = { '(': ')', '[': ']', '{': '}' },
  CLOSERS = { ')': '(', ']': '[', '}': '{' };

function classify(tokens, index, vocab) {
  const { type, text } = tokens[index];
  if (type === 'comment' || type === 'string' || type === 'number' || type === 'operator')
    return type;
  if (type !== 'word') return null;
  for (const kind of ['keyword', 'type', 'constant', 'builtin'])
    if (vocab[kind].has(text)) return kind;
  if (/^[A-Z][A-Z0-9_]+$/.test(text)) return 'constant';
  let next = index + 1;
  while (tokens[next]?.type === 'space') next++;
  return tokens[next]?.text === '(' ? 'function' : null;
}

// Indices of the bracket next to the caret and its partner (or just the bracket if unmatched).
function bracketPair(tokens, caret) {
  const at = tokens.findIndex(
    (t) =>
      t.type === 'punctuation' &&
      (OPENERS[t.text] || CLOSERS[t.text]) &&
      (t.start === caret - 1 || t.start === caret),
  );
  if (at < 0) return null;
  const forward = !!OPENERS[tokens[at].text],
    open = forward ? tokens[at].text : CLOSERS[tokens[at].text],
    close = OPENERS[open];
  let depth = 0;
  for (let i = at; forward ? i < tokens.length : i >= 0; i += forward ? 1 : -1) {
    const text = tokens[i].type === 'punctuation' ? tokens[i].text : '';
    if (text === open) depth += forward ? 1 : -1;
    else if (text === close) depth += forward ? -1 : 1;
    if (depth === 0) return { match: [at, i], matched: true };
  }
  return { match: [at], matched: false };
}

// Render source as one block per line so the overlay can mark the caret and error lines.
// Text is tokenised before escaping, so HTML entities never look like syntax.
export function highlight(
  source,
  language = 'cpp',
  { caret = null, errorLine = null, diagnostics = [], lineClasses = new Map() } = {},
) {
  const vocab = vocabulary[language] || vocabulary.cpp,
    tokens = tokenize(source, language),
    caretLine = caret === null ? 0 : source.slice(0, caret).split('\n').length,
    pair = caret === null ? null : bracketPair(tokens, caret);
  // Strongest diagnostic per line, for the line marker.
  const lineSeverity = new Map();
  for (const d of diagnostics)
    if (lineSeverity.get(d.line) !== 'warning') lineSeverity.set(d.line, d.severity);
  let line = 1,
    html = '';
  const openLine = () =>
    '<span class="code-line' +
    (line === caretLine ? ' current-line' : '') +
    (line === errorLine ? ' error-line' : '') +
    (lineSeverity.has(line) ? ' diag-line-' + lineSeverity.get(line) : '') +
    (lineClasses.has(line) ? ' ' + lineClasses.get(line) : '') +
    '">';
  html += openLine();
  tokens.forEach((token, index) => {
    if (token.type === 'newline') {
      line++;
      html += '</span>' + openLine();
      return;
    }
    let kind = classify(tokens, index, vocab);
    const classes = kind ? ['syn-' + kind] : [];
    if (pair?.match.includes(index)) classes.push(pair.matched ? 'syn-match' : 'syn-unmatched');
    const end = token.start + token.text.length,
      flagged = diagnostics.find((d) => token.start < d.end && end > d.start);
    if (flagged) classes.push('diag-' + flagged.severity);
    token.text.split('\n').forEach((part, i) => {
      if (i) {
        line++;
        html += '</span>' + openLine();
      }
      html += classes.length ? `<span class="${classes.join(' ')}">${esc(part)}</span>` : esc(part);
    });
  });
  return html + '</span>';
}
