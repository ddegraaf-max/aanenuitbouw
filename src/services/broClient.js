'use strict';

const { parseCptXml } = require('./cptParser');
const { Cache } = require('../utils/cache');
const { afstandMeter, richting, windstreek } = require('./rd');
const mock = require('./mockBro');

/**
 * Client voor de publieke BRO-uitgifteservice voor geotechnisch
 * sondeeronderzoek (CPT).
 *
 *   basis: https://publiek.broservices.nl/sr/cpt/v1
 *   auth:  geen
 *   kosten: geen
 *
 * Twee calls die we gebruiken:
 *   POST /characteristics/searches  -> JSON, kengegevens binnen een gebied
 *   GET  /objects/{broId}           -> IMBRO-XML, de volledige meetreeks
 *
 * BELANGRIJK over robuustheid: de exacte veldnamen in het JSON-antwoord van
 * /characteristics/searches zijn in het verleden tussen BRO-releases gewijzigd
 * (en de service kan het antwoord in verschillende wrappers verpakken).
 * In plaats van hardcoded paden loopt `haalKengegevensUit()` daarom de hele
 * boom door en pikt elk object op met een broId dat op CPT lijkt. Dat blijft
 * werken als de BRO velden herbenoemt of een extra laag toevoegt.
 */

const BASIS = (process.env.BRO_CPT_BASE || 'https://publiek.broservices.nl/sr/cpt/v1').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.BRO_TIMEOUT_MS || 20000);
const REG_BEGIN = process.env.BRO_REGISTRATIE_VANAF || '2017-01-01';
const MOCK = process.env.BRO_MOCK === '1';

const cacheZoek = new Cache({ ttlMs: 1000 * 60 * 60 * 12, max: 500 });
const cacheObject = new Cache({ ttlMs: 1000 * 60 * 60 * 24 * 30, max: 200 });

async function fetchMetTimeout(url, opties = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opties, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function vandaag() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Loopt recursief door een JSON-structuur en verzamelt alles wat een
 * sondering lijkt te zijn.
 */
function haalKengegevensUit(node, uit = []) {
  if (!node || typeof node !== 'object') return uit;

  if (Array.isArray(node)) {
    for (const item of node) haalKengegevensUit(item, uit);
    return uit;
  }

  const broId = node.broId || node.broID || node.id;
  if (typeof broId === 'string' && /^CPT/i.test(broId)) {
    uit.push(normaliseerKengegeven(node, broId));
    return uit; // niet verder afdalen: de rest hoort bij dit object
  }

  for (const waarde of Object.values(node)) haalKengegevensUit(waarde, uit);
  return uit;
}

/** Zoekt ergens in een (sub)object naar een lat/lon-paar. */
function zoekCoordinaten(node, diepte = 0) {
  if (!node || typeof node !== 'object' || diepte > 6) return null;

  // Vorm A: expliciete velden
  const lat = node.lat ?? node.latitude ?? node.y;
  const lon = node.lon ?? node.lng ?? node.longitude ?? node.x;
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { lat: Number(lat), lon: Number(lon) };
  }

  // Vorm B: array [lat, lon] of "52.1 5.1"
  const kandidaat = node.coordinates ?? node.pos ?? node.position;
  if (typeof kandidaat === 'string') {
    const d = kandidaat.trim().split(/[\s,]+/).map(Number);
    if (d.length >= 2 && Math.abs(d[0]) <= 90) return { lat: d[0], lon: d[1] };
  }
  if (Array.isArray(kandidaat) && kandidaat.length >= 2) {
    const [a, b] = kandidaat.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return Math.abs(a) <= 90 ? { lat: a, lon: b } : { lat: b, lon: a };
    }
  }

  for (const waarde of Object.values(node)) {
    const gevonden = zoekCoordinaten(waarde, diepte + 1);
    if (gevonden) return gevonden;
  }
  return null;
}

