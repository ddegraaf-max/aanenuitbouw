'use strict';

/**
 * 3D BAG (TU Delft): hoogtes per pand, afgeleid uit het AHN.
 *
 *   basis: https://api.3dbag.nl
 *   open, geen sleutel
 *
 * Waarom dit voor jullie uitmaakt: de zwaarte van het staal boven een doorbraak
 * hangt sterker af van wat er BOVEN de opening zit dan van de overspanning
 * zelf. Een doorbraak met alleen een dak erboven is een andere balk dan één met
 * een verdieping plus dakconstructie. Uit de nok- en goothoogte en het aantal
 * bouwlagen valt af te leiden welk van de twee het is.
 *
 * De veldnamen beginnen alle met b3_ en wijzigen tussen versies. Daarom worden
 * ze niet op vaste paden gelezen maar met een zoekfunctie over meerdere
 * kandidaten, met de ruwe attributen erbij voor de diagnose.
 */

const { Cache } = require('../../sondeertool/utils/cache');

const BASIS = (process.env.BAG3D_BASE || 'https://api.3dbag.nl').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.WONINGCHECK_TIMEOUT_MS || 8000);

const cache = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 30, max: 500 });

function getal(obj, namen) {
  for (const naam of namen) {
    const w = obj && obj[naam];
    const n = typeof w === 'string' ? Number.parseFloat(w) : w;
    if (Number.isFinite(n)) return Math.round(n * 100) / 100;
  }
  return null;
}

function tekst(obj, namen) {
  for (const naam of namen) {
    const w = obj && obj[naam];
    if (typeof w === 'string' && w.trim()) return w.trim();
  }
  return null;
}

/**
 * @param {string} pandId BAG-pandidentificatie, met of zonder NL.IMBAG.Pand-voorvoegsel
 */
async function haalHoogtes(pandId, opties = {}) {
  const kort = String(pandId || '').replace(/\D/g, '');
  if (!kort) return null;
  const volledig = `NL.IMBAG.Pand.${kort}`;

  return cache.wrap(`3dbag:${kort}`, async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Math.max(1500, opties.timeoutMs || TIMEOUT_MS));
    let json;
    try {
      const res = await fetch(`${BASIS}/collections/pand/items/${encodeURIComponent(volledig)}`, {
        headers: { Accept: 'application/json' },
        signal: ac.signal,
      });
      const ruw = await res.text();
      if (res.status === 404) return null; // pand niet in 3D BAG, komt voor
      if (!res.ok) throw new Error(`3D BAG gaf HTTP ${res.status}: ${ruw.slice(0, 200)}`);
      try {
        json = JSON.parse(ruw);
      } catch {
        throw new Error(`3D BAG gaf geen JSON: ${ruw.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(t);
    }

    // De attributen kunnen op verschillende plekken in het antwoord zitten.
    const attr =
      (json && json.feature && json.feature.properties) ||
      (json && json.properties) ||
      (json && json.attributes) ||
      json ||
      {};

    const maaiveld = getal(attr, ['b3_h_maaiveld', 'h_maaiveld']);
    const nok = getal(attr, ['b3_h_dak_max', 'h_dak_max']);
    const dak70 = getal(attr, ['b3_h_dak_70p', 'b3_h_dak_50p', 'h_dak_70p']);
    const goot = getal(attr, ['b3_h_dak_min', 'h_dak_min']);

    const hoogteBoven = (waarde) => (waarde !== null && maaiveld !== null ? Math.round((waarde - maaiveld) * 100) / 100 : null);

    return {
      maaiveldNap: maaiveld,
      nokhoogte: hoogteBoven(nok),
      goothoogte: hoogteBoven(goot),
      dakhoogte70: hoogteBoven(dak70),
      daktype: tekst(attr, ['b3_dak_type', 'dak_type']),
      bouwlagen: getal(attr, ['b3_bouwlagen', 'bouwlagen', 'aantal_bouwlagen']),
      _ruw: attr,
    };
  });
}

/**
 * Leidt uit de hoogtes af wat er vermoedelijk boven een doorbraak in de
 * achtergevel zit. Uitdrukkelijk een indicatie: het bepaalt niet het staal,
 * het bepaalt welke vraag de constructeur als eerste stelt.
 */
function bovenDeDoorbraak(hoogtes) {
  if (!hoogtes) return null;
  const lagen = hoogtes.bouwlagen;
  const goot = hoogtes.goothoogte;

  if (Number.isFinite(lagen) && lagen >= 2) {
    return {
      verwachting: 'verdieping',
      tekst: `Het pand heeft naar schatting ${lagen} bouwlagen. Boven een doorbraak in de achtergevel zit dan vrijwel zeker een verdiepingsvloer en daarboven de dakconstructie. Dat vraagt een zwaardere ligger dan een aanbouw met alleen een dak erboven.`,
    };
  }
  if (Number.isFinite(goot) && goot >= 5) {
    return {
      verwachting: 'verdieping',
      tekst: `De goothoogte is ongeveer ${goot.toFixed(1)} m. Dat wijst op minstens twee bouwlagen, dus reken op een verdiepingsvloer boven de doorbraak.`,
    };
  }
  if (Number.isFinite(goot)) {
    return {
      verwachting: 'dak',
      tekst: `De goothoogte is ongeveer ${goot.toFixed(1)} m, wat past bij één bouwlaag. Boven de doorbraak zit dan vermoedelijk alleen de dakconstructie — doorgaans een lichtere ligger.`,
    };
  }
  return null;
}

module.exports = { haalHoogtes, bovenDeDoorbraak, BASIS };
