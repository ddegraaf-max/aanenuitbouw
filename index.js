'use strict';

/**
 * ============================================================================
 *  Bodemcheck / sondeertool — aanenuitbouw.nl
 * ============================================================================
 *
 * Inbouwen kost één regel in je bestaande server.js:
 *
 *     app.use('/bodemcheck', require('./src/sondeertool')());
 *
 * Zet die regel bij je andere app.use-regels, vóór je 404-handler. Dat is
 * alles. Er is met opzet niets te configureren:
 *
 *   - Geen template-engine nodig. De pagina is een gewoon HTML-bestand met
 *     {{placeholders}} die hier worden gevuld. Of jouw site EJS, Pug of niets
 *     gebruikt maakt niet uit.
 *   - Geen express.static nodig. De stylesheet en de client-JS worden door
 *     deze router zelf uitgeleverd op /bodemcheck/assets/. Waar jouw statics
 *     staan, is dus irrelevant.
 *   - Geen database nodig. Zonder pool werkt alles; aanvragen komen dan
 *     alleen bij je onLead-functie terecht.
 *   - Geen omgevingsvariabelen nodig. Alles heeft een werkende standaard.
 *
 * Alle opties zijn optioneel:
 *
 *     app.use('/bodemcheck', require('./src/sondeertool')({
 *       titel:        'Bodemcheck | AanEnUitbouw.nl',
 *       beschrijving: 'Zie welke grondlagen onder uw perceel zitten.',
 *       canonical:    'https://aanenuitbouw.nl/bodemcheck',
 *       kop:          '<nav>…jouw navigatie als HTML…</nav>',
 *       voet:         '<footer>…jouw footer als HTML…</footer>',
 *       terugLink:    'https://aanenuitbouw.nl/',   // gebruikt als kop leeg is
 *       pool,                                        // pg-pool, optioneel
 *       onLead: async (aanvraag) => { … },            // bijv. Resend-mail
 *     }));
 */

const fs = require('fs');
const path = require('path');
const express = require('express');

const geocode = require('./services/geocode');
const bro = require('./services/broClient');
const { interpreteerSondering, bouwSamenvatting, GRONDSOORTEN } = require('./services/interpret');

const ASSETS_DIR = path.join(__dirname, 'assets');
// Het paginatemplate staat BUITEN assets/. Anders zou het via de statische
// route opvraagbaar zijn, en een filter daarop in express.static levert
// gegarandeerd een ERR_HTTP_HEADERS_SENT-crash op.
const PAGINA_BESTAND = path.join(__dirname, 'pagina.html');
const MAX_DETAILS = Number(process.env.SONDEER_MAX_DETAILS || 3);
const STRALEN_KM = [0.5, 1, 2, 5];

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
// Deze tool roept achter de schermen een overheidsdienst aan. Zonder limiet
// kan iemand met een scriptje jouw server als scrape-proxy naar de BRO
// gebruiken, en word jij eruit gegooid.

