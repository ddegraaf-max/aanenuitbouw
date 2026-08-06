/* ==========================================================================
   Bodemcheck / sondeertool — clientlogica
   Geen framework, geen build. Alles wat hier gebeurt:
     1. adres aanvullen via de eigen /api/adres
     2. analyse ophalen via /api/analyse
     3. de sondeerstaat tekenen (canvas + DOM-lagen op één diepteschaal)
     4. situatieschets tekenen (SVG met afstandsringen)
     5. aanvraag versturen
   ========================================================================== */

(function () {
  'use strict';

  const BASIS = (window.SONDEERTOOL && window.SONDEERTOOL.basisPad) || '';

  // Alle id's in de markup beginnen met sd- en alle datavelden met data-sd-,
  // zodat er niets kan botsen met de bestaande site. Die prefix zit hier in de
  // helpers, dus de rest van dit bestand blijft leesbaar.
  const WORTEL = '.sondeertool-app';
  // ?debug=1 in de URL zet technische details op de pagina: HTTP-status,
  // doorlooptijd en de faseklok van de server. Bedoeld om te kunnen zien wat er
  // gebeurt zonder de ontwikkelaarsconsole te hoeven openen.
  const DEBUG = /[?&]debug=1/.test(window.location.search);

  /**
   * Meldt wat er in de browser gebeurt aan de server, op te vragen via
   * /bodemcheck/api/klantlog. Zonder dit is een pagina die blijft hangen alleen
   * te onderzoeken met de ontwikkelaarsconsole erbij, en dat is niet altijd
   * praktisch. Mag nooit zelf een fout veroorzaken, vandaar de lege catch.
   */
  function meld(fase, extra) {
    try {
      const lading = JSON.stringify(Object.assign({ fase: fase }, extra || {}));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${BASIS}/api/klantlog`, new Blob([lading], { type: 'application/json' }));
      } else {
        fetch(`${BASIS}/api/klantlog`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: lading,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {
      /* stil */
    }
  }

  // JavaScript-fouten die buiten een try/catch ontstaan, ook melden. Zonder dit
  // valt de pagina stil zonder spoor.
  window.addEventListener('error', function (e) {
    meld('js-fout', { details: `${e.message} @ ${e.filename}:${e.lineno}:${e.colno}` });
  });
  window.addEventListener('unhandledrejection', function (e) {
    meld('belofte-fout', { details: String((e.reason && e.reason.message) || e.reason).slice(0, 300) });
  });

  const ontbrekend = VERPLICHTE_IDS.filter(function (naam) {
    return !document.getElementById('sd-' + naam);
  });
  if (ontbrekend.length > 0) {
    console.error('[sondeertool] ontbrekende elementen:', ontbrekend);
    meld('elementen-ontbreken', { details: ontbrekend.join(', ') });
  }
  const el = (id) => document.getElementById('sd-' + id);
  const veld = (naam) => document.querySelector(`${WORTEL} [data-sd-veld="${naam}"]`);

  /**
   * Controle bij het opstarten dat alle elementen bestaan die deze code nodig
   * heeft. Eén verkeerd id liet de pagina eerder stilvallen zonder enig spoor:
   * de voortgangstimer liep dan eeuwig door terwijl er niets meer gebeurde.
   * Nu staat het meteen in de console en in /api/klantlog.
   */
  const VERPLICHTE_IDS = [
    'invoer', 'adres', 'suggesties', 'zoekknop', 'melding', 'uitkomst',
    'tabs', 'lineaal', 'lagenbalk', 'grafiekhouder', 'grafiek', 'leesbalk',
    'leeswaarde', 'lagentabel', 'schets', 'metinglijst', 'vraagform',
  ];

  const invoerForm = el('invoer');
  const adresInput = el('adres');
  const suggestiesLijst = el('suggesties');
  const zoekknop = el('zoekknop');
  const melding = el('melding');
  const uitkomst = el('uitkomst');

  let huidigeData = null;
  let actieveIndex = 0;
  let tekenToken = 0;

  // -------------------------------------------------------------------------
  // Hulpjes
  // -------------------------------------------------------------------------

  function meter(n, decimalen = 2) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    return n.toFixed(decimalen).replace('.', ',') + ' m';
  }

  function zetMelding(tekst, soort) {
    // Weerbaar tegen een ontbrekend element: eerder liet één verkeerd id de
    // hele zoekactie stilvallen, buiten het try-blok om, met een eeuwig
    // doorlopende voortgangstimer als gevolg.
    if (!melding) {
      if (tekst) console.warn('[sondeertool] melding:', tekst);
      return;
    }
    if (!tekst) {
      melding.hidden = true;
      return;
    }
    melding.textContent = tekst;
    melding.className = 'sd-melding' + (soort === 'ok' ? ' sd-melding--ok' : '');
    melding.hidden = false;
  }

  let voortgangTimer = null;
  let bezigMet = null; // AbortController van het lopende verzoek

  function bezig(aan) {
    if (!zoekknop) return;
    zoekknop.disabled = aan;
    const spinner = zoekknop.querySelector('.sd-knop__spinner');
    if (spinner) spinner.hidden = !aan;
    const label = zoekknop.querySelector('.sd-knop__tekst');
    if (!label) {
      clearInterval(voortgangTimer);
      return;
    }

    clearInterval(voortgangTimer);
    if (!aan) {
      label.textContent = 'Bodem opzoeken';
      return;
    }

    // De BRO is een overheidsdienst die soms traag is. Zonder terugkoppeling
    // lijkt een wachttijd van tien seconden op een vastgelopen pagina.
    const stappen = [
      'Adres opzoeken',
      'Sonderingen zoeken bij de BRO',
      'Meetgegevens ophalen',
      'Grondlagen bepalen',
      'Nog even geduld',
    ];
    let i = 0;
    label.textContent = stappen[0];
    voortgangTimer = setInterval(() => {
      i = Math.min(i + 1, stappen.length - 1);
      label.textContent = stappen[i];
    }, 3500);
  }

  function vertraag(fn, ms) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // -------------------------------------------------------------------------
  // 1. Adres aanvullen
  // -------------------------------------------------------------------------

  let gekozenLocatie = null;

  const zoekSuggesties = vertraag(async function () {
    const vraag = adresInput.value.trim();
    if (vraag.length < 4) {
      suggestiesLijst.hidden = true;
      return;
    }
    try {
      const res = await fetch(`${BASIS}/api/adres?q=${encodeURIComponent(vraag)}`);
      if (!res.ok) return;
      const { resultaten } = await res.json();
      if (!resultaten || resultaten.length === 0) {
        suggestiesLijst.hidden = true;
        return;
      }
      suggestiesLijst.innerHTML = resultaten
        .map(
          (r, i) =>
            `<li role="option" data-i="${i}" tabindex="-1">${r.omschrijving}<small>${r.soort}</small></li>`,
        )
        .join('');
      suggestiesLijst.hidden = false;
      suggestiesLijst.querySelectorAll('li').forEach((li) => {
        li.addEventListener('click', () => {
          const keuze = resultaten[Number(li.dataset.i)];
          gekozenLocatie = keuze;
          adresInput.value = keuze.omschrijving;
          suggestiesLijst.hidden = true;
          invoerForm.requestSubmit();
        });
      });
    } catch {
      suggestiesLijst.hidden = true;
    }
  }, 220);

  adresInput.addEventListener('input', () => {
    gekozenLocatie = null;
    zoekSuggesties();
  });

  document.addEventListener('click', (e) => {
    if (!suggestiesLijst.contains(e.target) && e.target !== adresInput) suggestiesLijst.hidden = true;
  });

  adresInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') suggestiesLijst.hidden = true;
  });

  // -------------------------------------------------------------------------
  // 2. Analyse ophalen
  // -------------------------------------------------------------------------

  invoerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    suggestiesLijst.hidden = true;

    // Loopt er al een verzoek? Dat afbreken in plaats van een tweede ernaast
    // starten. Twee overlappende aanroepen lieten een voortgangstimer achter
    // die eeuwig doorliep, ook nadat het antwoord al binnen was.
    if (bezigMet) {
      bezigMet.abort();
      bezigMet = null;
    }
    const vraag = adresInput.value.trim();
    if (vraag.length < 4) {
      zetMelding('Vul een postcode, adres of plaatsnaam in.');
      return;
    }

    bezig(true);
    zetMelding(null);

    // Buiten het try-blok, want de catch en de finally gebruiken dit ook. Als
    // const binnen de try zou een fout een ReferenceError opleveren in de
    // foutafhandeling zelf -- precies op het moment dat je informatie nodig hebt.
    const begonnen = Date.now();

    try {
      const params = gekozenLocatie
        ? `lat=${gekozenLocatie.lat}&lon=${gekozenLocatie.lon}&label=${encodeURIComponent(gekozenLocatie.omschrijving)}`
        : `q=${encodeURIComponent(vraag)}`;

      // Harde limiet aan onze kant. Zonder dit blijft de spinner draaien als de
      // verbinding onderweg wordt afgekapt en er nooit een antwoord komt.
      const afbreker = new AbortController();
      bezigMet = afbreker;
      const tijdslimiet = setTimeout(() => afbreker.abort(), 35000);

      meld('zoeken-start', { details: params.slice(0, 200) });

      let res;
      let ruweTekst;
      let data;
      try {
        res = await fetch(`${BASIS}/api/analyse?${params}`, { signal: afbreker.signal });
        // Eerst als tekst inlezen, dan zelf parseren. Zo kan een onverwacht
        // antwoord -- een foutpagina, een tussenpagina van een firewall --
        // letterlijk gemeld worden in plaats van te verdwijnen in een
        // mislukte JSON-parse.
        ruweTekst = await res.text();
      } finally {
        clearTimeout(tijdslimiet);
      }

      meld('antwoord', {
        status: res.status,
        ms: Date.now() - begonnen,
        details: `${res.headers.get('content-type') || '?'} · ${ruweTekst.length} bytes · ${ruweTekst.slice(0, 200)}`,
      });

      try {
        data = JSON.parse(ruweTekst);
      } catch {
        zetMelding(
          res.status >= 500
            ? 'De Basisregistratie Ondergrond antwoordde niet op tijd. Probeer het over een paar minuten opnieuw.'
            : 'Onverwacht antwoord van de server. Probeer het opnieuw.',
        );
        return;
      }

      if (!res.ok) {
        zetMelding(data.fout || 'Er ging iets mis bij het opzoeken.');
        return;
      }

      if (DEBUG) {
        zetMelding(
          `debug: HTTP ${res.status} in ${Date.now() - begonnen} ms · ` +
            `gevonden ${data.aantalGevonden}, uitgelezen ${data.aantalGeanalyseerd} · ` +
            `tijden ${JSON.stringify(data.tijden || {})}`,
          'ok',
        );
      }

      huidigeData = data;
      actieveIndex = 0;
      // Eerst zichtbaar maken, dan tekenen: een verborgen element heeft
      // clientWidth 0 en dan komt er een leeg canvas uit.
      uitkomst.hidden = false;
      toon(data);
      meld('getekend', {
        ms: Date.now() - begonnen,
        details: `gevonden ${data.aantalGevonden}, uitgelezen ${data.aantalGeanalyseerd}, tijden ${JSON.stringify(data.tijden || {})}`,
      });
      uitkomst.scrollIntoView({ behavior: 'smooth', block: 'start' });

      if (data.sonderingen.length === 0) {
        zetMelding(
          data.waarschuwingen && data.waarschuwingen.length
            ? data.waarschuwingen.join(' ')
            : `In een straal van ${data.zoekstraalKm} km zijn geen bruikbare sonderingen gevonden. Vraag een sondering op uw eigen perceel aan.`,
        );
      } else if (data.waarschuwingen && data.waarschuwingen.length) {
        zetMelding(data.waarschuwingen.join(' '), 'ok');
      }
    } catch (fout) {
      console.error('[sondeertool] zoeken mislukt:', fout);
      meld(fout && fout.name === 'AbortError' ? 'afgebroken' : 'fout', {
        ms: Date.now() - begonnen,
        details: `${(fout && fout.name) || '?'}: ${(fout && fout.message) || fout}`,
      });
      zetMelding(
        fout && fout.name === 'AbortError'
          ? 'Het opzoeken duurde te lang en is afgebroken. De Basisregistratie Ondergrond is soms traag; probeer het over een paar minuten opnieuw.'
          : 'De verbinding is mislukt. Probeer het opnieuw.',
      );
    } finally {
      bezigMet = null;
      bezig(false);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Uitkomst weergeven
  // -------------------------------------------------------------------------

  function toon(data) {
    const s = data.sonderingen[actieveIndex] || null;
    const sv = data.samenvatting;

    veld('locatie').textContent = data.locatie.omschrijving;
    veld('metagegevens').textContent = [
      `${data.aantalGevonden} sondering${data.aantalGevonden === 1 ? '' : 'en'} binnen ${data.zoekstraalKm} km`,
      `${data.aantalGeanalyseerd} volledig uitgelezen`,
      `betrouwbaarheid: ${sv.betrouwbaarheid.niveau}`,
    ].join('  ·  ');

    // Kerncijfers. Bij een diep slap pakket is "draagkrachtig vanaf 11,52 m"
    // technisch waar maar misleidend: fundering op staal is dan geen optie.
    // Dat zeggen we dan ook zo.
    const ondiepDraagkrachtig = s && s.opStaal && s.opStaal.diepteMv <= 2;
    veld('staalDiepte').textContent = ondiepDraagkrachtig
      ? meter(s.opStaal.diepteMv)
      : s && s.opStaal
        ? 'niet ondiep'
        : 'niet aangetroffen';
    veld('staalToelichting').textContent = ondiepDraagkrachtig
      ? `gemiddeld ${s.opStaal.qcGemiddeld} MPa · aanlegdiepte minimaal ${meter(s.opStaal.aanlegdiepteAdvies)} vorstvrij`
      : s && s.opStaal
        ? `pas vanaf ${meter(s.opStaal.diepteMv, 1)} — fundering op staal is hier geen optie`
        : `binnen ${s ? s.einddiepte + ' m' : 'de meting'} geen laag van 5 MPa of meer`;

    veld('paalDiepte').textContent = s && s.paalpunt ? meter(s.paalpunt.diepteMv, 1) : 'niet aangetroffen';
    veld('paalToelichting').textContent =
      s && s.paalpunt
        ? `${s.paalpunt.diepteNap !== null ? s.paalpunt.diepteNap.toFixed(1).replace('.', ',') + ' m NAP · ' : ''}gemiddeld ${s.paalpunt.qcGemiddeld} MPa`
        : 'geen laag van 12 MPa of meer gemeten';

    veld('slapDikte').textContent = s ? meter(s.slappeToplaagDikte, 1) : '—';

    const nabij = data.alleLocaties[0];
    veld('afstand').textContent = nabij ? `${nabij.afstandM} m` : '—';
    veld('afstandToelichting').textContent = s
      ? `${s.broId}${s.datum ? ' · ' + s.datum : ''}${s.windstreek ? ' · richting ' + s.windstreek : ''}`
      : '';

    // Advies
    veld('advies').innerHTML = sv.advies
      .map((a) => `<li data-soort="${a.soort}">${a.tekst}</li>`)
      .join('');

    // Tabs
    const tabs = el('tabs');
    tabs.innerHTML = data.sonderingen
      .map(
        (son, i) =>
          `<button role="tab" type="button" data-i="${i}" aria-selected="${i === actieveIndex}">
             <b>${son.broId}</b>${son.afstandM} m ${son.windstreek || ''} · ${son.einddiepte} m diep
           </button>`,
      )
      .join('');
    tabs.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        actieveIndex = Number(b.dataset.i);
        toon(huidigeData);
      }),
    );

    if (s) {
      tekenStaat(s);
      vulLagentabel(s);
    }
    tekenSchets(data);
    vulMetinglijst(data);

    const vraagAdres = el('vraagAdres');
    if (vraagAdres && !vraagAdres.value) vraagAdres.value = data.locatie.omschrijving;
  }

  // -------------------------------------------------------------------------
  // 4. Sondeerstaat
  // -------------------------------------------------------------------------

  function tekenStaat(sondering) {
    const maxDiepte = Math.max(2, Math.ceil(sondering.einddiepte));
    const houder = el('grafiekhouder');
    const hoogte = houder.clientHeight || 520;

    tekenLineaal(maxDiepte, hoogte);
    tekenLagen(sondering, maxDiepte);
    tekenGrafiek(sondering, maxDiepte);
    zetMarkers(sondering, maxDiepte, hoogte);
  }

  function tekenLineaal(maxDiepte, hoogte) {
    const lineaal = el('lineaal');
    const stap = maxDiepte > 24 ? 4 : maxDiepte > 12 ? 2 : 1;
    let html = '';
    for (let d = 0; d <= maxDiepte; d += stap) {
      const groot = d % (stap * 2) === 0;
      html += `<span class="sd-tik${groot ? ' sd-tik--groot' : ''}" style="top:${(d / maxDiepte) * 100}%">${d}</span>`;
    }
    lineaal.style.height = hoogte + 'px';
    lineaal.innerHTML = html;
  }

  function tekenLagen(sondering, maxDiepte) {
    const balk = el('lagenbalk');
    balk.innerHTML = sondering.lagen
      .map((laag, i) => {
        const top = (laag.van / maxDiepte) * 100;
        const h = ((laag.tot - laag.van) / maxDiepte) * 100;
        const naam = h > 3.2 ? `<span class="sd-laag__naam">${laag.label}</span>` : '';
        return `<div class="sd-laag" title="${laag.label} — ${laag.van} tot ${laag.tot} m, gemiddeld ${laag.qcGemiddeld} MPa"
                     style="top:${top}%;height:${h}%;background:${laag.kleur};animation-delay:${Math.min(i * 35, 500)}ms">${naam}</div>`;
      })
      .join('');
  }

  /**
   * Tekent de qc-lijn. De curve wordt van boven naar beneden opgebouwd, net
   * zoals een sondeerwagen de conus de grond in drukt. Dat is niet alleen
   * leuk: het maakt ook meteen duidelijk dat de verticale as diepte is.
   */
  function tekenGrafiek(sondering, maxDiepte) {
    const canvas = el('grafiek');
    const houder = el('grafiekhouder');
    const dpr = window.devicePixelRatio || 1;
    const b = houder.clientWidth || 640;
    const h = houder.clientHeight || 520;

    canvas.width = b * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const punten = sondering.reeks.punten.filter((p) => p.qc !== null);
    const qcMax = Math.max(5, Math.ceil((sondering.reeks.qcMax || 10) / 5) * 5);

    const x = (qc) => (qc / qcMax) * (b - 2) + 1;
    const y = (d) => (d / maxDiepte) * h;

    const mijnToken = ++tekenToken;
    const rasterStap = qcMax > 30 ? 10 : 5;

    function raster() {
      ctx.clearRect(0, 0, b, h);
      ctx.strokeStyle = 'rgba(233,226,209,0.10)';
      ctx.fillStyle = 'rgba(143,136,119,0.9)';
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.lineWidth = 1;

      for (let q = rasterStap; q <= qcMax; q += rasterStap) {
        const px = Math.round(x(q)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
        ctx.fillText(String(q), px + 3, 12);
      }

      const dStap = maxDiepte > 24 ? 4 : maxDiepte > 12 ? 2 : 1;
      ctx.strokeStyle = 'rgba(233,226,209,0.07)';
      for (let d = dStap; d < maxDiepte; d += dStap) {
        const py = Math.round(y(d)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(b, py);
        ctx.stroke();
      }
    }

    function curve(tot) {
      if (punten.length === 0) return;
      // vlak onder de curve
      const vulling = ctx.createLinearGradient(0, 0, b, 0);
      vulling.addColorStop(0, 'rgba(224,115,56,0.06)');
      vulling.addColorStop(1, 'rgba(224,115,56,0.32)');

      ctx.beginPath();
      ctx.moveTo(x(0), y(punten[0].d));
      for (let i = 0; i < tot; i++) ctx.lineTo(x(punten[i].qc), y(punten[i].d));
      ctx.lineTo(x(0), y(punten[Math.max(0, tot - 1)].d));
      ctx.closePath();
      ctx.fillStyle = vulling;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < tot; i++) {
        const px = x(punten[i].qc);
        const py = y(punten[i].d);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#f0a26a';
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    const wilAnimatie = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!wilAnimatie || punten.length < 20) {
      raster();
      curve(punten.length);
      return;
    }

    let i = 0;
    const perFrame = Math.max(6, Math.ceil(punten.length / 55));
    (function stap() {
      if (mijnToken !== tekenToken) return; // andere sondering gekozen
      i = Math.min(punten.length, i + perFrame);
      raster();
      curve(i);
      if (i < punten.length) requestAnimationFrame(stap);
    })();

    // Aflezen bij bewegen over de grafiek
    const leesbalk = el('leesbalk');
    const leeswaarde = el('leeswaarde');

    function lees(e) {
      const rect = houder.getBoundingClientRect();
      const py = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      const diepte = (py / rect.height) * maxDiepte;
      const dichtst = punten.reduce(
        (best, p) => (Math.abs(p.d - diepte) < Math.abs(best.d - diepte) ? p : best),
        punten[0],
      );
      leesbalk.hidden = false;
      leesbalk.style.top = y(dichtst.d) + 'px';
      const laag = sondering.lagen.find((l) => dichtst.d >= l.van && dichtst.d <= l.tot);
      leeswaarde.textContent =
        `${dichtst.d.toFixed(2).replace('.', ',')} m −mv   qc ${dichtst.qc.toFixed(1).replace('.', ',')} MPa` +
        (dichtst.rf !== null && dichtst.rf !== undefined ? `   Rf ${dichtst.rf.toFixed(1).replace('.', ',')} %` : '') +
        (laag ? `   ${laag.label}` : '');
    }

    houder.onmousemove = lees;
    houder.ontouchmove = (e) => {
      lees(e);
      e.preventDefault();
    };
    houder.onmouseleave = () => {
      leesbalk.hidden = true;
      leeswaarde.textContent = '';
    };
  }

  function zetMarkers(sondering, maxDiepte, hoogte) {
    const staal = el('markerStaal');
    const paal = el('markerPaal');

    if (sondering.opStaal) {
      staal.hidden = false;
      staal.style.top = (sondering.opStaal.diepteMv / maxDiepte) * hoogte + 'px';
      staal.querySelector('span').textContent = `draagkrachtig ${meter(sondering.opStaal.diepteMv)}`;
    } else {
      staal.hidden = true;
    }

    if (sondering.paalpunt) {
      paal.hidden = false;
      paal.style.top = (sondering.paalpunt.diepteMv / maxDiepte) * hoogte + 'px';
      paal.querySelector('span').textContent = `vast zand ${meter(sondering.paalpunt.diepteMv, 1)}`;
    } else {
      paal.hidden = true;
    }
  }

  function vulLagentabel(sondering) {
    el('lagentabel').innerHTML = sondering.lagen
      .map(
        (l) => `<tr>
          <td>${l.van.toFixed(2).replace('.', ',')}</td>
          <td>${l.tot.toFixed(2).replace('.', ',')}</td>
          <td>${l.dikte.toFixed(2).replace('.', ',')}</td>
          <td><span class="sd-vlek" style="background:${l.kleur}"></span>${l.label}</td>
          <td>${l.qcGemiddeld === null ? '—' : l.qcGemiddeld.toFixed(1).replace('.', ',')}</td>
          <td>${l.draagkracht}</td>
        </tr>`,
      )
      .join('');
  }

  // -------------------------------------------------------------------------
  // 5. Situatieschets
  // -------------------------------------------------------------------------

  function tekenSchets(data) {
    const svg = el('schets');
    const midden = 160;
    const punten = data.alleLocaties.slice(0, 20);
    const maxAfstand = Math.max(100, ...punten.map((p) => p.afstandM));
    const schaal = 132 / maxAfstand;

    const ringen = [0.25, 0.5, 0.75, 1]
      .map((f) => {
        const r = 132 * f;
        const m = Math.round(maxAfstand * f);
        return `<circle cx="${midden}" cy="${midden}" r="${r}" fill="none" stroke="rgba(22,25,28,0.16)" stroke-dasharray="2 4"/>
                <text x="${midden + 3}" y="${midden - r - 3}" font-family="IBM Plex Mono, monospace" font-size="8" fill="rgba(22,25,28,0.42)">${m} m</text>`;
      })
      .join('');

    const kruis = `
      <line x1="${midden}" y1="18" x2="${midden}" y2="302" stroke="rgba(22,25,28,0.12)"/>
      <line x1="18" y1="${midden}" x2="302" y2="${midden}" stroke="rgba(22,25,28,0.12)"/>
      <text x="${midden}" y="14" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9" font-weight="600" fill="rgba(22,25,28,0.5)">N</text>`;

    const merken = punten
      .map((p, i) => {
        const hoek = ((p.richtingGraden !== undefined ? p.richtingGraden : hoekTussen(data.locatie, p)) - 90) * (Math.PI / 180);
        const r = p.afstandM * schaal;
        const px = midden + r * Math.cos(hoek);
        const py = midden + r * Math.sin(hoek);
        const actief = p.geanalyseerd;
        return `<g class="sd-merk" data-bro="${p.broId}">
            <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${actief ? 5.5 : 3.5}"
                    fill="${actief ? '#c2501c' : 'rgba(22,25,28,0.28)'}"
                    stroke="#faf8f3" stroke-width="1.5">
              <title>${p.broId} — ${p.afstandM} m, tot ${p.einddiepte || '?'} m diep</title>
            </circle>
            ${actief ? `<text x="${(px + 8).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-family="IBM Plex Mono, monospace" font-size="8" fill="#c2501c">${p.afstandM}m</text>` : ''}
          </g>`;
      })
      .join('');

    const perceel = `
      <rect x="${midden - 9}" y="${midden - 9}" width="18" height="18" fill="none" stroke="#16191c" stroke-width="2"/>
      <line x1="${midden - 4}" y1="${midden}" x2="${midden + 4}" y2="${midden}" stroke="#16191c" stroke-width="1.5"/>
      <line x1="${midden}" y1="${midden - 4}" x2="${midden}" y2="${midden + 4}" stroke="#16191c" stroke-width="1.5"/>
      <text x="${midden}" y="${midden + 26}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="8" letter-spacing="0.1em" fill="#16191c">UW LOCATIE</text>`;

    svg.innerHTML = ringen + kruis + merken + perceel;
  }

  function hoekTussen(a, b) {
    const dy = b.lat - a.lat;
    const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
    return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  }

  function vulMetinglijst(data) {
    el('metinglijst').innerHTML = data.alleLocaties
      .slice(0, 12)
      .map(
        (p) => `<li data-actief="${p.geanalyseerd}">
          <span></span>
          <span><b>${p.broId}</b><small>${p.datum || 'datum onbekend'} · tot ${p.einddiepte || '?'} m diep${p.geanalyseerd ? ' · uitgelezen' : ''}</small></span>
          <span class="sd-afstand">${p.afstandM} m</span>
        </li>`,
      )
      .join('');
  }

  // -------------------------------------------------------------------------
  // 6. Kaartweergave (pas laden als iemand erom vraagt)
  // -------------------------------------------------------------------------

  const kaartknop = el('kaartknop');
  let kaartGeladen = false;

  if (kaartknop) {
    kaartknop.addEventListener('click', async () => {
      if (!huidigeData) return;
      const kaartDiv = el('kaart');

      if (kaartGeladen) {
        kaartDiv.hidden = !kaartDiv.hidden;
        kaartknop.textContent = kaartDiv.hidden ? 'Op de kaart bekijken' : 'Schets tonen';
        return;
      }

      kaartknop.textContent = 'Kaart laden…';
      try {
        await laadBestand('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'css');
        await laadBestand('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'js');

        kaartDiv.hidden = false;
        const kaart = L.map(kaartDiv, { attributionControl: true }).setView(
          [huidigeData.locatie.lat, huidigeData.locatie.lon],
          16,
        );

        // PDOK BRT Achtergrondkaart: Nederlandse open data, geen tracking.
        L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: 'Kaart: PDOK BRT Achtergrondkaart · Sonderingen: BRO',
        }).addTo(kaart);

        L.circleMarker([huidigeData.locatie.lat, huidigeData.locatie.lon], {
          radius: 8,
          color: '#16191c',
          weight: 3,
          fillOpacity: 0,
        })
          .addTo(kaart)
          .bindPopup('Uw locatie');

        huidigeData.alleLocaties.forEach((p) => {
          L.circleMarker([p.lat, p.lon], {
            radius: p.geanalyseerd ? 7 : 5,
            color: '#fff',
            weight: 1.5,
            fillColor: p.geanalyseerd ? '#c2501c' : '#6b7076',
            fillOpacity: 0.95,
          })
            .addTo(kaart)
            .bindPopup(`<strong>${p.broId}</strong><br>${p.afstandM} m · tot ${p.einddiepte || '?'} m diep<br>${p.datum || ''}`);
        });

        kaartGeladen = true;
        kaartknop.textContent = 'Schets tonen';
      } catch {
        kaartknop.textContent = 'Kaart niet beschikbaar';
      }
    });
  }

  function laadBestand(url, soort) {
    return new Promise((klaar, mislukt) => {
      const node =
        soort === 'css'
          ? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url })
          : Object.assign(document.createElement('script'), { src: url });
      node.onload = klaar;
      node.onerror = mislukt;
      document.head.appendChild(node);
    });
  }

  // -------------------------------------------------------------------------
  // 7. Aanvraag
  // -------------------------------------------------------------------------

  const vraagform = el('vraagform');
  if (vraagform) {
    vraagform.addEventListener('submit', async (e) => {
      e.preventDefault();
      const vraagmelding = el('vraagmelding');
      const knop = vraagform.querySelector('button');
      const gegevens = Object.fromEntries(new FormData(vraagform).entries());

      if (huidigeData) {
        gegevens.lat = huidigeData.locatie.lat;
        gegevens.lon = huidigeData.locatie.lon;
        const s = huidigeData.sonderingen[actieveIndex];
        if (s) gegevens.broId = s.broId;
      }

      knop.disabled = true;
      try {
        const res = await fetch(`${BASIS}/api/aanvraag`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gegevens),
        });
        const uit = await res.json();
        vraagmelding.textContent = res.ok ? uit.bericht : uit.fout;
        vraagmelding.className = 'sd-melding' + (res.ok ? ' sd-melding--ok' : '');
        vraagmelding.hidden = false;
        if (res.ok) vraagform.reset();
      } catch {
        vraagmelding.textContent = 'Versturen mislukt. Probeer het later opnieuw.';
        vraagmelding.hidden = false;
      } finally {
        knop.disabled = false;
      }
    });
  }

  // Hertekenen bij formaatwijziging: de grafiek is pixelgebaseerd.
  window.addEventListener(
    'resize',
    vertraag(() => {
      if (huidigeData && huidigeData.sonderingen[actieveIndex]) {
        tekenStaat(huidigeData.sonderingen[actieveIndex]);
      }
    }, 200),
  );

  // Diep linken: /bodemcheck?q=1401EX5 zoekt direct.
  if (adresInput.value.trim().length >= 4) invoerForm.requestSubmit();
})();
