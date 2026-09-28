'use strict';

// Draaien:  node --test src/paginas/test/*.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const paginas = require('..');
const T = require('../teksten');
const PROJECTFASEN = require('../../../projectfasen.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const homepage = fs.readFileSync(path.join(ROOT, 'configurator.html'), 'utf8').replace(/\r\n/g, '\n');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');

const zonderTags = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
const plat = (t) => String(t).replace(/<\/?strong>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const homepageTekst = plat(zonderTags(homepage));

async function allePaginas() {
  const uit = {};
  for (const pad of paginas.PADEN) uit[pad] = await paginas.bouw(pad);
  return uit;
}

// Nepverzoek voor handle()
function verzoek(pad, methode = 'GET') {
  const res = {
    status: null, headers: null, body: null,
    writeHead(s, h) { this.status = s; this.headers = h; },
    end(b) { this.body = b; },
  };
  return { req: { method: methode, headers: {} }, res, url: new URL(pad, 'http://localhost') };
}

// ---------------------------------------------------------------------------

test('elke pagina heeft precies één h1, een titel en een beschrijving', async () => {
  const html = await allePaginas();
  for (const pad of paginas.PADEN) {
    const h = html[pad];
    assert.equal((h.match(/<h1[\s>]/g) || []).length, 1, `${pad}: aantal h1`);
    assert.match(h, /<title>[^<]{10,70}<\/title>/, `${pad}: titel van 10 tot 70 tekens`);
    const beschrijving = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    assert.ok(beschrijving.length >= 70 && beschrijving.length <= 180, `${pad}: beschrijving is ${beschrijving.length} tekens`);
    assert.ok(h.includes(`<link rel="canonical" href="${paginas.SITE_URL}${pad}">`), `${pad}: canonical`);
  }
});

test('titels en beschrijvingen zijn op elke pagina anders', async () => {
  const html = await allePaginas();
  const titels = paginas.PADEN.map((p) => html[p].match(/<title>([^<]*)<\/title>/)[1]);
  const beschrijvingen = paginas.PADEN.map((p) => html[p].match(/<meta name="description" content="([^"]*)"/)[1]);
  assert.equal(new Set(titels).size, titels.length);
  assert.equal(new Set(beschrijvingen).size, beschrijvingen.length);
});

test('koppen slaan geen niveau over', async () => {
  const html = await allePaginas();
  for (const pad of paginas.PADEN) {
    const niveaus = [...html[pad].matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
    assert.equal(niveaus[0], 1, `${pad}: begint met h1`);
    for (let i = 1; i < niveaus.length; i++) {
      assert.ok(niveaus[i] <= niveaus[i - 1] + 1, `${pad}: sprong van h${niveaus[i - 1]} naar h${niveaus[i]}`);
    }
  }
});

test('gestructureerde gegevens zijn geldige JSON', async () => {
  const html = await allePaginas();
  for (const pad of paginas.PADEN) {
    const blok = html[pad].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(blok, `${pad}: geen gegevens`);
    const soorten = JSON.parse(blok[1])['@graph'].map((g) => g['@type']);
    assert.ok(soorten.includes('WebPage') && soorten.includes('BreadcrumbList'), `${pad}: ${soorten}`);
  }
});

test('interne links wijzen naar een pagina of bestand dat bestaat', async () => {
  const html = await allePaginas();
  const bekend = new Set(['/', '/bodemcheck', '/woningcheck', '/project', ...paginas.PADEN]);
  for (const pad of paginas.PADEN) {
    const links = [...html[pad].matchAll(/(?:href|src)="(\/[^"#?]*)/g)].map((m) => m[1]);
    for (const l of links) {
      if (bekend.has(l)) continue;
      assert.ok(fs.existsSync(path.join(ROOT, l)), `${pad}: ${l} bestaat niet`);
    }
  }
});

test('elke pagina staat in de sitemap en in de voet', async () => {
  const html = await allePaginas();
  for (const pad of paginas.PADEN) {
    assert.ok(sitemap.includes(`<loc>${paginas.SITE_URL}${pad}</loc>`), `${pad} ontbreekt in sitemap.xml`);
    assert.ok(html['/contact'].includes(`href="${pad}"`), `${pad} ontbreekt in de voet`);
    assert.ok(homepage.includes(`href="${pad}"`), `${pad} ontbreekt op de homepage`);
  }
});

// De afspraak met de eigenaar: op deze pagina's staat alleen tekst die al op
// de homepage of in projectfasen.js staat. Titels, koppen en beschrijvingen
// voor zoekmachines vallen daarbuiten; die zijn apart voorgelegd.
test('teksten komen letterlijk van de homepage', () => {
  const teControleren = [
    T.DIENSTEN.aanbouw.tekst, T.DIENSTEN.uitbouw.tekst,
    ...T.PLANNEN.flatMap((p) => [...p.punten, p.extra].filter(Boolean)),
    T.BOUWWIJZE.intro, T.BOUWWIJZE.slot,
    T.BOUWWIJZE.prefab.tekst, ...T.BOUWWIJZE.prefab.plus, ...T.BOUWWIJZE.prefab.min,
    T.BOUWWIJZE.klassiek.tekst, ...T.BOUWWIJZE.klassiek.plus, ...T.BOUWWIJZE.klassiek.min,
    ...T.PROJECTEN.flatMap((p) => [p.titel, p.tekst, p.alt]),
    ...T.OVER.flatMap((b) => [b.kop, b.tekst]),
    T.PARTNER.intro, ...T.PARTNER.blokken.flatMap((b) => [b.kop, b.tekst]), ...T.PARTNER.diensten,
    T.BLOKKEN.plannen.intro, T.BLOKKEN.werk.intro, T.BLOKKEN.werk.social,
    T.BLOKKEN.contact.intro, T.BLOKKEN.contact.ctaKop, T.BLOKKEN.contact.ctaTekst,
    T.BLOKKEN.samenstellen.tekst, T.SITE.voettekst,
    T.PAGINAS.over.intro,
  ];
  const homepageAlt = plat(homepage.replace(/<[^>]*alt="([^"]*)"[^>]*>/g, ' $1 '));
  for (const tekst of teControleren) {
    const t = plat(tekst);
    assert.ok(homepageTekst.includes(t) || homepageAlt.includes(t), `staat niet op de homepage: "${t.slice(0, 70)}..."`);
  }
});

test('prijzen per m² op de pagina zijn de standaardprijzen van de homepage', async () => {
  for (const plan of T.PLANNEN) {
    const opHomepage = homepage.match(new RegExp(`${plan.prijsSleutel}:\\s*(\\d+)`));
    assert.ok(opHomepage, `${plan.prijsSleutel} niet gevonden in configurator.html`);
    assert.equal(plan.prijs, Number(opHomepage[1]), `${plan.naam}: prijs wijkt af van de homepage`);
  }
});

test('werkwijze toont alle stappen uit projectfasen.js', async () => {
  const h = await paginas.bouw('/werkwijze');
  for (const fase of PROJECTFASEN.FASEN) {
    assert.ok(h.includes(`<h2>${fase.titel.replace(/&/g, '&amp;')}</h2>`), `stap ontbreekt: ${fase.titel}`);
  }
  assert.ok(!/ziet u dat hier in een update/.test(h), 'regel die alleen op de projectpagina klopt');
});

test('bij een aanbouw vervalt het openen van de gevel', async () => {
  const aanbouw = await paginas.bouw('/aanbouw');
  const uitbouw = await paginas.bouw('/uitbouw');
  const stap = PROJECTFASEN.FASEN.find((f) => f.alleenBij === 'uitbouw');
  assert.ok(aanbouw.includes(stap.nvt), 'aanbouw: tekst dat de stap vervalt');
  assert.ok(!uitbouw.includes(stap.nvt), 'uitbouw: stap vervalt daar niet');
});

test('handle: alleen de eigen adressen, de rest gaat door', async () => {
  let v = verzoek('/aanbouw');
  assert.equal(await paginas.handle(v.req, v.res, v.url), true);
  assert.equal(v.res.status, 200);
  assert.match(v.res.headers['Content-Type'], /text\/html/);

  v = verzoek('/aanbouw/');
  assert.equal(await paginas.handle(v.req, v.res, v.url), true);
  assert.equal(v.res.status, 301);
  assert.equal(v.res.headers.Location, '/aanbouw');

  for (const pad of ['/', '/bodemcheck', '/project', '/api/prices', '/bestaat-niet', '/aanbouw/extra']) {
    v = verzoek(pad);
    assert.equal(await paginas.handle(v.req, v.res, v.url), false, pad);
  }

  v = verzoek('/aanbouw', 'POST');
  assert.equal(await paginas.handle(v.req, v.res, v.url), false);
});

test('basis.css is bijgewerkt na de laatste wijziging van de homepage', () => {
  const basis = fs.readFileSync(path.join(__dirname, '..', 'basis.css'), 'utf8').replace(/\r\n/g, '\n');
  // Steekproef: de stappen van de kop moeten in beide bestanden gelijk zijn
  const stappen = (css) => [...css.matchAll(/@media \(max-width: (\d+)px\) \{\s*\.(?:brand-tag|nav-toggle)/g)].map((m) => m[1]).join(',');
  assert.equal(stappen(basis), stappen(homepage), 'draai: node tools/maak-pagina-css.js');
});
