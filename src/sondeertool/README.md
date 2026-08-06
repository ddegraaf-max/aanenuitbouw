# Sondeertool / Bodemcheck — aanenuitbouw.nl

Vraagt op adresniveau de openbare sonderingen op uit de **Basisregistratie
Ondergrond**, leest de grondlagen eruit en laat zien op welke diepte de
draagkrachtige laag begint. Bedoeld als gratis tool bovenaan de funnel: de
bezoeker krijgt echte informatie, en de logische volgende stap is een sondering
op zijn eigen perceel — die verkoop jij.

Geen API-sleutels, geen kosten, geen registratie bij een externe partij.

---

## De enige onzekerheid

Eén ding is niet live getest, en dat is het eerste wat je na deploy controleert.

De omgeving waarin ik dit heb gebouwd mag alleen naar npm en GitHub, dus
`publiek.broservices.nl` en `api.pdok.nl` waren niet bereikbaar. Alles is
getest tegen een gegenereerde IMBRO-XML-fixture en een mockservice; de
XML-parser, de laagclassificatie, de funderingslogica en de hele frontend zijn
daarmee doorgemeten. Wat ik **niet** live heb kunnen aftikken:

1. De exacte veldnamen in het JSON-antwoord van
   `POST /characteristics/searches`. Daarom leest `broClient.js` dat antwoord
   niet via vaste paden uit, maar loopt hij de hele boom door op zoek naar
   objecten met een `broId` dat op `CPT` begint, en vist daar de coördinaten,
   datum en einddiepte uit. Dat blijft werken als de BRO velden herbenoemt,
   maar controleer bij de eerste echte call of `aantalGevonden` niet nul is.
2. Of `registrationPeriod.beginDate` op `2017-01-01` de juiste ondergrens is.
   Die datum werkt volgens publieke voorbeeldcode; eerdere data wordt door de
   service geweigerd. Bij te weinig resultaten: zet `BRO_REGISTRATIE_VANAF`
   lager en kijk of het antwoord nog geldig is.

Eerste rooktest na deploy:

```bash
curl -s "https://aanenuitbouw.nl/bodemcheck/api/analyse?q=1401EX%205" | head -c 600
```

Zie je `"aantalGevonden": 0` bij een adres in bebouwd gebied, log dan het ruwe
antwoord (`NODE_ENV` niet op `production`, dan komt het `detail`-veld mee) en
kijk of de JSON-structuur afwijkt van wat de walk verwacht.

---

## Snel draaien

Zie **INSTALLEREN.md** voor het inhangen. Lokaal bekijken zonder de site aan te
raken, vanuit je projectroot:

```bash
BRO_MOCK=1 node src/sondeertool/tools/preview.js
# http://localhost:3777/bodemcheck
```

Zonder `BRO_MOCK` gaat hij live naar de BRO en PDOK.

```bash
node --test src/sondeertool/test/*.test.js          # 13 tests
node src/sondeertool/test/fixtures/maak-fixture.js  # fixture opnieuw genereren
```

Geen nieuwe dependencies: alleen `express` en `ejs` die je al hebt.

---

## Inbouwen

Staat in **INSTALLEREN.md**, in vijf stappen. Kort: alles zit in
`src/sondeertool/`, je maakt één pagina-view die het fragment include't, en je
zet één `app.use`-regel in je bestaande app. Er hoort niets in je projectroot
te veranderen.

## Instellingen

Alles heeft een werkende standaardwaarde; niets is verplicht.

| Variabele | Standaard | Waarvoor |
| --- | --- | --- |
| `BRO_MOCK` | uit | `1` = fictieve data. **Nooit aanzetten in productie.** |
| `BRO_CPT_BASE` | `https://publiek.broservices.nl/sr/cpt/v1` | basis-URL uitgifteservice |
| `BRO_REGISTRATIE_VANAF` | `2017-01-01` | ondergrens registratieperiode |
| `BRO_TIMEOUT_MS` | `20000` | een sondeer-XML kan enkele MB zijn |
| `SONDEER_MAX_DETAILS` | `3` | hoeveel sonderingen volledig worden uitgelezen |
| `PDOK_LOCATIESERVER` | `https://api.pdok.nl/bzk/locatieserver/search/v3_1` | adres opzoeken |
| `DATABASE_URL` | — | alleen voor logging en aanvragen |

---

## Endpoints

| Route | Doel |
| --- | --- |
| `GET /` | de pagina; `?q=1401EX5` zoekt direct |
| `GET /api/adres?q=` | adres-autocomplete via PDOK |
| `GET /api/analyse?q=` of `?lat=&lon=` | de volledige analyse |
| `GET /api/sondering/:broId` | één sondering, volledig |
| `POST /api/aanvraag` | aanvraagformulier |

Rate limiting zit erin: 20 per minuut en 120 per uur per IP. Dat is er niet om
jouw bezoekers te hinderen maar om te voorkomen dat jouw server als
scrape-proxy naar de BRO wordt gebruikt.

Caching: zoekresultaten 12 uur, opgehaalde sonderingen 30 dagen, adressen 7
dagen — in het geheugen van het proces. Een sondering uit 2019 verandert nooit
meer, dus dat mag agressief. Herstart de container en de cache is leeg; wil je
dat voorkomen, gebruik dan de tabel `sondeer_cache` uit de SQL.

