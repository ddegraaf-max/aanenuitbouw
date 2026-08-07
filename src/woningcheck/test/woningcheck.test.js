'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mock = require('../services/mock');
const { archiefVoor, verwachtingBijBouwjaar, ARCHIEVEN } = require('../services/gemeentearchief');
const { bouwConclusies, samenvattingVoorMail, _intern } = require('../services/interpret');
const { bovenDeDoorbraak } = require('../services/bag3d');
const bag = require('../services/bag');
const luchtfoto = require('../services/luchtfoto');
const { laadClient } = require('./dom-shim');

const paginaHtml = fs.readFileSync(path.join(__dirname, '..', 'pagina.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'woningcheck.css'), 'utf8');
const clientJs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'woningcheck.js'), 'utf8');
const moduleJs = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

// ---------------------------------------------------------------------------
// Rekenen op geometrie
// ---------------------------------------------------------------------------

test('oppervlakte van een polygoon in RD', () => {
  // 10 bij 20 meter = 200 m²
  const vierkant = [[[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]]];
  assert.equal(bag._intern.vlakOppervlakte(vierkant), 200);

  // met een gat van 2 bij 2 erin
  const metGat = [
    [[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];
  assert.equal(bag._intern.vlakOppervlakte(metGat), 196);
});

test('pandmaten: kortste zijde is de gevelbreedte', () => {
  const contour = [[[0, 0], [6, 0], [6, 11], [0, 11], [0, 0]]];
  const m = bag._intern.afmetingenVanContour(contour);
  assert.equal(m.kortsteZijde, 6);
  assert.equal(m.langsteZijde, 11);
  // Bij een rijtjeswoning is de korte zijde de achtergevel; daar komt de
  // doorbraak, en die maat begrenst de overspanning.
  assert.equal(_intern.gevelbreedte(m), 6);
});

test('vrije ruimte tussen pand en perceelgrens', () => {
  const pand = [[[10, 10], [16, 10], [16, 20], [10, 20], [10, 10]]];
  const perceel = { type: 'Polygon', coordinates: [[[8, 5], [18, 5], [18, 40], [8, 40], [8, 5]]] };
  const ruimte = _intern.vrijeRuimte(pand, perceel);
  assert.ok(ruimte, 'er moet ruimte berekend worden');
  // noord: 40 - 20 = 20 m, dat is de grootste
  assert.equal(ruimte.grootste.kant, 'noord');
  assert.equal(ruimte.grootste.meter, 20);
});

test('vrije ruimte geeft niets terug zonder perceel', () => {
  assert.equal(_intern.vrijeRuimte([[[0, 0], [1, 0], [1, 1], [0, 0]]], null), null);
  assert.equal(_intern.vrijeRuimte(null, null), null);
});

// ---------------------------------------------------------------------------
// Wat er boven de doorbraak zit — dit bepaalt het staal
// ---------------------------------------------------------------------------

test('twee bouwlagen betekent een verdieping boven de doorbraak', () => {
  const uit = bovenDeDoorbraak({ bouwlagen: 2, goothoogte: 5.6 });
  assert.equal(uit.verwachting, 'verdieping');
  assert.match(uit.tekst, /zwaardere ligger/);
});

test('een lage goot zonder bouwlagen wijst op alleen een dak', () => {
  const uit = bovenDeDoorbraak({ bouwlagen: null, goothoogte: 2.9 });
  assert.equal(uit.verwachting, 'dak');
  assert.match(uit.tekst, /lichtere ligger/);
});

test('een hoge goot zonder bouwlagen wijst alsnog op een verdieping', () => {
  const uit = bovenDeDoorbraak({ bouwlagen: null, goothoogte: 6.1 });
  assert.equal(uit.verwachting, 'verdieping');
});

test('zonder hoogtegegevens geen uitspraak', () => {
  assert.equal(bovenDeDoorbraak(null), null);
  assert.equal(bovenDeDoorbraak({ bouwlagen: null, goothoogte: null }), null);
});

// ---------------------------------------------------------------------------
// Gemeentearchief
// ---------------------------------------------------------------------------

test('bekende gemeente geeft een directe link', () => {
  const a = archiefVoor('Gooise Meren');
  assert.equal(a.gemeente, 'Gooise Meren');
  assert.match(a.url, /^https:\/\//);
  assert.match(a.tekst, /Gooise Meren/);
});

test('onbekende gemeente geeft een bruikbare instructie, geen dode link', () => {
  const a = archiefVoor('Onbekendedorp');
  assert.equal(a.url, null);
  assert.equal(a.soort, 'onbekend');
  assert.match(a.tekst, /Onbekendedorp/, 'de gemeentenaam hoort in de tekst');
  assert.match(a.tekst, /eigenaar/, 'de bezoeker moet weten dat hij recht op inzage heeft');
});

test('zonder gemeente nog steeds een zinnige tekst', () => {
  const a = archiefVoor(null);
  assert.equal(a.url, null);
  assert.match(a.tekst, /uw gemeente/);
});

test('alle links in de archieflijst zijn https en zonder spaties', () => {
  for (const [naam, item] of Object.entries(ARCHIEVEN)) {
    assert.match(item.url, /^https:\/\/[^\s]+$/, `${naam} heeft een onbruikbare URL`);
    assert.ok(['online', 'aanvraag'].includes(item.soort), `${naam} heeft een onbekende soort`);
  }
});

test('verwachting bij bouwjaar is eerlijk over oude woningen', () => {
  assert.match(verwachtingBijBouwjaar(1912), /zonder constructiegegevens/);
  assert.match(verwachtingBijBouwjaar(2015), /volledig/);
  assert.equal(verwachtingBijBouwjaar(null), null);
});

// ---------------------------------------------------------------------------
// Conclusies
// ---------------------------------------------------------------------------

test('conclusies op een compleet mockprofiel', () => {
  const adres = mock.adres('1401EX 5');
  const woning = mock.woning(adres);
  const perceel = mock.perceel(adres);
  const hoogtes = mock.hoogtes(woning.pandId);
  const archief = archiefVoor(adres.gemeente);

  const lijst = bouwConclusies({ adres, woning, perceel, hoogtes, archief });
  assert.ok(lijst.length >= 6, `verwacht meerdere conclusies, kreeg ${lijst.length}`);
  for (const c of lijst) {
    assert.ok(['feit', 'let-op', 'info'].includes(c.soort), `onbekende soort: ${c.soort}`);
    assert.ok(c.tekst.length > 40, 'elke conclusie moet iets zeggen');
  }
  const alles = lijst.map((c) => c.tekst).join(' ');
  assert.match(alles, /stalen kolommen/, 'de doorbraakbreedte hoort erin');
  assert.match(alles, /bouwlagen|verdieping/, 'wat boven de doorbraak zit hoort erin');
  assert.match(alles, /opname op locatie/, 'de beperking hoort er altijd bij te staan');
});

test('conclusies werken ook als bronnen ontbreken', () => {
  const adres = mock.adres('x');
  // geen perceel, geen hoogtes: mag geen fout geven
  const lijst = bouwConclusies({ adres, woning: mock.woning(adres), perceel: null, hoogtes: null, archief: archiefVoor(adres.gemeente) });
  assert.ok(lijst.length >= 3);
  assert.match(lijst.map((c) => c.tekst).join(' '), /opname op locatie/);
});

test('bebouwingspercentage wordt gemeld en gewaarschuwd bij veel bebouwing', () => {
  const adres = mock.adres('y');
  const woning = { ...mock.woning(adres), grondoppervlak: 120 };
  const perceel = { ...mock.perceel(adres), oppervlakte: 180 };
  const lijst = bouwConclusies({ adres, woning, perceel, hoogtes: null, archief: null });
  const regel = lijst.find((c) => /bebouwd/.test(c.tekst));
  assert.ok(regel, 'er moet een regel over bebouwing zijn');
  assert.equal(regel.soort, 'let-op', 'bij 67% bebouwing hoort een waarschuwing');
  assert.match(regel.tekst, /omgevingsplan/);
});

test('samenvatting voor de mail bevat de harde cijfers', () => {
  const adres = mock.adres('z');
  const woning = mock.woning(adres);
  const regels = samenvattingVoorMail({ adres, woning, perceel: mock.perceel(adres), hoogtes: mock.hoogtes(woning.pandId) });
  const tekst = regels.join('\n');
  assert.match(tekst, /Adres:/);
  assert.match(tekst, /Bouwjaar:/);
  assert.match(tekst, /Perceel \(BRK\)/);
  assert.match(tekst, /Goothoogte:/);
});

// ---------------------------------------------------------------------------
// Luchtfoto
// ---------------------------------------------------------------------------

test('luchtfoto-uitsnedes hebben een kloppende schaal', () => {
  const uit = luchtfoto.uitsnedes(134749, 477800);
  assert.equal(uit.length, 3);
  for (const u of uit) {
    assert.match(u.url, /^https:\/\/.*GetMap/);
    assert.match(u.url, /EPSG%3A28992|EPSG:28992/);
    // cm per pixel moet kloppen met meter/pixels
    assert.ok(Math.abs(u.cmPerPixel - (u.meter / 760) * 100) < 0.2, `schaal klopt niet: ${u.cmPerPixel}`);
  }
  assert.ok(uit[2].meter < uit[0].meter, 'de laatste uitsnede is het meest ingezoomd');
});

test('luchtfoto zonder coordinaten geeft niets', () => {
  assert.equal(luchtfoto.beeldUrl(null, null), null);
  assert.deepEqual(luchtfoto.uitsnedes(NaN, NaN), []);
});

// ---------------------------------------------------------------------------
// Markup, stylesheet en client — de laag die bij de bodemcheld drie keer brak
// ---------------------------------------------------------------------------

test('client: elk el(...) verwijst naar een bestaand id', () => {
  const ids = [...new Set([...clientJs.matchAll(/\bel\('([^']+)'\)/g)].map((m) => m[1]))];
  assert.ok(ids.length > 10);
  const ontbrekend = ids.filter((n) => !paginaHtml.includes(`id="wc-${n}"`));
  assert.deepEqual(ontbrekend, [], `ontbreekt in pagina.html: ${ontbrekend.join(', ')}`);
});

test('client: geen dubbel geprefixte namen', () => {
  const dubbel = [...clientJs.matchAll(/\bel\('(wc-[^']*)'\)/g)].map((m) => m[1]);
  assert.deepEqual(dubbel, [], 'el() zet zelf wc- ervoor');
});

test('css: alle klassen zijn wc-geprefixt en gescoped, behalve de terugbalk', () => {
  const ongeprefixt = new Set();
  const ongescoped = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      const sel = css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!sel.startsWith('@') && sel.includes('.')) {
        for (const m of sel.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
          if (m[1] !== 'woningcheck-app' && !m[1].startsWith('wc-')) ongeprefixt.add(m[1]);
        }
        if (!sel.split(',')[0].includes('woningcheck-app')) ongescoped.push(sel.replace(/\s+/g, ' ').slice(0, 40));
      }
      start = i + 1;
    } else if (css[i] === '}') {
      start = i + 1;
    }
  }
  assert.deepEqual([...ongeprefixt], []);
  // De terugbalk staat buiten de wrapper en mag dus niet gescoped zijn.
  for (const sel of ongescoped) {
    assert.match(sel, /^\.wc-terugbalk/, `onverwacht ongescoped: ${sel}`);
  }
  assert.ok(ongescoped.length >= 3, 'de terugbalk hoort ongescoped te zijn');
});

test('css: hidden-attribuut wordt afgedwongen en er is een telefoonbreekpunt', () => {
  assert.match(css, /\.woningcheck-app \[hidden\][^{]*\{[^}]*display:\s*none\s*!important/);
  const breekpunten = [...css.matchAll(/@media \(max-width: (\d+)px\)/g)].map((m) => Number(m[1]));
  assert.ok(breekpunten.some((b) => b <= 480), `geen telefoonbreekpunt, alleen ${breekpunten.join(', ')}`);
});

test('pagina: asset-URL bevat een versiestempel', () => {
  assert.match(paginaHtml, /woningcheck\.css\?v=\{\{VERSIE\}\}/);
  assert.match(paginaHtml, /woningcheck\.js\?v=\{\{VERSIE\}\}/);
  assert.match(moduleJs, /ASSET_VERSIE/);
});

test('module: diagnostiek zit achter een sleutel', () => {
  for (const route of ['/api/klantlog', '/api/diagnose']) {
    assert.match(moduleJs, new RegExp(`rest === '${route}'[\\s\\S]{0,220}?sleutelKlopt`), `${route} moet beschermd zijn`);
  }
  assert.match(moduleJs, /verschil \|=/, 'sleutel moet zonder tijdverschil vergeleken worden');
});

test('module: het IP komt niet uit een vervalsbare header', () => {
  assert.match(moduleJs, /cf-connecting-ip/);
  const blok = moduleJs.slice(moduleJs.indexOf('function ipVan'), moduleJs.indexOf('function ipVan') + 400);
  assert.ok(!/x-forwarded-for/.test(blok));
});

test('client: het bestand wordt zonder fout uitgevoerd in een nagemaakte DOM', () => {
  const c = laadClient();
  assert.deepEqual(c.log.consoleFouten, [], 'geen fouten bij het opstarten');
  assert.equal(c.log.intervals.size, 0, 'geen timer die blijft lopen');
});

const tik = () => new Promise((r) => setImmediate(r));

function nepAntwoord() {
  const adres = mock.adres('1401EX 5');
  const woning = mock.woning(adres);
  const perceel = mock.perceel(adres);
  const hoogtes = mock.hoogtes(woning.pandId);
  const archief = archiefVoor(adres.gemeente);
  return {
    adres: { omschrijving: adres.omschrijving, gemeente: adres.gemeente, lat: adres.lat, lon: adres.lon },
    woning: { bouwjaar: woning.bouwjaar, woonoppervlak: woning.woonoppervlak, grondoppervlak: woning.grondoppervlak, afmetingen: woning.afmetingen, gebruiksdoel: woning.gebruiksdoel },
    perceel: { oppervlakte: perceel.oppervlakte, aanduiding: 'BSM00 C 4821' },
    hoogtes: { goothoogte: hoogtes.goothoogte, nokhoogte: hoogtes.nokhoogte, bouwlagen: hoogtes.bouwlagen, daktype: hoogtes.daktype },
    luchtfotos: luchtfoto.uitsnedes(adres.rdX, adres.rdY),
    archief,
    conclusies: bouwConclusies({ adres, woning, perceel, hoogtes, archief }),
    gemist: [],
    duurMs: 2100,
    tijden: {},
  };
}

test('client: een volledige opzoeking tekent alles en stopt de timer', async () => {
  const data = nepAntwoord();
  let opgevraagd = null;
  const c = laadClient({
    fetch: (url) => {
      opgevraagd = url;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve(JSON.stringify(data)),
      });
    },
  });

  c.el('wc-adres').value = '1401EX 5';
  c.el('wc-invoer').dispatch('submit');
  for (let i = 0; i < 12; i++) await tik();

  assert.ok(opgevraagd && opgevraagd.includes('/woningcheck/api/analyse'), `verwachte analyse-aanroep, kreeg ${opgevraagd}`);
  assert.equal(c.el('wc-uitkomst').hidden, false);
  assert.equal(c.log.intervals.size, 0, 'de voortgangstimer moet gestopt zijn');
  assert.equal(c.el('wc-zoekknop').disabled, false);
  assert.match(c.el('wc-cijfers').innerHTML, /Bouwjaar/);
  assert.match(c.el('wc-cijfers').innerHTML, /m²/);
  assert.match(c.el('wc-fotos').innerHTML, /GetMap/, 'de luchtfoto-URLs moeten erin staan');
  assert.match(c.el('wc-conclusies').innerHTML, /data-soort=/);
  assert.match(c.el('wc-archieftitel').textContent, /Gooise Meren/);
  assert.deepEqual(c.log.consoleFouten, []);
});

test('client: ontbrekende bronnen leiden tot een melding, niet tot een lege pagina', async () => {
  const data = { ...nepAntwoord(), perceel: null, hoogtes: null, gemist: [{ bron: 'Kadastrale kaart' }, { bron: '3D BAG' }] };
  const c = laadClient({
    fetch: () => Promise.resolve({
      ok: true, status: 200, headers: { get: () => 'application/json' },
      text: () => Promise.resolve(JSON.stringify(data)),
    }),
  });
  c.el('wc-adres').value = '1401EX 5';
  c.el('wc-invoer').dispatch('submit');
  for (let i = 0; i < 12; i++) await tik();

  assert.equal(c.el('wc-gemist').hidden, false, 'de melding over gemiste bronnen moet zichtbaar zijn');
  assert.match(c.el('wc-gemist').textContent, /Kadastrale kaart/);
  assert.match(c.el('wc-cijfers').innerHTML, /niet bekend/, 'lege cijfers krijgen "niet bekend"');
  assert.equal(c.log.intervals.size, 0);
});

test('client: een serverfout en een netwerkfout laten de knop niet hangen', async () => {
  for (const opzet of [
    { fetch: () => Promise.resolve({ ok: false, status: 502, headers: { get: () => 'application/json' }, text: () => Promise.resolve('{"fout":"registraties niet bereikbaar"}') }), verwacht: /niet bereikbaar/ },
    { fetch: () => Promise.reject(new TypeError('Failed to fetch')), verwacht: /verbinding is mislukt/i },
  ]) {
    const c = laadClient({ fetch: opzet.fetch });
    c.el('wc-adres').value = '1401EX 5';
    c.el('wc-invoer').dispatch('submit');
    for (let i = 0; i < 12; i++) await tik();
    assert.equal(c.log.intervals.size, 0, 'timer moet stoppen');
    assert.equal(c.el('wc-zoekknop').disabled, false, 'knop moet weer bruikbaar zijn');
    assert.equal(c.el('wc-melding').hidden, false);
    assert.match(c.el('wc-melding').textContent, opzet.verwacht);
  }
});
