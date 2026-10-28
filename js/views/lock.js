'use strict';
// Zámek: první nastavení hesla, odemčení, obnova obnovovacím kódem.
(function (App) {
  const U = App.util;
  const h = U.h;
  const C = App.crypto;
  const V = (App.views = App.views || {});

  const MIN_LEN = 10;
  const main = () => document.getElementById('main');

  const screen = (...kids) => {
    document.getElementById('nav').hidden = true;
    const box = h('section', { class: 'lock' }, h('div', { class: 'lock-box' }, kids));
    main().replaceChildren(box);
    const first = box.querySelector('input');
    if (first) first.focus();
  };

  const busy = (btn, text) => {
    btn.disabled = true;
    btn.dataset.label = btn.textContent;
    btn.textContent = text;
  };
  const unbusy = (btn) => {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || btn.textContent;
  };

  const pwField = (id, label, autocomplete) =>
    h('div', { class: 'field' },
      h('label', { for: id, class: 'label', text: label }),
      h('input', { id, type: 'password', autocomplete, required: true, spellcheck: 'false' }));

  const checkNewPassword = (a, b) => {
    if (a.length < MIN_LEN) return `Heslo musí mít aspoň ${MIN_LEN} znaků.`;
    if (a !== b) return 'Hesla se neshodují.';
    return '';
  };

  // ---------- Pokusy o odemčení ----------
  const getAttempts = async () => (await App.db.getMeta('attempts')) || { count: 0, until: 0 };
  const failAttempt = async () => {
    const a = await getAttempts();
    a.count += 1;
    if (a.count >= 5) a.until = Date.now() + Math.min(30000 * 2 ** (a.count - 5), 15 * 60000);
    await App.db.setMeta('attempts', a);
    return a;
  };
  const resetAttempts = () => App.db.setMeta('attempts', { count: 0, until: 0 });

  // ---------- Obrazovky ----------
  V.lock = async () => {
    if (!C.available()) {
      screen(
        h('h1', { text: 'Appku nejde spustit' }),
        h('p', { text: 'Prohlížeč nepodporuje šifrování nebo úložiště. Otevři appku přes adresu http://localhost nebo https:// v aktuálním Chrome, Edge nebo Firefoxu.' }));
      return;
    }
    const keys = await App.db.getMeta('keys');
    if (keys) unlockScreen(keys);
    else setupScreen();
  };

  function setupScreen() {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn primary wide', text: 'Zabezpečit a pokračovat' });
    const form = h('form', {
      class: 'form',
      onsubmit: App.ui.run(async (e) => {
        e.preventDefault();
        const a = form.querySelector('#pw1').value;
        const b = form.querySelector('#pw2').value;
        const msg = checkNewPassword(a, b);
        if (msg) {
          err.textContent = msg;
          return;
        }
        busy(btn, 'Šifruji…');
        try {
          const { keys, key, code } = await C.createVault(a);
          await App.db.setMeta('keys', keys);
          await resetAttempts();
          await App.store.load(key);
          if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
          codeScreen(code);
        } catch (ex) {
          unbusy(btn);
          throw ex;
        }
      }),
    },
      pwField('pw1', 'Hlavní heslo', 'new-password'),
      pwField('pw2', 'Heslo znovu', 'new-password'),
      h('p', { class: 'hint', text: `Aspoň ${MIN_LEN} znaků. Nejlépe několik slov, např. „pivo-sud-pondělí-Lipová“.` }),
      err, btn);
    screen(
      h('h1', { text: 'Vítej v appce' }),
      h('p', { text: 'Všechna data budou zašifrovaná v tomto počítači. Odemkneš je jen svým heslem.' }),
      form);
  }

  function codeScreen(code) {
    const btn = h('button', { type: 'submit', class: 'btn primary wide', text: 'Pokračovat' });
    const chk = h('input', { type: 'checkbox', id: 'code-ok', required: true });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', {
      class: 'form',
      onsubmit: (e) => {
        e.preventDefault();
        if (!chk.checked) {
          err.textContent = 'Nejdřív si kód zapiš a potvrď to.';
          return;
        }
        App.unlocked();
      },
    },
      h('p', { class: 'code', text: code }),
      h('p', { text: 'Když zapomeneš heslo, odemkneš data jen tímto kódem. Bez hesla i bez kódu jsou data nenávratně pryč – nikdo jiný je obnovit neumí.' }),
      h('p', { class: 'hint', text: 'Zapiš si ho na papír a schovej doma. Neukládej ho do stejného počítače ani do mailu.' }),
      h('label', { class: 'field check-row' }, chk, h('span', { text: 'Kód mám bezpečně zapsaný' })),
      err, btn);
    screen(h('h1', { text: 'Obnovovací kód' }), form);
  }

  function unlockScreen(keys) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn primary wide', text: 'Odemknout' });
    const form = h('form', {
      class: 'form',
      onsubmit: App.ui.run(async (e) => {
        e.preventDefault();
        err.textContent = '';
        const a = await getAttempts();
        if (a.until > Date.now()) {
          err.textContent = `Moc špatných pokusů. Zkus to znovu za ${Math.ceil((a.until - Date.now()) / 1000)} s.`;
          return;
        }
        const pw = form.querySelector('#pw').value;
        if (!pw) return;
        busy(btn, 'Odemykám…');
        let key;
        try {
          key = await C.openWithPassword(keys, pw);
        } catch (ex) {
          const f = await failAttempt();
          unbusy(btn);
          err.textContent = f.until > Date.now()
            ? `Špatné heslo. Další pokus za ${Math.ceil((f.until - Date.now()) / 1000)} s.`
            : 'Špatné heslo.';
          form.querySelector('#pw').select();
          return;
        }
        await resetAttempts();
        await App.store.load(key);
        App.unlocked();
      }),
    },
      pwField('pw', 'Heslo', 'current-password'),
      err, btn,
      h('button', { type: 'button', class: 'btn link', text: 'Zapomněl jsem heslo', onclick: () => recoveryScreen(keys) }));
    screen(h('h1', { text: 'Odemknout' }), h('p', { class: 'muted', text: 'Appka je zamčená a data jsou zašifrovaná.' }), form);
  }

  function recoveryScreen(keys) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { type: 'submit', class: 'btn primary wide', text: 'Obnovit a odemknout' });
    const form = h('form', {
      class: 'form',
      onsubmit: App.ui.run(async (e) => {
        e.preventDefault();
        err.textContent = '';
        const code = form.querySelector('#rc').value;
        const a = form.querySelector('#pw1').value;
        const b = form.querySelector('#pw2').value;
        const msg = checkNewPassword(a, b);
        if (msg) {
          err.textContent = msg;
          return;
        }
        busy(btn, 'Ověřuji kód…');
        let res;
        try {
          res = await C.resetWithCode(keys, code, a);
        } catch (ex) {
          await failAttempt();
          unbusy(btn);
          err.textContent = 'Obnovovací kód nesedí.';
          return;
        }
        await App.db.setMeta('keys', res.keys);
        await resetAttempts();
        await App.store.load(res.key);
        App.ui.toast('Heslo změněno');
        App.unlocked();
      }),
    },
      h('div', { class: 'field' },
        h('label', { for: 'rc', class: 'label', text: 'Obnovovací kód' }),
        h('input', { id: 'rc', autocomplete: 'off', spellcheck: 'false', placeholder: 'XXXX-XXXX-…' })),
      pwField('pw1', 'Nové heslo', 'new-password'),
      pwField('pw2', 'Nové heslo znovu', 'new-password'),
      err, btn,
      h('button', { type: 'button', class: 'btn link', text: 'Zpět', onclick: () => unlockScreen(keys) }));
    screen(h('h1', { text: 'Obnova hesla' }), form);
  }

  // Změna hesla z Nastavení.
  V.zmenitHeslo = async () => {
    const keys = await App.db.getMeta('keys');
    let result = null;
    const v = await App.ui.form({
      title: 'Změnit heslo',
      fields: [
        { name: 'old', label: 'Současné heslo', type: 'password', required: true, autocomplete: 'current-password' },
        { name: 'a', label: 'Nové heslo', type: 'password', required: true, autocomplete: 'new-password' },
        { name: 'b', label: 'Nové heslo znovu', type: 'password', required: true, autocomplete: 'new-password' },
      ],
      submit: 'Změnit',
      validate: async (vals) => {
        const msg = checkNewPassword(vals.a, vals.b);
        if (msg) return msg;
        try {
          result = await C.changePassword(keys, vals.old, vals.a);
        } catch (e) {
          return 'Současné heslo nesedí.';
        }
        return '';
      },
    });
    if (!v || !result) return;
    await App.db.setMeta('keys', result.keys);
    App.store.key = result.key;
    App.ui.toast('Heslo změněno');
  };
})(window.App);
