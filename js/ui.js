'use strict';
// Dialogy, formuláře, upozornění a společné akce (přidat podnik, návštěvu, poznámku…).
(function (App) {
  const U = App.util;
  const h = U.h;
  const UI = {};

  // ---------- Upozornění ----------
  let toastTimer = null;
  UI.toast = (msg) => {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  // ---------- Výběr podniku s vyhledáváním ----------
  // f.options: [{ value, label, sub, first }] – first = podnik z oblasti dne (řadí se nahoru)
  // Vrací { el, value, focus } – formulář s ním pracuje jako s běžným polem.
  const MAX_SHOWN = 8;
  function podnikPicker(f, id) {
    const items = f.options.map((o) => Object.assign({ key: U.normalize(o.label + ' ' + (o.sub || '')) }, o));
    let value = f.value || '';
    let shown = [];
    let active = 0;

    const input = h('input', {
      id, type: 'search', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
      placeholder: 'Piš název, obec nebo ulici', role: 'combobox',
      'aria-autocomplete': 'list', 'aria-controls': id + '-list', 'aria-expanded': 'true',
    });
    const list = h('ul', { id: id + '-list', class: 'picker-list', role: 'listbox', 'aria-label': 'Nalezené podniky' });
    const more = h('p', { class: 'hint' });
    const searchBox = h('div', { class: 'picker-search' }, input, list, more);
    const chosen = h('div', { class: 'picker-chosen' });
    const el = h('div', { class: 'picker' }, chosen, searchBox);

    const choose = (v) => {
      value = v;
      draw();
      // Po výběru přeskočit na další pole formuláře.
      let f2 = el.closest('.field');
      while (f2 && (f2 = f2.nextElementSibling)) {
        const t = f2.querySelector('input, textarea, select');
        if (t) { t.focus(); return; }
      }
      const btn = chosen.querySelector('button');
      if (btn) btn.focus();
    };

    const filter = () => {
      const words = U.normalize(input.value).split(/\s+/).filter(Boolean);
      const hits = items.filter((it) => words.every((w) => it.key.includes(w)));
      hits.sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || a.label.localeCompare(b.label, 'cs'));
      return hits;
    };

    const drawList = () => {
      const hits = filter();
      shown = hits.slice(0, MAX_SHOWN);
      if (active >= shown.length) active = 0;
      list.replaceChildren(...(shown.length
        ? shown.map((it, i) => h('li', {
          id: id + '-o' + i, role: 'option', class: 'picker-item' + (i === active ? ' active' : ''),
          'aria-selected': i === active ? 'true' : 'false',
          onmousedown: (e) => e.preventDefault(),
          onclick: () => choose(it.value),
        },
          h('span', { class: 'item-title', text: it.label }),
          h('span', { class: 'muted small', text: [it.first ? 'oblast dne' : null, it.sub].filter(Boolean).join(' · ') })))
        : [h('li', { class: 'picker-empty muted', text: items.length ? 'Nic nenalezeno.' : 'Zatím nemáš žádné podniky.' })]));
      input.setAttribute('aria-activedescendant', shown.length ? id + '-o' + active : '');
      more.textContent = hits.length > MAX_SHOWN ? `a ${hits.length - MAX_SHOWN} dalších – upřesni hledání` : '';
    };

    const draw = () => {
      const it = items.find((x) => x.value === value);
      if (it) {
        chosen.hidden = false;
        searchBox.hidden = true;
        chosen.replaceChildren(
          h('span', { class: 'item-body' },
            h('span', { class: 'item-title', text: it.label }),
            it.sub ? h('span', { class: 'muted small', text: it.sub }) : null),
          h('button', {
            type: 'button', class: 'btn small', text: 'Změnit',
            onclick: () => { value = ''; input.value = ''; active = 0; draw(); input.focus(); },
          }));
      } else {
        value = '';
        chosen.hidden = true;
        searchBox.hidden = false;
        drawList();
      }
    };

    input.addEventListener('input', () => { active = 0; drawList(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!shown.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        drawList();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (shown.length) choose(shown[active].value);
      }
    });

    draw();
    return {
      el,
      get value() { return value; },
      focus: () => (value ? chosen.querySelector('button') : input).focus(),
    };
  }

  // ---------- Formulář v dialogu ----------
  // fields: [{ name, label, type, required, value, options, hint, placeholder, autocomplete }]
  // Vrací Promise s hodnotami, nebo null při zrušení.
  UI.form = ({ title, intro, fields = [], submit = 'Uložit', danger = false, validate }) =>
    new Promise((resolve) => {
      const dlg = document.getElementById('dlg');
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        if (dlg.open) dlg.close();
        resolve(val);
      };

      const inputs = {};
      const error = h('p', { class: 'form-error', role: 'alert' });

      const fieldEls = fields.map((f) => {
        const id = 'f-' + f.name;
        let input;
        if (f.type === 'textarea') {
          input = h('textarea', { id, name: f.name, rows: f.rows || 4, required: f.required, placeholder: f.placeholder, value: f.value || '' });
        } else if (f.type === 'select') {
          const opts = [];
          let group = null;
          for (const o of f.options) {
            const opt = h('option', { value: o.value, text: o.label });
            if (o.group) {
              if (!group || group.label !== o.group) {
                group = h('optgroup', { label: o.group });
                opts.push(group);
              }
              group.append(opt);
            } else {
              group = null;
              opts.push(opt);
            }
          }
          input = h('select', { id, name: f.name, required: f.required }, opts);
          input.value = f.value == null ? '' : f.value;
        } else if (f.type === 'checkboxes') {
          const vals = (f.value || []).map(String);
          input = h('div', { class: 'checks', role: 'group', 'aria-labelledby': id + '-l' },
            f.options.map((o) =>
              h('label', { class: 'check' },
                h('input', { type: 'checkbox', name: f.name, value: o.value, checked: vals.includes(String(o.value)) }),
                h('span', { text: o.label }))));
          inputs[f.name] = input;
          return h('div', { class: 'field' }, h('span', { class: 'label', id: id + '-l', text: f.label }), input, f.hint ? h('p', { class: 'hint', text: f.hint }) : null);
        } else if (f.type === 'podnik') {
          const picker = podnikPicker(f, id);
          inputs[f.name] = picker;
          return h('div', { class: 'field' },
            h('label', { for: id, class: 'label' }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null),
            picker.el,
            f.hint ? h('p', { class: 'hint', text: f.hint }) : null);
        } else if (f.type === 'checkbox') {
          input = h('input', { id, type: 'checkbox', name: f.name, checked: !!f.value, required: f.required });
          inputs[f.name] = input;
          return h('label', { class: 'field check-row' }, input, h('span', { text: f.label }));
        } else {
          input = h('input', {
            id, name: f.name, type: f.type || 'text', required: f.required, placeholder: f.placeholder,
            autocomplete: f.autocomplete || (f.type === 'password' ? 'off' : null), value: f.value == null ? '' : f.value,
            minlength: f.minlength, spellcheck: f.type === 'password' ? 'false' : null,
          });
        }
        inputs[f.name] = input;
        return h('div', { class: 'field' },
          h('label', { for: id, class: 'label' }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null),
          input,
          f.hint ? h('p', { class: 'hint', text: f.hint }) : null);
      });

      const collect = () => {
        const out = {};
        for (const f of fields) {
          const el = inputs[f.name];
          if (f.type === 'checkboxes') out[f.name] = [...el.querySelectorAll('input:checked')].map((c) => c.value);
          else if (f.type === 'checkbox') out[f.name] = el.checked;
          else out[f.name] = typeof el.value === 'string' && f.type !== 'password' && f.type !== 'textarea' ? el.value.trim() : el.value;
        }
        return out;
      };

      const form = h('form', {
        class: 'form',
        novalidate: true,
        onsubmit: async (e) => {
          e.preventDefault();
          error.textContent = '';
          for (const f of fields) {
            const el = inputs[f.name];
            if (f.required && f.type !== 'checkboxes' && f.type !== 'checkbox' && !String(el.value).trim()) {
              error.textContent = `Vyplň pole „${f.label}“.`;
              el.focus();
              return;
            }
            if (f.required && f.type === 'checkbox' && !el.checked) {
              error.textContent = `Potvrď „${f.label}“.`;
              el.focus();
              return;
            }
          }
          const vals = collect();
          if (validate) {
            const msg = await validate(vals);
            if (msg) {
              error.textContent = msg;
              return;
            }
          }
          finish(vals);
        },
      },
        h('h2', { class: 'dlg-title', text: title }),
        intro ? h('p', { class: 'muted', text: intro }) : null,
        fieldEls,
        error,
        h('div', { class: 'dlg-actions' },
          h('button', { type: 'button', class: 'btn', text: 'Zrušit', onclick: () => finish(null) }),
          h('button', { type: 'submit', class: danger ? 'btn danger' : 'btn primary', text: submit })));

      dlg.replaceChildren(form);
      dlg.onclose = () => finish(null);
      dlg.showModal();
      const first = form.querySelector('input:not([type=checkbox]), textarea, select');
      if (first) first.focus();
    });

  UI.confirm = (title, text, ok = 'Smazat') =>
    UI.form({ title, intro: text, submit: ok, danger: true }).then((v) => !!v);

  // ---------- Malé součásti ----------
  UI.empty = (text) => h('p', { class: 'empty', text });

  UI.chip = (text, kind) => h('span', { class: 'chip' + (kind ? ' ' + kind : ''), text });

  UI.segmented = (active, iso) =>
    h('nav', { class: 'segmented', 'aria-label': 'Pohled kalendáře' },
      [['den', 'Den', '#/den/' + iso], ['tyden', 'Týden', '#/tyden/' + U.mondayOf(iso)], ['mesic', 'Měsíc', '#/mesic/' + iso.slice(0, 7)]]
        .map(([k, label, href]) => h('a', { href, class: k === active ? 'active' : null, 'aria-current': k === active ? 'page' : null, text: label })));

  UI.viewHead = (titleText, sub, actions) =>
    h('header', { class: 'view-head' },
      h('div', null, sub ? h('p', { class: 'muted small', text: sub }) : null, h('h1', { text: titleText })),
      actions ? h('div', { class: 'head-actions' }, actions) : null);

  // Akce se zachycením chyby (např. zamčení během ukládání).
  UI.run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error(e);
      UI.toast(e && e.message ? 'Chyba: ' + e.message : 'Něco se nepovedlo.');
    }
  };

  // ---------- Společné akce ----------
  const A = {};

  const oblastOptions = () => [{ value: '', label: 'Bez oblasti' }].concat(
    App.model.oblasti().map((o) => ({ value: o.id, label: o.nazev })));
  const frekvenceOptions = () => [{ value: '', label: 'Bez frekvence' }].concat(
    Object.entries(App.model.FREKVENCE).map(([k, f]) => ({ value: k, label: f.label })));

  A.upravitPodnik = async (p) => {
    const isNew = !p;
    p = p || {};
    const v = await UI.form({
      title: isNew ? 'Nový podnik' : 'Upravit podnik',
      intro: isNew ? 'Stačí název a adresa. Zbytek doplníš kdykoli.' : null,
      fields: [
        { name: 'nazev', label: 'Název', required: true, value: p.nazev },
        { name: 'adresa', label: 'Adresa', required: true, value: p.adresa, placeholder: 'Ulice a číslo, obec' },
        { name: 'oblastId', label: 'Oblast', type: 'select', options: oblastOptions(), value: p.oblastId || '',
          hint: App.model.oblasti().length ? null : 'Oblasti založíš v Nastavení.' },
        { name: 'frekvence', label: 'Frekvence návštěv', type: 'select', options: frekvenceOptions(), value: p.frekvence || '' },
        { name: 'kontakt', label: 'Kontaktní osoba', value: p.kontakt },
        { name: 'telefon', label: 'Telefon', type: 'tel', value: p.telefon },
        { name: 'crm', label: 'Číslo zákazníka v CRM', value: p.crm },
      ],
    });
    if (!v) return null;
    const saved = await App.store.save(Object.assign({}, p, v, { type: 'podnik' }));
    UI.toast(isNew ? 'Podnik přidán' : 'Uloženo');
    return saved;
  };

  // Podniky pro vyhledávací výběr. Podniky z oblastí daného dne jdou nahoru.
  const podnikOptions = (iso) => {
    const dne = new Set(iso ? App.model.oblastiDne(iso).map((o) => o.id) : []);
    return App.model.podniky().map((p) => {
      const o = App.model.oblast(p.oblastId);
      return { value: p.id, label: p.nazev, sub: [p.adresa, o ? o.nazev : null].filter(Boolean).join(' · '), first: dne.has(p.oblastId) };
    });
  };

  A.naplanovatNavstevu = async (datum, podnikId) => {
    if (!App.model.podniky().length) {
      UI.toast('Nejdřív přidej podnik');
      return null;
    }
    const v = await UI.form({
      title: 'Naplánovat návštěvu',
      fields: [
        { name: 'podnikId', label: 'Podnik', type: 'podnik', required: true, options: podnikOptions(datum), value: podnikId || '' },
        { name: 'datum', label: 'Datum', type: 'date', required: true, value: datum || U.today() },
        { name: 'cas', label: 'Čas (nepovinné)', type: 'time' },
      ],
      submit: 'Naplánovat',
    });
    if (!v) return null;
    const e = await App.store.save({
      type: 'udalost', typ: 'navsteva', podnikId: v.podnikId, datum: v.datum, cas: v.cas,
      stav: 'planovano', poradi: App.model.dalsiPoradi(v.datum),
    });
    UI.toast('Návštěva naplánována na ' + U.formatDate(v.datum));
    return e;
  };

  A.upravitUdalost = async (e, datum) => {
    const isNew = !e;
    e = e || { typ: 'schuzka' };
    if (e.typ === 'navsteva') {
      const v = await UI.form({
        title: 'Upravit návštěvu',
        fields: [
          { name: 'podnikId', label: 'Podnik', type: 'podnik', required: true, options: podnikOptions(e.datum), value: e.podnikId },
          { name: 'datum', label: 'Datum', type: 'date', required: true, value: e.datum },
          { name: 'cas', label: 'Čas (nepovinné)', type: 'time', value: e.cas },
        ],
      });
      if (!v) return null;
      const moved = v.datum !== e.datum;
      return App.store.save(Object.assign({}, e, v, moved ? { poradi: App.model.dalsiPoradi(v.datum), stav: 'planovano' } : {}));
    }
    const v = await UI.form({
      title: isNew ? 'Schůzka nebo akce' : 'Upravit',
      fields: [
        { name: 'typ', label: 'Typ', type: 'select', options: [{ value: 'schuzka', label: 'Schůzka' }, { value: 'akce', label: 'Akce (ochutnávka, festival…)' }], value: e.typ },
        { name: 'nazev', label: 'Název', required: true, value: e.nazev, placeholder: 'Např. schůzka s majitelem' },
        { name: 'podnikId', label: 'Podnik (nepovinné)', type: 'podnik', options: podnikOptions(e.datum || datum), value: e.podnikId || '' },
        { name: 'datum', label: 'Datum', type: 'date', required: true, value: e.datum || datum || U.today() },
        { name: 'cas', label: 'Čas', type: 'time', value: e.cas },
      ],
    });
    if (!v) return null;
    const base = isNew ? { type: 'udalost', stav: 'planovano', poradi: App.model.dalsiPoradi(v.datum) } : {};
    const saved = await App.store.save(Object.assign({}, e, base, v));
    UI.toast('Uloženo');
    return saved;
  };

  // Poznámka. ctx: { datum, podnikId, udalostId } – podle toho, odkud se zakládá.
  A.upravitPoznamku = async (n, ctx) => {
    const isNew = !n;
    n = n || Object.assign({ datum: U.today() }, ctx);
    const fields = [{ name: 'text', label: 'Poznámka', type: 'textarea', required: true, value: n.text }];
    if (!n.udalostId) {
      fields.push({ name: 'podnikId', label: 'Podnik (nepovinné)', type: 'podnik',
        options: podnikOptions(n.datum), value: n.podnikId || '',
        hint: 'Nech prázdné pro poznámku ke dni.' });
    }
    fields.push(
      { name: 'datum', label: 'Datum poznámky', type: 'date', required: true, value: n.datum },
      { name: 'pripominka', label: 'Připomenout dne (nepovinné)', type: 'date', value: n.pripominka,
        hint: 'Poznámka se ten den objeví v kalendáři.' });
    const v = await UI.form({ title: isNew ? (n.udalostId ? 'Poznámka k návštěvě' : 'Nová poznámka') : 'Upravit poznámku', fields });
    if (!v) return null;
    const out = Object.assign({}, n, v, { type: 'poznamka' });
    if (!v.pripominka) out.pripominkaHotova = false;
    if (n.pripominka !== v.pripominka) out.pripominkaHotova = false;
    const saved = await App.store.save(out);
    UI.toast(v.pripominka ? 'Uloženo, připomenu ' + U.formatDate(v.pripominka) : 'Poznámka uložena');
    return saved;
  };

  A.smazat = async (obj, co) => {
    if (!(await UI.confirm('Smazat ' + co + '?', 'Tuhle akci nejde vrátit.'))) return false;
    await App.store.remove(obj.id);
    UI.toast('Smazáno');
    return true;
  };

  App.ui = UI;
  App.actions = A;
})(window.App);
