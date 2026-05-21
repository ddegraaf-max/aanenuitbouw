const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || '/data';
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// Resend e-mail configuratie
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const QUOTE_FROM = process.env.QUOTE_FROM || 'AanEnUitbouw.nl <onboarding@resend.dev>';
const QUOTE_TO = process.env.QUOTE_TO || 'info@aanenuitbouw.nl';

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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let aborted = false;
    req.on('data', chunk => {
      if (aborted) return;
      body += chunk;
      if (body.length > 100000) {
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
        <p style="margin:0;color:#8493ad;font-size:12px;line-height:1.6;">Creditline BV · KvK 59683198 · BTW NL853603108B01<br>info@aanenuitbouw.nl · +31 646 150 160</p>
      </div>
    </div>
  </body></html>`;

  const lines = rows.map(r => `${r.label}: ${r.value}`).join('\n');
  const text = `Bedankt voor uw aanvraag${firstName ? ', ' + firstName : ''}!\n\n` +
    `We hebben uw configuratie ontvangen en nemen zo snel mogelijk contact met u op.\n\n` +
    `Uw configuratie:\n${lines}\nIndicatieve totaalprijs: ${cfg.total}\n\n` +
    `De genoemde prijs is een richtprijs. Na een vrijblijvend gesprek stellen we een definitieve offerte op.\n\n` +
    `Vragen? Bel ons op +31 646 150 160.\n\n` +
    `AanEnUitbouw.nl\nCreditline BV · KvK 59683198\ninfo@aanenuitbouw.nl`;

  return { html, text };
}

async function sendEmail(payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  return res.json();
}

async function sendQuoteEmails(data) {
  // 1. Interne notificatie naar het bedrijf (kritiek — fout hierop laat de hele aanvraag falen)
  const internal = buildQuoteEmail(data);
  await sendEmail({
    from: QUOTE_FROM,
    to: [QUOTE_TO],
    reply_to: data.email,
    subject: `Offerte-aanvraag van ${oneLine(data.name)}`,
    html: internal.html,
    text: internal.text,
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
    if (!checkAuth(req)) return jsonResponse(res, 401, { error: 'Unauthorized' });
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
    return jsonResponse(res, checkAuth(req) ? 200 : 401, { ok: checkAuth(req) });
  }

  if (pathname === '/api/quote' && req.method === 'POST') {
    if (!RESEND_API_KEY) {
      console.error('Quote endpoint aangeroepen maar RESEND_API_KEY ontbreekt');
      return jsonResponse(res, 503, { error: 'E-mailverzending is niet geconfigureerd' });
    }
    try {
      const body = await readJsonBody(req);
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

      await sendQuoteEmails({ name, email, phone, message, config });
      return jsonResponse(res, 200, { success: true });
    } catch (e) {
      console.error('Quote send error:', e.message);
      return jsonResponse(res, 502, { error: 'Verzenden mislukt — probeer het later opnieuw' });
    }
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return jsonResponse(res, 200, {
      ok: true,
      hasAdminPassword: ADMIN_PASSWORD.length > 0,
      hasResendKey: RESEND_API_KEY.length > 0,
      quoteTo: QUOTE_TO,
      dataDirExists: fs.existsSync(DATA_DIR),
    });
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`AanEnUitbouw.nl draait op poort ${PORT}`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Admin password: ${ADMIN_PASSWORD ? 'ingesteld' : 'NIET INGESTELD — admin uitgeschakeld'}`);
  console.log(`Resend API key: ${RESEND_API_KEY ? 'ingesteld' : 'NIET INGESTELD — formulier-verzending uit'}`);
  console.log(`Offertes worden gemaild naar: ${QUOTE_TO}`);
});
