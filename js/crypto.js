'use strict';
// Šifrování: vše přes Web Crypto API vestavěné v prohlížeči.
//
// Jak to funguje:
// - Data šifruje jeden náhodný datový klíč (AES-GCM 256 bitů).
// - Datový klíč je uložený dvakrát zabalený (zašifrovaný):
//   klíčem z hesla a klíčem z obnovovacího kódu (PBKDF2-SHA256, 600 000 opakování).
// - Po odemčení se datový klíč drží jen v paměti a je neexportovatelný.
(function (App) {
  const C = {};
  const ITER = 600000;
  const te = new TextEncoder();
  const td = new TextDecoder();
  const subtle = crypto.subtle;

  C.available = () => !!(window.crypto && crypto.subtle && window.indexedDB);

  C.rand = (n) => crypto.getRandomValues(new Uint8Array(n));
  C.b64 = (buf) => {
    const b = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  };
  C.unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

  C.deriveKek = async (secret, saltB64, iter) => {
    const base = await subtle.importKey('raw', te.encode(secret.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: C.unb64(saltB64), iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );
  };

  const newDek = () => subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  const wrap = async (dek, kek) => {
    const iv = C.rand(12);
    const data = await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
    return { iv: C.b64(iv), data: C.b64(data) };
  };

  // Při špatném hesle vyhodí chybu (AES-GCM ověřuje integritu).
  const unwrap = (w, kek, extractable) =>
    subtle.unwrapKey(
      'raw', C.unb64(w.data), kek,
      { name: 'AES-GCM', iv: C.unb64(w.iv) },
      { name: 'AES-GCM', length: 256 },
      !!extractable,
      ['encrypt', 'decrypt']
    );

  C.encryptJSON = async (key, obj) => {
    const iv = C.rand(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: C.b64(iv), ct: C.b64(ct) };
  };

  C.decryptJSON = async (key, rec) => {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: C.unb64(rec.iv) }, key, C.unb64(rec.ct));
    return JSON.parse(td.decode(pt));
  };

  // Obnovovací kód: 160 náhodných bitů, 32 znaků bez snadno zaměnitelných (0/O, 1/I).
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  C.recoveryCode = () => {
    const bytes = C.rand(20);
    let bits = 0;
    let val = 0;
    let out = '';
    for (const b of bytes) {
      val = (val << 8) | b;
      bits += 8;
      while (bits >= 5) {
        out += ALPHA[(val >>> (bits - 5)) & 31];
        bits -= 5;
      }
      val &= (1 << bits) - 1;
    }
    return out.match(/.{4}/g).join('-');
  };
  C.normalizeCode = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // První nastavení: vytvoří datový klíč, heslo a obnovovací kód.
  C.createVault = async (password) => {
    const dek = await newDek();
    const code = C.recoveryCode();
    const saltP = C.b64(C.rand(16));
    const saltR = C.b64(C.rand(16));
    const kekP = await C.deriveKek(password, saltP, ITER);
    const kekR = await C.deriveKek(C.normalizeCode(code), saltR, ITER);
    const keys = { v: 1, iter: ITER, saltP, saltR, wrapP: await wrap(dek, kekP), wrapR: await wrap(dek, kekR) };
    const key = await unwrap(keys.wrapP, kekP, false);
    return { keys, key, code };
  };

  C.openWithPassword = async (keys, password) =>
    unwrap(keys.wrapP, await C.deriveKek(password, keys.saltP, keys.iter), false);

  const rewrapPassword = async (keys, extractableDek, newPassword) => {
    const saltP = C.b64(C.rand(16));
    const kekP = await C.deriveKek(newPassword, saltP, keys.iter);
    const wrapP = await wrap(extractableDek, kekP);
    const next = Object.assign({}, keys, { saltP, wrapP });
    const key = await unwrap(wrapP, kekP, false);
    return { keys: next, key };
  };

  C.changePassword = async (keys, oldPassword, newPassword) => {
    const kekP = await C.deriveKek(oldPassword, keys.saltP, keys.iter);
    const dek = await unwrap(keys.wrapP, kekP, true);
    return rewrapPassword(keys, dek, newPassword);
  };

  C.resetWithCode = async (keys, code, newPassword) => {
    const kekR = await C.deriveKek(C.normalizeCode(code), keys.saltR, keys.iter);
    const dek = await unwrap(keys.wrapR, kekR, true);
    return rewrapPassword(keys, dek, newPassword);
  };

  App.crypto = C;
})(window.App);
