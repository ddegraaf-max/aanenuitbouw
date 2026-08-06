'use strict';

/**
 * Conversie tussen Rijksdriehoekscoordinaten (EPSG:28992) en WGS84.
 *
 * Benaderingsformules van F.H. Schreutelkamp en G.L. Strang van Hees.
 * Nauwkeurigheid binnen Nederland: circa 0,25 m. Ruim voldoende voor het
 * bepalen van afstanden tot sondeerlocaties (die we in meters afronden).
 */

const X0 = 155000;
const Y0 = 463000;
const PHI0 = 52.15517440;
const LAM0 = 5.38720621;

/** RD -> WGS84 (lat/lon in graden) */
function rdToWgs84(x, y) {
  const dX = (x - X0) * 1e-5;
  const dY = (y - Y0) * 1e-5;

  const sumN =
    3235.65389 * dY +
    -32.58297 * dX ** 2 +
    -0.24750 * dY ** 2 +
    -0.84978 * dX ** 2 * dY +
    -0.06550 * dY ** 3 +
    -0.01709 * dX ** 2 * dY ** 2 +
    -0.00738 * dX +
    0.00530 * dX ** 4 +
    -0.00039 * dX ** 2 * dY ** 3 +
    0.00033 * dX ** 4 * dY +
    -0.00012 * dX * dY;

  const sumE =
    5260.52916 * dX +
    105.94684 * dX * dY +
    2.45656 * dX * dY ** 2 +
    -0.81885 * dX ** 3 +
    0.05594 * dX * dY ** 3 +
    -0.05607 * dX ** 3 * dY +
    0.01199 * dY +
    -0.00256 * dX ** 3 * dY ** 2 +
    0.00128 * dX * dY ** 4 +
    0.00022 * dY ** 2 +
    -0.00022 * dX ** 2 +
    0.00026 * dX ** 5;

  return {
    lat: PHI0 + sumN / 3600,
    lon: LAM0 + sumE / 3600,
  };
}

/** WGS84 -> RD */
function wgs84ToRd(lat, lon) {
  const dPhi = 0.36 * (lat - PHI0);
  const dLam = 0.36 * (lon - LAM0);

  const sumX =
    190094.945 * dLam +
    -11832.228 * dPhi * dLam +
    -114.221 * dPhi ** 2 * dLam +
    -32.391 * dLam ** 3 +
    -0.705 * dPhi +
    -2.34 * dPhi ** 3 * dLam +
    -0.608 * dPhi * dLam ** 3 +
    -0.008 * dLam ** 2 +
    0.148 * dPhi ** 2 * dLam ** 3;

  const sumY =
    309056.544 * dPhi +
    3638.893 * dLam ** 2 +
    73.077 * dPhi ** 2 +
    -157.984 * dPhi * dLam ** 2 +
    59.788 * dPhi ** 3 +
    0.433 * dLam +
    -6.439 * dPhi ** 2 * dLam ** 2 +
    -0.032 * dPhi * dLam +
    0.092 * dLam ** 4 +
    -0.054 * dPhi * dLam ** 4;

  return { x: X0 + sumX, y: Y0 + sumY };
}

/** Hemelsbrede afstand in meters tussen twee WGS84-punten (haversine). */
function afstandMeter(lat1, lon1, lat2, lon2) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Peiling in graden (0 = noord, 90 = oost) van punt 1 naar punt 2. */
function richting(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const WINDSTREKEN = ['N', 'NNO', 'NO', 'ONO', 'O', 'OZO', 'ZO', 'ZZO', 'Z', 'ZZW', 'ZW', 'WZW', 'W', 'WNW', 'NW', 'NNW'];

function windstreek(graden) {
  return WINDSTREKEN[Math.round(graden / 22.5) % 16];
}

module.exports = { rdToWgs84, wgs84ToRd, afstandMeter, richting, windstreek };
