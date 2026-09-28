'use strict';

// Draaien:  node --test src/paginas/test/*.test.js
//
// Bewaakt dat de pagina's met opties, prijzen en vragen niets anders zeggen
// dan de configurator, projectfasen.js en de homepage.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const paginas = require('..');
const configurator = require('../configurator');
const T = require('../teksten');
const PROJECTFASEN = require('../../../projectfasen.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const lees = (naam) => fs.readFileSync(path.join(ROOT, naam), 'utf8').replace(/\r\n/g, '\n');

// Alles wat als bron mag dienen, als één platte tekst
const plat = (t) => String(t)
  .replace(/<\/?(strong|em|b|i)[^>]*>/g, '')
  .replace(/<br\s*\/?>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&mdash;/g, '—')
  .replace(/\\'/g, "'")
  .replace(/\s+/g, ' ')
  .trim();
const BRON = plat([lees('configurator.html'), lees('projectfasen.js'), lees('server.js'), lees('project.html')].join('\n'));
const staatInBron = (t) => BRON.includes(plat(t));

const euro = (n) => '€' + Math.round(n).toLocaleString('nl-NL');
const g = () => configurator.metPrijzen({});

// ---------------------------------------------------------------------------

test('opties en berekening zijn uit configurator.html te lezen', () => {
  assert.equal(configurator.beschikbaar(), true, String(configurator.fout()));
  const d = g();
  assert.deepEqual(Object.keys(d.PLANS), ['casco', 'cplus', 'cplus2']);
  assert.equal(Object.keys(d.ROOF_TYPES).length, 4);
  assert.equal(Object.keys(d.DOORS).length, 4);
  assert.equal(Object.keys(d.GEVEL_TYPES).length, 3);
  for (const o of [...Object.values(d.ROOF_TYPES), ...Object.values(d.DOORS), ...Object.values(d.GEVEL_TYPES), ...Object.values(d.DAKRAND_TYPES)]) {
    assert.ok(o.label && o.desc, 'elke optie heeft een naam en een omschrijving');
  }
});

test('berekening: standaardkeuzes geven het bedrag van de configurator', () => {
  const d = g();
  const P = d.prijzen();
  const s = d.standaard;
  // met de hand nagerekend volgens calculate() in configurator.html
  const verwacht = Math.round(s.width * s.depth * P.plan_cplus_rate * P.roof_plat_mult)
    + P.bovenkozijn_metselwerk + P.dakrand_metselwerk_zink + Math.round(s.width * P.uitbouw_wand_per_meter);
  assert.equal(d.bereken({}).total, verwacht);
  assert.equal(d.bereken({ type: 'aanbouw' }).total, verwacht - Math.round(s.width * P.uitbouw_wand_per_meter));
  // een berekening laat de standaardkeuzes ongemoeid
  d.bereken({ type: 'aanbouw', width: 4, depth: 3, plan: 'casco' });
  assert.equal(d.bereken({}).total, verwacht);
});

test('prijzen uit het beheer werken door; onbekende of ongeldige waarden niet', () => {
  const d = configurator.metPrijzen({ plan_cplus_rate: 3200, doors_schuifpui: 'x', bestaat_niet: 5, extra_lichtkoepel: -1 });
  assert.equal(d.PLANS.cplus.rate, 3200);
  assert.equal(d.DOORS.schuifpui.extra, d.DEFAULT_PRICES.doors_schuifpui);
  assert.equal(d.prijzen().extra_lichtkoepel, d.DEFAULT_PRICES.extra_lichtkoepel);
  assert.equal('bestaat_niet' in d.prijzen(), false);
  configurator.metPrijzen({});
});

test('rekenvoorbeelden op de pagina zijn de bedragen van de configurator', async () => {
  const d = g();
  for (const soort of ['aanbouw', 'uitbouw']) {
    const html = await paginas.bouw('/' + soort);
    for (const [b, diepte] of T.REKENVOORBEELD.maten) {
      for (const plan of Object.keys(d.PLANS)) {
        const bedrag = euro(d.bereken({ type: soort, width: b, depth: diepte, plan }).total);
        const cel = `<td class="bedrag" data-label="${d.PLANS[plan].name}">${bedrag}</td>`;
        assert.ok(html.includes(cel), `${soort} ${b}×${diepte} ${plan}: ${bedrag} ontbreekt`);
      }
    }
  }
});

test('opbouw van de prijs telt op tot het totaal van de configurator', async () => {
  const d = g();
  for (const soort of ['aanbouw', 'uitbouw']) {
    const blok = paginas.OPTIES.blokOpbouw(d, soort, 'section-paper');
    assert.ok(blok, `${soort}: blok ontbreekt, de som klopte niet`);
    const bedragen = [...blok.matchAll(/<td class="bedrag">€([\d.]+)<\/td>/g)].map((m) => Number(m[1].replace(/\./g, '')));
    const totaal = bedragen.pop();
    assert.equal(bedragen.reduce((a, b) => a + b, 0), totaal);
    assert.equal(totaal, d.bereken({ type: soort }).total);
  }
});

test('prijslijst: elke prijs komt uit de configurator', () => {
  const d = g();
  const P = d.prijzen();
  const regels = paginas.OPTIES.prijslijstRegels(d).flatMap((gr) => gr.regels);
  const tekst = regels.map((r) => r.join(' ')).join(' | ');
  for (const sleutel of Object.keys(P)) {
    if (/_mult$/.test(sleutel) || /^plan_/.test(sleutel)) continue;
    const bedrag = sleutel === 'extra_vloerverwarming_m2' ? euro(P[sleutel]) + '/m²' : euro(P[sleutel]);
    assert.ok(tekst.includes(bedrag), `${sleutel} (${bedrag}) ontbreekt in de prijslijst`);
  }
  for (const dak of Object.values(d.ROOF_TYPES)) assert.ok(tekst.includes(dak.label));
});

test('teksten uit de configurator staan daar letterlijk', () => {
  const C = T.CONFIGURATOR;
  const lijst = [
    C.verschil, C.aanbouw, C.uitbouw, C.uitbouwMeerprijs,
    ...Object.values(C.bovenkozijn).flatMap((b) => [b.label, b.tekst]),
    ...Object.values(C.extras).flatMap((e) => [e.label, e.tekst, e.casco].filter(Boolean)),
    C.regenpijp.intro, C.regenpijp.pvc.tekst, C.regenpijp.zink.tekst,
    C.elektra.contact.tekst, C.elektra.contactBuiten.tekst, C.elektra.lichtBuiten.tekst,
    C.elektra.contact.label, C.elektra.licht.label, C.elektra.contactBuiten.label, C.elektra.lichtBuiten.label,
    C.elektra.buiten, C.elektra.plan, C.elektra.cascoKop, C.elektra.casco,
    C.prijs.totaal, C.prijs.toevoeging, C.prijs.voorbehoud, C.prijs.richtprijs,
    C.waarde, C.offerte,
    T.BODEMCHECK.tekst, T.BODEMCHECK.voorbehoud,
    T.PAGINAS.dak.intro, T.PAGINAS.kozijn.intro,
    'Wij werken uitsluitend met echte massieve bakstenen — geen steenstrips.',
    'Kies de hoofdcategorie en daarna de specifieke kleur of stijl.',
  ];
  for (const t of lijst) assert.ok(staatInBron(t), `niet gevonden in de bron: "${plat(t).slice(0, 80)}"`);
});

test('prijssleutels in teksten.js bestaan in de configurator', () => {
  const P = g().prijzen();
  const C = T.CONFIGURATOR;
  const sleutels = [
    ...Object.values(C.bovenkozijn), ...Object.values(C.extras),
    C.regenpijp.pvc, C.regenpijp.zink,
    C.elektra.contact, C.elektra.licht, C.elektra.contactBuiten, C.elektra.lichtBuiten,
  ].map((o) => o.prijsSleutel);
  for (const s of sleutels) assert.equal(typeof P[s], 'number', `${s} bestaat niet in de configurator`);
});

// Een antwoord mag beginnen met de naam van een optie of plan ("Casco: ...",
// "Schuifpui (+€3.500): ..."); wat daarna komt moet letterlijk in de bron staan.
test('veelgestelde vragen: elk antwoord staat letterlijk op de site', () => {
  const d = g();
  const A = paginas.OPTIES.antwoorden(d);
  const namen = [
    ...Object.values(d.PLANS).map((x) => x.name),
    ...Object.values(d.ROOF_TYPES).map((x) => x.label),
    ...Object.values(d.DOORS).map((x) => x.label),
    T.DIENSTEN.aanbouw.naam, T.DIENSTEN.uitbouw.naam,
  ].sort((a, b) => b.length - a.length);
  const zonderNaam = (t) => {
    for (const n of namen) {
      const m = t.match(new RegExp('^' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?: \\([^)]*\\))?: '));
      if (m) return t.slice(m[0].length);
    }
    return t;
  };
  for (const v of T.VRAGEN) {
    assert.ok(A[v.id] && A[v.id].length, `vraag "${v.id}" heeft geen antwoord`);
    for (const alinea of A[v.id].flat()) {
      if (v.id === 'kosten' && /vanaf €/.test(alinea)) {
        for (const x of Object.values(d.PLANS)) assert.ok(alinea.includes(`${x.name} vanaf ${euro(x.rate)}/m²`));
        continue;
      }
      let rest = zonderNaam(alinea);
      // "+€450 per m¹ breedte. De volledige achtergevel ..." -> alleen de zin toetsen
      rest = rest.replace(/^\+€[\d.]+ per m¹ breedte\. /, '');
      const gevonden = staatInBron(rest) || staatInBron(rest.slice(1)); // eerste letter kan hoofdletter zijn geworden
      assert.ok(gevonden, `${v.id}: niet letterlijk op de site: "${plat(rest).slice(0, 90)}"`);
    }
  }
});

test('veelgestelde vragen: geen toezegging over vergunning of sondering', () => {
  const tekst = plat(Object.values(paginas.OPTIES.antwoorden(g())).flat(2).join(' '));
  assert.match(tekst, /U bent zelf verantwoordelijk/);
  assert.match(tekst, /Wij controleren dit niet/);
  assert.match(tekst, /sondering nodig, dan is ook die uw eigen verantwoordelijkheid/);
  assert.doesNotMatch(tekst, /wij (regelen|verzorgen|vragen) .{0,40}vergunning/i);
  assert.doesNotMatch(tekst, /vergunningsvrij tot/i);
});

test('veelgestelde vragen staan ook als gegevens voor zoekmachines op de pagina', async () => {
  const html = await paginas.bouw('/veelgestelde-vragen');
  const blok = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = blok['@graph'].find((x) => x['@type'] === 'FAQPage');
  assert.ok(faq, 'FAQPage ontbreekt');
  assert.equal(faq.mainEntity.length, T.VRAGEN.length);
  for (const q of faq.mainEntity) assert.ok(q.name && q.acceptedAnswer.text.length > 20);
});

test('de stappen waaruit geciteerd wordt, bestaan in projectfasen.js', () => {
  for (const id of ['huisbezoek', 'offerte', 'constructie', 'fundering', 'draagbalk', 'buitenafwerking', 'binnenafwerking']) {
    assert.ok(PROJECTFASEN.FASEN.find((f) => f.id === id), `stap "${id}" ontbreekt`);
  }
});
