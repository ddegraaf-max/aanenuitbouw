'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseCptXml } = require('../services/cptParser');
const { rdToWgs84, wgs84ToRd, afstandMeter } = require('../services/rd');
const { interpreteerSondering, classificeer, _intern } = require('../services/interpret');
const { _intern: broIntern } = require('../services/broClient');
const mock = require('../services/mockBro');

const xml = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpt-voorbeeld.xml'), 'utf8');

// ---------------------------------------------------------------------------
test('CPT-XML: kerngegevens worden gelezen', () => {
  const s = parseCptXml(xml);
  assert.equal(s.broId, 'CPT000000099999');
  assert.equal(s.kwaliteitsregime, 'IMBRO');
  assert.equal(s.datum, '2021-06-15');
  assert.equal(s.maaiveldNap, 1.42);
  assert.equal(s.verticaalDatum, 'NAP');
  assert.equal(s.einddiepte, 20);
  assert.equal(s.aantalPunten, 1000);
  assert.equal(s.punten[0].d, 0.02);
  assert.equal(s.punten[999].d, 20);
});

test('CPT-XML: RD-locatie wordt omgerekend naar WGS84 en klopt met de standardizedLocation', () => {
  const s = parseCptXml(xml);
  // De fixture bevat dezelfde locatie in RD en in ETRS89; die moeten binnen
  // een paar meter samenvallen, anders is de conversie fout.
  const afwijking = afstandMeter(s.locatie.lat, s.locatie.lon, 52.28782, 5.09041);
  assert.ok(afwijking < 25, `afwijking te groot: ${afwijking} m`);
});

test('CPT-XML: -999999 wordt null, correctedConeResistance krijgt voorrang', () => {
  // Kleine eigen fixture met bewust ontbrekende waarden: rij 1 heeft geen
  // gecorrigeerde conusweerstand, rij 2 wel, rij 3 heeft geen wrijving.
  const mini = `<dispatchDataResponse xmlns:swe="http://www.opengis.net/swe/2.0">
    <ns9:CPT_O xmlns:ns9="x"><brocom:broId xmlns:brocom="y">CPT000000000042</brocom:broId>
    <swe:DataArray>
      <swe:elementType name="values"><swe:DataRecord>
        <swe:field name="penetrationLength"/><swe:field name="depth"/>
        <swe:field name="coneResistance"/><swe:field name="correctedConeResistance"/>
        <swe:field name="localFriction"/><swe:field name="porePressureU2"/>
      </swe:DataRecord></swe:elementType>
      <swe:encoding><swe:TextEncoding decimalSeparator="." tokenSeparator="," blockSeparator=";"/></swe:encoding>
      <swe:values>0.020,0.020,1.100,-999999,0.0150,-999999;0.040,0.040,14.200,14.350,0.1100,-999999;0.060,0.060,9.000,-999999,-999999,0.0120;</swe:values>
    </swe:DataArray></ns9:CPT_O></dispatchDataResponse>`;

  const s = parseCptXml(mini);
  assert.equal(s.broId, 'CPT000000000042');
  assert.equal(s.punten[0].qc, 1.1, 'zonder correctie de gewone qc');
  assert.equal(s.punten[0].u2, null, 'ontbrekende waterspanning moet null zijn');
  assert.equal(s.punten[1].qc, 14.35, 'met correctie de gecorrigeerde qc');
  assert.equal(s.punten[2].fs, null, 'ontbrekende wrijving moet null zijn');
  assert.equal(s.punten[2].rf, null, 'zonder wrijving geen wrijvingsgetal');
  assert.equal(s.punten[0].rf, 1.36, 'wrijvingsgetal wordt zelf berekend als het ontbreekt');
});

test('CPT-XML: onbruikbare invoer geeft een duidelijke fout', () => {
  assert.throws(() => parseCptXml(''), /ongeldig/i);
  assert.throws(() => parseCptXml('<a>' + 'x'.repeat(200) + '</a>'), /meetwaarden/i);
});

// ---------------------------------------------------------------------------
test('RD-conversie is omkeerbaar', () => {
  const { lat, lon } = rdToWgs84(155000, 463000);
  assert.ok(Math.abs(lat - 52.15517) < 0.001);
  assert.ok(Math.abs(lon - 5.38721) < 0.001);

  const heen = wgs84ToRd(52.28782, 5.09041);
  const terug = rdToWgs84(heen.x, heen.y);
  assert.ok(afstandMeter(52.28782, 5.09041, terug.lat, terug.lon) < 2);
});

test('afstandMeter geeft plausibele afstanden', () => {
  // Amsterdam CS -> Utrecht CS is circa 35 km
  const d = afstandMeter(52.3791, 4.9003, 52.0894, 5.1101);
  assert.ok(d > 33000 && d < 37000, `onverwacht: ${d} m`);
});

