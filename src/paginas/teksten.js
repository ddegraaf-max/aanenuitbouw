'use strict';

/*
 * TEKSTEN VAN DE LOSSE PAGINA'S — de enige plek waar ze staan.
 *
 * Pagina's: /aanbouw, /uitbouw, /plannen-en-prijzen, /prefab-of-klassiek,
 *           /dak-en-dakrand, /gevelbekleding, /pui-en-kozijnen, /extras,
 *           /werkwijze, /veelgestelde-vragen, /projecten, /over-ons, /contact.
 *
 * Alle teksten hieronder zijn overgenomen van de homepage en uit de stappen
 * van de configurator (configurator.html). Past u daar een tekst aan, pas hem
 * dan ook hier aan — en andersom.
 *
 * Drie dingen staan hier NIET, omdat ze al een eigen plek hebben:
 *   - de negen stappen van een project      -> projectfasen.js
 *   - alle prijzen en meerprijzen           -> beheerpaneel (Prijsbeheer)
 *   - de opties van de configurator (daken, gevels, puien, kleuren) met hun
 *     omschrijving                          -> configurator.html
 * De pagina's lezen die automatisch uit.
 *
 * Per pagina:
 *   titel         wat in Google als blauwe titel staat (en in het tabblad)
 *   beschrijving  de regels die Google eronder toont
 *   kicker        het kleine regeltje boven de kop
 *   kop           de grote kop van de pagina
 *   intro         de inleiding onder de kop
 *
 * In teksten mag <strong>...</strong> staan voor vet; verder geen HTML.
 */

const SITE = {
  naam: 'AanEnUitbouw.nl',
  url: 'https://aanenuitbouw.nl',
  slogan: 'Uw huis uitbreiden',
  telefoon: '+31 646 150 160',
  telefoonLink: '+31646150160',
  email: 'project@aanenuitbouw.nl',
  bedrijf: 'Creditline BV',
  kvk: '59683198',
  btw: 'NL853603108B01',
  whatsappTekst: 'Hallo, ik heb een vraag over een aan- of uitbouw.',
  voettekst: 'Vakkundige aan- en uitbouwen op maat. Met meer dan 20 jaar ervaring transformeren we uw woning naar uw wensen.',
};

// Menu bovenaan de losse pagina's
const MENU = [
  { pad: '/', label: 'Start' },
  { pad: '/aanbouw', label: 'Aanbouw' },
  { pad: '/uitbouw', label: 'Uitbouw' },
  { pad: '/plannen-en-prijzen', label: 'Plannen' },
  { pad: '/werkwijze', label: 'Werkwijze' },
  { pad: '/projecten', label: 'Projecten' },
  { pad: '/over-ons', label: 'Over ons' },
  { pad: '/contact', label: 'Contact' },
];

// ─── Diensten: aanbouw en uitbouw ───────────────────────────────────────────
const DIENSTEN = {
  aanbouw: {
    naam: 'Aanbouw',
    pad: '/aanbouw',
    tekst: 'Een uitbreiding aan de <strong>achterzijde</strong> van uw woning, waarbij de bestaande achtergevel intact blijft — wij maken alleen waar gewenst een doorgang. Ideaal voor een extra slaapkamer, kantoor, berging of speelkamer.',
    meer: 'Meer over een aanbouw',
  },
  uitbouw: {
    naam: 'Uitbouw',
    pad: '/uitbouw',
    tekst: 'Een uitbreiding aan de <strong>achterzijde</strong> van uw woning, geheel geïntegreerd met de bestaande ruimte. De volledige achtergevel wordt verwijderd zodat woonkamer of keuken naadloos overgaat in de uitbouw.',
    meer: 'Meer over een uitbouw',
  },
};

