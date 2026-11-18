'use strict';
// Import podniků z Excelu: vložení ze schránky nebo soubor CSV → náhled → uložení.
(function (App) {
  const U = App.util;
  const h = U.h;
  const M = App.model;
  const UI = App.ui;
  const V = (App.views = App.views || {});
  const run = UI.run;

  // Rozpracovaný import (aby nezmizel při překreslení).
  const state = { oblastId: '', text: '', plan: null, fileName: '' };

  V.importPodniku = () => {
    const view = h('section', { class: 'view' },
      h('a', { class: 'back', href: '#/podniky', text: '‹ Podniky' }),
      UI.viewHead('Import podniků z Excelu'));
    view.append(state.plan ? preview() : vstup());
    return view;
  };

  function vstup() {
    const oblasti = M.oblasti();
    if (!oblasti.some((o) => o.id === state.oblastId)) state.oblastId = oblasti.length ? oblasti[0].id : '';
    const err = h('p', { class: 'form-error', role: 'alert' });
    const ta = h('textarea', {
      id: 'imp-text', rows: 8, spellcheck: 'false', value: state.text,
      placeholder: 'Název\tObec\tNázev velkoskladu\n…',
      oninput: (e) => { state.text = e.target.value; state.fileName = ''; },
    });
    const file = h('input', {
      id: 'imp-file', type: 'file', accept: '.csv,.txt,text/csv,text/plain',
      onchange: run(async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        state.text = await App.io.readFile(f);
        state.fileName = f.name;
        ta.value = state.text;
        UI.toast('Načteno: ' + f.name);
      }),
    });
    const nacist = () => {
      err.textContent = '';
      const plan = App.io.planImport(state.text);
      if (plan.error) { err.textContent = plan.error; return; }
      state.plan = plan;
      U.go('#/import');
    };

    return h('div', { class: 'import' },
      h('div', { class: 'card prose' },
        h('p', null, 'Tabulka potřebuje sloupce ', h('strong', { text: 'Název' }), ', ', h('strong', { text: 'Obec' }),
          ' a případně ', h('strong', { text: 'Název velkoskladu' }), '. Další sloupce se přeskočí, prázdné řádky taky.'),
        h('p', { class: 'muted small', text: 'Data se zpracují jen v tomto zařízení a nikam se neposílají.' })),

      h('div', { class: 'field' },
        h('label', { for: 'imp-oblast', class: 'label', text: '1. Oblast pro všechny importované podniky' }),
        h('select', { id: 'imp-oblast', value: state.oblastId, onchange: (e) => { state.oblastId = e.target.value; } },
          oblasti.map((o) => h('option', { value: o.id, text: o.nazev })),
          h('option', { value: '', text: 'Bez oblasti' })),
        oblasti.length ? null : h('p', { class: 'hint' }, 'Zatím nemáš žádné oblasti. ', h('a', { href: '#/nastaveni', text: 'Založ je v Nastavení' }), '.')),

      h('div', { class: 'field' },
        h('label', { for: 'imp-text', class: 'label', text: '2a. Vlož tabulku z Excelu' }),
        h('p', { class: 'hint', text: 'V Excelu označ tabulku i se záhlavím, dej Ctrl+C a sem Ctrl+V.' }),
        ta),
      h('div', { class: 'field' },
        h('label', { for: 'imp-file', class: 'label', text: '2b. Nebo vyber soubor CSV' }),
        h('p', { class: 'hint', text: 'V Excelu: Soubor → Uložit jako → CSV UTF-8 (oddělený středníkem).' }),
        file),
      err,
      h('div', { class: 'toolbar' }, h('button', { class: 'btn primary', text: 'Načíst a zkontrolovat', onclick: nacist })));
  }

  function preview() {
    const p = state.plan;
    const oblast = M.oblast(state.oblastId);
    const celkem = p.nove.length + p.doplnit.length;
    const MAX = 30;

    const souhrn = h('ul', { class: 'list card-list' },
      row(`${p.nove.length} ${U.plural(p.nove.length, 'nový podnik', 'nové podniky', 'nových podniků')}`, `přidají se do oblasti ${oblast ? oblast.nazev : '„bez oblasti“'}`, p.nove.length ? 'ok' : null),
      p.doplnit.length ? row(`${p.doplnit.length} už v appce máš`, 'doplní se jen velkosklad, nic jiného se nezmění', 'ok') : null,
      p.beze.length ? row(`${p.beze.length} už v appce máš beze změny`, 'přeskočí se') : null,
      p.duplicity ? row(`${p.duplicity} ${U.plural(p.duplicity, 'řádek je', 'řádky jsou', 'řádků je')} v tabulce dvakrát`, 'použije se jen první') : null,
      p.chyby.length ? row(`${p.chyby.length} ${U.plural(p.chyby.length, 'chybný řádek', 'chybné řádky', 'chybných řádků')}`, 'přeskočí se – viz níže', 'warn') : null);

    const tabulka = p.nove.length
      ? h('section', { class: 'block' },
        h('h2', { text: 'Nové podniky' + (p.nove.length > MAX ? ` (prvních ${MAX})` : '') }),
        h('div', { class: 'table-wrap' },
          h('table', { class: 'table' },
            h('thead', null, h('tr', null, h('th', { text: 'Název' }), h('th', { text: 'Obec' }), h('th', { text: 'Velkosklad' }))),
            h('tbody', null, p.nove.slice(0, MAX).map((x) =>
              h('tr', null, h('td', { text: x.nazev }), h('td', { text: x.obec || x.adresa }), h('td', { text: x.velkosklad || '—' })))))))
      : null;

    const chyby = p.chyby.length
      ? h('section', { class: 'block' },
        h('h2', { text: 'Chybné řádky' }),
        h('ul', { class: 'list card-list' }, p.chyby.slice(0, 50).map((c) =>
          h('li', { class: 'item' }, h('span', { class: 'item-body', text: `Řádek ${c.line}: ${c.text}` })))))
      : null;

    const zpet = () => { state.plan = null; U.go('#/import'); };
    const btn = h('button', {
      class: 'btn primary', text: celkem ? `Importovat (${celkem})` : 'Není co importovat', disabled: !celkem,
      onclick: run(async () => {
        btn.disabled = true;
        btn.textContent = 'Ukládám…';
        const res = await App.io.runImport(p, state.oblastId);
        state.plan = null;
        state.text = '';
        UI.toast(`Hotovo: ${res.nove} nových` + (res.doplneno ? `, ${res.doplneno} doplněno` : ''));
        U.go('#/podniky');
      }),
    });

    return h('div', { class: 'import' },
      p.col.header ? null : h('p', { class: 'notice', text: 'Tabulka nemá záhlaví, sloupce beru v pořadí Název, Obec, Velkosklad.' }),
      souhrn, chyby, tabulka,
      h('div', { class: 'toolbar' }, h('button', { class: 'btn', text: 'Zpět', onclick: zpet }), btn));
  }

  function row(title, sub, kind) {
    return h('li', { class: 'item' },
      h('span', { class: 'item-body' },
        h('span', { class: 'item-title', text: title }),
        h('span', { class: 'muted small', text: sub })),
      kind === 'ok' ? UI.chip('✓', 'done') : kind === 'warn' ? UI.chip('!', 'hot') : null);
  }
})(window.App);
