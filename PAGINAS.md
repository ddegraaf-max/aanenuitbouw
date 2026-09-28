# Losse pagina's

Naast de homepage heeft de site acht losse pagina's. Elk onderwerp heeft zo een eigen adres, titel en kop, zodat Google het apart kan tonen.

| Adres | Onderwerp |
|---|---|
| `/aanbouw` | Aanbouw |
| `/uitbouw` | Uitbouw |
| `/plannen-en-prijzen` | Casco, C+ en C++ met prijs per m² |
| `/prefab-of-klassiek` | Prefab tegenover klassiek bouwen |
| `/werkwijze` | De negen stappen van een project |
| `/projecten` | Gerealiseerde projecten |
| `/over-ons` | Over ons en partner Constructiehuis |
| `/contact` | Contactgegevens |

De homepage (`configurator.html`) met de configurator, het beheer en de projectmonitor is niet veranderd van opzet.

## Waar staat wat

| Wat u wilt aanpassen | Waar |
|---|---|
| Teksten, titels en beschrijvingen van de losse pagina's | `src/paginas/teksten.js` |
| De negen stappen (pagina Werkwijze) | `projectfasen.js` |
| Prijzen per m² van de plannen | Beheer → Prijsbeheer (de pagina's lezen dit automatisch) |
| Links naar Facebook, Instagram en WhatsApp | `projectfasen.js` |

**Let op:** de teksten op de losse pagina's zijn overgenomen van de homepage. Past u een tekst op de homepage aan, pas hem dan ook aan in `src/paginas/teksten.js`, en andersom.

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

## Een pagina toevoegen

Dat vraagt een aanpassing in `src/paginas/index.js` en een regel in `sitemap.xml`. Vraag dit aan wie de site technisch beheert.

## Voor de technisch beheerder

- De pagina's worden gemaakt door `src/paginas/index.js`, aangesloten in `server.js` vlak voor `serveStatic`.
- `src/paginas/basis.css` is overgenomen uit `configurator.html`. Na een wijziging in de vormgeving van de homepage opnieuw maken met:

  ```
  node tools/maak-pagina-css.js
  ```

- Testen:

  ```
  node --test src/paginas/test/*.test.js
  ```

  De test controleert onder meer dat elke tekst op de losse pagina's letterlijk op de homepage staat, dat koppen geen niveau overslaan en dat elke pagina in de sitemap staat.
