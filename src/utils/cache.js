'use strict';

/**
 * Minimale in-memory cache met TTL. Sondeerdata verandert niet: een sondering
 * uit 2019 is over een jaar nog exact dezelfde. Zonder cache doe je per
 * bezoeker 5-10 calls naar de BRO; dat is onnodig en traag (elke XML is
 * 0,5-3 MB).
 *
 * Let op: dit is per proces. Op Railway met 1 instance is dat prima. Wil je
 * het persistent maken, schrijf de geparseerde resultaten dan naar de
 * PostgreSQL-tabel uit sql/001_sondeertool.sql.
 */
class Cache {
  constructor({ ttlMs = 1000 * 60 * 60 * 24, max = 400 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // hergebruik verplaatst naar achteren = eenvoudige LRU
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key, value) {
    if (this.map.size >= this.max) {
      const oudste = this.map.keys().next().value;
      this.map.delete(oudste);
    }
    this.map.set(key, { value, exp: Date.now() + this.ttlMs });
    return value;
  }

  async wrap(key, fn) {
    const bestaand = this.get(key);
    if (bestaand !== undefined) return bestaand;
    const waarde = await fn();
    return this.set(key, waarde);
  }

  get size() {
    return this.map.size;
  }
}

module.exports = { Cache };
