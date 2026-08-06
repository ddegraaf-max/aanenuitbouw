'use strict';

/**
 * Interpretatie van een sondering naar grondlagen en een funderingsindicatie.
 *
 * NADRUKKELIJK: dit is een indicatie, geen funderingsadvies. De classificatie
 * hieronder is een vereenvoudigde variant van de gangbare vuistregels op basis
 * van conusweerstand (qc) en wrijvingsgetal (Rf = fs/qc x 100). Een echte
 * grondslagbeoordeling gebeurt door een geotechnisch adviseur op basis van een
 * sondering OP de bouwlocatie, met toetsing aan NEN 9997-1 (Eurocode 7).
 * Alle teksten die deze module produceert zijn zo geformuleerd dat ze dat
 * onderscheid expliciet maken.
 */

// ---------------------------------------------------------------------------
// Grondsoorten
// ---------------------------------------------------------------------------

const GRONDSOORTEN = {
  veen: { label: 'Veen', kleur: '#3E2B1F', draagkracht: 'zeer slap', zetting: 'hoog' },
  slappeKlei: { label: 'Slappe klei', kleur: '#5C6652', draagkracht: 'zeer slap', zetting: 'hoog' },
  klei: { label: 'Klei', kleur: '#6E7A5E', draagkracht: 'slap', zetting: 'matig tot hoog' },
  leem: { label: 'Leem / zandige klei', kleur: '#8A7B5C', draagkracht: 'matig', zetting: 'matig' },
  vasteKlei: { label: 'Vaste klei / leem', kleur: '#9C8A63', draagkracht: 'redelijk', zetting: 'beperkt' },
  losZand: { label: 'Los zand', kleur: '#D8C48A', draagkracht: 'matig', zetting: 'matig' },
  matigZand: { label: 'Matig vast zand', kleur: '#C9A227', draagkracht: 'goed', zetting: 'beperkt' },
  vastZand: { label: 'Vast zand', kleur: '#A87A12', draagkracht: 'zeer goed', zetting: 'gering' },
  zeerVastZand: { label: 'Zeer vast zand / grind', kleur: '#7E5806', draagkracht: 'zeer goed', zetting: 'gering' },
  onbekend: { label: 'Niet te bepalen', kleur: '#8E8E8E', draagkracht: 'onbekend', zetting: 'onbekend' },
};

/** Vereenvoudigde grondsoortbepaling uit qc (MPa) en Rf (%). */
function classificeer(qc, rf) {
  if (qc === null || !Number.isFinite(qc)) return 'onbekend';
  const r = Number.isFinite(rf) ? rf : null;

  if (qc < 0.8) return r !== null && r >= 4 ? 'veen' : 'slappeKlei';
  if (qc < 1.5) return r !== null && r >= 5 ? 'veen' : 'klei';
  if (qc < 3) return r !== null && r >= 3 ? 'klei' : 'losZand';
  if (qc < 6) return r !== null && r >= 3.5 ? 'vasteKlei' : 'losZand';
  if (qc < 12) return r !== null && r >= 4 ? 'vasteKlei' : 'matigZand';
  if (qc < 20) return 'vastZand';
  return 'zeerVastZand';
}

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

/** Voortschrijdende mediaan: haalt meetpieken eruit zonder laaggrenzen uit te smeren. */
function mediaanFilter(waarden, venster = 11) {
  const half = Math.floor(venster / 2);
  const uit = new Array(waarden.length);
  for (let i = 0; i < waarden.length; i++) {
    const van = Math.max(0, i - half);
    const tot = Math.min(waarden.length, i + half + 1);
    const deel = waarden.slice(van, tot).filter((v) => v !== null && Number.isFinite(v));
    if (deel.length === 0) {
      uit[i] = null;
      continue;
    }
    deel.sort((a, b) => a - b);
    uit[i] = deel[Math.floor(deel.length / 2)];
  }
  return uit;
}

/**
 * Zoekt de bovenkant van de eerste laag waarin de gefilterde qc over ten
 * minste `minDikte` meter aaneengesloten boven `drempel` blijft.
 */
