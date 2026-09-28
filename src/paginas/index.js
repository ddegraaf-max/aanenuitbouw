'use strict';

/**
 * Losse pagina's van AanEnUitbouw.nl: /aanbouw, /uitbouw, /plannen-en-prijzen,
 * /prefab-of-klassiek, /dak-en-dakrand, /gevelbekleding, /pui-en-kozijnen,
 * /extras, /werkwijze, /veelgestelde-vragen, /projecten, /over-ons en /contact.
 *
 * Elk onderwerp heeft zo een eigen adres, titel en kop, zodat zoekmachines het
 * apart kunnen tonen. De homepage (configurator.html) blijft wat hij was.
 *
 * Aansluiten in server.js, vóór serveStatic:
 *
 *     if (await require('./src/paginas').handle(req, res, url)) return;
 *
 * Waar staat wat:
 *   teksten.js      alle teksten van deze pagina's
 *   basis.css       vormgeving, overgenomen van de homepage
 *                   (opnieuw maken met: node tools/maak-pagina-css.js)
 *   paginas.css     eigen vormgeving van deze pagina's
 *   opties.js       pagina's en blokken met opties, prijzen en vragen
 *   configurator.js leest opties, prijzen en berekening uit configurator.html
 *   ../../projectfasen.js   de negen stappen en de social-media-links
 *   prijzen         uit het beheerpaneel (DATA_DIR/prices.json)
 */

const fs = require('fs');
const path = require('path');

const T = require('./teksten');
const CONFIGURATOR = require('./configurator');
const PROJECTFASEN = require('../../projectfasen.js');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.DATA_DIR || '/data';
const PRICES_FILE = path.join(DATA_DIR, 'prices.json');
const SITE_URL = String(process.env.SITE_URL || T.SITE.url).replace(/\/+$/, '');

const lees = (naam) => fs.readFileSync(path.join(__dirname, naam), 'utf8').replace(/\r\n/g, '\n');
const CSS = lees('basis.css') + '\n' + lees('paginas.css');
const ILLUSTRATIE = {
  aanbouw: lees('illustraties/aanbouw.svg'),
  uitbouw: lees('illustraties/uitbouw.svg'),
};

// Regels uit projectfasen.js die alleen op de persoonlijke projectpagina
// kloppen ("ziet u dat hier in een update") blijven op de openbare pagina weg.
const ALLEEN_PROJECTPAGINA = [/ziet u dat hier in een update/i];

// ---------------------------------------------------------------------------
// Hulpjes
// ---------------------------------------------------------------------------

function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Tekst waarin alleen <strong> is toegestaan.
function rijk(t) {
  return esc(t).replace(/&lt;(\/?)strong&gt;/g, '<$1strong>');
}

function zonderOpmaak(t) {
  return String(t == null ? '' : t).replace(/<\/?strong>/g, '');
}

const euro = (n) => '€' + Math.round(n).toLocaleString('nl-NL');

// De prijzen zoals ze in het beheer zijn opgeslagen (leeg als er niets is ingesteld)
async function leesPrijzen() {
  try {
    const opgeslagen = JSON.parse(await fs.promises.readFile(PRICES_FILE, 'utf8'));
    return (opgeslagen && typeof opgeslagen === 'object') ? opgeslagen : {};
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[paginas] prices.json onleesbaar:', e.message);
    return {};
  }
}

function planPrijzen(opgeslagen) {
  const uit = {};
  for (const plan of T.PLANNEN) {
    const waarde = opgeslagen[plan.prijsSleutel];
    uit[plan.id] = (typeof waarde === 'number' && isFinite(waarde) && waarde > 0) ? waarde : plan.prijs;
  }
  return uit;
}

function whatsappLink(tekst) {
  const nummer = String(PROJECTFASEN.SOCIAL.whatsapp || T.SITE.telefoonLink).replace(/\D/g, '');
  return 'https://wa.me/' + nummer + (tekst ? '?text=' + encodeURIComponent(tekst) : '');
}

// ---------------------------------------------------------------------------
// Pictogrammen en logo (gelijk aan de homepage)
// ---------------------------------------------------------------------------

const ICOON = {
  telefoon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/></svg>',
  huis: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  foto: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  whatsapp: (maat) => `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="currentColor"/></svg>`,
  facebook: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z" fill="currentColor"/></svg>',
  instagram: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
};

