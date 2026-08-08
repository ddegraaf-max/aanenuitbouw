# Antispam en overbelasting

Wat er in de code zit, wat Cloudflare erbij moet doen, en waarom die twee elkaar
niet vervangen.

## De kern van het probleem

Alle begrenzingen in deze site werkten tot nu toe **per IP-adres**. Dat helpt
tegen één vervelende bezoeker. Het helpt niet tegen wat er bij echt misbruik
gebeurt: verkeer van honderden adressen. Een botnet, een mobiel netwerk met
wisselende IP's of een lijst open proxy's loopt langs elke per-IP-limiet heen
zonder er één keer tegenaan te lopen.

Daarom is er nu een tweede laag die niet naar het IP kijkt.

---

## Laag 1 — in de code, nu ingebouwd

### De offerteaanvraag

| Slot | Waarde | Waartegen |
|---|---|---|
| Per IP | 6 per uur | één vervelende bezoeker |
| **Globaal** | 40 per uur over alle bezoekers | verspreid misbruik |
| **Per dag** | 120 e-mails | je verzendreputatie bij Resend |
| Valstrik | onzichtbaar veld | formulierbots |
| **Tijdslot** | minimaal 3 seconden invultijd | formulierbots |
| Body | maximaal 14 MB | opblazen met fotobijlagen |

Dat dagmaximum is het belangrijkste slot dat je niet ziet. Een aanval op je
formulier kost je geen server — die overleeft het makkelijk — maar hij verbrandt
je Resend-quotum en beschadigt de reputatie van je verzenddomein bij de
ontvangende mailservers. Die reputatie is niet terug te kopen. Bij 120 aanvragen
op één dag is er iets aan de hand; een echte dag komt niet in de buurt.

Valstrik en tijdslot antwoorden bij afwijzing met **hetzelfde succesbericht** als
een echte aanvraag. Een bot mag niet leren waaróp hij faalt.

### De twee tools

Elke bodemcheck haalt twee sondeer-XML's van circa 300 kB bij de BRO. Elke
woningcheck bevraagt vier diensten. Verspreid misbruik zou ons daar de toegang
kosten, en dan werkt de tool voor niemand meer — dat is de echte schade, niet je
serverlast.

| Slot | Bodemcheck | Woningcheck |
|---|---|---|
| Per IP | 20/min, 120/uur | 25/min, 150/uur |
| **Globaal per uur** | 240 | 300 |
| **Gelijktijdig** | 4 | 5 |

De gelijktijdigheidspoort laat een verzoek 3,5 seconde wachten als het vol is en
weigert daarna met een 503. Bij een korte piek van drie bezoekers is even wachten
prettiger dan een foutmelding; bij echte overbelasting groeit de wachtrij niet
oneindig.

Alle waarden zijn te wijzigen met omgevingsvariabelen zonder de code aan te
raken: `QUOTE_MAX_PER_UUR`, `QUOTE_MAX_PER_DAG`, `QUOTE_MIN_INVULTIJD_MS`,
`SONDEERTOOL_MAX_PER_UUR`, `SONDEERTOOL_GELIJKTIJDIG`,
`WONINGCHECK_MAX_PER_UUR`, `WONINGCHECK_GELIJKTIJDIG`.

### Wat de code níet kan

De tellers staan in het geheugen van het proces. Bij een herstart zijn ze weg, en
met twee instances gelden ze per instance. Belangrijker: elk verzoek dat je
weigert, heeft je server al bereikt. Bij een echte overbelastingsaanval sta je
dan nog steeds bandbreedte en rekentijd te verbranden aan het weigeren zelf.

Dáár is Cloudflare voor. Niet als vervanging van het bovenstaande, maar als de
laag die het verkeer stopt vóórdat het bij jou aankomt.

---

## Laag 2 — Cloudflare, in te stellen

Je verkeer loopt al via Cloudflare. Vier dingen aanzetten, in deze volgorde van
opbrengst.

### 1. Turnstile op het offerteformulier — begin hier

Gratis, onbeperkt, en voor vrijwel elke bezoeker onzichtbaar. Geen cookiebanner
nodig, in tegenstelling tot reCAPTCHA. Dit is het enige slot dat een
gemotiveerde spammer niet omzeilt.

De code is er al op voorbereid en doet niets zolang je de sleutels niet zet:

