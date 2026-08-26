/*
 * Kleine QR-codegenerator (byte-modus, foutcorrectie L, versie 1 t/m 6 —
 * tot 136 tekens). Gebruikt door het beheer om het geheim van de
 * authenticator als QR te tonen, zodat dat geheim nooit naar een externe
 * QR-dienst hoeft. Gebaseerd op ISO/IEC 18004; opzet naar Nayuki's
 * referentie-implementatie.
 *
 * Gebruik:  QR.svg('otpauth://…')  →  string met een <svg>
 *           QR.matrix('tekst')     →  array van rijen met true/false (donker)
 *
 * Werkt in de browser (window.QR) en in Node (module.exports), zodat de
 * uitvoer in een test met een echte QR-lezer te controleren is.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---- Galois-veld GF(256) voor Reed-Solomon ----
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  function gfMul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }

  function rsGenerator(graad) {
    let g = [1];
    for (let i = 0; i < graad; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= gfMul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g; // aflopende machten, g[0] = 1
  }

  function rsRest(data, graad) {
    const g = rsGenerator(graad);
    const rest = new Array(graad).fill(0);
    for (const d of data) {
      const factor = d ^ rest[0];
      rest.shift();
      rest.push(0);
      if (factor) for (let j = 0; j < graad; j++) rest[j] ^= gfMul(g[j + 1], factor);
    }
    return rest;
  }

  // ---- Versietabel, foutcorrectieniveau L: [totaal codewoorden, EC per blok, blokken] ----
  const VERSIES = [null, [26, 7, 1], [44, 10, 1], [70, 15, 1], [100, 20, 1], [134, 26, 1], [172, 18, 2]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

  function dataCapaciteit(v) {
    const [totaal, ec, blokken] = VERSIES[v];
    return totaal - ec * blokken;
  }

  function naarBytes(tekst) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(tekst));
    return Array.from(Buffer.from(tekst, 'utf8'));
  }

  function kiesVersie(aantalBytes) {
    for (let v = 1; v < VERSIES.length; v++) {
      const bitsNodig = 4 + 8 + aantalBytes * 8;
      if (bitsNodig <= dataCapaciteit(v) * 8) return v;
    }
    throw new Error('Tekst te lang voor deze QR-generator (max ± 136 tekens)');
  }

  function bouwCodewoorden(bytes, v) {
    const cap = dataCapaciteit(v);
    const bits = [];
    const push = (waarde, n) => { for (let i = n - 1; i >= 0; i--) bits.push((waarde >>> i) & 1); };
    push(0b0100, 4);          // byte-modus
    push(bytes.length, 8);    // lengte (8 bits bij versie 1-9)
    for (const b of bytes) push(b, 8);
    push(0, Math.min(4, cap * 8 - bits.length)); // afsluiter
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);

    // Blokken + foutcorrectie, daarna verweven (interleaving)
    const [totaal, ecLen, blokken] = VERSIES[v];
    const korteBlokken = blokken - (totaal % blokken);
    const korteLen = Math.floor(totaal / blokken);
    const blokData = [];
    let k = 0;
    for (let i = 0; i < blokken; i++) {
      const len = korteLen - ecLen + (i < korteBlokken ? 0 : 1);
      const d = data.slice(k, k + len);
      k += len;
      const ec = rsRest(d, ecLen);
      if (i < korteBlokken) d.push(0); // dummy zodat alle blokken even lang zijn; wordt hieronder overgeslagen
      blokData.push(d.concat(ec));
    }
    const uit = [];
    for (let i = 0; i < blokData[0].length; i++) {
      blokData.forEach((blok, j) => {
        if (i === korteLen - ecLen && j < korteBlokken) return; // de dummy-byte
        uit.push(blok[i]);
      });
    }
    return uit;
  }

  // ---- Matrix ----
  function matrix(tekst, opties) {
    const forceerMasker = opties && Number.isInteger(opties.masker) ? opties.masker : null;
    const bytes = naarBytes(tekst);
    const v = kiesVersie(bytes.length);
    const maat = 17 + 4 * v;
    const mod = Array.from({ length: maat }, () => new Array(maat).fill(false));
    const functie = Array.from({ length: maat }, () => new Array(maat).fill(false));
    const zet = (x, y, donker) => { if (y >= 0 && y < maat && x >= 0 && x < maat) { mod[y][x] = donker; functie[y][x] = true; } };

    // Timing
    for (let i = 0; i < maat; i++) { zet(6, i, i % 2 === 0); zet(i, 6, i % 2 === 0); }
    // Zoekpatronen
    const zoeker = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const afst = Math.max(Math.abs(dx), Math.abs(dy));
        zet(cx + dx, cy + dy, afst !== 2 && afst !== 4);
      }
    };
    zoeker(3, 3); zoeker(maat - 4, 3); zoeker(3, maat - 4);
    // Uitlijnpatronen
    const al = ALIGN[v];
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) zet(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // Formaatbits reserveren (met masker 0), donkere module
    formaatBits(mod, functie, maat, 0);

    // Datacodewoorden plaatsen (zigzag)
    const data = bouwCodewoorden(bytes, v);
    let i = 0;
    for (let rechts = maat - 1; rechts >= 1; rechts -= 2) {
      if (rechts === 6) rechts = 5;
      for (let vert = 0; vert < maat; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = rechts - j;
          const omhoog = ((rechts + 1) & 2) === 0;
          const y = omhoog ? maat - 1 - vert : vert;
          if (!functie[y][x] && i < data.length * 8) {
            mod[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }

    // Beste masker kiezen
    let besteMasker = forceerMasker == null ? 0 : forceerMasker;
    let besteScore = Infinity;
    for (let m = 0; m < 8 && forceerMasker == null; m++) {
      pasMaskerToe(mod, functie, maat, m);
      formaatBits(mod, functie, maat, m);
      const score = strafpunten(mod, maat);
      if (score < besteScore) { besteScore = score; besteMasker = m; }
      pasMaskerToe(mod, functie, maat, m); // ongedaan maken (XOR)
    }
    pasMaskerToe(mod, functie, maat, besteMasker);
    formaatBits(mod, functie, maat, besteMasker);
    return mod;
  }

  function formaatBits(mod, functie, maat, masker) {
    const data = (0b01 << 3) | masker; // niveau L = 01
    let rest = data;
    for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
    const bits = ((data << 10) | rest) ^ 0x5412;
    const bit = i => ((bits >>> i) & 1) === 1;
    const zet = (x, y, donker) => { mod[y][x] = donker; functie[y][x] = true; };
    for (let i = 0; i <= 5; i++) zet(8, i, bit(i));
    zet(8, 7, bit(6)); zet(8, 8, bit(7)); zet(7, 8, bit(8));
    for (let i = 9; i < 15; i++) zet(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) zet(maat - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) zet(8, maat - 15 + i, bit(i));
    zet(8, maat - 8, true);
  }

  function pasMaskerToe(mod, functie, maat, m) {
    for (let y = 0; y < maat; y++) for (let x = 0; x < maat; x++) {
      if (functie[y][x]) continue;
      let inv;
      switch (m) {
        case 0: inv = (x + y) % 2 === 0; break;
        case 1: inv = y % 2 === 0; break;
        case 2: inv = x % 3 === 0; break;
        case 3: inv = (x + y) % 3 === 0; break;
        case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
        case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
        default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
      }
      if (inv) mod[y][x] = !mod[y][x];
    }
  }

  function strafpunten(mod, maat) {
    let straf = 0;
    const lijn = (lees) => {
      let kleur = null, run = 0;
      for (let i = 0; i < maat; i++) {
        const c = lees(i);
        if (c === kleur) { run++; if (run === 5) straf += 3; else if (run > 5) straf += 1; }
        else { kleur = c; run = 1; }
      }
      // Zoekpatroon-achtige reeksen 1011101 met 4 lichte modules ernaast
      const s = Array.from({ length: maat }, (_, i) => (lees(i) ? '1' : '0')).join('');
      for (let p = s.indexOf('10111010000'); p !== -1; p = s.indexOf('10111010000', p + 1)) straf += 40;
      for (let p = s.indexOf('00001011101'); p !== -1; p = s.indexOf('00001011101', p + 1)) straf += 40;
    };
    for (let y = 0; y < maat; y++) lijn(x => mod[y][x]);
    for (let x = 0; x < maat; x++) lijn(y => mod[y][x]);
    for (let y = 0; y < maat - 1; y++) for (let x = 0; x < maat - 1; x++) {
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) straf += 3;
    }
    let donker = 0;
    for (const rij of mod) for (const c of rij) if (c) donker++;
    const totaal = maat * maat;
    const k = Math.ceil(Math.abs(donker * 20 - totaal * 10) / totaal) - 1;
    straf += Math.max(0, k) * 10;
    return straf;
  }

  function svg(tekst, opties) {
    const o = opties || {};
    const stil = o.rand != null ? o.rand : 4;
    const mod = matrix(tekst);
    const maat = mod.length;
    const n = maat + stil * 2;
    let d = '';
    for (let y = 0; y < maat; y++) for (let x = 0; x < maat; x++) if (mod[y][x]) d += `M${x + stil} ${y + stil}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR-code"${o.breedte ? ` width="${o.breedte}" height="${o.breedte}"` : ''}><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }

  return { matrix, svg };
});