// ─── Plannen ────────────────────────────────────────────────────────────────
// 'prijs' is de prijs per m² als er in het beheer nog niets is ingesteld.
const PLANNEN = [
  {
    id: 'casco',
    naam: 'Casco',
    prijsSleutel: 'plan_casco_rate',
    prijs: 2500,
    punten: [
      'Betonnen fundering met bekisting',
      'Schroefpalen tot 10 m diep (5 stuks inbegrepen)',
      'Hoogwaardige draagconstructie',
      'Ruwbouw oplevering — wind- en waterdicht, zonder isolatie',
      'Standaard openslaande deuren wit',
    ],
    extra: 'Lichtkoepel als meerprijs · geen isolatie, elektra en vloerverwarming niet mogelijk',
  },
  {
    id: 'cplus',
    naam: 'C+',
    prijsSleutel: 'plan_cplus_rate',
    prijs: 3000,
    badge: 'Meest gekozen',
    punten: [
      'Alles uit Casco',
      'Isolatie inbegrepen',
      'Schilderklare oplevering',
      'Afgewerkte dekvloer',
      '2× contactpunt en 1× lichtpunt',
      '1× buitenkraan (vorstvrij)',
      'Standaard openslaande deuren wit',
    ],
    extra: 'Lichtkoepel & vloerverwarming als meerprijs',
  },
  {
    id: 'cplus2',
    naam: 'C++',
    prijsSleutel: 'plan_cplus2_rate',
    prijs: 3500,
    punten: [
      'Alles uit C+ (inclusief isolatie)',
      'Volledige binnenafwerking',
      'Lichtkoepel inbegrepen (standaard maat)',
      'Vloerverwarming inbegrepen',
      'Volledige elektra en buitenkraan',
      'Standaard openslaande deuren wit',
    ],
  },
];

// ─── Prefab of klassiek ─────────────────────────────────────────────────────
const BOUWWIJZE = {
  kicker: 'Bouwwijze',
  kop: 'Prefab of klassiek bouwen?',
  intro: 'Steeds meer aanbouwen komen kant-en-klaar uit de fabriek. Wij bouwen bewust klassiek, op locatie. Hieronder eerlijk de plussen en minnen van allebei, zodat u zelf kunt kiezen.',
  prefab: {
    tag: 'Prefab',
    kop: 'Kant-en-klaar uit de fabriek',
    tekst: 'Houtskeletbouw-elementen worden in een fabriek gemaakt en in een paar dagen op de fundering gezet. De gevel bestaat meestal uit steenstrips: dunne plakjes steen op een plaat.',
    plus: [
      'Korte bouwtijd op locatie: de elementen staan in enkele dagen.',
      'Minder werkverkeer en overlast in uw tuin.',
      'De montage is weinig afhankelijk van het weer.',
    ],
    min: [
      'Steenstrips in plaats van echt metselwerk: naar onze ervaring kwetsbaarder bij stoten en beschadigingen, en het verschil met uw bestaande gevel blijft zichtbaar.',
      'Vaak standaardmaten: aansluiten op een bestaande woning die niet haaks of vlak is, is lastiger.',
      'Alles ligt vooraf vast; wijzigingen tijdens de bouw zijn nauwelijks mogelijk.',
    ],
  },
  klassiek: {
    tag: 'Klassiek',
    badge: 'Zo bouwen wij',
    kop: 'Traditioneel gebouwd, op locatie',
    tekst: 'Schroefpalen, een betonnen fundering met bekisting, houten balken en dakconstructie en een gevel van échte massieve bakstenen — steen voor steen gemetseld, passend bij uw woning.',
    plus: [
      'Echt metselwerk: massieve bakstenen die decennialang meegaan en tegen een stootje kunnen.',
      'Baksteen in een kleur die past bij uw huis, zodat de aanbouw één geheel wordt met de woning.',
      'Maatwerk: elke maat, elke hoek en elke aansluiting — ook bij oudere of scheve woningen.',
      'Bewezen bouwwijze met materialen die elke vakman kent en kan onderhouden.',
    ],
    min: [
      'Langere bouwtijd op locatie dan prefab.',
      'Meer werkverkeer en overlast in de tuin tijdens de bouw.',
      'Metselwerk is weersafhankelijk: bij vorst of hevige regen kan er niet gemetseld worden.',
    ],
  },
  slot: 'Ons advies is eerlijk: heeft u haast en is de uitstraling minder belangrijk, dan is prefab een prima keuze. Wilt u een aanbouw die eruitziet en meegaat als de rest van uw huis, dan bouwt u klassiek. Daarom werken wij <strong>uitsluitend met echte massieve bakstenen — geen steenstrips</strong>.',
};

