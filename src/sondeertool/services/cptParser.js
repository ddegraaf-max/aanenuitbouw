'use strict';

const { rdToWgs84 } = require('./rd');

/**
 * Parser voor IMBRO CPT-XML (het antwoord van GET /sr/cpt/v1/objects/{broId}).
 *
 * Waarom geen XML-library? De relevante structuur is klein en volledig
 * voorspelbaar, en de meetdata zit niet in elementen maar in EEN tekstblok
 * (<swe:values>) dat je alsnog zelf moet splitsen. Een DOM-parser bouwt dan
 * eerst honderdduizenden nodes op die we niet gebruiken. Alle regexes hier
 * zijn namespace-prefix-onafhankelijk, want de BRO wisselt prefixen
 * (cptcommon:, ns0:, ns1:) tussen releases.
 *
 * Ontbrekende metingen zijn in de BRO gecodeerd als -999999 -> wij maken null.
 */

const ONTBREEKT = -999999;

/** Bouwt een regex die een element matcht, ongeacht namespace-prefix. */
function el(naam) {
  return new RegExp(`<(?:[\\w.-]+:)?${naam}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${naam}>`, 'i');
}

function tekst(xml, naam) {
  const m = xml.match(el(naam));
  return m ? m[1].trim() : null;
}

function getal(xml, naam) {
  const t = tekst(xml, naam);
  if (t === null) return null;
  const n = Number.parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Haalt het attribuut srsName op uit het eerste element met die naam. */
function srsVan(fragment) {
  const m = fragment && fragment.match(/srsName\s*=\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

/**
 * Leest een <gml:pos> of <gml:coordinates> uit een fragment en normaliseert
 * naar WGS84. RD (28992) wordt omgerekend; 4258/ETRS89 en 4326 zijn voor onze
 * doeleinden identiek aan WGS84.
 */
function positieUit(fragment) {
  if (!fragment) return null;
  const pos = tekst(fragment, 'pos') || tekst(fragment, 'coordinates');
  if (!pos) return null;
  const delen = pos.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  if (delen.length < 2) return null;

  const srs = srsVan(fragment) || '';
  const isRd = /28992/.test(srs) || delen[0] > 1000; // RD-coordinaten zijn altijd > 1000

  if (isRd) {
    const [x, y] = delen;
    const { lat, lon } = rdToWgs84(x, y);
    return { lat, lon, rdX: x, rdY: y, srs: srs || 'EPSG:28992 (afgeleid)' };
  }

  // In GML met EPSG:4258/4326 is de as-orde lat, lon.
  const [lat, lon] = delen;
  return { lat, lon, srs: srs || 'EPSG:4258 (aangenomen)' };
}

/** Leest de kolomnamen in de juiste volgorde uit de DataRecord-definitie. */
function kolomnamen(xml) {
  const record = xml.match(el('DataRecord'));
  const bron = record ? record[1] : xml;
  const namen = [];
  const re = /<(?:[\w.-]+:)?field\b[^>]*\bname\s*=\s*"([^"]+)"/gi;
  let m;
  while ((m = re.exec(bron)) !== null) namen.push(m[1]);
  return namen;
}

/** Leest de scheidingstekens uit <swe:TextEncoding>, met BRO-defaults. */
function encoding(xml) {
  const m = xml.match(/<(?:[\w.-]+:)?TextEncoding\b([^>]*)>/i);
  const attrs = m ? m[1] : '';
  const pak = (naam, standaard) => {
    const a = attrs.match(new RegExp(`${naam}\\s*=\\s*"([^"]*)"`, 'i'));
    return a && a[1] !== '' ? a[1] : standaard;
  };
  return {
    token: pak('tokenSeparator', ','),
    block: pak('blockSeparator', ';'),
    decimaal: pak('decimalSeparator', '.'),
  };
}

/**
 * Parseert de volledige CPT-XML.
 * @returns {object} genormaliseerde sondering
 */
function parseCptXml(xml) {
  if (typeof xml !== 'string' || xml.length < 50) {
    throw new Error('Leeg of ongeldig CPT-XML-antwoord');
  }

  const broId = tekst(xml, 'broId');
  const kwaliteit = tekst(xml, 'qualityRegime');
  const finalDepth = getal(xml, 'finalDepth');
  const norm = tekst(xml, 'cptStandard');

  // Datum: researchReportDate is een wrapper om <brocom:date>.
  const rapportBlok = xml.match(el('researchReportDate'));
  const datum =
    (rapportBlok && (tekst(rapportBlok[1], 'date') || tekst(rapportBlok[1], 'year'))) ||
    tekst(xml, 'researchReportDate');

  // Locatie: standardizedLocation is door de BRO gestandaardiseerd (ETRS89),
  // deliveredLocation is zoals aangeleverd (meestal RD). Voorkeur: delivered,
  // want die is exact; standardized als terugval.
  const geleverdBlok = xml.match(el('deliveredLocation'));
  const standaardBlok = xml.match(el('standardizedLocation'));
  const locatie =
    positieUit(geleverdBlok && geleverdBlok[1]) ||
    positieUit(standaardBlok && standaardBlok[1]);

  // Maaiveldhoogte t.o.v. NAP.
  const verticaalBlok = xml.match(el('deliveredVerticalPosition'));
  const verticaal = verticaalBlok ? verticaalBlok[1] : xml;
  const maaiveldNap = getal(verticaal, 'offset');
  const datum_vert = tekst(verticaal, 'verticalDatum');

  // Meetdata.
  const kolommen = kolomnamen(xml);
  const enc = encoding(xml);
  const waardenBlok = xml.match(el('values'));
  if (!waardenBlok) {
    throw new Error(`Geen meetwaarden gevonden in CPT-XML van ${broId || 'onbekend object'}`);
  }

  let ruw = waardenBlok[1].trim();

  // Controleren of de opgegeven scheidingstekens daadwerkelijk werken. Levert
  // de blokscheider maar één rij op, of een rij maar één veld, dan wijkt het
  // bestand af van zijn eigen TextEncoding. Dan proberen we alternatieven, in
  // plaats van nul meetpunten terug te geven en de hele sondering te verliezen.
  const kiesScheider = (tekst, opgegeven, kandidaten, minDelen) => {
    const werkt = (teken) => teken && tekst.split(teken).filter((d) => d.trim()).length >= minDelen;
    if (werkt(opgegeven)) return opgegeven;
    for (const kandidaat of kandidaten) if (werkt(kandidaat)) return kandidaat;
    return opgegeven;
  };

  enc.block = kiesScheider(ruw, enc.block, [';', '\n', '\r\n', '|'], 2);
  const proefRij = (ruw.split(enc.block).find((r) => r.trim()) || '').trim();
  enc.token = kiesScheider(proefRij, enc.token, [',', ' ', '\t', ';', '|'].filter((t) => t !== enc.block), 2);

  // Kolommen opzoeken zonder te struikelen over schrijfwijze. De BRO is
  // consistent, maar historische bestanden (IMBRO/A, tot 2004 terug) zijn dat
  // niet altijd, en op één niet-gevonden kolom valt de hele sondering weg.
  const genormaliseerd = kolommen.map((k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idx = (naam) => genormaliseerd.indexOf(String(naam).toLowerCase().replace(/[^a-z0-9]/g, ''));
  const idxBevat = (patroon) => genormaliseerd.findIndex((k) => patroon.test(k));

  const iLengte = idx('penetrationLength');
  let iDiepte = idx('depth');
  let iQc = idx('coneResistance');
  const iQcGecorrigeerd = idx('correctedConeResistance');
  let iFs = idx('localFriction');
  const iRf = idx('frictionRatio');
  const iU2 = idx('porePressureU2');

  // Terugval op patronen als de exacte naam ontbreekt.
  if (iDiepte < 0) iDiepte = idxBevat(/^depth|diepte/);
  if (iQc < 0) iQc = idxBevat(/coneresist|conusweerstand|^qc$/);
  if (iFs < 0) iFs = idxBevat(/localfriction|plaatselijkewrijving|^fs$/);

  // Laatste terugval voor de diepte: in de BRO is penetrationLength altijd de
  // eerste kolom. Zonder diepte is elke rij onbruikbaar.
  const iDiepteTerugval = iDiepte >= 0 ? iDiepte : iLengte >= 0 ? iLengte : kolommen.length > 0 ? 0 : -1;

  const punten = [];
  for (const regel of ruw.split(enc.block)) {
    const rij = regel.trim();
    if (!rij) continue;
    const velden = enc.token === ' ' ? rij.split(/\s+/) : rij.split(enc.token);
    if (velden.length < 2) continue;

    const num = (i) => {
      if (i < 0 || i >= velden.length) return null;
      let s = velden[i].trim();
      if (!s) return null;
      if (enc.decimaal !== '.') s = s.replace(enc.decimaal, '.');
      const n = Number.parseFloat(s);
      if (!Number.isFinite(n) || n <= ONTBREEKT + 1) return null;
      return n;
    };

    const diepte = num(iDiepte) ?? num(iLengte) ?? num(iDiepteTerugval);
    if (diepte === null) continue;

    const qc = num(iQcGecorrigeerd) ?? num(iQc);
    const fs = num(iFs);
    let rf = num(iRf);
    if (rf === null && qc && fs !== null && qc > 0) rf = (fs / qc) * 100;

    punten.push({
      d: Math.round(diepte * 1000) / 1000,
      qc: qc === null ? null : Math.round(qc * 1000) / 1000,
      fs: fs === null ? null : Math.round(fs * 10000) / 10000,
      rf: rf === null ? null : Math.round(rf * 100) / 100,
      u2: iU2 >= 0 ? num(iU2) : null,
    });
  }

  punten.sort((a, b) => a.d - b.d);

  if (punten.length === 0) {
    // Fout met alle context erin: bij deze melding hoefde niet meer gegokt te
    // worden welke aanname er niet klopte.
    throw new Error(
      `CPT ${broId || ''} bevat geen bruikbare meetpunten ` +
        `(kolommen: ${kolommen.join('|') || 'geen'}; ` +
        `scheiders blok=${JSON.stringify(enc.block)} veld=${JSON.stringify(enc.token)}; ` +
        `waardenlengte ${ruw.length}; begin: ${ruw.slice(0, 80)})`,
    );
  }

  const metQc = punten.filter((p) => p.qc !== null);

  return {
    broId,
    kwaliteitsregime: kwaliteit,
    norm,
    datum,
    locatie,
    maaiveldNap,
    verticaalDatum: datum_vert,
    einddiepte: finalDepth ?? punten[punten.length - 1].d,
    aantalPunten: punten.length,
    kolommen,
    punten,
    qcBeschikbaar: metQc.length > 0,
    qcMax: metQc.length ? Math.max(...metQc.map((p) => p.qc)) : null,
  };
}

/**
 * Parser voor het antwoord van POST /characteristics/searches.
 *
 * De BRO negeert `Accept: application/json` en stuurt in de praktijk XML
 * (`dispatchCharacteristicsResponse` met een CPT_C-blok per sondering). Deze
 * functie leest daaruit de kengegevens: BRO-ID, locatie, datum en einddiepte.
 *
 * Twee manieren om de blokken te vinden, want de elementnaam kan tussen
 * releases wijzigen: eerst op CPT_C, en als dat niets oplevert door de
 * documenttekst op te knippen bij elke broId. Die terugval werkt ook als de BRO
 * het omhulsel herbenoemt.
 */
function parseKengegevensXml(xml) {
  if (typeof xml !== 'string' || xml.length < 20) return [];

  const blokken = [];
  const blokRe = /<(?:[\w.-]+:)?CPT_C\b[\s\S]*?<\/(?:[\w.-]+:)?CPT_C>/gi;
  let m;
  while ((m = blokRe.exec(xml)) !== null) blokken.push(m[0]);

  if (blokken.length === 0) {
    const idRe = /<(?:[\w.-]+:)?broId>/gi;
    const posities = [];
    while ((m = idRe.exec(xml)) !== null) posities.push(m.index);
    for (let i = 0; i < posities.length; i++) {
      blokken.push(xml.slice(posities[i], i + 1 < posities.length ? posities[i + 1] : xml.length));
    }
  }

  const uit = [];
  for (const blok of blokken) {
    const broId = tekst(blok, 'broId');
    if (!broId || !/^CPT/i.test(broId)) continue;

    const geleverd = blok.match(el('deliveredLocation'));
    const standaard = blok.match(el('standardizedLocation'));
    const locatie =
      positieUit(geleverd && geleverd[1]) ||
      positieUit(standaard && standaard[1]) ||
      positieUit(blok);

    const rapportBlok = blok.match(el('researchReportDate'));
    const datum =
      (rapportBlok && (tekst(rapportBlok[1], 'date') || tekst(rapportBlok[1], 'year'))) ||
      tekst(blok, 'researchReportDate') ||
      null;

    uit.push({
      broId,
      coordinaten: locatie ? { lat: locatie.lat, lon: locatie.lon } : null,
      datum: datum && /^\d{4}-\d{2}-\d{2}/.test(datum) ? datum.slice(0, 10) : datum,
      einddiepte: getal(blok, 'finalDepth'),
      kwaliteitsregime: tekst(blok, 'qualityRegime'),
      norm: tekst(blok, 'cptStandard'),
      doel: tekst(blok, 'surveyPurpose'),
    });
  }
  return uit;
}

module.exports = { parseCptXml, parseKengegevensXml, ONTBREEKT, _intern: { kolomnamen, encoding, positieUit } };
