import {
  parseProgressReport,
  latestReports,
  reportViews,
  classGrid,
  needsHelp,
  progressCSV,
} from './progress-report.js';
import { highlight } from './syntax-highlight.js';
import { esc } from './html.js';
// Class progress view: loads handed-in progress reports (in memory only) and shows a grid of
// students and quests, who needs help, each student's code, and a CSV for the gradebook.

const $ = (id) => document.getElementById(id);
let reports = [],
  view = '',
  classCode = '',
  selected = null;

const when = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '–';
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const inClass = () =>
  classCode ? reports.filter((r) => r.classCode.toLowerCase() === classCode) : reports;

// Text for a cell, so status is never shown by colour alone.
export function cellSummary(q) {
  if (!q || q.status === 'not-started') return { kind: 'none', icon: '–', text: 'Not started' };
  const effort = plural(q.attempts, 'test') + ' · ' + plural(q.hints, 'hint');
  if (q.status === 'passed') return { kind: 'passed', icon: '✓', text: 'Passed', effort };
  return {
    kind: needsHelp(q) ? 'help' : 'started',
    icon: needsHelp(q) ? '!' : '…',
    text: q.stuck ? 'At: ' + q.stuck : 'Working on it',
    effort,
  };
}

async function addFiles(files) {
  const errors = [];
  for (const file of files) {
    try {
      reports.push(parseProgressReport(await file.text()));
    } catch (e) {
      errors.push(file.name + ': ' + (e.message || 'could not be read.'));
    }
  }
  $('fileErrors').hidden = !errors.length;
  $('fileErrors').innerHTML = errors.map((e) => '<li>' + esc(e) + '</li>').join('');
  render();
}

function render() {
  const has = reports.length > 0;
  $('view').hidden = !has;
  if (!has) return;
  const codes = [...new Set(reports.map((r) => r.classCode).filter(Boolean))].sort();
  if (classCode && !codes.some((c) => c.toLowerCase() === classCode)) classCode = '';
  $('classSelect').innerHTML =
    '<option value="">All classes</option>' +
    codes
      .map(
        (c) =>
          '<option value="' +
          esc(c.toLowerCase()) +
          '"' +
          (c.toLowerCase() === classCode ? ' selected' : '') +
          '>' +
          esc(c) +
          '</option>',
      )
      .join('');
  const shown = inClass(),
    views = reportViews(shown);
  if (!views.some((v) => v.id === view)) view = views[0]?.id || '';
  $('viewSelect').innerHTML = views
    .map(
      (v) =>
        '<option value="' +
        esc(v.id) +
        '"' +
        (v.id === view ? ' selected' : '') +
        '>' +
        esc(v.label) +
        '</option>',
    )
    .join('');
  const grid = classGrid(shown, view),
    students = grid.rows.length,
    passed = grid.rows.reduce(
      (n, r) => n + r.cells.filter((q) => q?.status === 'passed').length,
      0,
    ),
    helping = grid.rows.filter((r) => r.cells.some((q) => q && needsHelp(q)));
  $('tiles').innerHTML =
    tile(students, students === 1 ? 'student' : 'students') +
    tile(
      students ? (passed / students).toFixed(1) + ' / ' + grid.quests.length : '–',
      'quests passed on average',
    ) +
    tile(helping.length, helping.length === 1 ? 'student needs help' : 'students need help');
  $('grid').innerHTML =
    '<caption class="t-sr">Quest progress for each student</caption><thead><tr><th scope="col">Student</th>' +
    grid.quests
      .map(
        (q) =>
          '<th scope="col"><span class="t-qnum">' +
          (q.index + 1) +
          '</span> ' +
          esc(q.title) +
          '<small>' +
          q.passed +
          ' of ' +
          students +
          ' passed</small></th>',
      )
      .join('') +
    '</tr></thead><tbody>' +
    grid.rows
      .map(
        (r, ri) =>
          '<tr><th scope="row">' +
          esc(r.student) +
          (r.classCode ? '<small>' + esc(r.classCode) + '</small>' : '') +
          '</th>' +
          grid.quests
            .map((col) => {
              const q = r.cells[col.index],
                s = cellSummary(q),
                active = selected && selected.row === ri && selected.index === col.index;
              return (
                '<td><button class="t-cell ' +
                s.kind +
                (active ? ' active' : '') +
                '" data-row="' +
                ri +
                '" data-index="' +
                col.index +
                '" aria-label="' +
                esc(
                  r.student + ', ' + col.title + ': ' + s.text + (s.effort ? ', ' + s.effort : ''),
                ) +
                '"><span class="t-icon" aria-hidden="true">' +
                s.icon +
                '</span><span class="t-cell-text">' +
                esc(s.text) +
                '</span>' +
                (s.effort ? '<small>' + esc(s.effort) + '</small>' : '') +
                '</button></td>'
              );
            })
            .join('') +
          '</tr>',
      )
      .join('') +
    '</tbody>';
  document.querySelectorAll('.t-cell').forEach(
    (b) =>
      (b.onclick = () => {
        selected = { row: Number(b.dataset.row), index: Number(b.dataset.index) };
        render();
        $('detail').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }),
  );
  const help = [];
  grid.rows.forEach((r, ri) =>
    r.cells.forEach((q, index) => q && needsHelp(q) && help.push({ r, ri, q, index })),
  );
  help.sort((a, b) => b.q.attempts + b.q.hints - (a.q.attempts + a.q.hints));
  $('helpList').innerHTML =
    '<h2>Who needs help</h2>' +
    (help.length
      ? '<ul>' +
        help
          .map(
            (h) =>
              '<li><button class="t-link" data-row="' +
              h.ri +
              '" data-index="' +
              h.index +
              '"><strong>' +
              esc(h.r.student) +
              '</strong> · ' +
              esc(h.q.title) +
              '</button><span>' +
              esc(
                (h.q.stuck ? 'At “' + h.q.stuck + '” · ' : '') +
                  plural(h.q.attempts, 'test') +
                  ' · ' +
                  plural(h.q.hints, 'hint'),
              ) +
              '</span></li>',
          )
          .join('') +
        '</ul>'
      : '<p class="t-muted">Nobody is stuck on these quests: no one has 3 or more test attempts or hints on a quest they have not passed.</p>');
  document.querySelectorAll('.t-link').forEach(
    (b) =>
      (b.onclick = () => {
        selected = { row: Number(b.dataset.row), index: Number(b.dataset.index) };
        render();
      }),
  );
  renderDetail(grid);
}

