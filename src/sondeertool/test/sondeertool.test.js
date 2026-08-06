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

// ---------------------------------------------------------------------------
// Kengegevens: de BRO antwoordt op /characteristics/searches met XML, niet met
// JSON, ondanks Accept: application/json. Dat is in productie vastgesteld via
// het diagnose-endpoint: status 200, content-type application/xml, 40 CPT-ids.
// ---------------------------------------------------------------------------

const { parseKengegevensXml } = require('../services/cptParser');
const kengegevensXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'kengegevens-voorbeeld.xml'), 'utf8');

test('kengegevens-XML: alle sonderingen worden eruit gelezen', () => {
  const lijst = parseKengegevensXml(kengegevensXml);
  assert.equal(lijst.length, 3);
  assert.deepEqual(lijst.map((k) => k.broId), [
    'CPT000000129384', 'CPT000000129385', 'CPT000000129386',
  ]);
});

test('kengegevens-XML: RD-locatie wordt omgerekend en klopt met de standardizedLocation', () => {
  const [eerste] = parseKengegevensXml(kengegevensXml);
  const afwijking = afstandMeter(eerste.coordinaten.lat, eerste.coordinaten.lon, 52.28782, 5.09041);
  assert.ok(afwijking < 25, `afwijking te groot: ${afwijking} m`);
});

test('kengegevens-XML: datum, einddiepte en regime komen mee', () => {
  const lijst = parseKengegevensXml(kengegevensXml);
  assert.equal(lijst[0].datum, '2021-06-15');
  assert.equal(lijst[0].einddiepte, 20);
  assert.equal(lijst[0].kwaliteitsregime, 'IMBRO');
  assert.equal(lijst[1].kwaliteitsregime, 'IMBRO/A');
  assert.equal(lijst[2].einddiepte, 6.4);
});

test('kengegevens-XML: werkt ook zonder deliveredLocation (alleen gestandaardiseerd)', () => {
  const derde = parseKengegevensXml(kengegevensXml)[2];
  assert.ok(derde.coordinaten, 'coordinaten moeten uit standardizedLocation komen');
  assert.ok(Math.abs(derde.coordinaten.lat - 52.2901) < 0.001);
});

test('kengegevens-XML: terugval als het omhulsel anders heet', () => {
  // Zelfde inhoud, maar CPT_C herbenoemd: de parser moet dan op broId knippen.
  const herbenoemd = kengegevensXml.replace(/CPT_C/g, 'CPT_Kengegevens');
  const lijst = parseKengegevensXml(herbenoemd);
  assert.equal(lijst.length, 3, 'terugval op broId-posities moet werken');
  assert.equal(lijst[0].broId, 'CPT000000129384');
  assert.ok(lijst[0].coordinaten);
});

test('kengegevens-XML: onzin levert een lege lijst, geen fout', () => {
  assert.deepEqual(parseKengegevensXml('<leeg/>'), []);
  assert.deepEqual(parseKengegevensXml(''), []);
  assert.deepEqual(parseKengegevensXml(null), []);
});

// ---------------------------------------------------------------------------
// Weerbaarheid van de meetreeks-parser.
//
// Op de live BRO gaf elke sondering "bevat geen bruikbare meetpunten" terwijl
// het ophalen lukte. Dat kan alleen als de kolomnamen of de scheidingstekens
// afwijken van de fixture. Deze tests dekken de varianten af die dat kunnen
// veroorzaken, zodat één afwijking niet de hele sondering laat wegvallen.
// ---------------------------------------------------------------------------

test('meetreeks: rijen gescheiden door regeleindes in plaats van puntkomma', () => {
  const aangepast = xml
    .replace('blockSeparator=";"', 'blockSeparator="&#10;"')
    .replace(/;/g, '\n');
  const s = parseCptXml(aangepast);
  assert.ok(s.aantalPunten > 900, `verwacht ~1000 punten, kreeg ${s.aantalPunten}`);
  assert.ok(s.punten[0].qc > 0);
});

test('meetreeks: velden gescheiden door spaties in plaats van komma', () => {
  const aangepast = xml
    .replace('tokenSeparator=","', 'tokenSeparator=" "')
    .replace(/<swe:values>([\s\S]*?)<\/swe:values>/, (heel, inhoud) =>
      `<swe:values>${inhoud.replace(/,/g, ' ')}</swe:values>`);
  const s = parseCptXml(aangepast);
  assert.ok(s.aantalPunten > 900, `verwacht ~1000 punten, kreeg ${s.aantalPunten}`);
});

