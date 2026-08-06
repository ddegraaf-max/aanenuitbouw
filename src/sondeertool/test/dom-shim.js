'use strict';

/**
 * Minimale nabootsing van een browser, genoeg om assets/sondeertool.js echt uit
 * te voeren in de tests.
 *
 * Waarom dit bestaat: drie fouten op rij zaten in de browserkant en geen enkele
 * test raakte die. Alle tests draaiden op de serverkant. De fouten waren
 *
 *   1. el('sd-melding') -> zocht id "sd-sd-melding", kreeg null, hele
 *      zoekactie viel stil met een eeuwig doorlopende voortgangstimer
 *   2. const VERPLICHTE_IDS gebruikt vóór de declaratie -> de hele JS viel om
 *      bij het laden
 *   3. begonnen als const binnen een try, gebruikt in de catch
 *
 * Alle drie waren gevonden door het bestand simpelweg uit te voeren. Geen
 * dependencies: de nabootsing is met opzet dom en dekt alleen wat deze code
 * gebruikt. Slaat de code iets aan wat hier niet bestaat, dan faalt de test --
 * en dat is precies de bedoeling.
 */

const fs = require('node:fs');
const path = require('node:path');

/** Haalt de id's en klassen uit het paginatemplate. */
function leesPagina() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'pagina.html'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const klassen = new Set();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const t of m[1].split(/\s+/)) if (t) klassen.add(t);
  }
  const velden = new Set([...html.matchAll(/data-sd-veld="([^"]+)"/g)].map((m) => m[1]));
  return { html, ids, klassen, velden };
}

function maakContext2d() {
  const noop = () => {};
  return {
    scale: noop,
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    closePath: noop,
    fillText: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    strokeStyle: '',
    fillStyle: '',
    font: '',
    lineWidth: 1,
    lineJoin: '',
  };
}

function maakElement(naam, pagina, log) {
  const el = {
    _naam: naam,
    hidden: false,
    disabled: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    title: '',
    width: 0,
    height: 0,
    clientWidth: 640,
    clientHeight: 520,
    style: {},
    dataset: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    children: [],
    _luisteraars: {},
    addEventListener(soort, fn) {
      (this._luisteraars[soort] = this._luisteraars[soort] || []).push(fn);
    },
    removeEventListener() {},
    dispatch(soort, gebeurtenis) {
      for (const fn of this._luisteraars[soort] || []) fn(gebeurtenis || { preventDefault() {} });
    },
    querySelector(sel) {
      log.querySelectors.push(sel);
      if (sel.startsWith('.')) {
        return pagina.klassen.has(sel.slice(1)) ? maakElement(sel, pagina, log) : null;
      }
      // span, button en dergelijke: altijd een element, die staan in de markup
      return maakElement(sel, pagina, log);
    },
    querySelectorAll(sel) {
      log.querySelectors.push(sel);
      return [];
    },
    appendChild(kind) {
      this.children.push(kind);
      return kind;
    },
    remove() {},
    getContext(soort) {
      return soort === '2d' ? maakContext2d() : null;
    },
    getBoundingClientRect() {
      return { top: 0, left: 0, width: 640, height: 520 };
    },
    scrollIntoView() {},
    focus() {},
    requestSubmit() {
      log.submits++;
      this.dispatch('submit', { preventDefault() {} });
    },
    contains() {
      return false;
    },
    set onmousemove(fn) { this._luisteraars.mousemove = [fn]; }, // eslint-disable-line
    set ontouchmove(fn) { this._luisteraars.touchmove = [fn]; }, // eslint-disable-line
    set onmouseleave(fn) { this._luisteraars.mouseleave = [fn]; }, // eslint-disable-line
  };
  return el;
}

/**
 * Voert assets/sondeertool.js uit in de nabootsing.
 * @param {object} opties
 * @param {function} [opties.fetch] eigen fetch-nabootsing
 * @returns {object} handvatten om de pagina te bedienen en te inspecteren
 */
function laadClient(opties = {}) {
  const pagina = leesPagina();
  const log = {
    querySelectors: [],
    submits: 0,
    fouten: [],
    consoleFouten: [],
    meldingen: [],
    intervals: new Set(),
    timeouts: new Set(),
  };

  const elementen = new Map();
  const document = {
    getElementById(id) {
      if (!pagina.ids.has(id)) return null;
      if (!elementen.has(id)) elementen.set(id, maakElement('#' + id, pagina, log));
      return elementen.get(id);
    },
    querySelector(sel) {
      log.querySelectors.push(sel);
      const m = sel.match(/data-sd-veld="([^"]+)"/);
      if (m) {
        if (!pagina.velden.has(m[1])) return null;
        const sleutel = 'veld:' + m[1];
        if (!elementen.has(sleutel)) elementen.set(sleutel, maakElement(sel, pagina, log));
        return elementen.get(sleutel);
      }
      return maakElement(sel, pagina, log);
    },
    createElement: (naam) => maakElement(naam, pagina, log),
    head: maakElement('head', pagina, log),
    body: maakElement('body', pagina, log),
    addEventListener() {},
  };

  let volgendeId = 1;
  const window = {
    document,
    location: { search: opties.search || '' },
    devicePixelRatio: 1,
    SONDEERTOOL: { basisPad: '/bodemcheck' },
    navigator: {
      sendBeacon: (url, lading) => {
        log.meldingen.push({ url, lading: String(lading && lading._tekst ? lading._tekst : '') });
        return true;
      },
    },
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: () => 0,
    addEventListener(soort, fn) {
      if (soort === 'error' || soort === 'unhandledrejection') log.fouten.push({ soort, fn });
      if (soort === 'resize') log.resize = fn;
    },
    setInterval: (fn, ms) => {
      const id = volgendeId++;
      log.intervals.add(id);
      return id;
    },
    clearInterval: (id) => log.intervals.delete(id),
    setTimeout: (fn, ms) => {
      const id = volgendeId++;
      log.timeouts.add(id);
      return id;
    },
    clearTimeout: (id) => log.timeouts.delete(id),
  };

  const console = {
    log: () => {},
    warn: () => {},
    error: (...a) => log.consoleFouten.push(a.map(String).join(' ')),
  };

  const bron = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sondeertool.js'), 'utf8');

  // Blob bestaat niet in Node; de melder gebruikt hem voor sendBeacon.
  class Blob {
    constructor(delen) {
      this._tekst = delen.join('');
    }
  }

  const uitvoeren = new Function(
    'window', 'document', 'console', 'fetch', 'navigator', 'Blob',
    'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
    'requestAnimationFrame', 'AbortController',
    bron,
  );

  uitvoeren(
    window,
    document,
    console,
    opties.fetch || (() => Promise.reject(new Error('geen fetch in deze test'))),
    window.navigator,
    Blob,
    window.setInterval,
    window.clearInterval,
    window.setTimeout,
    window.clearTimeout,
    window.requestAnimationFrame,
    globalThis.AbortController,
  );

  return { pagina, log, document, window, elementen, el: (id) => document.getElementById(id) };
}

module.exports = { laadClient, leesPagina };
