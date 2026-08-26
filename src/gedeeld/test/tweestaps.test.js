'use strict';
// node --test src/gedeeld/test/tweestaps.test.js
const test = require('node:test');
const assert = require('node:assert');
const t = require('../tweestaps');

// RFC 6238, bijlage B: geheim "12345678901234567890" (ASCII), SHA1, 8 cijfers
// afgekapt tot de laatste 6 voor onze 6-cijferige codes.
const RFC_GEHEIM = t.base32Encode(Buffer.from('12345678901234567890', 'ascii'));
const RFC_VECTOREN = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('base32: encode/decode is een rondreis', () => {
  for (let n = 1; n <= 25; n++) {
    const buf = require('crypto').randomBytes(n);
    assert.deepStrictEqual(t.base32Decode(t.base32Encode(buf)), buf);
  }
  assert.strictEqual(t.base32Encode(Buffer.from('foobar')), 'MZXW6YTBOI');
  assert.strictEqual(t.base32Decode('mzxw 6ytb-oi').toString(), 'foobar');
});

test('TOTP: klopt met de RFC 6238-testvectoren', () => {
  for (const [seconden, verwacht8] of RFC_VECTOREN) {
    assert.strictEqual(t.totp(RFC_GEHEIM, seconden * 1000), verwacht8.slice(-6), 'T=' + seconden);
  }
});

test('totpGeldig: venster, hergebruik en foute invoer', () => {
  const tijd = 1111111111 * 1000;
  const code = t.totp(RFC_GEHEIM, tijd);
  const teller = t.tellerVoor(tijd);
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code, { tijdMs: tijd }), teller);
  // Eén stap eerder/later mag (klokverschil), twee stappen niet
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code, { tijdMs: tijd + 30000 }), teller);
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code, { tijdMs: tijd - 30000 }), teller);
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code, { tijdMs: tijd + 60000 }), null);
  // Dezelfde code een tweede keer: geweigerd
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code, { tijdMs: tijd, naTeller: teller }), null);
  // Spaties/streepjes in de invoer zijn geen probleem, letters wel
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, code.slice(0, 3) + ' ' + code.slice(3), { tijdMs: tijd }), teller);
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, '000000', { tijdMs: tijd }) === null || t.totp(RFC_GEHEIM, tijd) === '000000', true);
  assert.strictEqual(t.totpGeldig(RFC_GEHEIM, '12345', { tijdMs: tijd }), null);
  assert.strictEqual(t.totpGeldig('', code, { tijdMs: tijd }), null);
});

test('nieuwGeheim en otpauth-URI', () => {
  const g = t.nieuwGeheim();
  assert.match(g, /^[A-Z2-7]{32}$/);
  assert.notStrictEqual(g, t.nieuwGeheim());
  const uri = t.otpauthUri(g, 'AanEnUitbouw.nl', 'beheer');
  assert.strictEqual(uri, `otpauth://totp/AanEnUitbouw.nl:beheer?secret=${g}&issuer=AanEnUitbouw.nl`);
  assert.ok(uri.length <= 136, 'moet in de QR-generator passen');
});

test('back-upcodes: eenmalig, hash-vergelijking, normalisatie', () => {
  const codes = t.nieuweBackupCodes(8);
  assert.strictEqual(codes.length, 8);
  for (const c of codes) assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const hashes = codes.map(t.hashBackupCode);
  assert.strictEqual(t.backupCodeIndex(hashes, codes[3]), 3);
  assert.strictEqual(t.backupCodeIndex(hashes, codes[3].toLowerCase().replace('-', ' ')), 3);
  assert.strictEqual(t.backupCodeIndex(hashes, 'AAAA-AAAA'), -1);
  assert.strictEqual(t.backupCodeIndex(hashes, ''), -1);
  assert.strictEqual(t.backupCodeIndex([], codes[0]), -1);
});

test('sessies: token, verloop en opruimen', async () => {
  const s = new t.Sessies(50);
  const token = s.maak();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.strictEqual(s.geldig(token), true);
  assert.strictEqual(s.geldig(token.slice(0, 63) + '0'), false);
  assert.strictEqual(s.geldig('x'), false);
  await new Promise(r => setTimeout(r, 70));
  assert.strictEqual(s.geldig(token), false);
  const t2 = s.maak();
  s.verwijder(t2);
  assert.strictEqual(s.geldig(t2), false);
  s.maak();
  await new Promise(r => setTimeout(r, 70));
  s.opruimen();
  assert.strictEqual(s.aantal, 0);
});