const tile = (value, label) =>
  '<div class="t-tile"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>';

function renderDetail(grid) {
  const row = selected && grid.rows[selected.row],
    q = row?.cells[selected.index];
  if (!row || !grid.quests.some((c) => c.index === selected.index)) {
    $('detail').innerHTML =
      '<p class="t-muted">Select a cell to see the student’s progress and code.</p>';
    return;
  }
  const s = cellSummary(q),
    language = q?.language === 'python' ? 'python' : 'cpp';
  $('detail').innerHTML =
    '<h2>' +
    esc(row.student) +
    '</h2><p class="t-detail-quest">' +
    esc(
      selected.index +
        1 +
        '. ' +
        (q?.title || grid.quests.find((c) => c.index === selected.index).title),
    ) +
    '</p><p class="t-status ' +
    s.kind +
    '"><span aria-hidden="true">' +
    s.icon +
    '</span> ' +
    esc(s.kind === 'help' ? 'Needs help · ' + s.text : s.text) +
    '</p>' +
    (q && q.status !== 'not-started'
      ? '<dl><dt>Guide steps</dt><dd>' +
        q.stepsDone +
        ' of ' +
        q.stepsTotal +
        ' done</dd><dt>Test attempts</dt><dd>' +
        q.attempts +
        '</dd><dt>Hints used</dt><dd>' +
        q.hints +
        '</dd><dt>Passed</dt><dd>' +
        esc(when(q.passedAt)) +
        '</dd><dt>Last active</dt><dd>' +
        esc(when(q.lastActive)) +
        '</dd><dt>Language</dt><dd>' +
        (language === 'python' ? 'MicroPython' : 'Arduino C++') +
        '</dd><dt>Report</dt><dd>' +
        esc(when(row.createdAt)) +
        '</dd></dl>' +
        (q.code
          ? '<h3>Student’s code</h3><pre class="t-code">' + highlight(q.code, language) + '</pre>'
          : '<p class="t-muted">No code written yet.</p>')
      : '<p class="t-muted">This student has not started this quest.</p>');
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (typeof document !== 'undefined' && $('files')) {
  $('files').onchange = (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  };
  const drop = $('drop');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    addFiles([...e.dataTransfer.files]);
  });
  $('classSelect').onchange = (e) => {
    classCode = e.target.value;
    selected = null;
    render();
  };
  $('viewSelect').onchange = (e) => {
    view = e.target.value;
    selected = null;
    render();
  };
  $('csvBtn').onclick = () =>
    download(
      'iotquest-class-progress-' + new Date().toISOString().slice(0, 10) + '.csv',
      progressCSV(latestReports(inClass())),
      'text/csv',
    );
  $('clearBtn').onclick = () => {
    reports = [];
    selected = null;
    $('fileErrors').hidden = true;
    render();
  };
}