// ─── Projecten ──────────────────────────────────────────────────────────────
// Nieuw project? Zet de foto in de map projecten/ en voeg hier een blok toe.
const PROJECTEN = [
  {
    foto: '/projecten/uitbouw-apeldoorn-43.jpg',
    alt: 'Uitbouw met schuifpui in Apeldoorn',
    soort: 'Uitbouw',
    titel: 'Uitbouw in Apeldoorn',
    tekst: 'Uitbouw met ruime schuifpui en bovenlicht, afgewerkt in passende rode baksteen met zinken daktrim en regenpijp.',
  },
  {
    foto: '/projecten/uitbouw-almere-43.jpg',
    alt: 'Uitbouw met antraciet schuifpui in Almere',
    soort: 'Uitbouw',
    titel: 'Uitbouw in Almere',
    tekst: 'Strakke uitbouw met brede schuifpui en vaste glasdelen in antraciet kozijnen, afgewerkt met een donkere trespa-band.',
  },
  {
    foto: '/projecten/uitbouw-amstelveen-43.jpg',
    alt: 'Uitbouw met stalen pui en openslaande deuren in Amstelveen',
    soort: 'Uitbouw',
    titel: 'Uitbouw in Amstelveen',
    tekst: 'Royale uitbouw met stalen-look pui, bovenlichten en openslaande deuren in zwarte kozijnen, ingepast in karakteristieke rode baksteen.',
  },
];

// ─── Over ons ───────────────────────────────────────────────────────────────
const OVER = [
  {
    kop: 'Bedrijfsoverzicht',
    tekst: 'Bij AanEnUitbouw.nl begrijpen we dat investeren in uw woning een belangrijke stap is. We zijn er trots op resultaten te leveren die niet alleen aan uw verwachtingen voldoen, maar deze ook overtreffen.',
  },
  {
    kop: 'Missie en waarden',
    tekst: 'Onze missie: uitzonderlijke service en superieur vakmanschap bij elk project. We zijn toegewijd aan uw tevredenheid en gaan tot het uiterste om dat te bereiken — vakkundig en zorgvuldig.',
  },
  {
    kop: 'Ons team',
    tekst: 'Onder leiding van Daniël de Graaf bestaat ons team uit ervaren professionals die zich inzetten voor excellentie. Of het nu gaat om aanbouw, uitbouw of afwerking — wij brengen expertise en toewijding in elke klus.',
  },
];

// ─── Partner: Constructiehuis ───────────────────────────────────────────────
const PARTNER = {
  kicker: 'Samenwerking',
  kop: 'Onze constructeur: Constructiehuis',
  intro: 'Voor de constructieberekening van de draagbalken werken wij samen met Constructiehuis, constructeursbureau voor verbouwingen.',
  naam: 'Constructiehuis',
  site: 'https://constructiehuis.nl',
  siteLabel: 'constructiehuis.nl',
  logo: '/img/partners/constructiehuis-logo.svg',
  meta: 'Constructiehuis B.V. · Eindhoven',
  blokken: [
    {
      kop: 'Wat Constructiehuis doet',
      tekst: 'Constructiehuis maakt constructieberekeningen voor verbouwingen: een berekening met constructief advies, als PDF-document geschikt voor de vergunningsaanvraag. Zij werken met vaste prijzen, leveren standaard binnen 2 weken en handelen eventuele vragen van de gemeente over de berekening af.',
    },
    {
      kop: 'Wat dit voor u betekent',
      tekst: 'Bij een uitbouw laten wij de stalen draagbalk voor de doorbraak in de achtergevel door Constructiehuis berekenen. U levert daarvoor de bouwtekeningen van uw woning aan (stap 3 van uw project); met de berekening kan de bouw worden ingepland. Wilt u zelf iets laten berekenen — bijvoorbeeld een doorbraak, dakopbouw of bijgebouw — dan kunt u ook rechtstreeks bij Constructiehuis terecht.',
    },
  ],
  dienstenKop: 'Diensten van Constructiehuis',
  diensten: ['Doorbraak', 'Uitbouw', 'Bijgebouw', 'Dakopbouw', 'Dakterras', 'Fundering', 'Nieuwbouw', 'Stalen spant', 'Zonnepanelen', 'Constructief advies', 'Dragende muur check', 'Balken check', 'Funderingscheck'],
  knop: 'Meer over Constructiehuis →',
};

