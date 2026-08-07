'use strict';

/**
 * Waar vraag je de bouwtekeningen van een woning op?
 *
 * Er is geen landelijke bron en geen API. Bouwtekeningen zitten in het
 * bouwdossier van de gemeente. Drie dingen staan automatisering in de weg en
 * die gaan niet weg:
 *
 *   - op tekeningen zit auteursrecht van de architect; gemeenten geven inzage
 *     maar beperken kopiëren en publiceren
 *   - plattegronden van het interieur zijn privacygevoelig
 *   - veel gemeenten verstrekken volledige dossiers alleen aan de eigenaar
 *
 * Dat laatste werkt in ons voordeel: de aanvrager IS de eigenaar. Voor hem is
 * opvragen doorgaans gratis en een kwestie van een formulier.
 *
 * Deze lijst is met de hand samengesteld voor de gemeenten waar het meeste werk
 * ligt. Staat een gemeente er niet in, dan krijgt de bezoeker een nette
 * instructie met de naam van zijn gemeente erin in plaats van een dode link.
 * Uitbreiden is één regel toevoegen.
 *
 * Controleer deze links een keer per jaar; gemeenten verbouwen hun sites.
 */

const ARCHIEVEN = {
  Amsterdam: {
    url: 'https://www.amsterdam.nl/wonen-leefomgeving/bouwdossiers/',
    soort: 'online',
    let_op: 'Bouwdossiers van vóór 1996 staan in het Stadsarchief en zijn deels al gedigitaliseerd.',
  },
  Rotterdam: { url: 'https://www.rotterdam.nl/bouwdossier-opvragen', soort: 'online' },
  'Den Haag': { url: 'https://www.denhaag.nl/nl/bouwen-en-verbouwen/bouwtekening-opvragen/', soort: 'online' },
  Utrecht: { url: 'https://www.utrecht.nl/wonen-en-leven/bouwen/bouwdossier-inzien/', soort: 'online' },
  Haarlem: { url: 'https://www.haarlem.nl/bouwdossier-inzien', soort: 'aanvraag' },
  Almere: { url: 'https://www.almere.nl/wonen/bouwdossier-inzien', soort: 'aanvraag' },
  Amstelveen: { url: 'https://www.amstelveen.nl/bouwarchief', soort: 'aanvraag' },
  Apeldoorn: { url: 'https://www.apeldoorn.nl/bouwdossier-opvragen', soort: 'aanvraag' },
  Hilversum: { url: 'https://www.hilversum.nl/bouwdossier', soort: 'aanvraag' },
  'Gooise Meren': { url: 'https://www.gooisemeren.nl/bouwdossier-inzien', soort: 'aanvraag' },
  Amersfoort: { url: 'https://www.amersfoort.nl/bouwdossier-inzien', soort: 'aanvraag' },
  Zaanstad: { url: 'https://www.zaanstad.nl/bouwdossier', soort: 'aanvraag' },
  Purmerend: { url: 'https://www.purmerend.nl/bouwdossier', soort: 'aanvraag' },
  Hoorn: { url: 'https://www.hoorn.nl/bouwdossier', soort: 'aanvraag' },
  Alkmaar: { url: 'https://www.alkmaar.nl/bouwdossier', soort: 'aanvraag' },
  Zeist: { url: 'https://www.zeist.nl/bouwdossier', soort: 'aanvraag' },
  Nieuwegein: { url: 'https://www.nieuwegein.nl/bouwdossier', soort: 'aanvraag' },
  Bunschoten: { url: 'https://www.bunschoten.nl/bouwdossier', soort: 'aanvraag' },
  Weesp: { url: 'https://www.amsterdam.nl/wonen-leefomgeving/bouwdossiers/', soort: 'online',
    let_op: 'Weesp hoort sinds 2022 bij Amsterdam; het archief loopt via Amsterdam.' },
  Eindhoven: { url: 'https://www.eindhoven.nl/bouwdossier-opvragen', soort: 'online' },
  Groningen: { url: 'https://gemeente.groningen.nl/bouwdossier-opvragen', soort: 'aanvraag' },
  Arnhem: { url: 'https://www.arnhem.nl/bouwdossier', soort: 'aanvraag' },
  Nijmegen: { url: 'https://www.nijmegen.nl/bouwdossier', soort: 'aanvraag' },
  Tilburg: { url: 'https://www.tilburg.nl/bouwdossier', soort: 'aanvraag' },
  Breda: { url: 'https://www.breda.nl/bouwdossier-inzien', soort: 'aanvraag' },
};

/**
 * @param {string} gemeente naam zoals de BAG die geeft
 * @returns {{gemeente:string, url:string|null, soort:string, tekst:string, let_op?:string}}
 */
function archiefVoor(gemeente) {
  const naam = String(gemeente || '').trim();
  const treffer = naam ? ARCHIEVEN[naam] : null;

  if (treffer) {
    return {
      gemeente: naam,
      url: treffer.url,
      soort: treffer.soort,
      let_op: treffer.let_op || null,
      tekst:
        treffer.soort === 'online'
          ? `Gemeente ${naam} heeft het bouwarchief online doorzoekbaar op adres. Vaak kunt u de tekeningen direct als PDF downloaden.`
          : `Bij gemeente ${naam} vraagt u inzage in het bouwdossier aan met een formulier. Als eigenaar van de woning is dat doorgaans gratis; reken op een paar dagen tot enkele weken.`,
    };
  }

  return {
    gemeente: naam || null,
    url: null,
    soort: 'onbekend',
    let_op: null,
    tekst: naam
      ? `Zoek op de website van gemeente ${naam} op "bouwdossier inzien" of "bouwtekening opvragen". Als eigenaar van de woning heeft u recht op inzage in uw eigen dossier; dat is meestal gratis.`
      : 'Zoek op de website van uw gemeente op "bouwdossier inzien". Als eigenaar heeft u recht op inzage in uw eigen dossier.',
  };
}

/** Wat de klant kan verwachten, gegeven het bouwjaar van de woning. */
function verwachtingBijBouwjaar(bouwjaar) {
  if (!Number.isFinite(bouwjaar)) return null;
  if (bouwjaar < 1930) {
    return 'Bij een woning van voor 1930 ligt er vaak alleen een gevelaanzicht en een eenvoudige plattegrond, zonder constructiegegevens. Reken erop dat de constructeur de bestaande situatie ter plaatse moet opnemen.';
  }
  if (bouwjaar < 1970) {
    return 'Bij woningen uit deze periode is er meestal wel een bouwdossier, maar de constructieve gegevens zijn beperkt. Latere verbouwingen zitten soms in een apart dossier.';
  }
  if (bouwjaar < 1995) {
    return 'Uit deze periode zijn de dossiers doorgaans compleet, inclusief plattegronden en doorsneden. Constructieberekeningen zitten er niet altijd bij.';
  }
  return 'Bij een woning van na 1995 is het dossier vrijwel altijd volledig en digitaal beschikbaar, meestal inclusief constructieve tekeningen.';
}

module.exports = { archiefVoor, verwachtingBijBouwjaar, ARCHIEVEN };
