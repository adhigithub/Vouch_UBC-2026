/* Vouch data contract, matched to main (commit 04a84bc "Added flow"):
 *   - website/src/lib/vouchApi.ts  ENDPOINT_REGISTRY, TRUST_CUTOFF, liveTag()
 *   - LEADERBOARD_GUIDE.md         GET /scores row shape
 *   - server/src/scoring.js        0.4T + 0.3A + 0.2H + 0.1R, missing parts share
 *                                  their weight, capped at T + 10
 *   - program/.../state.rs         Config and EndpointRecord layouts
 * The browser reaches the Vouch server through this build's proxy at /vouch
 * (server.mjs), the same path the main website's Vite proxy uses.
 */
window.VOUCH = (function () {
  'use strict';
  var PROGRAM_ID = 'GyYPjRNghiX96xFtP98eNMiYjKfrF5ktKLf1Mm2YBgni';

  // Catalog order (fake-apis/src/catalog.js). The leaderboard starts in this
  // order and sorts itself into rank order as you scroll.
  var REGISTRY = [
    { endpointId: 'weather-api-1/current',  name: 'Weather Prime',          path: '/weather/current',        tag: 'Verified Good', category: 'weather', price: 0.01, pda: '6KN1RQvJD7bj7Bf3TdgPuZ1LLPck6sPuMZ4YvgwMf1Q3' },
    { endpointId: 'weather-api-1/forecast', name: 'Weather Prime Forecast', path: '/weather/forecast',       tag: 'Verified Good', category: 'weather', price: 0.01, pda: 'B9E2hfZFDot5XCPYsQdvjbMywBQaGyoJFTaQ18Q5ubEy' },
    { endpointId: 'weather-api-2/current',  name: 'WeatherNode Premium',    path: '/weather-api-2/current',  tag: 'Verified Good', category: 'weather', price: 0.02, pda: 'Gi9GmEYmVgQYEUpES15dLcvWKxLzPvP9ouA52R6pR8Zc' },
    { endpointId: 'weather-api-3/current',  name: 'WeatherNode Backup',     path: '/weather-api-3/current',  tag: 'Wrong Schema',  category: 'weather', price: 0.01, pda: '8FjNaWizBE645DhrAg9Dup6rzT7o2PhrzPRtVQvX15HD' },
    { endpointId: 'weather-api-4/current',  name: 'WeatherText Feed',       path: '/weather-api-4/current',  tag: 'Bad Format',    category: 'weather', price: 0.01, pda: 'AQFmq8z76zugLLuAK8N5AJxine2hqeDUL8kAKkRV6vbj' },
    { endpointId: 'crypto-api-1/price',     name: 'DeFi Spot Prices',       path: '/defi/prices',            tag: 'Verified Good', category: 'crypto',  price: 0.01, pda: '4j45hdkcbh3oWNEFAU8K2FMGM7f7NpaZorjEj7a8snr4' },
    { endpointId: 'crypto-api-2/price',     name: 'CryptoFeed Delayed',     path: '/crypto-api-2/price',     tag: 'Slow',          category: 'crypto',  price: 0.01, pda: '4hA2CzdTBUFm2YpsDUWteRTtojMYLRXkNJmHue7JfKV2' },
    { endpointId: 'crypto-api-3/price',     name: 'CryptoFeed Lite',        path: '/crypto-api-3/price',     tag: 'Empty Payload', category: 'crypto',  price: 0.01, pda: 'FWRKC15orBKNozcpByCJfNQbQJXe9oWjjJ6MXvKN38fL' },
    { endpointId: 'crypto-api-4/price',     name: 'CryptoFeed Flux',        path: '/crypto-api-4/price',     tag: 'Flaky',         category: 'crypto',  price: 0.01, pda: '8YofSDYKJnJY1MQdbNUQaJ5TaaYYjxGSr7dRhKmh94Mt' }
  ];
  var CONFIG_PDA = 'H8ubtwRJQFQoDeddykBHqmAkH6U9fBQBh2aThuochLN';
  var TRUST_CUTOFF = 60, TEST_CAP_MARGIN = 10;
  var WEIGHTS = { T: 0.4, A: 0.3, H: 0.2, R: 0.1 };
  var REASON_TAG = { sanity: 'Wrong Data', format: 'Bad Format', empty: 'Empty Payload', slow: 'Slow' };

  function byId(id) { for (var i = 0; i < REGISTRY.length; i++) if (REGISTRY[i].endpointId === id) return REGISTRY[i]; return null; }

  // Same rule as server/src/scoring.js.
  function scoreFrom(parts) {
    var sum = 0, w = 0;
    for (var k in WEIGHTS) if (parts[k] !== null && parts[k] !== undefined) { sum += WEIGHTS[k] * parts[k]; w += WEIGHTS[k]; }
    var s = w ? sum / w : 0;
    if (parts.T !== null && parts.T !== undefined) s = Math.min(s, parts.T + TEST_CAP_MARGIN);
    return Math.round(s);
  }

  // Same rule as liveTag() in website/src/lib/vouchApi.ts.
  function tagFor(label, lastRating, reg) {
    if (label === 'trusted') return 'Trusted';
    if (label === 'unrated') return 'Unrated';
    if (label === 'avoid') return lastRating ? (lastRating.reason && REASON_TAG[lastRating.reason]) || 'Flaky' : (reg ? reg.tag : 'Failed Tests');
    return reg ? reg.tag : '';
  }

  // Shown only when the Vouch server can't be reached, and labelled as such on
  // the page. Parts are illustrative; scores are computed from them with the
  // server's own formula so the table is internally consistent.
  var SAMPLE_PARTS = {
    'weather-api-1/current':  { T: 90, A: 96, H: 92,   R: 90 },
    'weather-api-1/forecast': { T: 84, A: 90, H: null, R: null },
    'weather-api-2/current':  { T: 86, A: 92, H: null, R: null },
    'weather-api-3/current':  { T: 40, A: 10, H: null, R: null },
    'weather-api-4/current':  { T: 35, A: 5,  H: null, R: null },
    'crypto-api-1/price':     { T: 88, A: 94, H: null, R: 85 },
    'crypto-api-2/price':     { T: 62, A: 30, H: null, R: null },
    'crypto-api-3/price':     { T: 20, A: 0,  H: null, R: null },
    'crypto-api-4/price':     { T: 70, A: 45, H: null, R: null }
  };
  var SAMPLE_REASON = { 'weather-api-3/current': 'format', 'weather-api-4/current': 'format', 'crypto-api-2/price': 'slow', 'crypto-api-3/price': 'empty', 'crypto-api-4/price': 'sanity' };

  function sampleRows() {
    return REGISTRY.map(function (r) {
      var parts = SAMPLE_PARTS[r.endpointId], score = scoreFrom(parts);
      var label = score >= TRUST_CUTOFF ? 'trusted' : 'avoid';
      var reason = SAMPLE_REASON[r.endpointId];
      return { endpointId: r.endpointId, price: r.price, score: score, label: label, parts: parts, ratings: null,
               tag: label === 'avoid' && reason ? REASON_TAG[reason] : tagFor(label, null, r) };
    });
  }

  // GET /scores row (LEADERBOARD_GUIDE.md §3) -> table row.
  function fromScores(body) {
    var rows = Array.isArray(body) ? body : (body && (body.scores || body.leaderboard)) || [];
    return rows.map(function (s) {
      var reg = byId(s.endpointId);
      return { endpointId: s.endpointId, price: typeof s.price === 'number' ? s.price : reg ? reg.price : 0,
               score: Math.round(s.score), label: s.label, parts: s.parts || { T: null, A: null, H: null, R: null },
               ratings: typeof s.ratings === 'number' ? s.ratings : null, tag: tagFor(s.label, s.lastRating, reg) };
    }).filter(function (r) { return typeof r.score === 'number' && !isNaN(r.score); });
  }

  // Agents' order: score high to low, then cheaper first.
  function rank(rows) {
    return rows.slice().sort(function (a, b) { return b.score - a.score || a.price - b.price; });
  }

  return { PROGRAM_ID: PROGRAM_ID, REGISTRY: REGISTRY, CONFIG_PDA: CONFIG_PDA, TRUST_CUTOFF: TRUST_CUTOFF,
           byId: byId, sampleRows: sampleRows, fromScores: fromScores, rank: rank };
})();
