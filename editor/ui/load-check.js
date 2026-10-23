// Says so when a workspace page cannot start because one of its files failed to load: usually the
// editor was updated while it was open, and its shell still serves the old files. Loaded as a
// plain script before the page's module, so it runs even when the module never does. Importing the
// same module here shares the page's copy (it runs once); only a failure to load shows the note.
addEventListener('DOMContentLoaded', () => {
  for (const script of document.querySelectorAll('script[type="module"][src]'))
    import(script.src).catch(fail);
});
function fail() {
  if (document.getElementById('load-failed')) return;
  const note = document.createElement('div');
  note.id = 'load-failed';
  note.setAttribute('role', 'alert');
  note.textContent =
    'This workspace could not start: one of its files did not load. If the editor was updated ' +
    'while it was open, quit it (⌘Q) and run scripts/world-editor.sh again.';
  Object.assign(note.style, {
    position: 'fixed',
    inset: '50% auto auto 50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '460px',
    padding: '18px 20px',
    borderRadius: '10px',
    background: 'var(--panel-raised, #222730)',
    border: '1px solid var(--danger, #ef6b6b)',
    color: 'var(--text, #e8ebef)',
    font: '14px/1.5 system-ui, sans-serif',
    zIndex: 1000,
  });
  document.body.append(note);
}
