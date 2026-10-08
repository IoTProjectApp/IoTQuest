import { esc } from './html.js';
import {
  buildCustomQuest,
  questFile,
  questFileName,
  questSensors,
  questOutputs,
  questOperators,
  QuestError,
} from './custom-quests.js';
import { OPERATORS } from './code-coach.js';
import { readingRange } from './diagnostics.js';
import { ADC_SIGNALS, ADC_SCALE } from './signals.js';
// Create a quest (teacher.html): the teacher picks a sensor, an output and a rule; the preview
// shows the goal and the exact tests students will face; the quest downloads as a small file.

const $ = (id) => document.getElementById(id);
const fields = () => ({
  title: $('qTitle').value,
  resident: $('qResident').value,
  request: $('qRequest').value,
  sensor: $('qSensor').value,
  output: $('qOutput').value,
  operator: $('qOperator').value,
  threshold: $('qThreshold').value === '' ? NaN : Number($('qThreshold').value),
});
// What the program reads in a test scenario (ADC sensors as 0–4095).
const shown = (sensor, env) => {
  const v = env[sensor.signal];
  return ADC_SIGNALS.includes(sensor.signal) ? Math.round(v * ADC_SCALE) : v;
};

// The rule controls depend on the sensor: comparisons and a range for analogue sensors,
// HIGH/LOW for digital ones.
function renderRule() {
  const sensor = questSensors().find((s) => s.id === $('qSensor').value),
    [lo, hi, unit] = readingRange(sensor),
    numeric = questOperators(sensor).length > 1,
    previous = $('qOperator').value;
  $('qOperator').innerHTML = questOperators(sensor)
    .map(
      (op) =>
        '<option value="' +
        esc(op) +
        '">' +
        esc(numeric ? OPERATORS[op][0] : 'reads') +
        '</option>',
    )
    .join('');
  if (questOperators(sensor).includes(previous)) $('qOperator').value = previous;
  $('qThreshold').min = lo;
  $('qThreshold').max = hi;
  $('qThreshold').step = ADC_SIGNALS.includes(sensor.signal) || !sensor.analog ? 1 : 0.5;
  $('qRange').textContent = numeric
    ? `This sensor reads ${lo} to ${hi}${unit ? ' ' + unit : ''}.`
    : 'Enter 1 for HIGH or 0 for LOW.';
}

function renderPreview() {
  let quest;
  try {
    quest = buildCustomQuest(fields());
  } catch (e) {
    if (!(e instanceof QuestError)) throw e;
    $('qPreview').innerHTML = '<p class="t-quest-error" role="alert">' + esc(e.message) + '</p>';
    $('qDownload').disabled = true;
    return null;
  }
  const sensor = questSensors().find((s) => s.id === quest.ids[0]);
  $('qPreview').innerHTML =
    '<p><strong>' +
    esc(quest.resident) +
    ':</strong> ' +
    esc(quest.quote) +
    '</p><p><strong>Goal:</strong> ' +
    esc(quest.goal) +
    '</p><table class="t-quest-tests"><caption>Students’ code must pass every test</caption><thead><tr><th scope="col">Test</th><th scope="col">Reading</th><th scope="col">Output</th></tr></thead><tbody>' +
    quest.scenarios
      .map(
        ([name, env, [on]]) =>
          '<tr><td>' +
          esc(name) +
          '</td><td>' +
          esc(String(shown(sensor, env))) +
          '</td><td>' +
          (on ? 'ON' : 'OFF') +
          '</td></tr>',
      )
      .join('') +
    '</tbody></table>';
  $('qDownload').disabled = false;
  return quest;
}

if (typeof document !== 'undefined' && $('createQuest')) {
  $('qSensor').innerHTML = questSensors()
    .map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>')
    .join('');
  $('qOutput').innerHTML = questOutputs()
    .map((s) => '<option value="' + s.id + '">' + esc(s.name) + '</option>')
    .join('');
  $('qSensor').value = 'ldr';
  $('qOutput').value = 'led';
  renderRule();
  $('qThreshold').value = 1800;
  $('qSensor').onchange = () => {
    renderRule();
    renderPreview();
  };
  $('createQuest').oninput = renderPreview;
  renderPreview();
  $('qDownload').onclick = () => {
    const quest = renderPreview();
    if (!quest) return;
    const url = URL.createObjectURL(new Blob([questFile(quest)], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = questFileName(quest);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
