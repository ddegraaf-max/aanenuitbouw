'use strict';

/**
 * Leest de opties, prijzen en de prijsberekening rechtstreeks uit de
 * configurator (configurator.html). Zo tonen de losse pagina's altijd precies
 * dezelfde opties, teksten en bedragen als de configurator zelf: er is maar
 * één plek waar ze staan.
 *
 * Uit configurator.html komen twee stukken:
 *   1. de standaardkeuzes            const state = { ... };
 *   2. prijzen, opties en berekening van "const DEFAULT_PRICES" tot en met
 *      de functie calculate()
 *
 * Verandert de opbouw van de configurator zo dat deze stukken niet meer te
 * vinden zijn, dan meldt de test (node --test src/paginas/test/*.test.js) dat.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BRON = path.join(__dirname, '..', '..', 'configurator.html');

function knip(tekst, vanaf, tot, naam) {
  const a = tekst.indexOf(vanaf);
  const b = a < 0 ? -1 : tekst.indexOf(tot, a);
  if (a < 0 || b < 0) throw new Error(`configurator.html: onderdeel "${naam}" niet gevonden`);
  return tekst.slice(a, b);
}

function laad() {
  const html = fs.readFileSync(BRON, 'utf8').replace(/\r\n/g, '\n');
  const keuzes = knip(html, 'const state = {', '\n};\n', 'standaardkeuzes') + '\n};\n';
  const prijzen = knip(html, 'const DEFAULT_PRICES = {', '// VIEW CONFIG', 'prijzen en berekening');

  const code = `${keuzes}
${prijzen.replace(/\/\/ ═+\s*$/, '')}
;({
  DEFAULT_PRICES, PLANS, ROOF_TYPES, DOORS, DAKRAND_TYPES, GEVEL_TYPES, COLORS, PVC_COLORS, STEPS,
  standaard: JSON.parse(JSON.stringify(state)),
  prijzen: () => ({ ...PRICES }),
  zetPrijzen: (p) => { PRICES = { ...DEFAULT_PRICES, ...p }; },
  bereken: (keuze) => {
    const begin = JSON.parse(JSON.stringify(state));
    try {
      for (const k in keuze) state[k] = keuze[k];
      return { ...calculate() };
    } finally {
      for (const k in begin) state[k] = begin[k];
    }
  },
})`;
  return vm.runInNewContext(code, {}, { filename: 'configurator.html (prijzen en opties)' });
}

let geladen = null;
let fout = null;
try {
  geladen = laad();
} catch (e) {
  fout = e;
  console.error('[paginas] opties uit de configurator niet beschikbaar:', e.message);
}

/**
 * Geeft de opties en prijzen, met de prijzen uit het beheer eroverheen.
 * Alleen getallen die de configurator zelf ook kent, worden overgenomen.
 * Geeft null als de configurator niet te lezen was.
 */
function metPrijzen(opgeslagen) {
  if (!geladen) return null;
  const schoon = {};
  for (const k in (opgeslagen || {})) {
    const v = opgeslagen[k];
    if (k in geladen.DEFAULT_PRICES && typeof v === 'number' && isFinite(v) && v >= 0) schoon[k] = v;
  }
  geladen.zetPrijzen(schoon);
  return geladen;
}

module.exports = { metPrijzen, beschikbaar: () => !!geladen, fout: () => fout };
