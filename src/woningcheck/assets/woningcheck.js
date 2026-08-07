/* ==========================================================================
   Woningcheck — clientlogica.
   Geen framework, geen build. Alles wat hier gebeurt:
     1. adres aanvullen via de eigen /api/adres
     2. analyse ophalen via /api/analyse
     3. kerncijfers, luchtfoto's, conclusies en de archieflink tekenen
   Fouten worden gemeld aan /api/klantlog, zodat een blanco pagina bij een
   bezoeker niet onzichtbaar blijft.
   ========================================================================== */

(function () {
  'use strict';

  var BASIS = (window.WONINGCHECK && window.WONINGCHECK.basisPad) || '/woningcheck';
  var VERSIE = (window.WONINGCHECK && window.WONINGCHECK.assetVersie) || '?';
  var DEBUG = /[?&]debug=1/.test(window.location.search);

  function el(id) { return document.getElementById('wc-' + id); }

  /** Meldt naar de server. Mag zelf nooit een fout veroorzaken. */
  function meld(fase, extra) {
    try {
      var lading = JSON.stringify(Object.assign({ fase: fase }, extra || {}));
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BASIS + '/api/klantlog', new Blob([lading], { type: 'application/json' }));
      } else {
        fetch(BASIS + '/api/klantlog', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: lading, keepalive: true,
        }).catch(function () {});
      }
    } catch (e) { /* stil */ }
  }

  window.addEventListener('error', function (e) {
    meld('js-fout', { details: e.message + ' @ ' + e.filename + ':' + e.lineno + ':' + e.colno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    meld('belofte-fout', { details: String((e.reason && e.reason.message) || e.reason).slice(0, 300) });
  });

  // Zelfcontrole: staat de markup die deze code nodig heeft er wel? Eén
  // verkeerd id liet bij de bodemcheck de hele pagina stilvallen zonder spoor.
  // Deze lijst staat met opzet boven het gebruik.
  var VERPLICHT = ['invoer', 'adres', 'suggesties', 'zoekknop', 'melding', 'uitkomst',
    'adrestitel', 'adressub', 'cijfers', 'gemist', 'fotos', 'conclusies',
    'archieftitel', 'archieftekst', 'archieflink', 'versie'];

  var ontbreekt = VERPLICHT.filter(function (naam) { return !el(naam); });
  if (ontbreekt.length) {
    console.error('[woningcheck] ontbrekende elementen:', ontbreekt);
    meld('elementen-ontbreken', { details: ontbreekt.join(', ') });
  }

  var form = el('invoer');
  var input = el('adres');
  var lijst = el('suggesties');
  var knop = el('zoekknop');
  var melding = el('melding');
  var uitkomst = el('uitkomst');

  var voortgang = null;
  var lopend = null;
  var gekozen = null;

  // ------------------------------------------------------------------------

  function zetMelding(tekst, soort) {
    if (!melding) { if (tekst) console.warn('[woningcheck]', tekst); return; }
    if (!tekst) { melding.hidden = true; return; }
    melding.textContent = tekst;
    melding.className = 'wc-melding' + (soort === 'ok' ? ' wc-melding-ok' : '');
    melding.hidden = false;
  }

  function bezig(aan) {
    if (!knop) return;
    knop.disabled = aan;
    var spinner = knop.querySelector('.wc-spinner');
    if (spinner) spinner.hidden = !aan;
    var label = knop.querySelector('.wc-knop-tekst');
    clearInterval(voortgang);
    if (!label) return;
    if (!aan) { label.textContent = 'Woning opzoeken'; return; }
    var stappen = ['Adres opzoeken', 'Gebouwgegevens ophalen', 'Perceel opzoeken', 'Hoogtes bepalen', 'Nog even geduld'];
    var i = 0;
    label.textContent = stappen[0];
    voortgang = setInterval(function () {
      i = Math.min(i + 1, stappen.length - 1);
      label.textContent = stappen[i];
    }, 2500);
  }

  function vertraag(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function getal(n, decimalen) {
    if (n === null || n === undefined || !isFinite(n)) return null;
    return Number(n).toFixed(decimalen === undefined ? 0 : decimalen).replace('.', ',');
  }

  // --- 1. Adres aanvullen -------------------------------------------------

  var zoekSuggesties = vertraag(function () {
    var vraag = input.value.trim();
    if (vraag.length < 4) { lijst.hidden = true; return; }
    fetch(BASIS + '/api/adres?q=' + encodeURIComponent(vraag))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
      .then(function (d) {
        var res = d.resultaten || [];
        if (!res.length) { lijst.hidden = true; return; }
        lijst.innerHTML = res.map(function (r, i) {
          return '<li role="option" data-i="' + i + '">' + r.omschrijving +
            '<small>' + (r.gemeente ? 'gemeente ' + r.gemeente : r.soort) + '</small></li>';
        }).join('');
        lijst.hidden = false;
        Array.prototype.forEach.call(lijst.querySelectorAll('li'), function (li) {
          li.addEventListener('click', function () {
            gekozen = res[Number(li.dataset.i)];
            input.value = gekozen.omschrijving;
            lijst.hidden = true;
            form.dispatchEvent(new Event('submit', { cancelable: true }));
          });
        });
      })
      .catch(function () { lijst.hidden = true; });
  }, 220);

  if (input) {
    input.addEventListener('input', function () { gekozen = null; zoekSuggesties(); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') lijst.hidden = true; });
  }
  document.addEventListener('click', function (e) {
    if (lijst && !lijst.contains(e.target) && e.target !== input) lijst.hidden = true;
  });

  // --- 2. Analyse ---------------------------------------------------------

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (lijst) lijst.hidden = true;
    var vraag = input.value.trim();
    if (vraag.length < 4) { zetMelding('Vul een postcode met huisnummer of een volledig adres in.'); return; }

    if (lopend) { lopend.abort(); lopend = null; }
    bezig(true);
    zetMelding(null);
    var begonnen = Date.now();

    var afbreker = new AbortController();
    lopend = afbreker;
    var limiet = setTimeout(function () { afbreker.abort(); }, 30000);

    var params = gekozen && gekozen.id ? 'id=' + encodeURIComponent(gekozen.id) : 'q=' + encodeURIComponent(vraag);
    meld('zoeken-start', { details: params.slice(0, 160) });

    fetch(BASIS + '/api/analyse?' + params, { signal: afbreker.signal })
      .then(function (res) {
        clearTimeout(limiet);
        return res.text().then(function (tekst) { return { res: res, tekst: tekst }; });
      })
      .then(function (paar) {
        meld('antwoord', {
          status: paar.res.status,
          ms: Date.now() - begonnen,
          details: (paar.res.headers.get('content-type') || '?') + ' · ' + paar.tekst.length + ' bytes · ' + paar.tekst.slice(0, 180),
        });

        var data;
        try { data = JSON.parse(paar.tekst); } catch (err) {
          zetMelding('Onverwacht antwoord van de server. Probeer het opnieuw.');
          return;
        }
        if (!paar.res.ok) { zetMelding(data.fout || 'Er ging iets mis bij het opzoeken.'); return; }

        if (DEBUG) {
          zetMelding('debug: HTTP ' + paar.res.status + ' in ' + (Date.now() - begonnen) +
            ' ms · tijden ' + JSON.stringify(data.tijden || {}), 'ok');
        }

        uitkomst.hidden = false;
        toon(data);
        meld('getekend', { ms: Date.now() - begonnen, details: 'bouwjaar ' + (data.woning && data.woning.bouwjaar) });
        uitkomst.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (fout) {
        clearTimeout(limiet);
        console.error('[woningcheck] mislukt:', fout);
        meld(fout && fout.name === 'AbortError' ? 'afgebroken' : 'fout', {
          ms: Date.now() - begonnen,
          details: ((fout && fout.name) || '?') + ': ' + ((fout && fout.message) || fout),
        });
        zetMelding(fout && fout.name === 'AbortError'
          ? 'Het opzoeken duurde te lang en is afgebroken. Probeer het over een paar minuten opnieuw.'
          : 'De verbinding is mislukt. Probeer het opnieuw.');
      })
      .then(function () { lopend = null; bezig(false); });
  });

  // --- 3. Tekenen ---------------------------------------------------------

  function cijfer(label, waarde, eenheid, toelichting) {
    if (waarde === null || waarde === undefined) {
      return '<div class="wc-cijfer wc-cijfer-leeg"><dt>' + label + '</dt><dd>niet bekend</dd></div>';
    }
    return '<div class="wc-cijfer"><dt>' + label + '</dt><dd>' + waarde +
      (eenheid ? '<span class="wc-eenheid">' + eenheid + '</span>' : '') + '</dd>' +
      (toelichting ? '<p class="wc-toelichting">' + toelichting + '</p>' : '') + '</div>';
  }

  function toon(d) {
    var w = d.woning || {};
    var p = d.perceel || {};
    var h = d.hoogtes || {};

    el('adrestitel').textContent = d.adres.omschrijving;
    el('adressub').textContent = [
      d.adres.gemeente ? 'gemeente ' + d.adres.gemeente : null,
      w.gebruiksdoel || null,
      'opgehaald in ' + (d.duurMs / 1000).toFixed(1).replace('.', ',') + ' s',
    ].filter(Boolean).join('  ·  ');

    el('cijfers').innerHTML = [
      cijfer('Bouwjaar', w.bouwjaar || null, '', w.bouwjaar ? bouwjaarUitleg(w.bouwjaar) : ''),
      cijfer('Woonoppervlak', getal(w.woonoppervlak), ' m²', 'gebruiksoppervlakte volgens NEN 2580'),
      cijfer('Perceel', getal(p.oppervlakte), ' m²', p.aanduiding ? 'kadastraal ' + p.aanduiding : ''),
      cijfer('Grondoppervlak pand', getal(w.grondoppervlak, 1), ' m²',
        w.afmetingen ? 'ongeveer ' + getal(w.afmetingen.kortsteZijde, 1) + ' bij ' + getal(w.afmetingen.langsteZijde, 1) + ' m' : ''),
      cijfer('Goothoogte', getal(h.goothoogte, 1), ' m', h.bouwlagen ? 'circa ' + h.bouwlagen + ' bouwlagen' : ''),
      cijfer('Nokhoogte', getal(h.nokhoogte, 1), ' m', h.daktype ? 'daktype ' + h.daktype : ''),
    ].join('');

    var gemist = el('gemist');
    if (d.gemist && d.gemist.length) {
      gemist.textContent = 'Niet alles kon worden opgehaald: ' +
        d.gemist.map(function (g) { return g.bron; }).join(', ') +
        '. De rest van de gegevens hieronder is wel actueel.';
      gemist.hidden = false;
    } else {
      gemist.hidden = true;
    }

    el('fotos').innerHTML = (d.luchtfotos || []).map(function (f) {
      return '<figure class="wc-foto"><img src="' + f.url + '" alt="Luchtfoto: ' + f.naam +
        '" loading="lazy"><figcaption>' + f.naam +
        '<span>' + f.meter + ' m breed · ' + f.cmPerPixel + ' cm per pixel</span></figcaption></figure>';
    }).join('');

    el('conclusies').innerHTML = (d.conclusies || []).map(function (c) {
      return '<li data-soort="' + c.soort + '">' + c.tekst + '</li>';
    }).join('');

    var a = d.archief || {};
    el('archieftitel').textContent = a.gemeente
      ? 'Bouwtekeningen opvragen bij gemeente ' + a.gemeente
      : 'Bouwtekeningen opvragen bij uw gemeente';
    el('archieftekst').textContent = a.tekst + (a.let_op ? ' ' + a.let_op : '');
    el('archieflink').innerHTML = a.url
      ? '<a class="wc-knop" href="' + a.url + '" target="_blank" rel="noopener noreferrer">Naar het bouwarchief &rarr;</a>'
      : '';

    var naarConfig = el('naarconfig');
    if (naarConfig) naarConfig.href = '/?adres=' + encodeURIComponent(d.adres.omschrijving) + '#configurator';

    el('versie').textContent = 'assets ' + VERSIE + (d.mockdata ? ' · TESTMODUS, fictieve gegevens' : '');
  }

  function bouwjaarUitleg(jaar) {
    if (jaar < 1945) return 'meestal houten vloeren, gemetselde gevel';
    if (jaar < 1975) return 'houten en betonnen vloeren gemengd';
    if (jaar < 1992) return 'doorgaans betonnen vloeren';
    return 'modern casco, goede documentatie';
  }

  // Diep linken: /woningcheck?q=1401EX5 zoekt direct.
  if (input && input.value.trim().length >= 4) {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }
})();
