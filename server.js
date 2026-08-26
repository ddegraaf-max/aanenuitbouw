const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || '/data';
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');
const PLANNING_FILE = path.join(DATA_DIR, 'planning.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
// Fasen, migratie en toegestane waarden van de projectmonitor staan in één
// gedeeld bestand, dat ook de klantpagina en het beheer gebruiken.
const PROJECTFASEN = require('./projectfasen.js');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Resend e-mail configuratie
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const QUOTE_FROM = process.env.QUOTE_FROM || 'AanEnUitbouw.nl <onboarding@resend.dev>';
const QUOTE_TO = process.env.QUOTE_TO || 'project@aanenuitbouw.nl';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.pdf':  'application/pdf',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
};

function jsonResponse(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(JSON.stringify(payload));
}

function checkAuth(req) {
  if (!ADMIN_PASSWORD) return false;
  const auth = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) return false;
  const provided = match[1];
  if (provided.length !== ADMIN_PASSWORD.length) return false;
  let mismatch = 0;
  for (let i = 0; i < provided.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ ADMIN_PASSWORD.charCodeAt(i);
  }
  return mismatch === 0;
}

function readJsonBody(req, maxBytes = 100000) {
  return new Promise((resolve, reject) => {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      body += chunk;
      if (body.length > maxBytes) {
        aborted = true;
        reject(new Error('Body te groot'));
      }
    });
    req.on('end', () => {
      if (aborted) return;
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Ongeldige JSON')); }
    });
    req.on('error', reject);
  });
}

async function readPrices() {
  try {
    const data = await fs.promises.readFile(PRICES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writePrices(prices) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(PRICES_FILE, JSON.stringify(prices, null, 2), 'utf8');
}

// ---- Generieke JSON-opslag (zelfde patroon als prices) ----
async function readDataFile(file) {
  try {
    const data = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function writeDataFile(file, obj) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

// ---- Projectcodes: AEB-XXXXX, zonder verwarrende tekens (0/O, 1/I/L) ----
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateProjectCode(existing) {
  const crypto = require('crypto');
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = 'AEB-';
    const bytes = crypto.randomBytes(5);
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!existing || !existing[code]) return code;
  }
  throw new Error('Kon geen unieke projectcode genereren');
}

const PROJECT_PHASE_COUNT = PROJECTFASEN.FASEN.length;     // 0 = Huisbezoek ... laatste = Oplevering
const PROJECT_TYPES = Object.keys(PROJECTFASEN.TYPES);     // aanbouw | uitbouw
const PROJECT_PLANNEN = Object.keys(PROJECTFASEN.PLANNEN); // casco | cplus | cplus2

// Leest projects.json en zet projecten met de oude fase-indeling eenmalig om
// naar de huidige. Het resultaat wordt direct teruggeschreven, zodat de
// migratie maar één keer draait.
async function loadProjects() {
  const projects = (await readDataFile(PROJECTS_FILE)) || {};
  let gewijzigd = false;
  for (const code in projects) {
    if (PROJECTFASEN.migreerProject(projects[code])) gewijzigd = true;
  }
  if (gewijzigd) {
    await writeDataFile(PROJECTS_FILE, projects);
    console.log('Projectmonitor: projecten omgezet naar fase-indeling v' + PROJECTFASEN.SCHEMA);
  }
  return projects;
}
const PLANNING_STATUSES = ['green', 'orange', 'red'];

// ---- Eenvoudige rate limiter voor de publieke projectcode-check ----
const _projectLookups = new Map(); // ip -> { count, reset }
function projectLookupAllowed(ip) {
  const now = Date.now();
  const WINDOW = 10 * 60 * 1000; // 10 minuten
  const MAX = 30;
  const entry = _projectLookups.get(ip);
  if (!entry || now > entry.reset) {
    _projectLookups.set(ip, { count: 1, reset: now + WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= MAX;
}
// ---- Rate limiting op admin-inlogpogingen ----
// Zonder dit is /api/auth/check een orakel waarmee ADMIN_PASSWORD ongelimiteerd
// te raden is: een schone 200 bij goed, 401 bij fout, zonder vertraging.
// Alleen MISLUKTE pogingen tellen mee, zodat normaal adminwerk nooit vastloopt.
const _adminFails = new Map(); // ip -> { count, reset }
const ADMIN_WINDOW = 15 * 60 * 1000; // 15 minuten
const ADMIN_MAX_FAILS = 10;

function clientIp(req) {
  // NIET x-forwarded-for[0]: die header mag de bezoeker zelf meesturen en
  // Cloudflare zet de echte waarde erachter. Wie [0] leest, leest dus wat de
  // bezoeker heeft opgegeven en kan elke rate limiter omzeilen door bij elk
  // verzoek een ander verzonnen IP te sturen. cf-connecting-ip wordt door
  // Cloudflare altijd overschreven en is niet te vervalsen.
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.socket.remoteAddress || 'onbekend';
}

function adminTooManyFails(ip) {
  const entry = _adminFails.get(ip);
  if (!entry || Date.now() > entry.reset) return false;
  return entry.count >= ADMIN_MAX_FAILS;
}

function adminRegisterFail(ip) {
  const now = Date.now();
  const entry = _adminFails.get(ip);
  if (!entry || now > entry.reset) {
    _adminFails.set(ip, { count: 1, reset: now + ADMIN_WINDOW });
  } else {
    entry.count++;
  }
}

function adminClearFails(ip) {
  _adminFails.delete(ip);
}

// Poortwachter voor alle admin-endpoints. Geeft true terug als het verzoek al
// is afgehandeld (geweigerd); dan moet de aanroeper meteen returnen.
async function adminGeweigerd(req, res) {
  const ip = clientIp(req);
  if (adminTooManyFails(ip)) {
    jsonResponse(res, 429, { error: 'Te veel mislukte inlogpogingen — probeer het over 15 minuten opnieuw' });
    return true;
  }
  if (!checkAuth(req)) {
    adminRegisterFail(ip);
    await _sleep(300); // vertraging tegen snel raden
    jsonResponse(res, 401, { error: 'Unauthorized' });
    return true;
  }
  adminClearFails(ip);
  return false;
}

// Opruimen zodat de maps niet oneindig groeien
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _projectLookups) {
    if (now > entry.reset) _projectLookups.delete(ip);
  }
  for (const [ip, entry] of _adminFails) {
    if (now > entry.reset) _adminFails.delete(ip);
  }
}, 10 * 60 * 1000).unref();

// ---- Poortwachters die niet per IP werken ----
// De limiet per IP hieronder helpt tegen één vervelende bezoeker. Deze twee
// helpen tegen wat er bij echt misbruik gebeurt: verkeer van honderden adressen.
//
//   globaalPerUur   totaal over alle bezoekers samen
//   mailPerDag      begrenst de e-mail. Een overschrijding kost geen server maar
//                   de reputatie van je verzenddomein bij Resend en bij de
//                   ontvangende mailservers, en die is niet terug te kopen.
const { globaleLimiet, dagteller } = require('./src/gedeeld/poort');

const quoteGlobaal = globaleLimiet({
  max: Number(process.env.QUOTE_MAX_PER_UUR || 40),
  vensterMs: 60 * 60 * 1000,
  naam: 'offerteaanvragen per uur',
});

const mailPerDag = dagteller({
  max: Number(process.env.QUOTE_MAX_PER_DAG || 120),
  naam: 'offerte-e-mails per dag',
});

// ---- Tijdslot: een formulier dat binnen drie seconden terugkomt is een bot ----
// Een mens vult naam, e-mail, adres en een configuratie niet in drie seconden in.
// Dit kost een bot niets om te omzeilen als hij het weet, maar het weert de
// grote meerderheid die dat niet weet — en het is gratis, in tegenstelling tot
// een captcha die elke bezoeker lastigvalt.
const FORMULIER_MINIMUM_MS = Number(process.env.QUOTE_MIN_INVULTIJD_MS || 3000);

// ---- Turnstile (Cloudflare), alleen actief als de sleutels zijn ingesteld ----
// Onzichtbaar voor vrijwel elke bezoeker, geen cookiebanner nodig, gratis en
// zonder limiet. Zonder TURNSTILE_SECRET gebeurt er niets en werkt alles zoals
// voorheen; zet je beide sleutels, dan wordt elke aanvraag geverifieerd.
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET || '';
const TURNSTILE_SITEKEY = process.env.TURNSTILE_SITEKEY || '';

async function turnstileGeldig(token, ip) {
  if (!TURNSTILE_SECRET) return true; // niet ingesteld: overslaan
  if (!token || typeof token !== 'string') return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
    });
    const uit = await res.json();
    if (!uit.success) console.warn('Turnstile afgewezen:', JSON.stringify(uit['error-codes'] || []));
    return uit.success === true;
  } catch (e) {
    // Is Cloudflare onbereikbaar, dan liever een aanvraag doorlaten dan een
    // echte klant weigeren. De overige sloten staan nog overeind.
    console.error('Turnstile niet bereikbaar, aanvraag toch doorgelaten:', e.message);
    return true;
  }
}

