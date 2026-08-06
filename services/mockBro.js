'use strict';

const { afstandMeter, richting, windstreek } = require('./rd');

/**
 * Mock van de BRO-service, aan te zetten met BRO_MOCK=1.
 *
 * Waarom: de publieke BRO-service is niet altijd bereikbaar vanaf een
 * ontwikkelmachine of CI, en je wil de UI, de laagclassificatie en de
 * funderingslogica kunnen testen zonder van een externe dienst af te hangen.
 * De profielen hieronder zijn plausibel voor Nederland (west = dik slap
 * pakket op Pleistoceen zand, oost = zand vlak onder maaiveld), maar het is
 * FICTIEVE DATA. Zet BRO_MOCK nooit aan in productie.
 */

function pseudoRandom(seed) {
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function archetype(lat, lon) {
  if (lon < 5.05 && lat > 51.7) return 'west'; // Holland/Utrecht-west
  if (lon > 5.9) return 'oost'; // Achterhoek/Twente/Limburg-oost
  if (lat > 52.9) return 'noord'; // Friesland/Groningen
  return 'midden';
}

const PROFIELEN = {
  west: [
    { tot: 1.0, qc: 1.6, fs: 0.03 }, // zandig aanvulmateriaal
    { tot: 2.4, qc: 0.7, fs: 0.02 }, // klei
    { tot: 5.6, qc: 0.35, fs: 0.02 }, // veen
    { tot: 8.0, qc: 0.9, fs: 0.03 }, // klei
    { tot: 11.2, qc: 2.2, fs: 0.04 }, // zandige klei
    { tot: 14.0, qc: 15.0, fs: 0.11 }, // Pleistoceen zand
    { tot: 25.0, qc: 22.0, fs: 0.16 }, // vast zand
  ],
  midden: [
    { tot: 0.8, qc: 2.4, fs: 0.04 },
    { tot: 2.2, qc: 1.1, fs: 0.03 },
    { tot: 4.0, qc: 4.5, fs: 0.05 },
    { tot: 20.0, qc: 16.0, fs: 0.12 },
  ],
  oost: [
    { tot: 0.6, qc: 4.0, fs: 0.05 },
    { tot: 3.0, qc: 11.0, fs: 0.08 },
    { tot: 18.0, qc: 19.0, fs: 0.13 },
  ],
  noord: [
    { tot: 1.2, qc: 1.3, fs: 0.03 },
    { tot: 3.6, qc: 0.6, fs: 0.02 },
    { tot: 7.4, qc: 1.4, fs: 0.04 },
    { tot: 10.0, qc: 3.0, fs: 0.05 },
    { tot: 22.0, qc: 18.0, fs: 0.14 },
  ],
};

function bouwPunten(lat, lon, seed, einddiepte) {
  const rnd = pseudoRandom(seed);
  const lagen = PROFIELEN[archetype(lat, lon)];
  const verschuiving = (rnd() - 0.5) * 1.2; // laaggrenzen wisselen per locatie
  const punten = [];

  for (let d = 0.02; d <= einddiepte; d += 0.02) {
    const laag = lagen.find((l) => d <= l.tot + verschuiving) || lagen[lagen.length - 1];
    const ruis = 1 + (rnd() - 0.5) * 0.35;
    const qc = Math.max(0.05, laag.qc * ruis);
    const fs = Math.max(0.001, laag.fs * (1 + (rnd() - 0.5) * 0.4));
    punten.push({
      d: Math.round(d * 100) / 100,
      qc: Math.round(qc * 100) / 100,
      fs: Math.round(fs * 10000) / 10000,
      rf: Math.round((fs / qc) * 100 * 100) / 100,
      u2: null,
    });
  }
  return punten;
}

const registerCache = new Map();

function zoekSonderingen(lat, lon, radiusKm = 1) {
  const rnd = pseudoRandom(Math.round(lat * 1e4) ^ Math.round(lon * 1e4));
  const aantal = 3 + Math.floor(rnd() * 4);
  const lijst = [];

  for (let i = 0; i < aantal; i++) {
    const hoek = rnd() * Math.PI * 2;
    const afstand = 40 + rnd() * radiusKm * 900;
    const sLat = lat + (afstand * Math.cos(hoek)) / 111320;
    const sLon = lon + (afstand * Math.sin(hoek)) / (111320 * Math.cos((lat * Math.PI) / 180));
    const broId = `CPT9${String(Math.floor(rnd() * 1e10)).padStart(11, '0')}`;
    const jaar = 2015 + Math.floor(rnd() * 10);
    const diep = archetype(lat, lon) === 'oost' ? 10 + rnd() * 8 : 17 + rnd() * 13;
    const einddiepte = Math.round(diep * 10) / 10;
    const graden = richting(lat, lon, sLat, sLon);

    const record = {
      broId,
      coordinaten: { lat: sLat, lon: sLon },
      datum: `${jaar}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-12`,
      einddiepte,
      kwaliteitsregime: rnd() > 0.4 ? 'IMBRO' : 'IMBRO/A',
      norm: 'NEN-EN-ISO22476D1',
      doel: 'bouwrijp maken',
      afstandM: afstandMeter(lat, lon, sLat, sLon),
      richtingGraden: Math.round(graden),
      windstreek: windstreek(graden),
      _mock: true,
    };
    registerCache.set(broId, { record, lat: sLat, lon: sLon, einddiepte, seed: Math.floor(rnd() * 1e9) });
    lijst.push(record);
  }

  return lijst.sort((a, b) => a.afstandM - b.afstandM);
}

function haalSondering(broId) {
  const bekend = registerCache.get(broId);
  const lat = bekend ? bekend.lat : 52.28;
  const lon = bekend ? bekend.lon : 5.16;
  const einddiepte = bekend ? bekend.einddiepte : 20;
  const seed = bekend ? bekend.seed : 42;
  const punten = bouwPunten(lat, lon, seed, einddiepte);

  return {
    broId,
    kwaliteitsregime: bekend ? bekend.record.kwaliteitsregime : 'IMBRO',
    norm: 'NEN-EN-ISO22476D1',
    datum: bekend ? bekend.record.datum : '2020-01-01',
    locatie: { lat, lon, srs: 'mock' },
    maaiveldNap: Math.round((archetype(lat, lon) === 'west' ? 0.4 : 8.5) * 100) / 100,
    verticaalDatum: 'NAP',
    einddiepte,
    aantalPunten: punten.length,
    kolommen: ['penetrationLength', 'depth', 'coneResistance', 'localFriction', 'frictionRatio'],
    punten,
    qcBeschikbaar: true,
    qcMax: Math.max(...punten.map((p) => p.qc)),
    _mock: true,
  };
}

module.exports = { zoekSonderingen, haalSondering };