// ─── Vaste blokken die op meerdere pagina's terugkomen ──────────────────────
const BLOKKEN = {
  keuze: {
    kicker: 'Wat we doen',
    kop: 'Aanbouw of uitbouw?',
  },
  samenstellen: {
    kicker: 'Configurator',
    kop: 'Stel uw project samen',
    tekst: 'Stel uw project samen in onze configurator. In acht stappen krijgt u direct inzicht in de prijs én de waardestijging van uw woning.',
    knop: 'Naar de configurator →',
  },
  klassiek: {
    kicker: 'Bouwwijze',
    kop: 'Zo bouwen wij',
    link: 'Prefab of klassiek bouwen?',
  },
  plannen: {
    kicker: 'Plannen en prijzen',
    kop: 'Kies uw plan',
    intro: 'Drie afwerkingsniveaus van casco tot volledig sleutelklaar. U bepaalt waar uw budget naartoe gaat.',
    vanaf: 'vanaf',
    knop: 'Selecteer in configurator',
    link: 'Alles over plannen en prijzen',
  },
  stappen: {
    kicker: 'Werkwijze',
    kop: 'Zo verloopt uw project',
    link: 'Bekijk alle stappen',
  },
  werk: {
    kicker: 'Recent werk',
    kop: 'Projecten die voor zich spreken',
    intro: 'Een greep uit recent gerealiseerde aan- en uitbouwen. Vakwerk van begin tot eind.',
    link: 'Alle projecten',
    social: 'Dagelijks foto’s van de bouw op Facebook en Instagram.',
  },
  volgen: {
    kop: 'Volg uw project',
    tekst: 'Volg de voortgang van uw aanbouw of uitbouw met uw persoonlijke projectcode.',
    knop: 'Naar uw project →',
  },
  contact: {
    kicker: 'Contact',
    kop: 'Klaar om te starten?',
    intro: 'Neem contact op of stel direct uw uitbouw samen — we reageren binnen 48 uur.',
    ctaKop: 'Direct een prijsindicatie?',
    ctaTekst: 'Stel uw project samen in onze configurator. In acht stappen krijgt u direct inzicht in de prijs én de waardestijging van uw woning.',
    ctaKnop: 'Naar de configurator →',
  },
  knoppen: {
    configurator: 'Start de configurator →',
    bellen: 'Bel direct',
  },
};

// ─── Teksten uit de stappen van de configurator ─────────────────────────────
// Letterlijk overgenomen uit configurator.html. De opties zelf (daktypes,
// gevels, puien) en hun prijzen staan hier niet: die leest de pagina
// rechtstreeks uit de configurator.
const CONFIGURATOR = {
  verschil: 'Het verschil zit in wat er met de bestaande achtergevel gebeurt: bij een aanbouw blijft die staan, bij een uitbouw wordt die verwijderd. Dit bepaalt het werk én de prijs.',
  aanbouw: 'De bestaande achtergevel blijft intact — wij maken alleen waar gewenst een doorgang. De aanbouw wordt een aparte ruimte: ideaal voor slaapkamer, kantoor, berging of speelkamer.',
  uitbouw: 'De volledige achtergevel wordt verwijderd voor een geïntegreerde leefruimte. Inclusief stalen draagbalk en al het aansluitwerk.',
  uitbouwMeerprijs: 'per m¹ breedte',
  bovenkozijn: {
    metselwerk: {
      label: 'Metselwerk met latei',
      prijsSleutel: 'bovenkozijn_metselwerk',
      tekst: 'Het bestaande metselwerk wordt boven het kozijn doorgetrokken, met stalen latei voor de draagkracht. Past naadloos bij uw bestaande gevel.',
    },
    trespa: {
      label: 'Trespa-plaat',
      prijsSleutel: 'bovenkozijn_trespa',
      tekst: 'Vlakke composietplaat in antraciet voor een strakke, moderne afwerking boven het kozijn — een eigentijds contrast met het metselwerk.',
    },
  },
  extras: {
    lichtkoepel: {
      label: 'Lichtkoepel',
      prijsSleutel: 'extra_lichtkoepel',
      tekst: 'Premium platdakraam (LUMIZEN®, 100×100 cm) met driedubbel HR+++ glas voor extra daglicht.',
    },
    vloerverwarming: {
      label: 'Vloerverwarming',
      prijsSleutel: 'extra_vloerverwarming_m2',
      tekst: 'Comfortabele warmte zonder radiatoren — ideaal in combinatie met een tegelvloer.',
      casco: 'Vloerverwarming vereist een dekvloer. Bij Casco (wind- en waterdicht) wordt geen dekvloer gelegd — kies C+ of C++ als u vloerverwarming wilt.',
    },
    buitenkraan: {
      label: 'Buitenkraan',
      prijsSleutel: 'extra_buitenkraan',
      tekst: 'Vorstvrije buitenkraan voor tuin en terras.',
    },
  },
  regenpijp: {
    kop: 'Regenpijpen',
    intro: 'Kies aan welke zijde(n) u een regenpijp wilt en in welk materiaal.',
    pvc: { label: 'PVC', prijsSleutel: 'regenpijp_pvc', tekst: 'Kunststof regenpijp, beschikbaar in vijf kleuren.' },
    zink: { label: 'Zink', prijsSleutel: 'regenpijp_zink', tekst: 'Klassieke zinken regenpijp in naturel grijs, lange levensduur en strakke look.' },
    perPijp: 'per pijp',
  },
  elektra: {
    binnenKop: 'Extra elektra binnen',
    buitenKop: 'Extra elektra buiten',
    contact: { label: 'Extra contactpunten', prijsSleutel: 'electra_contact', tekst: 'per stuk (boven het inbegrepen aantal)' },
    licht: { label: 'Extra lichtpunten', prijsSleutel: 'electra_licht', tekst: 'per stuk' },
    contactBuiten: { label: 'Buitenstopcontact', prijsSleutel: 'electra_contact_buiten', tekst: 'per stuk, waterdicht IP44' },
    lichtBuiten: { label: 'Buitenlichtpunt', prijsSleutel: 'electra_licht_buiten', tekst: 'per stuk, geschikt voor gevel of overstek' },
    buiten: 'Waterdichte (IP44) installaties voor terras, tuin of carport.',
    plan: 'Wijkt uw elektra af van wat standaard in uw plan zit — meer of andere contact- en lichtpunten? Dan vragen wij u na de offerte een <strong>elektraplan</strong> aan te leveren: een tekening waarop staat waar de punten moeten komen.',
    cascoKop: 'Elektra niet mogelijk bij Casco',
    casco: 'Elektra (contactpunten, lichtpunten, buiteninstallaties) en vloerverwarming zijn daarom niet als extra te kiezen. Kies C+ of C++ als u dit door ons wilt laten verzorgen.',
  },
  kleuren: { dakrand: 'Kleur dakrand', kozijn: 'Kleur kozijn', pvc: 'Kleur PVC' },
  koppen: { daktype: 'Daktype', dakrand: 'Afwerking dakrand', materiaal: 'Materiaal', bovenkozijn: 'Afwerking boven kozijn' },
  labels: { standaard: 'standaard', inbegrepen: 'inbegrepen', nietBijCasco: 'Niet mogelijk bij Casco' },
  prijs: {
    totaal: 'Indicatieve totaalprijs',
    toevoeging: 'indicatief, incl. btw',
    voorbehoud: 'Prijzen zijn indicatief en worden definitief vastgesteld na bezoek ter plaatse en constructieberekening.',
    // uit de bevestigingsmail die de klant na een aanvraag krijgt
    richtprijs: 'De genoemde prijs is een richtprijs — na een vrijblijvend gesprek en eventueel een opname ter plaatse stellen we een definitieve offerte op.',
  },
  waarde: 'Elke m² extra woonoppervlak verhoogt direct de marktwaarde van uw woning, los van het extra wooncomfort.',
  offerte: 'Vul uw gegevens in en wij nemen binnen 48 uur contact met u op met een gedetailleerde offerte op basis van uw configuratie.',
};