// ---- Rate limiting op offerteaanvragen ----
// Stond er niet, en met fotobijlagen erbij is dat een groter probleem: elke
// aanvraag verstuurt twee e-mails via Resend en kan enkele megabytes bevatten.
const _quoteSubmits = new Map(); // ip -> { count, reset }
function quoteAllowed(ip) {
  const now = Date.now();
  const WINDOW = 60 * 60 * 1000; // een uur
  const MAX = 6;
  const entry = _quoteSubmits.get(ip);
  if (!entry || now > entry.reset) {
    _quoteSubmits.set(ip, { count: 1, reset: now + WINDOW });
    return true;
  }
  entry.count++;
  return entry.count <= MAX;
}

// Toegestane fototypes en grenzen. De browser verkleint al naar maximaal
// 1600 px en JPEG-kwaliteit 0,82, dus in de praktijk blijft een foto onder de
// 500 kB. Deze grenzen zijn het vangnet als iemand het verzoek zelf opbouwt.
const FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const FOTO_MAX_AANTAL = 3;
const FOTO_MAX_BYTES = 4 * 1024 * 1024;
const QUOTE_BODY_MAX = 14 * 1024 * 1024;

/** Controleert en normaliseert de meegestuurde foto's. */
function schoonFotos(ruw) {
  if (!Array.isArray(ruw)) return [];
  const uit = [];
  for (const foto of ruw.slice(0, FOTO_MAX_AANTAL)) {
    if (!foto || typeof foto !== 'object') continue;
    const type = String(foto.type || '');
    const data = String(foto.data || '');
    if (!FOTO_TYPES.includes(type)) continue;
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) continue;          // alleen base64
    if (data.length * 0.75 > FOTO_MAX_BYTES) continue;       // te groot
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    uit.push({
      filename: `achterzijde-${uit.length + 1}.${ext}`,
      type,
      data,
      bytes: Math.round(data.length * 0.75),
    });
  }
  return uit;
}

