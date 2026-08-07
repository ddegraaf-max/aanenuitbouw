'use strict';

/**
 * ============================================================================
 *  Woningcheck — aanenuitbouw.nl
 * ============================================================================
 *
 * Adres in, en je krijgt bouwjaar, woonoppervlak, perceeloppervlak, pandmaten,
 * goot- en nokhoogte, luchtfoto's van de achterzijde en de weg naar de
 * bouwtekeningen bij de gemeente.
 *
 * Inbouwen kost één regel in server.js, naast die van de bodemcheck:
 *
 *     if (await require('./src/woningcheck').handle(req, res, url)) return;
 *
 * Geen framework, geen dependencies, alleen ingebouwde Node-modules.
 *
 * Alle bronnen zijn open data zonder sleutel:
 *   PDOK Locatieserver   adres -> coördinaten, gemeente, BAG-identificaties
 *   BAG via PDOK         oppervlakte, bouwjaar, pandcontour
 *   BRK Kadastrale kaart perceeloppervlakte en -grens (CC-BY Kadaster NL)
 *   3D BAG (TU Delft)    goot- en nokhoogte, bouwlagen
 *   PDOK luchtfoto       beeld van bovenaf, 8 cm per pixel
 *
 * Elke bron is los optioneel: valt er één weg, dan verschijnt de rest met een
 * nette melding erbij. Dat is met opzet, want vijf bronnen die allemaal moeten
 * werken is vijf keer zo veel kans op een lege pagina.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pdok = require('./services/pdok');
const bag = require('./services/bag');
const brk = require('./services/brk');
const bag3d = require('./services/bag3d');
const luchtfoto = require('./services/luchtfoto');
const { archiefVoor } = require('./services/gemeentearchief');
const { bouwConclusies, samenvattingVoorMail } = require('./services/interpret');
const mock = require('./services/mock');

const ASSETS_DIR = path.join(__dirname, 'assets');
const PAGINA_BESTAND = path.join(__dirname, 'pagina.html');
const MOCK = process.env.WONINGCHECK_MOCK === '1';
const BUDGET_MS = Number(process.env.WONINGCHECK_BUDGET_MS || 15000);

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// ---------------------------------------------------------------------------
// Versiestempel op de asset-URL's
// ---------------------------------------------------------------------------
// Zonder dit blijft een browser tot een week de oude stylesheet en JS gebruiken
// na een deploy. Dat heeft bij de bodemcheck een avond gekost.

const ASSET_VERSIE = (() => {
  try {
    const h = crypto.createHash('sha1');
    for (const bestand of ['assets/woningcheck.css', 'assets/woningcheck.js', 'pagina.html']) {
      h.update(fs.readFileSync(path.join(__dirname, bestand)));
    }
    return h.digest('hex').slice(0, 10);
  } catch {
    return String(Date.now());
  }
})();

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const instellingen = {
  pad: '/woningcheck',
  titel: 'Woningcheck: wat is er van uw woning bekend voor een aanbouw?',
  beschrijving:
    'Vul uw adres in en zie bouwjaar, woonoppervlak, perceeloppervlak, pandmaten en hoogtes uit de openbare registraties, plus waar u de bouwtekeningen opvraagt.',
  terugLink: '/',
  kop: null,
  voet: null,
};

function configureer(nieuw = {}) {
  Object.assign(instellingen, nieuw);
  if (typeof instellingen.pad === 'string') {
    instellingen.pad = '/' + instellingen.pad.replace(/^\/+|\/+$/g, '');
  }
  return module.exports;
}

// ---------------------------------------------------------------------------
// Antwoord-helpers
// ---------------------------------------------------------------------------

function stuurJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function stuurHtml(res, html, alleenKoppen) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(alleenKoppen ? undefined : html);
}

function leesJsonBody(req, maxBytes = 8000) {
  return new Promise((klaar, mislukt) => {
    let body = '';
    let gestopt = false;
    req.on('data', (stuk) => {
      if (gestopt) return;
      body += stuk;
      if (body.length > maxBytes) {
        gestopt = true;
        mislukt(new Error('Body te groot'));
      }
    });
    req.on('end', () => {
      if (gestopt) return;
      try {
        klaar(body ? JSON.parse(body) : {});
      } catch {
        mislukt(new Error('Ongeldige JSON'));
      }
    });
    req.on('error', mislukt);
  });
}

/** Niet uit x-forwarded-for: die is door de bezoeker zelf te zetten. */
function ipVan(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return (req.socket && req.socket.remoteAddress) || 'onbekend';
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const emmers = new Map();
const opruimer = setInterval(() => {
  const grens = Date.now() - 1000 * 60 * 60;
  for (const [ip, tijden] of emmers) {
    const over = tijden.filter((t) => t > grens);
    if (over.length === 0) emmers.delete(ip);
    else emmers.set(ip, over);
  }
}, 1000 * 60 * 5);
opruimer.unref();

function limietBereikt(req, perMinuut = 25, perUur = 150) {
  const ip = ipVan(req);
  const nu = Date.now();
  const tijden = (emmers.get(ip) || []).filter((t) => t > nu - 1000 * 60 * 60);
  if (tijden.filter((t) => t > nu - 1000 * 60).length >= perMinuut || tijden.length >= perUur) return true;
  tijden.push(nu);
  emmers.set(ip, tijden);
  return false;
}

// ---------------------------------------------------------------------------
// Diagnostiek, achter een sleutel
// ---------------------------------------------------------------------------

const DIAGNOSE_SLEUTEL = (() => {
  const uitOmgeving = process.env.SONDEER_SLEUTEL || process.env.WONINGCHECK_SLEUTEL;
  if (uitOmgeving && uitOmgeving.length >= 8) return uitOmgeving;
  const nieuw = crypto.randomBytes(12).toString('hex');
  console.log(`[woningcheck] diagnosesleutel voor deze deploy: ${nieuw}`);
  return nieuw;
})();

function sleutelKlopt(req, url) {
  const gegeven = (url && url.searchParams.get('sleutel')) || req.headers['x-sondeer-sleutel'] || '';
  if (typeof gegeven !== 'string' || gegeven.length !== DIAGNOSE_SLEUTEL.length) return false;
  let verschil = 0;
  for (let i = 0; i < gegeven.length; i++) verschil |= gegeven.charCodeAt(i) ^ DIAGNOSE_SLEUTEL.charCodeAt(i);
  return verschil === 0;
}

function weiger(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Niet gevonden');
}

// Laatste meldingen uit browsers, alleen in het geheugen.
const KLANTLOG_MAX = 40;
const klantlog = [];

// ---------------------------------------------------------------------------
// Pagina
// ---------------------------------------------------------------------------

function ontsnap(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let templateCache = null;
function template() {
  if (templateCache && process.env.NODE_ENV === 'production') return templateCache;
  templateCache = fs.readFileSync(PAGINA_BESTAND, 'utf8');
  return templateCache;
}

const MOCKBALK = `<div class="wc-mockbalk" role="status">
  <strong>Testmodus</strong> &mdash; WONINGCHECK_MOCK=1 staat aan. De gegevens op deze
  pagina zijn <em>fictief</em>.
</div>`;

function bouwPagina(req, vooringevuld) {
  const pad = instellingen.pad;
  const host = String(req.headers.host || '').replace(/[^a-z0-9.:-]/gi, '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const canonical = host ? `${protocol}://${host}${pad}` : null;

  const terugbalk = instellingen.terugLink
    ? `<div class="wc-terugbalk"><a href="${ontsnap(instellingen.terugLink)}">&larr; Terug naar de website</a></div>`
    : '';

  const vervang = {
    TITEL: ontsnap(instellingen.titel),
    BESCHRIJVING: ontsnap(instellingen.beschrijving),
    CANONICAL: canonical ? `<link rel="canonical" href="${ontsnap(canonical)}">` : '',
    ASSETS: `${pad}/assets`,
    VERSIE: ASSET_VERSIE,
    BASISPAD: pad,
    VOORINGEVULD: ontsnap(vooringevuld),
    MOCKBALK: MOCK ? MOCKBALK : '',
    KOP: instellingen.kop || terugbalk,
    VOET: instellingen.voet || '',
  };

  return template().replace(/\{\{(\w+)\}\}/g, (heel, naam) =>
    Object.prototype.hasOwnProperty.call(vervang, naam) ? vervang[naam] : heel,
  );
}

function stuurAsset(res, restPad, alleenKoppen) {
  const bestand = path.join(ASSETS_DIR, path.basename(restPad));
  if (!bestand.startsWith(ASSETS_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.stat(bestand, (fout, stat) => {
    if (fout || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Niet gevonden');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(bestand).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=604800' : 'no-cache',
    });
    if (alleenKoppen) {
      res.end();
      return;
    }
    fs.createReadStream(bestand).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// De analyse
// ---------------------------------------------------------------------------

async function doeAnalyse(req, res, params) {
  const start = Date.now();
  const deadline = start + BUDGET_MS;
  const resterend = () => deadline - Date.now();
  const tijden = {};
  const gemist = [];

  try {
    // 1. Adres
    let adres;
    const t0 = Date.now();
    if (MOCK) {
      adres = mock.adres(params.get('q') || 'mock');
    } else if (params.get('id')) {
      adres = await pdok.detail(params.get('id'));
    } else if (params.get('q')) {
      adres = await pdok.beste(params.get('q'));
    } else {
      return stuurJson(res, 400, { fout: 'Geef een adres (q) of een adres-id (id) mee.' });
    }
    tijden.adres = Date.now() - t0;

    if (!Number.isFinite(adres.rdX)) {
      return stuurJson(res, 422, {
        fout: 'Voor dit adres zijn geen coördinaten bekend. Probeer een postcode met huisnummer.',
      });
    }

    const archief = archiefVoor(adres.gemeente);

    // 2. BAG en BRK parallel: los van elkaar, dus één storing sloopt niet alles
    const t1 = Date.now();
    const tijdVoorBronnen = Math.max(3000, resterend() - 4000);
    const [woningUit, perceelUit] = await Promise.allSettled([
      MOCK ? Promise.resolve(mock.woning(adres)) : bag.haalWoning(adres, { timeoutMs: tijdVoorBronnen }),
      MOCK ? Promise.resolve(mock.perceel(adres)) : brk.haalPerceel(adres, { timeoutMs: tijdVoorBronnen }),
    ]);
    tijden.bagEnBrk = Date.now() - t1;

    const woning = woningUit.status === 'fulfilled' ? woningUit.value : null;
    const perceel = perceelUit.status === 'fulfilled' ? perceelUit.value : null;
    if (!woning) gemist.push({ bron: 'BAG', reden: woningUit.reason && woningUit.reason.message });
    if (!perceel) gemist.push({ bron: 'Kadastrale kaart', reden: perceelUit.reason && perceelUit.reason.message });

    // 3. Hoogtes, alleen als we een pand-id hebben en er tijd over is
    let hoogtes = null;
    const pandId = (woning && woning.pandId) || (adres.pandIds && adres.pandIds[0]) || null;
    if (pandId && resterend() > 2500) {
      const t2 = Date.now();
      try {
        hoogtes = MOCK ? mock.hoogtes(pandId) : await bag3d.haalHoogtes(pandId, { timeoutMs: Math.max(2000, resterend() - 1200) });
        if (!hoogtes) gemist.push({ bron: '3D BAG', reden: 'pand niet in 3D BAG gevonden' });
      } catch (fout) {
        gemist.push({ bron: '3D BAG', reden: fout.message });
      }
      tijden.hoogtes = Date.now() - t2;
    } else if (!pandId) {
      gemist.push({ bron: '3D BAG', reden: 'geen pandidentificatie beschikbaar' });
    }

    const antwoord = {
      adres: {
        omschrijving: adres.omschrijving,
        postcode: adres.postcode,
        straat: adres.straat,
        huisnummer: adres.huisnummer,
        plaats: adres.plaats,
        gemeente: adres.gemeente,
        lat: adres.lat,
        lon: adres.lon,
      },
      woning: woning && {
        bouwjaar: woning.bouwjaar,
        woonoppervlak: woning.woonoppervlak,
        grondoppervlak: woning.grondoppervlak,
        afmetingen: woning.afmetingen,
        gebruiksdoel: woning.gebruiksdoel,
        pandId: woning.pandId,
      },
      perceel: perceel && {
        oppervlakte: perceel.oppervlakte,
        aanduiding: brk.aanduidingVan(perceel),
        bron: perceel.bron,
      },
      hoogtes: hoogtes && {
        goothoogte: hoogtes.goothoogte,
        nokhoogte: hoogtes.nokhoogte,
        bouwlagen: hoogtes.bouwlagen,
        daktype: hoogtes.daktype,
      },
      luchtfotos: luchtfoto.uitsnedes(adres.rdX, adres.rdY),
      archief,
      conclusies: bouwConclusies({ adres, woning, perceel, hoogtes, archief }),
      voorDeMail: samenvattingVoorMail({ adres, woning, perceel, hoogtes }),
      gemist,
      bronnen: [
        'Basisregistratie Adressen en Gebouwen (BAG), Kadaster — via PDOK',
        'Kadastrale kaart (BRK), CC-BY Kadaster NL — via PDOK',
        '3D BAG, 3D Geoinformation, TU Delft',
        'Luchtfoto Nederland — via PDOK',
      ],
      mockdata: MOCK,
      duurMs: Date.now() - start,
      tijden,
    };

    stuurJson(res, 200, antwoord);
  } catch (fout) {
    console.error('[woningcheck] analyse mislukt:', fout.message);
    stuurJson(res, fout.statusCode || 502, {
      fout:
        fout.statusCode === 400 || fout.statusCode === 404
          ? fout.message
          : 'De openbare registraties zijn nu niet bereikbaar. Probeer het over een paar minuten opnieuw.',
      detail: process.env.NODE_ENV === 'production' ? undefined : fout.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Diagnose: elke bron los, met tijd en het begin van het ruwe antwoord
// ---------------------------------------------------------------------------

async function doeDiagnose(req, res, params) {
  const vraag = params.get('q') || '1401EX 5';
  const stappen = [];

  const stap = async (naam, fn) => {
    const t0 = Date.now();
    try {
      const uit = await fn();
      stappen.push({ stap: naam, ok: true, ms: Date.now() - t0, ...uit });
      return uit;
    } catch (fout) {
      stappen.push({
        stap: naam,
        ok: false,
        ms: Date.now() - t0,
        fout: fout.name === 'AbortError' ? 'timeout (afgebroken)' : fout.message,
      });
      return null;
    }
  };

  const adresUit = await stap('1. PDOK adres', async () => {
    const a = await pdok.beste(vraag);
    return {
      gevonden: a.omschrijving,
      gemeente: a.gemeente,
      rd: [a.rdX, a.rdY],
      verblijfsobjectId: a.verblijfsobjectId,
      pandIds: a.pandIds,
    };
  });

  let adres = null;
  if (adresUit) {
    try {
      adres = await pdok.beste(vraag);
    } catch { /* al gemeld */ }
  }

  let woning = null;
  if (adres) {
    woning = await stap('2. BAG verblijfsobject en pand', async () => {
      const w = await bag.haalWoning(adres);
      return {
        bouwjaar: w.bouwjaar,
        woonoppervlak: w.woonoppervlak,
        grondoppervlak: w.grondoppervlak,
        pandId: w.pandId,
        veldenVerblijfsobject: Object.keys(w._ruw.verblijfsobject || {}).slice(0, 30),
        veldenPand: Object.keys(w._ruw.pand || {}).slice(0, 30),
      };
    });

    await stap('3. BRK perceel', async () => {
      const p = await brk.haalPerceel(adres);
      if (!p) return { gevonden: false };
      return { gevonden: true, oppervlakte: p.oppervlakte, aanduiding: brk.aanduidingVan(p), velden: Object.keys(p._ruw || {}).slice(0, 30) };
    });

    const pandId = (woning && woning.pandId) || (adres.pandIds && adres.pandIds[0]);
    if (pandId) {
      await stap(`4. 3D BAG (${pandId})`, async () => {
        const h = await bag3d.haalHoogtes(pandId);
        if (!h) return { gevonden: false };
        return { gevonden: true, goothoogte: h.goothoogte, nokhoogte: h.nokhoogte, bouwlagen: h.bouwlagen, velden: Object.keys(h._ruw || {}).slice(0, 40) };
      });
    } else {
      stappen.push({ stap: '4. 3D BAG', ok: false, fout: 'geen pandidentificatie uit stap 1 of 2' });
    }

    stappen.push({
      stap: '5. Luchtfoto-URL (browser haalt deze zelf op)',
      ok: true,
      urls: luchtfoto.uitsnedes(adres.rdX, adres.rdY).map((u) => u.url),
    });
  }

  stuurJson(res, 200, {
    tijdstip: new Date().toISOString(),
    node: process.version,
    mockdata: MOCK,
    assetVersie: ASSET_VERSIE,
    budgetMs: BUDGET_MS,
    testvraag: vraag,
    bronnen: { pdok: pdok.BASIS, bag: bag.BASIS, brk: brk.BASIS, bag3d: bag3d.BASIS, luchtfoto: luchtfoto.WMS },
    stappen,
  });
}

// ---------------------------------------------------------------------------
// De enige functie die server.js aanroept
// ---------------------------------------------------------------------------

async function handle(req, res, url) {
  let u = url;
  if (!u || typeof u.pathname !== 'string') {
    try {
      u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      return false;
    }
  }

  const pad = instellingen.pad;
  if (u.pathname !== pad && !u.pathname.startsWith(pad + '/')) return false;

  const rest = u.pathname.slice(pad.length) || '/';
  const methode = req.method || 'GET';
  const isLezen = methode === 'GET' || methode === 'HEAD';
  const alleenKoppen = methode === 'HEAD';

  try {
    if ((rest === '/' || rest === '') && isLezen) {
      const q = u.searchParams.get('q');
      stuurHtml(res, bouwPagina(req, q ? String(q).slice(0, 120) : ''), alleenKoppen);
      return true;
    }

    if (rest.startsWith('/assets/') && isLezen) {
      stuurAsset(res, rest, alleenKoppen);
      return true;
    }

    if (rest === '/api/klantlog' && methode === 'POST') {
      if (limietBereikt(req)) {
        res.writeHead(429, { 'Cache-Control': 'no-store' });
        res.end();
        return true;
      }
      try {
        const body = await leesJsonBody(req);
        klantlog.push({
          tijd: new Date().toISOString(),
          ip: ipVan(req),
          userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
          fase: String(body.fase || '').slice(0, 40),
          status: body.status ?? null,
          ms: Number.isFinite(Number(body.ms)) ? Number(body.ms) : null,
          details: typeof body.details === 'string' ? body.details.slice(0, 600) : null,
        });
        while (klantlog.length > KLANTLOG_MAX) klantlog.shift();
      } catch { /* een mislukte melding mag nooit een fout worden */ }
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }

    if (rest === '/api/klantlog' && isLezen) {
      if (!sleutelKlopt(req, u)) return weiger(res), true;
      stuurJson(res, 200, { aantal: klantlog.length, meldingen: [...klantlog].reverse() });
      return true;
    }

    if (rest.startsWith('/api/')) {
      if (limietBereikt(req)) {
        stuurJson(res, 429, { fout: 'Te veel opvragingen achter elkaar. Wacht een minuut.' });
        return true;
      }

      if (rest === '/api/adres' && isLezen) {
        try {
          const treffers = MOCK
            ? [mock.adres(u.searchParams.get('q') || '')]
            : await pdok.zoekAdres(u.searchParams.get('q'), { rows: 6 });
          stuurJson(res, 200, { resultaten: treffers });
        } catch (fout) {
          stuurJson(res, fout.statusCode || 502, { fout: fout.message });
        }
        return true;
      }

      // Alleen de gemeente en het bouwarchief. Gebruikt door stap 8 van de
      // configurator: daar is een volledige woningcheck niet nodig.
      if (rest === '/api/gemeente' && isLezen) {
        try {
          const a = MOCK ? mock.adres(u.searchParams.get('q') || '') : await pdok.beste(u.searchParams.get('q'));
          stuurJson(res, 200, {
            adres: a.omschrijving,
            gemeente: a.gemeente,
            archief: archiefVoor(a.gemeente),
          });
        } catch (fout) {
          stuurJson(res, fout.statusCode || 502, { fout: fout.message });
        }
        return true;
      }

      if (rest === '/api/analyse' && isLezen) {
        await doeAnalyse(req, res, u.searchParams);
        return true;
      }

      if (rest === '/api/diagnose' && isLezen) {
        if (!sleutelKlopt(req, u)) return weiger(res), true;
        await doeDiagnose(req, res, u.searchParams);
        return true;
      }

      stuurJson(res, 404, { fout: 'Onbekend endpoint' });
      return true;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Niet gevonden');
    return true;
  } catch (fout) {
    // Nooit laten ontsnappen: een onbehandelde fout in een async handler haalt
    // het hele Node-proces neer, en daarmee de hele site.
    console.error('[woningcheck] onverwachte fout:', fout && fout.stack ? fout.stack : fout);
    if (!res.headersSent) stuurJson(res, 500, { fout: 'Er ging iets mis in de woningcheck.' });
    else {
      try { res.end(); } catch { /* verbinding al weg */ }
    }
    return true;
  }
}

module.exports = { handle, configureer, instellingen, ASSET_VERSIE };
