/*
 * Projectfasen van AanEnUitbouw.nl — de enige plek waar de fasen staan.
 *
 * Wordt op drie plekken gebruikt:
 *   - server.js          aantal fasen, geldige waarden, migratie van oude projecten
 *   - project.html       de pagina waarop de klant zijn project volgt
 *   - configurator.html  het beheerpaneel (tab Projecten)
 *
 * Wil je een tekst aanpassen? Doe dat hier; de klantpagina en het beheer
 * nemen het automatisch over. Werkt in de browser (window.PROJECTFASEN) en in
 * Node (module.exports).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PROJECTFASEN = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Soort project en afwerkingsniveau (plan). Beide optioneel per project;
  // zolang ze niet gekozen zijn, toont de klantpagina de algemene tekst.
  const TYPES = { aanbouw: 'Aanbouw', uitbouw: 'Uitbouw' };
  const PLANNEN = { casco: 'Casco', cplus: 'C+', cplus2: 'C++' };

  // Per fase:
  //   titel      korte naam (beheer + klantpagina)
  //   kort       één zin onder de titel
  //   wat        wat er in deze stap gebeurt (opsomming)
  //   nodigKop   kopje boven de tweede opsomming
  //   nodig      wat wij van de klant nodig hebben / waar hij op kan rekenen
  //   alleenBij  'uitbouw' = deze stap vervalt bij een aanbouw
  //   nvt        tekst als de stap vervalt
  //   perPlan    tekst per afwerkingsniveau (casco / cplus / cplus2 / onbekend)
  const FASEN = [
    {
      id: 'huisbezoek',
      titel: 'Huisbezoek',
      kort: 'Wij komen bij u thuis om kennis te maken, uw wensen te bespreken en de situatie ter plaatse op te nemen.',
      watKop: 'Wat we bespreken tijdens het huisbezoek',
      wat: [
        'Kennismaking en uw wensen: waarvoor gaat u de ruimte gebruiken — keuken, woonkamer, kantoor of slaapkamer?',
        'Aanbouw of uitbouw: blijft de achtergevel staan (aanbouw) of gaat hij open voor één grote leefruimte (uitbouw)?',
        'Afmetingen, daktype (plat, lessenaar, zadel of schild) en eventueel een lichtkoepel.',
        'Gevel en dakrand: baksteen, kunststof rabat of hout — passend bij uw woning.',
        'Kozijnen en deuren: openslaande deuren, schuifpui (2- of 4-delig) of harmonicadeur, en de kleur.',
        'Afwerkingsniveau: Casco (alleen wind- en waterdicht), C+ (geïsoleerd en schilderklaar) of C++ (geïsoleerd en sleutelklaar).',
        'De bestaande situatie: bodem, riolering en leidingen, erfgrens, hoogteverschil en bereikbaarheid van de tuin.',
        'Vergunning (uw eigen verantwoordelijkheid), planning, gewenste startperiode en een eerste indicatie van de kosten.',
      ],
      nodigKop: 'Zo bereidt u zich voor',
      nodig: [
        'Bouwtekeningen van uw woning (plattegrond en doorsnede). Heeft u ze niet, vraag ze dan op bij het bouwarchief van uw gemeente.',
        'Uw configuratie uit de online configurator op aanenuitbouw.nl, als u die heeft gemaakt.',
        'Foto’s of voorbeelden van aan- en uitbouwen die u aanspreken.',
        'Een indicatie van uw budget en wanneer u het liefst wilt starten.',
        'Weet u waar riolering, water-, gas- en elektraleidingen lopen? Zoek dat alvast op.',
        'Zorg dat de achtergevel en de tuin bereikbaar zijn, zodat we kunnen meten en foto’s kunnen maken.',
      ],
    },
    {
      id: 'offerte',
      titel: 'Offerte',
      kort: 'Op basis van het huisbezoek ontvangt u een offerte op maat. Na uw akkoord plannen we het project in.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'U ontvangt een gespecificeerde offerte: afwerkingsniveau (Casco, C+ of C++), afmetingen, dak, gevel, kozijnen, extra’s en de totaalprijs.',
        'Ook het aantal schroefpalen en de diepte ervan staan in de offerte; die verschillen per situatie.',
        'Vragen of wijzigingen? We passen de offerte aan tot hij precies klopt met wat u wilt.',
        'Na ondertekening ontvangt u de opdrachtbevestiging en reserveren we uw plek in de planning.',
      ],
      nodigKop: 'Wat wij van u nodig hebben',
      nodig: [
        'Uw akkoord op de offerte (ondertekend retour).',
        'Uw definitieve keuzes voor gevel, kozijnen, kleuren en extra’s.',
        'Wijkt uw elektra af van wat standaard in C+ of C++ zit (meer of andere contact- en lichtpunten)? Dan hebben wij een elektraplan van u nodig: een tekening waarop staat waar de punten moeten komen.',
      ],
    },
    {
      id: 'constructie',
      titel: 'Vergunning & constructie',
      kort: 'Wij laten alleen de draagbalken berekenen door een constructeur; daarvoor hebben wij uw bouwtekeningen nodig. Vergunning en een eventuele sondering regelt u zelf.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Een constructeur berekent de draagbalken (het staal) — bij een uitbouw de stalen draagbalk voor de doorbraak in de achtergevel. Meer berekenen wij niet.',
        'Zodra wij uw bouwtekeningen hebben, gaat de constructeur aan de slag. Met de berekening kan de bouw worden ingepland.',
      ],
      nodigKop: 'Wat wij van u nodig hebben en wat u zelf regelt',
      nodig: [
        'Bouwtekeningen van de woning: plattegronden en doorsneden (pdf, of duidelijke scans of foto’s). Zonder tekeningen is een opname ter plaatse nodig.',
        'Heeft u geen tekeningen? Vraag ze op bij het bouwarchief van uw gemeente.',
        'Vergunning: u bent zelf verantwoordelijk om na te gaan of uw aan- of uitbouw vergunningsvrij is en om, als dat nodig is, de omgevingsvergunning bij uw gemeente aan te vragen. Wij controleren dit niet.',
        'Sondering: is er voor uw situatie een sondering nodig, dan is ook die uw eigen verantwoordelijkheid.',
        'Hoe eerder wij de tekeningen hebben, hoe eerder de constructeur aan de slag kan.',
      ],
    },
    {
      id: 'fundering',
      titel: 'Start bouw: fundering',
      kort: 'We beginnen altijd met de fundering: schroefpalen en een betonnen fundering met bekisting.',
      // 'veld' = projectgegeven uit het beheer dat bij deze stap getoond wordt
      veld: 'palen',
      veldKop: 'Schroefpalen conform uw offerte',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'De schroefpalen worden aangebracht, conform uw offerte (aantal en diepte).',
        'Daarop komt de betonnen fundering met bekisting.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Maak de plek van de aan- of uitbouw vrij van tuinmeubels, potten en losse spullen.',
        'Zorg dat de bouwplaats bereikbaar is voor materiaal en machines.',
      ],
    },
    {
      id: 'draagbalk',
      titel: 'Draagbalken & gevel openen',
      kort: 'Bij een uitbouw gaat de achtergevel open en wordt de stalen draagbalk geplaatst.',
      alleenBij: 'uitbouw',
      nvt: 'Bij een aanbouw blijft uw achtergevel intact; wij maken alleen waar gewenst een doorgang. Deze stap vervalt.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'De bestaande achtergevel wordt over de breedte van de uitbouw verwijderd.',
        'De stalen draagbalk uit de constructieberekening wordt geplaatst en neemt de draagkracht van de gevel over.',
        'Al het aansluitwerk aan de bestaande woning is inbegrepen.',
        'Bij een aanbouw blijft de gevel staan en maken we alleen, als u dat wilt, een doorgang naar de nieuwe ruimte.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Maak de ruimte achter de achtergevel leeg of dek alles goed af: dit is de stoffigste stap van de bouw.',
      ],
    },
    {
      id: 'skelet',
      titel: 'Houten skelet',
      kort: 'De houten balken en de dakconstructie worden opgebouwd — de vorm van uw aan- of uitbouw wordt zichtbaar.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'De houten balken en de dakconstructie worden opgebouwd, conform uw offerte.',
        'Het skelet wordt in deze stap nog niet geïsoleerd; dat gebeurt bij de binnenafwerking (stap 8) als u voor C+ of C++ heeft gekozen.',
        'Na deze stap kan het kozijnelement op maat worden besteld (stap 7).',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Wijkt uw elektra af van de standaard van C+ of C++? Lever dan uw elektraplan aan vóór de binnenafwerking (stap 8).',
      ],
    },
    {
      id: 'buitenafwerking',
      titel: 'Buitenafwerking & element bestellen',
      kort: 'Metselwerk of gevelbekleding naar uw keuze. De maten zijn nu exact bekend en het kozijnelement (deuren of pui) wordt besteld.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Baksteen: echt massief metselwerk, geen steenstrips, in de gekozen kleur (rood, geel, zwart of crème).',
        'Kunststof rabat (Keralit): onderhoudsvrij en snel geplaatst — of houten gevelbekleding voor een natuurlijke, warme uitstraling.',
        'Dakrand: metselwerk tot boven met zinken deklijst, of een overstek met daktrim. Regenpijp in pvc of zink.',
        'Boven het kozijn: metselwerk met stalen latei of een Trespa-plaat, zoals in uw offerte.',
        'Het kozijnelement — openslaande deuren, schuifpui, 4-delige schuifpui of harmonicadeur — wordt op maat besteld in de gekozen kleur.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Het element wordt speciaal voor u op maat gemaakt. Zodra de levering bekend is, ziet u dat hier in een update.',
        'Ondertussen gaat de buitenafwerking gewoon door.',
      ],
    },
    {
      id: 'binnenafwerking',
      titel: 'Element plaatsen & binnenafwerking',
      kort: 'Het kozijnelement wordt geplaatst en uw aan- of uitbouw is wind- en waterdicht. Bij C+ en C++ isoleren we daarna en werken we de binnenkant af.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Het element wordt gesteld en afgedicht: aan de buitenkant met compriband, aan de binnenkant met purschuim. Daarmee is uw aan- of uitbouw wind- en waterdicht.',
        'Casco: hiermee is ons werk klaar — geen isolatie en geen binnenafwerking. U of uw eigen aannemer gaat verder.',
        'Isolatie (C+ en C++): de aan- of uitbouw wordt geïsoleerd.',
        'Dekvloer (C+ en C++): de basis voor vloerverwarming en voor de afwerking met egaline.',
        'Elektra en water (C+ en C++): contact- en lichtpunten en een vorstvrije buitenkraan; bij C++ volledige elektra.',
        'Vloerverwarming en lichtkoepel: inbegrepen bij C++, als meerprijs bij C+.',
        'C++: volledige binnenafwerking — de ruimte is sleutelklaar.',
      ],
      perPlan: {
        casco:   'Uw plan is Casco: wij leveren wind- en waterdicht op — zonder isolatie, dekvloer, elektra en vloerverwarming. De binnenafwerking doet u zelf of laat u door uw eigen aannemer uitvoeren.',
        cplus:   'Uw plan is C+: geïsoleerd en schilderklaar opgeleverd, met dekvloer (afgewerkt met egaline), 2× contactpunt, 1× lichtpunt en een vorstvrije buitenkraan. Lichtkoepel en vloerverwarming als u die heeft meebesteld.',
        cplus2:  'Uw plan is C++: geïsoleerd en volledig afgewerkt — dekvloer met vloerverwarming (afgewerkt met egaline), lichtkoepel (standaard maat), volledige elektra en buitenkraan. Sleutelklaar.',
        onbekend: 'Wat u in deze stap krijgt, hangt af van uw plan: Casco (alleen wind- en waterdicht, geen isolatie), C+ (geïsoleerd en schilderklaar, met dekvloer, basis elektra en buitenkraan) of C++ (geïsoleerd en volledig sleutelklaar, inclusief vloerverwarming en lichtkoepel).',
      },
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Bij afwijkende elektra hebben wij uw elektraplan nodig voordat wij met de elektra beginnen.',
        'Bij Casco: na deze stap kunt u zelf, of met uw eigen aannemer, verder met isolatie en afwerking.',
        'Bij C+: kies tijdig uw eigen vloer- en wandafwerking, zodat u na de oplevering direct verder kunt.',
      ],
    },
    {
      id: 'oplevering',
      titel: 'Oplevering',
      kort: 'Eindcontrole samen met u en sleuteloverdracht. Ook daarna staan we voor u klaar.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Eindcontrole samen met u en sleuteloverdracht.',
        'Nazorg: heeft u na de oplevering vragen of zorgen? Wij bieden nazorg en onderhoudsadvies.',
      ],
      nodigKop: 'Wat wij van u nodig hebben',
      nodig: [
        'Een moment voor de gezamenlijke eindcontrole.',
      ],
    },
  ];

  // Oude fase-indeling (8 fasen, t/m augustus 2026) → nieuwe indeling.
  // Projecten zonder schema-nummer worden hiermee eenmalig omgezet.
  //   oud 0 Offerte akkoord      → 2 Vergunning & constructie (offerte was al akkoord)
  //   oud 1 Inmeting             → 2
  //   oud 2 Vergunning & constr. → 2
  //   oud 3 Productie kozijnen   → 3 Start bouw: fundering
  //   oud 4 Start bouw           → 3
  //   oud 5 Wind- en waterdicht  → 6 Buitenafwerking & element bestellen
  //   oud 6 Afwerking            → 7 Element plaatsen & binnenafwerking
  //   oud 7 Oplevering           → 8 Oplevering
  const MIGRATIE_V1 = [2, 2, 2, 3, 3, 6, 7, 8];
  const SCHEMA = 2;

  function migreerProject(p) {
    if (!p || typeof p !== 'object') return false;
    if (p.schema === SCHEMA) return false;
    const oud = Number.isInteger(p.phase) ? p.phase : 0;
    p.phase = MIGRATIE_V1[Math.max(0, Math.min(oud, MIGRATIE_V1.length - 1))];
    const notes = {};
    for (const k in (p.notes || {})) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0 || idx >= MIGRATIE_V1.length) continue;
      const nieuw = MIGRATIE_V1[idx];
      const tekst = String(p.notes[k] || '').trim();
      if (!tekst) continue;
      notes[nieuw] = (notes[nieuw] ? notes[nieuw] + '\n' : '') + tekst;
    }
    for (const k in notes) notes[k] = notes[k].slice(0, 500);
    p.notes = notes;
    if (!p.type) p.type = '';
    if (!p.plan) p.plan = '';
    p.schema = SCHEMA;
    return true;
  }

  // Geeft true als de fase bij dit project vervalt (bijv. gevel openen bij een aanbouw).
  function faseVervalt(fase, project) {
    if (!fase.alleenBij) return false;
    const type = project && project.type;
    return !!type && type !== fase.alleenBij;
  }

  // Bericht voor de (potentiële) klant vóór het huisbezoek. Beheer kopieert dit
  // en stuurt het per e-mail of WhatsApp; [naam] en [datum en tijd] vult u zelf in.
  function huisbezoekBericht(opties) {
    const o = opties || {};
    const f = FASEN[0];
    const regels = [];
    regels.push('Beste ' + (o.naam || '[naam]') + ',');
    regels.push('');
    regels.push('Bedankt voor uw interesse in een aan- of uitbouw. Op ' + (o.datum || '[datum en tijd]') + ' komen wij bij u langs om kennis te maken, uw wensen te bespreken en de situatie ter plaatse op te nemen. Het bezoek is vrijblijvend.');
    regels.push('');
    regels.push(f.watKop + ':');
    f.wat.forEach(r => regels.push('• ' + r));
    regels.push('');
    regels.push(f.nodigKop + ':');
    f.nodig.forEach(r => regels.push('• ' + r));
    regels.push('');
    if (o.code) {
      regels.push('Uw projectcode is ' + o.code + '. Hiermee volgt u vanaf nu elke stap van uw project' + (o.link ? ': ' + o.link : ' op aanenuitbouw.nl/project') + '.');
      regels.push('');
    }
    regels.push('Heeft u vooraf vragen? Bel ons gerust op +31 646 150 160 of mail naar project@aanenuitbouw.nl.');
    regels.push('');
    regels.push('Met vriendelijke groet,');
    regels.push('AanEnUitbouw.nl');
    return regels.join('\n');
  }

  return { FASEN, TYPES, PLANNEN, SCHEMA, MIGRATIE_V1, migreerProject, faseVervalt, huisbezoekBericht };
});
