'use strict';

/**
 * BAG via PDOK: oppervlakte, bouwjaar en de contour van het pand.
 *
 *   basis: https://api.pdok.nl/kadaster/bag/ogc/v2
 *   auth:  geen
 *   kosten: geen
 *
 * Let op: deze service is bedoeld voor losse bevragingen, niet voor bulk. Dat
 * past bij ons gebruik (één adres per bezoeker) en is de reden dat de
 * resultaten dertig dagen worden gecached: een bouwjaar verandert niet.
 *
 * De attribuutnamen in de OGC API zijn niet in beton gegoten. Daarom wordt hier
 * niet op vaste paden gelezen maar met `pakGetal`/`pakTekst` gezocht op een
 * aantal mogelijke namen. Bij de sondeertool bleek dat het verschil tussen
 * werken en stil nul resultaten opleveren.
 */

const { Cache } = require('../../sondeertool/utils/cache');

const BASIS = (process.env.BAG_OGC_BASE || 'https://api.pdok.nl/kadaster/bag/ogc/v2').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.WONINGCHECK_TIMEOUT_MS || 8000);

const cache = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 30, max: 500 });

async function haalJson(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), Math.max(1500, timeoutMs || TIMEOUT_MS));
  try {
    const res = await fetch(url, { headers: { Accept: 'application/geo+json,application/json' }, signal: ac.signal });
    const tekst = await res.text();
    if (!res.ok) throw new Error(`BAG gaf HTTP ${res.status}: ${tekst.slice(0, 200)}`);
    try {
      return JSON.parse(tekst);
    } catch {
      throw new Error(`BAG gaf geen JSON: ${tekst.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(t);
  }
}

/** Zoekt een getal onder een van meerdere mogelijke veldnamen. */
function pakGetal(obj, namen) {
  for (const naam of namen) {
    const w = obj && obj[naam];
    const n = typeof w === 'string' ? Number.parseFloat(w) : w;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function pakTekst(obj, namen) {
  for (const naam of namen) {
    const w = obj && obj[naam];
    if (typeof w === 'string' && w.trim()) return w.trim();
  }
  return null;
}

/** Oppervlakte van een polygoon in vierkante meters (RD-coördinaten). */
function vlakOppervlakte(ringen) {
  if (!Array.isArray(ringen) || ringen.length === 0) return null;
  const som = (ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return Math.abs(a) / 2;
  };
  // eerste ring is de buitenrand, de rest zijn gaten
  let opp = som(ringen[0]);
  for (let i = 1; i < ringen.length; i++) opp -= som(ringen[i]);
  return opp > 0 ? Math.round(opp * 10) / 10 : null;
}

/** Langste en kortste zijde van de omhullende rechthoek, in meters. */
function afmetingenVanContour(ringen) {
  if (!Array.isArray(ringen) || !ringen[0]) return null;
  const punten = ringen[0];
  const xs = punten.map((p) => p[0]);
  const ys = punten.map((p) => p[1]);
  const breedte = Math.max(...xs) - Math.min(...xs);
  const diepte = Math.max(...ys) - Math.min(...ys);
  return {
    langsteZijde: Math.round(Math.max(breedte, diepte) * 10) / 10,
    kortsteZijde: Math.round(Math.min(breedte, diepte) * 10) / 10,
  };
}

/**
 * Haalt features op uit een collectie. Filtert op een bbox rond het punt in
 * RD, want dat werkt ook als het filteren op identificatie niet ondersteund is.
 */
async function features(collectie, { rdX, rdY, straal = 25, limit = 20, timeoutMs } = {}) {
  const url = new URL(`${BASIS}/collections/${collectie}/items`);
  url.searchParams.set('bbox', [rdX - straal, rdY - straal, rdX + straal, rdY + straal].join(','));
  url.searchParams.set('bbox-crs', 'http://www.opengis.net/def/crs/EPSG/0/28992');
  url.searchParams.set('crs', 'http://www.opengis.net/def/crs/EPSG/0/28992');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('f', 'json');
  const json = await haalJson(url, timeoutMs);
  return Array.isArray(json && json.features) ? json.features : [];
}

/**
 * Het verblijfsobject (de woning) en het pand waarin het zit.
 * @param {object} adres uit services/pdok.js
 */
async function haalWoning(adres, opties = {}) {
  if (!Number.isFinite(adres.rdX) || !Number.isFinite(adres.rdY)) {
    throw new Error('Geen RD-coördinaten bij dit adres; kan de BAG niet bevragen.');
  }

  const sleutel = `woning:${adres.rdX.toFixed(1)}:${adres.rdY.toFixed(1)}:${adres.verblijfsobjectId || ''}`;
  return cache.wrap(sleutel, async () => {
    const [vboFeatures, pandFeatures] = await Promise.all([
      features('verblijfsobject', { rdX: adres.rdX, rdY: adres.rdY, straal: 12, limit: 25, timeoutMs: opties.timeoutMs })
        .catch((f) => { throw new Error(`verblijfsobject: ${f.message}`); }),
      features('pand', { rdX: adres.rdX, rdY: adres.rdY, straal: 12, limit: 10, timeoutMs: opties.timeoutMs })
        .catch((f) => { throw new Error(`pand: ${f.message}`); }),
    ]);

    // Het juiste verblijfsobject kiezen: op identificatie als we die hebben,
    // anders het object dat het dichtst bij het adrespunt ligt.
    const idKort = String(adres.verblijfsobjectId || '').replace(/\D/g, '');
    let vbo = null;
    if (idKort) {
      vbo = vboFeatures.find((f) => {
        const eigen = JSON.stringify(f.properties || {}).replace(/\D/g, '');
        return eigen.includes(idKort);
      }) || null;
    }
    if (!vbo) vbo = dichtstbij(vboFeatures, adres.rdX, adres.rdY);
    const pand = dichtstbij(pandFeatures, adres.rdX, adres.rdY);

    const vboProps = (vbo && vbo.properties) || {};
    const pandProps = (pand && pand.properties) || {};
    const contour = pand && pand.geometry && pand.geometry.type === 'Polygon'
      ? pand.geometry.coordinates
      : pand && pand.geometry && pand.geometry.type === 'MultiPolygon'
        ? pand.geometry.coordinates[0]
        : null;

    return {
      woonoppervlak: pakGetal(vboProps, ['oppervlakte', 'oppervlakte_min', 'gebruiksoppervlakte']),
      gebruiksdoel: pakTekst(vboProps, ['gebruiksdoel', 'gebruiksdoelen', 'gebruiksdoel_verblijfsobject']),
      statusWoning: pakTekst(vboProps, ['status', 'status_verblijfsobject']),
      bouwjaar: pakGetal(pandProps, ['bouwjaar', 'oorspronkelijkbouwjaar', 'oorspronkelijk_bouwjaar']),
      statusPand: pakTekst(pandProps, ['status', 'status_pand']),
      pandId: pakTekst(pandProps, ['identificatie', 'pandidentificatie', 'pand_id']),
      grondoppervlak: vlakOppervlakte(contour),
      afmetingen: afmetingenVanContour(contour),
      contour,
      // Ruwe eigenschappen meesturen voor de diagnose; niet voor de pagina.
      _ruw: { verblijfsobject: vboProps, pand: pandProps },
    };
  });
}

function dichtstbij(lijst, x, y) {
  let beste = null;
  let bestAfstand = Infinity;
  for (const f of lijst) {
    const punt = zwaartepunt(f && f.geometry);
    if (!punt) continue;
    const d = (punt[0] - x) ** 2 + (punt[1] - y) ** 2;
    if (d < bestAfstand) {
      bestAfstand = d;
      beste = f;
    }
  }
  return beste;
}

function zwaartepunt(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  const ring =
    geometry.type === 'Polygon' ? geometry.coordinates[0]
      : geometry.type === 'MultiPolygon' ? geometry.coordinates[0][0]
        : null;
  if (!ring || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const p of ring) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / ring.length, sy / ring.length];
}

module.exports = { haalWoning, features, BASIS, _intern: { vlakOppervlakte, afmetingenVanContour, pakGetal, dichtstbij } };
