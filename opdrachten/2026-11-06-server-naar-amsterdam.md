# Opdracht: de server van AanEnUitbouw.nl naar Amsterdam

**Gevonden:** 6 november 2026, bij de uitrol op Railway.
**Eerst een besluit van Daniël.**

De service `aanenuitbouw` draait in `us-west2` (Oregon). Offerteaanvragen met naam, adres en telefoonnummer van Nederlandse klanten staan dus in Amerika. In Railway: service → Settings → Region → `europe-west4` (Amsterdam).

Controleer eerst of er gegevens op een volume staan (`DATA_DIR`: offertes, planning, projecten). Is dat zo, maak dan een kopie vóór het verhuizen, want een volume verhuist niet altijd mee. Leg Daniël voor wanneer het gebeurt.