/** Zoekt ergens in een (sub)object naar een datum (jjjj-mm-dd). */
function zoekDatum(node, diepte = 0) {
  if (!node || diepte > 5) return null;
  if (typeof node === 'string') {
    const m = node.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
  }
  if (typeof node !== 'object') return null;
  const voorkeur = ['researchReportDate', 'reportDate', 'objectRegistrationTime', 'latestAdditionTime'];
  for (const sleutel of voorkeur) {
    if (node[sleutel]) {
      const d = zoekDatum(node[sleutel], diepte + 1);
      if (d) return d;
    }
  }
  for (const waarde of Object.values(node)) {
    const d = zoekDatum(waarde, diepte + 1);
    if (d) return d;
  }
  return null;
}

function zoekGetal(node, sleutels, diepte = 0) {
  if (!node || typeof node !== 'object' || diepte > 5) return null;
  for (const sleutel of sleutels) {
    const w = node[sleutel];
    if (Number.isFinite(w)) return Number(w);
    if (w && typeof w === 'object') {
      const genest = w.value ?? w.waarde;
      if (Number.isFinite(genest)) return Number(genest);
    }
    if (typeof w === 'string' && Number.isFinite(Number.parseFloat(w))) return Number.parseFloat(w);
  }
  for (const waarde of Object.values(node)) {
    const g = zoekGetal(waarde, sleutels, diepte + 1);
    if (g !== null) return g;
  }
  return null;
}

function normaliseerKengegeven(node, broId) {
  return {
    broId,
    coordinaten: zoekCoordinaten(node),
    datum: zoekDatum(node),
    einddiepte: zoekGetal(node, ['finalDepth', 'einddiepte', 'predrilledDepth']),
    kwaliteitsregime: node.qualityRegime || node.kwaliteitsregime || null,
    norm: node.cptStandard || null,
    doel: node.surveyPurpose || null,
  };
}

/**
 * Zoekt sonderingen binnen een straal rond een punt.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusKm  straal in kilometers (BRO verwacht km)
 */
async function zoekSonderingen(lat, lon, radiusKm = 1) {
  if (MOCK) return mock.zoekSonderingen(lat, lon, radiusKm);

  const sleutel = `${lat.toFixed(5)}|${lon.toFixed(5)}|${radiusKm}`;
  return cacheZoek.wrap(sleutel, async () => {
    const body = {
      registrationPeriod: { beginDate: REG_BEGIN, endDate: vandaag() },
      area: {
        enclosingCircle: {
          center: { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) },
          radius: Number(radiusKm),
        },
      },
    };

    const res = await fetchMetTimeout(`${BASIS}/characteristics/searches?requestReference=aanenuitbouw-sondeertool`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    const tekst = await res.text();
    if (!res.ok) {
      throw new Error(`BRO zoekopdracht mislukt (HTTP ${res.status}): ${tekst.slice(0, 400)}`);
    }

    let json;
    try {
      json = JSON.parse(tekst);
    } catch {
      throw new Error(`BRO gaf geen JSON terug: ${tekst.slice(0, 200)}`);
    }

    const gevonden = haalKengegevensUit(json)
      .filter((s) => s.coordinaten)
      .map((s) => {
        const { lat: sLat, lon: sLon } = s.coordinaten;
        const graden = richting(lat, lon, sLat, sLon);
        return {
          ...s,
          afstandM: afstandMeter(lat, lon, sLat, sLon),
          richtingGraden: Math.round(graden),
          windstreek: windstreek(graden),
        };
      })
      .sort((a, b) => a.afstandM - b.afstandM);

    return gevonden;
  });
}

/** Haalt een volledige sondering op en parseert die. */
async function haalSondering(broId) {
  if (!/^CPT[0-9A-Z_]{4,}$/i.test(broId)) {
    throw new Error(`Ongeldig BRO-ID: ${broId}`);
  }
  if (MOCK) return mock.haalSondering(broId);

  return cacheObject.wrap(broId, async () => {
    const res = await fetchMetTimeout(
      `${BASIS}/objects/${encodeURIComponent(broId)}?requestReference=aanenuitbouw-sondeertool`,
      { headers: { Accept: 'application/xml' } },
    );
    const xml = await res.text();
    if (!res.ok) {
      throw new Error(`Sondering ${broId} ophalen mislukt (HTTP ${res.status}): ${xml.slice(0, 300)}`);
    }
    return parseCptXml(xml);
  });
}

module.exports = { zoekSonderingen, haalSondering, BASIS, MOCK, _intern: { haalKengegevensUit, zoekCoordinaten } };
