import { esc } from './html.js';
// Markup for "Predict, then check": an On/Off choice per output, the check button and, once
// checked, how each prediction compares with the running program.
export function predictionHTML(prediction, outputDevices, readings) {
  const picked = outputDevices.every((d) => d.pin in prediction.picks);
  return (
    '<strong>Predict, then check</strong><p>With today’s readings' +
    (readings ? ' (' + esc(readings) + ')' : '') +
    ', will each output be on?</p>' +
    outputDevices
      .map(
        (d) =>
          '<div class="predict-row"><span>' +
          esc(d.name) +
          '</span>' +
          [true, false]
            .map(
              (on) =>
                '<button class="text-btn" data-predict-pin="' +
                d.pin +
                '" data-predict-on="' +
                on +
                '" aria-pressed="' +
                (prediction.picks[d.pin] === on) +
                '">' +
                (on ? 'On' : 'Off') +
                '</button>',
            )
            .join('') +
          '</div>',
      )
      .join('') +
    '<button class="primary" id="checkPrediction"' +
    (picked ? '' : ' disabled') +
    '>Check with my running program</button>' +
    (prediction.result
      ? '<ul class="predict-result" role="status">' +
        prediction.result
          .map(
            (r) =>
              '<li class="' +
              (r.correct ? 'correct' : 'wrong') +
              '">' +
              (r.correct ? '✓ ' : '✗ ') +
              esc(r.name) +
              ': you predicted ' +
              (r.predicted ? 'on' : 'off') +
              ', your program turned it ' +
              (r.actual ? 'on' : 'off') +
              '.</li>',
          )
          .join('') +
        '</ul>' +
        (prediction.result.every((r) => r.correct)
          ? '<p>Your prediction matched. Your rule and the weather agree.</p>'
          : '<p>Compare each reading with the threshold in your code to see why.</p>')
      : '')
  );
}
