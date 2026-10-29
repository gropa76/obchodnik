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

  // Podniky z oblasti daného dne, které jsou podle frekvence na řadě.
  // Nezakládá nic v kalendáři – jen návrh. Vynechá podniky, které už mají
  // návštěvu ten den nebo naplánovanou od dneška dál.
  // Vrací [{ p, due, over, nikdy }] seřazené od nejdéle čekajících.
  M.naRade = (iso) => {
    const today = U.today();
    if (iso < today) return [];
    const oblasti = new Set(M.oblastiDne(iso).map((o) => o.id));
    if (!oblasti.size) return [];
    const out = [];
    for (const p of M.podniky()) {
      const f = M.FREKVENCE[p.frekvence];
      if (!f || !oblasti.has(p.oblastId)) continue;
      const evs = M.udalostiPodniku(p.id).filter((e) => e.typ === 'navsteva');
      if (evs.some((e) => e.datum === iso && e.stav !== 'odpadlo')) continue;
      if (evs.some((e) => e.stav === 'planovano' && e.datum >= today)) continue;
      const last = M.posledniNavsteva(p.id);
      if (!last) {
        out.push({ p, due: null, over: 0, nikdy: true });
        continue;
      }
      const due = U.addDays(last, f.dny);
      if (due <= iso) out.push({ p, due, over: U.daysBetween(due, iso), nikdy: false });
    }
    // Nejdéle po termínu nahoře, podniky bez návštěvy na konec.
    return out.sort((a, b) => (a.nikdy - b.nikdy) || (b.over - a.over) || a.p.nazev.localeCompare(b.p.nazev, 'cs'));
  };

  // ---------- Štítky poznámek ----------
  // Uložené jako jeden zašifrovaný záznam { type:'stitky', list:[...] }.
  M.VYCHOZI_STITKY = ['Objednávka', 'Reklamace', 'Servis výčepu', 'Akce', 'Konkurence', 'Materiál'];
  M.stitkyZaznam = () => S.list('stitky')[0] || null;
  M.stitky = () => {
    const z = M.stitkyZaznam();
    return z ? z.list.slice() : M.VYCHOZI_STITKY.slice();
  };
  M.ulozStitky = (list) => S.save(Object.assign({}, M.stitkyZaznam() || { type: 'stitky' }, { list }));

  // ---------- Speciály (roční nabídky) ----------
  // special: { type:'special', nazev, od:'MM-DD', do:'MM-DD' }
  // podnik.specialy = [specialId], podnik.nabidnuto = { [specialId]: rokSezony }
  M.specialy = () => S.list('special').sort((a, b) => a.od.localeCompare(b.od) || a.nazev.localeCompare(b.nazev, 'cs'));
  M.special = (id) => S.get(id);

  // Období může přecházet přes Nový rok (např. 15. 11. – 15. 1.).
  M.specialAktivni = (s, iso) => {
    const md = iso.slice(5);
    return s.od <= s.do ? md >= s.od && md <= s.do : md >= s.od || md <= s.do;
  };
  // Rok sezóny = rok, ve kterém období začalo.
  M.sezonaRok = (s, iso) => {
    const y = Number(iso.slice(0, 4));
    return s.od > s.do && iso.slice(5) <= s.do ? y - 1 : y;
  };
  // Začátek nejbližšího (nebo právě běžícího) období.
  M.zacatekObdobi = (s, iso) => {
    const y = Number(iso.slice(0, 4));
    if (M.specialAktivni(s, iso)) return `${M.sezonaRok(s, iso)}-${s.od}`;
    return iso.slice(5) < s.od ? `${y}-${s.od}` : `${y + 1}-${s.od}`;
  };
  M.nabidnutoLetos = (p, s, iso) => !!(p.nabidnuto && p.nabidnuto[s.id] === M.sezonaRok(s, iso));

  // Speciály podniku, které je v daný den potřeba nabídnout.
  M.specialyKNabidnuti = (p, iso) =>
    (p.specialy || []).map(M.special).filter((s) => s && M.specialAktivni(s, iso) && !M.nabidnutoLetos(p, s, iso));

  M.oznacitNabidnuto = (p, s, iso, ano) => {
    const nabidnuto = Object.assign({}, p.nabidnuto);
    if (ano) nabidnuto[s.id] = M.sezonaRok(s, iso);
    else delete nabidnuto[s.id];
    return S.save(Object.assign({}, p, { nabidnuto }));
  };

  // ---------- Sudy u speciálů ----------
  // podnik.sudy = { [specialId]: { [rokSezony]: pocet } }
  M.sudyHistorie = (p, s) => {
    const z = (p.sudy && p.sudy[s.id]) || {};
    return Object.keys(z).map(Number).sort((a, b) => b - a).map((rok) => ({ rok, pocet: z[rok] }));
  };
  M.sudy = (p, s, rok) => {
    const z = p.sudy && p.sudy[s.id];
    return z && z[rok] != null ? z[rok] : null;
  };
  M.ulozSudy = (p, s, rok, pocet) => {
    const sudy = Object.assign({}, p.sudy);
    const z = Object.assign({}, sudy[s.id]);
    if (pocet == null) delete z[rok];
    else z[rok] = pocet;
    sudy[s.id] = z;
    return S.save(Object.assign({}, p, { sudy }));
  };
  // Rok sezóny, ke které se sudy zapisují: běžící období, jinak poslední proběhlé.
  M.posledniSezona = (s, iso) => {
    if (M.specialAktivni(s, iso)) return M.sezonaRok(s, iso);
    return Number(M.zacatekObdobi(s, iso).slice(0, 4)) - 1;
  };
  M.sudyCelkem = (s, rok) => M.podniky().reduce((sum, p) => sum + (M.sudy(p, s, rok) || 0), 0);

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
