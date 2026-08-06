'use strict';

/**
 * ============================================================================
 *  Installer voor de sondeertool
 * ============================================================================
 *
 * Zet de mount-regel in JOUW server.js, op de juiste plek, met een back-up en
 * een syntaxcheck erna. Draai vanuit je projectroot:
 *
 *   node src/sondeertool/tools/installeer.js
 *
 * Opties:
 *   --bestand=server.js   ander bestand dan server.js
 *   --pad=/bodemcheck     ander URL-pad
 *   --domein=https://aanenuitbouw.nl
 *   --geen-mail           laat de Resend-koppeling weg
 *   --droog               laat alleen zien wat er zou gebeuren
 *   --verwijder           haal het blok er weer uit
 *
 * Het script raakt niets anders aan. Bij twijfel stopt het en zegt het wat je
 * met de hand moet doen; het gaat nooit gokken in een bestand dat het niet
 * begrijpt.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MARKER_START = '// ===== Bodemcheck / sondeertool (BRO) =====';
const MARKER_EIND = '// ===== einde sondeertool =====';

// ---------------------------------------------------------------------------

function argumenten() {
  const uit = { bestand: 'server.js', pad: '/bodemcheck', domein: null, mail: true, droog: false, verwijder: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--bestand=')) uit.bestand = arg.slice(10);
    else if (arg.startsWith('--pad=')) uit.pad = arg.slice(6);
    else if (arg.startsWith('--domein=')) uit.domein = arg.slice(9).replace(/\/$/, '');
    else if (arg === '--geen-mail') uit.mail = false;
    else if (arg === '--droog') uit.droog = true;
    else if (arg === '--verwijder') uit.verwijder = true;
    else {
      console.error(`Onbekende optie: ${arg}`);
      process.exit(1);
    }
  }
  return uit;
}

function stop(bericht) {
  console.error(`\n  ✗ ${bericht}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Het blok dat wordt ingevoegd
// ---------------------------------------------------------------------------

function bouwBlok(opties, moduleRequirePad) {
  const canonical = opties.domein ? `${opties.domein}${opties.pad}` : null;
  const terug = opties.domein ? `${opties.domein}/` : '/';

  const mailDeel = opties.mail
    ? `
  // Aanvraag per e-mail, via dezelfde Resend-variabelen die je server al
  // gebruikt. Zonder RESEND_API_KEY doet dit niets en komt de aanvraag
  // alleen in de log terecht.
  onLead: async (aanvraag) => {
    if (!process.env.RESEND_API_KEY) return;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: \`Bearer \${process.env.RESEND_API_KEY}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.QUOTE_FROM || 'AanEnUitbouw.nl <onboarding@resend.dev>',
        to: [process.env.QUOTE_TO || 'montage@creditline.nl'],
        subject: \`Sondering aangevraagd — \${aanvraag.adres}\`,
        text: [
          \`Naam:        \${aanvraag.naam}\`,
          \`E-mail:      \${aanvraag.email}\`,
          \`Telefoon:    \${aanvraag.telefoon || '-'}\`,
          \`Adres:       \${aanvraag.adres}\`,
          \`Toelichting: \${aanvraag.toelichting || '-'}\`,
          \`Sondering:   \${aanvraag.broId || '-'}\`,
          \`Coordinaten: \${aanvraag.lat || '-'}, \${aanvraag.lon || '-'}\`,
        ].join('\\n'),
      }),
    });
    if (!res.ok) console.error('[sondeertool] Resend gaf', res.status, await res.text());
  },`
    : '';

  return `${MARKER_START}
// Openbare sondeergegevens uit de Basisregistratie Ondergrond, met een
// funderingsindicatie. Geen extra dependencies, geen template-engine, geen
// express.static nodig: de router serveert de pagina en de assets zelf.
app.use('${opties.pad}', require('${moduleRequirePad}')({${canonical ? `
  canonical: '${canonical}',` : ''}
  terugLink: '${terug}',${mailDeel}
}));
${MARKER_EIND}`;
}

// ---------------------------------------------------------------------------
// Bepalen waar het blok komt
// ---------------------------------------------------------------------------

/**
 * Zoekt de laatste plek waar het blok nog vóór de afsluiters staat. Volgorde
 * is belangrijk: een catch-all of 404-handler slokt alles op wat erna komt,
 * dus het blok moet daarvoor.
 */
