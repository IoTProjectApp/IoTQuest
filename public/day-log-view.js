import { esc } from './html.js';
import { scenarios } from './lab.js';
// Markup for the Day log tab. `log` is { scenario, rows, questions, answers, error } or null.
export function dayLogHTML(log, devices) {
  const sensors = devices.filter((d) => !d.output && d.signal),
    outputs = devices.filter((d) => d.output),
    scenario = log?.scenario || 'normal';
  const level = (v) => (v === 1 ? 'On' : v > 0 ? Math.round((v / 255) * 100) + '%' : 'Off');
  return (
    '<div class="lab-panel day-log"><div class="bench-heading"><div><h3>Day log</h3><p>Run your program through a simulated 24-hour day, then read the data like an engineer. A reading is logged every 10 minutes.</p></div></div>' +
    '<div class="day-log-controls"><label>Weather <select id="dayScenario">' +
    Object.entries(scenarios)
      .map(
        ([id, s]) =>
          '<option value="' +
          id +
          '"' +
          (id === scenario ? ' selected' : '') +
          '>' +
          esc(s.name) +
          '</option>',
      )
      .join('') +
    '</select></label><button class="primary" id="runDay">▶ Run a simulated day</button>' +
    (log?.rows ? '<button class="outline" id="downloadDayLog">Download CSV</button>' : '') +
    '</div>' +
    (log?.error ? '<p class="day-log-error" role="alert">' + esc(log.error) + '</p>' : '') +
    (log?.rows
      ? '<div class="day-log-table-wrap"><table class="day-log-table"><caption>Hourly readings (' +
        esc(scenarios[scenario].name) +
        '). The CSV has all ' +
        log.rows.length +
        ' readings.</caption><thead><tr><th scope="col">Time</th>' +
        [...sensors, ...outputs].map((d) => '<th scope="col">' + esc(d.name) + '</th>').join('') +
        '</tr></thead><tbody>' +
        log.rows
          .filter((r) => r.minutes % 60 === 0)
          .map(
            (r) =>
              '<tr' +
              (outputs.some((d) => r.outputs[d.pin] > 0) ? ' class="on"' : '') +
              '><th scope="row">' +
              r.time +
              '</th>' +
              sensors.map((d) => '<td>' + r.readings[d.pin] + '</td>').join('') +
              outputs.map((d) => '<td>' + level(r.outputs[d.pin]) + '</td>').join('') +
              '</tr>',
          )
          .join('') +
        '</tbody></table></div>' +
        (log.questions.length
          ? '<h4>Read the data</h4><ol class="day-log-questions">' +
            log.questions
              .map((q, qi) => {
                const picked = log.answers[qi];
                return (
                  '<li><p>' +
                  esc(q.prompt) +
                  '</p><div class="day-log-choices">' +
                  q.choices
                    .map(
                      (c, ci) =>
                        '<button class="text-btn" data-day-q="' +
                        qi +
                        '" data-day-choice="' +
                        ci +
                        '" aria-pressed="' +
                        (picked === ci) +
                        '"' +
                        (picked !== undefined && ci === q.answer ? ' data-correct' : '') +
                        '>' +
                        esc(c) +
                        '</button>',
                    )
                    .join('') +
                  '</div>' +
                  (picked !== undefined
                    ? '<p class="day-log-feedback ' +
                      (picked === q.answer ? 'correct' : 'wrong') +
                      '" role="status">' +
                      (picked === q.answer ? '✓ Right. ' : '✗ Not quite. ') +
                      esc(q.explanation) +
                      '</p>'
                    : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ol>'
          : '')
      : !log?.error
        ? '<div class="empty-bench">Install and wire your components and write your program, then run a day to see how it behaves from midnight to midnight.</div>'
        : '') +
    '</div>'
  );
}
