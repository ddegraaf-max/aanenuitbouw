# Installeren

## Twee commando's

```bash
unzip sondeertool.zip -d /pad/naar/je/project
cd /pad/naar/je/project
node src/sondeertool/tools/installeer.js --domein=https://aanenuitbouw.nl
```

De installer zet de mount-regel in jouw eigen `server.js`, op de juiste plek —
vóór je catch-all `app.get('*')`, want die slokt anders alles op. Hij maakt
eerst een back-up (`server.js.backup-<datum>`), voert daarna `node --check`
uit, en zet het bestand terug als de syntax niet klopt. Ook `sitemap.xml` wordt
bijgewerkt als die bestaat.

Snapt hij je bestand niet, dan stopt hij en zegt hij welke regel je met de hand
moet plaatsen. Hij gaat nooit gokken.

Andere opties:

| | |
| --- | --- |
| `--droog` | laat zien wat er zou gebeuren, schrijft niets weg |
| `--verwijder` | haalt het blok er weer netjes uit |
| `--geen-mail` | laat de Resend-koppeling weg |
| `--pad=/grondcheck` | ander URL-pad dan `/bodemcheck` |
| `--bestand=app.js` | ander bestand dan `server.js` |

Twee keer draaien kan geen kwaad: hij ziet dat het blok er al staat en doet
niets.

## Of met de hand

Één regel in je `server.js`, vóór je 404-handler of catch-all:

```js
app.use('/bodemcheck', require('./src/sondeertool')());
```

Er komt bij het uitpakken precies één map bij: `src/sondeertool/`. Geen
`server.js`, geen `package.json`, geen `views/`, geen `public/`, geen
`README.md` in je root.

## Waarom er niets te configureren is

Deze module hangt niet aan jouw opzet:

| | |
| --- | --- |
| Template-engine | Geen. De pagina is een HTML-bestand met eigen placeholders. Of je EJS, Pug of niets gebruikt maakt niet uit. |
| `express.static` | Niet nodig. De stylesheet en client-JS worden door de router zelf uitgeleverd op `/bodemcheck/assets/`. |
| Database | Niet nodig. Zonder `pool` werkt alles; aanvragen gaan dan naar je `onLead`-functie, of anders naar de log zodat ze nooit stil verdwijnen. |
| Omgevingsvariabelen | Geen. Alles heeft een werkende standaard. Ook de BRO en PDOK vragen geen sleutel. |
| Dependencies | Geen nieuwe. Alleen `express`, dat je al hebt, plus ingebouwde Node-modules. |

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

Allemaal optioneel.

| Optie | Standaard | Doel |
| --- | --- | --- |
| `titel` | Bodemcheck-titel | `<title>` van de pagina |
| `beschrijving` | ingevuld | meta description |
| `canonical` | geen | canonical-URL, aanraden voor SEO |
| `kop` / `voet` | terugbalk / leeg | eigen HTML boven en onder |
| `terugLink` | `/` | doel van de standaard terugbalk |
| `pool` | geen | pg-pool voor logging en aanvragen |
| `onLead` | geen | async functie per aanvraag |

Omgevingsvariabelen, ook allemaal optioneel: `BRO_MOCK`, `BRO_CPT_BASE`,
`BRO_REGISTRATIE_VANAF`, `BRO_TIMEOUT_MS`, `SONDEER_MAX_DETAILS`,
`PDOK_LOCATIESERVER`. Zie README.md.

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