function logo(kleurTekst, kleurHuis, kleurNl) {
  return `<svg class="brand-logo" viewBox="0 0 360 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(T.SITE.naam)}">
        <g transform="translate(2, 7)">
          <path d="M 4 22 L 20 5 L 36 22 L 36 50 L 4 50 Z" fill="${kleurHuis}"/>
          <rect x="36" y="32" width="24" height="18" fill="#4ECD6B"/>
        </g>
        <text x="76" y="44" font-family="Manrope, system-ui, sans-serif" font-size="30" font-weight="800" fill="${kleurTekst}" letter-spacing="-0.8">AanEnUitbouw<tspan fill="${kleurNl}">.nl</tspan></text>
      </svg>`;
}

// ---------------------------------------------------------------------------
// Vaste onderdelen: kop, voet, contact
// ---------------------------------------------------------------------------

function kopbalk(huidigPad) {
  const links = T.MENU.map((m) =>
    `<a href="${esc(m.pad)}"${m.pad === huidigPad ? ' aria-current="page"' : ''}>${esc(m.label)}</a>`).join('\n      ');
  return `<header class="site-header">
  <div class="header-inner">
    <a href="/" class="brand" aria-label="${esc(T.SITE.naam)} - terug naar start">
      ${logo('#1A2540', '#1E4FC7', '#1E4FC7')}
      <span class="brand-tag">${esc(T.SITE.slogan)}</span>
    </a>
    <nav class="main-nav" id="mainNav" aria-label="Hoofdmenu">
      ${links}
    </nav>
    <a href="tel:${esc(T.SITE.telefoonLink)}" class="contact-cta">BEL ONS: ${esc(T.SITE.telefoon)}</a>
    <button class="nav-toggle" id="navToggle" aria-label="Menu openen" aria-expanded="false" aria-controls="mainNav">
      <span></span><span></span><span></span>
    </button>
  </div>
</header>`;
}

function socialKnoppen(metTekst) {
  const s = PROJECTFASEN.SOCIAL || {};
  const uit = [];
  if (s.facebook) uit.push(`<a href="${esc(s.facebook)}" target="_blank" rel="noopener"${metTekst ? '' : ' aria-label="Creditline Montage op Facebook" title="Facebook"'}>${ICOON.facebook}${metTekst ? ' Facebook' : ''}</a>`);
  if (s.instagram) uit.push(`<a href="${esc(s.instagram)}" target="_blank" rel="noopener"${metTekst ? '' : ' aria-label="Creditline Montage op Instagram" title="Instagram"'}>${ICOON.instagram}${metTekst ? ' Instagram' : ''}</a>`);
  return uit;
}

