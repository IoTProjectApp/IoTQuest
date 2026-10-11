import {
  parseProgressReport,
  latestReports,
  reportViews,
  classGrid,
  needsHelp,
  needsReview,
  progressCSV,
  PROGRESS_LIMITS,
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
  const effort =
    plural(q.attempts, 'test') +
    ' · ' +
    plural(q.hints, 'hint') +
    (q.understandAnswered ? ' · ' + q.understood + '/' + q.understandTotal + ' understood' : '');
  if (needsReview(q)) return { kind: 'review', icon: '?', text: 'Passed · review', effort };
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
      // Reject oversized files before reading them into memory.
      if (file.size > PROGRESS_LIMITS.bytes)
        throw new Error('This file is too large to be a progress report.');
      reports.push(parseProgressReport(await file.text()));
    } catch (e) {
      errors.push(file.name + ': ' + (e.message || 'could not be read.'));
    }
  }
  $('fileErrors').hidden = !errors.length;
  $('fileErrors').innerHTML = errors.map((e) => '<li>' + esc(e) + '</li>').join('');
  // New students change the row order, so the selected cell would point at someone else.
  selected = null;
  render();
}

function render() {
  const has = reports.length > 0;
  $('view').hidden = !has;
  if (!has) return;
  // One entry per class, whatever the case each student typed the code in (7a and 7A are one class).
  const byCode = new Map();
  for (const r of reports)
    if (r.classCode && !byCode.has(r.classCode.toLowerCase()))
      byCode.set(r.classCode.toLowerCase(), r.classCode);
  const codes = [...byCode.values()].sort((a, b) => a.localeCompare(b));
  if (classCode && !byCode.has(classCode)) classCode = '';
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
  renderDuplicates();
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
    helping = grid.rows.filter((r) => r.cells.some((q) => q && needsHelp(q))),
    reviewing = grid.rows.filter((r) => r.cells.some((q) => q && needsReview(q)));
  $('tiles').innerHTML =
    tile(students, students === 1 ? 'student' : 'students') +
    tile(
      students ? (passed / students).toFixed(1) + ' / ' + grid.quests.length : '–',
      'quests passed on average',
    ) +
    tile(helping.length, helping.length === 1 ? 'student needs help' : 'students need help') +
    tile(
      reviewing.length,
      reviewing.length === 1
        ? 'student passed but needs review'
        : 'students passed but need review',
    );
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
        select(b);
        $('detail').scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }),
  );
  const help = [];
  grid.rows.forEach((r, ri) =>
    r.cells.forEach(
      (q, index) => q && (needsHelp(q) || needsReview(q)) && help.push({ r, ri, q, index }),
    ),
  );
  help.sort(
    (a, b) =>
      needsReview(a.q) - needsReview(b.q) || b.q.attempts + b.q.hints - (a.q.attempts + a.q.hints),
  );
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
                needsReview(h.q)
                  ? 'Passed, but ' +
                      h.q.understood +
                      ' of ' +
                      h.q.understandTotal +
                      ' understanding questions right first time'
                  : (h.q.stuck ? 'At “' + h.q.stuck + '” · ' : '') +
                      plural(h.q.attempts, 'test') +
                      ' · ' +
                      plural(h.q.hints, 'hint'),
              ) +
              '</span></li>',
          )
          .join('') +
        '</ul>'
      : '<p class="t-muted">Nobody needs help on these quests: no one has 3 or more test attempts or hints on a quest they have not passed, and no one has passed with fewer than half of the understanding questions right first time.</p>');
  document.querySelectorAll('.t-link').forEach((b) => (b.onclick = () => select(b)));
  renderDetail(grid);
}

// Shows a student's quest from a grid cell or a "Who needs help" link. Rendering replaces those
// buttons, so keyboard focus goes back to the matching new button rather than being lost, and a
// short message tells screen reader users what the details panel now shows.
function select(button) {
  const { row, index } = button.dataset,
    kind = button.classList.contains('t-link') ? '.t-link' : '.t-cell';
  selected = { row: Number(row), index: Number(index) };
  render();
  document.querySelector(kind + '[data-row="' + row + '"][data-index="' + index + '"]')?.focus();
  const parts = ['h2', '.t-detail-quest', '.t-status'].map((s) => {
    const shown = $('detail').querySelector(s)?.cloneNode(true);
    shown?.querySelectorAll('[aria-hidden]').forEach((icon) => icon.remove());
    return shown?.textContent.trim();
  });
  $('announce').textContent = parts[0] ? 'Details: ' + parts.filter(Boolean).join(', ') : '';
}

// A student who handed in more than once is shown from their newest report. Say so, so a teacher
// does not wonder where the earlier one went (two students with the same name and class code are
// merged the same way, and this shows it).
function renderDuplicates() {
  const groups = new Map();
  for (const r of reports) {
    const key = r.student.toLowerCase() + '\u0000' + r.classCode.toLowerCase();
    groups.set(key, [...(groups.get(key) || []), r]);
  }
  const repeated = [...groups.values()].filter((g) => g.length > 1);
  $('duplicates').hidden = !repeated.length;
  $('duplicates').innerHTML = repeated.length
    ? '<strong>Some students handed in more than one report.</strong> Only the newest is shown for: ' +
      repeated
        .map(
          (g) =>
            esc(g[0].student) +
            (g[0].classCode ? ' (' + esc(g[0].classCode) + ')' : '') +
            ' · ' +
            g.length +
            ' reports, newest from ' +
            esc(when(g.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)).createdAt)),
        )
        .join('; ') +
      '. If these are different students, ask them to add a class code or a surname.'
    : '';
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
        '</dd><dt>Resident chats</dt><dd>' +
        q.chats +
        '</dd><dt>Understanding</dt><dd>' +
        (q.status !== 'passed' || !q.understandTotal
          ? '–'
          : q.understandAnswered
            ? q.understood +
              ' of ' +
              q.understandTotal +
              ' right first time' +
              (q.understandAnswered < q.understandTotal ? ' (not finished)' : '')
            : 'Not answered yet') +
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
  // One file with every destination (the grid shows one at a time); the button says so too.
  $('csvBtn').onclick = () =>
    download(
      'iotquest-class-progress-all-destinations-' + new Date().toISOString().slice(0, 10) + '.csv',
      progressCSV(latestReports(inClass())),
      'text/csv;charset=utf-8',
    );
  $('clearBtn').onclick = () => {
    reports = [];
    selected = null;
    $('fileErrors').hidden = true;
    $('duplicates').hidden = true;
    render();
  };
  // Reports live only in this page, so leaving it loses them: ask first.
  addEventListener('beforeunload', (e) => {
    if (!reports.length) return;
    e.preventDefault();
    e.returnValue = '';
  });
}