test('meetreeks: TextEncoding liegt over de scheiders, parser kiest zelf', () => {
  // Bestand zegt "|" maar gebruikt in werkelijkheid ; en ,
  const aangepast = xml.replace(
    /<swe:TextEncoding[^>]*>/,
    '<swe:TextEncoding decimalSeparator="." tokenSeparator="|" blockSeparator="!"/>',
  );
  const s = parseCptXml(aangepast);
  assert.ok(s.aantalPunten > 900, `parser moet de echte scheiders vinden, kreeg ${s.aantalPunten}`);
});

test('meetreeks: kolomnamen in andere schrijfwijze', () => {
  const aangepast = xml
    .replace('name="depth"', 'name="Depth"')
    .replace('name="coneResistance"', 'name="cone_resistance"')
    .replace('name="localFriction"', 'name="Local_Friction"');
  const s = parseCptXml(aangepast);
  assert.ok(s.aantalPunten > 900);
  assert.ok(s.qcMax > 10, 'conusweerstand moet nog gevonden worden');
  assert.ok(s.punten.some((p) => p.fs !== null), 'wrijving moet nog gevonden worden');
});

test('meetreeks: onbekende dieptekolom valt terug op de eerste kolom', () => {
  const aangepast = xml
    .replace('name="penetrationLength"', 'name="iets_onbekends"')
    .replace('name="depth"', 'name="nog_iets_anders"');
  const s = parseCptXml(aangepast);
  assert.ok(s.aantalPunten > 900, 'de eerste kolom is in de BRO altijd de indringingslengte');
  assert.ok(s.punten[0].d >= 0 && s.punten[0].d < 1);
});

