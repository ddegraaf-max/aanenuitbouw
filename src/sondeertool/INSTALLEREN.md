# Installeren — lees dit eerst

Deze ZIP bevat **uitsluitend bestanden in submappen**. Er zit geen
`server.js`, geen `app.js`, geen `package.json`, geen `.gitignore` en geen
`.env` in. Je kunt de inhoud dus over je project heen pakken zonder dat er iets
van jouw eigen configuratie wordt overschreven.

Dat was vorige keer het probleem: de vorige ZIP had een standalone `server.js`
en `package.json` in de root staan. Die zijn nu weg.

---

## Stap 1 — bestanden overzetten

Pak de ZIP uit boven je projectroot. Dit komt erbij:

```
src/sondeertool/routes/sonderingen.js
src/sondeertool/services/          broClient, cptParser, geocode,
                                   interpret, mockBro, rd
src/sondeertool/utils/cache.js
src/sondeertool/test/              tests + fixture
src/sondeertool/tools/             preview-serverje, alleen lokaal
views/sondeertool.ejs
public/sondeertool.css
public/sondeertool.js
sql/001_sondeertool.sql
```

Alleen `views/`, `public/` en `sql/` mengen met jouw bestaande mappen, en de
bestandsnamen daarin beginnen allemaal met `sondeertool`. Controleer voor de
zekerheid of je die namen nog niet had. Al het overige zit in `src/sondeertool/`
en raakt niets.

## Stap 2 — één pagina-view maken

De view `views/sondeertool.ejs` is een **fragment**, geen volledige pagina.
Maak een eigen pagina die je layout eromheen zet, bijvoorbeeld
`views/bodemcheck.ejs`:

```ejs
<%- include('partials/header') %>
<%- include('sondeertool') %>
<%- include('partials/footer') %>
```

Gebruik de namen van jouw eigen partials. Zet in de `<head>` van je layout
niets extra's: het fragment brengt zijn eigen stylesheet en fonts mee.

## Stap 3 — één regel in je bestaande app

```js
app.use('/bodemcheck', require('./src/sondeertool/routes/sonderingen')({
  viewNaam: 'bodemcheck',      // de view uit stap 2
  staticPad: '/static',        // jouw express.static-mount
  pool,                        // optioneel, voor logging en aanvragen
  onLead: async (aanvraag) => {
    await resend.emails.send({
      from: 'site@aanenuitbouw.nl',
      to: 'info@aanenuitbouw.nl',
      subject: `Sondering aangevraagd — ${aanvraag.adres}`,
      text: JSON.stringify(aanvraag, null, 2),
    });
  },
}));
```

Zet die regel bij je andere `app.use`-regels, **vóór** je 404-handler.

Laat je `viewNaam` weg, dan rendert de router `views/sondeertool.ejs` direct.
Dat werkt, maar dan krijgt de bezoeker de pagina zonder jouw navigatie.

## Stap 4 — database (optioneel)

```bash
psql $DATABASE_URL -f sql/001_sondeertool.sql
```

Sla je dit over, dan werkt de tool gewoon; alleen zonder logging en zonder dat
aanvragen worden opgeslagen. Geef je geen `pool` mee maar wel `onLead`, dan
komen aanvragen alleen per e-mail binnen.

## Stap 5 — controleren

Lokaal, zonder de site aan te raken:

```bash
BRO_MOCK=1 node src/sondeertool/tools/preview.js
# http://localhost:3777/bodemcheck
```

Na deploy:

```bash
curl -s "https://aanenuitbouw.nl/bodemcheck/api/analyse?q=1401EX%205" | head -c 500
curl -s -o /dev/null -w "%{http_code}\n" https://aanenuitbouw.nl/
```

De tweede regel moet `200` geven en je eigen homepage tonen. Zie je bij de
eerste `"aantalGevonden": 0` bij een adres in bebouwd gebied, kijk dan in
README.md onder "De enige onzekerheid".

---

## Dependencies

Geen nieuwe. De module gebruikt `express` en `ejs` die je al hebt, en verder
alleen ingebouwde Node-modules. `fetch` is globaal vanaf Node 18.

**Voeg niets toe aan je `package.json`.** Als je vorige keer je dependencies
kwijt bent geraakt, controleer dan eerst of alles er weer in staat voordat je
dit toevoegt.

## Wat je niet moet doen

- `src/sondeertool/tools/preview.js` in je `start`-script zetten. Dat bestand
  weigert te starten als `NODE_ENV=production`, maar zet het er niet in.
- De EJS-view als losse pagina serveren zonder je layout eromheen.
- `BRO_MOCK=1` in de Railway-variabelen zetten. Dan staat er fictieve
  sondeerdata op je site.
