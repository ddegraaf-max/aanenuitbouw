'use strict';

const express = require('express');
const geocode = require('../services/geocode');
const bro = require('../services/broClient');
const { interpreteerSondering, bouwSamenvatting, GRONDSOORTEN } = require('../services/interpret');

/**
 * Router voor de sondeertool.
 *
 * Monteer hem in je bestaande app:
 *
 *   const maakSondeerRouter = require('./src/sondeertool/routes/sonderingen');
 *   app.use('/bodemcheck', maakSondeerRouter({ pool }));
 *
 * `pool` is optioneel: geef je een PostgreSQL-pool mee, dan worden opvragingen
 * en aanvragen gelogd in de tabellen uit sql/001_sondeertool.sql. Zonder pool
 * werkt alles gewoon, alleen zonder logging.
 */

// ---------------------------------------------------------------------------
// Eenvoudige rate limiting
// ---------------------------------------------------------------------------
// Dit is een publieke tool die achter de schermen een overheidsdienst
// aanroept. Zonder limiet kan iemand met een scriptje in tien minuten
// duizenden BRO-calls via jouw server duwen; dan ben jij degene die eruit
// wordt gegooid.

function maakLimiter({ perMinuut = 20, perUur = 120 } = {}) {
  const emmers = new Map();

  setInterval(() => {
    const grens = Date.now() - 1000 * 60 * 60;
    for (const [ip, tijden] of emmers) {
      const bewaard = tijden.filter((t) => t > grens);
      if (bewaard.length === 0) emmers.delete(ip);
      else emmers.set(ip, bewaard);
    }
  }, 1000 * 60 * 5).unref();

  return function limiter(req, res, next) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'onbekend';
    const nu = Date.now();
    const tijden = (emmers.get(ip) || []).filter((t) => t > nu - 1000 * 60 * 60);

    const laatsteMinuut = tijden.filter((t) => t > nu - 1000 * 60).length;
    if (laatsteMinuut >= perMinuut || tijden.length >= perUur) {
      res.set('Retry-After', '60');
      return res.status(429).json({
        fout: 'Te veel opvragingen achter elkaar. Wacht een minuut en probeer het opnieuw.',
      });
    }

    tijden.push(nu);
    emmers.set(ip, tijden);
    next();
  };
}

// ---------------------------------------------------------------------------

const MAX_DETAILS = Number(process.env.SONDEER_MAX_DETAILS || 3);
const STRALEN_KM = [0.5, 1, 2, 5];

function schoonRadius(waarde) {
  const n = Number.parseFloat(waarde);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, 0.1), 5);
}

module.exports = function maakSondeerRouter({
  pool = null,
  onLead = null,
  basisPad = '',
  staticPad = '/static',
  viewNaam = 'sondeertool',
} = {}) {
  const router = express.Router();
  const limiter = maakLimiter();

  router.use(express.json({ limit: '32kb' }));

  // --- Pagina -------------------------------------------------------------
  router.get('/', (req, res) => {
    res.render(viewNaam, {
      titel: 'Bodemcheck: hoe diep zit de draagkrachtige laag onder uw aanbouw?',
      grondsoorten: GRONDSOORTEN,
      basisPad: basisPad || req.baseUrl || '',
      staticPad,
      mock: bro.MOCK,
      vooringevuld: typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '',
    });
  });

  // --- Adres-autocomplete -------------------------------------------------
  router.get('/api/adres', limiter, async (req, res) => {
    try {
      const treffers = await geocode.zoekAdres(req.query.q, { rows: 6 });
      res.json({ resultaten: treffers });
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
        locatie = { lat, lon, omschrijving: req.query.label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, soort: 'punt' };
      } else if (req.query.q) {
        locatie = await geocode.beste(req.query.q);
      } else {
        return res.status(400).json({ fout: 'Geef een adres (q) of coordinaten (lat/lon) mee.' });
      }

      // Zoekstraal oprekken tot we genoeg materiaal hebben.
      const vast = schoonRadius(req.query.radius);
      const stralen = vast ? [vast] : STRALEN_KM;
      let kengegevens = [];
      let gebruikteStraal = stralen[0];

      for (const straal of stralen) {
        gebruikteStraal = straal;
        kengegevens = await bro.zoekSonderingen(locatie.lat, locatie.lon, straal);
        if (kengegevens.length >= 3) break;
      }

      // Voorkeur voor sonderingen die diep genoeg gaan om iets over de
      // vaste laag te kunnen zeggen; daarna op afstand.
      const kandidaten = [...kengegevens]
        .sort((a, b) => {
          const diepA = (a.einddiepte || 0) >= 8 ? 0 : 1;
          const diepB = (b.einddiepte || 0) >= 8 ? 0 : 1;
          if (diepA !== diepB) return diepA - diepB;
          return a.afstandM - b.afstandM;
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

      const samenvatting = bouwSamenvatting(sonderingen, {
        omschrijving: locatie.omschrijving,
        lat: locatie.lat,
        lon: locatie.lon,
        zoekstraalKm: gebruikteStraal,
      });

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
        samenvatting,
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
      console.error('[sondeertool] analyse mislukt:', fout);
      res.status(fout.statusCode || 502).json({
        fout:
          fout.statusCode === 404 || fout.statusCode === 400
            ? fout.message
            : 'De Basisregistratie Ondergrond is momenteel niet bereikbaar. Probeer het over een paar minuten opnieuw.',
        detail: process.env.NODE_ENV === 'production' ? undefined : fout.message,
      });
    }
  });

  // --- Losse sondering (voor "bekijk volledige sondeerstaat") -------------
  router.get('/api/sondering/:broId', limiter, async (req, res) => {
    try {
      const ruw = await bro.haalSondering(req.params.broId);
      res.json(interpreteerSondering(ruw));
    } catch (fout) {
      res.status(502).json({ fout: fout.message });
    }
  });

  // --- Aanvraag echte sondering / contact --------------------------------
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
      res.json({ ok: true, bericht: 'Bedankt, we nemen binnen een werkdag contact met u op.' });
    } catch (fout) {
      console.error('[sondeertool] aanvraag opslaan mislukt:', fout);
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
