/* The editing panel: expandable sections of forms bound to the central CV object.
   Forms only write to the store; the preview and autosave react to store changes (no template code here). */
import { h, field, btn, toast } from './ui.js';
import { photoEditor } from './photo.js';
import { uid, DEFAULT_ORDER } from '../model.js';
import { completion } from '../progress.js';

const PRESETS = [
  { title: 'Certifications', column: 'main', kind: 'list' },
  { title: 'Professional Memberships', column: 'side', kind: 'list' },
  { title: 'Interests', column: 'side', kind: 'list' },
  { title: 'Achievements', column: 'main', kind: 'list' },
  { title: 'Projects', column: 'main', kind: 'list' },
  { title: '', column: 'main', kind: 'text', label: 'Blank section' },
];

export function buildEditor(root, store) {
  let sections = [];
  let photoUI = null;
  const cv = () => store.cv;
  const set = (fn) => store.update(fn);

  /* ---------- generic pieces ---------- */
  function section(key, title, desc, ...body) {
    const el = h('details', { class: 'ui-sec', dataset: { key } },
      h('summary', null, h('span', { class: 'ui-tick', 'aria-hidden': 'true' }), h('span', { class: 'ui-sec-title' }, title), h('span', { class: 'ui-sec-done ui-sr' }, ' (has content)'), h('span', { class: 'ui-chev', 'aria-hidden': 'true' })),
      h('div', { class: 'ui-sec-body' }, desc ? h('p', { class: 'ui-hint' }, desc) : null, ...body));
    sections.push({ key, el });
    return el;
  }

  const colOf = (id) => (cv().order.side.includes(id) ? 'side' : 'main');

  /** Heading text, show/hide and position controls for one CV section. */
  function sectionControls(id, headingKey) {
    const up = btn('', { title: 'Move section up', icon: '↑', onClick: () => move(-1) });
    const down = btn('', { title: 'Move section down', icon: '↓', onClick: () => move(1) });
    const sync = () => {
      const arr = cv().order[colOf(id)]; const i = arr.indexOf(id);
      up.disabled = i <= 0; down.disabled = i < 0 || i >= arr.length - 1;
    };
    function move(d) {
      set((c) => { const arr = c.order[colOf(id)]; const i = arr.indexOf(id); const j = i + d; if (i < 0 || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; });
      sync();
    }
    sync();
    const show = h('input', { type: 'checkbox', checked: !cv().hidden[id] });
    show.addEventListener('change', () => set((c) => { if (show.checked) delete c.hidden[id]; else c.hidden[id] = true; }));
    return h('div', { class: 'ui-secctl' },
      headingKey ? field({ label: 'Heading on the CV', value: cv().headings[headingKey], onInput: (v) => set((c) => { c.headings[headingKey] = v; }), maxLength: 40 }) : null,
      h('div', { class: 'ui-row ui-between' },
        h('label', { class: 'ui-check' }, show, h('span', null, 'Show this section')),
        h('div', { class: 'ui-row' }, h('span', { class: 'ui-hint' }, 'Position'), up, down)));
  }

  /** Editable list with add / delete (with undo) / reorder. `compact` = one input per row (skills, languages). */
  function listEditor({ get, blank, titleOf, fields, itemLabel, addLabel, compact = false, placeholder = '' }) {
    const wrap = h('div', { class: 'ui-list' });
    const listEl = h('div', { class: 'ui-items' });
    const mutate = (fn) => set(() => fn(get()));

    function render(focusSel) {
      const arr = get();
      listEl.replaceChildren();
      if (!arr.length) listEl.append(h('p', { class: 'ui-empty' }, `No ${itemLabel.toLowerCase()} entries yet.`));
      arr.forEach((item, i) => {
        const ctl = h('div', { class: 'ui-row ui-ctl' },
          btn('', { title: `Move ${itemLabel.toLowerCase()} ${i + 1} up`, icon: '↑', disabled: i === 0, onClick: () => moveItem(i, -1, 'up') }),
          btn('', { title: `Move ${itemLabel.toLowerCase()} ${i + 1} down`, icon: '↓', disabled: i === arr.length - 1, onClick: () => moveItem(i, 1, 'down') }),
          btn('', { title: `Delete ${itemLabel.toLowerCase()} ${i + 1}`, icon: '✕', kind: 'danger-ghost', onClick: () => remove(i) }));
        ctl.children[0].dataset.act = `up${i}`; ctl.children[1].dataset.act = `down${i}`;
        if (compact) {
          const inp = fields(item, i);
          listEl.append(h('div', { class: 'ui-item compact', dataset: { i } }, inp, ctl));
          inp.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
        } else {
          const ttl = h('span', { class: 'ui-item-title' });
          const setTitle = () => { ttl.textContent = titleOf(item) || `${itemLabel} ${i + 1}`; };
          setTitle();
          const card = h('div', { class: 'ui-item', dataset: { i } }, h('div', { class: 'ui-item-head' }, ttl, ctl), h('div', { class: 'ui-item-body' }, fields(item, i)));
          card.addEventListener('input', setTitle);
          listEl.append(card);
        }
      });
      if (focusSel) { const t = listEl.querySelector(`[data-act="${focusSel}"]`) || listEl.querySelector(focusSel); t && !t.disabled && t.focus(); }
    }
    function moveItem(i, d, dir) {
      mutate((a) => { const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; });
      render(`${dir}${i + d}`);
    }
    function remove(i) {
      const removed = get()[i];
      mutate((a) => a.splice(i, 1));
      render();
      toast(`${itemLabel} deleted.`, { action: 'Undo', onAction: () => { mutate((a) => a.splice(Math.min(i, a.length), 0, removed)); render(); } });
    }
    function add() {
      mutate((a) => a.push(blank()));
      render();
      const last = listEl.lastElementChild;
      const first = last && last.querySelector('input,textarea');
      if (first) { first.focus(); last.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    }
    render();
    wrap.append(listEl, btn(addLabel, { kind: 'add', icon: '+', onClick: add }));
    wrap.render = render;
    return wrap;
  }

  const textRow = (item, label, key, opts = {}) => field({ label, value: item[key], onInput: (v) => set(() => { item[key] = v; }), ...opts });

  /* ---------- sections ---------- */
  function build() {
    sections = [];
    root.replaceChildren();

    // Personal information (+ the Contact block of the CV)
    const p = () => cv().person;
    root.append(section('personal', 'Personal information', 'The name uses two styles on the CV: the first name in bold grey, the rest in navy.',
      h('div', { class: 'ui-grid2' },
        field({ label: 'First name (bold)', value: p().firstName, autocomplete: 'given-name', onInput: (v) => set((c) => { c.person.firstName = v; }), maxLength: 40 }),
        field({ label: 'Other names', value: p().otherNames, autocomplete: 'additional-name', onInput: (v) => set((c) => { c.person.otherNames = v; }), maxLength: 60 })),
      field({ label: 'Professional title', value: p().title, onInput: (v) => set((c) => { c.person.title = v; }), maxLength: 90, placeholder: 'e.g. Graduate Mechanical Engineer' }),
      h('div', { class: 'ui-grid2' },
        field({ label: 'Phone number', value: p().phone, type: 'tel', autocomplete: 'tel', onInput: (v) => set((c) => { c.person.phone = v; }), maxLength: 40 }),
        field({ label: 'Email address', value: p().email, type: 'email', autocomplete: 'email', onInput: (v) => set((c) => { c.person.email = v; }), maxLength: 80 })),
      field({ label: 'Residential address', value: p().address, multiline: true, rows: 2, autocomplete: 'street-address', onInput: (v) => set((c) => { c.person.address = v; }), maxLength: 160 }),
      h('h4', { class: 'ui-sub' }, 'Contact block on the CV'),
      sectionControls('contact', 'contact')));

    // Photograph
    photoUI = photoEditor(store);
    root.append(section('photo', 'Profile photograph', null, photoUI));

    // Profile
    root.append(section('profile', 'Professional summary', null,
      sectionControls('profile', 'profile'),
      field({ label: 'Summary', value: cv().profile, multiline: true, rows: 8, maxLength: 3000, hint: 'Press Enter to start a new paragraph.', onInput: (v) => set((c) => { c.profile = v; }) })));

    // Education
    root.append(section('education', 'Education', 'Dates, institution and qualification. Put one qualification or detail per line; each becomes a bullet.',
      sectionControls('education', 'education'),
      listEditor({
        get: () => cv().education, itemLabel: 'Education', addLabel: 'Add education',
        blank: () => ({ id: uid(), dates: '', institution: '', details: '' }),
        titleOf: (e) => [e.dates, e.institution].filter(Boolean).join(' · '),
        fields: (e) => h('div', null,
          textRow(e, 'Year or dates', 'dates', { maxLength: 40, placeholder: 'e.g. 2024 or 2020 – 2024' }),
          textRow(e, 'Institution', 'institution', { maxLength: 120 }),
          textRow(e, 'Qualification / course', 'details', { multiline: true, rows: 2, maxLength: 300, hint: 'One per line.' })),
      })));

    // Work experience
    root.append(section('work', 'Work experience', 'Newest first is usual. Each line in the boxes becomes one bullet point.',
      sectionControls('work', 'work'),
      listEditor({
        get: () => cv().work, itemLabel: 'Job', addLabel: 'Add job',
        blank: () => ({ id: uid(), organisation: '', role: '', dates: '', responsibilities: '', achievements: '' }),
        titleOf: (w) => [w.role, w.organisation].filter(Boolean).join(' · '),
        fields: (w) => h('div', null,
          textRow(w, 'Organisation', 'organisation', { maxLength: 120 }),
          h('div', { class: 'ui-grid2' },
            textRow(w, 'Job title', 'role', { maxLength: 120 }),
            textRow(w, 'Employment dates', 'dates', { maxLength: 40, placeholder: 'e.g. FEB 2024 - DEC 2024' })),
          textRow(w, 'Responsibilities', 'responsibilities', { multiline: true, rows: 5, maxLength: 3000, hint: 'One bullet point per line.' }),
          textRow(w, 'Achievements (optional)', 'achievements', { multiline: true, rows: 3, maxLength: 2000, hint: 'One per line. Shown as extra bullets after the responsibilities.' })),
      })));

    // Skills & languages
    const simple = (key, label, itemLabel, addLabel, ph) => listEditor({
      get: () => cv()[key], itemLabel, addLabel, compact: true,
      blank: () => ({ id: uid(), text: '' }),
      fields: (it, i) => field({ label: `${itemLabel} ${i + 1}`, value: it.text, maxLength: 80, placeholder: ph, onInput: (v) => set(() => { it.text = v; }), extraClass: 'ui-compact-label' }),
    });
    root.append(section('skills', 'Skills', 'Each skill is shown as a bullet in the sidebar. Press Enter to add the next one.', sectionControls('skills', 'skills'), simple('skills', 'Skill', 'Skill', 'Add skill', 'e.g. Teamwork')));
    root.append(section('languages', 'Languages', null, sectionControls('languages', 'languages'), simple('languages', 'Language', 'Language', 'Add language', 'e.g. English (Fluent)')));

    // References
    root.append(section('references', 'References', null,
      sectionControls('reference', 'reference'),
      listEditor({
        get: () => cv().references, itemLabel: 'Reference', addLabel: 'Add reference',
        blank: () => ({ id: uid(), name: '', organisation: '', phone: '', email: '' }),
        titleOf: (r) => r.name,
        fields: (r) => h('div', null,
          textRow(r, 'Name', 'name', { maxLength: 80 }),
          textRow(r, 'Organisation', 'organisation', { maxLength: 100 }),
          h('div', { class: 'ui-grid2' }, textRow(r, 'Phone', 'phone', { maxLength: 40, type: 'tel' }), textRow(r, 'Email', 'email', { maxLength: 80, type: 'email' }))),
      }),
      h('h4', { class: 'ui-sub' }, 'Labels printed on the CV'),
      h('div', { class: 'ui-grid2' },
        field({ label: 'Phone label', value: cv().labels.refPhone, maxLength: 16, onInput: (v) => set((c) => { c.labels.refPhone = v; }) }),
        field({ label: 'Email label', value: cv().labels.refEmail, maxLength: 16, onInput: (v) => set((c) => { c.labels.refEmail = v; }) }))));

    // Extra sections
    root.append(extras());
    refreshStatus();
  }

  /* ---------- extra (custom) sections ---------- */
  function extras() {
    const list = h('div', { class: 'ui-items' });
    const presets = h('div', { class: 'ui-chips', role: 'group', 'aria-label': 'Add a section' },
      PRESETS.map((pr) => h('button', { type: 'button', class: 'ui-chip', onClick: () => addCustom(pr) }, '+ ', pr.label || pr.title)));

    function addCustom(pr) {
      const c = { id: uid(), column: pr.column, title: pr.title, kind: pr.kind, items: pr.kind === 'list' ? [{ id: uid(), text: '' }] : [], text: '' };
      set((x) => { x.custom.push(c); x.order[c.column].push(c.id); });
      render();
      const card = list.lastElementChild; card && card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const inp = card && card.querySelector('input[type=text], input:not([type])'); inp && inp.focus();
    }
    function removeCustom(c) {
      const snap = JSON.parse(JSON.stringify(c)); const col = c.column; const idx = cv().order[col].indexOf(c.id);
      set((x) => { x.custom = x.custom.filter((y) => y.id !== c.id); x.order[col] = x.order[col].filter((id) => id !== c.id); delete x.hidden[c.id]; });
      render();
      toast(`Section "${snap.title || 'Untitled'}" deleted.`, { action: 'Undo', onAction: () => { set((x) => { x.custom.push(snap); x.order[col].splice(Math.min(idx, x.order[col].length), 0, snap.id); }); render(); } });
    }
    function setColumn(c, col) {
      if (c.column === col) return;
      set((x) => { const o = x.order; o[c.column] = o[c.column].filter((id) => id !== c.id); c.column = col; o[col].push(c.id); });
      render();
    }
    function render() {
      list.replaceChildren();
      if (!cv().custom.length) list.append(h('p', { class: 'ui-empty' }, 'No extra sections yet. Add certifications, memberships, interests or anything else below.'));
      cv().custom.forEach((c) => {
        const col = h('select', { 'aria-label': 'Where it appears' }, h('option', { value: 'side' }, 'Left sidebar'), h('option', { value: 'main' }, 'Main column'));
        col.value = c.column;
        col.addEventListener('change', () => setColumn(c, col.value));
        const kind = h('select', { 'aria-label': 'Format' }, h('option', { value: 'list' }, 'Bullet list'), h('option', { value: 'text' }, 'Paragraph'));
        kind.value = c.kind;
        kind.addEventListener('change', () => { set(() => { c.kind = kind.value; }); render(); });
        const body = c.column === 'main' && c.kind === 'text'
          ? field({ label: 'Text', value: c.text, multiline: true, rows: 4, maxLength: 3000, hint: 'Press Enter for a new paragraph.', onInput: (v) => set(() => { c.text = v; }) })
          : listEditor({ get: () => c.items, itemLabel: 'Item', addLabel: 'Add item', compact: true, blank: () => ({ id: uid(), text: '' }),
            fields: (it, i) => field({ label: `Item ${i + 1}`, value: it.text, maxLength: 160, onInput: (v) => set(() => { it.text = v; }), extraClass: 'ui-compact-label' }) });
        list.append(h('div', { class: 'ui-item' },
          h('div', { class: 'ui-item-head' }, h('span', { class: 'ui-item-title' }, c.title || 'Untitled section'), btn('Delete section', { kind: 'danger-ghost', onClick: () => removeCustom(c) })),
          h('div', { class: 'ui-item-body' },
            field({ label: 'Section heading', value: c.title, maxLength: 40, onInput: (v) => set(() => { c.title = v; }) }),
            h('div', { class: 'ui-grid2' }, h('label', { class: 'ui-field' }, h('span', { class: 'ui-lbl' }, 'Appears in'), col), c.column === 'main' ? h('label', { class: 'ui-field' }, h('span', { class: 'ui-lbl' }, 'Format'), kind) : null),
            sectionControls(c.id, null), body)));
      });
    }
    render();
    const el = section('extras', 'Extra sections', 'Certifications, memberships, interests, achievements or anything else. They use the same styling as the rest of the CV.', list, h('h4', { class: 'ui-sub' }, 'Add a section'), presets);
    el.render = render;
    return el;
  }

  /* ---------- status ticks ---------- */
  function refreshStatus() {
    const c = completion(cv());
    const map = { personal: c.personal || c.title || c.contact, photo: c.photo, profile: c.profile, education: c.education, work: c.work, skills: c.skills, languages: c.languages, references: c.references, extras: cv().custom.length > 0 };
    for (const s of sections) s.el.dataset.done = map[s.key] ? '1' : '0';
  }
  store.subscribe(refreshStatus);

  build();
  return {
    /** Rebuild every form (after reset / import / example) */
    rebuild() { const open = sections.filter((s) => s.el.open).map((s) => s.key); build(); sections.forEach((s) => { s.el.open = open.includes(s.key) || (!open.length && s.key === 'personal'); }); },
    openFirst() { sections[0] && (sections[0].el.open = true); },
    sections: () => sections,
  };
}
