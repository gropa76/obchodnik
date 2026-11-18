'use strict';
// Pojistka: když se appka nenačte celá (např. chybí soubor po neúplném nahrání),
// ukáže se místo bílé obrazovky hláška. Načítá se jako první skript.
(function () {
  let shown = false;
  const show = (detail) => {
    if (shown) return;
    const main = document.getElementById('main');
    if (!main || (main.childElementCount && !window.__appBroken)) return;
    shown = true;
    const box = document.createElement('section');
    box.className = 'lock';
    const inner = document.createElement('div');
    inner.className = 'lock-box';
    const h1 = document.createElement('h1');
    h1.textContent = 'Appka se nenačetla celá';
    const p1 = document.createElement('p');
    p1.textContent = 'Tvoje data jsou v pořádku. Nejspíš se právě nahrává nová verze nebo se na GitHub nenahrál některý soubor. Zkontroluj nahrání, pak appku zavři a otevři znovu.';
    const p2 = document.createElement('p');
    p2.className = 'muted small';
    p2.textContent = 'Detail: ' + detail;
    const btn = document.createElement('button');
    btn.className = 'btn primary wide';
    btn.type = 'button';
    btn.textContent = 'Zkusit znovu';
    btn.addEventListener('click', () => location.reload());
    inner.append(h1, p1, btn, p2);
    box.append(inner);
    main.replaceChildren(box);
  };
  // Chybějící skript nebo styl (404) – zachytí se jen ve fázi „capture“.
  window.addEventListener('error', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
      window.__appBroken = true;
      show('chybí soubor ' + (t.src || t.href || '').split('/').slice(-2).join('/'));
    }
  }, true);
  window.addEventListener('error', (e) => show((e.message || 'chyba') + (e.filename ? ' (' + e.filename.split('/').pop() + ')' : '')));
  window.addEventListener('unhandledrejection', (e) => show(String(e.reason && e.reason.message || e.reason)));
  // Kdyby se nic nevykreslilo do 8 s (a nikdo nic nehlásil).
  window.addEventListener('load', () => setTimeout(() => show('zámek se nezobrazil'), 8000));
})();