function bepaalInvoegpositie(regels, appNaam) {
  const kandidaten = [];
  // De app heet niet altijd 'app'; de patronen worden daarom om de echte
  // variabelenaam heen gebouwd.
  const a = escapeRe(appNaam);
  const catchAll = new RegExp(`^${a}\\.(get|use|all)\\s*\\(\\s*['"\`]\\*`);
  const useHandler = new RegExp(`^${a}\\.use\\s*\\(\\s*(function|\\()`);
  const errHandler = new RegExp(`^${a}\\.use\\s*\\(\\s*(function\\s*)?\\(\\s*(err|error)\\b`);
  const listen = new RegExp(`^${a}\\.listen\\s*\\(`);

  regels.forEach((regel, i) => {
    const t = regel.trim();

    // Catch-all routes
    if (catchAll.test(t)) kandidaten.push({ i, waarom: 'catch-all route', prio: 1 });

    // 404-handler: een use-middleware die binnen een paar regels 404 zet
    if (useHandler.test(t)) {
      const venster = regels.slice(i, i + 6).join(' ');
      if (/\b404\b/.test(venster)) kandidaten.push({ i, waarom: '404-handler', prio: 1 });
    }

    // Error-handler (vier argumenten)
    if (errHandler.test(t)) kandidaten.push({ i, waarom: 'error-handler', prio: 2 });

    // listen
    if (listen.test(t)) kandidaten.push({ i, waarom: `${appNaam}.listen`, prio: 3 });
  });

  if (kandidaten.length === 0) return null;

  kandidaten.sort((a, b) => (a.prio !== b.prio ? a.prio - b.prio : a.i - b.i));
  return kandidaten[0];
}

