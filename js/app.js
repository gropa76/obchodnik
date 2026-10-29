'use strict';
// Spuštění appky, navigace mezi obrazovkami a automatické zamčení.
(function (App) {
  const U = App.util;
  const V = App.views;
  const S = App.store;

  App.settings = { autolock: 5 };

  const routes = [
    [/^#\/den\/(\d{4}-\d{2}-\d{2})$/, (m) => V.den(m[1]), 'kalendar'],
    [/^#\/tyden\/(\d{4}-\d{2}-\d{2})$/, (m) => V.tyden(m[1]), 'kalendar'],
    [/^#\/mesic\/(\d{4}-\d{2})$/, (m) => V.mesic(m[1]), 'kalendar'],
    [/^#\/podniky$/, () => V.podniky(), 'podniky'],
    [/^#\/podnik\/([\w-]+)$/, (m) => V.podnik(m[1]), 'podniky'],
    [/^#\/poznamky$/, () => V.poznamky(), 'poznamky'],
    [/^#\/nastaveni$/, () => V.nastaveni(), 'nastaveni'],
  ];

  let lastHash = null;

  App.render = () => {
    if (!S.isOpen()) return;
    const hash = location.hash;
    const main = document.getElementById('main');
    for (const [re, view, section] of routes) {
      const m = hash.match(re);
      if (!m) continue;
      if (re.source.includes('\\d{4}') && !U.isISO(m[1].length === 7 ? m[1] + '-01' : m[1])) break;
      const scrollY = hash === lastHash ? window.scrollY : 0;
      main.replaceChildren(view(m));
      document.querySelectorAll('.nav-link').forEach((a) => {
        const on = a.dataset.section === section;
        a.classList.toggle('active', on);
        if (on) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      window.scrollTo(0, scrollY);
      if (hash !== lastHash) main.focus({ preventScroll: true });
      lastHash = hash;
      return;
    }
    // Neznámá adresa (nebo jen "#/den") → dnešní den.
    location.replace('#/den/' + U.today());
  };

  App.unlocked = () => {
    document.getElementById('nav').hidden = false;
    lastHash = null;
    App.resetLockTimer();
    if (!/^#\//.test(location.hash) || location.hash === '#/den') location.replace('#/den/' + U.today());
    App.render();
  };

  // ---------- Zamčení ----------
  let lockTimer = null;
  let hiddenAt = null;
  const lockMs = () => (App.settings.autolock || 5) * 60000;

  App.resetLockTimer = () => {
    if (!S.isOpen()) return;
    clearTimeout(lockTimer);
    lockTimer = setTimeout(() => App.lock(), lockMs());
  };

  App.lock = () => {
    clearTimeout(lockTimer);
    const dlg = document.getElementById('dlg');
    if (dlg.open) dlg.close();
    S.clear();
    document.getElementById('main').replaceChildren();
    V.lock();
  };

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, () => App.resetLockTimer(), { passive: true }));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && S.isOpen() && Date.now() - hiddenAt >= lockMs()) App.lock();
  });

  // ---------- Start ----------
  window.addEventListener('hashchange', () => App.render());
  S.onChange(() => App.render());
  document.getElementById('lock-btn').addEventListener('click', () => App.lock());
  document.querySelector('.nav-link[data-section="kalendar"]').addEventListener('click', (e) => {
    e.preventDefault();
    U.go('#/den/' + U.today());
  });

  (async () => {
    try {
      const saved = await App.db.getMeta('settings');
      if (saved) Object.assign(App.settings, saved);
    } catch (e) {
      console.error(e);
    }
    App.bioSupported = await App.bio.supported();
    V.lock();
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker:', e));
    }
  })();
})(window.App);