// ─── Bodemcheck (tekst van de homepage) ─────────────────────────────────────
const BODEMCHECK = {
  tekst: 'Elke sondering die in Nederland is uitgevoerd en aan de overheid is aangeleverd, is openbaar. Wij zoeken de metingen rond uw adres op en laten zien op welke diepte het zand begint waarop gefundeerd kan worden.',
  voorbehoud: 'Een indicatie, geen geotechnisch advies — voor de vergunning blijft een sondering op uw eigen perceel nodig.',
};

// ─── Rekenvoorbeelden en prijslijst ─────────────────────────────────────────
// De bedragen worden uitgerekend door de configurator zelf, met de prijzen
// uit het beheer. Hier staan alleen de maten en de kopjes.
const REKENVOORBEELD = {
  kicker: 'Prijsindicatie',
  kop: 'Rekenvoorbeelden',
  // breedte × diepte in meters; 6 × 3 is de maat waarmee de configurator opent
  maten: [[4, 3], [6, 3], [8, 4]],
  uitleg: 'Berekend met de configurator, met de keuzes waarmee de configurator opent:',
  kolomMaat: 'Afmeting',
  regels: {
    basis: 'Basisprijs',
    uitbouw: 'Achtergevel verwijderen, stalen draagbalk en aansluitwerk',
    dakrand: 'Afwerking dakrand',
    bovenkozijn: 'Afwerking boven kozijn',
  },
  opbouwKop: 'Zo is de prijs opgebouwd',
  link: 'Bereken uw eigen prijs in de configurator',
};

