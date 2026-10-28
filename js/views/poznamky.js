'use strict';
// Seznam všech poznámek s hledáním a filtrem.
(function (App) {
  const U = App.util;
  const h = U.h;
  const M = App.model;
  const UI = App.ui;
  const A = App.actions;
  const V = (App.views = App.views || {});
  const run = UI.run;

  const state = { q: '', filtr: 'vse' };

  V.poznamky = () => {
    const all = M.poznamky();
    const listEl = h('ul', { class: 'list card-list' });

    const render = () => {
      const q = U.normalize(state.q);
      const items = all.filter((n) => {
        const p = M.podnik(n.podnikId);
        if (q && !U.normalize(n.text + ' ' + (p ? p.nazev : '')).includes(q)) return false;
        if (state.filtr === 'pripominky') return n.pripominka && !n.pripominkaHotova;
        if (state.filtr === 'podniky') return !!n.podnikId;
        if (state.filtr === 'dny') return !n.podnikId;
        return true;
      });
      listEl.replaceChildren(...(items.length
        ? items.map((n) => {
          const p = M.podnik(n.podnikId);
          return h('li', { class: 'item' },
            h('div', { class: 'item-body' },
              h('p', { class: 'muted small' },
                h('a', { href: '#/den/' + n.datum, text: U.formatDateYear(n.datum) }),
                p ? ' · ' : null,
                p ? h('a', { href: '#/podnik/' + p.id, text: p.nazev }) : null,
                n.udalostId ? ' · k návštěvě' : null),
              h('p', { class: 'item-text pre', text: n.text }),
              n.pripominka
                ? UI.chip((n.pripominkaHotova ? 'vyřízeno ' : 'připomenout ') + U.formatDate(n.pripominka),
                  !n.pripominkaHotova && n.pripominka < U.today() ? 'hot' : 'accent')
                : null),
            h('div', { class: 'item-actions' },
              h('button', { class: 'btn small', text: 'Upravit', onclick: run(() => A.upravitPoznamku(n)) }),
              h('button', { class: 'btn small ghost', text: 'Smazat', onclick: run(() => A.smazat(n, 'poznámku')) })));
        })
        : [h('li', null, UI.empty(all.length ? 'Nic neodpovídá hledání.' : 'Zatím žádné poznámky.'))]));
    };

    const tabs = [['vse', 'Vše'], ['pripominky', 'S připomínkou'], ['podniky', 'K podnikům'], ['dny', 'Ke dni']];
    const filters = h('div', { class: 'filters' },
      h('label', { class: 'search' },
        h('span', { class: 'sr-only', text: 'Hledat v poznámkách' }),
        h('input', { type: 'search', placeholder: 'Hledat v poznámkách', value: state.q,
          oninput: (e) => { state.q = e.target.value; render(); } })),
      h('div', { class: 'pills', role: 'group', 'aria-label': 'Filtr' },
        tabs.map(([k, label]) => h('button', {
          class: 'pill' + (state.filtr === k ? ' active' : ''),
          'aria-pressed': state.filtr === k ? 'true' : 'false',
          text: label,
          onclick: () => { state.filtr = k; U.go('#/poznamky'); },
        }))));

    render();
    return h('section', { class: 'view' },
      UI.viewHead('Poznámky', `${all.length} ${U.plural(all.length, 'poznámka', 'poznámky', 'poznámek')}`, [
        h('button', { class: 'btn primary', text: '+ Poznámka', onclick: run(() => A.upravitPoznamku(null, { datum: U.today() })) }),
      ]),
      filters, listEl);
  };
})(window.App);
