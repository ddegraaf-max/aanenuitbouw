'use strict';

/**
 * Genereert test/fixtures/cpt-voorbeeld.xml: een volledige, realistische
 * IMBRO CPT-XML met een west-Nederlands profiel. Deterministisch, dus
 * opnieuw uitvoeren geeft exact hetzelfde bestand.
 *
 *   node test/fixtures/maak-fixture.js
 */

const fs = require('node:fs');
const path = require('node:path');

const LAGEN = [
  { tot: 1.0, qc: 2.0, rf: 1.5 },   // zandig aanvulmateriaal
  { tot: 2.6, qc: 0.8, rf: 4.5 },   // klei
  { tot: 5.8, qc: 0.35, rf: 6.5 },  // veen
  { tot: 9.0, qc: 1.0, rf: 4.0 },   // klei
  { tot: 11.5, qc: 2.5, rf: 3.0 },  // zandige klei
  { tot: 14.0, qc: 14.0, rf: 0.8 }, // Pleistoceen zand
  { tot: 20.0, qc: 22.0, rf: 0.7 }, // vast zand
];

const STAP = 0.02;
const EIND = 20.0;
const MAAIVELD_NAP = 1.42;
const RD_X = 134749.4;
const RD_Y = 477799.8;
const LAT = 52.28782;
const LON = 5.09041;

let zaad = 987654321;
function rnd() {
  zaad = (zaad * 1103515245 + 12345) & 0x7fffffff;
  return zaad / 0x7fffffff;
}

const rijen = [];
for (let i = 1; i * STAP <= EIND + 1e-9; i++) {
  const d = Math.round(i * STAP * 1000) / 1000;
  const laag = LAGEN.find((l) => d <= l.tot) || LAGEN[LAGEN.length - 1];
  const qc = Math.max(0.05, laag.qc * (1 + (rnd() - 0.5) * 0.18));
  const rf = Math.max(0.1, laag.rf * (1 + (rnd() - 0.5) * 0.2));
  const fs_ = (qc * rf) / 100;
  const qt = qc + 0.02; // gecorrigeerde conusweerstand, iets hoger

  rijen.push(
    [
      d.toFixed(3),
      d.toFixed(3),
      (i * 0.5).toFixed(1),
      qc.toFixed(3),
      qt.toFixed(3),
      fs_.toFixed(4),
      rf.toFixed(2),
      '-999999',
    ].join(','),
  );
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<dispatchDataResponse xmlns="http://www.broservices.nl/xsd/dscpt/1.1"
                      xmlns:brocom="http://www.broservices.nl/xsd/brocommon/3.0"
                      xmlns:cptcommon="http://www.broservices.nl/xsd/cptcommon/1.1"
                      xmlns:gml="http://www.opengis.net/gml/3.2"
                      xmlns:swe="http://www.opengis.net/swe/2.0">
  <brocom:responseType>uitgifte</brocom:responseType>
  <dispatchDocument>
    <CPT_O gml:id="id_0001">
      <brocom:broId>CPT000000099999</brocom:broId>
      <brocom:deliveryAccountableParty>12345678</brocom:deliveryAccountableParty>
      <brocom:qualityRegime>IMBRO</brocom:qualityRegime>
      <researchReportDate>
        <brocom:date>2021-06-15</brocom:date>
      </researchReportDate>
      <cptStandard>NEN-EN-ISO22476D1</cptStandard>
      <deliveredLocation>
        <cptcommon:location gml:id="id_0002" srsName="urn:ogc:def:crs:EPSG::28992">
          <gml:pos>${RD_X.toFixed(3)} ${RD_Y.toFixed(3)}</gml:pos>
        </cptcommon:location>
      </deliveredLocation>
      <standardizedLocation>
        <brocom:location gml:id="id_0003" srsName="urn:ogc:def:crs:EPSG::4258">
          <gml:pos>${LAT} ${LON}</gml:pos>
        </brocom:location>
      </standardizedLocation>
      <deliveredVerticalPosition>
        <cptcommon:localVerticalReferencePoint>maaiveld</cptcommon:localVerticalReferencePoint>
        <cptcommon:verticalDatum>NAP</cptcommon:verticalDatum>
        <cptcommon:offset uom="m">${MAAIVELD_NAP}</cptcommon:offset>
      </deliveredVerticalPosition>
      <conePenetrometerSurvey gml:id="id_0004">
        <cptcommon:finalDepth uom="m">${EIND.toFixed(2)}</cptcommon:finalDepth>
        <cptcommon:conePenetrationTest>
          <swe:DataArray>
            <swe:elementCount>
              <swe:Count><swe:value>${rijen.length}</swe:value></swe:Count>
            </swe:elementCount>
            <swe:elementType name="values">
              <swe:DataRecord>
                <swe:field name="penetrationLength"><swe:Quantity uom="m"/></swe:field>
                <swe:field name="depth"><swe:Quantity uom="m"/></swe:field>
                <swe:field name="elapsedTime"><swe:Quantity uom="s"/></swe:field>
                <swe:field name="coneResistance"><swe:Quantity uom="MPa"/></swe:field>
                <swe:field name="correctedConeResistance"><swe:Quantity uom="MPa"/></swe:field>
                <swe:field name="localFriction"><swe:Quantity uom="MPa"/></swe:field>
                <swe:field name="frictionRatio"><swe:Quantity uom="%"/></swe:field>
                <swe:field name="porePressureU2"><swe:Quantity uom="MPa"/></swe:field>
              </swe:DataRecord>
            </swe:elementType>
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

fs.writeFileSync(path.join(__dirname, 'cpt-voorbeeld.xml'), xml, 'utf8');
console.log(`cpt-voorbeeld.xml geschreven: ${rijen.length} meetpunten, ${(xml.length / 1024).toFixed(0)} kB`);