const PRIJSLIJST = {
  kicker: 'Meerprijzen',
  kop: 'Prijslijst van de opties',
  kolommen: ['Onderdeel', 'Keuze', 'Prijs'],
  groepen: {
    type: 'Type',
    dak: 'Daktype',
    dakrand: 'Afwerking dakrand',
    gevel: 'Gevelbekleding',
    pui: 'Pui',
    kleur: 'Kleur kozijn',
    bovenkozijn: 'Afwerking boven kozijn',
    extras: "Extra's",
    regenpijp: 'Regenpijpen',
    elektra: 'Elektra',
  },
};

// ─── Veelgestelde vragen ────────────────────────────────────────────────────
// Alleen de vragen staan hier. De antwoorden worden samengesteld uit teksten
// die al vaststaan: de configurator, projectfasen.js en de homepage.
// Zo kan een antwoord nooit iets anders zeggen dan de rest van de site.
const VRAGEN = [
  { id: 'verschil',    vraag: 'Wat is het verschil tussen een aanbouw en een uitbouw?' },
  { id: 'kosten',      vraag: 'Wat kost een aanbouw of uitbouw?', link: { pad: '/plannen-en-prijzen', label: 'Alles over plannen en prijzen' } },
  { id: 'plannen',     vraag: 'Wat is het verschil tussen Casco, C+ en C++?', link: { pad: '/plannen-en-prijzen', label: 'Alles over plannen en prijzen' } },
  { id: 'offerte',     vraag: 'Hoe snel ontvang ik een offerte?' },
  { id: 'vergunning',  vraag: 'Wie regelt de vergunning?' },
  { id: 'constructie', vraag: 'Wie maakt de constructieberekening?', link: { pad: '/over-ons#samenwerking', label: 'Onze constructeur: Constructiehuis' } },
  { id: 'tekeningen',  vraag: 'Welke bouwtekeningen zijn nodig?', link: { pad: '/woningcheck', label: 'Naar de woningcheck' } },
  { id: 'sondering',   vraag: 'Is er een sondering nodig?', link: { pad: '/bodemcheck', label: 'Naar de bodemcheck' } },
  { id: 'fundering',   vraag: 'Hoe wordt de fundering gemaakt?' },
  { id: 'bouwwijze',   vraag: 'Bouwen jullie prefab of klassiek?', link: { pad: '/prefab-of-klassiek', label: 'Prefab of klassiek bouwen?' } },
  { id: 'daken',       vraag: 'Welke daktypes zijn mogelijk?', link: { pad: '/dak-en-dakrand', label: 'Meer over dak en dakrand' } },
  { id: 'puien',       vraag: 'Welke puien en deuren kan ik kiezen?', link: { pad: '/pui-en-kozijnen', label: 'Meer over pui en kozijnen' } },
  { id: 'vloerverwarming', vraag: 'Kan ik vloerverwarming laten aanleggen?', link: { pad: '/extras', label: "Meer over de extra's" } },
  { id: 'elektra',     vraag: 'Wat als ik meer of andere elektra wil dan standaard?' },
  { id: 'huisbezoek',  vraag: 'Hoe bereid ik het huisbezoek voor?', link: { pad: '/werkwijze', label: 'Bekijk alle stappen' } },
  { id: 'volgen',      vraag: 'Kan ik de voortgang van mijn project volgen?', link: { pad: '/project', label: 'Naar uw project' } },
  { id: 'waarde',      vraag: 'Wat levert een aanbouw of uitbouw op?', link: { pad: '/#configurator', label: 'Naar de configurator' } },
];

