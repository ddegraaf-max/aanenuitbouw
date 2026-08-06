'use strict';

/**
 * ============================================================================
 *  Bodemcheck / sondeertool — aanenuitbouw.nl
 * ============================================================================
 *
 * Deze module gebruikt GEEN framework. Geen express, geen dependencies, alleen
 * ingebouwde Node-modules — precies zoals je eigen server.js, die met
 * http.createServer en een eigen router werkt.
 *
 * Inbouwen kost één regel in server.js, direct BOVEN de laatste regel van je
 * request-handler:
 *
 *     if (await require('./src/sondeertool').handle(req, res, url)) return;
 *     serveStatic(req, res, pathname);        // <-- die stond er al
 *
 * `handle` geeft true terug als het verzoek voor de bodemcheck was en al is
 * afgehandeld, en false als het er niets mee te maken had. In dat laatste geval
 * loopt je eigen serveStatic gewoon door. De module kan dus niets van je
 * bestaande routes onderscheppen.
 *
 * Verder is er niets te configureren:
 *   - de canonical-URL wordt uit de Host-header opgebouwd
 *   - e-mail loopt via RESEND_API_KEY, QUOTE_FROM en QUOTE_TO, die je al hebt
 *   - de stylesheet en client-JS worden hier zelf uitgeleverd
 *
 * Wil je toch iets aanpassen, dan kan dat eenmalig bij het opstarten:
 *
 *     require('./src/sondeertool').configureer({
 *       pad: '/bodemcheck',
 *       terugLink: 'https://aanenuitbouw.nl/',
 *       kop: '<nav>...</nav>',
 *       voet: '<footer>...</footer>',
 *       onLead: async (aanvraag) => { ... },   // vervangt de standaard e-mail
 *     });
 */

const fs = require('fs');
const path = require('path');

const geocode = require('./services/geocode');
const bro = require('./services/broClient');
const { interpreteerSondering, bouwSamenvatting, GRONDSOORTEN } = require('./services/interpret');

const ASSETS_DIR = path.join(__dirname, 'assets');
const PAGINA_BESTAND = path.join(__dirname, 'pagina.html');
const MAX_DETAILS = Number(process.env.SONDEER_MAX_DETAILS || 3);
const STRALEN_KM = [0.5, 1, 2, 5];

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const instellingen = {
  pad: '/bodemcheck',
  titel: 'Bodemcheck: hoe diep zit de draagkrachtige laag onder uw aanbouw?',
  beschrijving:
    'Bekijk gratis welke grondlagen onder uw perceel zitten en op welke diepte de draagkrachtige zandlaag begint. Op basis van echte sonderingen uit de Basisregistratie Ondergrond.',
  terugLink: '/',
  kop: null,
  voet: null,
  onLead: null,
  pool: null,
};

function configureer(nieuw = {}) {
  Object.assign(instellingen, nieuw);
  if (typeof instellingen.pad === 'string') {
    instellingen.pad = '/' + instellingen.pad.replace(/^\/+|\/+$/g, '');
  }
  return module.exports;
}

// ---------------------------------------------------------------------------
// Antwoord-helpers, in dezelfde stijl als je eigen server.js
// ---------------------------------------------------------------------------

function stuurJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(payload));
}

