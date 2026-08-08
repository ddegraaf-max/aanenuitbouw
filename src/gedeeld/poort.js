'use strict';

/**
 * Poortwachters die NIET per IP werken.
 *
 * Waarom dit bestaat: alle begrenzingen in deze site waren tot nu toe per IP.
 * Dat helpt tegen één vervelende bezoeker, maar niet tegen wat er in de praktijk
 * gebeurt bij misbruik: verkeer van honderden verschillende adressen. Een
 * botnet, een mobiel netwerk met wisselende IP's of een lijst open proxy's loopt
 * langs elke per-IP-limiet heen zonder er één keer tegenaan te lopen.
 *
 * Drie soorten bescherming, elk voor een ander soort schade:
 *
 *   globaleLimiet      begrenst het TOTAAL over alle bezoekers. Beschermt tegen
 *                      verspreide misbruik.
 *   poort              begrenst hoeveel verzoeken er GELIJKTIJDIG een externe
 *                      dienst mogen aanroepen. Beschermt de BRO en PDOK -- en
 *                      daarmee ons eigen recht om ze te gebruiken.
 *   dagteller          begrenst iets per kalenderdag. Gebruikt voor e-mail: een
 *                      overschrijding kost geen server maar de reputatie van je
 *                      verzenddomein, en dat is veel duurder.
 *
 * Alles in het geheugen van het proces. Bij een herstart is het weg, en met
 * meerdere instances geldt het per instance. Dat is bewust: een gedeelde teller
 * vraagt een database of Redis, en die complexiteit is hier de winst niet waard.
 * Waar het echt om verspreide aanvallen gaat, doet Cloudflare het beter dan wij
 * ooit kunnen -- zie ANTISPAM.md.
 */

/**
 * Totaalteller over alle bezoekers samen.
 * @param {object} opties
 * @param {number} opties.max     maximum binnen het venster
 * @param {number} opties.vensterMs
 * @param {string} opties.naam    voor de logregel
 */
function globaleLimiet({ max, vensterMs, naam }) {
  let teller = 0;
  let reset = Date.now() + vensterMs;
  let gemeld = false;

  return {
    /** @returns {boolean} true = geweigerd */
    bereikt() {
      const nu = Date.now();
      if (nu > reset) {
        if (teller > max) {
          console.warn(`[poort] ${naam}: venster afgesloten met ${teller} verzoeken (max ${max})`);
        }
        teller = 0;
        reset = nu + vensterMs;
        gemeld = false;
      }
      teller++;
      if (teller > max) {
        if (!gemeld) {
          console.warn(`[poort] ${naam}: globale limiet van ${max} bereikt, verdere verzoeken worden geweigerd tot ${new Date(reset).toISOString()}`);
          gemeld = true;
        }
        return true;
      }
      return false;
    },
    stand() {
      return { naam, teller, max, resetOver: Math.max(0, reset - Date.now()) };
    },
  };
}

/**
 * Laat maximaal `max` bewerkingen gelijktijdig door. Wie erbij komt terwijl het
 * vol is, wacht tot `wachtMs`; daarna wordt hij geweigerd.
 *
 * Bewust wachten en niet meteen weigeren: bij een korte piek van drie bezoekers
 * tegelijk is even wachten prettiger dan een foutmelding, terwijl bij echte
 * overbelasting de wachtrij niet oneindig groeit.
 */
function poort({ max, wachtMs = 4000, naam }) {
  let bezig = 0;
  const rij = [];

  function volgende() {
    if (rij.length === 0 || bezig >= max) return;
    const eerste = rij.shift();
    clearTimeout(eerste.timer);
    bezig++;
    eerste.klaar(true);
  }

  return {
    /**
     * @returns {Promise<function|null>} een functie om vrij te geven, of null
     *   als het te druk is
     */
    async binnen() {
      if (bezig < max) {
        bezig++;
        return () => {
          bezig--;
          volgende();
        };
      }

      const gelukt = await new Promise((klaar) => {
        const item = { klaar };
        item.timer = setTimeout(() => {
          const i = rij.indexOf(item);
          if (i >= 0) rij.splice(i, 1);
          console.warn(`[poort] ${naam}: te druk, verzoek geweigerd na ${wachtMs} ms wachten (${bezig} gelijktijdig)`);
          klaar(false);
        }, wachtMs);
        rij.push(item);
      });

      if (!gelukt) return null;
      return () => {
        bezig--;
        volgende();
      };
    },
    stand() {
      return { naam, bezig, max, wachtend: rij.length };
    },
  };
}

/** Teller per kalenderdag. */
function dagteller({ max, naam }) {
  let dag = new Date().toISOString().slice(0, 10);
  let teller = 0;

  return {
    /** @returns {boolean} true = geweigerd */
    bereikt() {
      const vandaag = new Date().toISOString().slice(0, 10);
      if (vandaag !== dag) {
        dag = vandaag;
        teller = 0;
      }
      teller++;
      if (teller > max) {
        console.error(`[poort] ${naam}: dagmaximum van ${max} bereikt op ${dag}. Verdere verzoeken worden geweigerd.`);
        return true;
      }
      return false;
    },
    stand() {
      return { naam, dag, teller, max };
    },
  };
}

module.exports = { globaleLimiet, poort, dagteller };
