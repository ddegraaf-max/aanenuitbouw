'use strict';

/**
 * Luchtfoto van PDOK. Bouwt alleen URL's; de browser haalt de beelden zelf op.
 * Zo gaat er geen megabyte aan beeldmateriaal door je eigen server heen.
 *
 * Waarom dit het nuttigste beeld is dat je zonder klantactie kunt krijgen: de
 * achterzijde van een woning is vanaf de straat niet te zien, maar van bovenaf
 * wél. Op 8 cm per pixel zijn de bestaande aanbouw, de dakvorm, de tuindiepte
 * en zelfs de bestaande pui te onderscheiden.
 *
 * Open data van PDOK; bronvermelding staat op de pagina.
 */

const WMS = process.env.LUCHTFOTO_WMS || 'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';
const LAAG = process.env.LUCHTFOTO_LAAG || 'Actueel_orthoHR';

/**
 * @param {number} rdX
 * @param {number} rdY
 * @param {object} opties
 * @param {number} [opties.meter=60]  breedte van het beeld in meters
 * @param {number} [opties.pixels=760]
 */
function beeldUrl(rdX, rdY, { meter = 60, pixels = 760 } = {}) {
  if (!Number.isFinite(rdX) || !Number.isFinite(rdY)) return null;
  const half = meter / 2;
  const url = new URL(WMS);
  url.searchParams.set('service', 'WMS');
  url.searchParams.set('version', '1.3.0');
  url.searchParams.set('request', 'GetMap');
  url.searchParams.set('layers', LAAG);
  url.searchParams.set('styles', '');
  url.searchParams.set('crs', 'EPSG:28992');
  url.searchParams.set('bbox', [rdX - half, rdY - half, rdX + half, rdY + half].join(','));
  url.searchParams.set('width', String(pixels));
  url.searchParams.set('height', String(pixels));
  url.searchParams.set('format', 'image/jpeg');
  return url.toString();
}

/**
 * Drie uitsneden: overzicht van het perceel, de woning zelf, en dicht op de
 * achterzijde. Meters per pixel staat erbij zodat je op het beeld kunt meten.
 */
function uitsnedes(rdX, rdY) {
  const maten = [
    { naam: 'Perceel en omgeving', meter: 90 },
    { naam: 'De woning', meter: 45 },
    { naam: 'Achterzijde in detail', meter: 24 },
  ];
  return maten
    .map((m) => {
      const url = beeldUrl(rdX, rdY, { meter: m.meter, pixels: 760 });
      return url && { ...m, url, cmPerPixel: Math.round((m.meter / 760) * 1000) / 10 };
    })
    .filter(Boolean);
}

module.exports = { beeldUrl, uitsnedes, WMS, LAAG };
