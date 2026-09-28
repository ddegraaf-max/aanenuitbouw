'use strict';

/**
 * Pagina's en blokken die hun inhoud uit de configurator halen: de opties
 * (dak, gevel, pui, extra's), de rekenvoorbeelden, de prijslijst en de
 * veelgestelde vragen.
 *
 * Niets hier bevat eigen bedragen of eigen omschrijvingen van opties:
 *   - opties, omschrijvingen en de berekening  -> configurator.html (via configurator.js)
 *   - prijzen                                   -> beheerpaneel
 *   - stappen en verantwoordelijkheden          -> projectfasen.js
 *   - overige teksten                           -> teksten.js
 *
 * 'g' is steeds het resultaat van configurator.metPrijzen(...).
 */

module.exports = function maakOpties(h) {
  const { esc, rijk, euro, T, PROJECTFASEN } = h;
  const C = T.CONFIGURATOR;

  const fase = (id) => PROJECTFASEN.FASEN.find((f) => f.id === id) || { wat: [], nodig: [] };
  // "Vergunning: u bent zelf ..." -> "U bent zelf ..."
  const zonderLabel = (t) => {
    const s = String(t || '').replace(/^[^:]{1,30}:\s*/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const regel = (lijst, re) => (lijst || []).find((r) => re.test(r)) || '';
  const getal = (n) => String(n).replace('.', ',');

  // ─── Prijslabels, gelijk aan die in de configurator ───
  const plus = (bedrag) => '+' + euro(bedrag);
  const dakLabel = (r) => (r.mult > 1 ? '+' + Math.round((r.mult - 1) * 100) + '%' : C.labels.standaard);
  const meerprijs = (bedrag, nul) => (bedrag > 0 ? plus(bedrag) : nul);

  function pil(tekst) {
    const neutraal = tekst === C.labels.standaard || tekst === C.labels.inbegrepen;
    return `<span class="prijs-pil${neutraal ? ' neutraal' : ''}">${esc(tekst)}</span>`;
  }

  function kleuren(kop, lijst) {
    if (!lijst || !lijst.length) return '';
    return `<div class="kleuren-kop">${esc(kop)}</div>
        <ul class="kleuren">
          ${lijst.map((k) => `<li><span class="kleur-stip" style="background:${esc(k.hex)}"></span>${esc(k.label)}${k.prijs ? ` <span class="kleur-prijs">${esc(k.prijs)}</span>` : ''}</li>`).join('\n          ')}
        </ul>`;
  }

  function kaart(o) {
    return `<article class="optie">
        <div class="optie-kop"><h3>${esc(o.titel)}</h3>${pil(o.prijs)}</div>
        <p>${rijk(o.tekst)}</p>
        ${o.perPlan ? `<ul class="per-plan">${o.perPlan.map((r) => `<li><strong>${esc(r[0])}</strong> ${esc(r[1])}</li>`).join('')}</ul>` : ''}
        ${o.kleuren || ''}
      </article>`;
  }

  function sectie(klasse, kicker, kop, inhoud, intro) {
    return `<section class="section ${klasse}">
  <div class="container">
    <div class="section-eyebrow">${esc(kicker)}</div>
    <h2 class="section-title${intro ? '' : ' alleen'}">${esc(kop)}</h2>
    ${intro ? `<p class="section-sub">${rijk(intro)}</p>` : ''}
    ${inhoud}
  </div>
</section>`;
  }

  // Links naar de andere optiepagina's
  function andereOpties(huidig) {
    const paginas = ['dak', 'gevel', 'kozijn', 'extras'].filter((k) => k !== huidig).map((k) => T.PAGINAS[k]);
    return `<div class="blok-link optie-links">
      ${paginas.map((p) => `<a class="meer-link" href="${esc(p.pad)}">${esc(p.broodkruimel)}</a>`).join('\n      ')}
    </div>`;
  }

  // ─── Rekenvoorbeelden ───────────────────────────────────────────────────

  // De keuzes waarmee de configurator opent, in woorden
  function standaardKeuzes(g) {
    const s = g.standaard;
    const kleur = (g.COLORS.find((c) => c.id === s.doorColor) || {}).label || '';
    return [
      g.ROOF_TYPES[s.roof].label,
      g.GEVEL_TYPES[s.gevel.type].label,
      `${g.DOORS[s.doors].label}${kleur ? ' (' + kleur.toLowerCase() + ')' : ''}`,
      C.bovenkozijn[s.bovenkozijn].label,
      g.DAKRAND_TYPES[s.dakrand].label,
    ].map((t) => t.charAt(0).toLowerCase() + t.slice(1));
  }

  function maatLabel(b, d) {
    return `${getal(b)} × ${getal(d)} m (${getal(b * d)} m²)`;
  }

  function tabelVoorbeelden(g, soort) {
    const plannen = Object.keys(g.PLANS);
    return `<div class="tabel-wrap">
      <table class="tabel stapel">
        <caption>${esc(T.DIENSTEN[soort].naam)}</caption>
        <thead>
          <tr><th scope="col">${esc(T.REKENVOORBEELD.kolomMaat)}</th>${plannen.map((k) => `<th scope="col" class="bedrag">${esc(g.PLANS[k].name)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${T.REKENVOORBEELD.maten.map(([b, d]) => `<tr><th scope="row">${esc(maatLabel(b, d))}</th>${plannen.map((k) =>
            `<td class="bedrag" data-label="${esc(g.PLANS[k].name)}">${esc(euro(g.bereken({ type: soort, width: b, depth: d, plan: k }).total))}</td>`).join('')}</tr>`).join('\n          ')}
        </tbody>
      </table>
    </div>`;
  }

  function toelichting(g) {
    return `<p class="voetnoot">${esc(T.REKENVOORBEELD.uitleg)} ${esc(standaardKeuzes(g).join(', '))}. ${esc(C.prijs.voorbehoud)}</p>`;
  }

  function blokRekenvoorbeelden(g, soorten, klasse) {
    const inhoud = `<div class="tabellen">
      ${soorten.map((s) => tabelVoorbeelden(g, s)).join('\n      ')}
    </div>
    <p class="tabel-bijschrift">${esc(C.prijs.totaal)} — ${esc(C.prijs.toevoeging)}</p>
    ${toelichting(g)}
    <div class="blok-link"><a class="meer-link" href="/#configurator">${esc(T.REKENVOORBEELD.link)}</a></div>`;
    return sectie(klasse, T.REKENVOORBEELD.kicker, T.REKENVOORBEELD.kop, inhoud);
  }

  // Eén voorbeeld uitgesplitst. De regels worden hier opgeteld en vergeleken met
  // de uitkomst van de configurator; klopt dat niet, dan blijft het blok weg.
  function blokOpbouw(g, soort, klasse) {
    const s = g.standaard;
    const P = g.prijzen();
    const keuze = { type: soort };
    const uit = g.bereken(keuze);
    const plan = g.PLANS[s.plan];
    const regels = [[`${T.REKENVOORBEELD.regels.basis}: ${getal(uit.area)} m² × ${euro(plan.rate)}`, uit.base]];
    if (soort === 'uitbouw') {
      regels.push([`${T.REKENVOORBEELD.regels.uitbouw}: ${getal(s.width)} m × ${euro(P.uitbouw_wand_per_meter)}`, Math.round(s.width * P.uitbouw_wand_per_meter)]);
    }
    regels.push([`${T.REKENVOORBEELD.regels.dakrand}: ${g.DAKRAND_TYPES[s.dakrand].label.toLowerCase()}`, g.DAKRAND_TYPES[s.dakrand].extra]);
    regels.push([`${T.REKENVOORBEELD.regels.bovenkozijn}: ${C.bovenkozijn[s.bovenkozijn].label.toLowerCase()}`, P[C.bovenkozijn[s.bovenkozijn].prijsSleutel]]);
    const som = regels.reduce((t, r) => t + r[1], 0);
    if (som !== uit.total) {
      console.error(`[paginas] opbouw ${soort}: som ${som} is niet gelijk aan de configurator (${uit.total}); blok weggelaten`);
      return '';
    }
    const inhoud = `<div class="tabel-wrap smal">
      <table class="tabel">
        <caption>${esc(T.DIENSTEN[soort].naam)} ${esc(maatLabel(s.width, s.depth))}, ${esc(plan.name)}</caption>
        <tbody>
          ${regels.map((r) => `<tr><th scope="row">${esc(r[0])}</th><td class="bedrag">${esc(euro(r[1]))}</td></tr>`).join('\n          ')}
          <tr class="totaal"><th scope="row">${esc(C.prijs.totaal)}</th><td class="bedrag">${esc(euro(uit.total))}</td></tr>
        </tbody>
      </table>
    </div>
    <p class="tabel-bijschrift">${esc(C.prijs.toevoeging)}</p>
    <p class="voetnoot">${esc(C.prijs.richtprijs)}</p>`;
    return sectie(klasse, T.REKENVOORBEELD.kicker, T.REKENVOORBEELD.opbouwKop, inhoud);
  }

  // ─── Prijslijst ─────────────────────────────────────────────────────────

  function prijslijstRegels(g) {
    const P = g.prijzen();
    const G = T.PRIJSLIJST.groepen;
    const L = C.labels;
    const plannen = Object.values(g.PLANS).map((p) => p.name);
    const [casco, cplus, cplus2] = plannen;
    return [
      [G.type, [
        [T.DIENSTEN.aanbouw.naam, L.standaard],
        [T.DIENSTEN.uitbouw.naam, `${plus(P.uitbouw_wand_per_meter)} ${C.uitbouwMeerprijs}`],
      ]],
      [G.dak, Object.values(g.ROOF_TYPES).map((r) => [r.label, dakLabel(r)])],
      [G.dakrand, Object.values(g.DAKRAND_TYPES).map((d) => [d.label, plus(d.extra)])],
      [G.gevel, Object.values(g.GEVEL_TYPES).map((t) => [t.label, meerprijs(t.extra, L.standaard)])],
      [G.pui, Object.values(g.DOORS).map((d) => [d.label, meerprijs(d.extra, L.inbegrepen)])],
      [G.kleur, g.COLORS.map((k) => [k.label, meerprijs(k.extra, L.inbegrepen)])],
      [G.bovenkozijn, Object.values(C.bovenkozijn).map((b) => [b.label, plus(P[b.prijsSleutel])])],
      [G.extras, [
        [C.extras.lichtkoepel.label, `${plus(P.extra_lichtkoepel)} (${cplus2}: ${L.inbegrepen})`],
        [C.extras.vloerverwarming.label, `+${euro(P.extra_vloerverwarming_m2)}/m² (${cplus2}: ${L.inbegrepen})`],
        [C.extras.buitenkraan.label, `${plus(P.extra_buitenkraan)} (${cplus} en ${cplus2}: ${L.inbegrepen})`],
      ]],
      [G.regenpijp, [C.regenpijp.pvc, C.regenpijp.zink].map((r) => [r.label, `${euro(P[r.prijsSleutel])} ${C.regenpijp.perPijp}`])],
      [G.elektra, [C.elektra.contact, C.elektra.licht, C.elektra.contactBuiten, C.elektra.lichtBuiten].map((e) =>
        [e.label, `${euro(P[e.prijsSleutel])} ${e.tekst.replace(/\s*\(.*$/, '').replace(/,.*$/, '')}`])],
    ].map(([groep, regels]) => ({ groep, regels, casco }));
  }

  function blokPrijslijst(g, klasse) {
    const groepen = prijslijstRegels(g);
    const inhoud = `<div class="tabel-wrap">
      <table class="tabel prijslijst">
        <thead>
          <tr>${T.PRIJSLIJST.kolommen.map((k, i) => `<th scope="col"${i === 2 ? ' class="bedrag"' : ''}>${esc(k)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${groepen.map((gr) => gr.regels.map((r, i) =>
            `<tr${i === 0 ? ' class="eerste"' : ''}>${i === 0 ? `<th scope="rowgroup" rowspan="${gr.regels.length}">${esc(gr.groep)}</th>` : ''}<td>${esc(r[0])}</td><td class="bedrag">${esc(r[1])}</td></tr>`).join('\n          ')).join('\n          ')}
        </tbody>
      </table>
    </div>
    <p class="voetnoot">${esc(C.prijs.voorbehoud)}</p>
    <div class="blok-link optie-links">
      ${['dak', 'gevel', 'kozijn', 'extras'].map((k) => `<a class="meer-link" href="${esc(T.PAGINAS[k].pad)}">${esc(T.PAGINAS[k].broodkruimel)}</a>`).join('\n      ')}
    </div>`;
    return sectie(klasse, T.PRIJSLIJST.kicker, T.PRIJSLIJST.kop, inhoud);
  }

  // ─── Pagina: dak en dakrand ─────────────────────────────────────────────

  function paginaDak(g) {
    const p = T.PAGINAS.dak;
    const P = g.prijzen();
    const cplus2 = g.PLANS.cplus2.name;
    const daken = `<div class="optie-grid">
      ${Object.values(g.ROOF_TYPES).map((r) => kaart({ titel: r.label, prijs: dakLabel(r), tekst: r.desc })).join('\n      ')}
    </div>`;
    const randen = `<div class="optie-grid">
      ${Object.values(g.DAKRAND_TYPES).map((d) => kaart({ titel: d.label, prijs: plus(d.extra), tekst: d.desc })).join('\n      ')}
    </div>
    <div class="kleuren-blok">${kleuren(C.kleuren.dakrand, g.COLORS)}</div>`;
    const koepel = `<div class="optie-grid een">
      ${kaart({
        titel: C.extras.lichtkoepel.label,
        prijs: plus(P.extra_lichtkoepel),
        tekst: C.extras.lichtkoepel.tekst,
        perPlan: [[cplus2 + ':', regel(T.PLANNEN.find((x) => x.id === 'cplus2').punten, /Lichtkoepel/)]],
      })}
    </div>
    ${andereOpties('dak')}`;
    const inhoud = [
      h.paginaKop(p),
      sectie('section-paper', p.kicker, C.koppen.daktype, daken),
      sectie('section-light', p.kicker, C.koppen.dakrand, randen),
      sectie('section-paper', T.PAGINAS.extras.kicker, C.extras.lichtkoepel.label, koepel),
      h.blokSamenstellen('section-light'),
      h.contactBlok(),
    ].join('\n\n');
    return { p, inhoud };
  }

  // ─── Pagina: gevelbekleding ─────────────────────────────────────────────

  function paginaGevel(g) {
    const p = T.PAGINAS.gevel;
    const gevels = `<div class="optie-grid drie">
      ${Object.values(g.GEVEL_TYPES).map((t) => kaart({
        titel: t.label,
        prijs: meerprijs(t.extra, C.labels.standaard),
        tekst: t.desc,
        kleuren: kleuren(`Kleur / stijl ${t.label.toLowerCase()}`, t.styles),
      })).join('\n      ')}
    </div>
    ${andereOpties('gevel')}`;
    const inhoud = [
      h.paginaKop(p),
      sectie('section-paper', p.kicker, C.koppen.materiaal, gevels),
      h.blokKlassiek('section-light'),
      h.blokProjecten('section-paper'),
      h.blokSamenstellen('section-light'),
      h.contactBlok(),
    ].join('\n\n');
    return { p, inhoud };
  }

  // ─── Pagina: pui en kozijnen ────────────────────────────────────────────

  function paginaKozijn(g) {
    const p = T.PAGINAS.kozijn;
    const P = g.prijzen();
    const puien = `<div class="optie-grid">
      ${Object.values(g.DOORS).map((d) => kaart({ titel: d.label, prijs: meerprijs(d.extra, C.labels.inbegrepen), tekst: d.desc })).join('\n      ')}
    </div>`;
    const kleur = `<div class="kleuren-blok groot">${kleuren(C.kleuren.kozijn, g.COLORS.map((k) => ({ ...k, prijs: meerprijs(k.extra, C.labels.inbegrepen) })))}</div>`;
    const boven = `<div class="optie-grid">
      ${Object.values(C.bovenkozijn).map((b) => kaart({ titel: b.label, prijs: plus(P[b.prijsSleutel]), tekst: b.tekst })).join('\n      ')}
    </div>`;
    // Bestellen en plaatsen: uit de stappen 7 en 8 van projectfasen.js
    const bestellen = regel(fase('buitenafwerking').wat, /kozijnelement/i);
    const plaatsen = regel(fase('binnenafwerking').wat, /^Het element wordt gesteld/);
    const stappen = `<ul class="punten">
      ${[bestellen, plaatsen].filter(Boolean).map((r) => `<li>${esc(r)}</li>`).join('\n      ')}
    </ul>
    ${andereOpties('kozijn')}`;
    const inhoud = [
      h.paginaKop(p),
      sectie('section-paper', p.kicker, T.PRIJSLIJST.groepen.pui, puien),
      sectie('section-light', p.kicker, C.kleuren.kozijn, kleur),
      sectie('section-paper', p.kicker, C.koppen.bovenkozijn, boven),
      sectie('section-light', T.BLOKKEN.stappen.kicker, fase('binnenafwerking').titel, stappen),
      h.blokSamenstellen('section-paper'),
      h.contactBlok(),
    ].join('\n\n');
    return { p, inhoud };
  }

  // ─── Pagina: extra's ────────────────────────────────────────────────────

  function paginaExtras(g) {
    const p = T.PAGINAS.extras;
    const P = g.prijzen();
    const L = C.labels;
    const [casco, cplus, cplus2] = Object.values(g.PLANS).map((x) => x.name);
    const E = C.extras;
    const kaarten = `<div class="optie-grid drie">
      ${kaart({
        titel: E.lichtkoepel.label, prijs: plus(P.extra_lichtkoepel), tekst: E.lichtkoepel.tekst,
        perPlan: [[casco + ':', plus(P.extra_lichtkoepel)], [cplus + ':', plus(P.extra_lichtkoepel)], [cplus2 + ':', L.inbegrepen]],
      })}
      ${kaart({
        titel: E.vloerverwarming.label, prijs: `+${euro(P.extra_vloerverwarming_m2)}/m²`, tekst: E.vloerverwarming.tekst,
        perPlan: [[casco + ':', L.nietBijCasco.toLowerCase()], [cplus + ':', `+${euro(P.extra_vloerverwarming_m2)}/m²`], [cplus2 + ':', L.inbegrepen]],
      })}
      ${kaart({
        titel: E.buitenkraan.label, prijs: plus(P.extra_buitenkraan), tekst: E.buitenkraan.tekst,
        perPlan: [[casco + ':', plus(P.extra_buitenkraan)], [cplus + ':', L.inbegrepen], [cplus2 + ':', L.inbegrepen]],
      })}
    </div>
    <p class="voetnoot">${esc(E.vloerverwarming.casco)}</p>`;

    const R = C.regenpijp;
    const pijpen = `<div class="optie-grid">
      ${kaart({ titel: R.pvc.label, prijs: `${euro(P[R.pvc.prijsSleutel])} ${R.perPijp}`, tekst: R.pvc.tekst, kleuren: kleuren(C.kleuren.pvc, g.PVC_COLORS) })}
      ${kaart({ titel: R.zink.label, prijs: `${euro(P[R.zink.prijsSleutel])} ${R.perPijp}`, tekst: R.zink.tekst })}
    </div>`;

    const El = C.elektra;
    const rij = (e) => `<tr><th scope="row">${esc(e.label)}</th><td class="bedrag">${esc(euro(P[e.prijsSleutel]))} ${esc(e.tekst)}</td></tr>`;
    const inPlan = (id, re) => regel((T.PLANNEN.find((x) => x.id === id) || {}).punten, re);
    const elektra = `<div class="tabellen">
      <div class="tabel-wrap smal">
        <table class="tabel">
          <caption>${esc(El.binnenKop)}</caption>
          <tbody>
            ${rij(El.contact)}
            ${rij(El.licht)}
          </tbody>
        </table>
      </div>
      <div class="tabel-wrap smal">
        <table class="tabel">
          <caption>${esc(El.buitenKop)}<span class="caption-uitleg">${esc(El.buiten)}</span></caption>
          <tbody>
            ${rij(El.contactBuiten)}
            ${rij(El.lichtBuiten)}
          </tbody>
        </table>
      </div>
    </div>
    <ul class="punten ruim">
      <li><strong>${esc(cplus)}:</strong> ${esc(inPlan('cplus', /contactpunt/i))}</li>
      <li><strong>${esc(cplus2)}:</strong> ${esc(inPlan('cplus2', /elektra/i))}</li>
      <li><strong>${esc(El.cascoKop)}.</strong> ${esc(El.casco)}</li>
      <li>${rijk(El.plan)}</li>
    </ul>
    ${andereOpties('extras')}`;

    const inhoud = [
      h.paginaKop(p),
      sectie('section-paper', p.kicker, `${E.lichtkoepel.label}, ${E.vloerverwarming.label.toLowerCase()} en ${E.buitenkraan.label.toLowerCase()}`, kaarten),
      sectie('section-light', p.kicker, R.kop, pijpen, R.intro),
      sectie('section-paper', p.kicker, T.PRIJSLIJST.groepen.elektra, elektra),
      h.blokSamenstellen('section-light'),
      h.contactBlok(),
    ].join('\n\n');
    return { p, inhoud };
  }

  // ─── Pagina: veelgestelde vragen ────────────────────────────────────────

  // Elk antwoord is een lijst alinea's; een lijst binnen de lijst wordt een opsomming.
  function antwoorden(g) {
    const P = g.prijzen();
    const plannen = Object.values(g.PLANS);
    const constructie = fase('constructie');
    const fundering = fase('fundering');
    const K = T.BOUWWIJZE.klassiek;
    return {
      verschil: [C.verschil, `${T.DIENSTEN.aanbouw.naam}: ${C.aanbouw}`, `${T.DIENSTEN.uitbouw.naam}: ${C.uitbouw}`],
      kosten: [
        plannen.map((x) => `${x.name} vanaf ${euro(x.rate)}/m²`).join(', ') + '.',
        `${T.DIENSTEN.uitbouw.naam}: ${plus(P.uitbouw_wand_per_meter)} ${C.uitbouwMeerprijs}. ${C.uitbouw}`,
        C.prijs.voorbehoud,
      ],
      plannen: plannen.map((x) => `${x.name}: ${x.desc}`),
      offerte: [C.offerte, C.prijs.richtprijs],
      vergunning: [zonderLabel(regel(constructie.nodig, /^Vergunning:/))],
      constructie: constructie.wat.slice(0, 2),
      tekeningen: [regel(constructie.nodig, /^Bouwtekeningen/), regel(constructie.nodig, /^Heeft u geen tekeningen/)],
      sondering: [zonderLabel(regel(constructie.nodig, /^Sondering:/)), T.BODEMCHECK.tekst, T.BODEMCHECK.voorbehoud],
      fundering: [fundering.kort, ...fundering.wat, regel(fase('offerte').wat, /schroefpalen/i)],
      bouwwijze: [T.BOUWWIJZE.intro.split('. ').slice(0, 2).join('. ') + '.', K.tekst],
      daken: [Object.values(g.ROOF_TYPES).map((r) => `${r.label} (${dakLabel(r)}): ${r.desc}`)],
      puien: [Object.values(g.DOORS).map((d) => `${d.label} (${meerprijs(d.extra, C.labels.inbegrepen)}): ${d.desc}`)],
      vloerverwarming: [C.extras.vloerverwarming.casco, regel(fase('binnenafwerking').wat, /^Vloerverwarming en lichtkoepel/)],
      elektra: [C.elektra.plan],
      huisbezoek: [fase('huisbezoek').nodig],
      volgen: [T.BLOKKEN.volgen.tekst],
      waarde: [C.waarde, T.BLOKKEN.samenstellen.tekst],
    };
  }

  function paginaVragen(g) {
    const p = T.PAGINAS.vragen;
    const A = antwoorden(g);
    const lijst = T.VRAGEN.map((v) => ({ ...v, antwoord: (A[v.id] || []).filter((a) => (Array.isArray(a) ? a.length : a)) }))
      .filter((v) => v.antwoord.length);
    const blokken = lijst.map((v) => `<article class="vraag" id="${esc(v.id)}">
      <h2>${esc(v.vraag)}</h2>
      ${v.antwoord.map((a) => (Array.isArray(a)
        ? `<ul>${a.map((r) => `<li>${rijk(r)}</li>`).join('')}</ul>`
        : `<p>${rijk(a)}</p>`)).join('\n      ')}
      ${v.link ? `<a class="meer-link" href="${esc(v.link.pad)}">${esc(v.link.label)}</a>` : ''}
    </article>`);
    const inhoud = [
      h.paginaKop(p),
      `<section class="section section-light">
  <div class="container">
    <div class="vragen">
    ${blokken.join('\n    ')}
    </div>
  </div>
</section>`,
      h.contactBlok(),
    ].join('\n\n');
    const plat = (t) => String(t).replace(/<\/?strong>/g, '');
    const vragen = lijst.map((v) => ({
      '@type': 'Question',
      name: v.vraag,
      acceptedAnswer: { '@type': 'Answer', text: v.antwoord.map((a) => (Array.isArray(a) ? a.map(plat).join(' ') : plat(a))).join(' ') },
    }));
    return { p, inhoud, vragen };
  }

  return { blokRekenvoorbeelden, blokOpbouw, blokPrijslijst, paginaDak, paginaGevel, paginaKozijn, paginaExtras, paginaVragen, antwoorden, prijslijstRegels, standaardKeuzes };
};
