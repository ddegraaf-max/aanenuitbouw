'use strict';

/**
 * ALLEEN VOOR LOKAAL BEKIJKEN — NIET DEPLOYEN.
 *
 * Dit bestand heet met opzet niet server.js of app.js, staat niet in de
 * projectroot en weigert te starten met NODE_ENV=production. Zet het nooit in
 * je "start"-script.
 *
 * Draai vanuit je projectroot:
 *
 *   BRO_MOCK=1 node src/sondeertool/tools/preview.js
 *   -> http://localhost:3777/bodemcheck
 */

const express = require('express');
const maakSondeertool = require('..');

if (process.env.NODE_ENV === 'production') {
  console.error('preview.js is niet bedoeld voor productie. Gestopt.');
  process.exit(1);
}

const PORT = process.env.PREVIEW_PORT || 3777;
const app = express();

// Een nepnavigatie, zodat je meteen ziet hoe de tool onder je eigen chrome valt.
const NEPNAV = `<nav style="display:flex;gap:1.5rem;align-items:center;padding:1rem 1.5rem;
  background:#fff;border-bottom:1px solid #ddd;font:0.9rem system-ui,sans-serif">
  <strong style="margin-right:auto">AanEnUitbouw.nl</strong>
  <a href="#">Diensten</a><a href="#">Configurator</a><a href="#">Contact</a>
</nav>`;

app.get('/', (req, res) => res.redirect('/bodemcheck'));

app.use('/bodemcheck', maakSondeertool({
  kop: NEPNAV,
  voet: '<footer style="padding:2rem 1.5rem;background:#222;color:#bbb;font:0.85rem system-ui">Nepvoet van de preview.</footer>',
}));

app.listen(PORT, () => {
  console.log(`\n  preview: http://localhost:${PORT}/bodemcheck`);
  console.log(process.env.BRO_MOCK === '1'
    ? '  BRO_MOCK=1 — fictieve sondeerdata\n'
    : '  live BRO-data\n');
});
