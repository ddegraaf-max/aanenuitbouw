'use strict';

/**
 * Mock van alle bronnen, aan te zetten met WONINGCHECK_MOCK=1.
 *
 * Nodig om de pagina, de afgeleide conclusies en de foutpaden te kunnen testen
 * zonder van vijf externe diensten af te hangen. FICTIEVE DATA — nooit in
 * productie aanzetten.
 */

function pseudo(seed) {
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function adres(vraag) {
  const rnd = pseudo(String(vraag).length * 7919);
  return {
    id: 'adr-mock-1',
    omschrijving: 'Poststraat 5, 1401EX Bussum',
    soort: 'adres',
    postcode: '1401EX',
    straat: 'Poststraat',
    huisnummer: '5',
    plaats: 'Bussum',
    gemeente: 'Gooise Meren',
    lat: 52.27415602,
    lon: 5.16740968,
    rdX: 139210 + Math.round(rnd() * 40),
    rdY: 476012 + Math.round(rnd() * 40),
    verblijfsobjectId: '0457010000123456',
    nummeraanduidingId: '0457200000123456',
    pandIds: ['0457100000098765'],
    _mock: true,
  };
}

function woning(a) {
  const rnd = pseudo(a.rdX | 0);
  const bouwjaar = 1928 + Math.floor(rnd() * 8);
  const breedte = 5.4 + rnd() * 1.6;
  const diepte = 8.2 + rnd() * 2.4;
  // contour in RD, rechthoekig, met de achtergevel aan de noordzijde
  const x = a.rdX - breedte / 2;
  const y = a.rdY - diepte / 2;
  const contour = [[
    [x, y], [x + breedte, y], [x + breedte, y + diepte], [x, y + diepte], [x, y],
  ]];
  return {
    woonoppervlak: Math.round(breedte * diepte * 1.75),
    gebruiksdoel: 'woonfunctie',
    statusWoning: 'Verblijfsobject in gebruik',
    bouwjaar,
    statusPand: 'Pand in gebruik',
    pandId: '0457100000098765',
    grondoppervlak: Math.round(breedte * diepte * 10) / 10,
    afmetingen: {
      langsteZijde: Math.round(Math.max(breedte, diepte) * 10) / 10,
      kortsteZijde: Math.round(Math.min(breedte, diepte) * 10) / 10,
    },
    contour,
    _mock: true,
  };
}

function perceel(a) {
  const rnd = pseudo((a.rdY | 0) + 3);
  const opp = 168 + Math.floor(rnd() * 90);
  const b = 6.2 + rnd() * 1.5;
  const d = opp / b;
  const x = a.rdX - b / 2;
  const y = a.rdY - d / 2;
  return {
    oppervlakte: opp,
    perceelnummer: String(4800 + Math.floor(rnd() * 200)),
    sectie: 'C',
    gemeenteCode: 'BSM00',
    geometrie: { type: 'Polygon', coordinates: [[[x, y], [x + b, y], [x + b, y + d], [x, y + d], [x, y]]] },
    bron: 'Kadastrale kaart (BRK), CC-BY Kadaster NL — FICTIEF',
    _mock: true,
  };
}

function hoogtes(pandId) {
  const rnd = pseudo(String(pandId).length * 31);
  const goot = 5.6 + rnd() * 0.9;
  return {
    maaiveldNap: 0.7,
    nokhoogte: Math.round((goot + 3.4) * 100) / 100,
    goothoogte: Math.round(goot * 100) / 100,
    dakhoogte70: Math.round((goot + 2.1) * 100) / 100,
    daktype: 'slanted',
    bouwlagen: 2,
    _mock: true,
  };
}

module.exports = { adres, woning, perceel, hoogtes };
