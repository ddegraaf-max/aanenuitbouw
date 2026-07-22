# LEESMIJ — Schuifpui 4-delig toevoegen (stap 6/8)

## Wat er verandert

| Optie | Was | Wordt |
|-------|-----|-------|
| Openslaande deuren | inbegrepen | inbegrepen (ongewijzigd) |
| Schuifpui (2-delig) | +€3.500 | +€3.500 (ongewijzigd) |
| **Schuifpui 4-delig** | — | **+€5.500 (NIEUW, direct onder de 2-delige schuifpui)** |
| Harmonicadeur | +€5.500 | **+€7.500** |

## Stappenplan

Open `snippets-schuifpui-4delig.html` — daarin staan zes genummerde blokken:

1. **Optiekaart (HTML):** plakken direct onder de bestaande Schuifpui-kaart, boven de Harmonicadeur. Neem de exacte class-namen en attribuutstructuur van de bestaande Schuifpui-kaart over; de snippet is een sjabloon.
2. **Harmonicadeur:** prijs aanpassen op twee plekken — het data-attribuut/de berekeningswaarde én de zichtbare tekst op de kaart (+€7.500).
3. **Prijsberekening (JS):** nieuwe regel `schuifpui-4delig: 5500` toevoegen en harmonicadeur op 7500 zetten. Werkt jouw berekening al met `data-prijs` op de inputs, dan is dit blok niet nodig.
4. **SVG-weergave:** voorbeeldfunctie voor vier panelen met handgreepjes op de middelste twee. Pas aan op je bestaande tekenfunctie.
5. **Offertemail:** nieuwe optie toevoegen aan de mail-template en de harmonicaprijs daar controleren.
6. **Kleurkaartjes:** controleren of de mini-previews bij "Kleur kozijn" het nieuwe puitype aankunnen.

## Testen na aanpassing

1. Kaart verschijnt op de juiste plek en is selecteerbaar
2. Totaalprijs stijgt met €5.500 bij selectie
3. Harmonicadeur telt nu €7.500 mee (kaart én berekening)
4. SVG toont vier panelen bij de nieuwe optie
5. Testofferte aanvragen → mail toont "Schuifpui 4-delig (+ €5.500)"

## Kanttekening

Deze snippets zijn geschreven op basis van de screenshot, niet op basis van het echte configurator-bestand. Class-namen, name-attributen en de opbouw van de prijsberekening kunnen afwijken. Upload het bestand in de chat, dan lever ik een kant-en-klare aangepaste versie die je direct kunt deployen (ZIP → GitHub Desktop → Railway).
