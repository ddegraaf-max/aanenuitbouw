'use strict';

/**
 * Versiestempel van de hele site.
 *
 * Waarom dit bestaat: na een upload wil je binnen twee seconden weten of de
 * nieuwe versie er echt op staat. Een deploy kan slagen terwijl een bestand
 * niet is meegekomen, of terwijl Cloudflare of je browser nog een oude versie
 * uitlevert. Dan lijkt alles in orde en zoek je een avond in de verkeerde
 * richting.
 *
 * Bij het opstarten wordt een sha1 berekend over de inhoud van alle relevante
 * bestanden. Elke wijziging in welk bestand dan ook geeft een andere stempel.
 * Die is te zien:
 *
 *   - in de footer van de hoofdsite
 *   - onderaan de bodemcheck-pagina
 *   - als JSON op /bodemcheck/api/versie   (ook per bestand)
 *   - in /bodemcheck/api/diagnose
 *
 * Staat er na een deploy nog dezelfde stempel, dan is de upload niet
 * aangekomen. Is de stempel op de pagina anders dan die van de API, dan kijk je
 * naar een gecachte pagina.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Projectroot: modules/sondeertool -> src -> root
const WORTEL = path.resolve(__dirname, '..', '..');

// Bestanden van de site zelf. Ontbreekt er een, dan wordt die stil
// overgeslagen: niet elke installatie heeft dezelfde pagina's.
const SITE_BESTANDEN = ['server.js', 'configurator.html', 'project.html', 'projectfasen.js', 'versie.json', 'package.json'];

/**
 * Leesbaar versienummer uit versie.json in de projectroot, bijv. "2026-001".
 * Wordt bij elke wijziging met de hand opgehoogd (jaar-volgnummer); de hash
 * hieronder blijft bestaan als technische controle of een deploy is aangekomen.
 */
function leesVersieNummer() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(WORTEL, 'versie.json'), 'utf8'));
    return { nummer: String(v.nummer || ''), datum: String(v.datum || ''), omschrijving: String(v.omschrijving || '') };
  } catch {
    return { nummer: '', datum: '', omschrijving: '' };
  }
}

function hashVanBestand(pad) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(pad)).digest('hex');
  } catch {
    return null;
  }
}

/** Alle bestanden onder een map, gesorteerd, zodat de hash stabiel is. */
function bestandenIn(map) {
  const uit = [];
  const loop = (huidig) => {
    let inhoud;
    try {
      inhoud = fs.readdirSync(huidig, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of inhoud.sort((a, b) => a.name.localeCompare(b.name))) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const vol = path.join(huidig, item.name);
      if (item.isDirectory()) loop(vol);
      else uit.push(vol);
    }
  };
  loop(map);
  return uit.sort();
}

function bepaalVersie() {
  const bestanden = {};
  const totaal = crypto.createHash('sha1');

  for (const naam of SITE_BESTANDEN) {
    const h = hashVanBestand(path.join(WORTEL, naam));
    if (h) {
      bestanden[naam] = h.slice(0, 10);
      totaal.update(naam).update(h);
    }
  }

  // De module als geheel, inclusief de assets die naar de browser gaan.
  const moduleHash = crypto.createHash('sha1');
  let aantal = 0;
  for (const bestand of bestandenIn(__dirname)) {
    const h = hashVanBestand(bestand);
    if (!h) continue;
    moduleHash.update(path.relative(__dirname, bestand)).update(h);
    aantal++;
  }
  const moduleDigest = moduleHash.digest('hex');
  bestanden['src/sondeertool'] = `${moduleDigest.slice(0, 10)} (${aantal} bestanden)`;
  totaal.update('module').update(moduleDigest);

  return {
    ...leesVersieNummer(),
    versie: totaal.digest('hex').slice(0, 10),
    gestart: new Date().toISOString(),
    node: process.version,
    bestanden,
  };
}

const info = bepaalVersie();

/** Korte, leesbare regel voor de footer. */
function korteTekst() {
  const nummer = info.nummer ? `versie ${info.nummer} (${info.versie})` : `versie ${info.versie}`;
  return `${nummer} · ${info.gestart.slice(0, 16).replace('T', ' ')} UTC`;
}

module.exports = { ...info, korteTekst, _intern: { bepaalVersie, WORTEL } };
