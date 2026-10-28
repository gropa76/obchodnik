'use strict';
// Podniky: seznam s hledáním a filtrem, detail podniku s historií.
(function (App) {
  const U = App.util;
  const h = U.h;
  const M = App.model;
  const UI = App.ui;
  const A = App.actions;
  const V = (App.views = App.views || {});
  const run = UI.run;

  // Stav filtrů zůstává při překreslení.
  const state = { q: '', oblast: '', jenNedoplnene: false, razeni: 'nazev' };

  const popis = (p) => {
    const o = M.oblast(p.oblastId);
    const f = M.FREKVENCE[p.frekvence];
    const last = M.posledniNavsteva(p.id);
    return [o ? o.nazev : 'bez oblasti', f ? f.short : 'bez frekvence', last ? 'naposledy ' + U.relDays(last) : 'zatím bez návštěvy'].join(' · ');
  };

  V.podniky = () => {
    const all = M.podniky();
    const nedoplnene = M.nedoplnene();
    const listEl = h('ul', { class: 'list card-list' });
    const countEl = h('span', { class: 'muted small' });

    const render = () => {
      const q = U.normalize(state.q);
      let items = all.filter((p) =>
        (!q || U.normalize(p.nazev + ' ' + p.adresa + ' ' + (p.kontakt || '')).includes(q)) &&
        (!state.oblast || (state.oblast === '-' ? !M.oblast(p.oblastId) : p.oblastId === state.oblast)) &&
        (!state.jenNedoplnene || nedoplnene.includes(p)));
      if (state.razeni === 'navsteva') {
        items = items.slice().sort((a, b) => (M.posledniNavsteva(a.id) || '').localeCompare(M.posledniNavsteva(b.id) || ''));
      }
      countEl.textContent = `${items.length} z ${all.length}`;
      listEl.replaceChildren(...(items.length
        ? items.map((p) => {
          const over = M.propadlo(p);
          return h('li', null,
            h('a', { class: 'row-link', href: '#/podnik/' + p.id },
              h('span', { class: 'item-body' },
                h('span', { class: 'item-title', text: p.nazev }),
                h('span', { class: 'muted small', text: popis(p) })),
              over ? UI.chip(`propadlo ${over} ${U.plural(over, 'den', 'dny', 'dní')}`, 'hot') : null));
        })
        : [h('li', null, UI.empty(all.length ? 'Nic neodpovídá filtru.' : 'Zatím žádné podniky. Přidej první – stačí název a adresa.'))]));
    };

    const head = UI.viewHead('Podniky', null, [
      h('button', { class: 'btn primary', text: '+ Přidat podnik', onclick: run(async () => {
        const p = await A.upravitPodnik(null);
        if (p) U.go('#/podnik/' + p.id);
      }) }),
    ]);

    const filters = h('div', { class: 'filters' },
      h('label', { class: 'search' },
        h('span', { class: 'sr-only', text: 'Hledat' }),
        h('input', { type: 'search', placeholder: 'Hledat název, adresu, kontakt', value: state.q,
          oninput: (e) => { state.q = e.target.value; render(); } })),
      h('label', { class: 'select-inline' },
        h('span', { class: 'sr-only', text: 'Oblast' }),
        h('select', { onchange: (e) => { state.oblast = e.target.value; render(); }, value: state.oblast },
          h('option', { value: '', text: 'Všechny oblasti' }),
          M.oblasti().map((o) => h('option', { value: o.id, text: o.nazev })),
          h('option', { value: '-', text: 'Bez oblasti' }))),
      h('label', { class: 'select-inline' },
        h('span', { class: 'sr-only', text: 'Řazení' }),
        h('select', { onchange: (e) => { state.razeni = e.target.value; render(); }, value: state.razeni },
          h('option', { value: 'nazev', text: 'Podle názvu' }),
          h('option', { value: 'navsteva', text: 'Nejdéle bez návštěvy' }))));

    const notice = nedoplnene.length
      ? h('button', {
        class: 'notice' + (state.jenNedoplnene ? ' active' : ''),
        'aria-pressed': state.jenNedoplnene ? 'true' : 'false',
        onclick: () => { state.jenNedoplnene = !state.jenNedoplnene; U.go('#/podniky'); },
      },
        h('span', { text: `${nedoplnene.length} ${U.plural(nedoplnene.length, 'podnik', 'podniky', 'podniků')} bez oblasti nebo frekvence` }),
        h('strong', { text: state.jenNedoplnene ? 'Zobrazit vše' : 'Ukázat' }))
      : null;

    render();
    return h('section', { class: 'view' }, head, filters, notice, h('div', { class: 'block-head' }, h('span'), countEl), listEl);
  };

  V.podnik = (id) => {
    const p = M.podnik(id);
    if (!p) {
      return h('section', { class: 'view' }, UI.viewHead('Podnik nenalezen'), h('a', { href: '#/podniky', text: '‹ Zpět na podniky' }));
    }
    const o = M.oblast(p.oblastId);
    const f = M.FREKVENCE[p.frekvence];
    const last = M.posledniNavsteva(p.id);
    const today = U.today();
    const events = M.udalostiPodniku(p.id);
    const planned = events.filter((e) => e.stav === 'planovano' && e.datum >= today).sort((a, b) => a.datum.localeCompare(b.datum));

    // Časová osa: proběhlé události + poznámky, od nejnovějších.
    const timeline = []
      .concat(events.filter((e) => !(e.stav === 'planovano' && e.datum >= today)).map((e) => ({ datum: e.datum, kind: 'e', e })))
      .concat(M.poznamkyPodniku(p.id).map((n) => ({ datum: n.datum, kind: 'n', n })))
      .sort((a, b) => b.datum.localeCompare(a.datum) || (a.kind === 'e' ? -1 : 1));

    const stavText = { planovano: 'naplánováno', hotovo: 'hotovo', odpadlo: 'odpadlo' };

    return h('section', { class: 'view' },
      h('a', { class: 'back', href: '#/podniky', text: '‹ Podniky' }),
      UI.viewHead(p.nazev, p.adresa, [
        h('button', { class: 'btn', text: 'Upravit', onclick: run(() => A.upravitPodnik(p)) }),
      ]),
      h('div', { class: 'chips' },
        UI.chip(o ? o.nazev : 'Bez oblasti', o ? null : 'warn'),
        UI.chip(f ? f.label : 'Bez frekvence', f ? null : 'warn'),
        UI.chip(last ? 'Naposledy ' + U.formatDate(last) : 'Zatím bez návštěvy'),
        M.propadlo(p) ? UI.chip(`propadlo ${M.propadlo(p)} dní`, 'hot') : null),
      p.kontakt || p.telefon || p.crm
        ? h('p', { class: 'muted' }, [p.kontakt, p.telefon, p.crm ? 'CRM ' + p.crm : null].filter(Boolean).join(' · '))
        : null,
      h('div', { class: 'toolbar' },
        h('button', { class: 'btn primary', text: 'Naplánovat návštěvu', onclick: run(() => A.naplanovatNavstevu(M.dalsiDenProPodnik(p.id, U.addDays(today, -1)), p.id)) }),
        h('button', { class: 'btn', text: '+ Poznámka', onclick: run(() => A.upravitPoznamku(null, { datum: today, podnikId: p.id })) }),
        p.adresa ? h('a', { class: 'btn', href: U.mapHref(p.adresa), target: '_blank', rel: 'noopener noreferrer', text: 'Navigovat' }) : null,
        p.telefon ? h('a', { class: 'btn', href: U.telHref(p.telefon), text: 'Zavolat' }) : null),

      planned.length
        ? h('section', { class: 'block' },
          h('h2', { text: 'Naplánováno' }),
          h('ul', { class: 'list' }, planned.map((e) =>
            h('li', null, h('a', { class: 'row-link', href: '#/den/' + e.datum },
              h('span', { class: 'item-body' },
                h('span', { class: 'item-title', text: U.formatDateLong(e.datum) + (e.cas ? ' · ' + e.cas : '') }),
                h('span', { class: 'muted small', text: M.TYP_UDALOSTI[e.typ] + ' · ' + U.relDays(e.datum) })))))))
        : null,

      h('section', { class: 'block' },
        h('h2', { text: 'Historie' }),
        timeline.length
          ? h('ol', { class: 'timeline' }, timeline.map((t) => t.kind === 'e'
            ? h('li', { class: 'tl-event' },
              h('span', { class: 'muted small', text: `${U.formatDateYear(t.datum)} · ${M.TYP_UDALOSTI[t.e.typ]} · ${stavText[t.e.stav]}` }),
              t.e.typ !== 'navsteva' && t.e.nazev ? h('span', { text: t.e.nazev }) : null)
            : h('li', { class: 'tl-note' },
              h('span', { class: 'muted small', text: U.formatDateYear(t.datum) + ' · Poznámka' }),
              h('span', { class: 'pre', text: t.n.text }),
              h('span', { class: 'tl-actions' },
                t.n.pripominka ? UI.chip((t.n.pripominkaHotova ? 'vyřízeno ' : 'připomenout ') + U.formatDate(t.n.pripominka)) : null,
                h('button', { class: 'btn small ghost', text: 'Upravit', onclick: run(() => A.upravitPoznamku(t.n)) })))))
          : UI.empty('Zatím žádná historie.')),

      h('div', { class: 'danger-zone' },
        h('button', { class: 'btn ghost', text: 'Smazat podnik', onclick: run(async () => {
          if (await A.smazat(p, 'podnik „' + p.nazev + '“')) U.go('#/podniky');
        }) })));
  };
})(window.App);
