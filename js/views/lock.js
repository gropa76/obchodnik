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

  // ---------- Odemčení ----------
  const PIN_POKUSY = 5;
  const loadQuick = async () => (await App.db.getMeta('quick')) || {};
  const saveQuick = async (q) => { await App.db.setMeta('quick', q); App.quick = q; };

  async function finish(key) {
    await resetAttempts();
    await App.store.load(key);
    App.quick = await loadQuick();
    App.unlocked();
  }

  async function unlockScreen(keys, forcePassword, msg) {
    const quick = await loadQuick();
    App.quick = quick;
    if (!forcePassword && (quick.pin || quick.bio)) quickScreen(keys, quick);
    else passwordScreen(keys, quick, msg);
  }

  // PIN a/nebo otisk.
  function quickScreen(keys, quick) {
    const err = h('p', { class: 'form-error', role: 'alert' });
    const kids = [h('h1', { text: 'Odemknout' })];

    if (quick.bio) {
      const bbtn = h('button', {
        type: 'button', class: 'btn primary wide', text: 'Odemknout otiskem prstu',
        onclick: async () => {
          err.textContent = '';
          let secret;
          try {
            secret = await App.bio.secret(quick.bio.credId, quick.bio.salt);
          } catch (e) {
            err.textContent = 'Ověření se nepovedlo nebo bylo zrušeno. Zkus to znovu' + (quick.pin ? ', nebo zadej PIN.' : ', nebo odemkni heslem.');
            return;
          }
          busy(bbtn, 'Odemykám…');
          try {
            const key = await C.openWithBio(quick.bio, secret);
            await finish(key);
          } catch (e) {
            unbusy(bbtn);
            err.textContent = 'Otisk nejde použít. Odemkni heslem a v Nastavení ho zapni znovu.';
          } finally {
            secret.fill(0);
          }
        },
      });
      kids.push(bbtn);
    }

    if (quick.pin) {
      const input = h('input', {
        id: 'pin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
        autocomplete: 'off', class: 'pin-input', 'aria-describedby': 'pin-help',
      });
      let working = false;
      input.addEventListener('input', async () => {
        input.value = input.value.replace(/\D/g, '').slice(0, 4);
        if (input.value.length < 4 || working) return;
        working = true;
        err.textContent = '';
        const deviceKey = await App.db.getMeta('deviceKey');
        let key = null;
        try {
          if (deviceKey) key = await C.openWithPin(quick.pin, input.value, deviceKey);
        } catch (e) { key = null; }
        if (key) {
          quick.pinFails = 0;
          await saveQuick(quick);
          await finish(key);
          return;
        }
        quick.pinFails = (quick.pinFails || 0) + 1;
        if (!deviceKey || quick.pinFails >= PIN_POKUSY) {
          delete quick.pin;
          quick.pinFails = 0;
          await saveQuick(quick);
          unlockScreen(keys, true, deviceKey
            ? `${PIN_POKUSY}× špatný PIN, PIN je vypnutý. Odemkni heslem a v Nastavení si ho nastav znovu.`
            : 'PIN v tomto prohlížeči nejde použít. Odemkni heslem a nastav ho znovu.');
          return;
        }
        await saveQuick(quick);
        const zbyva = PIN_POKUSY - quick.pinFails;
        err.textContent = `Špatný PIN. ${zbyva === 1 ? 'Zbývá poslední pokus' : `Zbývají ${zbyva} pokusy`}, pak bude potřeba heslo.`;
        input.value = '';
        working = false;
        input.focus();
      });
      kids.push(h('div', { class: 'field pin-field' },
        h('label', { for: 'pin', class: 'label', text: 'PIN' }),
        input,
        h('p', { id: 'pin-help', class: 'hint', text: 'Po zadání 4 číslic se appka sama odemkne.' })));
    }

    kids.push(err, h('button', { type: 'button', class: 'btn link', text: 'Odemknout hlavním heslem', onclick: () => unlockScreen(keys, true) }));
    screen(...kids);
  }

  function passwordScreen(keys, quick, msg) {
    const err = h('p', { class: 'form-error', role: 'alert', text: msg || '' });
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
        await finish(key);
      }),
    },
      pwField('pw', 'Hlavní heslo', 'current-password'),
      err, btn,
      quick && (quick.pin || quick.bio)
        ? h('button', { type: 'button', class: 'btn link', text: quick.pin ? 'Odemknout PINem' : 'Odemknout otiskem', onclick: () => unlockScreen(keys) })
        : null,
      h('button', { type: 'button', class: 'btn link', text: 'Zapomněl jsem heslo', onclick: () => recoveryScreen(keys) }));
    screen(h('h1', { text: 'Odemknout' }), h('p', { class: 'muted', text: 'Appka je zamčená a data jsou zašifrovaná.' }), form);
  }

  // ---------- Nastavení rychlého odemčení ----------
  const SLABE_PINY = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
    '1234', '2345', '3456', '4567', '5678', '6789', '0123', '4321', '9876', '8765', '1212', '1122', '2580', '0852', '1010', '6969'];

  const hesloField = { name: 'heslo', label: 'Hlavní heslo', type: 'password', required: true, autocomplete: 'current-password' };
  const overHeslo = async (keys, heslo, set) => {
    try { set(await C.dekRawFromPassword(keys, heslo)); return ''; } catch (e) { return 'Hlavní heslo nesedí.'; }
  };

  V.nastavitPin = async () => {
    const keys = await App.db.getMeta('keys');
    let raw = null;
    const v = await App.ui.form({
      title: 'PIN pro rychlé odemčení',
      intro: 'Pro nastavení zadej hlavní heslo. Po 5 špatných pokusech se PIN vypne a bude potřeba heslo.',
      fields: [
        hesloField,
        { name: 'pin', label: 'Nový PIN (4 číslice)', type: 'password', required: true, inputmode: 'numeric', maxlength: 4, autocomplete: 'off' },
        { name: 'pin2', label: 'PIN znovu', type: 'password', required: true, inputmode: 'numeric', maxlength: 4, autocomplete: 'off' },
      ],
      submit: 'Uložit PIN',
      validate: async (x) => {
        if (!/^\d{4}$/.test(x.pin)) return 'PIN musí mít přesně 4 číslice.';
        if (x.pin !== x.pin2) return 'PINy se neshodují.';
        if (SLABE_PINY.includes(x.pin)) return 'Tenhle PIN se dá snadno uhodnout. Zvol jiný.';
        return overHeslo(keys, x.heslo, (r) => { raw = r; });
      },
    });
    if (!v || !raw) return;
    try {
      let deviceKey = await App.db.getMeta('deviceKey');
      if (!deviceKey) {
        deviceKey = await C.newDeviceKey();
        await App.db.setMeta('deviceKey', deviceKey);
      }
      const q = await loadQuick();
      q.pin = await C.wrapForPin(raw, v.pin, deviceKey);
      q.pinFails = 0;
      await saveQuick(q);
    } finally {
      raw.fill(0);
    }
    App.ui.toast('PIN nastaven');
    App.render();
  };

  V.zapnoutOtisk = async () => {
    // Registrace hned po kliknutí – iPhone jinak ověření nedovolí.
    let reg;
    try {
      reg = await App.bio.register();
    } catch (e) {
      App.ui.toast(e && e.message === 'NO_PRF'
        ? 'Toto zařízení neumí otiskem bezpečně chránit data webové appky. Použij PIN.'
        : 'Otisk se nepodařilo nastavit (zrušeno nebo nepodporováno).');
      return;
    }
    const keys = await App.db.getMeta('keys');
    let raw = null;
    const v = await App.ui.form({
      title: 'Otisk prstu',
      intro: 'Otisk je ověřený. Pro dokončení zadej hlavní heslo.',
      fields: [hesloField],
      submit: 'Zapnout',
      validate: (x) => overHeslo(keys, x.heslo, (r) => { raw = r; }),
    });
    if (!v || !raw) { reg.secret.fill(0); return; }
    try {
      const q = await loadQuick();
      q.bio = Object.assign({ credId: reg.credId, salt: reg.salt }, await C.wrapForBio(raw, reg.secret));
      await saveQuick(q);
    } finally {
      raw.fill(0);
      reg.secret.fill(0);
    }
    App.ui.toast('Odemykání otiskem zapnuto');
    App.render();
  };

  V.vypnoutRychle = async (co) => {
    const q = await loadQuick();
    delete q[co];
    if (co === 'pin') q.pinFails = 0;
    await saveQuick(q);
    App.ui.toast(co === 'pin' ? 'PIN vypnutý' : 'Otisk vypnutý');
    App.render();
  };

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