// ─── De pagina's zelf ───────────────────────────────────────────────────────
const PAGINAS = {
  aanbouw: {
    pad: '/aanbouw',
    broodkruimel: 'Aanbouw',
    titel: 'Aanbouw laten bouwen | AanEnUitbouw.nl',
    beschrijving: 'Een aanbouw is een uitbreiding aan de achterzijde van uw woning waarbij de bestaande achtergevel intact blijft. Stel uw aanbouw online samen en ontvang een prijsindicatie.',
    kicker: 'Onze diensten',
    kop: 'Aanbouw laten bouwen',
    intro: DIENSTEN.aanbouw.tekst,
  },
  uitbouw: {
    pad: '/uitbouw',
    broodkruimel: 'Uitbouw',
    titel: 'Uitbouw laten bouwen | AanEnUitbouw.nl',
    beschrijving: 'Een uitbouw is een uitbreiding aan de achterzijde van uw woning, geheel geïntegreerd met de bestaande ruimte. Stel uw uitbouw online samen en ontvang een prijsindicatie.',
    kicker: 'Onze diensten',
    kop: 'Uitbouw laten bouwen',
    intro: DIENSTEN.uitbouw.tekst,
  },
  plannen: {
    pad: '/plannen-en-prijzen',
    broodkruimel: 'Plannen en prijzen',
    titel: 'Plannen en prijzen: Casco, C+ en C++ | AanEnUitbouw.nl',
    beschrijving: 'Drie afwerkingsniveaus van casco tot volledig sleutelklaar, met een prijs per m². U bepaalt waar uw budget naartoe gaat.',
    kicker: 'Aanbouw en uitbouw',
    kop: 'Plannen en prijzen',
    intro: 'Drie afwerkingsniveaus van casco tot volledig sleutelklaar. U bepaalt waar uw budget naartoe gaat.',
    niveauKicker: 'Afwerkingsniveau',
    niveauKop: 'Kies uw afwerkingsniveau',
  },
  bouwwijze: {
    pad: '/prefab-of-klassiek',
    broodkruimel: 'Prefab of klassiek',
    titel: 'Prefab of klassiek bouwen? | AanEnUitbouw.nl',
    beschrijving: 'Steeds meer aanbouwen komen kant-en-klaar uit de fabriek. Wij bouwen bewust klassiek, op locatie. Eerlijk de plussen en minnen van allebei.',
    kicker: BOUWWIJZE.kicker,
    kop: BOUWWIJZE.kop,
    intro: BOUWWIJZE.intro,
  },
  dak: {
    pad: '/dak-en-dakrand',
    broodkruimel: 'Dak en dakrand',
    titel: 'Daktypes en dakrand voor uw aan- of uitbouw | AanEnUitbouw.nl',
    beschrijving: 'Plat dak, lessenaarsdak, zadeldak of schilddak: de daktypes voor uw aanbouw of uitbouw, de afwerking van de dakrand en de meerprijs per keuze.',
    kicker: 'Dak & dakrand',
    kop: 'Het dak en de dakafwerking',
    intro: 'Kies het daktype, hoe de dakrand wordt afgewerkt en in welke kleur.',
  },
  gevel: {
    pad: '/gevelbekleding',
    broodkruimel: 'Gevelbekleding',
    titel: 'Gevelbekleding: baksteen, kunststof rabat of hout | AanEnUitbouw.nl',
    beschrijving: 'Baksteen, kunststof rabat (keralit) of hout: de gevelbekleding voor uw aanbouw of uitbouw, met kleuren en meerprijs. Wij werken uitsluitend met echte massieve bakstenen.',
    kicker: 'Gevelbekleding',
    kop: 'Welke gevelbekleding past bij uw woning?',
    intro: 'Kies de hoofdcategorie en daarna de specifieke kleur of stijl. <strong>Wij werken uitsluitend met echte massieve bakstenen — geen steenstrips.</strong>',
  },
  kozijn: {
    pad: '/pui-en-kozijnen',
    broodkruimel: 'Pui en kozijnen',
    titel: 'Schuifpui, openslaande deuren of harmonicadeur | AanEnUitbouw.nl',
    beschrijving: 'Openslaande deuren, schuifpui, 4-delige schuifpui of harmonicadeur: de puien voor uw aanbouw of uitbouw, met kozijnkleuren en de meerprijs per keuze.',
    kicker: 'Kozijn & afwerking',
    kop: 'Pui, kleur en afwerking boven kozijn',
    intro: 'Kies het type pui, de kozijnkleur en hoe de afwerking boven het kozijn eruit komt te zien.',
  },
  extras: {
    pad: '/extras',
    broodkruimel: "Extra's",
    titel: "Extra's: lichtkoepel, vloerverwarming en elektra | AanEnUitbouw.nl",
    beschrijving: 'Lichtkoepel, vloerverwarming, buitenkraan, regenpijpen en extra elektra voor uw aanbouw of uitbouw: wat in uw plan is inbegrepen en wat de meerprijs is.',
    kicker: "Extra's",
    kop: "Extra's voor uw aan- of uitbouw",
    intro: 'Lichtkoepel, vloerverwarming, buitenkraan, regenpijpen en extra elektra: wat in uw plan is inbegrepen en wat u kunt toevoegen.',
  },
  vragen: {
    pad: '/veelgestelde-vragen',
    broodkruimel: 'Veelgestelde vragen',
    titel: 'Veelgestelde vragen over aanbouw en uitbouw | AanEnUitbouw.nl',
    beschrijving: 'Veelgestelde vragen over een aanbouw of uitbouw: het verschil, de kosten per m², de plannen, vergunning, constructieberekening en fundering.',
    kicker: 'Vraag en antwoord',
    kop: 'Veelgestelde vragen',
    intro: 'Over het verschil tussen aanbouw en uitbouw, de prijzen, de plannen en de voorbereiding.',
  },
  werkwijze: {
    pad: '/werkwijze',
    broodkruimel: 'Werkwijze',
    titel: 'Werkwijze: van huisbezoek tot oplevering | AanEnUitbouw.nl',
    beschrijving: 'Zo verloopt uw project in negen stappen: van huisbezoek en offerte tot fundering, buitenafwerking en oplevering. U weet altijd wat u kunt verwachten.',
    kicker: 'Werkwijze',
    kop: 'Zo verloopt uw project',
    intro: 'In negen stappen van huisbezoek tot oplevering — u weet altijd wat u kunt verwachten.',
  },
  projecten: {
    pad: '/projecten',
    broodkruimel: 'Projecten',
    titel: 'Projecten: gerealiseerde aan- en uitbouwen | AanEnUitbouw.nl',
    beschrijving: 'Een greep uit recent gerealiseerde aan- en uitbouwen, onder meer in Apeldoorn, Almere en Amstelveen.',
    kicker: 'Recent werk',
    kop: 'Projecten die voor zich spreken',
    intro: 'Een greep uit recent gerealiseerde aan- en uitbouwen. Vakwerk van begin tot eind.',
  },
  over: {
    pad: '/over-ons',
    broodkruimel: 'Over ons',
    titel: 'Over ons | AanEnUitbouw.nl',
    beschrijving: 'Investeren in woningverbetering is een belangrijke beslissing. Daarom werken wij met meer dan 20 jaar ervaring aan uw volledige tevredenheid.',
    kicker: 'Wie we zijn',
    kop: 'Over ons',
    intro: 'Investeren in woningverbetering is een belangrijke beslissing. Daarom werken wij met meer dan 20 jaar ervaring aan uw volledige tevredenheid.',
  },
  contact: {
    pad: '/contact',
    broodkruimel: 'Contact',
    titel: 'Contact | AanEnUitbouw.nl',
    beschrijving: 'Neem contact op of stel direct uw uitbouw samen — we reageren binnen 48 uur. Bel +31 646 150 160 of stuur een WhatsApp-bericht.',
    kicker: 'Contact',
    kop: 'Klaar om te starten?',
    intro: 'Neem contact op of stel direct uw uitbouw samen — we reageren binnen 48 uur.',
  },
};

