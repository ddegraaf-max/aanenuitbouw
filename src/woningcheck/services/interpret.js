'use strict';

/**
 * Van brondata naar iets waar een aanbouwgesprek mee begint.
 *
 * NADRUKKELIJK: dit is geen constructieberekening en geen ontwerp. Het is de
 * voorbereiding erop. Wat hier uitkomt bepaalt welke vragen de constructeur nog
 * moet stellen, niet welke ligger erin komt. Elke tekst is zo geformuleerd dat
 * dat onderscheid voor de bezoeker duidelijk blijft.
 */

const { bovenDeDoorbraak } = require('./bag3d');
const { verwachtingBijBouwjaar } = require('./gemeentearchief');

/** Grootste noord-zuid- en oost-westmaat van een RD-polygoon. */
function omhullende(coordinaten) {
  const ring = coordinaten && coordinaten[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
}

function rond(n, d = 1) {
  return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null;
}

/**
 * Hoeveel ruimte is er achter de woning? De achterzijde bepalen we niet uit een
 * windrichting — die kan alle kanten op staan — maar uit de vorm: we nemen de
 * langste vrije afstand tussen de pandcontour en de perceelgrens.
 *
 * Dat is een benadering. De echte diepte hangt af van waar de voordeur zit en
 * hoe het perceel loopt, en dat is uit deze data niet met zekerheid te halen.
 * Daarom heet het in de tekst ook "ruimte achter of naast de woning".
 */
function vrijeRuimte(pandContour, perceelGeometrie) {
  const pand = omhullende(pandContour);
  const perceel = perceelGeometrie && omhullende(
    perceelGeometrie.type === 'Polygon' ? perceelGeometrie.coordinates
      : perceelGeometrie.type === 'MultiPolygon' ? perceelGeometrie.coordinates[0] : null,
  );
  if (!pand || !perceel) return null;

  const marges = {
    noord: perceel.maxY - pand.maxY,
    zuid: pand.minY - perceel.minY,
    oost: perceel.maxX - pand.maxX,
    west: pand.minX - perceel.minX,
  };
  const gesorteerd = Object.entries(marges)
    .map(([kant, m]) => ({ kant, meter: rond(m) }))
    .filter((x) => Number.isFinite(x.meter) && x.meter > 0)
    .sort((a, b) => b.meter - a.meter);

  if (gesorteerd.length === 0) return null;
  return { grootste: gesorteerd[0], alle: gesorteerd };
}

/** Breedte van de gevel waarin een doorbraak zou komen. */
function gevelbreedte(afmetingen) {
  if (!afmetingen) return null;
  // Bij een rijtjeswoning of twee-onder-een-kap is de achtergevel de korte
  // zijde; de lange zijde is de diepte van het huis.
  return afmetingen.kortsteZijde;
}

/**
 * Bouwt de conclusies op. Elke conclusie heeft een soort, zodat de pagina er
 * een pictogram bij kan zetten: 'feit', 'let-op' of 'info'.
 */
function bouwConclusies({ adres, woning, perceel, hoogtes, archief }) {
  const uit = [];

  const breedte = gevelbreedte(woning && woning.afmetingen);
  if (breedte) {
    uit.push({
      soort: 'feit',
      tekst: `De smalste zijde van uw pand meet ongeveer ${breedte.toFixed(1)} m. Is dat de achtergevel, dan is dat de maximale breedte van een doorbraak, minus ongeveer 30 cm aan weerszijden voor de stalen kolommen die de ligger dragen.`,
    });
  }

  const boven = bovenDeDoorbraak(hoogtes);
  if (boven) {
    uit.push({ soort: boven.verwachting === 'verdieping' ? 'let-op' : 'info', tekst: boven.tekst });
  }

  if (woning && Number.isFinite(woning.bouwjaar)) {
    const jaar = woning.bouwjaar;
    let tekst;
    if (jaar < 1945) {
      tekst = `Bouwjaar ${jaar}. Woningen uit die tijd hebben doorgaans houten vloeren op stalen of houten balken, en een gemetselde achtergevel zonder isolatie. Bij een doorbraak is de vraag of de achtergevel dragend is en waar de balklaag op rust — dat bepaalt of er een raveelconstructie nodig is.`;
    } else if (jaar < 1975) {
      tekst = `Bouwjaar ${jaar}. Vaak een combinatie van houten en betonnen vloeren. De achtergevel is meestal dragend, en de fundering is bij deze bouwjaren het aandachtspunt: op staal of op palen scheelt aanzienlijk in de aansluiting van de aanbouw.`;
    } else if (jaar < 1992) {
      tekst = `Bouwjaar ${jaar}. Doorgaans betonnen vloeren en een dragende achtergevel. Aansluiten met een aanbouw is bij deze bouwjaren meestal het meest voorspelbaar.`;
    } else {
      tekst = `Bouwjaar ${jaar}. Modern casco met betonnen vloeren en goede documentatie; de constructieve gegevens zijn vrijwel altijd nog op te vragen bij de gemeente.`;
    }
    uit.push({ soort: 'info', tekst });
  }

  const ruimte = vrijeRuimte(woning && woning.contour, perceel && perceel.geometrie);
  if (ruimte) {
    uit.push({
      soort: 'feit',
      tekst: `Tussen het pand en de perceelgrens is aan de ${ruimte.grootste.kant}zijde ongeveer ${ruimte.grootste.meter.toFixed(1)} m ruimte. Dat is de bovengrens voor de diepte van een aanbouw aan die kant, waarbij u nog ruimte overhoudt tot de erfgrens.`,
    });
  }

  if (perceel && Number.isFinite(perceel.oppervlakte) && woning && Number.isFinite(woning.grondoppervlak)) {
    const bebouwd = Math.round((woning.grondoppervlak / perceel.oppervlakte) * 100);
    uit.push({
      soort: bebouwd > 55 ? 'let-op' : 'info',
      tekst: `Van de ${perceel.oppervlakte} m² perceel is nu ongeveer ${woning.grondoppervlak} m² bebouwd, dus ${bebouwd}%.${bebouwd > 55 ? ' Dat is al vrij hoog; gemeenten stellen in het omgevingsplan vaak een maximum aan de bebouwing van het achtererf. Laat dat controleren voordat u een ontwerp laat maken.' : ' Dat laat in de meeste omgevingsplannen ruimte voor een aanbouw op het achtererf.'}`,
    });
  }

  if (archief) {
    uit.push({
      soort: 'info',
      tekst: `${archief.tekst}${archief.let_op ? ' ' + archief.let_op : ''}`,
    });
    const verwachting = verwachtingBijBouwjaar(woning && woning.bouwjaar);
    if (verwachting) uit.push({ soort: 'info', tekst: verwachting });
  }

  uit.push({
    soort: 'let-op',
    tekst: 'Deze gegevens komen uit openbare registraties en beschrijven de woning zoals die is ingeschreven. Verbouwingen die nooit zijn gemeld, staan er niet in. Voor de constructieberekening blijft een opname op locatie nodig: de werkelijke overspanning, het vloertype en de fundering zijn niet uit registraties te halen.',
  });

  return uit;
}

/** Korte samenvatting voor de e-mail naar de constructeur. */
function samenvattingVoorMail({ adres, woning, perceel, hoogtes }) {
  const regels = [];
  if (adres) regels.push(`Adres: ${adres.omschrijving}${adres.gemeente ? ` (gemeente ${adres.gemeente})` : ''}`);
  if (woning) {
    if (Number.isFinite(woning.bouwjaar)) regels.push(`Bouwjaar: ${woning.bouwjaar}`);
    if (Number.isFinite(woning.woonoppervlak)) regels.push(`Woonoppervlak (BAG): ${woning.woonoppervlak} m²`);
    if (Number.isFinite(woning.grondoppervlak)) regels.push(`Grondoppervlak pand: ${woning.grondoppervlak} m²`);
    if (woning.afmetingen) regels.push(`Pandmaten: ${woning.afmetingen.kortsteZijde} x ${woning.afmetingen.langsteZijde} m`);
  }
  if (perceel && Number.isFinite(perceel.oppervlakte)) regels.push(`Perceel (BRK): ${perceel.oppervlakte} m²`);
  if (hoogtes) {
    if (Number.isFinite(hoogtes.goothoogte)) regels.push(`Goothoogte: ${hoogtes.goothoogte} m`);
    if (Number.isFinite(hoogtes.nokhoogte)) regels.push(`Nokhoogte: ${hoogtes.nokhoogte} m`);
    if (Number.isFinite(hoogtes.bouwlagen)) regels.push(`Bouwlagen (3D BAG): ${hoogtes.bouwlagen}`);
  }
  return regels;
}

module.exports = { bouwConclusies, samenvattingVoorMail, _intern: { vrijeRuimte, omhullende, gevelbreedte } };