/** Relatief require-pad van server.js naar de module. */
function moduleRequirePad(serverBestand) {
  const van = path.dirname(path.resolve(serverBestand));
  const naar = path.resolve(__dirname, '..'); // src/sondeertool
  let rel = path.relative(van, naar).split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

// ---------------------------------------------------------------------------
// Sitemap bijwerken
// ---------------------------------------------------------------------------

function werkSitemapBij(opties) {
  const kandidaten = ['sitemap.xml', 'public/sitemap.xml'];
  const pad = kandidaten.find((p) => fs.existsSync(p));
  if (!pad) return '  sitemap.xml niet gevonden — overgeslagen';

  const xml = fs.readFileSync(pad, 'utf8');
  if (xml.includes(opties.pad)) return `  ${pad} bevat de pagina al`;
  if (!opties.domein) return `  ${pad} niet bijgewerkt (geef --domein=… mee)`;

  const nieuweUrl = `  <url>
    <loc>${opties.domein}${opties.pad}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
  const uit = xml.replace(/<\/urlset>/, `${nieuweUrl}</urlset>`);
  if (uit === xml) return `  ${pad} heeft geen </urlset> — niet bijgewerkt`;

  if (!opties.droog) {
    fs.copyFileSync(pad, `${pad}.backup`);
    fs.writeFileSync(pad, uit, 'utf8');
  }
  return `  ${pad} bijgewerkt (back-up: ${pad}.backup)`;
}

// ---------------------------------------------------------------------------

function main() {
  const opties = argumenten();
  const bestand = opties.bestand;

  console.log('\n  Sondeertool — installer\n');

  if (!fs.existsSync(bestand)) {
    stop(`${bestand} niet gevonden. Draai dit script vanuit je projectroot, of geef --bestand=… mee.`);
  }

  const origineel = fs.readFileSync(bestand, 'utf8');

  // --- verwijderen -------------------------------------------------------
  if (opties.verwijder) {
    if (!origineel.includes(MARKER_START)) stop(`Het sondeertool-blok staat niet in ${bestand}.`);
    const re = new RegExp(`\\n*${escapeRe(MARKER_START)}[\\s\\S]*?${escapeRe(MARKER_EIND)}\\n?`, 'g');
    const uit = origineel.replace(re, '\n');
    if (!opties.droog) {
      const back = maakBackup(bestand, origineel);
      fs.writeFileSync(bestand, uit, 'utf8');
      if (!checkSyntax(bestand)) {
        fs.writeFileSync(bestand, origineel, 'utf8');
        stop('Na verwijderen was de syntax ongeldig. Het bestand is teruggezet.');
      }
      console.log(`  ✓ blok verwijderd uit ${bestand} (back-up: ${back})\n`);
    } else {
      console.log('  droogloop: blok zou worden verwijderd\n');
    }
    return;
  }

  // --- controles ---------------------------------------------------------
  if (!/require\(\s*['"]express['"]\s*\)/.test(origineel)) {
    stop(`${bestand} lijkt geen Express-app (geen require('express') gevonden). Gestopt om niets kapot te maken.`);
  }

  if (origineel.includes(MARKER_START)) {
    console.log(`  Het blok staat al in ${bestand}. Niets te doen.`);
    console.log('  Wil je het opnieuw plaatsen: eerst --verwijder, dan opnieuw installeren.\n');
    return;
  }

  const appNaam = (origineel.match(/(?:const|let|var)\s+(\w+)\s*=\s*express\(\)/) || [])[1];
  if (!appNaam) {
    stop(`Kon in ${bestand} niet vinden waar de Express-app wordt aangemaakt (verwacht iets als "const app = express()").`);
  }
  if (appNaam !== 'app') {
    console.log(`  Let op: je app heet "${appNaam}", niet "app". Het blok wordt daarop aangepast.`);
  }

  const regels = origineel.split('\n');
  const positie = bepaalInvoegpositie(regels, appNaam);
  if (!positie) {
    stop(
      `Kon in ${bestand} geen 404-handler, catch-all of app.listen vinden om het blok vóór te zetten.\n` +
      `    Zet deze regel dan met de hand op de juiste plek:\n\n` +
      `      ${appNaam}.use('${opties.pad}', require('${moduleRequirePad(bestand)}')());\n`,
    );
  }

  const modulePad = moduleRequirePad(bestand);
  if (!fs.existsSync(path.resolve(path.dirname(path.resolve(bestand)), modulePad, 'index.js'))) {
    stop(`De module is niet gevonden op ${modulePad}. Is de ZIP wel in de projectroot uitgepakt?`);
  }

  let blok = bouwBlok(opties, modulePad);
  if (appNaam !== 'app') blok = blok.replace(/^app\.use\(/m, `${appNaam}.use(`);

  console.log(`  bestand:      ${bestand}`);
  console.log(`  invoegen vóór regel ${positie.i + 1} (${positie.waarom}):`);
  console.log(`                  ${regels[positie.i].trim().slice(0, 70)}`);
  console.log(`  module:       ${modulePad}`);
  console.log(`  URL-pad:      ${opties.pad}`);
  console.log(`  e-mail:       ${opties.mail ? 'via RESEND_API_KEY / QUOTE_TO' : 'uit'}`);

  const nieuweRegels = [...regels];
  nieuweRegels.splice(positie.i, 0, blok, '');
  const uit = nieuweRegels.join('\n');

  if (opties.droog) {
    console.log('\n  --- droogloop, niets weggeschreven. Dit zou worden ingevoegd: ---\n');
    console.log(blok.split('\n').map((r) => `  ${r}`).join('\n'));
    console.log('');
    return;
  }

  const back = maakBackup(bestand, origineel);
  fs.writeFileSync(bestand, uit, 'utf8');

  if (!checkSyntax(bestand)) {
    fs.writeFileSync(bestand, origineel, 'utf8');
    stop(`Na invoegen was de syntax van ${bestand} ongeldig. Het bestand is teruggezet naar de oude versie.`);
  }

  console.log(`\n  ✓ ${bestand} bijgewerkt en syntaxcheck geslaagd`);
  console.log(`  ✓ back-up: ${back}`);
  console.log(werkSitemapBij(opties).replace(/^ {2}/, '  '));
  console.log(`\n  Lokaal bekijken:  BRO_MOCK=1 node src/sondeertool/tools/preview.js`);
  console.log(`  Daarna committen en pushen; de pagina komt op ${opties.domein || ''}${opties.pad}\n`);
}

function maakBackup(bestand, inhoud) {
  const stempel = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const naam = `${bestand}.backup-${stempel}`;
  fs.writeFileSync(naam, inhoud, 'utf8');
  return naam;
}

function checkSyntax(bestand) {
  try {
    execFileSync(process.execPath, ['--check', bestand], { stdio: 'pipe' });
    return true;
  } catch (fout) {
    console.error('\n  syntaxfout:', String(fout.stderr || fout.message).split('\n').slice(0, 4).join('\n  '));
    return false;
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main();
