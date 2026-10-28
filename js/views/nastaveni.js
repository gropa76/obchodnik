'use strict';
// Nastavení: oblasti a dny, automatické zamčení, heslo.
(function (App) {
  const U = App.util;
  const h = U.h;
  const M = App.model;
  const S = App.store;
  const UI = App.ui;
  const V = (App.views = App.views || {});
  const run = UI.run;

  const dnyOptions = U.DNY.map((d, i) => ({ value: String(i + 1), label: d }));
  const dnyText = (dny) => (dny && dny.length ? dny.slice().sort().map((d) => U.DNY[d - 1]).join(', ') : 'bez dne');

  const upravitOblast = async (o) => {
    const isNew = !o;
    o = o || { dny: [] };
    const v = await UI.form({
      title: isNew ? 'Nová oblast' : 'Upravit oblast',
      fields: [
        { name: 'nazev', label: 'Název', required: true, value: o.nazev, placeholder: 'Např. Oblast 1 – Břeclav' },
        { name: 'dny', label: 'Kdy do oblasti jezdíš', type: 'checkboxes', options: dnyOptions, value: o.dny,
          hint: 'Podle dnů se v kalendáři ukazuje oblast dne a odpadlé návštěvy se nabízí přesunout na další vhodný den.' },
      ],
    });
    if (!v) return;
    await S.save(Object.assign({}, o, { type: 'oblast', nazev: v.nazev, dny: v.dny.map(Number) }));
    UI.toast('Oblast uložena');
  };

  const smazatOblast = async (o) => {
    const pouzito = M.podniky().filter((p) => p.oblastId === o.id);
    const text = pouzito.length
      ? `${pouzito.length} ${U.plural(pouzito.length, 'podnik zůstane', 'podniky zůstanou', 'podniků zůstane')} bez oblasti.`
      : 'Oblast není přiřazená žádnému podniku.';
    if (!(await UI.confirm(`Smazat oblast „${o.nazev}“?`, text))) return;
    for (const p of pouzito) await S.save(Object.assign({}, p, { oblastId: '' }), { silent: true });
    await S.remove(o.id);
    UI.toast('Oblast smazána');
  };

  V.nastaveni = () => {
    const oblasti = M.oblasti();
    const autolock = App.settings.autolock;

    return h('section', { class: 'view' },
      UI.viewHead('Nastavení'),

      h('section', { class: 'block' },
        h('div', { class: 'block-head' },
          h('h2', { text: 'Oblasti' }),
          h('button', { class: 'btn small primary', text: '+ Oblast', onclick: run(() => upravitOblast(null)) })),
        oblasti.length
          ? h('ul', { class: 'list card-list' }, oblasti.map((o) => {
            const n = M.podniky().filter((p) => p.oblastId === o.id).length;
            return h('li', { class: 'item' },
              h('div', { class: 'item-body' },
                h('span', { class: 'item-title', text: o.nazev }),
                h('span', { class: 'muted small', text: `${dnyText(o.dny)} · ${n} ${U.plural(n, 'podnik', 'podniky', 'podniků')}` })),
              h('div', { class: 'item-actions' },
                h('button', { class: 'btn small', text: 'Upravit', onclick: run(() => upravitOblast(o)) }),
                h('button', { class: 'btn small ghost', text: 'Smazat', onclick: run(() => smazatOblast(o)) })));
          }))
          : UI.empty('Zatím žádné oblasti. Založ je a přiřaď jim dny v týdnu, např. Oblast 1 = pondělí.')),

      h('section', { class: 'block' },
        h('h2', { text: 'Zabezpečení' }),
        h('div', { class: 'card settings' },
          h('label', { class: 'setting-row' },
            h('span', { text: 'Automaticky zamknout po nečinnosti' }),
            h('select', {
              value: String(autolock),
              onchange: run(async (e) => {
                App.settings.autolock = Number(e.target.value);
                await App.db.setMeta('settings', App.settings);
                App.resetLockTimer();
                UI.toast('Uloženo');
              }),
            }, [1, 5, 10, 15, 30].map((m) => h('option', { value: String(m), text: `${m} min` })))),
          h('div', { class: 'setting-row' },
            h('span', { text: 'Hlavní heslo' }),
            h('button', { class: 'btn small', text: 'Změnit heslo', onclick: run(() => V.zmenitHeslo()) })),
          h('div', { class: 'setting-row' },
            h('span', { text: 'Zamknout teď' }),
            h('button', { class: 'btn small', text: 'Zamknout', onclick: () => App.lock() })))),

      h('section', { class: 'block' },
        h('h2', { text: 'Kde jsou data' }),
        h('div', { class: 'card prose' },
          h('p', { text: 'Data jsou zašifrovaná a uložená jen v tomto prohlížeči na tomto počítači. Nic se neposílá na internet.' }),
          h('p', { text: 'Pozor: když v prohlížeči smažeš data webů (historii včetně „souborů cookie a dat webů“) pro adresu appky, data appky zmizí. Šifrovaná záloha přijde v další fázi.' }),
          h('p', { class: 'muted small', text: 'Verze 0.1 · fáze 1' }))));
  };
})(window.App);