test('meetreeks: foutmelding bevat de context om het te kunnen oplossen', () => {
  // Waarden die niets bruikbaars bevatten
  const kapot = xml.replace(/<swe:values>[\s\S]*?<\/swe:values>/, '<swe:values>abc;def;</swe:values>');
  assert.throws(
    () => parseCptXml(kapot),
    (fout) => {
      assert.match(fout.message, /kolommen:/, 'melding moet de kolommen noemen');
      assert.match(fout.message, /scheiders/, 'melding moet de scheiders noemen');
      assert.match(fout.message, /begin:/, 'melding moet het begin van de data laten zien');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Het ECHTE BRO-formaat.
//
// Vastgesteld op CPT000000256805 (Bussum) via /api/diagnose-sondering: geen
// swe:DataRecord, geen veldnamen, een cptcommon:parameters-blok met ja/nee, en
// 25 vaste kolommen waarvan de niet-gemeten op -999999 staan. Mijn parser zocht
// naar veldnamen, vond er nul, en gooide daarom elke rij weg -- de sondering
// leek dan leeg terwijl er 2255 meetpunten in zaten.
// ---------------------------------------------------------------------------

const echtXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'cpt-echt-formaat.xml'), 'utf8');

test('echt formaat: fixture heeft inderdaad geen veldnamen en 25 kolommen', () => {
  // Bewaakt de fixture zelf: gaat die per ongeluk op het specificatieformaat
  // lijken, dan test hij niet meer waarvoor hij bedoeld is.
  assert.equal((echtXml.match(/field[^>]*name=/g) || []).length, 0);
  assert.ok(!/DataRecord/.test(echtXml));
  assert.equal(echtXml.match(/<swe:values>([^;]*)/)[1].split(',').length, 25);
});

test('echt formaat: kolomvolgorde komt uit het parameters-blok', () => {
  const s = parseCptXml(echtXml);
  assert.equal(s.kolommen.length, 25);
  assert.equal(s.kolommen[0], 'penetrationLength');
  assert.equal(s.kolommen[3], 'coneResistance');
  assert.equal(s.kolommen[18], 'localFriction');
  assert.equal(s.kolommen[24], 'frictionRatio');
});

test('echt formaat: alle meetpunten worden gelezen', () => {
  const s = parseCptXml(echtXml);
  assert.ok(s.aantalPunten > 2200, `verwacht ~2256 punten, kreeg ${s.aantalPunten}`);
  assert.equal(s.einddiepte, 22.559);
  assert.equal(s.maaiveldNap, 0.68);
  assert.ok(s.qcMax > 20, 'vast zand moet zichtbaar zijn');
  assert.ok(s.punten[1].fs !== null, 'wrijving uit kolom 19');
  assert.ok(s.punten[1].rf !== null, 'wrijvingsgetal uit kolom 25');
});

test('echt formaat: werkt ook zonder parameters-blok, via de vaste volgorde', () => {
  // Sommige bestanden kunnen het blok missen. Met 25 kolommen is de volgorde
  // bekend, dus dan is teruggeven van nul meetpunten onnodig.
  const zonder = echtXml.replace(/<cptcommon:parameters>[\s\S]*?<\/cptcommon:parameters>/, '');
  assert.ok(!/parameters/.test(zonder));
  const s = parseCptXml(zonder);
  assert.ok(s.aantalPunten > 2200, `verwacht ~2256 punten, kreeg ${s.aantalPunten}`);
  assert.equal(s.kolommen[3], 'coneResistance');
  assert.ok(s.qcMax > 20);
});

test('echt formaat: interpretatie geeft een plausibel Bussums profiel', () => {
  const i = interpreteerSondering(parseCptXml(echtXml));
  assert.ok(i.paalpunt, 'er moet een vaste zandlaag gevonden worden');
  assert.ok(i.paalpunt.diepteMv > 10 && i.paalpunt.diepteMv < 16,
    `paalpunt verwacht tussen 10 en 16 m, kreeg ${i.paalpunt.diepteMv}`);
  assert.ok(i.slappeToplaagDikte > 8, 'dik slap pakket erboven');
  assert.ok(i.lagen.some((l) => l.soort === 'veen'), 'veenlaag moet herkend worden');
  assert.ok(i.reeks.punten.length <= 900, 'reeks verdund voor de browser');
});

// ---------------------------------------------------------------------------
// De client-JS tegen het paginatemplate.
//
// Aanleiding: in de ronde waarin alle klassen een sd-prefix kregen, verving een
// zoek-en-vervang de string 'melding' ook binnen el('melding'). Daardoor zocht
// de code naar id "sd-sd-melding", kreeg null terug, en viel de hele zoekactie
// stil met een eeuwig doorlopende voortgangstimer. Onzichtbaar in elke test,
// want die raakten de browserkant niet. Deze test dekt dat af.
// ---------------------------------------------------------------------------

const clientJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sondeertool.js'), 'utf8');
const paginaHtml = fs.readFileSync(path.join(__dirname, '..', 'pagina.html'), 'utf8');

test('client: elk el(...) verwijst naar een id dat in pagina.html bestaat', () => {
  const ids = [...new Set([...clientJs.matchAll(/\bel\('([^']+)'\)/g)].map((m) => m[1]))];
  assert.ok(ids.length > 15, `verwacht ruim 15 id-verwijzingen, vond ${ids.length}`);
  const ontbrekend = ids.filter((naam) => !paginaHtml.includes(`id="sd-${naam}"`));
  assert.deepEqual(ontbrekend, [], `deze id's ontbreken in pagina.html: ${ontbrekend.join(', ')}`);
});

test('client: geen dubbel geprefixte namen', () => {
  // el() zet zelf 'sd-' ervoor, dus el('sd-x') zoekt naar 'sd-sd-x'.
  const dubbel = [...clientJs.matchAll(/\bel\('(sd-[^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual(dubbel, [], `el() mag geen sd-prefix meekrijgen: ${dubbel.join(', ')}`);
});

test('client: elk veld(...) verwijst naar een bestaand data-sd-veld', () => {
  const velden = [...new Set([...clientJs.matchAll(/\bveld\('([^']+)'\)/g)].map((m) => m[1]))];
  assert.ok(velden.length >= 8);
  const ontbrekend = velden.filter((naam) => !paginaHtml.includes(`data-sd-veld="${naam}"`));
  assert.deepEqual(ontbrekend, []);
});

test('client: elke klasse in een querySelector bestaat in pagina.html', () => {
  const klassen = [...new Set([...clientJs.matchAll(/querySelector\('\.([\w-]+)'\)/g)].map((m) => m[1]))];
  const ontbrekend = klassen.filter((k) => !paginaHtml.includes(k));
  assert.deepEqual(ontbrekend, [], `deze klassen ontbreken: ${ontbrekend.join(', ')}`);
});

test('client: alle klassen in de markup zijn geprefixt, zodat de site-CSS niet kan botsen', () => {
  const namen = new Set();
  for (const m of paginaHtml.matchAll(/class="([^"]*)"/g)) {
    for (const t of m[1].split(/[\s{}$?:'`]+/)) {
      if (t && t !== 'sondeertool-app' && !t.startsWith('sd-') && !t.startsWith('{{')) namen.add(t);
    }
  }
  assert.deepEqual([...namen], []);
});

test('client: de voortgangstimer wordt in een finally gestopt', () => {
  // Zonder dit blijft de knop bij een fout eeuwig door de stappen lopen.
  assert.match(clientJs, /finally\s*\{[^}]*bezig\(false\)/s);
  assert.match(clientJs, /clearInterval\(voortgangTimer\)/);
});
