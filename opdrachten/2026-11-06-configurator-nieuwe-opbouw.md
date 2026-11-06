# Opdracht: de configurator in de opbouw van het nieuwe ontwerp

**Gevonden:** 6 november 2026. Daniël leverde een ontwerp voor de configurator. De kleuren en de kop zijn al omgezet (`img/ontwerp.css`); de opbouw niet.
**Soort:** opbouw en interactie. Dat is meer dan opmaak.
**Goedgekeurd door Daniël:** 6 november 2026, op basis van het klikbare prototype. Bouwen maar.

## Wat het ontwerp laat zien

- **Links** een donkere kolom met de acht stappen onder elkaar. Elke stap heeft een nummer, een titel en een korte regel (Afmetingen, breedte en diepte). De actieve stap is oranje.
- **In het midden** de stap zelf. Bij Afmetingen: een schuifbalk met – en + voor de breedte (3–7 m) en voor de diepte (1,5–4 m), plus een vak met de uitkomst in m².
- **Rechts** een groot beeld van de uitbouw, met de knoppen Achteraanzicht / 3D-weergave / Plattegrond.
- **Onderaan** een strook met wat er per stap gekozen is (Afmetingen 6 × 3 m, Model, Dak, Gevel, Kozijnen, Extra's, Afwerking).
- **Daaronder** een vaste balk met "Uw uitbouw", de indicatieprijs, "Offerte aanvragen" en "Volgende stap".

## Het goedgekeurde prototype

`opdrachten/ontwerp/configurator-prototype.html` is het klikbare prototype dat Daniël heeft goedgekeurd. Het is geschreven voor een ontwerpomgeving (`<x-dc>`, `{{…}}`, `sc-for`, `sc-if`) en draait dus niet los in de browser, maar alle maten, kleuren, teksten en de volgorde staan erin. Neem die over; de techniek niet.

Kort wat erin staat:

- **Menubalk** `#1F2329`, oranje huislogo, menu, knop "Bel ons" in `#C4510A`.
- **Titelband** `#2A2F37`: "Uitbouw **configurator**" (tweede woord `#F7891F`), de regel "Stel uw ideale uitbouw samen, bekijk direct het resultaat en de prijs." en rechts vier punten met oranje lijniconen: 20+ jaar ervaring, Transparante prijzen, Maatwerk & advies, Van ontwerp tot realisatie.
- **Stappenkolom** `#1F2329`, ca. 260 px breed. Volgorde: 1 Afmetingen, 2 Model (aanbouw/uitbouw), 3 Dak, 4 Gevel, 5 Kozijnen, 6 Extra's, 7 Afwerking (Casco/C+/C++), 8 Offerte. Actieve stap: oranje verloop `#F47A14 → #D85C0A`, witte bol met nummer in `#C4510A`. Afgeronde stap: oranje bol met ✓. Elke stap is aanklikbaar.
- **Stappaneel** wit: "Stap x van 8" in `#C4510A` met een balkje van acht streepjes, kop 32 px Manrope 800, uitleg eronder. Afmetingen: schuifbalk (stap 0,25 m) met –/+ en een waarde ertussen, schaalverdeling eronder, en een lichtoranje vak `#FFF4EA` met "Uw afmetingen 6,00 m × 3,00 m = 18,00 m²". De andere stappen: keuzekaarten (rand 2 px, gekozen = `#F47A14` met vlak `#FFF6EE` en gevulde bol), met de meerprijs in `#C4510A`; bij Gevel en Kozijnen kleurbolletjes eronder. Onderaan "← Vorige".
- **Beeld rechts**, afgeronde hoeken, met rechtsboven de knoppen Achteraanzicht / 3D-weergave / Plattegrond (gekozen: `#C4510A`, wit). Hier komt de bestaande SVG-tekening; het prototype toont een foto alleen als vulling.
- **Keuzestrook** wit onder de drie kolommen: zeven vakjes (titel + gekozen waarde), aanklikbaar naar die stap; de huidige stap heeft een oranje rand.
- **Prijsbalk** `#1F2329`, `position: sticky; bottom: 0`: "Uw uitbouw" met samenvatting (Uitbouw | 6,00 m × 3,00 m (18,00 m²) | C+), "Indicatieprijs" met het bedrag groot in `#F7891F` en "incl. btw", knoppen "Offerte aanvragen" (omlijnd, wit) en "Volgende stap: <naam> →" (`#C4510A`).
- Lettertypen: Manrope voor koppen en knoppen, DM Sans voor tekst. Wit op oranje alleen op `#C4510A` of donkerder (contrast).

## Waar de bestaande velden heen gaan

Alles wat de configurator nu vraagt, blijft. Het prototype toont alleen de hoofdkeuzes; zet de rest in de stap waar het hoort:

- Gevel: ook de kleuren per materiaal zoals nu (baksteen 4, keralit 4, hout 4), regenpijp (pvc/zink).
- Kozijnen: ook bovenkozijn (metselwerk/trespa) en de puikleur (+ € 850 als niet wit).
- Dak: ook de dakrand (metselwerk met zink / overstek met daktrim).
- Extra's: lichtkoepel, vloerverwarming, buitenkraan én de elektrapunten, met dezelfde regels als nu (lichtkoepel gratis bij C++, vloerverwarming per m² en niet bij Casco of C++, buitenkraan alleen betaald bij Casco).
- Offerte: het bestaande contactformulier met adres, bouwtekeningen, startmaand, link en foto's. Verzenden, de mail en de Google Ads-conversie blijven precies zoals ze zijn.

## Wat er moet gebeuren

1. Bouw de opbouw om naar de drie kolommen met de stappen links, in de volgorde van het prototype. Op een telefoon worden de stappen een horizontaal scrollende rij bovenaan, het beeld komt boven het stappaneel en de prijsbalk blijft onderaan staan.
2. Maak van afmetingen schuifbalken met – en +, gekoppeld aan dezelfde waarden als nu. De prijsberekening verandert niet.
3. Maak de keuzestrook onderaan en de vaste prijsbalk.
4. Het grote beeld blijft de bestaande SVG-tekening (vooraanzicht, 3D, zijaanzicht). Een foto kan pas als er per keuze beelden zijn, en die zijn er niet.

Pas `img/ontwerp.css` aan of zet de nieuwe opmaak erbij; de kleuren daarin zijn al goedgekeurd.

## Wat je níet verandert

De prijzen, de berekening, de offerte-mail en de Google Ads-conversie. Controleer na afloop met een testaanvraag dat de offerte nog precies hetzelfde binnenkomt.
