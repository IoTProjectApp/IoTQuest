import { esc } from './html.js';
import { completions, applyCompletion, signatureAt, declaredSymbols } from './intellisense.js';
// The editor's suggestion list and parameter hints (see intellisense.js for what is suggested).
// Keys while the list is open: ↑/↓ choose, Tab accepts, Escape closes. Enter accepts only once
// the student has picked from the list (with ↑/↓, or by opening it with Ctrl+Space); otherwise it
// closes the list and starts a new line, so finishing a line never swaps the word just typed. Keys it handles are marked `assistHandled` so the editor's own Tab/Enter
// handling leaves them alone.

const KIND_ICON = { function: 'ƒ', keyword: 'K', constant: 'C', variable: 'x', pin: '⌁' };

// Caret position in pixels inside `host`: the editor is monospaced, so line × line height and
// column × character width are exact.
function caretPoint(input, host, index) {
  const before = input.value.slice(0, index),
    line = before.split('\n').length - 1,
    column = index - before.lastIndexOf('\n') - 1;
  try {
    const style = getComputedStyle(input),
      context = (caretPoint.canvas ??= document.createElement('canvas')).getContext('2d');
    context.font = style.font;
    const width = context.measureText('M').width || 7,
      height = parseFloat(style.lineHeight) || 21,
      box = input.getBoundingClientRect(),
      outer = host.getBoundingClientRect();
    return {
      x: box.left - outer.left + parseFloat(style.paddingLeft) + column * width - input.scrollLeft,
      y: box.top - outer.top + parseFloat(style.paddingTop) + line * height - input.scrollTop,
      height,
      // The visible part only: the editor can run past the bottom of the window.
      hostHeight: Math.min(outer.bottom, globalThis.innerHeight || Infinity) - outer.top,
      hostWidth: outer.right - outer.left,
    };
  } catch {
    // No layout (for example in tests): a neutral spot under the first line.
    return { x: 0, y: 0, height: 21, hostHeight: 600, hostWidth: 700 };
  }
}

export function attachAssist(input, host, getContext) {
  // One box: the suggestions, with the chosen one's explanation as a footer underneath.
  const pop = document.createElement('div'),
    list = document.createElement('ul'),
    doc = document.createElement('div'),
    hint = document.createElement('div');
  pop.className = 'ac-pop';
  pop.hidden = true;
  list.className = 'ac-list';
  list.id = 'acList';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Code suggestions');
  doc.className = 'ac-doc';
  doc.hidden = true;
  hint.className = 'ac-signature';
  hint.id = 'acSignature';
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  pop.append(list, doc);
  host.append(pop, hint);
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', 'acList');
  input.setAttribute('aria-expanded', 'false');

  let items = [],
    active = 0,
    picked = false; // the student has picked from the list, so Enter accepts
  const open = () => !pop.hidden;
  function close() {
    items = [];
    pop.hidden = doc.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  // Puts `el` right under the caret line (or right above it: the editor clips its contents), kept
  // inside the editor's width. Returns the box it used.
  function place(el, point, below = true) {
    const width = el.offsetWidth || 250,
      height = el.offsetHeight || 0,
      left = Math.max(0, Math.min(point.x, point.hostWidth - width - 4)),
      under = point.y + point.height + 2,
      fitsUnder = under + height <= point.hostHeight,
      top = (below ? fitsUnder : point.y - height - 2 < 0) ? under : point.y - height - 2;
    el.style.left = left + 'px';
    el.style.top = Math.max(0, top) + 'px';
    return { left, top: Math.max(0, top), width, height };
  }
  function render() {
    list.innerHTML = items
      .map(
        (c, i) =>
          '<li role="option" id="ac-' +
          i +
          '" data-ac="' +
          i +
          '" aria-selected="' +
          (i === active) +
          '"><span class="ac-kind ac-' +
          c.kind +
          '" aria-hidden="true">' +
          (KIND_ICON[c.kind] || '•') +
          '</span><span class="ac-label">' +
          esc(c.insert) +
          (c.kind === 'function' ? '(' + esc((c.params || []).join(', ')) + ')' : '') +
          '</span>' +
          (c.detail ? '<small>' + esc(c.detail) + '</small>' : '') +
          '</li>',
      )
      .join('');
    input.setAttribute('aria-activedescendant', 'ac-' + active);
    const chosen = items[active];
    doc.hidden = !chosen?.doc;
    doc.textContent = chosen?.doc || '';
    for (const li of list.querySelectorAll?.('[data-ac]') || []) {
      // mousedown, not click: keep focus (and the caret) in the editor.
      li.onmousedown = (e) => {
        e.preventDefault();
        accept(Number(li.dataset.ac));
      };
    }
    list.querySelector?.('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }
  function update({ manual = false } = {}) {
    const ctx = getContext();
    if (!ctx.enabled || input.readOnly) return close();
    const caret = input.selectionStart;
    if (input.selectionEnd !== caret) return close();
    items = completions(input.value, caret, ctx.language, ctx.devices, { manual });
    if (!items.length) return close();
    active = Math.min(active, items.length - 1);
    pop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    render();
    // Measure after drawing, so the box sits right against the caret line.
    place(pop, caretPoint(input, host, items[0].from));
  }
  function accept(index = active) {
    const item = items[index];
    if (!item) return close();
    const { source, caret } = applyCompletion(input.value, input.selectionStart, item);
    input.value = source;
    input.selectionStart = input.selectionEnd = caret;
    close();
    input.dispatchEvent(new Event('input'));
    showSignature();
  }
  function showSignature() {
    const ctx = getContext();
    const sig =
      ctx.enabled &&
      signatureAt(
        input.value,
        input.selectionStart,
        ctx.language,
        declaredSymbols(input.value, ctx.language).filter((s) => s.params),
      );
    hint.hidden = !sig;
    if (!sig) return;
    hint.innerHTML =
      '<code>' +
      esc(sig.label) +
      '(' +
      sig.params.map((p, i) => (i === sig.active ? '<b>' + esc(p) + '</b>' : esc(p))).join(', ') +
      ')</code>' +
      (sig.doc ? '<span>' + esc(sig.doc) + '</span>' : '');
    place(hint, caretPoint(input, host, input.selectionStart), false);
  }

  const onKeydown = (e) => {
    if (e.key === ' ' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.assistHandled = true;
      active = 0;
      update({ manual: true });
      picked = open();
      return;
    }
    if (!open()) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.assistHandled = true;
      active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      picked = true;
      render();
    } else if (e.key === 'Enter' && !picked) {
      // Not picked: the editor's own Enter makes the new line.
      close();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      e.preventDefault();
      e.assistHandled = true;
      accept();
    } else if (e.key === 'Escape') {
      // Closing the list must not also release Tab from the editor.
      e.assistHandled = true;
      close();
    }
  };
  const onInput = () => {
    active = 0;
    picked = false;
    update();
    showSignature();
  };
  const onMove = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e?.key)) close();
    showSignature();
  };
  input.addEventListener('keydown', onKeydown);
  input.addEventListener('input', onInput);
  input.addEventListener('keyup', onMove);
  input.addEventListener('click', () => {
    close();
    showSignature();
  });
  input.addEventListener('blur', () => {
    close();
    hint.hidden = true;
  });
  return { close, update, accept, items: () => items };
}
