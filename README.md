# AanEnUitbouw.nl — Deployment naar Railway

Productieklare site met **centraal prijsbeheer**: één admin past de prijzen aan, alle bezoekers zien direct de nieuwe waardes.

## Architectuur in het kort

- **Node-server** (`server.js`, geen externe dependencies) serveert `configurator.html` op de root-URL
- **API-endpoints** voor prijsbeheer: `GET /api/prices` (publiek), `POST /api/prices` (auth-required)
- **Persistente opslag** in een Railway Volume — prijzen blijven staan tussen deploys en restarts
- **Admin authenticatie** via een `ADMIN_PASSWORD` environment variable

## Vereisten

- **GitHub-account** (https://github.com)
- **Railway-account** met Hobby plan (~€5/mnd inclusief Volume) — https://railway.com
- DNS-toegang tot **aanenuitbouw.nl** bij je domeinregistrar

## Stap 1 — GitHub-repo aanmaken

1. Log in op https://github.com en klik rechtsboven op `+` → `New repository`
2. Naam: `aanenuitbouw-site`
3. **Private** is prima — Railway leest ook private repos
4. Klik **Create repository**

## Stap 2 — Bestanden uploaden naar GitHub

Klik op je nieuwe repo-pagina op **uploading an existing file** en sleep alle vier de bestanden uit deze map naar het upload-vlak:

- `configurator.html`
- `server.js`
- `package.json`
- `.gitignore`

Commit met `Initial deploy`.

## Stap 3 — Railway-project aanmaken

1. Ga naar https://railway.com en log in
2. **New Project** → **Deploy from GitHub repo**
3. Geef Railway toegang tot de repo en selecteer `aanenuitbouw-site`
4. Railway detecteert het Node-project en start de eerste build (~1 minuut)

## Stap 4 — Volume toevoegen voor prijsopslag

Dit is **essentieel** — zonder volume verdwijnen je prijswijzigingen bij elke deploy.

1. Klik in het Railway-project op de service-tile
2. Rechts klikken op de service → **Attach Volume**
3. Mount path: `/data`
4. Size: standaard 0.5GB is genoeg (prijsbestand is ~1KB)
5. Klik **Add**

Railway start de service opnieuw met het volume gemount.

## Stap 5 — Admin-wachtwoord instellen

1. Bij de service → tab **Variables**
2. Klik **+ New Variable**
3. Name: `ADMIN_PASSWORD`
4. Value: kies een sterk wachtwoord (minimaal 12 tekens, mix van letters/cijfers)
5. Klik **Add**

De service deployt automatisch opnieuw met de nieuwe variabele.

> ⚠️ **Bewaar dit wachtwoord goed.** Wil je het later wijzigen? Ga terug naar Variables, pas `ADMIN_PASSWORD` aan, en de service deployt automatisch opnieuw.

## Stap 5b — E-mailverzending instellen (Resend)

Het contactformulier verstuurt offerte-aanvragen via Resend. De API-key staat veilig server-side (nooit in de HTML, zodat niemand 'm kan stelen).

### Resend-account en key

1. Maak een gratis account op https://resend.com (gratis tier: 3.000 mails/maand, 100/dag — ruim voldoende)
2. Ga naar **API Keys** → **Create API Key**
3. Geef 'm een naam (bijv. "AanEnUitbouw productie"), kies **Sending access**
4. Kopieer de key — die begint met `re_...` (je ziet 'm maar één keer!)

### Variabelen in Railway

Bij de service → **Variables**, voeg deze drie toe:

| Variable | Waarde | Toelichting |
|---|---|---|
| `RESEND_API_KEY` | `re_...` | De key die je net kopieerde |
| `QUOTE_TO` | `info@aanenuitbouw.nl` | Waar offerte-aanvragen heen gemaild worden |
| `QUOTE_FROM` | zie hieronder | Het afzenderadres |

### Over `QUOTE_FROM` — twee opties

**Optie A — direct testen (geen domein-setup nodig):**
Zet `QUOTE_FROM` op `AanEnUitbouw.nl <onboarding@resend.dev>`. Dit werkt meteen, maar Resend levert in deze testmodus alleen af op het e-mailadres waarmee je je Resend-account hebt aangemaakt. Prima om te testen, niet voor productie.

**Optie B — productie (eigen domein, aanbevolen):**
1. In Resend: **Domains** → **Add Domain** → voer `aanenuitbouw.nl` in
2. Resend toont een aantal DNS-records (SPF, DKIM) — voeg die toe bij je domeinregistrar
3. Wacht tot Resend het domein als "Verified" toont (meestal < 30 min)
4. Zet dan `QUOTE_FROM` op bijv. `Offerte AanEnUitbouw <offerte@aanenuitbouw.nl>`
5. Nu komen mails bij iedereen aan, niet meer beperkt tot je eigen adres

> 💡 **Tip:** de interne mail gebruikt `reply_to` met het adres van de klant. Klik je in je mailprogramma op "Beantwoorden", dan mail je direct terug naar de klant — handig.

### Twee mails per aanvraag

Bij elke aanvraag worden twee e-mails verstuurd:

1. **Naar jou** (`QUOTE_TO`) — de offerte-aanvraag met alle contactgegevens en de volledige configuratie. Reply-to staat op de klant.
2. **Naar de klant** — een nette bevestiging dat de aanvraag is ontvangen, met een overzicht van hun configuratie en jullie contactgegevens. Reply-to staat op `QUOTE_TO`.

De klant-bevestiging is "best-effort": mocht die om wat voor reden niet verstuurd kunnen worden, dan komt de aanvraag alsnog bij jou binnen (je verliest dus nooit een lead door een mailprobleem). Beide mails gebruiken hetzelfde geverifieerde `QUOTE_FROM`-adres.

## Stap 6 — Site zichtbaar maken

1. **Settings** → **Networking** → **Public Networking**
2. Klik **Generate Domain**
3. Bezoek de gegenereerde `.up.railway.app` URL — de site moet werken
4. Test het beheer-paneel: scroll naar de footer, klik het ⚙ **Beheer**-icoon, log in met je `ADMIN_PASSWORD`
5. Test het formulier: doorloop de configurator en verstuur een testaanvraag — check of de mail aankomt

## Stap 7 — Eigen domein aanenuitbouw.nl koppelen

1. **Settings** → **Networking** → **Custom Domain**
2. Voeg toe: `aanenuitbouw.nl` (apex) en `www.aanenuitbouw.nl`
3. Railway toont per domein de DNS-records die je moet aanmaken bij je registrar
4. Bij je domeinregistrar (TransIP, Versio, Hostnet, GoDaddy, ...): voeg de records toe zoals Railway aangeeft
   - Voor `www`: meestal een **CNAME** naar `xxx.up.railway.app`
   - Voor het apex-domein (`aanenuitbouw.nl` zelf): een **A-record** naar het IP-adres dat Railway noemt, óf ALIAS/ANAME als je registrar dat ondersteunt
5. Wacht 5–30 minuten voor DNS-propagatie. SSL-certificaten worden automatisch aangevraagd.
6. Test https://aanenuitbouw.nl en https://www.aanenuitbouw.nl

## Hoe werkt het prijsbeheer?

### Voor jou (de admin)

1. Bezoek je site, klik in de footer op het ⚙ **Beheer**-icoon
2. Log in met je `ADMIN_PASSWORD`
3. Wijzig prijzen in de 12 secties (plannen, daktypes, pui, gevel, electra, etc.)
4. Klik **Opslaan** — de wijzigingen worden direct opgeslagen op de Railway-server in `/data/prices.json`

### Voor bezoekers

Iedereen die de site opent ziet de nieuwste prijzen — direct, zonder dat zij hun browser hoeven te verversen of cookies te accepteren. Het werkt zo:

1. Bezoeker laadt de pagina
2. JavaScript haalt `GET /api/prices` op van de server
3. De server leest `prices.json` uit het volume
4. De configurator gebruikt deze waardes voor alle berekeningen

### Eerste deploy (geen prijzen.json nog)

Bij de allereerste keer staat er nog geen `prices.json` op het volume. Dan vallen bezoekers terug op de standaard-prijzen die in `configurator.html` zelf staan ingebakken (`DEFAULT_PRICES`). Zodra jij de eerste keer **Opslaan** klikt in het beheer-paneel, wordt het bestand aangemaakt en zien alle bezoekers vanaf dan jouw waardes.

## Updates van de site na de eerste deploy

Code-wijzigingen (nieuwe features, tekst, design):

1. Pas `configurator.html` aan
2. Upload de nieuwe versie naar GitHub (overschrijf het oude bestand)
3. Railway detecteert de wijziging en deployt automatisch (~1 min)
4. De prijzen op het volume blijven gewoon staan — alleen de code-bestanden worden vervangen

## Backups van de prijzen

Vanuit het beheer-paneel:

- **Export** download een `aeu-prijzen-YYYY-MM-DD.json` met de huidige prijzen
- **Import** laadt zo'n bestand weer in en publiceert het op de server

Aanrader: maak na elke grote prijswijziging een export en bewaar 'm in je email/cloud.

## Kostenverwachting

| Onderdeel | Kosten/maand |
|---|---|
| Hobby plan | $5 (~€4,60) |
| Inclusief gebruik | $5 (compute + volume) |
| Verwacht verbruik (statische site, ~1KB volume) | < $2 |
| **Effectieve maandlast** | **~€5/mnd vast** |

Als het verbruik onder de inclusieve $5 blijft, betaal je alleen het abonnement. HTTPS, custom domain, automatische deploys: allemaal inbegrepen.

## Troubleshooting

**Inloggen lukt niet ("Onjuist wachtwoord")**
- Check `Variables` in Railway dashboard — staat `ADMIN_PASSWORD` daar correct ingesteld?
- Na wijzigen van de variabele: heeft de service opnieuw gedeployt? (Settings → Deployments → check de timestamp)

**Prijzen worden niet opgeslagen ("Opslaan mislukt")**
- Check of het volume gemount is op `/data` (Settings → service → Volumes)
- Check de logs: Settings → service → Deployments → klik laatste deploy → View Logs
- Test `GET /api/health` in je browser: `https://jouwsite.up.railway.app/api/health` — die toont `dataDirExists` en `hasAdminPassword`

**Wijzigingen verdwijnen na een deploy**
- Volume niet correct gemount, of mount path is niet `/data`. Verwijder en koppel volume opnieuw met mount path `/data`.

**Site geeft 502 of crasht**
- Check de deploy-logs op Railway. Meestal een Node-error of port mismatch — server.js gebruikt `process.env.PORT` dus dat zou moeten werken.

**Formulier verstuurt niet ("E-mailverzending is niet geconfigureerd")**
- `RESEND_API_KEY` ontbreekt in Variables. Voeg toe en wacht op de re-deploy.

**Formulier zegt "verzonden" maar er komt geen mail**
- Gebruik je `onboarding@resend.dev` als afzender? Dan komt de mail alleen aan op je eigen Resend-account-adres. Verifieer je domein voor productie (zie stap 5b, optie B).
- Check de Resend dashboard → **Logs** — daar zie je of de mail is geaccepteerd, gebounced, of geweigerd.
- Check `https://jouwsite.up.railway.app/api/health` → `hasResendKey` moet `true` zijn.
- Kijk in spam/ongewenst van het ontvangende adres.

## Goedkopere alternatief overwogen?

Voor een puur statische versie (zonder server-side prijsbeheer) zou Cloudflare Pages of Netlify gratis zijn. Maar omdat je centraal prijsbeheer nodig hebt heb je een server nodig — Railway is dan een goede keuze.

Alternatieven met server-side support:
- **Render** ($7/mnd voor de smallest web service tier, ook met persistent disk)
- **Fly.io** (vergelijkbaar met Railway, soms iets goedkoper voor kleine workloads)
- **DigitalOcean App Platform** ($5/mnd voor basic + extra voor disk)

Allemaal vergelijkbaar in prijs en functionaliteit. Voor jouw use case is Railway prima.
