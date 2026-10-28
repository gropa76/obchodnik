'use strict';
// Kalendář: den (trasa, připomínky, poznámky), týden, měsíc.
(function (App) {
  const U = App.util;
  const h = U.h;
  const M = App.model;
  const S = App.store;
  const UI = App.ui;
  const A = App.actions;
  const V = (App.views = App.views || {});
  const run = UI.run;

  // ---------- Den ----------
  V.den = (iso) => {
    const today = U.today();
    const events = M.udalostiDne(iso);
    const oblasti = M.oblastiDne(iso);
    const doneCount = events.filter((e) => e.stav === 'hotovo').length;

    const head = UI.viewHead(U.formatDateLong(iso), `Týden ${U.isoWeek(iso)}${iso === today ? ' · dnes' : ''}`, [
      h('button', { class: 'btn icon', 'aria-label': 'Předchozí den', text: '‹', onclick: () => U.go('#/den/' + U.addDays(iso, -1)) }),
      iso !== today ? h('button', { class: 'btn', text: 'Dnes', onclick: () => U.go('#/den/' + today) }) : null,
      h('button', { class: 'btn icon', 'aria-label': 'Další den', text: '›', onclick: () => U.go('#/den/' + U.addDays(iso, 1)) }),
    ]);

    const addRow = h('div', { class: 'toolbar' },
      h('button', { class: 'btn primary', text: '+ Návštěva', onclick: run(() => A.naplanovatNavstevu(iso)) }),
      h('button', { class: 'btn', text: '+ Schůzka / akce', onclick: run(() => A.upravitUdalost(null, iso)) }),
      h('button', { class: 'btn', text: '+ Poznámka', onclick: run(() => A.upravitPoznamku(null, { datum: iso })) }));

    // Připomínky
    const reminders = M.pripominkyDne(iso).map((n) => ({ n, late: false }));
    if (iso === today) M.pripominkyPoTerminu().forEach((n) => reminders.unshift({ n, late: true }));
    const remSection = reminders.length
      ? h('section', { class: 'block' },
        h('h2', { text: 'Připomínky' }),
        h('ul', { class: 'list' }, reminders.map(({ n, late }) => reminderItem(n, late))))
      : null;

    // Plán dne
    const planHead = h('div', { class: 'block-head' },
      h('h2', { text: 'Plán dne' + (oblasti.length ? ' · ' + oblasti.map((o) => o.nazev).join(', ') : '') }),
      events.length ? h('span', { class: 'muted small', text: `${doneCount} z ${events.length} hotovo` }) : null);
    const plan = h('section', { class: 'block' }, planHead,
      events.length
        ? h('ol', { class: 'events' }, events.map((e, i) => eventCard(e, i, events)))
        : UI.empty(oblasti.length
          ? 'Na tento den nemáš nic naplánováno. Přidej návštěvu – podniky z oblasti dne budou v nabídce nahoře.'
          : 'Na tento den nemáš nic naplánováno.'));

    // Poznámky dne (bez poznámek k návštěvám – ty jsou u návštěvy)
    const notes = M.poznamky().filter((n) => n.datum === iso && !n.udalostId);
    const notesSection = h('section', { class: 'block' },
      h('h2', { text: 'Poznámky dne' }),
      notes.length ? h('ul', { class: 'list' }, notes.map((n) => noteItem(n))) : UI.empty('Žádné poznámky.'));

    return h('section', { class: 'view' }, head, UI.segmented('den', iso), addRow, remSection, plan, notesSection);
  };

  function reminderItem(n, late) {
    const p = M.podnik(n.podnikId);
    return h('li', { class: 'item reminder' + (late ? ' late' : '') },
      h('label', { class: 'check-row' },
        h('input', {
          type: 'checkbox', 'aria-label': 'Vyřízeno',
          onchange: run(async () => {
            await S.save(Object.assign({}, n, { pripominkaHotova: true }));
            UI.toast('Připomínka vyřízena');
          }),
        }),
        h('span', { class: 'item-body' },
          h('span', { class: 'item-text', text: n.text }),
          h('span', { class: 'muted small' },
            late ? h('span', { class: 'chip hot', text: 'po termínu · ' + U.formatDate(n.pripominka) }) : null,
            p ? ' ' + p.nazev : ''))));
  }

  function noteItem(n) {
    const p = M.podnik(n.podnikId);
    return h('li', { class: 'item' },
      h('div', { class: 'item-body' },
        h('p', { class: 'item-text', text: n.text }),
        h('p', { class: 'muted small' },
          p ? h('a', { href: '#/podnik/' + p.id, text: p.nazev }) : null,
          n.pripominka ? h('span', { class: 'chip', text: (n.pripominkaHotova ? 'vyřízeno ' : 'připomenout ') + U.formatDate(n.pripominka) }) : null)),
      h('div', { class: 'item-actions' },
        h('button', { class: 'btn small', text: 'Upravit', onclick: run(() => A.upravitPoznamku(n)) }),
        h('button', { class: 'btn small ghost', text: 'Smazat', onclick: run(() => A.smazat(n, 'poznámku')) })));
  }

  async function swap(a, b) {
    const pa = a.poradi || 0;
    const pb = b.poradi || 0;
    await S.save(Object.assign({}, a, { poradi: pb === pa ? pa + 1 : pb }), { silent: true });
    await S.save(Object.assign({}, b, { poradi: pa }));
  }

  function eventCard(e, i, list) {
    const p = M.podnik(e.podnikId);
    const title = M.nazevUdalosti(e);
    const sub = [e.cas, e.typ !== 'navsteva' ? M.TYP_UDALOSTI[e.typ] : null, p && p.adresa].filter(Boolean).join(' · ');
    const badge = e.stav === 'hotovo' ? '✓' : e.stav === 'odpadlo' ? '×' : String(i + 1);
    const setStav = (stav) => run(() => S.save(Object.assign({}, e, { stav })));
    const notes = M.poznamkyUdalosti(e.id);

    let actions;
    if (e.stav === 'planovano') {
      actions = [
        h('button', { class: 'btn primary small', text: 'Hotovo', onclick: setStav('hotovo') }),
        h('button', { class: 'btn small', text: 'Poznámka', onclick: run(() => A.upravitPoznamku(null, { datum: e.datum, podnikId: e.podnikId, udalostId: e.id })) }),
        p && p.adresa ? h('a', { class: 'btn small', href: U.mapHref(p.adresa), target: '_blank', rel: 'noopener noreferrer', text: 'Navigovat' }) : null,
        h('span', { class: 'spacer' }),
        i > 0 ? h('button', { class: 'btn small icon', 'aria-label': 'Posunout výš', text: '↑', onclick: run(() => swap(e, list[i - 1])) }) : null,
        i < list.length - 1 ? h('button', { class: 'btn small icon', 'aria-label': 'Posunout níž', text: '↓', onclick: run(() => swap(e, list[i + 1])) }) : null,
        h('button', { class: 'btn small ghost', text: 'Odpadlo', onclick: setStav('odpadlo') }),
      ];
    } else if (e.stav === 'hotovo') {
      actions = [
        h('button', { class: 'btn small', text: 'Poznámka', onclick: run(() => A.upravitPoznamku(null, { datum: e.datum, podnikId: e.podnikId, udalostId: e.id })) }),
        h('button', { class: 'btn small ghost', text: 'Vrátit', onclick: setStav('planovano') }),
      ];
    } else {
      const next = e.podnikId ? M.dalsiDenProPodnik(e.podnikId, e.datum) : U.addDays(e.datum, 1);
      actions = [
        h('button', {
          class: 'btn primary small', text: 'Přesunout na ' + U.formatDateShort(next),
          onclick: run(async () => {
            await S.save(Object.assign({}, e, { datum: next, stav: 'planovano', poradi: M.dalsiPoradi(next) }));
            UI.toast('Přesunuto na ' + U.formatDateShort(next));
          }),
        }),
        h('button', { class: 'btn small', text: 'Jiný den', onclick: run(() => A.upravitUdalost(e)) }),
        h('button', { class: 'btn small ghost', text: 'Vrátit', onclick: setStav('planovano') }),
        h('button', { class: 'btn small ghost', text: 'Smazat', onclick: run(() => A.smazat(e, 'událost')) }),
      ];
    }

    return h('li', { class: 'card event is-' + e.stav },
      h('div', { class: 'event-main' },
        h('span', { class: 'badge', 'aria-hidden': 'true', text: badge }),
        h('div', { class: 'event-body' },
          p ? h('a', { class: 'event-title', href: '#/podnik/' + p.id, text: title }) : h('span', { class: 'event-title', text: title }),
          sub ? h('span', { class: 'muted small', text: sub }) : null,
          e.stav === 'odpadlo' ? h('span', { class: 'muted small', text: 'Odpadlo' }) : null),
        e.stav === 'planovano'
          ? h('button', { class: 'btn small ghost', text: 'Upravit', onclick: run(() => A.upravitUdalost(e)) })
          : null),
      notes.length
        ? h('ul', { class: 'event-notes' }, notes.map((n) =>
          h('li', null,
            h('span', { text: n.text }),
            n.pripominka ? h('span', { class: 'chip', text: 'připomenout ' + U.formatDate(n.pripominka) }) : null,
            h('button', { class: 'btn small ghost', text: 'Upravit', onclick: run(() => A.upravitPoznamku(n)) }))))
        : null,
      h('div', { class: 'event-actions' }, actions));
  }

  // ---------- Týden ----------
  V.tyden = (iso) => {
    const mon = U.mondayOf(iso);
    const today = U.today();
    const days = Array.from({ length: 7 }, (_, i) => U.addDays(mon, i));

    const head = UI.viewHead(`Týden ${U.isoWeek(mon)}`, `${U.formatDate(mon)} – ${U.formatDateYear(days[6])}`, [
      h('button', { class: 'btn icon', 'aria-label': 'Předchozí týden', text: '‹', onclick: () => U.go('#/tyden/' + U.addDays(mon, -7)) }),
      U.mondayOf(today) !== mon ? h('button', { class: 'btn', text: 'Tento týden', onclick: () => U.go('#/tyden/' + U.mondayOf(today)) }) : null,
      h('button', { class: 'btn icon', 'aria-label': 'Další týden', text: '›', onclick: () => U.go('#/tyden/' + U.addDays(mon, 7)) }),
    ]);

    const rows = days.map((d) => {
      const ev = M.udalostiDne(d);
      const ob = M.oblastiDne(d);
      const rem = M.pripominkyDne(d).length;
      const weekend = U.weekday(d) > 5;
      if (weekend && !ev.length && !rem && !ob.length) return null;
      const done = ev.filter((e) => e.stav === 'hotovo').length;
      return h('li', null,
        h('a', { class: 'card week-row' + (d === today ? ' is-today' : ''), href: '#/den/' + d },
          h('span', { class: 'week-date' },
            h('span', { class: 'muted small', text: U.DNY[U.weekday(d) - 1] }),
            h('span', { class: 'week-num', text: String(U.fromISO(d).getDate()) })),
          h('span', { class: 'week-body' },
            h('span', { class: 'week-top' },
              h('strong', { text: ob.length ? ob.map((o) => o.nazev).join(', ') : 'Bez oblasti' }),
              h('span', { class: 'muted small', text: ev.length ? `${ev.length} ${U.plural(ev.length, 'událost', 'události', 'událostí')}${done ? `, ${done} hotovo` : ''}` : 'nic naplánováno' })),
            ev.length ? h('span', { class: 'muted small clamp', text: ev.map((e) => (e.cas ? e.cas + ' ' : '') + M.nazevUdalosti(e)).join(', ') }) : null,
            rem ? h('span', null, UI.chip(`${rem} ${U.plural(rem, 'připomínka', 'připomínky', 'připomínek')}`, 'accent')) : null)));
    });

    return h('section', { class: 'view' }, head, UI.segmented('tyden', mon), h('ul', { class: 'week' }, rows));
  };

  // ---------- Měsíc ----------
  V.mesic = (ym) => {
    const first = ym + '-01';
    const firstDate = U.fromISO(first);
    const today = U.today();
    const start = U.mondayOf(first);
    const prev = U.toISO(new Date(firstDate.getFullYear(), firstDate.getMonth() - 1, 1)).slice(0, 7);
    const next = U.toISO(new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 1)).slice(0, 7);

    const head = UI.viewHead(`${U.MESICE[firstDate.getMonth()]} ${firstDate.getFullYear()}`, null, [
      h('button', { class: 'btn icon', 'aria-label': 'Předchozí měsíc', text: '‹', onclick: () => U.go('#/mesic/' + prev) }),
      today.slice(0, 7) !== ym ? h('button', { class: 'btn', text: 'Tento měsíc', onclick: () => U.go('#/mesic/' + today.slice(0, 7)) }) : null,
      h('button', { class: 'btn icon', 'aria-label': 'Další měsíc', text: '›', onclick: () => U.go('#/mesic/' + next) }),
    ]);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = U.addDays(start, i);
      if (i === 35 && d.slice(0, 7) !== ym) break;
      const ev = M.udalostiDne(d).filter((e) => e.stav !== 'odpadlo');
      const rem = M.pripominkyDne(d).length;
      cells.push(h('a', {
        class: 'month-cell' + (d.slice(0, 7) !== ym ? ' out' : '') + (d === today ? ' is-today' : ''),
        href: '#/den/' + d,
        'aria-label': `${U.formatDateLong(d)}: ${ev.length} ${U.plural(ev.length, 'událost', 'události', 'událostí')}`,
      },
        h('span', { class: 'month-num', text: String(U.fromISO(d).getDate()) }),
        ev.length ? h('span', { class: 'month-count', text: String(ev.length) }) : null,
        rem ? h('span', { class: 'month-dot', title: 'Připomínka' }) : null));
    }

    return h('section', { class: 'view' }, head, UI.segmented('mesic', first),
      h('div', { class: 'month' },
        U.DNY.map((d) => h('span', { class: 'month-head', text: d })),
        cells),
      h('p', { class: 'muted small', text: 'Číslo v rohu = počet událostí, tečka = připomínka.' }));
  };
})(window.App);
