# Installeren

## Uitpakken en één regel toevoegen

Pak de ZIP uit boven je projectmap. Er komt precies één map bij:
`src/sondeertool/`. Niets wordt overschreven — geen `server.js`, geen
`package.json`, geen bestand in je root.

Daarna één regel in `server.js`. Zoek de laatste regel van je
`http.createServer`-handler:

```js
  serveStatic(req, res, pathname);
});
```

En zet daar bóven:

```js
  // ===== Bodemcheck / sondeertool (BRO) =====
  if (await require('./src/sondeertool').handle(req, res, url)) return;
```

Dat is alles. Ook in `src/sondeertool/PLAK-DIT-IN-SERVER-JS.txt` te vinden.

Zonder terminal kan dit rechtstreeks op github.com: repo openen, `server.js`
aanklikken, pennetje, regel invoegen, Commit changes. Railway deployt
automatisch.

## Waarom juist daar

`handle()` geeft `true` terug als het verzoek voor `/bodemcheck` was en al is
afgehandeld, en `false` als het er niets mee te maken had. Bij `false` loopt
jouw `serveStatic` gewoon door. De module kan dus geen enkele bestaande route
van je onderscheppen — dat is met opzet zo gebouwd.

Je handler is al `async`, en `req`, `res` en `url` bestaan daar alle drie al.

## Waarom er niets te configureren is

Deze module hangt niet aan jouw opzet:

| | |
| --- | --- |
| Framework | Geen. Geen express, geen dependencies — alleen ingebouwde Node-modules, net als je eigen `server.js`. |
| Template-engine | Geen. De pagina is een HTML-bestand met eigen placeholders. |
| Statische bestanden | De module levert de stylesheet en client-JS zelf uit op `/bodemcheck/assets/`. |
| Canonical-URL | Wordt uit de `Host`-header opgebouwd, dus altijd correct. |
| Database | Niet nodig. Zonder `pool` werkt alles; aanvragen gaan dan naar je `onLead`-functie, of anders naar de log zodat ze nooit stil verdwijnen. |
| Omgevingsvariabelen | Geen. Alles heeft een werkende standaard. Ook de BRO en PDOK vragen geen sleutel. |
| Dependencies | Geen. `package.json` blijft ongewijzigd. |

De hele stylesheet is gescoped onder `.sondeertool-app` en elke klasse en elk
id begint met `sd-`, dus jouw site-CSS kan hier niet in lekken en deze CSS kan
niets van jouw site raken.

## E-mail bij een aanvraag

De installer zet dit er standaard al in, met dezelfde variabelen die je server
al gebruikt: `RESEND_API_KEY`, `QUOTE_FROM` en `QUOTE_TO`. Staat er geen
`RESEND_API_KEY`, dan komt de aanvraag in de Railway-log terecht in plaats van
stil te verdwijnen. Wil je het zelf regelen, gebruik dan `--geen-mail` en geef
je eigen `onLead` mee.

## Later: je eigen navigatie eromheen

Standaard staat er een smalle donkere balk boven de pagina met een link terug
naar de site. Wil je je echte navigatie eromheen, geef die dan als HTML mee:

```js
kop:  '<nav class="mijn-nav">…</nav>',
voet: '<footer class="mijn-voet">…</footer>',
```

Je site is een one-pager met anchors, dus dit wordt de eerste losse pagina.
Zet er ook een link naartoe in je menu en je footer — bijvoorbeeld
"Bodemcheck" naast "Configurator". Anders vindt niemand hem behalve via Google.

## Alle opties

Alleen nodig als je iets wilt afwijken. Eenmalig bij het opstarten, boven je
`http.createServer`:

```js
require('./src/sondeertool').configureer({
  pad: '/bodemcheck',
  terugLink: 'https://aanenuitbouw.nl/',
  kop: '<nav>...</nav>',     // je eigen navigatie als HTML
  voet: '<footer>...</footer>',
  onLead: async (a) => { /* vervangt de standaard Resend-mail */ },
});
```

| Optie | Standaard |
| --- | --- |
| `pad` | `/bodemcheck` |
| `titel` / `beschrijving` | ingevuld, voor `<title>` en meta description |
| `terugLink` | `/` — doel van de donkere balk boven de pagina |
| `kop` / `voet` | eigen HTML boven en onder de tool |
| `onLead` | standaard: Resend-mail via je bestaande variabelen |
| `pool` | geen — pg-pool voor logging, optioneel |

Omgevingsvariabelen, alle optioneel: `BRO_MOCK`, `BRO_CPT_BASE`,
`BRO_REGISTRATIE_VANAF`, `BRO_TIMEOUT_MS`, `SONDEER_MAX_DETAILS`,
`PDOK_LOCATIESERVER`.

## Lokaal bekijken

Vanuit je projectroot, zonder je site aan te raken:

```bash
BRO_MOCK=1 node src/sondeertool/tools/preview.js
# http://localhost:3777/bodemcheck
```

`BRO_MOCK=1` gebruikt fictieve sondeerdata, dus dit werkt ook zonder internet.
Zet die variabele **nooit** in je Railway-omgeving.

## Tests

```bash
node --test src/sondeertool/test/*.test.js
```

Dertien tests op de XML-parser, de RD-coördinaatconversie, de
grondsoortclassificatie en de funderingslogica.

## Database (optioneel)

Alleen als je opvragingen en aanvragen wilt opslaan:

```bash
psql $DATABASE_URL -f src/sondeertool/sql/001_sondeertool.sql
```

Daarna `pool` meegeven. Sla je dit over, dan werkt de tool gewoon.

## Eerste check na deploy

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://aanenuitbouw.nl/
curl -s "https://aanenuitbouw.nl/bodemcheck/api/analyse?q=1401EX%205" | head -c 400
```

De eerste regel moet `200` geven. Zie je bij de tweede `"aantalGevonden": 0`
bij een adres in bebouwd gebied, lees dan README.md onder "De enige
onzekerheid".

## Wat je niet moet doen

- `src/sondeertool/tools/preview.js` in je `start`-script zetten. Het weigert
  te starten bij `NODE_ENV=production`, maar zet het er niet in.
- `BRO_MOCK=1` in de Railway-variabelen zetten. Dan staat er fictieve
  sondeerdata op je site.