function maakLimiter({ perMinuut = 20, perUur = 120 } = {}) {
  const emmers = new Map();

  const opruimen = setInterval(() => {
    const grens = Date.now() - 1000 * 60 * 60;
    for (const [ip, tijden] of emmers) {
      const bewaard = tijden.filter((t) => t > grens);
      if (bewaard.length === 0) emmers.delete(ip);
      else emmers.set(ip, bewaard);
    }
  }, 1000 * 60 * 5);
  opruimen.unref();

  return function limiter(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'onbekend';
    const nu = Date.now();
    const tijden = (emmers.get(ip) || []).filter((t) => t > nu - 1000 * 60 * 60);

    if (tijden.filter((t) => t > nu - 1000 * 60).length >= perMinuut || tijden.length >= perUur) {
      res.set('Retry-After', '60');
      return res.status(429).json({ fout: 'Te veel opvragingen achter elkaar. Wacht een minuut en probeer het opnieuw.' });
    }

    tijden.push(nu);
    emmers.set(ip, tijden);
    next();
  };
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
  // In productie één keer lezen; tijdens ontwikkelen elke keer, zodat je
  // wijzigingen in pagina.html direct ziet zonder herstart.
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
  <strong>Testmodus</strong> — BRO_MOCK=1 staat aan. De sonderingen op deze pagina zijn
  <em>fictief</em> en alleen bedoeld om de werking te controleren.
</div>`;

function standaardKop(terugLink) {
  if (!terugLink) return '';
  return `<div class="sd-terugbalk"><a href="${ontsnap(terugLink)}">&larr; Terug naar de website</a></div>`;
}

function bouwPagina(opties, basisPad, vooringevuld) {
  const vervang = {
    TITEL: ontsnap(opties.titel),
    BESCHRIJVING: ontsnap(opties.beschrijving),
    CANONICAL: opties.canonical ? `<link rel="canonical" href="${ontsnap(opties.canonical)}">` : '',
    ASSETS: `${basisPad}/assets`,
    BASISPAD: basisPad,
    VOORINGEVULD: ontsnap(vooringevuld),
    MOCKBALK: bro.MOCK ? MOCKBALK : '',
    KLEURSTRIP: kleurstrip(),
    KOP: opties.kop || standaardKop(opties.terugLink),
    VOET: opties.voet || '',
  };

  return template().replace(/\{\{(\w+)\}\}/g, (heel, naam) =>
    Object.prototype.hasOwnProperty.call(vervang, naam) ? vervang[naam] : heel,
  );
}

// ---------------------------------------------------------------------------

function schoonRadius(waarde) {
  const n = Number.parseFloat(waarde);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, 0.1), 5);
}

module.exports = function maakSondeertool(opties = {}) {
  const instellingen = {
    titel: 'Bodemcheck: hoe diep zit de draagkrachtige laag onder uw aanbouw?',
    beschrijving:
      'Bekijk gratis welke grondlagen onder uw perceel zitten en op welke diepte de draagkrachtige zandlaag begint. Op basis van echte sonderingen uit de Basisregistratie Ondergrond.',
    canonical: null,
    kop: null,
    voet: null,
    terugLink: '/',
    pool: null,
    onLead: null,
    ...opties,
  };

  const { pool, onLead } = instellingen;
  const router = express.Router();
  const limiter = maakLimiter();

  router.use(express.json({ limit: '32kb' }));

  // --- Assets: door de router zelf, dus geen express.static nodig ---------
  router.use(
    '/assets',
    express.static(ASSETS_DIR, {
      maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
      index: false,
      // fallthrough op de standaard (true): een niet-bestaand bestand valt
      // door naar jouw eigen 404-handler in plaats van naar de error-handler.
      // Met false wordt een missende asset in sommige apps een 500.
    }),
  );

  // --- De pagina ----------------------------------------------------------
  router.get('/', (req, res) => {
    const basisPad = req.baseUrl || '';
    const vooringevuld = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '';
    res.type('html').send(bouwPagina(instellingen, basisPad, vooringevuld));
  });

  // --- Adres-autocomplete -------------------------------------------------
  router.get('/api/adres', limiter, async (req, res) => {
    try {
      res.json({ resultaten: await geocode.zoekAdres(req.query.q, { rows: 6 }) });
    } catch (fout) {
      res.status(fout.statusCode || 502).json({ fout: fout.message });
    }
  });

  // --- Hoofdanalyse -------------------------------------------------------
  router.get('/api/analyse', limiter, async (req, res) => {
    const start = Date.now();
    try {
      let locatie;

      if (req.query.lat && req.query.lon) {
        const lat = Number.parseFloat(req.query.lat);
        const lon = Number.parseFloat(req.query.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return res.status(400).json({ fout: 'Ongeldige coordinaten.' });
        }
        locatie = {
          lat,
          lon,
          omschrijving: typeof req.query.label === 'string' ? req.query.label.slice(0, 160) : `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          soort: 'punt',
        };
      } else if (req.query.q) {
        locatie = await geocode.beste(req.query.q);
      } else {
        return res.status(400).json({ fout: 'Geef een adres (q) of coordinaten (lat/lon) mee.' });
      }

      // Zoekstraal oprekken tot er genoeg materiaal is.
      const vast = schoonRadius(req.query.radius);
      const stralen = vast ? [vast] : STRALEN_KM;
      let kengegevens = [];
      let gebruikteStraal = stralen[0];

      for (const straal of stralen) {
        gebruikteStraal = straal;
        kengegevens = await bro.zoekSonderingen(locatie.lat, locatie.lon, straal);
        if (kengegevens.length >= 3) break;
      }

      // Voorkeur voor sonderingen die diep genoeg gaan om iets over de vaste
      // laag te kunnen zeggen; daarna op afstand.
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

      await logOpvraging(pool, req, antwoord).catch(() => {});
      res.json(antwoord);
    } catch (fout) {
      console.error('[sondeertool] analyse mislukt:', fout.message);
      res.status(fout.statusCode || 502).json({
        fout:
          fout.statusCode === 404 || fout.statusCode === 400
            ? fout.message
            : 'De Basisregistratie Ondergrond is momenteel niet bereikbaar. Probeer het over een paar minuten opnieuw.',
        detail: process.env.NODE_ENV === 'production' ? undefined : fout.message,
      });
    }
  });

  // --- Losse sondering ----------------------------------------------------
  router.get('/api/sondering/:broId', limiter, async (req, res) => {
    try {
      res.json(interpreteerSondering(await bro.haalSondering(req.params.broId)));
    } catch (fout) {
      res.status(502).json({ fout: fout.message });
    }
  });

  // --- Aanvraag -----------------------------------------------------------
  router.post('/api/aanvraag', limiter, async (req, res) => {
    const { naam, email, telefoon, adres, toelichting, lat, lon, broId } = req.body || {};

    if (!naam || !email || !adres) {
      return res.status(400).json({ fout: 'Naam, e-mailadres en adres zijn verplicht.' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) {
      return res.status(400).json({ fout: 'Vul een geldig e-mailadres in.' });
    }

    const aanvraag = {
      naam: String(naam).slice(0, 120),
      email: String(email).slice(0, 160),
      telefoon: telefoon ? String(telefoon).slice(0, 40) : null,
      adres: String(adres).slice(0, 200),
      toelichting: toelichting ? String(toelichting).slice(0, 2000) : null,
      lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
      lon: Number.isFinite(Number(lon)) ? Number(lon) : null,
      broId: broId ? String(broId).slice(0, 40) : null,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip,
    };

    try {
      if (pool) {
        await pool.query(
          `insert into sondeer_aanvraag
             (naam, email, telefoon, adres, toelichting, lat, lon, bro_id, ip)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [aanvraag.naam, aanvraag.email, aanvraag.telefoon, aanvraag.adres, aanvraag.toelichting,
            aanvraag.lat, aanvraag.lon, aanvraag.broId, aanvraag.ip],
        );
      }
      if (typeof onLead === 'function') await onLead(aanvraag);

      if (!pool && typeof onLead !== 'function') {
        // Niets ingesteld: dan tenminste in de log, zodat een aanvraag nooit
        // stil verdwijnt.
        console.log('[sondeertool] aanvraag ontvangen:', JSON.stringify(aanvraag));
      }

      res.json({ ok: true, bericht: 'Bedankt, we nemen binnen een werkdag contact met u op.' });
    } catch (fout) {
      console.error('[sondeertool] aanvraag verwerken mislukt:', fout.message);
      res.status(500).json({ fout: 'Het versturen is niet gelukt. Mail ons of probeer het later opnieuw.' });
    }
  });

  return router;
};

async function logOpvraging(pool, req, antwoord) {
  if (!pool) return;
  await pool.query(
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
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip,
      String(req.headers['user-agent'] || '').slice(0, 300),
    ],
  );
}

module.exports.maakLimiter = maakLimiter;
module.exports.GRONDSOORTEN = GRONDSOORTEN;
