'use strict';

/**
 * Maakt src/paginas/basis.css: de vormgeving van de losse pagina's (/aanbouw,
 * /uitbouw, ...), overgenomen uit configurator.html. Zo zien die pagina's er
 * precies zo uit als de homepage.
 *
 * Draaien na een wijziging in de vormgeving van de homepage:
 *
 *   node tools/maak-pagina-css.js
 *
 * Alleen de blokken hieronder gaan mee; de configurator en het beheerpaneel
 * staan niet op de losse pagina's en blijven dus achterwege.
 */

const fs = require('fs');
const path = require('path');

const BRON = path.join(__dirname, '..', 'configurator.html');
const DOEL = path.join(__dirname, '..', 'src', 'paginas', 'basis.css');

const BLOKKEN = [
  'LETTERTYPEN',
  'DESIGN TOKENS',
  'RESET & BASE',
  'SITE HEADER',
  'HERO',
  'SECTIONS',
  'DIENSTEN',
  'PLANNEN',
  'PROCES',
  'RECENT WERK',
  'OVER ONS',
  'CONTACT',
  'FOOTER',
];

const html = fs.readFileSync(BRON, 'utf8').replace(/\r\n/g, '\n');
const stijl = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1];
if (!stijl) {
  console.error('Geen <style>-blok gevonden in configurator.html');
  process.exit(1);
}

// Elk blok begint met een kopje tussen twee lijnen van ═-tekens.
const kop = /\/\* ═+\n\s+(.+?)\n\s+═+ \*\//g;
const gevonden = [];
let m;
while ((m = kop.exec(stijl))) gevonden.push({ titel: m[1].trim(), begin: m.index, na: kop.lastIndex });

const delen = [];
const ontbreekt = new Set(BLOKKEN);
gevonden.forEach((blok, i) => {
  const naam = BLOKKEN.find((b) => blok.titel.toUpperCase().startsWith(b));
  if (!naam) return;
  ontbreekt.delete(naam);
  const eind = i + 1 < gevonden.length ? gevonden[i + 1].begin : stijl.length;
  delen.push(`/* ── ${blok.titel} ── */\n${stijl.slice(blok.na, eind).trim()}`);
});

if (ontbreekt.size) {
  console.error('Niet gevonden in configurator.html: ' + [...ontbreekt].join(', '));
  process.exit(1);
}

const uit = `/* AUTOMATISCH GEMAAKT door tools/maak-pagina-css.js uit configurator.html.
   Niet hier aanpassen: wijzig de homepage en draai het script opnieuw.
   Eigen vormgeving van de losse pagina's staat in paginas.css. */\n\n${delen.join('\n\n')}\n`;

fs.mkdirSync(path.dirname(DOEL), { recursive: true });
fs.writeFileSync(DOEL, uit, 'utf8');
console.log(`basis.css gemaakt: ${delen.length} blokken, ${Math.round(uit.length / 1024)} kB`);
