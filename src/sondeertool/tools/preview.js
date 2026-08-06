'use strict';

/**
 * ALLEEN VOOR LOKAAL BEKIJKEN — NIET DEPLOYEN.
 *
 * Bootst na hoe de module in je eigen server.js hangt: een gewone
 * http.createServer met een nepnavigatie eromheen, en de bodemcheck ervoor.
 *
 *   BRO_MOCK=1 node src/sondeertool/tools/preview.js
 *   -> http://localhost:3777/bodemcheck
 *
 * Zet dit bestand nooit in je "start"-script.
 */

const http = require('http');
const sondeertool = require('..');

if (process.env.NODE_ENV === 'production') {
  console.error('preview.js is niet bedoeld voor productie. Gestopt.');
  process.exit(1);
}

const PORT = process.env.PREVIEW_PORT || 3777;

sondeertool.configureer({
  kop: `<nav style="display:flex;gap:1.5rem;align-items:center;padding:1rem 1.5rem;
    background:#fff;border-bottom:1px solid #ddd;font:0.9rem system-ui,sans-serif">
    <strong style="margin-right:auto">AanEnUitbouw.nl</strong>
    <a href="#">Diensten</a><a href="#">Configurator</a><a href="#">Contact</a></nav>`,
  voet: `<footer style="padding:2rem 1.5rem;background:#222;color:#bbb;
    font:0.85rem system-ui">Nepvoet van de preview.</footer>`,
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Zo staat het straks ook in jouw server.js: als laatste, vóór de fallback.
  if (await sondeertool.handle(req, res, url)) return;

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>Nepsite</h1><p>Ga naar <a href="/bodemcheck">/bodemcheck</a></p>');
});

server.listen(PORT, () => {
  console.log(`\n  preview: http://localhost:${PORT}/bodemcheck`);
  console.log(process.env.BRO_MOCK === '1'
    ? '  BRO_MOCK=1 — fictieve sondeerdata\n'
    : '  live BRO-data\n');
});
