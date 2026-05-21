# Projectfoto's toevoegen ("Recent werk")

De site heeft een complete projectensectie die **nu verborgen is**. Zodra je foto's van afgeronde projecten hebt, zet je 'm in een paar minuten aan. Hieronder precies hoe.

## Wat je nodig hebt

- Foto's van afgeronde projecten (1 of meer)
- Het liefst liggend, ongeveer 4:3 verhouding (bijv. 1200 × 900 pixels)
- JPG of WebP formaat (WebP is kleiner = sneller laden)

## Stap 1 — Foto's in de repo zetten

1. Maak naast `configurator.html` een map aan met de naam `projecten`
2. Zet je foto's daarin, bijvoorbeeld:
   ```
   projecten/uitbouw-amsterdam.jpg
   projecten/aanbouw-keuken-utrecht.jpg
   projecten/uitbouw-lichtkoepel.jpg
   ```
3. Upload deze map mee naar GitHub (sleep 'm in de repo, net als de andere bestanden)

> De server serveert deze foto's automatisch — je hoeft niets aan `server.js` te wijzigen.

## Stap 2 — De kaarten invullen

Open `configurator.html` en zoek op `id="werk"` (rond regel 1945). Je ziet daar drie voorbeeldkaarten. Per kaart pas je drie dingen aan:

```html
<article class="werk-card">
  <img class="werk-card-img" src="projecten/JOUW-FOTO.jpg" alt="Korte beschrijving">
  <div class="werk-card-body">
    <span class="werk-card-tag">Uitbouw</span>          <!-- of: Aanbouw -->
    <h3 class="werk-card-title">Titel van het project</h3>
    <p class="werk-card-desc">Korte omschrijving — locatie, oppervlak, bijzonderheden.</p>
  </div>
</article>
```

- **`src="projecten/JOUW-FOTO.jpg"`** → de bestandsnaam van jouw foto
- **`<span class="werk-card-tag">`** → het labeltje (bijv. Uitbouw, Aanbouw, Afwerking)
- **`<h3 class="werk-card-title">`** → de projecttitel
- **`<p class="werk-card-desc">`** → een zin of twee uitleg

### Meer of minder kaarten?

- **Meer projecten:** kopieer een heel `<article class="werk-card">...</article>` blok en plak het eronder. Het grid schikt zich automatisch (3 per rij op desktop, 2 op tablet, 1 op mobiel).
- **Minder projecten:** verwijder een heel `<article>...</article>` blok. Werkt prima met 1, 2 of 3+ kaarten.

## Stap 3 — De sectie zichtbaar maken

Zoek bovenaan het `<script>`-gedeelte (rond regel 2231) naar deze regel:

```javascript
const SHOW_WERK = false;
```

Verander `false` in `true`:

```javascript
const SHOW_WERK = true;
```

Dat is alles. Dit toont in één keer:
- de "Recent werk"-sectie op de pagina
- de "Werk"-link in het hoofdmenu
- de "Recent werk"-link in de footer

## Stap 4 — Uploaden en klaar

1. Upload de gewijzigde `configurator.html` én de map `projecten/` naar GitHub
2. Railway deployt automatisch (~1 minuut)
3. De projectensectie staat live

## Even terug naar verborgen?

Zet `SHOW_WERK` weer op `false` en upload opnieuw. De sectie verdwijnt dan netjes, foto's en teksten blijven in de code staan voor later.
