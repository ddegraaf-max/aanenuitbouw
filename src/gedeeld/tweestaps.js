'use strict';

/**
 * Tweestapsverificatie voor het beheer — TOTP volgens RFC 6238, zonder externe
 * pakketten. Werkt met Google Authenticator, Microsoft Authenticator, Authy,
 * 1Password en elke andere app die "time-based one-time passwords" kent.
 *
 * Wat hier staat:
 *   - base32 (het formaat waarin authenticator-apps het geheim verwachten)
 *   - HOTP/TOTP (HMAC-SHA1, 6 cijfers, stap van 30 seconden)
 *   - back-upcodes (eenmalig te gebruiken, alleen als hash bewaard)
 *   - sessies (na inloggen krijgt de browser een willekeurig token; het
 *     wachtwoord blijft daardoor niet meer in de browser hangen)
 *
 * Alles is puur en zonder toestand, behalve de klasse Sessies. Getest met de
 * testvectoren uit RFC 6238 (zie test/tweestaps.test.js).
 */

const crypto = require('crypto');

const BASE32_TEKENS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0;
  let waarde = 0;
  let uit = '';
  for (const byte of buf) {
    waarde = ((waarde << 8) | byte) & 0x1fff;
    bits += 8;
    while (bits >= 5) {
      uit += BASE32_TEKENS[(waarde >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) uit += BASE32_TEKENS[(waarde << (5 - bits)) & 31];
  return uit;
}

function base32Decode(str) {
  const schoon = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let waarde = 0;
  const bytes = [];
  for (const ch of schoon) {
    waarde = ((waarde << 5) | BASE32_TEKENS.indexOf(ch)) & 0x1fff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((waarde >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Nieuw geheim: 20 willekeurige bytes = 32 base32-tekens (wat apps verwachten). */
function nieuwGeheim() {
  return base32Encode(crypto.randomBytes(20));
}

/** HOTP (RFC 4226): HMAC-SHA1 over de teller, dynamisch afgekapt tot 6 cijfers. */
function hotp(sleutel, teller, cijfers = 6) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(teller / 0x100000000), 0);
  msg.writeUInt32BE(teller >>> 0, 4);
  const h = crypto.createHmac('sha1', sleutel).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 10 ** cijfers).padStart(cijfers, '0');
}

const STAP_SECONDEN = 30;

function tellerVoor(tijdMs) {
  return Math.floor(tijdMs / 1000 / STAP_SECONDEN);
}

/** De code die de app op dit moment toont. */
function totp(geheim, tijdMs = Date.now()) {
  return hotp(base32Decode(geheim), tellerVoor(tijdMs));
}

function normaliseerCode(code) {
  return String(code || '').replace(/\D/g, '');
}

function veiligGelijk(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Controleert een ingevoerde code. Accepteert de huidige stap en `venster`
 * stappen ervoor en erna (klokverschil telefoon/server). Geeft de gebruikte
 * teller terug, of null. Met `naTeller` wordt hergebruik van dezelfde code
 * geweigerd: elke code werkt maar één keer.
 */
function totpGeldig(geheim, code, opties = {}) {
  const tijdMs = opties.tijdMs != null ? opties.tijdMs : Date.now();
  const venster = opties.venster != null ? opties.venster : 1;
  const naTeller = opties.naTeller != null ? opties.naTeller : -1;
  const ingevoerd = normaliseerCode(code);
  if (ingevoerd.length !== 6) return null;
  const sleutel = base32Decode(geheim);
  if (sleutel.length < 10) return null;
  const basis = tellerVoor(tijdMs);
  let gevonden = null;
  for (let d = -venster; d <= venster; d++) {
    const teller = basis + d;
    if (teller <= naTeller) continue;
    // Geen vroegtijdige return: altijd alle stappen langslopen (timing).
    if (veiligGelijk(hotp(sleutel, teller), ingevoerd) && gevonden === null) gevonden = teller;
  }
  return gevonden;
}

/** De URI die de authenticator-app inleest (als QR of handmatig). */
function otpauthUri(geheim, uitgever, account) {
  const u = encodeURIComponent(uitgever);
  return `otpauth://totp/${u}:${encodeURIComponent(account)}?secret=${geheim}&issuer=${u}`;
}

// ---- Back-upcodes: 8 stuks, eenmalig, zonder verwarrende tekens (0/O, 1/I) ----
const BACKUP_TEKENS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nieuweBackupCodes(aantal = 8) {
  const codes = [];
  for (let i = 0; i < aantal; i++) {
    const bytes = crypto.randomBytes(8);
    let s = '';
    for (let j = 0; j < 8; j++) s += BACKUP_TEKENS[bytes[j] % BACKUP_TEKENS.length];
    codes.push(s.slice(0, 4) + '-' + s.slice(4));
  }
  return codes;
}

function normaliseerBackupCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update('aeu-backup:' + normaliseerBackupCode(code)).digest('hex');
}

/** Index van de passende hash, of -1. Loopt altijd alle hashes langs. */
function backupCodeIndex(hashes, code) {
  const h = hashBackupCode(code);
  let gevonden = -1;
  (hashes || []).forEach((kandidaat, i) => {
    if (veiligGelijk(kandidaat, h) && gevonden === -1) gevonden = i;
  });
  return normaliseerBackupCode(code).length === 8 ? gevonden : -1;
}

// ---- Sessies: token in plaats van wachtwoord in de browser ----
class Sessies {
  constructor(ttlMs) {
    this.ttl = ttlMs;
    this.map = new Map(); // token -> verloopt (ms)
  }
  maak() {
    const token = crypto.randomBytes(32).toString('hex');
    this.map.set(token, Date.now() + this.ttl);
    return token;
  }
  geldig(token) {
    if (typeof token !== 'string' || token.length !== 64) return false;
    const verloopt = this.map.get(token);
    if (!verloopt) return false;
    if (Date.now() > verloopt) {
      this.map.delete(token);
      return false;
    }
    return true;
  }
  verwijder(token) {
    this.map.delete(token);
  }
  opruimen() {
    const nu = Date.now();
    for (const [token, verloopt] of this.map) if (nu > verloopt) this.map.delete(token);
  }
  get aantal() {
    return this.map.size;
  }
}

module.exports = {
  base32Encode,
  base32Decode,
  nieuwGeheim,
  hotp,
  totp,
  totpGeldig,
  tellerVoor,
  otpauthUri,
  nieuweBackupCodes,
  hashBackupCode,
  backupCodeIndex,
  normaliseerCode,
  Sessies,
  STAP_SECONDEN,
};
