/* Small, dependency-free UI helpers shared by all editor forms. */

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
  return el;
}

let fieldN = 0;
/** A labelled text input / textarea. `onInput(value)` fires on every keystroke. */
export function field({ label, value = '', onInput, multiline = false, rows = 3, placeholder = '', hint = '', type = 'text', autocomplete, inputmode, maxLength, extraClass = '' }) {
  const id = `f${++fieldN}`;
  const input = multiline
    ? h('textarea', { id, rows, placeholder, value, maxLength: maxLength || 4000 })
    : h('input', { id, type, placeholder, value, autocomplete, inputMode: inputmode, maxLength: maxLength || 300 });
  input.addEventListener('input', () => onInput && onInput(input.value));
  const el = h('div', { class: `ui-field ${extraClass}` }, h('label', { htmlFor: id }, label), input, hint ? h('p', { class: 'ui-hint', id: `${id}h` }, hint) : null);
  if (hint) input.setAttribute('aria-describedby', `${id}h`);
  el.input = input;
  return el;
}

export function btn(label, { onClick, kind = '', title, disabled = false, icon } = {}) {
  return h('button', { type: 'button', class: `ui-btn ${kind}`, title: title || false, 'aria-label': title || false, disabled, onClick }, icon ? h('span', { class: 'ui-ico', 'aria-hidden': 'true' }, icon) : null, label ? h('span', null, label) : null);
}

/* ---------- toast (with optional action, e.g. Undo) ---------- */
let toastTimer;
export function toast(message, { action, onAction, ms = 5000 } = {}) {
  let host = document.getElementById('ui-toast');
  if (!host) { host = h('div', { id: 'ui-toast', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  host.replaceChildren(...[h('span', null, message), action ? h('button', { type: 'button', class: 'ui-toast-act', onClick: () => { host.classList.remove('show'); onAction && onAction(); } }, action) : null].filter(Boolean));
  host.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => host.classList.remove('show'), ms);
}

/* ---------- confirmation dialog ---------- */
export function confirmDialog({ title, text, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'ui-dialog', 'aria-labelledby': 'dlg-t' },
      h('form', { method: 'dialog' },
        h('h2', { id: 'dlg-t' }, title), h('p', null, text),
        h('div', { class: 'ui-dialog-actions' },
          h('button', { class: 'ui-btn', value: 'cancel', autofocus: true }, cancelLabel),
          h('button', { class: `ui-btn ${danger ? 'danger' : 'primary'}`, value: 'ok' }, confirmLabel))));
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'ok'; dlg.remove(); resolve(ok); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
