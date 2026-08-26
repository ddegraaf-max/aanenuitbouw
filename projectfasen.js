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
  //   perPlan    extra tekst per afwerkingsniveau (casco / cplus / cplus2)
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
        'Afwerkingsniveau: Casco (wind- en waterdicht), C+ (schilderklaar) of C++ (sleutelklaar).',
        'De bestaande situatie: fundering en bodem, riolering en leidingen, erfgrens, hoogteverschil en bereikbaarheid van de tuin.',
        'Vergunning, planning, gewenste startperiode en een eerste indicatie van de kosten.',
      ],
      nodigKop: 'Zo bereidt u zich voor',
      nodig: [
        'Bouwtekeningen van uw woning (plattegrond, doorsnede en fundering). Heeft u ze niet, vraag ze dan op bij het bouwarchief van uw gemeente.',
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
        'Vragen of wijzigingen? We passen de offerte aan tot hij precies klopt met wat u wilt.',
        'Na ondertekening ontvangt u de opdrachtbevestiging en reserveren we uw plek in de planning.',
      ],
      nodigKop: 'Wat wij van u nodig hebben',
      nodig: [
        'Uw akkoord op de offerte (ondertekend retour).',
        'Uw definitieve keuzes voor gevel, kozijnen, kleuren en extra’s.',
      ],
    },
    {
      id: 'constructie',
      titel: 'Vergunning & constructie',
      kort: 'Een constructeur maakt de berekening en indien nodig verzorgen wij de vergunning. Hiervoor hebben wij uw bouwtekeningen nodig.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Een constructeur berekent de fundering (schroefpalen), de houten draagconstructie en — bij een uitbouw — de stalen draagbalk voor de doorbraak in de achtergevel.',
        'We controleren of uw aan- of uitbouw vergunningsvrij is. Is een omgevingsvergunning nodig, dan verzorgen wij de aanvraag; houd dan rekening met de beslistermijn van de gemeente (doorgaans 8 weken).',
        'Zo nodig laten we een sondering uitvoeren om te bepalen hoe diep de draagkrachtige laag onder uw tuin zit.',
        'De constructieberekening bepaalt de definitieve uitvoering en is nodig vóór de start van de bouw.',
      ],
      nodigKop: 'Wat wij van u nodig hebben',
      nodig: [
        'Bouwtekeningen van de woning: plattegronden, doorsneden en de funderingstekening (pdf, of duidelijke scans of foto’s).',
        'Heeft u geen tekeningen? Vraag ze op bij het bouwarchief van uw gemeente — wij helpen u op weg.',
        'Bij een uitbouw zijn de tekeningen extra belangrijk: de constructeur moet het staal voor de doorbraak berekenen. Zonder tekeningen is een opname ter plaatse nodig.',
        'Hoe eerder wij de stukken hebben, hoe eerder de constructeur aan de slag kan en hoe eerder de bouw kan starten.',
      ],
    },
    {
      id: 'fundering',
      titel: 'Start bouw: fundering',
      kort: 'We beginnen altijd met de fundering: schroefpalen en een betonnen fundering met bekisting.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'De bouwplaats wordt ingericht, de aan- of uitbouw wordt uitgezet en het terrein wordt uitgegraven.',
        'Schroefpalen worden tot de draagkrachtige zandlaag gedraaid (tot 10 m diep; 5 stuks zijn in elk plan inbegrepen).',
        'Daarop komt de betonnen fundering met bekisting, inclusief de doorvoeren voor riolering en leidingen.',
        'Het beton moet uitharden voordat we verder bouwen.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Maak de plek van de aan- of uitbouw vrij van tuinmeubels, potten en losse spullen. Over bestrating en beplanting maken we vooraf afspraken.',
        'Zorg voor een doorgang voor materiaal en machines, bijvoorbeeld via de zijkant van de woning of een steeg.',
        'Reken op geluid en enige trilling tijdens het aanbrengen van de palen.',
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
        'De bestaande achtergevel wordt gestut en over de breedte van de uitbouw verwijderd.',
        'De stalen draagbalk uit de constructieberekening wordt geplaatst en neemt de draagkracht van de gevel over.',
        'Al het aansluitwerk aan de bestaande woning is inbegrepen.',
        'Bij een aanbouw blijft de gevel staan en maken we alleen, als u dat wilt, een doorgang naar de nieuwe ruimte.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Maak de ruimte achter de achtergevel leeg of dek alles goed af: dit is de stoffigste stap van de bouw.',
        'De woning staat tijdelijk open; wij sluiten de opening zo snel mogelijk provisorisch af.',
      ],
    },
    {
      id: 'skelet',
      titel: 'Houten skelet',
      kort: 'De houten draagconstructie van wanden en dak wordt opgebouwd — de vorm van uw aan- of uitbouw wordt zichtbaar.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'De houten wanden en de dakconstructie worden opgebouwd volgens de constructieberekening.',
        'Het dak wordt dichtgelegd (plat, lessenaar, zadel of schild) en de constructie wordt geïsoleerd.',
        'Heeft u een lichtkoepel gekozen, dan wordt de sparing daarvoor aangebracht.',
        'Na deze stap nemen we de exacte maten voor het kozijnelement op.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Dit is het moment om extra wensen voor elektra of leidingen door te geven — zolang de wanden nog open zijn.',
        'Bij C+ en C++: bevestig de plaatsen van contact- en lichtpunten voordat de wanden dichtgaan.',
      ],
    },
    {
      id: 'buitenafwerking',
      titel: 'Buitenafwerking & element bestellen',
      kort: 'Metselwerk of gevelbekleding naar uw keuze. De maten zijn nu exact bekend en het kozijnelement (deuren of pui) wordt besteld.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Baksteen: echt massief metselwerk, geen steenstrips, in de gekozen kleur (rood, geel, zwart of crème).',
        'Kunststof rabat (Keralit) of houten gevelbekleding: onderhoudsarm en snel geplaatst.',
        'Dakrand: metselwerk tot boven met zinken deklijst, of een overstek met daktrim. Regenpijp in pvc of zink.',
        'Boven het kozijn: metselwerk met stalen latei of een Trespa-plaat, zoals in uw offerte.',
        'Het kozijnelement — openslaande deuren, schuifpui, 4-delige schuifpui of harmonicadeur — wordt op maat besteld in de gekozen kleur.',
      ],
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'De productie van het element op maat duurt doorgaans enkele weken; wij melden u de verwachte leverweek.',
        'Ondertussen gaat de buitenafwerking gewoon door.',
      ],
    },
    {
      id: 'binnenafwerking',
      titel: 'Element plaatsen & binnenafwerking',
      kort: 'Het kozijnelement wordt geplaatst en de schil is dicht. Afhankelijk van uw plan werken we de binnenkant af.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'Het element wordt gesteld, afgekit en afgewerkt; daarmee is uw aan- of uitbouw wind- en waterdicht.',
        'Bij C+ en C++: dekvloer, elektra (contact- en lichtpunten), vorstvrije buitenkraan en — indien gekozen — vloerverwarming en lichtkoepel.',
        'Bij C++: wanden en plafond worden volledig afgewerkt, zodat u de ruimte direct in gebruik kunt nemen.',
        'Bij Casco: geen binnenafwerking — u of uw eigen aannemer gaat verder.',
      ],
      perPlan: {
        casco:  'Uw plan is Casco: wij leveren wind- en waterdicht op, zonder dekvloer, elektra en vloerverwarming. De binnenafwerking doet u zelf of laat u door uw eigen aannemer uitvoeren.',
        cplus:  'Uw plan is C+: schilderklare oplevering met afgewerkte dekvloer, 2× contactpunt, 1× lichtpunt en een vorstvrije buitenkraan. Lichtkoepel en vloerverwarming als u die heeft meebesteld.',
        cplus2: 'Uw plan is C++: volledige binnenafwerking met dekvloer, vloerverwarming, lichtkoepel (standaard maat), volledige elektra en buitenkraan — sleutelklaar.',
      },
      nodigKop: 'Waar u rekening mee kunt houden',
      nodig: [
        'Bij C+: kies tijdig uw eigen vloer- en wandafwerking, zodat u na de oplevering direct verder kunt.',
        'Geef wijzigingen zo vroeg mogelijk door; na het storten van de dekvloer is de leidingloop niet meer aan te passen.',
      ],
    },
    {
      id: 'oplevering',
      titel: 'Oplevering',
      kort: 'Eindcontrole samen met u en sleuteloverdracht. Ook daarna staan we voor u klaar.',
      watKop: 'Wat er in deze stap gebeurt',
      wat: [
        'We lopen de aan- of uitbouw samen met u na en noteren eventuele opleverpunten; die werken we af.',
        'U ontvangt de eindfactuur en de bijbehorende documenten.',
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
    regels.push('Bedankt voor uw interesse in een aan- of uitbouw. Op ' + (o.datum || '[datum en tijd]') + ' komen wij bij u langs om kennis te maken, uw wensen te bespreken en de situatie ter plaatse op te nemen. Het bezoek duurt ongeveer een uur en is vrijblijvend.');
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