1. Cloudflare dashboard → **Turnstile** → Add widget
2. Domein `aanenuitbouw.nl`, widgetmode **Managed**
3. Zet in Railway twee variabelen:

   ```
   TURNSTILE_SITEKEY = 0x4AAA...      (de publieke, mag in de pagina)
   TURNSTILE_SECRET  = 0x4AAA...      (de geheime, alleen in Railway)
   ```

4. Klaar. Het formulier haalt de sitekey op bij `/api/publieke-config`, laadt de
   widget en stuurt het token mee. De server verifieert bij Cloudflare.

Controleer daarna `/api/health`: daar staat `"turnstile": "actief"`.

Is Cloudflare onbereikbaar op het moment van verifiëren, dan laat de server de
aanvraag **door** in plaats van te weigeren. Liever een enkele spammail dan een
echte klant kwijt; de andere sloten staan dan nog overeind.

### 2. Rate limiting rules

Op het gratis plan krijg je één regel. Zet die op het formulier, want dat is waar
mail en dus geld achter zit:

* Rules → **Rate limiting rules** → Create rule
* Als: `URI Path equals /api/quote` en `Request Method equals POST`
* Dan: 5 requests per 10 minutes per IP → **Block**, 1 uur

Heb je Pro, maak er drie van en zet er ook op:

* `URI Path starts with /bodemcheck/api/` → 30 per minuut
* `URI Path starts with /woningcheck/api/` → 30 per minuut

Dit doet grotendeels hetzelfde als mijn per-IP-limieten, maar het gebeurt vóór
jouw server. Dat is precies het verschil dat telt bij volume.

### 3. Cache rules — het meest onderschatte slot

Dit beschermt tegen platgooien met gewone paginaverzoeken. Je `serveStatic` leest
bij elk verzoek van schijf; Cloudflare kan dat volledig overnemen.

* Rules → **Cache Rules** → Create rule
* **Cachen, agressief:** als `URI Path starts with /img/` of `/projecten/` of
  `/documenten/` → Cache eligible, Edge TTL 1 maand
* **Nooit cachen:** als `URI Path starts with /api/` → Bypass cache
* **Nooit cachen:** als `URI Path starts with /bodemcheck` of `/woningcheck` →
  Bypass cache

Die laatste is belangrijk. De pagina's van de tools sturen zelf `no-store`, maar
een expliciete regel voorkomt dat een verkeerde instelling ooit een oude pagina
gaat uitleveren — en dat is precies het probleem dat je vannacht uren heeft
gekost.

**Cache `/` en `configurator.html` niet.** Verleidelijk, maar dan zie je
prijswijzigingen en beschikbaarheid niet meer terug, en het versiestempel in de
footer klopt dan niet meer met de server.

### 4. Bot Fight Mode — met een waarschuwing

Security → Bots → **Bot Fight Mode** aan.

Let op: deze stand kan ook `fetch`-verzoeken van je eigen pagina's een uitdaging
voorschotelen die JavaScript niet kan oplossen. Dan blijft de bodemcheck of de
woningcheck hangen — hetzelfde beeld als het probleem dat we vannacht hebben
opgelost. Zet hem aan, doe daarna direct een zoekopdracht in beide tools, en kijk
in `/bodemcheck/api/klantlog?sleutel=…` of daar `zoeken-start` zonder `antwoord`
in staat. Is dat zo, zet hem weer uit of maak een uitzondering voor `/api/`.

### Bij een aanval, één schakelaar

Overview → **Under Attack Mode**. Elke bezoeker krijgt vijf seconden een
controlepagina. Dat is hinderlijk voor klanten, dus alleen bij echte narigheid en
daarna weer uit.

---

## Wat je waar ziet als iets misgaat

| Waar | Wat |
|---|---|
| Railway-log | `[poort] ... globale limiet bereikt` of `dagmaximum bereikt` |
| Railway-log | `Aanvraag geweigerd door de valstrik` / `formulier na N ms verstuurd` |
| `/api/health` | of Turnstile actief is |
| `/bodemcheck/api/klantlog?sleutel=…` | wat er in de browser van een bezoeker gebeurde |
| Cloudflare → Security → Events | wat Cloudflare heeft geblokkeerd en waarom |

## Wat ik niet heb kunnen testen

Turnstile zelf. Mijn omgeving mag niet naar `challenges.cloudflare.com`, dus de
verificatiestap is getest met de sleutels leeg (dan wordt hij overgeslagen, zoals
bedoeld) en met een ongeldig token (dan volgt een afwijzing). De echte
verificatie bij Cloudflare moet je één keer met een echte aanvraag controleren:
vul het formulier in en kijk of de mail aankomt en of `/api/health` `actief`
meldt.
