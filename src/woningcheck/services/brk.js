'use strict';

/**
 * Kadastrale kaart (BRK) via PDOK: perceelgrens en kadastrale oppervlakte.
 *
 *   basis: https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0
 *   open data, CC-BY Kadaster NL — bronvermelding is verplicht en staat
 *   daarom vast op de pagina en in het antwoord van de API.
 *
 * Belangrijk voor de uitleg naar de klant: de kadastrale grootte komt uit de
 * BRK en is de officiële waarde. De grenzen op de kaart zijn ter referentie en
 * hebben geen exacte ligging; oppervlakte narekenen uit de geometrie geeft dus
 * een iets andere uitkomst. We tonen de BRK-waarde en gebruiken de geometrie
 * alleen voor de vorm en de diepte achter de woning.
 */

const { Cache } = require('../../sondeertool/utils/cache');

const BASIS = (process.env.BRK_WFS_BASE || 'https://service.pdok.nl/kadaster/kadastralekaart/wfs/v5_0').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.WONINGCHECK_TIMEOUT_MS || 8000);

const cache = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 30, max: 500 });

function pak(obj, namen) {
  for (const naam of namen) {
    if (obj && obj[naam] !== undefined && obj[naam] !== null && obj[naam] !== '') return obj[naam];
  }
  return null;
}

/** Perceel onder een punt (RD). */
async function haalPerceel({ rdX, rdY }, opties = {}) {
  if (!Number.isFinite(rdX) || !Number.isFinite(rdY)) {
    throw new Error('Geen RD-coördinaten; kan het perceel niet opzoeken.');
  }

  return cache.wrap(`perceel:${rdX.toFixed(1)}:${rdY.toFixed(1)}`, async () => {
    const straal = 2; // klein: we willen het perceel ONDER het adrespunt
    const url = new URL(BASIS);
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '2.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeNames', 'kadastralekaart:Perceel');
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName', 'EPSG:28992');
    url.searchParams.set('count', '5');
    url.searchParams.set('bbox', [rdX - straal, rdY - straal, rdX + straal, rdY + straal, 'EPSG:28992'].join(','));

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), Math.max(1500, opties.timeoutMs || TIMEOUT_MS));
    let json;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
      const tekst = await res.text();
      if (!res.ok) throw new Error(`BRK gaf HTTP ${res.status}: ${tekst.slice(0, 200)}`);
      try {
        json = JSON.parse(tekst);
      } catch {
        throw new Error(`BRK gaf geen JSON: ${tekst.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(t);
    }

    const feature = Array.isArray(json.features) ? json.features[0] : null;
    if (!feature) return null;
    const p = feature.properties || {};

    return {
      // Namen wisselen tussen versies van de service; daarom meerdere kandidaten.
      oppervlakte: Number(pak(p, ['kadastraleGrootteWaarde', 'kadastraleGrootte', 'grootteWaarde', 'oppervlakte'])) || null,
      perceelnummer: pak(p, ['perceelnummer', 'perceelNummer']),
      sectie: pak(p, ['sectie']),
      gemeenteCode: pak(p, ['AKRKadastraleGemeenteCodeWaarde', 'kadastraleGemeenteCode', 'akrKadastraleGemeenteCodeWaarde']),
      aanduiding: pak(p, ['perceelnummerRotatie']) === null ? null : null,
      geometrie: feature.geometry || null,
      bron: 'Kadastrale kaart (BRK), CC-BY Kadaster NL',
      _ruw: p,
    };
  });
}

/** Volledige kadastrale aanduiding, bijvoorbeeld "BSM00 C 4821". */
function aanduidingVan(perceel) {
  if (!perceel) return null;
  const delen = [perceel.gemeenteCode, perceel.sectie, perceel.perceelnummer].filter(Boolean);
  return delen.length ? delen.join(' ') : null;
}

module.exports = { haalPerceel, aanduidingVan, BASIS };