function stuurHtml(res, html) {
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

function leesJsonBody(req, maxBytes = 32000) {
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

function ipVan(req) {
  return (
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'onbekend'
  );
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// Deze tool roept achter de schermen een overheidsdienst aan. Zonder limiet kan
// iemand met een scriptje jouw server als scrape-proxy naar de BRO gebruiken,
// en word jij eruit gegooid.

const emmers = new Map();
const PER_MINUUT = 20;
const PER_UUR = 120;

const opruimer = setInterval(() => {
  const grens = Date.now() - 1000 * 60 * 60;
  for (const [ip, tijden] of emmers) {
    const over = tijden.filter((t) => t > grens);
    if (over.length === 0) emmers.delete(ip);
    else emmers.set(ip, over);
  }
}, 1000 * 60 * 5);
opruimer.unref();

function limietBereikt(req) {
  const ip = ipVan(req);
  const nu = Date.now();
  const tijden = (emmers.get(ip) || []).filter((t) => t > nu - 1000 * 60 * 60);
  if (tijden.filter((t) => t > nu - 1000 * 60).length >= PER_MINUUT || tijden.length >= PER_UUR) {
    return true;
  }
  tijden.push(nu);
  emmers.set(ip, tijden);
  return false;
}

// ---------------------------------------------------------------------------
// Pagina opbouwen
// ---------------------------------------------------------------------------

function ontsnap(tekst) {
  return String(tekst == null ? '' : tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let templateCache = null;

function template() {
  if (templateCache && process.env.NODE_ENV === 'production') return templateCache;
  templateCache = fs.readFileSync(PAGINA_BESTAND, 'utf8');
  return templateCache;
}

function kleurstrip() {
  return Object.entries(GRONDSOORTEN)
    .filter(([sleutel]) => sleutel !== 'onbekend')
    .map(([, soort]) => `<span style="background: ${soort.kleur}" title="${ontsnap(soort.label)}"></span>`)
    .join('');
}

const MOCKBALK = `<div class="sd-mockbalk" role="status">
  <strong>Testmodus</strong> &mdash; BRO_MOCK=1 staat aan. De sonderingen op deze pagina zijn
  <em>fictief</em> en alleen bedoeld om de werking te controleren.
</div>`;

function bouwPagina(req, vooringevuld) {
  const pad = instellingen.pad;

  // De canonical-URL uit de Host-header halen: dan klopt hij op elk domein en
  // hoeft er niets ingesteld te worden.
  const host = String(req.headers.host || '').replace(/[^a-z0-9.:-]/gi, '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const canonical = host ? `${protocol}://${host}${pad}` : null;

  const terugbalk = instellingen.terugLink
    ? `<div class="sd-terugbalk"><a href="${ontsnap(instellingen.terugLink)}">&larr; Terug naar de website</a></div>`
    : '';

  const vervang = {
    TITEL: ontsnap(instellingen.titel),
    BESCHRIJVING: ontsnap(instellingen.beschrijving),
    CANONICAL: canonical ? `<link rel="canonical" href="${ontsnap(canonical)}">` : '',
    ASSETS: `${pad}/assets`,
    BASISPAD: pad,
    VOORINGEVULD: ontsnap(vooringevuld),
    MOCKBALK: bro.MOCK ? MOCKBALK : '',
    KLEURSTRIP: kleurstrip(),
    KOP: instellingen.kop || terugbalk,
    VOET: instellingen.voet || '',
  };

  return template().replace(/\{\{(\w+)\}\}/g, (heel, naam) =>
    Object.prototype.hasOwnProperty.call(vervang, naam) ? vervang[naam] : heel,
  );
}

// ---------------------------------------------------------------------------
// Assets uitleveren
// ---------------------------------------------------------------------------

function stuurAsset(res, restPad) {
  // Alleen de bestandsnaam gebruiken: daarmee is ../-trucwerk uitgesloten.
  const naam = path.basename(restPad);
  const bestand = path.join(ASSETS_DIR, naam);

  if (!bestand.startsWith(ASSETS_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(bestand, (fout, stat) => {
    if (fout || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Niet gevonden');
      return;
    }
    const ext = path.extname(bestand).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=604800' : 'no-cache',
    });
    fs.createReadStream(bestand).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Standaard e-mail bij een aanvraag
// ---------------------------------------------------------------------------

async function standaardMail(aanvraag) {
  const sleutel = process.env.RESEND_API_KEY;
  if (!sleutel) return false;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.QUOTE_FROM || 'AanEnUitbouw.nl <onboarding@resend.dev>',
      to: [process.env.QUOTE_TO || 'project@aanenuitbouw.nl'],
      reply_to: aanvraag.email,
      subject: `Sondering aangevraagd — ${aanvraag.adres}`,
      text: [
        'Aanvraag via de bodemcheck op aanenuitbouw.nl',
        '',
        `Naam:        ${aanvraag.naam}`,
        `E-mail:      ${aanvraag.email}`,
        `Telefoon:    ${aanvraag.telefoon || '-'}`,
        `Adres:       ${aanvraag.adres}`,
        `Toelichting: ${aanvraag.toelichting || '-'}`,
        '',
        `Bekeken sondering: ${aanvraag.broId || '-'}`,
        `Coordinaten:       ${aanvraag.lat || '-'}, ${aanvraag.lon || '-'}`,
      ].join('\n'),
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Route-onderdelen
// ---------------------------------------------------------------------------

function schoonRadius(waarde) {
  const n = Number.parseFloat(waarde);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, 0.1), 5);
}

async function doeAdres(req, res, params) {
  try {
    stuurJson(res, 200, { resultaten: await geocode.zoekAdres(params.get('q'), { rows: 6 }) });
  } catch (fout) {
    stuurJson(res, fout.statusCode || 502, { fout: fout.message });
  }
}

async function doeAnalyse(req, res, params) {
  const start = Date.now();
  try {
    let locatie;
    const lat = Number.parseFloat(params.get('lat'));
    const lon = Number.parseFloat(params.get('lon'));

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const label = params.get('label');
      locatie = {
        lat,
        lon,
        omschrijving: label ? String(label).slice(0, 160) : `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        soort: 'punt',
      };
    } else if (params.get('q')) {
      locatie = await geocode.beste(params.get('q'));
    } else {
      return stuurJson(res, 400, { fout: 'Geef een adres (q) of coordinaten (lat/lon) mee.' });
    }

    // Zoekstraal oprekken tot er genoeg materiaal is.
    const vast = schoonRadius(params.get('radius'));
    const stralen = vast ? [vast] : STRALEN_KM;
    let kengegevens = [];
    let gebruikteStraal = stralen[0];

    for (const straal of stralen) {
      gebruikteStraal = straal;
      kengegevens = await bro.zoekSonderingen(locatie.lat, locatie.lon, straal);
      if (kengegevens.length >= 3) break;
    }

    // Voorkeur voor sonderingen die diep genoeg gaan om iets over de vaste laag
    // te kunnen zeggen; daarna op afstand.
    const kandidaten = [...kengegevens]
      .sort((a, b) => {
        const diepA = (a.einddiepte || 0) >= 8 ? 0 : 1;
        const diepB = (b.einddiepte || 0) >= 8 ? 0 : 1;
        return diepA !== diepB ? diepA - diepB : a.afstandM - b.afstandM;
      })
      .slice(0, MAX_DETAILS);

    const opgehaald = await Promise.allSettled(kandidaten.map((k) => bro.haalSondering(k.broId)));

    const sonderingen = [];
    const mislukt = [];

    opgehaald.forEach((uitkomst, i) => {
      const kengegeven = kandidaten[i];
      if (uitkomst.status !== 'fulfilled') {
        mislukt.push({ broId: kengegeven.broId, reden: uitkomst.reason.message });
        return;
      }
      try {
        const geinterpreteerd = interpreteerSondering(uitkomst.value);
        sonderingen.push({
          ...geinterpreteerd,
          afstandM: kengegeven.afstandM,
          windstreek: kengegeven.windstreek,
          richtingGraden: kengegeven.richtingGraden,
          coordinaten: geinterpreteerd.locatie || kengegeven.coordinaten,
        });
      } catch (fout) {
        mislukt.push({ broId: kengegeven.broId, reden: fout.message });
      }
    });

    sonderingen.sort((a, b) => a.afstandM - b.afstandM);

    const antwoord = {
      locatie: {
        omschrijving: locatie.omschrijving,
        soort: locatie.soort,
        lat: locatie.lat,
        lon: locatie.lon,
      },
      zoekstraalKm: gebruikteStraal,
      aantalGevonden: kengegevens.length,
      aantalGeanalyseerd: sonderingen.length,
      alleLocaties: kengegevens.slice(0, 40).map((k) => ({
        broId: k.broId,
        lat: k.coordinaten.lat,
        lon: k.coordinaten.lon,
        afstandM: k.afstandM,
        einddiepte: k.einddiepte,
        datum: k.datum,
        geanalyseerd: sonderingen.some((s) => s.broId === k.broId),
      })),
      sonderingen,
      samenvatting: bouwSamenvatting(sonderingen, {
        omschrijving: locatie.omschrijving,
        lat: locatie.lat,
        lon: locatie.lon,
        zoekstraalKm: gebruikteStraal,
      }),
      mislukt,
      bron: {
        naam: 'Basisregistratie Ondergrond (BRO)',
        houder: 'Ministerie van Binnenlandse Zaken en Koninkrijksrelaties / TNO Geologische Dienst Nederland',
        url: 'https://basisregistratieondergrond.nl',
        service: bro.BASIS,
        mockdata: bro.MOCK,
      },
      duurMs: Date.now() - start,
    };

    await logOpvraging(req, antwoord).catch(() => {});
    stuurJson(res, 200, antwoord);
  } catch (fout) {
    console.error('[sondeertool] analyse mislukt:', fout.message);
    stuurJson(res, fout.statusCode || 502, {
      fout:
        fout.statusCode === 404 || fout.statusCode === 400
          ? fout.message
          : 'De Basisregistratie Ondergrond is momenteel niet bereikbaar. Probeer het over een paar minuten opnieuw.',
      detail: process.env.NODE_ENV === 'production' ? undefined : fout.message,
    });
  }
}

async function doeSondering(req, res, broId) {
  try {
    stuurJson(res, 200, interpreteerSondering(await bro.haalSondering(broId)));
  } catch (fout) {
    stuurJson(res, 502, { fout: fout.message });
  }
}

async function doeAanvraag(req, res) {
  let body;
  try {
    body = await leesJsonBody(req);
  } catch (fout) {
    return stuurJson(res, 400, { fout: fout.message });
  }

  const { naam, email, telefoon, adres, toelichting, lat, lon, broId } = body || {};

  if (!naam || !email || !adres) {
    return stuurJson(res, 400, { fout: 'Naam, e-mailadres en adres zijn verplicht.' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(email))) {
    return stuurJson(res, 400, { fout: 'Vul een geldig e-mailadres in.' });
  }

  const eenRegel = (v, max) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim().slice(0, max);

  const aanvraag = {
    naam: eenRegel(naam, 120),
    email: eenRegel(email, 160),
    telefoon: telefoon ? eenRegel(telefoon, 40) : null,
    adres: eenRegel(adres, 200),
    toelichting: toelichting ? String(toelichting).slice(0, 2000) : null,
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lon: Number.isFinite(Number(lon)) ? Number(lon) : null,
    broId: broId ? eenRegel(broId, 40) : null,
    ip: ipVan(req),
  };

  try {
    if (instellingen.pool) {
      await instellingen.pool.query(
        `insert into sondeer_aanvraag
           (naam, email, telefoon, adres, toelichting, lat, lon, bro_id, ip)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [aanvraag.naam, aanvraag.email, aanvraag.telefoon, aanvraag.adres, aanvraag.toelichting,
          aanvraag.lat, aanvraag.lon, aanvraag.broId, aanvraag.ip],
      );
    }

    const verstuurd =
      typeof instellingen.onLead === 'function'
        ? await instellingen.onLead(aanvraag)
        : await standaardMail(aanvraag);

    // Een aanvraag mag nooit stil verdwijnen: is er geen mail verstuurd, dan
    // staat hij in ieder geval in de log.
    if (verstuurd === false) {
      console.log('[sondeertool] aanvraag (geen e-mail verstuurd):', JSON.stringify(aanvraag));
    }

    stuurJson(res, 200, { ok: true, bericht: 'Bedankt, we nemen binnen een werkdag contact met u op.' });
  } catch (fout) {
    console.error('[sondeertool] aanvraag verwerken mislukt:', fout.message);
    console.log('[sondeertool] aanvraag die niet verstuurd kon worden:', JSON.stringify(aanvraag));
    stuurJson(res, 500, { fout: 'Het versturen is niet gelukt. Bel ons of probeer het later opnieuw.' });
  }
}

async function logOpvraging(req, antwoord) {
  if (!instellingen.pool) return;
  await instellingen.pool.query(
    `insert into sondeer_opvraging
       (zoekterm, lat, lon, straal_km, aantal_gevonden, aantal_geanalyseerd, duur_ms, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      antwoord.locatie.omschrijving,
      antwoord.locatie.lat,
      antwoord.locatie.lon,
      antwoord.zoekstraalKm,
      antwoord.aantalGevonden,
      antwoord.aantalGeanalyseerd,
      antwoord.duurMs,
      ipVan(req),
      String(req.headers['user-agent'] || '').slice(0, 300),
    ],
  );
}

// ---------------------------------------------------------------------------
// De enige functie die je server.js aanroept
// ---------------------------------------------------------------------------

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} [url] de URL die je server al heeft opgebouwd; anders bouwt
 *                    deze functie hem zelf
 * @returns {Promise<boolean>} true = afgehandeld, false = niet van mij
 */
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
  const pathname = u.pathname;

  // Hoort dit verzoek bij ons? Zo niet: direct false, dan gaat je eigen routing
  // gewoon verder alsof deze module niet bestaat.
  if (pathname !== pad && !pathname.startsWith(pad + '/')) return false;

  const rest = pathname.slice(pad.length) || '/';
  const methode = req.method || 'GET';

  try {
    // De pagina zelf
    if ((rest === '/' || rest === '') && methode === 'GET') {
      const q = u.searchParams.get('q');
      stuurHtml(res, bouwPagina(req, q ? String(q).slice(0, 120) : ''));
      return true;
    }

    // Stylesheet en client-JS
    if (rest.startsWith('/assets/') && methode === 'GET') {
      stuurAsset(res, rest);
      return true;
    }

    // API
    if (rest.startsWith('/api/')) {
      if (limietBereikt(req)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
        res.end(JSON.stringify({ fout: 'Te veel opvragingen achter elkaar. Wacht een minuut en probeer het opnieuw.' }));
        return true;
      }

      if (rest === '/api/adres' && methode === 'GET') {
        await doeAdres(req, res, u.searchParams);
        return true;
      }
      if (rest === '/api/analyse' && methode === 'GET') {
        await doeAnalyse(req, res, u.searchParams);
        return true;
      }
      if (rest.startsWith('/api/sondering/') && methode === 'GET') {
        await doeSondering(req, res, decodeURIComponent(rest.slice('/api/sondering/'.length)));
        return true;
      }
      if (rest === '/api/aanvraag' && methode === 'POST') {
        await doeAanvraag(req, res);
        return true;
      }

      stuurJson(res, 404, { fout: 'Onbekend endpoint' });
      return true;
    }

    // Wel onder /bodemcheck, maar geen bekende route.
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Niet gevonden');
    return true;
  } catch (fout) {
    // Nooit een uitzondering laten ontsnappen: een onbehandelde fout in een
    // async handler haalt het hele Node-proces neer, en daarmee je hele site.
    console.error('[sondeertool] onverwachte fout:', fout && fout.stack ? fout.stack : fout);
    if (!res.headersSent) {
      stuurJson(res, 500, { fout: 'Er ging iets mis in de bodemcheck.' });
    } else {
      try {
        res.end();
      } catch {
        /* verbinding al gesloten */
      }
    }
    return true;
  }
}

module.exports = { handle, configureer, instellingen, GRONDSOORTEN };