---

## Hoe de interpretatie werkt

Uit de conusweerstand q<sub>c</sub> (MPa) en het wrijvingsgetal
R<sub>f</sub> = f<sub>s</sub>/q<sub>c</sub> × 100 wordt per meetpunt een
grondsoort bepaald, waarna aangrenzende punten tot lagen worden samengevoegd.

- q<sub>c</sub> wordt gefilterd met een voortschrijdende mediaan over 11
  punten, R<sub>f</sub> over 21 punten. R<sub>f</sub> is een quotiënt van twee
  metingen en dus veel ruiziger; zonder dat bredere venster flikkert de
  classificatie rond elke grenswaarde heen en weer.
- Lagen dunner dan 30 cm worden opgeslokt door hun dikste buur, herhaald tot er
  niets dun meer over is. Anders krijg je een lagenkolom met vijftig streepjes.
- **Draagkrachtig niveau:** eerste diepte waarop q<sub>c</sub> ≥ 5 MPa blijft
  over minimaal 0,5 m aaneengesloten.
- **Paalpuntniveau:** eerste diepte waarop q<sub>c</sub> ≥ 12 MPa blijft over
  minimaal 1,0 m. De eis van aaneengesloten dikte is essentieel: een schelpenbank
  van 10 cm geeft ook 20 MPa en daar kun je niet op funderen.
- Aanlegdiepte-advies is minimaal 0,80 m onder maaiveld (vorstvrij).

Drempels staan als constanten bovenaan `interpret.js`. Wil je strenger of
soepeler classificeren, dan is dat de enige plek die je aanraakt.

Dit is met opzet conservatief geformuleerd. Elke tekst die de bezoeker ziet zegt
expliciet dat het een indicatie is en dat een sondering op de bouwlocatie nodig
blijft — dat is niet alleen juridisch verstandig, het is ook precies het
argument voor jouw dienst.

---

## Vormgeving

De pagina is opgezet als geotechnisch veldrapport: warm papier met
millimeterraster voor de leescontext, een donker meetpaneel voor de
sondeerstaat, en de lagenkolom in echte grondkleuren (veen donkerbruin, klei
grijsgroen, zand oker). De q<sub>c</sub>-curve tekent zich bij het laden van
boven naar beneden op, zoals de conus de grond in gaat.

De hele stylesheet is gescoped onder `.sondeertool-app` en alle id-attributen
beginnen met `sd-`, dus deze module kan niets in de rest van je site raken en
jouw site-CSS kan niet naar binnen lekken. Er zit ook een defensieve reset in
voor knoppen, inputs, lijsten en tabellen; dat is getest tegen een stylesheet
die met `!important` alle knoppen roze maakt.

Fonts: Archivo voor tekst en koppen, IBM Plex Mono voor alle meetwaarden.
Alle kleuren staan als variabelen in het eerste blok van `sondeertool.css`. Wil je
dit in de huisstijl van aanenuitbouw.nl trekken, dan hoef je alleen die tien
regels aan te passen — verderop in het bestand staat geen enkele losse kleur.

De kaartweergave laadt Leaflet en de PDOK BRT-achtergrondkaart pas als iemand
op de knop drukt, en valt terug op de SVG-situatieschets als dat mislukt. Geen
Google Maps, dus geen cookiebanner-discussie.

---

## Wat dit niet is

- Geen funderingsadvies. De disclaimer in de voet is er niet voor de sier.
- De dichtstbijzijnde sondering kan honderden meters weg liggen. De tool zegt
  zelf hoe betrouwbaar het beeld is (`betrouwbaarheid.niveau`: redelijk /
  indicatief / zwak) op basis van afstand en de spreiding tussen metingen.
- Sonderingen van vóór de BRO staan grotendeels in DINOloket en zijn niet
  allemaal via deze REST-service opvraagbaar. In oudere wijken kan het beeld
  dus dunner zijn dan in een nieuwbouwwijk.
- De fundering van de bestaande woning zit hier niet in, en juist het verschil
  tussen oud en nieuw veroorzaakt scheuren. Dat staat ook zo in het advies.

## Uitbreidingen die logisch volgen

- **Grondwaterstand** erbij: `publiek.broservices.nl/gm/gld/v1` is even openbaar.
  Voor een aanbouw met kruipruimte of verdiepte vloer is dat minstens zo relevant
  als de draagkracht.
- **Bodemdaling** via bodemdalingskaart.nl (InSAR, open) — sterk verhaal in
  West-Nederland.
- **PDF-uitdraai** van de bodemcheck, met jouw logo, per e-mail. Dat is de
  natuurlijke leadmagnet: e-mailadres in ruil voor het rapport.
- **Landingspagina's per plaats** (`/bodemcheck/gouda`), voorgevuld met de
  regionale bodemopbouw. Dat is precies de zoekvraag "kan ik hier op staal
  funderen" en die is nu nauwelijks bezet.

---

Bronvermelding hoort op de pagina te blijven staan: sondeergegevens uit de
Basisregistratie Ondergrond (BZK / TNO Geologische Dienst Nederland),
adresgegevens uit de PDOK Locatieserver. Beide zijn open data, maar netjes
attribueren kost niets.