// ---------------------------------------------------------------------------
test('classificatie: veen, klei en zand worden onderscheiden', () => {
  assert.equal(classificeer(0.4, 6), 'veen');
  assert.equal(classificeer(0.4, 1), 'slappeKlei');
  assert.equal(classificeer(1.2, 3), 'klei');
  assert.equal(classificeer(8, 1), 'matigZand');
  assert.equal(classificeer(16, 0.8), 'vastZand');
  assert.equal(classificeer(25, 0.6), 'zeerVastZand');
  assert.equal(classificeer(null, null), 'onbekend');
});

test('mediaanfilter haalt een enkele piek eruit', () => {
  const reeks = [5, 5, 5, 40, 5, 5, 5];
  const uit = _intern.mediaanFilter(reeks, 5);
  assert.equal(uit[3], 5, 'de piek van 40 mag de mediaan niet bepalen');
});

test('draagkrachtige laag wordt pas erkend bij voldoende dikte', () => {
  const punten = Array.from({ length: 100 }, (_, i) => ({ d: (i + 1) * 0.05 }));
  // qc springt kort omhoog (0,15 m) en daarna blijvend vanaf 2,0 m
  const qc = punten.map((p) => (p.d > 1.0 && p.d < 1.15 ? 20 : p.d >= 2.0 ? 18 : 1));

  const kort = _intern.eersteDraagkrachtigeLaag(punten, qc, 12, 0.5);
  assert.ok(kort.bovenkant >= 1.95, `de korte piek mag niet meetellen, kreeg ${kort.bovenkant}`);

  const geen = _intern.eersteDraagkrachtigeLaag(punten, qc, 40, 0.5);
  assert.equal(geen, null);
});

// ---------------------------------------------------------------------------
test('interpretatie van de fixture: slap bovenin, vast zand onder', () => {
  const s = interpreteerSondering(parseCptXml(xml), { minLaagdikte: 0.02 });
  assert.ok(s.lagen.length >= 2, 'er moeten meerdere lagen uitkomen');
  const laatste = s.lagen[s.lagen.length - 1];
  assert.ok(['vastZand', 'zeerVastZand', 'matigZand'].includes(laatste.soort));
  assert.ok(s.opStaal, 'er is een draagkrachtig niveau te vinden');
  assert.equal(s.maaiveldNap, 1.42);
  assert.equal(s.opStaal.diepteNap, Math.round((1.42 - s.opStaal.diepteMv) * 100) / 100);
});

test('interpretatie van een west-Nederlands mockprofiel: paalfundering verwacht', () => {
  mock.zoekSonderingen(52.37, 4.89, 1); // vult het mockregister
  const lijst = mock.zoekSonderingen(52.37, 4.89, 1);
  const ruw = mock.haalSondering(lijst[0].broId);
  const s = interpreteerSondering(ruw);

  assert.ok(s.paalpunt, 'in west-Nederland moet een vaste zandlaag gevonden worden');
  assert.ok(s.paalpunt.diepteMv > 8, `verwacht diep zand, kreeg ${s.paalpunt.diepteMv} m`);
  assert.ok(s.slappeToplaagDikte > 1.5, 'er hoort een slap pakket bovenin te zitten');
  assert.ok(s.reeks.punten.length <= 900, 'reeks moet verdund zijn voor de browser');
});

test('verdunnen behoudt de piekwaarde', () => {
  const punten = Array.from({ length: 3000 }, (_, i) => ({ d: i * 0.02, qc: i === 1500 ? 99 : 5 }));
  const uit = _intern.verdun(punten, 500);
  assert.ok(uit.length <= 500);
  assert.ok(uit.some((p) => p.qc === 99), 'de piek van 99 MPa mag niet wegvallen');
});

// ---------------------------------------------------------------------------
test('kengegevens worden uit willekeurige JSON-vormen gevist', () => {
  const vormA = { cptCharacteristics: [{ broId: 'CPT000000000001', standardizedLocation: { coordinates: [52.1, 5.1] } }] };
  const vormB = { data: { objecten: { lijst: [{ broID: 'CPT000000000002', location: { lat: 52.2, lon: 5.2 } }] } } };

  assert.equal(broIntern.haalKengegevensUit(vormA).length, 1);
  assert.equal(broIntern.haalKengegevensUit(vormA)[0].coordinaten.lat, 52.1);
  assert.equal(broIntern.haalKengegevensUit(vormB)[0].broId, 'CPT000000000002');
  assert.equal(broIntern.haalKengegevensUit({ broId: 'BHR000000000003' }).length, 0, 'boringen zijn geen sonderingen');
});