/** Alleen http(s)-adressen, bijvoorbeeld een Funda-link. */
function schoonWebadres(ruw) {
  const tekst = oneLine(ruw).slice(0, 300);
  if (!tekst) return '';
  if (!/^https?:\/\/[^\s]+\.[^\s]{2,}/i.test(tekst)) return '';
  return tekst;
}

/** '2026-09' of 'flexibel'; al het andere wordt genegeerd. */
function schoonStartmaand(ruw) {
  const tekst = oneLine(ruw).slice(0, 20);
  if (tekst === 'flexibel') return 'flexibel';
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(tekst) ? tekst : '';
}

const TEKENING_LABEL = {
  'heb-ik': 'Klant heeft de bouwtekeningen',
  opvragen: 'Klant vraagt de tekeningen op bij de gemeente',
  geen: 'Geen tekeningen beschikbaar — opname ter plaatse nodig',
};

function startmaandLabel(waarde) {
  if (waarde === 'flexibel') return 'Flexibel / zo snel mogelijk';
  if (!waarde) return '';
  const [jaar, maand] = waarde.split('-');
  const namen = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  return `${namen[Number(maand) - 1]} ${jaar}`;
}

// HTML-escape om injectie in de e-mail te voorkomen
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Verwijder CR/LF zodat niemand extra mailheaders kan injecteren
function oneLine(str) {
  return String(str == null ? '' : str).replace(/[\r\n]+/g, ' ').trim();
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function buildQuoteEmail(data) {
  const cfg = data.config || {};
  const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
  const rowsHtml = rows.map(r =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">${esc(r.label)}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(r.value)}</td></tr>`
  ).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f2f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:#1E4FC7;padding:24px 28px;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Nieuwe offerte-aanvraag</h1>
        <p style="margin:6px 0 0;color:#cdd9f5;font-size:13px;">via de configurator op AanEnUitbouw.nl</p>
      </div>
      <div style="padding:24px 28px;">
        <h2 style="font-size:15px;color:#1A2540;margin:0 0 12px;">Contactgegevens</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          <tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Naam</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(data.name)}</td></tr>
          <tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">E-mail</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(data.email)}</td></tr>
          <tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Telefoon</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(data.phone) || '—'}</td></tr>
        </table>
        ${(data.startMonth || data.listingUrl || (data.photos && data.photos.length)) ? `
        <h2 style="font-size:15px;color:#1A2540;margin:0 0 12px;">Woning en planning</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
          ${data.adres ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Adres woning</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(data.adres)}${data.gemeente ? ' (gemeente ' + esc(data.gemeente) + ')' : ''}</td></tr>` : ''}
          ${data.tekeningen ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Bouwtekeningen</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(TEKENING_LABEL[data.tekeningen] || data.tekeningen)}</td></tr>` : ''}
          ${data.startMonth ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Gewenste start</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(startmaandLabel(data.startMonth))}${data.startMonthStatus ? ' — ' + esc(data.startMonthStatus) : ''}</td></tr>` : ''}
          ${data.listingUrl ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Woning online</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;"><a href="${esc(data.listingUrl)}" style="color:#1E4FC7;">${esc(data.listingUrl)}</a></td></tr>` : ''}
          ${(data.photos && data.photos.length) ? `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">Foto's achterzijde</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${data.photos.length} bijgevoegd als bijlage</td></tr>` : ''}
        </table>` : ''}
        ${data.message ? `<h2 style="font-size:15px;color:#1A2540;margin:0 0 8px;">Bericht</h2><p style="font-size:14px;color:#333;line-height:1.6;background:#f7f9fb;padding:12px 16px;border-radius:8px;margin:0 0 24px;">${esc(data.message)}</p>` : ''}
        <h2 style="font-size:15px;color:#1A2540;margin:0 0 12px;">Configuratie</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${rowsHtml}
          <tr><td style="padding:10px 12px;color:#1A2540;font-weight:700;font-size:15px;">Indicatieve totaalprijs</td><td style="padding:10px 12px;font-weight:800;color:#1E4FC7;font-size:16px;">${esc(cfg.total)}</td></tr>
        </table>
      </div>
      <div style="background:#0F1A2E;padding:16px 28px;">
        <p style="margin:0;color:#8493ad;font-size:12px;">Deze aanvraag is automatisch gegenereerd. Reageer rechtstreeks naar ${esc(data.email)} om de klant te bereiken.</p>
      </div>
    </div>
  </body></html>`;

  const lines = rows.map(r => `${r.label}: ${r.value}`).join('\n');
  const text = `Nieuwe offerte-aanvraag via AanEnUitbouw.nl\n\n` +
    `Naam: ${data.name}\nE-mail: ${data.email}\nTelefoon: ${data.phone || '—'}\n\n` +
    (data.adres ? `Adres woning: ${data.adres}${data.gemeente ? ' (gemeente ' + data.gemeente + ')' : ''}\n` : '') +
    (data.tekeningen ? `Bouwtekeningen: ${TEKENING_LABEL[data.tekeningen] || data.tekeningen}\n` : '') +
    (data.startMonth ? `Gewenste start: ${startmaandLabel(data.startMonth)}${data.startMonthStatus ? ' (' + data.startMonthStatus + ')' : ''}\n` : '') +
    (data.listingUrl ? `Woning online: ${data.listingUrl}\n` : '') +
    ((data.photos && data.photos.length) ? `Foto's achterzijde: ${data.photos.length} als bijlage\n` : '') +
    ((data.startMonth || data.listingUrl || (data.photos && data.photos.length)) ? '\n' : '') +
    (data.message ? `Bericht:\n${data.message}\n\n` : '') +
    `Configuratie:\n${lines}\nIndicatieve totaalprijs: ${cfg.total}\n`;

  return { html, text };
}

