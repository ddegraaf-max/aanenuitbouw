'use strict';

/**
 * Genereert test/fixtures/cpt-echt-formaat.xml: een CPT-XML zoals de BRO die
 * werkelijk uitlevert.
 *
 * Verschil met cpt-voorbeeld.xml (dat het formaat uit de specificatie volgt):
 *   - GEEN swe:DataRecord met <swe:field name="...">
 *   - WEL een <cptcommon:parameters>-blok met ja/nee per parameter
 *   - 25 vaste kolommen per rij, niet-gemeten parameters op -999999
 *   - 1 cm meetinterval
 *
 * Vastgesteld op CPT000000256805 (Bussum, 414 kB, 2255 rijen van 25 kolommen)
 * via /bodemcheck/api/diagnose-sondering. Zonder deze fixture zou de parser
 * opnieuw stilletjes op nul meetpunten uitkomen.
 *
 *   node test/fixtures/maak-echt-formaat.js
 */

const fs = require('node:fs');
const path = require('node:path');

// Dezelfde 25 parameters, in de volgorde waarin ze in de waardenreeks staan.
// De tweede waarde zegt of hij in dit bestand gemeten is.
const PARAMETERS = [
  ['penetrationLength', true],
  ['depth', true],
  ['elapsedTime', true],
  ['coneResistance', true],
  ['correctedConeResistance', false],
  ['netConeResistance', false],
  ['magneticFieldStrengthX', false],
  ['magneticFieldStrengthY', false],
  ['magneticFieldStrengthZ', false],
  ['magneticFieldStrengthTotal', false],
  ['electricalConductivity', false],
  ['inclinationEW', false],
  ['inclinationNS', false],
  ['inclinationX', false],
  ['inclinationY', false],
  ['inclinationResultant', true],
  ['magneticInclination', false],
  ['magneticDeclination', false],
  ['localFriction', true],
  ['poreRatio', false],
  ['temperature', false],
  ['porePressureU1', false],
  ['porePressureU2', true],
  ['porePressureU3', false],
  ['frictionRatio', true],
];

// West-Nederlands profiel, zelfde opzet als de andere fixture.
const LAGEN = [
  { tot: 1.2, qc: 2.4, rf: 1.6 },
  { tot: 3.0, qc: 0.9, rf: 4.4 },
  { tot: 6.4, qc: 0.4, rf: 6.8 },
  { tot: 10.2, qc: 1.1, rf: 4.1 },
  { tot: 12.8, qc: 2.7, rf: 3.1 },
  { tot: 15.5, qc: 15.0, rf: 0.8 },
  { tot: 22.56, qc: 24.0, rf: 0.7 },
];

const STAP = 0.01;
const EIND = 22.559;
const MAAIVELD_NAP = 0.68;
const ONTBREEKT = '-999999';

let zaad = 24680135;
function rnd() {
  zaad = (zaad * 1103515245 + 12345) & 0x7fffffff;
  return zaad / 0x7fffffff;
}

const rijen = [];
for (let i = 0; i * STAP <= EIND + 1e-9; i++) {
  const lengte = Math.round(i * STAP * 1000) / 1000;
  // depth is de voor helling gecorrigeerde diepte: iets kleiner dan de lengte
  const diepte = Math.round(lengte * 0.9994 * 1000) / 1000;
  const laag = LAGEN.find((l) => lengte <= l.tot) || LAGEN[LAGEN.length - 1];

  const qc = i === 0 ? 0 : Math.max(0.02, laag.qc * (1 + (rnd() - 0.5) * 0.16));
  const rf = i === 0 ? 0 : Math.max(0.1, laag.rf * (1 + (rnd() - 0.5) * 0.18));
  const fs_ = (qc * rf) / 100;

  const waarden = new Array(PARAMETERS.length).fill(ONTBREEKT);
  waarden[0] = lengte.toFixed(3);
  waarden[1] = diepte.toFixed(3);
  waarden[2] = (i * 0.492).toFixed(1);
  waarden[3] = qc.toFixed(3);
  waarden[15] = '0';
  waarden[18] = fs_.toFixed(4);
  waarden[22] = '0.000';
  waarden[24] = rf.toFixed(1);

  rijen.push(waarden.join(','));
}

const parameterXml = PARAMETERS.map(
  ([naam, gemeten]) => `          <cptcommon:${naam}>${gemeten ? 'ja' : 'nee'}</cptcommon:${naam}>`,
).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dispatchDataResponse xmlns="http://www.broservices.nl/xsd/dscpt/1.1"
                      xmlns:brocom="http://www.broservices.nl/xsd/brocommon/3.0"
                      xmlns:cptcommon="http://www.broservices.nl/xsd/cptcommon/1.1"
                      xmlns:gml="http://www.opengis.net/gml/3.2"
                      xmlns:swe="http://www.opengis.net/swe/2.0">
  <brocom:responseType>dispatch</brocom:responseType>
  <dispatchDocument>
    <CPT_O gml:id="id_1">
      <brocom:broId>CPT000000256805</brocom:broId>
      <brocom:deliveryAccountableParty>27378529</brocom:deliveryAccountableParty>
      <brocom:qualityRegime>IMBRO</brocom:qualityRegime>
      <researchReportDate>
        <brocom:date>2017-03-16</brocom:date>
      </researchReportDate>
      <cptStandard>NEN-EN-ISO22476D1</cptStandard>
      <deliveredLocation>
        <cptcommon:location gml:id="loc_1" srsName="urn:ogc:def:crs:EPSG::28992">
          <gml:pos>139210.000 476012.000</gml:pos>
        </cptcommon:location>
      </deliveredLocation>
      <standardizedLocation>
        <brocom:location gml:id="sloc_1" srsName="urn:ogc:def:crs:EPSG::4258">
          <gml:pos>52.2762899154446 5.15889327297281</gml:pos>
        </brocom:location>
      </standardizedLocation>
      <deliveredVerticalPosition>
        <cptcommon:localVerticalReferencePoint>maaiveld</cptcommon:localVerticalReferencePoint>
        <cptcommon:verticalDatum>NAP</cptcommon:verticalDatum>
        <cptcommon:offset uom="m">${MAAIVELD_NAP}</cptcommon:offset>
      </deliveredVerticalPosition>
      <conePenetrometerSurvey gml:id="cps_1">
        <cptcommon:finalDepth uom="m">${EIND.toFixed(3)}</cptcommon:finalDepth>
        <cptcommon:conePenetrometer gml:id="cp_1">
          <cptcommon:coneSurfaceArea uom="mm2">1500</cptcommon:coneSurfaceArea>
        </cptcommon:conePenetrometer>
        <cptcommon:parameters>
${parameterXml}
        </cptcommon:parameters>
        <cptcommon:conePenetrationTest>
          <swe:DataArray>
            <swe:encoding>
              <swe:TextEncoding decimalSeparator="." tokenSeparator="," blockSeparator=";"/>
            </swe:encoding>
            <swe:values>${rijen.join(';')};</swe:values>
          </swe:DataArray>
        </cptcommon:conePenetrationTest>
      </conePenetrometerSurvey>
    </CPT_O>
  </dispatchDocument>
</dispatchDataResponse>
`;

fs.writeFileSync(path.join(__dirname, 'cpt-echt-formaat.xml'), xml, 'utf8');
console.log(
  `cpt-echt-formaat.xml: ${rijen.length} rijen van ${PARAMETERS.length} kolommen, ${(xml.length / 1024).toFixed(0)} kB`,
);