function voetbalk() {
  const social = socialKnoppen(false);
  if (PROJECTFASEN.SOCIAL && PROJECTFASEN.SOCIAL.whatsapp) {
    social.push(`<a href="${esc(whatsappLink())}" target="_blank" rel="noopener" aria-label="Stuur ons een WhatsApp-bericht" title="WhatsApp">${ICOON.whatsapp(18)}</a>`);
  }
  const kolommen = T.VOET.map((k) => `<div class="footer-col">
        <div class="footer-kop">${esc(k.kop)}</div>
        ${k.links.map((l) => `<a href="${esc(l.pad)}"${l.nieuwTabblad ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a>`).join('\n        ')}
      </div>`).join('\n      ');
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-top vijf">
      <div class="footer-brand">
        <a href="/" aria-label="${esc(T.SITE.naam)}">
          ${logo('#FFFFFF', '#FFFFFF', '#4ECD6B')}
        </a>
        <p>${esc(T.SITE.voettekst)}</p>
        <div class="footer-contact">
          <a href="tel:${esc(T.SITE.telefoonLink)}">${esc(T.SITE.telefoon)}</a>
          <a href="mailto:${esc(T.SITE.email)}">${esc(T.SITE.email)}</a>
        </div>
        ${social.length ? `<div class="footer-social">${social.join('')}</div>` : ''}
      </div>
      ${kolommen}
    </div>
    <div class="footer-bottom">
      <div>© ${new Date().getFullYear()} ${esc(T.SITE.bedrijf)}. Alle rechten voorbehouden.</div>
      <div>KvK ${esc(T.SITE.kvk)} · BTW ${esc(T.SITE.btw)}</div>
    </div>
  </div>
</footer>`;
}

// Het blauwe contactblok, gelijk aan dat op de homepage. Op de contactpagina
// zelf staat de kop al bovenaan; daar blijft hij hier weg.
function contactBlok(opties = {}) {
  const c = T.BLOKKEN.contact;
  const social = socialKnoppen(true);
  const kopje = opties.zonderKop ? 'h2' : 'h3';
  return `<section id="contact" class="section section-blue${opties.zonderKop ? ' aansluitend' : ''}">
  <div class="container">
    ${opties.zonderKop ? '' : `<div class="section-eyebrow">${esc(c.kicker)}</div>
    <h2 class="section-title">${esc(c.kop)}</h2>
    <p class="section-sub">${esc(c.intro)}</p>
`}
    <div class="contact-grid">
      <div class="contact-info-list">
        <a href="tel:${esc(T.SITE.telefoonLink)}" class="contact-info-item">
          <div class="contact-info-icon">${ICOON.telefoon}</div>
          <div><div class="label">Telefoon</div><div class="value">${esc(T.SITE.telefoon)}</div></div>
        </a>
        <a href="${esc(whatsappLink(T.SITE.whatsappTekst))}" target="_blank" rel="noopener" class="contact-info-item">
          <div class="contact-info-icon">${ICOON.whatsapp(20)}</div>
          <div><div class="label">WhatsApp</div><div class="value">Stuur ons een bericht</div></div>
        </a>
        <a href="mailto:${esc(T.SITE.email)}" class="contact-info-item">
          <div class="contact-info-icon">${ICOON.mail}</div>
          <div><div class="label">E-mail</div><div class="value">${esc(T.SITE.email)}</div></div>
        </a>
        <div class="contact-info-item">
          <div class="contact-info-icon">${ICOON.huis}</div>
          <div>
            <div class="label">Bedrijfsgegevens</div>
            <div class="value" style="font-size: 14px; line-height: 1.5;">${esc(T.SITE.bedrijf)}<br>KvK ${esc(T.SITE.kvk)} · BTW ${esc(T.SITE.btw)}</div>
          </div>
        </div>
        ${social.length ? `<div class="contact-info-item">
          <div class="contact-info-icon">${ICOON.foto}</div>
          <div>
            <div class="label">Volg onze projecten</div>
            <div class="value" style="font-size: 14px; line-height: 1.5;">${esc(T.BLOKKEN.werk.social)}</div>
            <div class="contact-social">${social.join('')}</div>
          </div>
        </div>` : ''}
      </div>

      <div class="contact-cta-block">
        <${kopje}>${esc(c.ctaKop)}</${kopje}>
        <p>${esc(c.ctaTekst)}</p>
        <a href="/#configurator" class="btn btn-white">${esc(c.ctaKnop)}</a>
      </div>
    </div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Blokken
// ---------------------------------------------------------------------------

function sectieKop(b, metIntro) {
  return `<div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title${metIntro && b.intro ? '' : ' alleen'}">${esc(b.kop)}</h2>
    ${metIntro && b.intro ? `<p class="section-sub">${rijk(b.intro)}</p>` : ''}`;
}

function paginaKop(p) {
  return `<section class="hero pagina-hero">
  <div class="container hero-inner">
    <div>
      <ol class="kruimel" aria-label="Kruimelpad">
        <li><a href="/">${esc(T.SITE.naam)}</a></li>
        <li aria-current="page">${esc(p.broodkruimel)}</li>
      </ol>
      <div class="hero-eyebrow">${esc(p.kicker)}</div>
      <h1>${esc(p.kop)}</h1>
      <p class="hero-sub">${rijk(p.intro)}</p>
      <div class="hero-actions">
        <a href="/#configurator" class="btn btn-white">${esc(T.BLOKKEN.knoppen.configurator)}</a>
        <a href="tel:${esc(T.SITE.telefoonLink)}" class="btn btn-ghost">${esc(T.BLOKKEN.knoppen.bellen)}</a>
      </div>
    </div>
  </div>
</section>`;
}

// Aanbouw naast uitbouw. 'huidig' is de pagina waarop het blok staat.
function blokKeuze(huidig, klasse) {
  const kaart = (sleutel) => {
    const d = T.DIENSTEN[sleutel];
    return `<div class="dienst-hero-card${sleutel === huidig ? ' huidig' : ''}">
        <div class="dienst-hero-visual">
          ${ILLUSTRATIE[sleutel].trim()}
        </div>
        <div class="dienst-hero-body">
          <h3>${esc(d.naam)}</h3>
          <p>${rijk(d.tekst)}</p>
          ${sleutel === huidig ? '' : `<a class="meer-link" href="${esc(d.pad)}">${esc(d.meer)}</a>`}
        </div>
      </div>`;
  };
  const volgorde = huidig === 'uitbouw' ? ['uitbouw', 'aanbouw'] : ['aanbouw', 'uitbouw'];
  const b = T.BLOKKEN.keuze;
  // De vraag zelf komt uit het huisbezoek (projectfasen.js, stap 1)
  const vraag = (PROJECTFASEN.FASEN[0].wat.find((r) => /^Aanbouw of uitbouw:/.test(r)) || '').replace(/^Aanbouw of uitbouw:\s*/, '');
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title">${esc(b.kop)}</h2>
    <p class="section-sub">${esc(vraag.charAt(0).toUpperCase() + vraag.slice(1))}</p>
    <div class="diensten-hero-grid">
      ${volgorde.map(kaart).join('\n      ')}
    </div>
    <p class="voetnoot">${esc(T.CONFIGURATOR.verschil)}</p>
  </div>
</section>`;
}

// Wat er te kiezen valt: de punten uit het huisbezoek (projectfasen.js, stap 1)
function blokSamenstellen(klasse) {
  const b = T.BLOKKEN.samenstellen;
  const doel = [
    [/^Afmetingen/, T.PAGINAS.dak],
    [/^Gevel en dakrand/, T.PAGINAS.gevel],
    [/^Kozijnen en deuren/, T.PAGINAS.kozijn],
    [/^Afwerkingsniveau/, T.PAGINAS.plannen],
  ];
  const keuzes = PROJECTFASEN.FASEN[0].wat
    .map((r) => ({ tekst: r, pagina: (doel.find(([re]) => re.test(r)) || [])[1] }))
    .filter((k) => k.pagina);
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title alleen">${esc(b.kop)}</h2>
    <ul class="punten">
      ${keuzes.map((k) => `<li>${esc(k.tekst)} <a class="meer-link" href="${esc(k.pagina.pad)}">${esc(k.pagina.broodkruimel)}</a></li>`).join('\n      ')}
    </ul>
    <div class="samenstel-kaart">
      <p>${esc(b.tekst)}</p>
      <a href="/#configurator" class="btn btn-white">${esc(b.knop)}</a>
    </div>
  </div>
</section>`;
}

function bouwwijzeKaart(k, uitgelicht, kopje) {
  return `<article class="bouwwijze-card${uitgelicht ? ' featured' : ''}">
        ${k.badge ? `<span class="plan-badge">${esc(k.badge)}</span>` : ''}
        <div class="bouwwijze-kop">
          <span class="bouwwijze-tag">${esc(k.tag)}</span>
          <${kopje}>${esc(k.kop)}</${kopje}>
          <p>${esc(k.tekst)}</p>
        </div>
        <ul class="bouwwijze-lijst">
          ${k.plus.map((r) => `<li class="plus">${esc(r)}</li>`).join('\n          ')}
          ${k.min.map((r) => `<li class="min">${esc(r)}</li>`).join('\n          ')}
        </ul>
      </article>`;
}

// Kort: alleen hoe wij bouwen, met een link naar de vergelijking
function blokKlassiek(klasse) {
  const b = T.BLOKKEN.klassiek;
  const k = T.BOUWWIJZE.klassiek;
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title">${esc(b.kop)}</h2>
    <p class="section-sub">${esc(k.tekst)}</p>
    <ul class="punten">
      ${k.plus.map((r) => `<li>${esc(r)}</li>`).join('\n      ')}
    </ul>
    <div class="blok-link"><a class="meer-link" href="${esc(T.PAGINAS.bouwwijze.pad)}">${esc(b.link)}</a></div>
  </div>
</section>`;
}

function planKaarten(prijzen) {
  const b = T.BLOKKEN.plannen;
  return `<div class="plannen-grid">
      ${T.PLANNEN.map((p) => `<div class="plan-card${p.badge ? ' featured' : ''}">
        ${p.badge ? `<span class="plan-badge">${esc(p.badge)}</span>` : ''}
        <div class="plan-name">${esc(p.naam)}</div>
        <div class="plan-price-from">${esc(b.vanaf)}</div>
        <div class="plan-price">
          <span class="plan-price-main">${esc(euro(prijzen[p.id]))}</span>
          <span class="plan-price-unit">/m²</span>
        </div>
        <ul class="plan-features">
          ${p.punten.map((r) => `<li>${esc(r)}</li>`).join('\n          ')}
          ${p.extra ? `<li class="extra">${esc(p.extra)}</li>` : ''}
        </ul>
        <a href="/#configurator" class="btn ${p.badge ? 'btn-primary' : 'btn-secondary'}">${esc(b.knop)}</a>
      </div>`).join('\n      ')}
    </div>`;
}

function blokPlannen(prijzen, klasse) {
  const b = T.BLOKKEN.plannen;
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title">${esc(b.kop)}</h2>
    <p class="section-sub">${esc(b.intro)}</p>
    ${planKaarten(prijzen)}
    <div class="blok-link"><a class="meer-link" href="${esc(T.PAGINAS.plannen.pad)}">${esc(b.link)}</a></div>
  </div>
</section>`;
}

// De negen stappen in het kort. Bij een aanbouw vervalt het openen van de gevel.
function blokStappenKort(soort, klasse) {
  const b = T.BLOKKEN.stappen;
  const items = PROJECTFASEN.FASEN.map((f) => {
    const vervalt = f.alleenBij && soort && f.alleenBij !== soort;
    return `<li${vervalt ? ' class="vervalt"' : ''}>
        <h3>${esc(f.titel)}</h3>
        <p>${esc(vervalt ? f.nvt : f.kort)}</p>
      </li>`;
  });
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title">${esc(b.kop)}</h2>
    <p class="section-sub">${esc(T.PAGINAS.werkwijze.intro)}</p>
    <ol class="stappen-kort">
      ${items.join('\n      ')}
    </ol>
    <div class="blok-link"><a class="meer-link" href="${esc(T.PAGINAS.werkwijze.pad)}">${esc(b.link)}</a></div>
  </div>
</section>`;
}

// Staat er naast de foto een kleinere versie (naam-800.webp en naam-1200.webp),
// dan krijgt de bezoeker die: dat laadt sneller, vooral op een telefoon.
// Ontbreken ze, dan wordt gewoon de foto zelf getoond.
function projectFoto(p, direct) {
  const basis = p.foto.replace(/.[a-z0-9]+$/i, '');
  const er = (w) => fs.existsSync(path.join(ROOT, `${basis}-${w}.webp`));
  const laden = direct ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const img = `<img class="werk-card-img" src="${esc(p.foto)}" alt="${esc(p.alt)}" ${laden} width="1200" height="900">`;
  if (!er(800) || !er(1200)) return img;
  return `<picture>
          <source type="image/webp" srcset="${esc(basis)}-800.webp 800w, ${esc(basis)}-1200.webp 1200w" sizes="(max-width: 560px) 100vw, (max-width: 880px) 50vw, 400px">
          ${img}
        </picture>`;
}

function projectKaarten(kopje, eersteDirect) {
  return `<div class="werk-grid${T.PROJECTEN.length < 3 ? ' few' : ''}">
      ${T.PROJECTEN.map((p, i) => `<article class="werk-card">
        ${projectFoto(p, eersteDirect && i === 0)}
        <div class="werk-card-body">
          <span class="werk-card-tag">${esc(p.soort)}</span>
          <${kopje} class="werk-card-title">${esc(p.titel)}</${kopje}>
          <p class="werk-card-desc">${esc(p.tekst)}</p>
        </div>
      </article>`).join('\n      ')}
    </div>`;
}

function blokProjecten(klasse) {
  const b = T.BLOKKEN.werk;
  return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(b.kicker)}</div>
    <h2 class="section-title">${esc(b.kop)}</h2>
    <p class="section-sub">${esc(b.intro)}</p>
    ${projectKaarten('h3')}
    <div class="blok-link"><a class="meer-link" href="${esc(T.PAGINAS.projecten.pad)}">${esc(b.link)}</a></div>
  </div>
</section>`;
}

function partnerKaart() {
  const p = T.PARTNER;
  return `<div class="partner-card">
      <div class="partner-logo">
        <a href="${esc(p.site)}" target="_blank" rel="noopener" aria-label="Naar de website van ${esc(p.naam)}">
          <img src="${esc(p.logo)}" alt="${esc(p.naam)}" loading="lazy">
        </a>
        <div class="partner-meta">${esc(p.meta)}<br><a href="${esc(p.site)}" target="_blank" rel="noopener">${esc(p.siteLabel)}</a></div>
      </div>
      <div class="partner-body">
        ${p.blokken.map((b) => `<h3>${esc(b.kop)}</h3>
        <p>${esc(b.tekst)}</p>`).join('\n        ')}
        <div class="partner-diensten">
          <span class="partner-diensten-kop">${esc(p.dienstenKop)}</span>
          ${p.diensten.map((d) => `<span>${esc(d)}</span>`).join('')}
        </div>
        <a href="${esc(p.site)}" target="_blank" rel="noopener" class="btn btn-secondary partner-btn">${esc(p.knop)}</a>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// De pagina's
// ---------------------------------------------------------------------------

function paginaDienst(soort, ctx) {
  const prijzen = ctx.prijzen;
  const p = T.PAGINAS[soort];
  const delen = [
    paginaKop(p),
    blokKeuze(soort, 'section-paper'),
  ];
  if (ctx.g) {
    delen.push(OPTIES.blokRekenvoorbeelden(ctx.g, [soort], 'section-light'));
    delen.push(OPTIES.blokOpbouw(ctx.g, soort, 'section-paper'));
  }
  delen.push(blokSamenstellen('section-light'));
  if (soort === 'uitbouw') {
    // Het openen van de gevel en de draagbalk: stap 5 uit projectfasen.js
    const f = PROJECTFASEN.FASEN.find((x) => x.id === 'draagbalk');
    const partner = T.PARTNER.blokken[1].tekst.split('. ')[0] + '.';
    delen.push(`<section class="section section-paper">
  <div class="container">
    <div class="section-eyebrow">${esc(T.PARTNER.kicker)}</div>
    <h2 class="section-title">${esc(f.titel)}</h2>
    <p class="section-sub">${esc(f.kort)}</p>
    <ul class="punten">
      ${f.wat.filter((r) => !/^Bij een aanbouw/.test(r)).map((r) => `<li>${esc(r)}</li>`).join('\n      ')}
      <li>${esc(partner)}</li>
    </ul>
    <div class="blok-link"><a class="meer-link" href="${esc(T.PAGINAS.over.pad)}#samenwerking">${esc(T.PARTNER.kop)}</a></div>
  </div>
</section>`);
    delen.push(blokKlassiek('section-light'));
    delen.push(blokPlannen(prijzen, 'section-paper'));
    delen.push(blokStappenKort(soort, 'section-light'));
    delen.push(blokProjecten('section-paper'));
  } else {
    delen.push(blokKlassiek('section-paper'));
    delen.push(blokPlannen(prijzen, 'section-light'));
    delen.push(blokStappenKort(soort, 'section-paper'));
  }
  delen.push(contactBlok());
  return { p, inhoud: delen.join('\n\n'), soortGegevens: 'dienst', dienst: T.DIENSTEN[soort] };
}

function paginaPlannen(ctx) {
  const prijzen = ctx.prijzen;
  const p = T.PAGINAS.plannen;
  const afwerking = PROJECTFASEN.FASEN.find((x) => x.id === 'binnenafwerking');
  const offerte = PROJECTFASEN.FASEN.find((x) => x.id === 'offerte');
  // "Uw plan is Casco: wij leveren ..." -> "Wij leveren ..."
  const perPlan = (id) => {
    const t = String((afwerking.perPlan || {})[id] || '').replace(/^Uw plan is [^:]+:\s*/, '');
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const palen = offerte.wat.find((r) => /schroefpalen/i.test(r)) || '';
  const inhoud = [
    paginaKop(p),
    `<section class="section section-light">
  <div class="container">
    ${planKaarten(prijzen)}
    ${palen ? `<p class="voetnoot">${esc(palen)}</p>` : ''}
  </div>
</section>`,
    `<section class="section section-paper">
  <div class="container">
    <div class="section-eyebrow">${esc(p.niveauKicker)}</div>
    <h2 class="section-title alleen">${esc(p.niveauKop)}</h2>
    <div class="over-grid">
      ${T.PLANNEN.map((plan) => `<div class="over-block">
        <h3>${esc(plan.naam)}</h3>
        <p>${esc(perPlan(plan.id))}</p>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`,
    ...(ctx.g ? [
      OPTIES.blokRekenvoorbeelden(ctx.g, ['aanbouw', 'uitbouw'], 'section-light'),
      OPTIES.blokOpbouw(ctx.g, ctx.g.standaard.type, 'section-paper'),
      OPTIES.blokPrijslijst(ctx.g, 'section-light'),
      blokSamenstellen('section-paper'),
    ] : [blokSamenstellen('section-light')]),
    contactBlok(),
  ].filter(Boolean).join('\n\n');
  return { p, inhoud };
}

function paginaBouwwijze() {
  const p = T.PAGINAS.bouwwijze;
  const b = T.BOUWWIJZE;
  const inhoud = [
    paginaKop(p),
    `<section class="section section-paper">
  <div class="container">
    <div class="bouwwijze-grid">
      ${bouwwijzeKaart(b.prefab, false, 'h2')}
      ${bouwwijzeKaart(b.klassiek, true, 'h2')}
    </div>
    <p class="bouwwijze-slot">${rijk(b.slot)}</p>
  </div>
</section>`,
    blokProjecten('section-light'),
    contactBlok(),
  ].join('\n\n');
  return { p, inhoud };
}

function paginaWerkwijze() {
  const p = T.PAGINAS.werkwijze;
  const openbaar = (regels) => (regels || []).filter((r) => !ALLEEN_PROJECTPAGINA.some((re) => re.test(r)));
  const stappen = PROJECTFASEN.FASEN.map((f, i) => `<article class="stap" id="stap-${i + 1}">
      <div class="stap-kop">
        <div class="stap-num" aria-hidden="true">${i + 1}</div>
        <div>
          <h2>${esc(f.titel)}</h2>
          <p>${esc(f.kort)}</p>
        </div>
      </div>
      <div class="stap-lijsten">
        <div>
          <h3>${esc(f.watKop || 'Wat er in deze stap gebeurt')}</h3>
          <ul>
            ${openbaar(f.wat).map((r) => `<li>${esc(r)}</li>`).join('\n            ')}
          </ul>
        </div>
        <div class="nodig">
          <h3>${esc(f.nodigKop || 'Wat wij van u nodig hebben')}</h3>
          <ul>
            ${openbaar(f.nodig).map((r) => `<li>${esc(r)}</li>`).join('\n            ')}
          </ul>
        </div>
      </div>
      ${f.nvt ? `<p class="stap-noot">${esc(f.nvt)}</p>` : ''}
    </article>`);
  const v = T.BLOKKEN.volgen;
  const inhoud = [
    paginaKop(p),
    `<section class="section section-light">
  <div class="container">
    <div class="stappen-lang">
    ${stappen.join('\n    ')}
    </div>
  </div>
</section>`,
    `<section class="section section-paper">
  <div class="container">
    <div class="volg-kaart">
      <div>
        <h2>${esc(v.kop)}</h2>
        <p>${esc(v.tekst)}</p>
      </div>
      <a href="/project" class="btn btn-primary">${esc(v.knop)}</a>
    </div>
  </div>
</section>`,
    contactBlok(),
  ].join('\n\n');
  return { p, inhoud };
}

function paginaProjecten() {
  const p = T.PAGINAS.projecten;
  const social = socialKnoppen(true);
  const inhoud = [
    paginaKop(p),
    `<section class="section section-light">
  <div class="container">
    ${projectKaarten('h2', true)}
    ${social.length ? `<div class="werk-social">
      <p>${esc(T.BLOKKEN.werk.social)}</p>
      <div class="contact-social">${social.join('')}</div>
    </div>` : ''}
  </div>
</section>`,
    contactBlok(),
  ].join('\n\n');
  return { p, inhoud };
}

function paginaOver() {
  const p = T.PAGINAS.over;
  const inhoud = [
    paginaKop(p),
    `<section class="section section-paper">
  <div class="container">
    <div class="over-grid">
      ${T.OVER.map((b) => `<div class="over-block">
        <h2>${esc(b.kop)}</h2>
        <p>${esc(b.tekst)}</p>
      </div>`).join('\n      ')}
    </div>
  </div>
</section>`,
    `<section id="samenwerking" class="section section-light">
  <div class="container">
    ${sectieKop(T.PARTNER, true)}
    ${partnerKaart()}
  </div>
</section>`,
    contactBlok(),
  ].join('\n\n');
  return { p, inhoud };
}

function paginaContact() {
  const p = T.PAGINAS.contact;
  return { p, inhoud: [paginaKop(p), contactBlok({ zonderKop: true })].join('\n\n') };
}

// Pagina's en blokken die hun inhoud uit de configurator halen
const OPTIES = require('./opties')({
  esc, rijk, euro, T, PROJECTFASEN,
  paginaKop, contactBlok, blokSamenstellen, blokKlassiek, blokProjecten,
});

// Een pagina met 'nodig: configurator' bestaat alleen als de opties uit
// configurator.html gelezen konden worden.
const metOpties = (maak) => Object.assign((ctx) => (ctx.g ? maak(ctx.g) : null), { nodig: 'configurator' });

const ROUTES = {
  [T.PAGINAS.aanbouw.pad]: (ctx) => paginaDienst('aanbouw', ctx),
  [T.PAGINAS.uitbouw.pad]: (ctx) => paginaDienst('uitbouw', ctx),
  [T.PAGINAS.plannen.pad]: (ctx) => paginaPlannen(ctx),
  [T.PAGINAS.bouwwijze.pad]: () => paginaBouwwijze(),
  [T.PAGINAS.dak.pad]: metOpties((g) => OPTIES.paginaDak(g)),
  [T.PAGINAS.gevel.pad]: metOpties((g) => OPTIES.paginaGevel(g)),
  [T.PAGINAS.kozijn.pad]: metOpties((g) => OPTIES.paginaKozijn(g)),
  [T.PAGINAS.extras.pad]: metOpties((g) => OPTIES.paginaExtras(g)),
  [T.PAGINAS.vragen.pad]: metOpties((g) => OPTIES.paginaVragen(g)),
  [T.PAGINAS.werkwijze.pad]: () => paginaWerkwijze(),
  [T.PAGINAS.projecten.pad]: () => paginaProjecten(),
  [T.PAGINAS.over.pad]: () => paginaOver(),
  [T.PAGINAS.contact.pad]: () => paginaContact(),
};

// ---------------------------------------------------------------------------
// Het geheel
// ---------------------------------------------------------------------------

function gegevens(pagina) {
  const p = pagina.p;
  const adres = SITE_URL + p.pad;
  const graph = [
    {
      '@type': 'WebPage',
      '@id': adres,
      url: adres,
      name: p.titel,
      description: p.beschrijving,
      inLanguage: 'nl-NL',
      isPartOf: { '@id': `${SITE_URL}/#website` },
      about: { '@id': `${SITE_URL}/#bedrijf` },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: T.SITE.naam, item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: p.broodkruimel, item: adres },
      ],
    },
  ];
  if (pagina.vragen && pagina.vragen.length) {
    graph.push({ '@type': 'FAQPage', '@id': `${adres}#vragen`, mainEntity: pagina.vragen });
  }
  if (pagina.dienst) {
    graph.push({
      '@type': 'Service',
      name: pagina.dienst.naam,
      description: zonderOpmaak(pagina.dienst.tekst),
      url: adres,
      areaServed: { '@type': 'Country', name: 'Nederland' },
      provider: { '@id': `${SITE_URL}/#bedrijf` },
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function document_(pagina) {
  const p = pagina.p;
  const adres = SITE_URL + p.pad;
  const afbeelding = `${SITE_URL}/img/og-image.png`;
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(p.titel)}</title>
<meta name="description" content="${esc(p.beschrijving)}">
<link rel="canonical" href="${esc(adres)}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(adres)}">
<meta property="og:title" content="${esc(p.titel)}">
<meta property="og:description" content="${esc(p.beschrijving)}">
<meta property="og:locale" content="nl_NL">
<meta property="og:site_name" content="${esc(T.SITE.naam)}">
<meta property="og:image" content="${esc(afbeelding)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="preload" href="/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/manrope-latin.woff2" as="font" type="font/woff2" crossorigin>
<script type="application/ld+json">${gegevens(pagina)}</script>
<style>
${CSS}
</style>
</head>
<body>

${kopbalk(p.pad)}

<main>
${pagina.inhoud}
</main>

${voetbalk()}

<script>
// Mobiel hamburgermenu
(function () {
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (!toggle || !nav) return;
  function zet(open) {
    nav.classList.toggle('open', open);
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  }
  toggle.addEventListener('click', function () { zet(!nav.classList.contains('open')); });
  nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { zet(false); }); });
  window.addEventListener('resize', function () { if (window.innerWidth >= 1150) zet(false); });
})();
</script>
<!-- 100% privacy-first analytics (Simple Analytics, geen cookies) -->
<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>
</body>
</html>
`;
}

async function bouw(pad) {
  const maak = ROUTES[pad];
  if (!maak) return null;
  const opgeslagen = await leesPrijzen();
  // Vanaf hier geen 'await' meer: de prijzen in 'g' gelden voor dit ene verzoek.
  const pagina = maak({ prijzen: planPrijzen(opgeslagen), g: CONFIGURATOR.metPrijzen(opgeslagen) });
  return pagina ? document_(pagina) : null;
}

/**
 * Handelt een verzoek af als het om een van de losse pagina's gaat.
 * Geeft true terug als het antwoord is verstuurd, anders false.
 */
async function handle(req, res, url) {
  if (!url || typeof url.pathname !== 'string') return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  let pad = url.pathname;
  if (pad.length > 1 && pad.endsWith('/')) {
    const zonder = pad.replace(/\/+$/, '');
    if (!ROUTES[zonder]) return false;
    res.writeHead(301, { Location: zonder + (url.search || ''), 'Cache-Control': 'public, max-age=3600' });
    res.end();
    return true;
  }
  if (!ROUTES[pad]) return false;

  try {
    const html = await bouw(pad);
    if (html == null) return false; // pagina nu niet beschikbaar: gewone 404
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : html);
  } catch (e) {
    console.error('[paginas] fout bij', pad, '-', e && e.stack ? e.stack : e);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Er ging iets mis. Probeer het later opnieuw.');
  }
  return true;
}

const PADEN = Object.keys(ROUTES).filter((pad) => !ROUTES[pad].nodig || CONFIGURATOR.beschikbaar());

module.exports = { handle, bouw, PADEN, SITE_URL, OPTIES, leesPrijzen };
