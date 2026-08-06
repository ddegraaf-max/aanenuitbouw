'use strict';

/**
 * ============================================================================
 *  ALLEEN VOOR LOKAAL BEKIJKEN. NIET DEPLOYEN.
 * ============================================================================
 *
 * Dit bestand start een klein eigen serverje zodat je de bodemcheck kunt
 * bekijken zonder hem al in de site te hangen. Het is met opzet:
 *   - niet 'server.js' of 'app.js' genoemd
 *   - niet in de projectroot geplaatst
 *   - zonder eigen package.json
 * zodat het onmogelijk per ongeluk het startpunt van je Railway-deploy wordt.
 *
 * Zet het NOOIT in je "start"-script. Draai het zo, vanuit je projectroot:
 *
 *   BRO_MOCK=1 node src/sondeertool/tools/preview.js
 *   -> http://localhost:3777/bodemcheck
 *
 * Het gebruikt express en ejs uit je bestaande node_modules; verder niets.
 */

const path = require('path');
const express = require('express');
const maakSondeerRouter = require('../routes/sonderingen');

if (process.env.NODE_ENV === 'production') {
  console.error('preview.js is niet bedoeld voor productie. Gestopt.');
  process.exit(1);
}

// Projectroot = vier niveaus omhoog: tools -> sondeertool -> src -> root
const WORTEL = path.resolve(__dirname, '..', '..', '..');
const PORT = process.env.PREVIEW_PORT || 3777;

const app = express();
app.set('view engine', 'ejs');
app.set('views', [path.join(WORTEL, 'views'), __dirname]);
app.use('/static', express.static(path.join(WORTEL, 'public')));

// De view is een fragment zonder <html>, dus we wikkelen hem hier in een
// minimaal document met een nepnavigatie erboven. Zo zie je meteen of het
// fragment netjes binnen een bestaande layout valt.
app.get('/bodemcheck', (req, res, next) => {
  const { GRONDSOORTEN } = require('../services/interpret');
  res.render('preview-layout', {
    titel: 'Preview — bodemcheck',
    fragmentPad: path.join(WORTEL, 'views', 'sondeertool.ejs'),
    grondsoorten: GRONDSOORTEN,
    basisPad: '/bodemcheck',
    staticPad: '/static',
    mock: process.env.BRO_MOCK === '1',
    vooringevuld: typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : '',
  });
});

// De API-routes komen van de echte router, zodat je precies test wat er
// straks in productie draait.
app.use('/bodemcheck', maakSondeerRouter({ staticPad: '/static' }));

app.listen(PORT, () => {
  console.log(`\n  preview: http://localhost:${PORT}/bodemcheck`);
  console.log(process.env.BRO_MOCK === '1'
    ? '  BRO_MOCK=1 — fictieve sondeerdata\n'
    : '  live BRO-data\n');
});
