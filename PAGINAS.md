# Losse pagina's

Naast de homepage heeft de site dertien losse pagina's. Elk onderwerp heeft zo een eigen adres, titel en kop, zodat Google het apart kan tonen.

| Adres | Onderwerp |
|---|---|
| `/aanbouw` | Aanbouw, met rekenvoorbeelden |
| `/uitbouw` | Uitbouw, met rekenvoorbeelden |
| `/plannen-en-prijzen` | Casco, C+ en C++, rekenvoorbeelden en de prijslijst van alle opties |
| `/prefab-of-klassiek` | Prefab tegenover klassiek bouwen |
| `/dak-en-dakrand` | Daktypes, afwerking van de dakrand, lichtkoepel |
| `/gevelbekleding` | Baksteen, kunststof rabat of hout, met kleuren |
| `/pui-en-kozijnen` | Openslaande deuren, schuifpui, harmonicadeur, kozijnkleur |
| `/extras` | Lichtkoepel, vloerverwarming, buitenkraan, regenpijpen, elektra |
| `/werkwijze` | De negen stappen van een project |
| `/veelgestelde-vragen` | Zeventien vragen met antwoord |
| `/projecten` | Gerealiseerde projecten |
| `/over-ons` | Over ons en partner Constructiehuis |
| `/contact` | Contactgegevens |

De homepage (`configurator.html`) met de configurator, het beheer en de projectmonitor is niet veranderd van opzet.

## Waar komt de inhoud vandaan

Op deze pagina's staat niets wat niet al elders op de site vaststaat. Dat is zo gebouwd dat het vanzelf gelijk blijft:

| Inhoud | Komt uit | Aanpassen |
|---|---|---|
| Alle prijzen en meerprijzen | Beheer → Prijsbeheer | In het beheer; de pagina's volgen direct |
| Rekenvoorbeelden | De rekenformule van de configurator zelf | Volgt vanzelf de prijzen |
| Opties (daken, gevels, puien, kleuren) en hun omschrijving | `configurator.html` | Daar; de pagina's volgen na een herstart |
| De negen stappen, vergunning, sondering, constructeur | `projectfasen.js` | Daar |
| Antwoorden op de veelgestelde vragen | Samengesteld uit de drie bronnen hierboven | In de bron |
| Overige teksten, titels en beschrijvingen voor Google, de vragen zelf | `src/paginas/teksten.js` | Daar |

**Let op:** de teksten in `src/paginas/teksten.js` zijn overgenomen van de homepage. Past u een tekst op de homepage aan, pas hem dan ook daar aan, en andersom. De test hieronder meldt het als ze uit elkaar lopen.

## Een vraag toevoegen aan de veelgestelde vragen

Een vraag bestaat uit twee delen: de vraag (in `src/paginas/teksten.js`, onderdeel `VRAGEN`) en het antwoord (in `src/paginas/opties.js`, functie `antwoorden`). Het antwoord moet verwijzen naar een tekst die al op de site staat. Vraag dit aan wie de site technisch beheert.

## Een project toevoegen

1. Zet de foto in de map `projecten/` (liggend, 1200 × 900 pixels, JPG).
2. Open `src/paginas/teksten.js`, zoek `PROJECTEN` en kopieer een blok:

   ```js
   {
     foto: '/projecten/uitbouw-plaatsnaam.jpg',
     alt: 'Korte beschrijving van de foto',
     soort: 'Uitbouw',
     titel: 'Uitbouw in Plaatsnaam',
     tekst: 'Een of twee zinnen over het project.',
   },
   ```

3. Wilt u het project ook op de homepage, voeg het dan daar toe zoals beschreven in `PROJECTEN-TOEVOEGEN.md`.

De foto's van de bestaande projecten hebben ook een kleinere versie (`...-800.webp` en `...-1200.webp`); daarmee laadt de pagina sneller op een telefoon. Voor een nieuwe foto is dat niet verplicht: ontbreken die bestanden, dan wordt de foto zelf getoond.

## Voor de technisch beheerder

| Bestand | Wat het doet |
|---|---|
| `src/paginas/index.js` | Maakt de pagina's; aangesloten in `server.js` vlak voor `serveStatic` |
| `src/paginas/opties.js` | Optiepagina's, rekenvoorbeelden, prijslijst en veelgestelde vragen |
| `src/paginas/configurator.js` | Leest opties, prijzen en de functie `calculate()` uit `configurator.html` |
| `src/paginas/teksten.js` | Teksten |
| `src/paginas/basis.css` | Vormgeving, overgenomen uit `configurator.html` |
| `src/paginas/paginas.css` | Eigen vormgeving van de losse pagina's |

Na een wijziging in de vormgeving van de homepage:

```
node tools/maak-pagina-css.js
```

Testen:

```
node --test src/paginas/test/*.test.js
```

De tests controleren onder meer dat:

- elke tekst op de losse pagina's letterlijk op de homepage, in de configurator of in `projectfasen.js` staat;
- de rekenvoorbeelden gelijk zijn aan de uitkomst van de configurator;
- de antwoorden op de veelgestelde vragen geen toezegging bevatten over vergunning of sondering;
- koppen geen niveau overslaan en elke pagina in de sitemap staat.

`configurator.js` zoekt in `configurator.html` naar `const state = {`, `const DEFAULT_PRICES = {` en het kopje `// VIEW CONFIG`. Verandert de opbouw daar, dan meldt de test dat de opties niet te lezen zijn; de vijf pagina's die ervan afhangen geven dan een 404 in plaats van verkeerde bedragen.
