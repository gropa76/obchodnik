'use strict';
// Práce s daty: podniky, oblasti, události v kalendáři, poznámky.
//
// oblast:   { type:'oblast', nazev, dny:[1..7] }
// podnik:   { type:'podnik', nazev, adresa, oblastId, frekvence:'A'|'B'|'C'|'', kontakt, telefon, crm }
// udalost:  { type:'udalost', typ:'navsteva'|'schuzka'|'akce', nazev, datum, cas, podnikId, stav:'planovano'|'hotovo'|'odpadlo', poradi }
// poznamka: { type:'poznamka', text, datum, podnikId, udalostId, pripominka, pripominkaHotova }
(function (App) {
  const U = App.util;
  const S = App.store;
  const M = {};

  M.FREKVENCE = {
    A: { dny: 7, label: 'A – každý týden', short: 'A týdně' },
    B: { dny: 14, label: 'B – jednou za 14 dní', short: 'B 14 dní' },
    C: { dny: 30, label: 'C – jednou za měsíc', short: 'C měsíčně' },
  };
  M.TYP_UDALOSTI = { navsteva: 'Návštěva', schuzka: 'Schůzka', akce: 'Akce' };

  const byName = (a, b) => (a.nazev || '').localeCompare(b.nazev || '', 'cs');

  M.oblasti = () => S.list('oblast').sort(byName);
  M.oblast = (id) => S.get(id);
  M.oblastiDne = (iso) => M.oblasti().filter((o) => (o.dny || []).includes(U.weekday(iso)));

  M.podniky = () => S.list('podnik').sort(byName);
  M.podnik = (id) => S.get(id);
  M.nedoplnene = () => M.podniky().filter((p) => !p.oblastId || !M.oblast(p.oblastId) || !p.frekvence);

  M.udalosti = () => S.list('udalost');
  M.udalostiDne = (iso) =>
    M.udalosti()
      .filter((e) => e.datum === iso)
      .sort((a, b) => (a.poradi || 0) - (b.poradi || 0) || (a.cas || '').localeCompare(b.cas || ''));
  M.udalostiPodniku = (podnikId) => M.udalosti().filter((e) => e.podnikId === podnikId);

  M.posledniNavsteva = (podnikId) => {
    let last = null;
    for (const e of M.udalostiPodniku(podnikId)) {
      if (e.typ === 'navsteva' && e.stav === 'hotovo' && (!last || e.datum > last)) last = e.datum;
    }
    return last;
  };

  // Propadlý podnik: od poslední návštěvy uběhlo víc dní, než je jeho frekvence.
  M.propadlo = (p) => {
    const f = M.FREKVENCE[p.frekvence];
    const last = M.posledniNavsteva(p.id);
    if (!f || !last) return 0;
    const over = U.daysBetween(last, U.today()) - f.dny;
    return over > 0 ? over : 0;
  };

  M.poznamky = () => S.list('poznamka').sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || '').localeCompare(a.created || ''));
  M.poznamkyUdalosti = (udalostId) => M.poznamky().filter((n) => n.udalostId === udalostId);
  M.poznamkyPodniku = (podnikId) => M.poznamky().filter((n) => n.podnikId === podnikId);
  M.pripominkyDne = (iso) => M.poznamky().filter((n) => n.pripominka === iso && !n.pripominkaHotova);
  M.pripominkyPoTerminu = () => M.poznamky().filter((n) => n.pripominka && n.pripominka < U.today() && !n.pripominkaHotova);

  M.nazevUdalosti = (e) => {
    const p = M.podnik(e.podnikId);
    if (e.typ === 'navsteva') return p ? p.nazev : 'Smazaný podnik';
    return e.nazev || (p ? p.nazev : M.TYP_UDALOSTI[e.typ]);
  };

  M.dalsiPoradi = (iso) => M.udalostiDne(iso).reduce((m, e) => Math.max(m, e.poradi || 0), 0) + 1;

  // Nejbližší další den, kdy se jezdí do oblasti podniku (bez oblasti: další pracovní den).
  M.dalsiDenProPodnik = (podnikId, fromIso) => {
    const p = M.podnik(podnikId);
    const o = p && M.oblast(p.oblastId);
    const dny = o && o.dny && o.dny.length ? o.dny : [1, 2, 3, 4, 5];
    for (let i = 1; i <= 28; i++) {
      const d = U.addDays(fromIso, i);
      if (dny.includes(U.weekday(d))) return d;
    }
    return U.addDays(fromIso, 1);
  };

  App.model = M;
})(window.App);