function buildCustomerEmail(data) {
  const cfg = data.config || {};
  const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
  const rowsHtml = rows.map(r =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#555;">${esc(r.label)}</td>` +
    `<td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1A2540;">${esc(r.value)}</td></tr>`
  ).join('');

  const firstName = oneLine(data.name).split(' ')[0] || '';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:Arial,Helvetica,sans-serif;background:#f2f4f6;padding:24px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:#1E4FC7;padding:28px;">
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFkAAABOCAYAAABL2LqMAAAEDklEQVR4nO2cPYgkRRTH/697ZvZDWDRQMFK5TEHU4JITdjPNRDE38DgzETEQk9kxukBQNBPBS0wOBAPBQOFY4SIzRQxcYQ0XwVPudMfpj79Bv7LL3hlv79x93dPzfjD0NN0z/fo3VdVdr6sGcBzHcRznbCApJJO24+glJKWx7qJPEy29qb7/hOSb+n7YbmQ9guRAl5dZ82K8zfkfhNJK8m2VOyOZk8xIPq/bXPTdEgl+QwVnuiz1lZPc0X1c9J0SCb4YCS6j5qLQ9V9Jntd9XfRJiQS/1BDapNDlDZJP6mdc9O2ILnLPaOldJDiQ6/KA5MP62bTVk+gyDcHTqO29HUH0PsmH9DtcdBPW98FPkPyj0RychHBR/I7kln6Xd1gCkeDHSR7eheCm6Oskt+hd8IpI8COR4Py4vzsW/TXJdOVFR4IfJPn9KQgOzHR5NUhmI/exEoTSRfL+UxYcCCX6qh4nXSnRkeANVtU6lnKahBL9nh5vNUSzqroJyU2SX52h4Kbod/T4/e6s8N8py88aEs6ScIy39Nj9TJGq4NDZuGIomKw6NKG2vKox9Et0Q/BHerJn2UQsEh0urJc0lv6IjgSHnLC14EAQnbPORS+/aNYZtUnLggNxLvo5jW15L4asS/AreoLNnHBbhMzeEetc9PIllFgLfllPrCuCA3EuuvOij93ck0xFpCD5AoBPARQAknn7tkyJKq4bAM6LyD7JRETKluM6xrzxEARwAcCXAEa6T9cEBwoAKYCfADwN4BAARIRtBtWkmeFKNMALANZRnURXBQOV4BLAOQDnNPbOZe0WBXSEqkR3WXBAUInO2g5kEYskd7EN/i86HW/nqlYfcckGuGQDXLIBLtkAl2yASzbAJRuwvLnYBkc4SrevjQfv//hFun1tbN8x2QF2gHIik2MJqmaCaCAiOcnXALwLIEf3f4jQ/X9URH5oO5h5dF3giShY4vL+hxef/ebSwWa6nmQsjNOd5NrWukxvZt9+/tQHexiPE0zqEr3UkrUIS8ECB+nh66N715FghDXjTCfzEqP7NvDXb9OPAext7yDZm6AfkmOKW1mRZVOKFCDM08m5pDKAyM15G3sjGYK0vecLBEQGsuBuzW/hDHDJBrhkA1yyAS7ZAJdsgEs2wCUb4JINcMkGuGQDXLIBLtkAl2yASzbAJRvgkg1wyQa4ZAMWPeMjqvkinZ4zEgZckPxnPbwsEaAgICKYOxRhkeQRqkkvnZ0bB9TVcC0dYbg5wnAwxFCG5k+rWZTp8J4RZr9PN+Ztb0oO0f0M4DrqKVydZlbmyP6cIZvNkAjtJYsU6a1ZKqhGMD3wy2OdmuK2Esxtb1n9DU1n2+J57O7uYgJg3GIMk90JIfYjaxzHcRzHWTX+Bhq6zFcSK8tdAAAAAElFTkSuQmCC" alt="AanEnUitbouw.nl" width="50" height="44" style="display:block;border:0;">
        <h1 style="margin:14px 0 0;color:#fff;font-size:22px;">Bedankt voor uw aanvraag${firstName ? ', ' + esc(firstName) : ''}!</h1>
        <p style="margin:8px 0 0;color:#cdd9f5;font-size:14px;line-height:1.5;">We hebben uw configuratie goed ontvangen en nemen zo snel mogelijk contact met u op.</p>
      </div>
      <div style="padding:28px;">
        <p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 20px;">
          Hieronder vindt u een overzicht van de configuratie die u heeft samengesteld. De genoemde prijs is een richtprijs — na een vrijblijvend gesprek en eventueel een opname ter plaatse stellen we een definitieve offerte op.
        </p>
        ${data.startMonth ? `<p style="font-size:14px;color:#333;line-height:1.6;margin:0 0 20px;padding:14px 18px;background:#eef3fd;border-radius:10px;">Uw voorkeur voor de start van de werkzaamheden: <strong>${esc(startmaandLabel(data.startMonth))}</strong>. Wij houden daar in de planning rekening mee en laten u weten wat haalbaar is.</p>` : ''}
        <h2 style="font-size:15px;color:#1A2540;margin:0 0 12px;">Uw configuratie</h2>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          ${rowsHtml}
          <tr><td style="padding:10px 12px;color:#1A2540;font-weight:700;font-size:15px;">Indicatieve totaalprijs</td><td style="padding:10px 12px;font-weight:800;color:#1E4FC7;font-size:16px;">${esc(cfg.total)}</td></tr>
        </table>
        <div style="margin:24px 0 0;padding:16px 20px;background:#f7f9fb;border-radius:10px;">
          <p style="margin:0 0 4px;font-size:13px;color:#555;">Heeft u een vraag of wilt u sneller schakelen?</p>
          <p style="margin:0;font-size:15px;color:#1A2540;font-weight:700;">Bel ons gerust op +31 646 150 160</p>
        </div>
      </div>
      <div style="background:#0F1A2E;padding:20px 28px;">
        <p style="margin:0 0 4px;color:#fff;font-size:14px;font-weight:700;">AanEnUitbouw.nl</p>
        <p style="margin:0;color:#8493ad;font-size:12px;line-height:1.6;">Creditline BV · KvK 59683198 · BTW NL853603108B01<br>project@aanenuitbouw.nl · +31 646 150 160</p>
      </div>
    </div>
  </body></html>`;

  const lines = rows.map(r => `${r.label}: ${r.value}`).join('\n');
  const text = `Bedankt voor uw aanvraag${firstName ? ', ' + firstName : ''}!\n\n` +
    `We hebben uw configuratie ontvangen en nemen zo snel mogelijk contact met u op.\n\n` +
    (data.startMonth ? `Uw voorkeur voor de start: ${startmaandLabel(data.startMonth)}\n\n` : '') +
    `Uw configuratie:\n${lines}\nIndicatieve totaalprijs: ${cfg.total}\n\n` +
    `De genoemde prijs is een richtprijs. Na een vrijblijvend gesprek stellen we een definitieve offerte op.\n\n` +
    `Vragen? Bel ons op +31 646 150 160.\n\n` +
    `AanEnUitbouw.nl\nCreditline BV · KvK 59683198\nproject@aanenuitbouw.nl`;

  return { html, text };
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Eén poging tot verzenden, met een harde timeout zodat de server niet blijft hangen
async function _sendOnce(payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Adres instelbaar zodat de verzendweg te testen is zonder echte mail.
    const res = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const err = new Error(`Resend ${res.status}: ${errText}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Verstuurt met timeout + één retry bij tijdelijke fouten (timeout of 5xx / 429)
async function sendEmail(payload) {
  const TIMEOUT_MS = 15000;
  try {
    return await _sendOnce(payload, TIMEOUT_MS);
  } catch (e) {
    // Bepaal of opnieuw proberen zinvol is: timeout (AbortError) of tijdelijke serverfout
    const isTimeout = e.name === 'AbortError';
    const isTemporary = isTimeout || e.status === 429 || (e.status >= 500 && e.status <= 599);
    if (!isTemporary) throw e; // 4xx zoals ongeldig adres: niet opnieuw proberen
    console.warn('Resend tijdelijke fout, opnieuw proberen over 2s:', isTimeout ? 'timeout' : e.message);
    await _sleep(2000);
    return await _sendOnce(payload, TIMEOUT_MS);
  }
}

async function sendQuoteEmails(data) {
  // 1. Interne notificatie naar het bedrijf (kritiek — fout hierop laat de hele aanvraag falen)
  const internal = buildQuoteEmail(data);

  // Foto's gaan alleen naar het bedrijf mee, niet terug naar de klant: die heeft
  // ze zelf al, en het houdt de bevestigingsmail klein en betrouwbaar.
  const bijlagen = (data.photos || []).map(foto => ({
    filename: foto.filename,
    content: foto.data,
  }));

  await sendEmail({
    from: QUOTE_FROM,
    to: [QUOTE_TO],
    reply_to: data.email,
    subject: `Offerte-aanvraag ${oneLine(data.name)}${data.adres ? ' — ' + oneLine(data.adres) : ''}${data.startMonth ? ' — start ' + startmaandLabel(data.startMonth) : ''}`,
    html: internal.html,
    text: internal.text,
    ...(bijlagen.length ? { attachments: bijlagen } : {}),
  });

  // 2. Bevestiging naar de klant (best-effort — als dit faalt is de aanvraag alsnog binnen)
  try {
    const customer = buildCustomerEmail(data);
    await sendEmail({
      from: QUOTE_FROM,
      to: [data.email],
      reply_to: QUOTE_TO,
      subject: 'Bedankt voor uw aanvraag bij AanEnUitbouw.nl',
      html: customer.html,
      text: customer.text,
    });
  } catch (e) {
    console.error('Bevestigingsmail naar klant mislukt (aanvraag is wel binnen):', e.message);
  }
}

function serveStatic(req, res, urlPath) {
  if (urlPath === '/' || urlPath === '') urlPath = '/configurator.html';
  if (urlPath === '/project' || urlPath === '/project/') urlPath = '/project.html';

  // Broncode en projectbestanden niet uitleveren. serveStatic serveert alles
  // onder ROOT, dus zonder deze check zijn /server.js, /package.json en de
  // inhoud van /src publiek leesbaar.
  if (/^\/(server\.js|package(-lock)?\.json|src\/|node_modules\/|\.git|\.env)/i.test(urlPath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Niet gevonden');
    return;
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Niet gevonden');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/prices' && req.method === 'GET') {
    try {
      const prices = await readPrices();
      if (!prices) return jsonResponse(res, 404, { message: 'No prices set yet' });
      return jsonResponse(res, 200, prices);
    } catch (e) {
      console.error('Read prices error:', e.message);
      return jsonResponse(res, 500, { error: 'Serverfout bij lezen' });
    }
  }

  if (pathname === '/api/prices' && req.method === 'POST') {
    if (await adminGeweigerd(req, res)) return;
    try {
      const body = await readJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return jsonResponse(res, 400, { error: 'Body moet een object zijn' });
      }
      for (const k in body) {
        if (typeof body[k] !== 'number' || body[k] < 0 || !isFinite(body[k])) {
          return jsonResponse(res, 400, { error: `Ongeldige waarde voor ${k}` });
        }
      }
      await writePrices(body);
      return jsonResponse(res, 200, { success: true });
    } catch (e) {
      console.error('Write prices error:', e.message);
      return jsonResponse(res, 400, { error: e.message || 'Opslaan mislukt' });
    }
  }

  if (pathname === '/api/auth/check' && req.method === 'POST') {
    const ip = clientIp(req);
    if (adminTooManyFails(ip)) {
      return jsonResponse(res, 429, { error: 'Te veel mislukte inlogpogingen — probeer het over 15 minuten opnieuw' });
    }
    const ok = checkAuth(req);
    if (ok) {
      adminClearFails(ip);
    } else {
      adminRegisterFail(ip);
      await _sleep(300);
    }
    return jsonResponse(res, ok ? 200 : 401, { ok });
  }

  if (pathname === '/api/quote' && req.method === 'POST') {
    if (!RESEND_API_KEY) {
      console.error('Quote endpoint aangeroepen maar RESEND_API_KEY ontbreekt');
      return jsonResponse(res, 503, { error: 'E-mailverzending is niet geconfigureerd' });
    }
    if (!quoteAllowed(clientIp(req))) {
      return jsonResponse(res, 429, { error: 'Te veel aanvragen — probeer het later opnieuw of bel ons direct.' });
    }
    if (quoteGlobaal.bereikt()) {
      return jsonResponse(res, 429, {
        error: 'Er komen nu ongewoon veel aanvragen binnen. Bel ons op +31 646 150 160, dan helpen we u direct.',
      });
    }
    try {
      // Ruimere limiet dan de rest: hier kunnen fotobijlagen in zitten.
      const body = await readJsonBody(req, QUOTE_BODY_MAX);
      const name = oneLine(body.name).slice(0, 120);
      const email = oneLine(body.email).slice(0, 254);
      const phone = oneLine(body.phone).slice(0, 40);
      const message = String(body.message == null ? '' : body.message).slice(0, 3000);
      if (!name) return jsonResponse(res, 400, { error: 'Naam is verplicht' });
      if (!isValidEmail(email)) return jsonResponse(res, 400, { error: 'Ongeldig e-mailadres' });

      // config beperkt overnemen (alleen wat we tonen in de mail)
      const cfgIn = (body.config && typeof body.config === 'object') ? body.config : {};
      const rows = Array.isArray(cfgIn.rows)
        ? cfgIn.rows.slice(0, 40).map(r => ({
            label: oneLine(r && r.label).slice(0, 80),
            value: oneLine(r && r.value).slice(0, 120),
          }))
        : [];
      const config = { rows, total: oneLine(cfgIn.total).slice(0, 40) };

      const adresWoning = oneLine(body.adres).slice(0, 200);
      const gemeente = oneLine(body.gemeente).slice(0, 80);
      const tekeningen = ['heb-ik', 'opvragen', 'geen'].includes(String(body.tekeningen)) ? String(body.tekeningen) : '';
      // Valstrik: een bezoeker ziet dit veld niet en vult het dus nooit in. Is
      // het gevuld, dan doen we alsof het gelukt is en verwerken we niets. Een
      // foutmelding zou de bot alleen leren hoe hij het volgende keer beter doet.
      if (oneLine(body.website)) {
        console.log('Aanvraag geweigerd door de valstrik');
        return jsonResponse(res, 200, { success: true });
      }

      // Tijdslot: hoelang stond het formulier open voordat het werd verstuurd?
      const invultijd = Number(body.invultijdMs);
      if (Number.isFinite(invultijd) && invultijd >= 0 && invultijd < FORMULIER_MINIMUM_MS) {
        console.log(`Aanvraag geweigerd: formulier na ${invultijd} ms verstuurd (minimum ${FORMULIER_MINIMUM_MS})`);
        // Zelfde antwoord als bij succes: een bot mag niet leren waaróp hij faalt.
        return jsonResponse(res, 200, { success: true });
      }

      if (!(await turnstileGeldig(body.turnstileToken, clientIp(req)))) {
        return jsonResponse(res, 400, {
          error: 'De controle of u een mens bent is niet gelukt. Vernieuw de pagina en probeer het opnieuw.',
        });
      }

      if (mailPerDag.bereikt()) {
        return jsonResponse(res, 503, {
          error: 'We kunnen vandaag geen aanvragen meer verwerken. Bel ons op +31 646 150 160.',
        });
      }

      const startMonth = schoonStartmaand(body.startMonth);
      const listingUrl = schoonWebadres(body.listingUrl);
      const photos = schoonFotos(body.photos);
      const startMonthStatus = oneLine(body.startMonthStatus).slice(0, 40);

      if (photos.length) {
        const totaal = photos.reduce((som, p) => som + p.bytes, 0);
        console.log(`Offerte-aanvraag met ${photos.length} foto('s), samen ${Math.round(totaal / 1024)} kB`);
      }

      await sendQuoteEmails({
        name, email, phone, message, config,
        startMonth, startMonthStatus, listingUrl, photos,
        adres: adresWoning, gemeente, tekeningen,
      });
      return jsonResponse(res, 200, { success: true });
    } catch (e) {
      console.error('Quote send error:', e.message);
      return jsonResponse(res, 502, { error: 'Verzenden mislukt — probeer het later opnieuw' });
    }
  }

  // ---- Beschikbaarheid (planning) ----
  if (pathname === '/api/planning' && req.method === 'GET') {
    try {
      const planning = await readDataFile(PLANNING_FILE);
      if (!planning) return jsonResponse(res, 404, { message: 'Geen planning ingesteld' });
      return jsonResponse(res, 200, planning);
    } catch (e) {
      console.error('Read planning error:', e.message);
      return jsonResponse(res, 500, { error: 'Serverfout bij lezen' });
    }
  }

  if (pathname === '/api/planning' && req.method === 'POST') {
    if (await adminGeweigerd(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const months = (body && typeof body.months === 'object' && !Array.isArray(body.months)) ? body.months : null;
      if (!months) return jsonResponse(res, 400, { error: 'months-object verplicht' });
      const clean = {};
      let count = 0;
      for (const ym in months) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return jsonResponse(res, 400, { error: `Ongeldige maand: ${ym}` });
        if (!PLANNING_STATUSES.includes(months[ym])) return jsonResponse(res, 400, { error: `Ongeldige status voor ${ym}` });
        clean[ym] = months[ym];
        if (++count > 24) return jsonResponse(res, 400, { error: 'Maximaal 24 maanden' });
      }
      await writeDataFile(PLANNING_FILE, { months: clean, updated: new Date().toISOString() });
      return jsonResponse(res, 200, { success: true });
    } catch (e) {
      console.error('Write planning error:', e.message);
      return jsonResponse(res, 400, { error: e.message || 'Opslaan mislukt' });
    }
  }

  // ---- Projectmonitor: publieke code-check (rate limited) ----
  if (pathname === '/api/project' && req.method === 'GET') {
    const ip = clientIp(req);
    if (!projectLookupAllowed(ip)) return jsonResponse(res, 429, { error: 'Te veel pogingen — probeer het over 10 minuten opnieuw' });
    const code = String(url.searchParams.get('code') || '').toUpperCase().trim();
    if (!/^AEB-[A-Z2-9]{5}$/.test(code)) {
      return jsonResponse(res, 400, { error: 'Ongeldige projectcode' });
    }
    try {
      const projects = await loadProjects();
      const p = projects[code];
      // Kleine vertraging tegen brute force, ook bij treffers (timing-neutraal)
      await _sleep(400);
      if (!p) return jsonResponse(res, 404, { error: 'Projectcode niet gevonden' });
      return jsonResponse(res, 200, {
        label: p.label,
        phase: p.phase,
        notes: p.notes || {},
        type: p.type || '',
        plan: p.plan || '',
        updated: p.updated,
      });
    } catch (e) {
      console.error('Read project error:', e.message);
      return jsonResponse(res, 500, { error: 'Serverfout bij lezen' });
    }
  }

  // ---- Projectmonitor: beheer (admin) ----
  if (pathname === '/api/projects' && req.method === 'GET') {
    if (await adminGeweigerd(req, res)) return;
    try {
      const projects = await loadProjects();
      return jsonResponse(res, 200, projects);
    } catch (e) {
      console.error('List projects error:', e.message);
      return jsonResponse(res, 500, { error: 'Serverfout bij lezen' });
    }
  }

  if (pathname === '/api/projects' && req.method === 'POST') {
    if (await adminGeweigerd(req, res)) return;
    try {
      const body = await readJsonBody(req);
      const action = String(body.action || '');
      const projects = await loadProjects();

      if (action === 'create') {
        const label = oneLine(body.label).slice(0, 120);
        if (!label) return jsonResponse(res, 400, { error: 'Label is verplicht (bijv. "Fam. Jansen — Almere")' });
        if (Object.keys(projects).length >= 200) return jsonResponse(res, 400, { error: 'Maximaal 200 projecten' });
        const code = generateProjectCode(projects);
        const now = new Date().toISOString();
        projects[code] = { label, phase: 0, notes: {}, type: '', plan: '', schema: PROJECTFASEN.SCHEMA, created: now, updated: now };
        await writeDataFile(PROJECTS_FILE, projects);
        return jsonResponse(res, 200, { success: true, code });
      }

      const code = String(body.code || '').toUpperCase().trim();
      if (!projects[code]) return jsonResponse(res, 404, { error: 'Project niet gevonden' });

      if (action === 'update') {
        const p = projects[code];
        if (body.phase !== undefined) {
          const phase = Number(body.phase);
          if (!Number.isInteger(phase) || phase < 0 || phase >= PROJECT_PHASE_COUNT) {
            return jsonResponse(res, 400, { error: 'Ongeldige fase' });
          }
          p.phase = phase;
        }
        if (body.label !== undefined) {
          const label = oneLine(body.label).slice(0, 120);
          if (!label) return jsonResponse(res, 400, { error: 'Label mag niet leeg zijn' });
          p.label = label;
        }
        if (body.type !== undefined) {
          const type = String(body.type || '');
          if (type && !PROJECT_TYPES.includes(type)) return jsonResponse(res, 400, { error: 'Ongeldig type' });
          p.type = type;
        }
        if (body.plan !== undefined) {
          const plan = String(body.plan || '');
          if (plan && !PROJECT_PLANNEN.includes(plan)) return jsonResponse(res, 400, { error: 'Ongeldig plan' });
          p.plan = plan;
        }
        if (body.notes !== undefined) {
          if (typeof body.notes !== 'object' || Array.isArray(body.notes)) {
            return jsonResponse(res, 400, { error: 'notes moet een object zijn' });
          }
          const clean = {};
          for (const k in body.notes) {
            const idx = Number(k);
            if (!Number.isInteger(idx) || idx < 0 || idx >= PROJECT_PHASE_COUNT) continue;
            const note = String(body.notes[k] == null ? '' : body.notes[k]).slice(0, 500).trim();
            if (note) clean[idx] = note;
          }
          p.notes = clean;
        }
        p.updated = new Date().toISOString();
        await writeDataFile(PROJECTS_FILE, projects);
        return jsonResponse(res, 200, { success: true });
      }

      if (action === 'delete') {
        delete projects[code];
        await writeDataFile(PROJECTS_FILE, projects);
        return jsonResponse(res, 200, { success: true });
      }

      return jsonResponse(res, 400, { error: 'Onbekende actie' });
    } catch (e) {
      console.error('Projects admin error:', e.message);
      return jsonResponse(res, 400, { error: e.message || 'Actie mislukt' });
    }
  }

  // Wat de frontend van de server moet weten. Bewust minimaal: alleen de
  // publieke Turnstile-sleutel, die per definitie in de pagina hoort te staan.
  if (pathname === '/api/publieke-config' && req.method === 'GET') {
    return jsonResponse(res, 200, { turnstileSitekey: TURNSTILE_SITEKEY });
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return jsonResponse(res, 200, {
      ok: true,
      hasAdminPassword: ADMIN_PASSWORD.length > 0,
      hasResendKey: RESEND_API_KEY.length > 0,
      quoteTo: QUOTE_TO,
      turnstile: TURNSTILE_SECRET ? 'actief' : 'niet ingesteld',
      dataDirExists: fs.existsSync(DATA_DIR),
    });
  }

  // ===== Woningcheck (BAG, BRK, 3D BAG, luchtfoto) =====
  // Adres in, gebouwgegevens uit. Geeft false terug voor alles buiten
  // /woningcheck, dus de routes hieronder blijven ongemoeid.
  if (await require('./src/woningcheck').handle(req, res, url)) return;

  // ===== Bodemcheck / sondeertool (BRO) =====
  // Openbare sondeergegevens uit de Basisregistratie Ondergrond met een
  // funderingsindicatie. Geeft false terug voor elk verzoek dat niet onder
  // /bodemcheck valt, dus serveStatic hieronder loopt dan gewoon door.
  if (await require('./src/sondeertool').handle(req, res, url)) return;

  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AanEnUitbouw.nl draait op poort ${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Admin password: ${ADMIN_PASSWORD ? 'ingesteld' : 'NIET INGESTELD — admin uitgeschakeld'}`);
  console.log(`Resend API key: ${RESEND_API_KEY ? 'ingesteld' : 'NIET INGESTELD — formulier-verzending uit'}`);
  console.log(`Offertes worden gemaild naar: ${QUOTE_TO}`);
});

// ---------------------------------------------------------------------------
// Nette afsluiting
// ---------------------------------------------------------------------------
// Bij elke deploy sluit Railway de oude container af met SIGTERM. Zonder een
// eigen afhandeling doodt Node zichzelf met exitcode 143, en npm -- dat
// `node server.js` verpakt -- rekent een signaal als een mislukking en sluit
// zelf met een foutcode. Railway ziet dan een niet-nul exitcode en stuurt een
// "Deployment crashed"-mail voor wat in werkelijkheid een normale herstart was.
//
// Met deze afhandeling sluiten we af met code 0: lopende verzoeken worden nog
// afgemaakt, daarna stopt het proces netjes. Een crashmail betekent vanaf nu dus
// dat er echt iets stuk is.

let afsluitenBezig = false;

function sluitNetjes(signaal) {
  if (afsluitenBezig) return;
  afsluitenBezig = true;
  console.log(`${signaal} ontvangen — server sluit af, lopende verzoeken worden afgemaakt`);

  server.close(() => {
    console.log('Alle verbindingen afgehandeld, afgesloten');
    process.exit(0);
  });

  // Keep-alive-verbindingen kunnen server.close() laten wachten. Vanaf Node 18.2
  // kunnen inactieve verbindingen direct dicht.
  if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();

  // Noodrem: hangt er toch iets, dan na acht seconden alsnog met code 0 stoppen.
  // Railway wacht standaard niet veel langer voordat het proces alsnog wordt
  // gedood, en dat zou opnieuw als crash worden gerapporteerd.
  setTimeout(() => {
    console.log('Afsluiten duurde te lang — nu forceren');
    process.exit(0);
  }, 8000).unref();
}

process.on('SIGTERM', () => sluitNetjes('SIGTERM'));
process.on('SIGINT', () => sluitNetjes('SIGINT'));

// Een echte fout moet juist WEL als crash zichtbaar zijn, maar dan met de
// volledige stack in de log zodat er iets aan te doen is. Zonder deze
// afhandeling verdwijnt de oorzaak soms in de opstartruis.
process.on('uncaughtException', (fout) => {
  console.error('ONVERWACHTE FOUT — server stopt:', fout && fout.stack ? fout.stack : fout);
  process.exit(1);
});

process.on('unhandledRejection', (reden) => {
  console.error('ONAFGEHANDELDE BELOFTE — server stopt:',
    reden && reden.stack ? reden.stack : reden);
  process.exit(1);
});
