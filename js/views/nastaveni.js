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

  // ---------- Štítky ----------
  const pridatStitek = async () => {
    const v = await UI.form({
      title: 'Nový štítek',
      fields: [{ name: 'nazev', label: 'Název', required: true, placeholder: 'Např. Vánoční objednávka' }],
      validate: (vals) => (M.stitky().some((t) => U.normalize(t) === U.normalize(vals.nazev)) ? 'Takový štítek už máš.' : ''),
    });
    if (!v) return;
    await M.ulozStitky(M.stitky().concat(v.nazev));
    UI.toast('Štítek přidán');
  };
  const odebratStitek = async (t) => {
    if (!(await UI.confirm(`Odebrat štítek „${t}“?`, 'U starých poznámek zůstane, jen ho už nepůjde vybrat.', 'Odebrat'))) return;
    await M.ulozStitky(M.stitky().filter((x) => x !== t));
    UI.toast('Štítek odebrán');
  };

  // ---------- Speciály ----------
  const upravitSpecial = async (sp) => {
    const isNew = !sp;
    sp = sp || {};
    const v = await UI.form({
      title: isNew ? 'Nový speciál' : 'Upravit speciál',
      intro: 'Nabídka, kterou podnikům dáváš každý rok ve stejném období.',
      fields: [
        { name: 'nazev', label: 'Název', required: true, value: sp.nazev, placeholder: 'Např. Velikonoční speciál' },
        { name: 'od', label: 'Od (den. měsíc.)', required: true, value: sp.od ? U.formatMD(sp.od) : '', placeholder: '1. 3.', hint: 'Bez roku – opakuje se každý rok.' },
        { name: 'do', label: 'Do (den. měsíc.)', required: true, value: sp.do ? U.formatMD(sp.do) : '', placeholder: '15. 4.' },
      ],
      validate: (vals) => {
        if (!U.parseMD(vals.od)) return 'Datum „Od“ napiš jako den a měsíc, např. 1. 3.';
        if (!U.parseMD(vals.do)) return 'Datum „Do“ napiš jako den a měsíc, např. 15. 4.';
        return '';
      },
    });
    if (!v) return;
    await S.save(Object.assign({}, sp, { type: 'special', nazev: v.nazev, od: U.parseMD(v.od), do: U.parseMD(v.do) }));
    UI.toast('Speciál uložen');
  };
  const smazatSpecial = async (sp) => {
    const pouzito = M.podniky().filter((p) => (p.specialy || []).includes(sp.id));
    if (!(await UI.confirm(`Smazat speciál „${sp.nazev}“?`,
      pouzito.length ? `Odebere se i od ${pouzito.length} ${U.plural(pouzito.length, 'podniku', 'podniků', 'podniků')}.` : 'Není přiřazený žádnému podniku.'))) return;
    for (const p of pouzito) await S.save(Object.assign({}, p, { specialy: p.specialy.filter((x) => x !== sp.id) }), { silent: true });
    await S.remove(sp.id);
    UI.toast('Speciál smazán');
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
        h('div', { class: 'block-head' },
          h('h2', { text: 'Speciály' }),
          h('button', { class: 'btn small primary', text: '+ Speciál', onclick: run(() => upravitSpecial(null)) })),
        M.specialy().length
          ? h('ul', { class: 'list card-list' }, M.specialy().map((sp) => {
            const n = M.podniky().filter((p) => (p.specialy || []).includes(sp.id)).length;
            return h('li', { class: 'item' },
              h('div', { class: 'item-body' },
                h('span', { class: 'item-title', text: sp.nazev }),
                h('span', { class: 'muted small', text: `${U.formatMD(sp.od)} – ${U.formatMD(sp.do)} · ${n} ${U.plural(n, 'podnik', 'podniky', 'podniků')}` + (M.specialAktivni(sp, U.today()) ? ' · probíhá' : '') }),
                (() => {
                  const rok = M.posledniSezona(sp, U.today());
                  const now = M.sudyCelkem(sp, rok);
                  const prev = M.sudyCelkem(sp, rok - 1);
                  return now || prev ? h('span', { class: 'small', text: `Sudy ${rok}: ${now} · ${rok - 1}: ${prev}` }) : null;
                })()),
              h('div', { class: 'item-actions' },
                h('button', { class: 'btn small', text: 'Upravit', onclick: run(() => upravitSpecial(sp)) }),
                h('button', { class: 'btn small ghost', text: 'Smazat', onclick: run(() => smazatSpecial(sp)) })));
          }))
          : UI.empty('Zatím žádné speciály. Založ nabídku s obdobím (např. Velikonoční 1. 3. – 15. 4.) a pak ji u podniků zaškrtni v Upravit.')),

      h('section', { class: 'block' },
        h('div', { class: 'block-head' },
          h('h2', { text: 'Štítky poznámek' }),
          h('button', { class: 'btn small primary', text: '+ Štítek', onclick: run(pridatStitek) })),
        h('div', { class: 'card prose' },
          h('div', { class: 'tags' }, M.stitky().map((t) =>
            h('span', { class: 'chip tag removable' }, t,
              h('button', { type: 'button', class: 'chip-x', 'aria-label': 'Odebrat štítek ' + t, text: '×', onclick: run(() => odebratStitek(t)) })))),
          M.stitky().length ? null : h('p', { class: 'muted small', text: 'Žádné štítky.' }))),

      h('section', { class: 'block' },
        h('h2', { text: 'Zabezpečení' }),
        h('div', { class: 'card settings' },
          (() => {
            const q = App.quick || {};
            return [
              h('div', { class: 'setting-row' },
                h('span', null, 'Odemykání PINem', h('br'), h('span', { class: 'muted small', text: q.pin ? 'zapnuto' : 'vypnuto' })),
                h('span', { class: 'row-actions' },
                  h('button', { class: 'btn small' + (q.pin ? '' : ' primary'), text: q.pin ? 'Změnit PIN' : 'Nastavit PIN', onclick: run(() => V.nastavitPin()) }),
                  q.pin ? h('button', { class: 'btn small ghost', text: 'Vypnout', onclick: run(() => V.vypnoutRychle('pin')) }) : null)),
              h('div', { class: 'setting-row' },
                h('span', null, 'Odemykání otiskem prstu', h('br'),
                  h('span', { class: 'muted small', text: q.bio ? 'zapnuto' : App.bioSupported ? 'vypnuto' : 'toto zařízení nepodporuje' })),
                h('span', { class: 'row-actions' },
                  !q.bio && App.bioSupported ? h('button', { class: 'btn small primary', text: 'Zapnout', onclick: run(() => V.zapnoutOtisk()) }) : null,
                  q.bio ? h('button', { class: 'btn small ghost', text: 'Vypnout', onclick: run(() => V.vypnoutRychle('bio')) }) : null)),
            ];
          })(),
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
          h('p', { class: 'muted small', text: 'Verze 0.7 · fáze 1' }))));
  };
})(window.App);
