'use strict';
// Pomocné funkce: data, datumy, tvorba prvků stránky.
window.App = window.App || {};

(function (App) {
  const U = {};

  U.DNY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  U.DNY_DLOUHE = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
  U.MESICE = ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'];

  U.uuid = () => crypto.randomUUID();
  U.pad = (n) => String(n).padStart(2, '0');

  // Datum ve tvaru 'RRRR-MM-DD' (místní čas, bez posunů časových pásem).
  U.toISO = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}-${U.pad(d.getDate())}`;
  U.fromISO = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  U.isISO = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  U.today = () => U.toISO(new Date());
  U.addDays = (iso, n) => {
    const d = U.fromISO(iso);
    d.setDate(d.getDate() + n);
    return U.toISO(d);
  };
  // 1 = pondělí … 7 = neděle
  U.weekday = (iso) => {
    const w = U.fromISO(iso).getDay();
    return w === 0 ? 7 : w;
  };
  U.mondayOf = (iso) => U.addDays(iso, 1 - U.weekday(iso));
  U.daysBetween = (a, b) => Math.round((U.fromISO(b) - U.fromISO(a)) / 864e5);
  U.isoWeek = (iso) => {
    const d = U.fromISO(iso);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 864e5 + 1) / 7);
  };

  U.formatDate = (iso) => {
    const d = U.fromISO(iso);
    return `${d.getDate()}. ${d.getMonth() + 1}.`;
  };
  U.formatDateYear = (iso) => `${U.formatDate(iso)} ${iso.slice(0, 4)}`;
  U.formatDateLong = (iso) => `${U.DNY_DLOUHE[U.weekday(iso) - 1]} ${U.formatDate(iso)}`;
  U.formatDateShort = (iso) => `${U.DNY[U.weekday(iso) - 1]} ${U.formatDate(iso)}`;

  U.plural = (n, one, few, many) => {
    if (n === 1) return one;
    if (n >= 2 && n <= 4) return few;
    return many;
  };

  // "dnes", "včera", "před 5 dny", "zítra", "za 3 dny"
  U.relDays = (iso) => {
    const diff = U.daysBetween(iso, U.today());
    if (diff === 0) return 'dnes';
    if (diff === 1) return 'včera';
    if (diff === -1) return 'zítra';
    if (diff > 1) return `před ${diff} dny`;
    const n = -diff;
    return `za ${n} ${U.plural(n, 'den', 'dny', 'dní')}`;
  };

  // Hledání bez ohledu na diakritiku a velikost písmen.
  U.normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  U.telHref = (t) => 'tel:' + String(t).replace(/[^\d+]/g, '');
  U.mapHref = (adresa) => 'https://mapy.cz/zakladni?q=' + encodeURIComponent(adresa);

  U.go = (hash) => {
    if (location.hash === hash) App.render();
    else location.hash = hash;
  };

  // Tvorba prvků. Text vždy jako textový uzel, nikdy jako HTML.
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.append(k instanceof Node ? k : String(k));
    }
  }
  U.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    let value;
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') value = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    append(el, kids);
    if (value !== undefined) el.value = value;
    return el;
  };

  App.util = U;
})(window.App);