// Onderaan elke pagina (en op de homepage)
const VOET = [
  {
    kop: 'Aan- en uitbouw',
    links: [
      { pad: '/aanbouw', label: 'Aanbouw' },
      { pad: '/uitbouw', label: 'Uitbouw' },
      { pad: '/plannen-en-prijzen', label: 'Plannen en prijzen' },
      { pad: '/prefab-of-klassiek', label: 'Prefab of klassiek' },
      { pad: '/werkwijze', label: 'Werkwijze' },
      { pad: '/projecten', label: 'Projecten' },
    ],
  },
  {
    kop: 'Opties',
    links: [
      { pad: '/dak-en-dakrand', label: 'Dak en dakrand' },
      { pad: '/gevelbekleding', label: 'Gevelbekleding' },
      { pad: '/pui-en-kozijnen', label: 'Pui en kozijnen' },
      { pad: '/extras', label: "Extra's" },
      { pad: '/veelgestelde-vragen', label: 'Veelgestelde vragen' },
    ],
  },
  {
    kop: 'Online',
    links: [
      { pad: '/#configurator', label: 'Configurator' },
      { pad: '/bodemcheck', label: 'Bodemcheck' },
      { pad: '/woningcheck', label: 'Woningcheck' },
      { pad: '/project', label: 'Volg uw project' },
    ],
  },
  {
    kop: 'Bedrijf',
    links: [
      { pad: '/over-ons', label: 'Over ons' },
      { pad: '/over-ons#samenwerking', label: 'Partner: Constructiehuis' },
      { pad: '/contact', label: 'Contact' },
      { pad: '/documenten/privacyverklaring.pdf', label: 'Privacyverklaring', nieuwTabblad: true },
      { pad: '/documenten/algemene-voorwaarden.pdf', label: 'Algemene voorwaarden', nieuwTabblad: true },
    ],
  },
];

module.exports = { SITE, MENU, DIENSTEN, PLANNEN, BOUWWIJZE, PROJECTEN, OVER, PARTNER, BLOKKEN, CONFIGURATOR, BODEMCHECK, REKENVOORBEELD, PRIJSLIJST, VRAGEN, PAGINAS, VOET };
