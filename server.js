'use strict';

/**
 * Standalone server. Handig om de tool los te draaien en te bekijken.
 * In aanenuitbouw.nl monteer je liever alleen de router:
 *
 *   app.use('/bodemcheck', require('./src/routes/sonderingen')({ pool }));
 *
 * Zie README.md, hoofdstuk "Inbouwen in de bestaande site".
 */

const path = require('path');
const express = require('express');
const maakSondeerRouter = require('./src/routes/sonderingen');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(
  '/static',
  express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  }),
);

// Optioneel: PostgreSQL. Alleen als er een DATABASE_URL is EN pg beschikbaar is.
let pool = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
    });
    console.log('[sondeertool] PostgreSQL-logging actief');
  } catch {
    console.warn('[sondeertool] DATABASE_URL gezet maar pakket "pg" ontbreekt; logging staat uit');
  }
}

app.use('/bodemcheck', maakSondeerRouter({ pool }));

app.get('/', (req, res) => res.redirect('/bodemcheck'));

app.get('/healthz', (req, res) =>
  res.json({ ok: true, mock: process.env.BRO_MOCK === '1', tijd: new Date().toISOString() }),
);

app.use((req, res) => res.status(404).send('Niet gevonden'));

app.listen(PORT, () => {
  console.log(`[sondeertool] draait op http://localhost:${PORT}/bodemcheck`);
  if (process.env.BRO_MOCK === '1') {
    console.log('[sondeertool] LET OP: BRO_MOCK=1 — er wordt fictieve sondeerdata gebruikt');
  }
});
