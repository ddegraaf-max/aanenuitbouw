# LEESMIJ — SEO-pakket aanenuitbouw.nl

Dit pakket bevat vier onderdelen. Hieronder staat per onderdeel waar het geplaatst of geplakt moet worden.

## 1. robots.txt

Plaats `robots.txt` in de **public/static-map** van het Node/Express-project, zodat het bestand bereikbaar is op:

```
https://aanenuitbouw.nl/robots.txt
```

Wordt de map met `express.static()` geserveerd, dan is verder niets nodig. Anders kun je een route toevoegen:

```js
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, 'robots.txt')));
```

## 2. sitemap.xml

Plaats `sitemap.xml` op dezelfde manier in de public/static-map, bereikbaar op:

```
https://aanenuitbouw.nl/sitemap.xml
```

Daarna aanmelden in Google Search Console (Sitemaps → sitemap.xml toevoegen).

## 3. snippets.html — vier blokken, vier plekken

Open `snippets.html`. Daarin staan vier duidelijk gemarkeerde blokken:

| Blok | Wat | Waar plakken |
|------|-----|--------------|
| 1 | FAQ-sectie (HTML, `<details>`/`<summary>`) | In het bestand **configurator**, op de gewenste plek in de pagina (bijv. onder de configurator, boven de footer) |
| 2 | FAQPage JSON-LD (`<script type="application/ld+json">`) | In de **`<head>`** van de pagina |
| 3 | Accordeon-CSS | Bij de bestaande **styles** (in het stylesheet of het bestaande `<style>`-blok) — de omliggende `<style>`-tags weglaten als je in een .css-bestand plakt |
| 4 | og:image-metatags | In de **`<head>`**, bij de andere og:-tags |

## 4. og-image

De og:image-tags verwijzen naar:

```
https://aanenuitbouw.nl/img/og-image.png
```

Zorg dat op die locatie een afbeelding van **1200 × 630 px** staat (PNG). De `og:image:width`- en `og:image:height`-tags zorgen ervoor dat WhatsApp de preview meteen goed toont, ook bij de eerste keer delen.

Tip: na het deployen de preview verversen via de Facebook Sharing Debugger (developers.facebook.com/tools/debug) — die cache gebruikt WhatsApp ook.

## Controle na deploy

1. `https://aanenuitbouw.nl/robots.txt` openen → inhoud klopt
2. `https://aanenuitbouw.nl/sitemap.xml` openen → geldige XML
3. FAQ-accordeon testen (open/dicht klikken)
4. JSON-LD valideren via search.google.com/test/rich-results
5. Link delen via WhatsApp → afbeelding verschijnt