function eersteDraagkrachtigeLaag(punten, qcGefilterd, drempel, minDikte) {
  let startIndex = null;
  for (let i = 0; i < punten.length; i++) {
    const q = qcGefilterd[i];
    if (q !== null && q >= drempel) {
      if (startIndex === null) startIndex = i;
      const dikte = punten[i].d - punten[startIndex].d;
      if (dikte >= minDikte) {
        return {
          bovenkant: Math.round(punten[startIndex].d * 100) / 100,
          qcGemiddeld: Math.round(
            (qcGefilterd.slice(startIndex, i + 1).reduce((a, b) => a + (b || 0), 0) / (i + 1 - startIndex)) * 10,
          ) / 10,
        };
      }
    } else {
      startIndex = null;
    }
  }
  return null;
}

function afronden(n, decimalen = 2) {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** decimalen;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Hoofdfunctie: één sondering interpreteren
// ---------------------------------------------------------------------------

const DREMPEL_STAAL = 5; // MPa: minimaal voor fundering op staal (indicatief)
const DIKTE_STAAL = 0.5; // m aaneengesloten
const DREMPEL_PAAL = 12; // MPa: indicatief paalpuntniveau
const DIKTE_PAAL = 1.0; // m aaneengesloten
const VORSTVRIJ = 0.8; // m onder maaiveld, NL-vuistregel voor aanlegdiepte

function interpreteerSondering(sondering, opties = {}) {
  const minLaagdikte = opties.minLaagdikte ?? 0.3;
  const punten = sondering.punten;
  const qc = mediaanFilter(punten.map((p) => p.qc), 11);
  // Het wrijvingsgetal is aanzienlijk ruiziger dan de conusweerstand (het is
  // een quotient van twee metingen), dus dat filteren we over een breder
  // venster. Anders wisselt de classificatie elke paar centimeter tussen
  // "klei" en "los zand" rond de grenswaarde.
  const rf = mediaanFilter(punten.map((p) => p.rf), 21);

  // --- Lagen samenstellen -------------------------------------------------
  // Laaggrenzen liggen exact op de meetdiepte waar de classificatie omslaat;
  // opeenvolgende lagen sluiten dus naadloos aan zonder overlap.
  const lagen = [];
  for (let i = 0; i < punten.length; i++) {
    const soort = classificeer(qc[i], rf[i]);
    const huidig = lagen[lagen.length - 1];
    if (!huidig || huidig.soort !== soort) {
      const grens = huidig ? huidig.onderkant : 0;
      lagen.push({ soort, bovenkant: grens, onderkant: punten[i].d, qcSom: qc[i] ?? 0, n: qc[i] === null ? 0 : 1 });
    } else {
      huidig.onderkant = punten[i].d;
      if (qc[i] !== null) {
        huidig.qcSom += qc[i];
        huidig.n++;
      }
    }
  }

  // Dunne laagjes wegwerken. Een sondering wisselt op centimeterniveau, maar
  // een laagje van 8 cm is geen grondlaag: dat is ruis of een schelpenbank.
  // We voegen zo'n laagje toe aan de dikste van zijn twee buren en herhalen
  // dat tot er niets dun meer over is.
  const samengevoegd = lagen.map((l) => ({ ...l }));
  let veranderd = true;
  while (veranderd && samengevoegd.length > 1) {
    veranderd = false;
    let dunsteIndex = -1;
    let dunste = Infinity;
    for (let i = 0; i < samengevoegd.length; i++) {
      const dikte = samengevoegd[i].onderkant - samengevoegd[i].bovenkant;
      if (dikte < minLaagdikte && dikte < dunste) {
        dunste = dikte;
        dunsteIndex = i;
      }
    }
    if (dunsteIndex === -1) break;

    const boven = samengevoegd[dunsteIndex - 1];
    const onder = samengevoegd[dunsteIndex + 1];
    const dikteBoven = boven ? boven.onderkant - boven.bovenkant : -1;
    const dikteOnder = onder ? onder.onderkant - onder.bovenkant : -1;
    const doel = dikteBoven >= dikteOnder ? boven : onder;

    doel.bovenkant = Math.min(doel.bovenkant, samengevoegd[dunsteIndex].bovenkant);
    doel.onderkant = Math.max(doel.onderkant, samengevoegd[dunsteIndex].onderkant);
    doel.qcSom += samengevoegd[dunsteIndex].qcSom;
    doel.n += samengevoegd[dunsteIndex].n;
    samengevoegd.splice(dunsteIndex, 1);
    veranderd = true;
  }

  // Buren met dezelfde grondsoort samenvoegen (kan na het opslokken ontstaan).
  for (let i = samengevoegd.length - 1; i > 0; i--) {
    if (samengevoegd[i].soort === samengevoegd[i - 1].soort) {
      samengevoegd[i - 1].onderkant = samengevoegd[i].onderkant;
      samengevoegd[i - 1].qcSom += samengevoegd[i].qcSom;
      samengevoegd[i - 1].n += samengevoegd[i].n;
      samengevoegd.splice(i, 1);
    }
  }

  const lagenUit = samengevoegd.map((l) => ({
    soort: l.soort,
    label: GRONDSOORTEN[l.soort].label,
    kleur: GRONDSOORTEN[l.soort].kleur,
    draagkracht: GRONDSOORTEN[l.soort].draagkracht,
    zetting: GRONDSOORTEN[l.soort].zetting,
    van: afronden(l.bovenkant),
    tot: afronden(l.onderkant),
    dikte: afronden(l.onderkant - l.bovenkant),
    qcGemiddeld: l.n ? afronden(l.qcSom / l.n, 1) : null,
  }));

  // --- Draagkrachtige niveaus --------------------------------------------
  const staalNiveau = eersteDraagkrachtigeLaag(punten, qc, DREMPEL_STAAL, DIKTE_STAAL);
  const paalNiveau = eersteDraagkrachtigeLaag(punten, qc, DREMPEL_PAAL, DIKTE_PAAL);

  // Het slappe pakket: alle samendrukbare lagen BOVEN het eerste
  // draagkrachtige niveau. Dat is het getal dat een aanbouw raakt, want dat
  // pakket zakt in de loop der jaren in — of de aanbouw daarin meegaat hangt
  // van het funderingstype af.
  const SLAP = ['veen', 'slappeKlei', 'klei'];
  const bovengrensSlap = staalNiveau ? staalNiveau.bovenkant : sondering.einddiepte;
  const slappeLagen = lagenUit.filter((l) => SLAP.includes(l.soort) && l.van < bovengrensSlap);
  const slappeToplaag = slappeLagen.reduce(
    (som, l) => som + (Math.min(l.tot, bovengrensSlap) - l.van),
    0,
  );

  // Aaneengesloten slap pakket dat direct onder maaiveld begint.
  let slapVanafMaaiveld = 0;
  for (const laag of lagenUit) {
    if (SLAP.includes(laag.soort)) slapVanafMaaiveld = laag.tot;
    else if (laag.tot > 0.5) break;
  }

  // Samendrukbare grond ONDER het aanlegniveau van een fundering op staal:
  // dit is de directe oorzaak van zettingsverschil tussen oud en nieuw.
  const aanlegNiveau = staalNiveau ? Math.max(staalNiveau.bovenkant, VORSTVRIJ) : VORSTVRIJ;
  const slapOnderAanleg = lagenUit
    .filter((l) => l.tot > aanlegNiveau && SLAP.includes(l.soort))
    .reduce((som, l) => som + (l.tot - Math.max(l.van, aanlegNiveau)), 0);

  const naarNap = (diepte) =>
    Number.isFinite(sondering.maaiveldNap) && diepte !== null && diepte !== undefined
      ? afronden(sondering.maaiveldNap - diepte)
      : null;

  return {
    broId: sondering.broId,
    datum: sondering.datum,
    locatie: sondering.locatie,
    maaiveldNap: sondering.maaiveldNap,
    einddiepte: sondering.einddiepte,
    kwaliteitsregime: sondering.kwaliteitsregime,
    lagen: lagenUit,
    slappeToplaagDikte: afronden(slappeToplaag),
    slapVanafMaaiveld: afronden(slapVanafMaaiveld),
    slapOnderAanlegniveau: afronden(slapOnderAanleg),
    opStaal: staalNiveau
      ? {
          diepteMv: staalNiveau.bovenkant,
          diepteNap: naarNap(staalNiveau.bovenkant),
          qcGemiddeld: staalNiveau.qcGemiddeld,
          aanlegdiepteAdvies: afronden(Math.max(staalNiveau.bovenkant, VORSTVRIJ)),
        }
      : null,
    paalpunt: paalNiveau
      ? {
          diepteMv: paalNiveau.bovenkant,
          diepteNap: naarNap(paalNiveau.bovenkant),
          qcGemiddeld: paalNiveau.qcGemiddeld,
        }
      : null,
    reeks: {
      // Verdund voor de browser: 2 cm x 25 m = 1250 punten is prima, maar
      // een sondering van 40 m met 1 cm interval is 4000 punten per grafiek.
      punten: verdun(punten, 900).map((p) => ({
        d: afronden(p.d),
        qc: afronden(p.qc, 1),
        rf: afronden(p.rf, 1),
      })),
      qcMax: sondering.qcMax,
    },
  };
}

function verdun(punten, max) {
  if (punten.length <= max) return punten;
  const stap = Math.ceil(punten.length / max);
  const uit = [];
  for (let i = 0; i < punten.length; i += stap) {
    // neem het maximum binnen het venster: piekweerstanden blijven zo zichtbaar
    const blok = punten.slice(i, i + stap).filter((p) => p.qc !== null);
    if (blok.length === 0) {
      uit.push(punten[i]);
      continue;
    }
    uit.push(blok.reduce((a, b) => (b.qc > a.qc ? b : a)));
  }
  return uit;
}

// ---------------------------------------------------------------------------
// Samenvatting over meerdere sonderingen
// ---------------------------------------------------------------------------

function betrouwbaarheid(sonderingen) {
  if (sonderingen.length === 0) return { niveau: 'geen', tekst: 'Geen sonderingen in de omgeving gevonden.' };
  const nabij = sonderingen[0].afstandM;

  const paalDieptes = sonderingen.map((s) => s.paalpunt && s.paalpunt.diepteMv).filter(Number.isFinite);
  const spreiding =
    paalDieptes.length > 1 ? Math.max(...paalDieptes) - Math.min(...paalDieptes) : 0;

  if (nabij <= 75 && spreiding <= 1.5) {
    return {
      niveau: 'redelijk',
      tekst: `De dichtstbijzijnde sondering ligt op ${nabij} m en de metingen in de omgeving liggen dicht bij elkaar (spreiding ${spreiding.toFixed(1)} m). Dit geeft een redelijk beeld van de bodemopbouw, maar zegt niets over plaatselijke afwijkingen zoals een oude sloot of puinkoffer onder uw tuin.`,
    };
  }
  if (nabij <= 250 && spreiding <= 3) {
    return {
      niveau: 'indicatief',
      tekst: `De dichtstbijzijnde sondering ligt op ${nabij} m. Dat is bruikbaar als eerste beeld, maar de bodemopbouw kan binnen die afstand al meters verschillen.`,
    };
  }
  return {
    niveau: 'zwak',
    tekst: `De dichtstbijzijnde sondering ligt op ${nabij} m${spreiding > 3 ? ` en de metingen onderling verschillen sterk (spreiding ${spreiding.toFixed(1)} m)` : ''}. Beschouw dit alleen als globale streekinformatie.`,
  };
}

/** Bouwt de conclusie-bullets voor de bezoeker. */
function bouwAdvies(primair, betrouw) {
  const punten = [];

  if (!primair) {
    return [
      {
        soort: 'let-op',
        tekst: 'Er zijn in de BRO geen bruikbare sonderingen in de buurt gevonden. Voor uw project is een sondering op de bouwlocatie nodig om de fundering te kunnen bepalen.',
      },
    ];
  }

  const { opStaal, paalpunt, slappeToplaagDikte, slapOnderAanlegniveau } = primair;

  if (opStaal && opStaal.diepteMv <= 1.5 && slapOnderAanlegniveau < 1.5) {
    punten.push({
      soort: 'gunstig',
      tekst: `Vanaf ongeveer ${opStaal.diepteMv.toFixed(2)} m onder maaiveld is de grond hier draagkrachtig (gemiddeld ${opStaal.qcGemiddeld} MPa conusweerstand). Een fundering op staal — een strokenfundering of funderingsbalk zonder palen — is bij deze bodemopbouw technisch goed denkbaar.`,
    });
    punten.push({
      soort: 'info',
      tekst: `Aanlegdiepte houdt u aan op minimaal ${VORSTVRIJ.toFixed(2)} m onder maaiveld: dat is de vuistregel voor vorstvrij funderen in Nederland.`,
    });
  } else if (paalpunt) {
    punten.push({
      soort: 'let-op',
      tekst: `Onder uw locatie zit een slap pakket van circa ${slappeToplaagDikte.toFixed(1)} m (klei en/of veen). De eerste echt vaste zandlaag begint op ongeveer ${paalpunt.diepteMv.toFixed(1)} m onder maaiveld${paalpunt.diepteNap !== null ? `, dat is ${paalpunt.diepteNap.toFixed(1)} m NAP` : ''}. Voor een aanbouw betekent dit vrijwel zeker een paalfundering.`,
    });
    punten.push({
      soort: 'info',
      tekst: `Indicatief paalpuntniveau: ${(paalpunt.diepteMv + 0.5).toFixed(1)} m onder maaiveld (een paalpunt wordt doorgaans een halve meter in de vaste laag gezet). Bij een aanbouw in een tuin met beperkte werkruimte worden meestal schroefpalen of kleine boorpalen gebruikt in plaats van heipalen.`,
    });
  } else if (opStaal) {
    punten.push({
      soort: 'let-op',
      tekst: `De grond wordt vanaf circa ${opStaal.diepteMv.toFixed(2)} m redelijk draagkrachtig, maar een echt vaste zandlaag is binnen de gemeten diepte van ${primair.einddiepte} m niet aangetroffen. Dit is een bodemopbouw waarbij het funderingstype echt door een adviseur bepaald moet worden.`,
    });
  } else {
    punten.push({
      soort: 'let-op',
      tekst: `Binnen de gemeten diepte van ${primair.einddiepte} m is geen draagkrachtige laag aangetroffen. Reken op een paalfundering en laat dit door een geotechnisch adviseur uitwerken.`,
    });
  }

  const opStaalRealistisch = opStaal && opStaal.diepteMv <= 1.5;
  const samendrukbaar = opStaalRealistisch ? slapOnderAanlegniveau : slappeToplaagDikte;

  if (samendrukbaar >= 1.0) {
    punten.push({
      soort: 'let-op',
      tekst: `Boven het draagkrachtige niveau zit in totaal circa ${samendrukbaar.toFixed(1)} m samendrukbare grond. Dat is de belangrijkste oorzaak van zettingsverschil tussen een nieuwe aanbouw en de bestaande woning: als beide anders funderen, zakt het nieuwe deel mee met de grond en de oude woning niet (of omgekeerd). Een dilatatie tussen oud en nieuw is dan geen luxe.`,
    });
  }

  punten.push({
    soort: 'info',
    tekst: 'Wat de sondering niet vertelt: de fundering van uw bestaande woning. Voor het aansluiten van een aanbouw is het funderingstype van het huidige huis minstens zo bepalend als de grondslag. Dat blijkt uit de bouwtekeningen bij de gemeente of uit een proefsleuf.',
  });

  punten.push({ soort: 'info', tekst: betrouw.tekst });

  return punten;
}

function bouwSamenvatting(sonderingen, invoer) {
  const betrouw = betrouwbaarheid(sonderingen);
  const primair = sonderingen[0] || null;

  return {
    invoer,
    betrouwbaarheid: betrouw,
    advies: bouwAdvies(primair, betrouw),
    primaireSondering: primair ? primair.broId : null,
    drempels: {
      opStaalMpa: DREMPEL_STAAL,
      paalMpa: DREMPEL_PAAL,
      vorstvrijM: VORSTVRIJ,
    },
  };
}

module.exports = {
  interpreteerSondering,
  bouwSamenvatting,
  classificeer,
  GRONDSOORTEN,
  _intern: { mediaanFilter, eersteDraagkrachtigeLaag, verdun },
};
