'use strict';

/**
 * PDOK Locatieserver: van een adres naar coördinaten, gemeente en de
 * BAG-identificaties die de andere bronnen nodig hebben.
 *
 * De `free`-zoekopdracht geeft treffers met een id; `lookup` geeft daarna de
 * volledige set velden van één treffer, inclusief het
 * adresseerbaarobject-id (het verblijfsobject) en de gemeentenaam. Die twee
 * zijn de sleutel tot de rest: het verblijfsobject voor de oppervlakte, de
 * gemeente voor het bouwarchief.
 *
 * Publiek, gratis, geen sleutel.
 */

const { Cache } = require('../../sondeertool/utils/cache');

const BASIS = (process.env.PDOK_LOCATIESERVER || 'https://api.pdok.nl/bzk/locatieserver/search/v3_1').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.WONINGCHECK_TIMEOUT_MS || 8000);

const cache = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 7, max: 800 });

async function haal(url, timeoutMs = TIMEOUT_MS) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ac.signal });
    const tekst = await res.text();
    if (!res.ok) {
      const fout = new Error(`PDOK gaf HTTP ${res.status}: ${tekst.slice(0, 200)}`);
      fout.statusCode = 502;
      throw fout;
    }
    try {
      return JSON.parse(tekst);
    } catch {
      throw new Error(`PDOK gaf geen JSON: ${tekst.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

/** WKT "POINT(lon lat)" of "POINT(x y)" naar getallen. */
function puntUitWkt(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  return m ? [Number.parseFloat(m[1]), Number.parseFloat(m[2])] : null;
}

/** Zoekt adressen; alleen echte adressen, want we hebben een huisnummer nodig. */
async function zoekAdres(vraag, { rows = 6, alleenAdres = false } = {}) {
  const schoon = String(vraag || '').trim();
  if (schoon.length < 4) {
    const fout = new Error('Vul een postcode met huisnummer of een volledig adres in.');
    fout.statusCode = 400;
    throw fout;
  }

  return cache.wrap(`zoek:${schoon.toLowerCase()}:${rows}:${alleenAdres}`, async () => {
    const url = new URL(`${BASIS}/free`);
    url.searchParams.set('q', schoon);
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('fq', alleenAdres ? 'type:adres' : 'type:(adres OR postcode)');
    url.searchParams.set('fl', 'id,weergavenaam,type,score,centroide_ll,centroide_rd,gemeentenaam,postcode,huis_nlt,straatnaam,woonplaatsnaam');

    const json = await haal(url);
    const docs = (json && json.response && json.response.docs) || [];
    return docs.map(normaliseer).filter(Boolean);
  });
}

/**
 * Volledige gegevens van één treffer. Levert velden die in de zoekopdracht niet
 * meekomen, waaronder adresseerbaarobject_id en nummeraanduiding_id.
 */
async function detail(id) {
  const schoon = String(id || '').trim();
  if (!schoon) {
    const fout = new Error('Geen adres-id meegegeven.');
    fout.statusCode = 400;
    throw fout;
  }

  return cache.wrap(`detail:${schoon}`, async () => {
    const url = new URL(`${BASIS}/lookup`);
    url.searchParams.set('id', schoon);
    url.searchParams.set('fl', '*');
    const json = await haal(url);
    const doc = json && json.response && json.response.docs && json.response.docs[0];
    if (!doc) {
      const fout = new Error(`Adres ${schoon} niet gevonden bij PDOK.`);
      fout.statusCode = 404;
      throw fout;
    }
    return normaliseer(doc);
  });
}

function normaliseer(doc) {
  const ll = puntUitWkt(doc.centroide_ll);
  const rd = puntUitWkt(doc.centroide_rd);
  if (!ll) return null;
  return {
    id: doc.id,
    omschrijving: doc.weergavenaam,
    soort: doc.type,
    postcode: doc.postcode || null,
    straat: doc.straatnaam || null,
    huisnummer: doc.huis_nlt || null,
    plaats: doc.woonplaatsnaam || null,
    gemeente: doc.gemeentenaam || null,
    lat: ll[1],
    lon: ll[0],
    rdX: rd ? rd[0] : null,
    rdY: rd ? rd[1] : null,
    // De BAG-identificaties heten in de Locatieserver zo; ze komen alleen mee
    // bij een lookup, niet bij een zoekopdracht.
    verblijfsobjectId: doc.adresseerbaarobject_id || null,
    nummeraanduidingId: doc.nummeraanduiding_id || null,
    // Sommige antwoorden bevatten het pand-id al; anders zoeken we dat op via
    // de BAG zelf.
    pandIds: Array.isArray(doc.pandid) ? doc.pandid : doc.pandid ? [doc.pandid] : [],
  };
}

/** Beste treffer voor een zoekterm, met de detailvelden erbij. */
async function beste(vraag) {
  const treffers = await zoekAdres(vraag, { rows: 5 });
  const adres = treffers.find((t) => t.soort === 'adres') || treffers[0];
  if (!adres) {
    const fout = new Error(`Geen adres gevonden voor "${vraag}". Probeer een postcode met huisnummer.`);
    fout.statusCode = 404;
    throw fout;
  }
  // De zoekopdracht geeft de BAG-id's niet mee; die halen we met een lookup op.
  try {
    const volledig = await detail(adres.id);
    return { ...adres, ...volledig };
  } catch {
    return adres; // liever een adres zonder BAG-id's dan geen antwoord
  }
}

module.exports = { zoekAdres, detail, beste, BASIS, _intern: { puntUitWkt, normaliseer } };
