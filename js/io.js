'use strict';
// Import a export tabulek (Excel ↔ appka). Vše se zpracuje přímo v zařízení.
(function (App) {
  const U = App.util;
  const IO = {};

  // ---------- Čtení ----------
  // Soubor z Excelu: „CSV UTF-8“ i obyčejné „CSV“ (Windows-1250).
  IO.readFile = async (file) => {
    const buf = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    } catch (e) {
      text = new TextDecoder('windows-1250').decode(buf);
    }
    return text.replace(/^﻿/, '');
  };

  // Rozdělí text na řádky a buňky. Oddělovač pozná sám (tabulátor z Excelu, středník, čárka).
  IO.parseTable = (text) => {
    text = String(text || '').replace(/^﻿/, '');
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    const count = (ch) => first.split(ch).length - 1;
    const sep = count('\t') ? '\t' : count(';') >= count(',') && count(';') ? ';' : count(',') ? ',' : '\t';
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.map((r) => r.map((x) => x.trim()));
  };

  // Najde sloupce podle záhlaví. Bez záhlaví: Název, Obec, Velkosklad.
  IO.mapColumns = (header) => {
    const n = header.map((x) => U.normalize(x));
    const find = (test) => n.findIndex(test);
    const col = {
      velkosklad: find((x) => x.includes('sklad')),
      obec: find((x) => x.includes('obec') || x.includes('mesto')),
      adresa: find((x) => x.includes('adres') || x.includes('ulice')),
    };
    col.nazev = n.findIndex((x, i) => i !== col.velkosklad && (x.includes('nazev') || x.includes('podnik') || x.includes('provozovn')));
    if (col.nazev < 0) return { header: false, nazev: 0, obec: 1, velkosklad: 2, adresa: -1 };
    return Object.assign({ header: true }, col);
  };

  // Připraví import: co je nové, co existuje, co je chybné.
  IO.planImport = (text) => {
    // Řádky si pamatují své číslo v Excelu (i když se prázdné přeskočí).
    const rows = IO.parseTable(text).map((r, i) => ({ r, line: i + 1 })).filter((x) => x.r.some((c) => c));
    if (!rows.length) return { error: 'V tabulce nejsou žádná data.' };
    const col = IO.mapColumns(rows[0].r);
    const data = col.header ? rows.slice(1) : rows;
    const get = (r, i) => (i >= 0 && r[i] ? r[i].replace(/\s+/g, ' ').trim() : '');

    const existing = new Map(App.model.podniky().map((p) => [App.model.klicPodniku(p.nazev, p.obec || ''), p]));
    // Velkosklady sjednotit na jeden zápis (už existující mají přednost).
    const vsMap = new Map(App.model.velkosklady().map((v) => [U.normalize(v), v]));
    const vs = (v) => {
      if (!v) return '';
      const k = U.normalize(v);
      if (!vsMap.has(k)) vsMap.set(k, v);
      return vsMap.get(k);
    };

    const plan = { col, nove: [], doplnit: [], beze: [], chyby: [], duplicity: 0 };
    const seen = new Set();
    data.forEach(({ r, line }) => {
      const nazev = get(r, col.nazev);
      const obec = get(r, col.obec);
      const adresa = get(r, col.adresa);
      const velkosklad = vs(get(r, col.velkosklad));
      if (!nazev) { plan.chyby.push({ line, text: 'chybí název' }); return; }
      if (!obec && !adresa) { plan.chyby.push({ line, text: `${nazev}: chybí obec` }); return; }
      const key = App.model.klicPodniku(nazev, obec);
      if (seen.has(key)) { plan.duplicity++; return; }
      seen.add(key);
      const p = existing.get(key);
      if (p) {
        if (velkosklad && U.normalize(velkosklad) !== U.normalize(p.velkosklad || '')) plan.doplnit.push({ p, velkosklad });
        else plan.beze.push(p);
      } else {
        plan.nove.push({ nazev, obec, adresa, velkosklad });
      }
    });
    return plan;
  };

  IO.runImport = async (plan, oblastId) => {
    const S = App.store;
    const all = plan.nove.length + plan.doplnit.length;
    let n = 0;
    for (const x of plan.nove) {
      n++;
      await S.save({ type: 'podnik', nazev: x.nazev, obec: x.obec, adresa: x.adresa, velkosklad: x.velkosklad, oblastId: oblastId || '', frekvence: '', piva: [] },
        { silent: n < all });
    }
    for (const x of plan.doplnit) {
      n++;
      await S.save(Object.assign({}, x.p, { velkosklad: x.velkosklad }), { silent: n < all });
    }
    return { nove: plan.nove.length, doplneno: plan.doplnit.length };
  };

  // ---------- Export ----------
  // Buňka pro Excel: uvozovky jen když je potřeba, a ochrana proti vzorcům (=, +, -, @).
  const cell = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  IO.toCSV = (rows) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

  IO.podnikyRows = (items, kontakty) => {
    const M = App.model;
    const head = ['Název', 'Obec', 'Adresa', 'Oblast', 'Frekvence', 'Velkosklad', 'Druhy piva', 'Poslední návštěva'];
    if (kontakty) head.push('Kontakt', 'Telefon');
    return [head].concat(items.map((p) => {
      const o = M.oblast(p.oblastId);
      const f = M.FREKVENCE[p.frekvence];
      const last = M.posledniNavsteva(p.id);
      const r = [p.nazev, p.obec || '', p.adresa || '', o ? o.nazev : '', f ? f.short : '', p.velkosklad || '',
        (p.piva || []).join(', '), last ? U.formatDateYear(last) : ''];
      if (kontakty) r.push(p.kontakt || '', p.telefon || '');
      return r;
    }));
  };

  const safeName = (s) => U.normalize(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

  // Uloží soubor: v mobilu přes Sdílet, jinak stažením.
  IO.deliver = async (text, filename) => {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const file = typeof File === 'function' ? new File([blob], filename, { type: 'text/csv' }) : null;
    const mobile = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (mobile && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'aborted';
      }
    }
    const url = URL.createObjectURL(blob);
    const a = U.h('a', { href: url, download: filename, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  };

  IO.exportPodniku = async (items, popisFiltru) => {
    if (!items.length) return;
    const v = await App.ui.form({
      title: 'Export do Excelu',
      intro: `Exportuje se ${items.length} ${U.plural(items.length, 'podnik', 'podniky', 'podniků')}`
        + (popisFiltru && popisFiltru.length ? ` (filtr: ${popisFiltru.join(', ')})` : ' (všechny)')
        + '. Soubor už není šifrovaný – zacházej s ním jako s firemními daty a po použití ho smaž.',
      fields: [{ name: 'kontakty', label: 'Včetně kontaktů a telefonů (osobní údaje)', type: 'checkbox', value: false }],
      submit: 'Exportovat',
    });
    if (!v) return;
    const csv = IO.toCSV(IO.podnikyRows(items, v.kontakty));
    const name = ['podniky', U.today(), ...(popisFiltru || []).map(safeName)].filter(Boolean).join('-') + '.csv';
    const res = await IO.deliver(csv, name);
    if (res === 'downloaded') App.ui.toast('Uloženo: ' + name);
    else if (res === 'shared') App.ui.toast('Export odeslán');
  };

  App.io = IO;
})(window.App);
