# Quick start — deployment in 10 minuten

Volledige uitleg met troubleshooting staat in **README.md**. Dit is de snelste route.

## 1. Pak de ZIP uit

Je hebt twee opties gekregen:

- **`aanenuitbouw-site.zip`** — inclusief Git-historie, voor als je via Git push wilt deployen
- **`aanenuitbouw-site-files-only.zip`** — alleen de bestanden, voor drag-and-drop upload (kleiner, simpeler)

Pak één van de twee uit. De inhoud:

```
configurator.html   ← de hele site (één bestand)
server.js           ← mini Node-server (~150 regels, geen dependencies)
package.json        ← Node-project definitie
README.md           ← volledige instructies
.gitignore          ← voor schone Git-repo
```

## 2. GitHub repo aanmaken

1. Ga naar https://github.com/new
2. Repository name: `aanenuitbouw-site`
3. Kies **Private** (Railway leest ook private repos)
4. **Niet** "Initialize with README" aanvinken (we hebben er al een)
5. **Create repository**

## 3. Bestanden uploaden naar GitHub

Op de lege repo-pagina staat een link **"uploading an existing file"** — klik die. Sleep de vijf bestanden uit de uitgepakte ZIP naar het upload-vlak. Onderaan: commit message `Initial deploy` → **Commit changes**.

## 4. Railway-project aanmaken

1. https://railway.com → **New Project** → **Deploy from GitHub repo**
2. Geef Railway toegang (eerste keer) en selecteer `aanenuitbouw-site`
3. Railway start automatisch de eerste build — wacht ~1 minuut

## 5. Volume toevoegen (kritiek!)

Zonder deze stap verdwijnen je prijzen bij elke deploy.

1. Klik in het project op de service-tile
2. Klik rechts op de service in de canvas → **Attach Volume**
3. Mount path: `/data`
4. Size: 0.5GB volstaat ruim
5. **Add**

## 6. Admin-wachtwoord instellen

1. Service → tab **Variables** → **+ New Variable**
2. Name: `ADMIN_PASSWORD`
3. Value: kies een sterk wachtwoord (≥12 tekens)
4. **Add** — service deployt automatisch opnieuw

## 6b. E-mailverzending instellen (Resend)

Zonder dit kan het contactformulier geen offertes versturen.

1. Maak een gratis account op https://resend.com
2. **API Keys** → **Create API Key** → kopieer de key (begint met `re_`)
3. Terug in Railway → service → **Variables**, voeg drie variabelen toe:
   - `RESEND_API_KEY` = de key die je net kopieerde
   - `QUOTE_TO` = het e-mailadres waar offertes heen moeten (bijv. `info@aanenuitbouw.nl`)
   - `QUOTE_FROM` = afzender (zie hieronder)
4. **Belangrijk over `QUOTE_FROM`:**
   - **Snel testen:** gebruik `onboarding@resend.dev` als value. Werkt direct, maar mails komen alleen aan op het e-mailadres waarmee je je Resend-account hebt aangemaakt.
   - **Productie:** verifieer je eigen domein in Resend (**Domains** → **Add Domain** → `aanenuitbouw.nl`, volg de DNS-stappen). Daarna kun je `QUOTE_FROM` zetten op bijv. `Offerte <offerte@aanenuitbouw.nl>` en komen mails overal aan.

## 6c. Beheer extra beveiligen met een authenticator (aanbevolen)

Naast het wachtwoord kun je een authenticator-app verplicht maken (Google Authenticator, Microsoft Authenticator, Authy, 1Password). Inloggen vraagt dan ook de 6-cijferige code die elke 30 seconden verandert — wie je wachtwoord raadt of onderschept, komt er niet in.

1. Log in op het beheer → tab **Beveiliging** → **Authenticator koppelen**
2. Scan de QR-code met de app (of typ het geheim over) en vul de code in die de app toont
3. **Bewaar de acht back-upcodes** die je daarna ziet, bijvoorbeeld in je wachtwoordmanager. Elke code werkt één keer, voor als je telefoon niet bij de hand is.

Het geheim en de (gehashte) back-upcodes staan in `/data/beheer.json` op het volume. Na inloggen krijgt de browser een sessietoken dat 12 uur geldig is; het wachtwoord zelf blijft niet meer in de browser staan.

**Telefoon kwijt én geen back-upcodes meer?**

1. Railway → service → **Variables** → voeg `ADMIN_TOTP_UIT` = `1` toe (de service herstart; de authenticator staat nu tijdelijk uit)
2. Log in met alleen het wachtwoord → **Beveiliging** → **Oude koppeling verwijderen**
3. Verwijder `ADMIN_TOTP_UIT` weer in Railway en koppel opnieuw met je nieuwe telefoon

Wil je het geheim liever niet op het volume maar als variabele? Zet dan `ADMIN_TOTP_SECRET` (32 tekens base32) in Railway; het beheerpaneel toont dan de status maar beheert de koppeling niet.

## 7. Test de site

1. Settings → **Networking** → **Generate Domain**
2. Bezoek de `.up.railway.app` URL
3. Footer → ⚙ **Beheer** klikken → log in met je `ADMIN_PASSWORD`
4. Wijzig een prijs (bijv. Casco €2500 → €2600), klik **Opslaan**
5. Ververs de pagina — de Plannen-card moet nu €2.600 tonen
6. Open een privé/incognito venster → de wijziging is daar óók zichtbaar (dat is het bewijs dat het server-side werkt)
7. **Test het formulier:** ga naar de configurator, doorloop de stappen, vul bij stap 8 je gegevens in en klik **Verstuur aanvraag**. Check of de mail aankomt op je `QUOTE_TO`-adres.

## 8. Domein koppelen

1. Settings → **Networking** → **Custom Domain**
2. Voeg toe: `aanenuitbouw.nl` en `www.aanenuitbouw.nl`
3. Railway toont DNS-records — voeg die toe bij je registrar (TransIP, Versio, etc.)
4. Wacht 5-30 min op DNS-propagatie
5. SSL wordt automatisch geregeld

## Klaar 🎉

Vanaf nu kun je vanaf elke device met internet inloggen op het beheer-paneel en prijzen wijzigen voor alle bezoekers tegelijk.

## Problemen?

Zie het **Troubleshooting**-blok onderaan **README.md**. De handigste test: bezoek `https://jouwsite.up.railway.app/api/health` — die toont of `ADMIN_PASSWORD` en het volume goed staan.
