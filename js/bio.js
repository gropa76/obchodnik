'use strict';
// Otisk prstu / Face ID / Windows Hello přes WebAuthn s rozšířením PRF.
// PRF = čip zařízení vydá tajný klíč jen po ověření otiskem. Bez PRF otisk nenabízíme,
// protože by byl jen „tlačítkem“ a data by nechránil.
(function (App) {
  const C = App.crypto;
  const B = {};

  B.supported = async () => {
    try {
      return !!(window.PublicKeyCredential &&
        PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
        (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()));
    } catch (e) {
      return false;
    }
  };

  const prfFirst = (cred) => {
    const r = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    return r.prf && r.prf.results && r.prf.results.first ? new Uint8Array(r.prf.results.first) : null;
  };

  // Tajný klíč z čipu – vyžádá otisk.
  B.secret = async (credIdB64, saltB64) => {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: C.rand(32),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: C.unb64(credIdB64) }],
        userVerification: 'required',
        timeout: 60000,
        extensions: { prf: { eval: { first: C.unb64(saltB64) } } },
      },
    });
    const s = prfFirst(cred);
    if (!s) throw new Error('NO_PRF');
    return s;
  };

  // Registrace otisku. Volat přímo z kliknutí (iPhone to jinak nedovolí).
  B.register = async () => {
    const salt = C.rand(32);
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: 'Obchodník', id: location.hostname },
        user: { id: C.rand(16), name: 'Obchodník – odemčení', displayName: 'Obchodník' },
        challenge: C.rand(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        extensions: { prf: { eval: { first: salt } } },
      },
    });
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    if (!ext.prf || ext.prf.enabled === false) throw new Error('NO_PRF');
    const credId = C.b64(cred.rawId);
    const saltB64 = C.b64(salt);
    // Některá zařízení vydají klíč už při registraci, jiná až při prvním ověření.
    const secret = prfFirst(cred) || (await B.secret(credId, saltB64));
    return { credId, salt: saltB64, secret };
  };

  App.bio = B;
})(window.App);
