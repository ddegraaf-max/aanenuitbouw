'use strict';

const { Cache } = require('../utils/cache');

/**
 * Adres/postcode -> coordinaten via de PDOK Locatieserver.
 * Publiek, gratis, geen sleutel nodig. Dit is dezelfde bron die vrijwel elke
 * Nederlandse overheidssite gebruikt voor adresinvoer.
 */

const BASIS =
  process.env.PDOK_LOCATIESERVER ||
  'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

const cache = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 7, max: 1000 });

/** Zet PDOK's WKT "POINT(lon lat)" om naar {lat, lon}. */
function puntUitWkt(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { lon: Number.parseFloat(m[1]), lat: Number.parseFloat(m[2]) };
}

function puntUitWktRd(wkt) {
  if (typeof wkt !== 'string') return null;
  const m = wkt.match(/POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) };
}

/**
 * Zoekt een adres. Werkt met "1234AB", "1234 AB 12", "Torenlaan 5 Bussum",
 * of alleen een plaatsnaam.
 */
async function zoekAdres(vraag, { rows = 6 } = {}) {
  const schoon = String(vraag || '').trim();
  if (schoon.length < 4) {
    const fout = new Error('Vul een postcode, adres of plaatsnaam in (minimaal 4 tekens).');
    fout.statusCode = 400;
    throw fout;
  }

  return cache.wrap(`adres:${schoon.toLowerCase()}:${rows}`, async () => {
    const url = new URL(`${BASIS}/free`);
    url.searchParams.set('q', schoon);
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('fq', 'type:(adres OR postcode OR weg OR woonplaats)');
    url.searchParams.set('fl', 'id,weergavenaam,type,score,centroide_ll,centroide_rd,postcode,woonplaatsnaam,straatnaam,huis_nlt');

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`PDOK Locatieserver gaf HTTP ${res.status}`);
    }
    const json = await res.json();
    const docs = (json && json.response && json.response.docs) || [];

    return docs
      .map((d) => {
        const ll = puntUitWkt(d.centroide_ll);
        if (!ll) return null;
        return {
          id: d.id,
          omschrijving: d.weergavenaam,
          soort: d.type,
          postcode: d.postcode || null,
          plaats: d.woonplaatsnaam || null,
          lat: ll.lat,
          lon: ll.lon,
          rd: puntUitWktRd(d.centroide_rd),
        };
      })
      .filter(Boolean);
  });
}

/** Geeft alleen het beste resultaat terug, of gooit een 404-achtige fout. */
async function beste(vraag) {
  const treffers = await zoekAdres(vraag, { rows: 3 });
  if (treffers.length === 0) {
    const fout = new Error(`Geen locatie gevonden voor "${vraag}". Probeer een postcode met huisnummer.`);
    fout.statusCode = 404;
    throw fout;
  }
  return treffers[0];
}

module.exports = { zoekAdres, beste, _intern: { puntUitWkt } };
