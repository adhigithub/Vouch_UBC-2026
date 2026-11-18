/* Vouch: Shatter. The signature move and the data views, in the page (the
 * engine is untouched).
 *
 * One SVG world, one camera. The V is cut into six shards along the path a
 * payment takes: down the left arm, round the point, up the right arm. The
 * smoothed scroll position is the camera's playhead:
 *
 *   hero → fracture → six shards → rejoin (the clean V again)
 *        → leaderboard (sorts itself as you scroll) → on Solana (read live)
 *        → finale
 *
 * The engine owns the scroll track, the copy windows and the waypoint event.
 * This file owns the world, the leaderboard and the on-chain read.
 */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var V = window.VOUCH;
  var root = document.getElementById('top');
  var svg = document.getElementById('world');
  var mapSvg = document.getElementById('map');

  // Leg indices (must match the data-sc-segment order in index.html).
  var HERO = 0, FRAC = 1, S0 = 2, REJOIN = 8, LB = 9, CHAIN = 10, FIN = 11;

  // ------------------------------------------------------------ geometry --
  var Pol = [100, 150], Pil = [280, 150], Pc = [500, 650], Pir = [720, 150], Por = [900, 150], Pb = [500, 900];
  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
  function O(f) { return mix(Pol, Pb, f); }
  function I(f) { return mix(Pil, Pc, f); }
  function Or(f) { return mix(Por, Pb, f); }
  function Ir(f) { return mix(Pir, Pc, f); }

  // Cuts are deliberately not parallel: a clean slice reads as a diagram,
  // a slightly skewed one reads as a break.
  var SHARDS = [
    { id: 'get',    code: 'GET',    name: 'Request',           pts: [Pol, Pil, I(0.30), O(0.36)],            R: 15,  a: -6, k: 1.03, push: [-28, -6] },
    { id: 'pay',    code: '402',    name: 'Payment required',  pts: [O(0.36), I(0.30), I(0.64), O(0.68)],    R: 15,  a: 5,  k: 0.98, push: [-34, 0] },
    { id: 'score',  code: 'SCORE',  name: 'Vouch check',       pts: [O(0.68), I(0.64), Pc, Pb],              R: 15,  a: -4, k: 1.02, push: [-40, 10] },
    { id: 'stream', code: 'STREAM', name: 'QuickNode sees it', pts: [Pb, Pc, Ir(0.70), Or(0.66)],            R: -15, a: 5,  k: 0.98, push: [40, 10] },
    { id: 'stamp',  code: 'STAMP',  name: 'Receipt stamped',   pts: [Or(0.66), Ir(0.70), Ir(0.38), Or(0.33)], R: -15, a: -5, k: 1.03, push: [34, 0] },
    { id: 'chain',  code: 'CHAIN',  name: 'Locked on Solana',  pts: [Or(0.33), Ir(0.38), Pir, Por],          R: -15, a: 6,  k: 0.97, push: [28, -6] }
  ];
  SHARDS.forEach(function (s) {
    var cx = 0, cy = 0;
    s.pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    s.cx = cx / s.pts.length; s.cy = cy / s.pts.length;
    var dx = s.cx - 500, dy = s.cy - 500, len = Math.hypot(dx, dy) || 1;
    s.dx = dx / len * 62 + s.push[0];
    s.dy = dy / len * 62 + s.push[1];
  });
  function ptsAttr(pts) { return pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }

  // ----------------------------------------------------------- shard art --
  // Local, upright box about 110 x 150 units centred on 0,0. .ln strokes draw
  // themselves (pathLength 1); .tx and .fill-ac fade in.
  function L(d, cls) { return '<path class="ln' + (cls ? ' ' + cls : '') + '" pathLength="1" d="' + d + '"/>'; }
  function T(x, y, size, text, cls, anchor) {
    return '<text class="tx' + (cls ? ' ' + cls : '') + '" x="' + x + '" y="' + y + '" font-size="' + size + '" text-anchor="' + (anchor || 'middle') + '">' + text + '</text>';
  }
  function circ(cx, cy, r) { return 'M' + (cx - r) + ' ' + cy + 'a' + r + ' ' + r + ' 0 1 0 ' + 2 * r + ' 0a' + r + ' ' + r + ' 0 1 0 ' + -2 * r + ' 0'; }
  function check(x, y) { return L('M' + x + ' ' + y + 'l2.4 2.4l4.6-5', 'ac'); }

  var ART = {
    get: function () {
      return T(0, -44, 24, 'GET', 'big') +
        L(circ(-34, 2, 9)) + T(-34, 23, 5.2, 'agent') +
        L('M24 -7h20v18h-20z') + T(34, 23, 5.2, 'endpoint') +
        L('M-23 2H18', 'ac') + L('M13 -2.5l5 4.5l-5 4.5', 'ac') +
        T(0, 44, 5.6, '/weather/current') + T(0, 53, 5.6, '?city=Austin');
    },
    pay: function () {
      return T(0, -44, 24, '402', 'big') +
        L('M24 -14H-20', 'ac') + L('M-15 -18.5l-5 4.5l5 4.5', 'ac') + T(-26, -12, 4.6, 'agent', '', 'end') + T(30, -12, 4.6, 'api', '', 'start') +
        L(circ(0, 14, 17)) + L(circ(0, 14, 12.5)) + T(0, 12.5, 6.4, '0.01') + T(0, 20.5, 4.6, 'USDC') +
        T(0, 47, 5.6, 'payment required') + T(0, 56, 5.6, 'final. no refunds.', 'ac');
    },
    score: function () {
      var r = 30, cy = -2, a0 = 135, span = 270;
      function pt(deg) { var t = deg * Math.PI / 180; return [r * Math.cos(t), cy + r * Math.sin(t)]; }
      function arc(from, to) {
        var p0 = pt(from), p1 = pt(to), large = to - from > 180 ? 1 : 0;
        return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2);
      }
      var ti = pt(a0 + span * 0.6), tin = [ti[0] * 0.78, cy + (ti[1] - cy) * 0.78], tout = [ti[0] * 1.16, cy + (ti[1] - cy) * 1.16];
      return T(0, -48, 15, 'SCORE', 'big') +
        L(arc(a0, a0 + span)) + L(arc(a0, a0 + span * 0.88), 'ac') +
        L('M' + tin[0].toFixed(2) + ' ' + tin[1].toFixed(2) + 'L' + tout[0].toFixed(2) + ' ' + tout[1].toFixed(2)) +
        T(0, 5, 18, '88', 'big') + T(0, 13, 4.4, 'example') + T(tout[0] + 6, tout[1] + 1, 4.6, '60', '', 'start') +
        T(0, 46, 5, '0.4T + 0.3A + 0.2H + 0.1R') + T(0, 55, 5, 'below 60: skip', 'ac');
    },
    stream: function () {
      var s = T(0, -44, 14, 'STREAM', 'big');
      for (var i = 0; i < 5; i++) {
        var x = -46 + i * 19;
        s += L('M' + x + ' -20h14v14h-14z', i === 2 ? 'ac' : '');
        if (i < 4) s += L('M' + (x + 14) + ' -13h5');
      }
      s += '<rect class="fill-ac" x="-6" y="-19" width="12" height="12"/>';
      s += L('M-30 4L-8 22h16L30 4') + L('M0 22v14', 'ac') + L('M-4.5 31.5L0 36l4.5-4.5', 'ac');
      s += T(0, 47, 5.4, 'POST /webhook/quicknode') + T(0, 56, 5.4, 'X-QN-Signature verified', 'ac');
      return s;
    },
    stamp: function () {
      var s = T(0, -48, 15, 'STAMP', 'big');
      // receipt with a torn bottom edge
      s += L('M-34 -34h68v62l-5.7 4l-5.7 -4l-5.7 4l-5.7 -4l-5.6 4l-5.7 -4l-5.7 4l-5.7 -4l-5.6 4l-5.7 -4l-5.7 4l-5.6 -4z');
      ['payment seen', 'right endpoint', 'payer signed', 'first use'].forEach(function (r, i) {
        var y = -22 + i * 11; s += T(-27, y + 2, 5.2, r, '', 'start') + check(20, y);
      });
      s += L(circ(0, 47, 8.5), 'ac') + T(0, 49.2, 5.6, '200', 'ac');
      return s;
    },
    chain: function () {
      var s = T(0, -44, 15, 'CHAIN', 'big');
      for (var i = 0; i < 3; i++) {
        var y = -26 + i * 22;
        s += L('M-26 ' + y + 'h52v14h-52z', i === 2 ? 'ac' : '');
        if (i < 2) s += L('M0 ' + (y + 14) + 'v8');
      }
      s += T(0, -16.5, 5, 'Config') + T(0, 5.5, 5, 'EndpointRecord') + T(0, 27.5, 5, 'PaymentUsed', 'ac');
      s += L('M32 24h12v9h-12z', 'ac') + L('M34.5 24v-3.2a3.5 3.5 0 0 1 7 0V24', 'ac');
      s += T(0, 49, 5.2, 'GyYP…Bgni') + T(0, 58, 5.2, 'no edit, no delete', 'ac');
      return s;
    }
  };

  // ------------------------------------------------------------ build SVG --
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  var defs = el('defs', {}, svg);
  var bg = el('g', {}, svg);
  var world = el('g', {}, svg);
  var fg = el('g', { class: 'dust' }, svg);

  // Back plane: a dot grid that moves slower than the V (further away).
  var pat = el('pattern', { id: 'dots', width: 36, height: 36, patternUnits: 'userSpaceOnUse' }, defs);
  el('circle', { cx: 18, cy: 18, r: 1.1, fill: '#121316', 'fill-opacity': 0.16 }, pat);
  el('rect', { x: -4000, y: -4000, width: 9000, height: 9000, fill: 'url(#dots)' }, bg);

  // Front plane: splinters that move faster than the V (nearer).
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var dustD = '';
  for (var n = 0; n < 46; n++) {
    var x = -500 + rnd() * 2000, y = -300 + rnd() * 1600, sz = 2 + rnd() * 5, rot = rnd() * Math.PI * 2;
    [[0, 1], [2.3, 0.6], [4.1, 0.8]].forEach(function (q, j) {
      dustD += (j ? 'L' : 'M') + (x + Math.cos(rot + q[0]) * sz * q[1]).toFixed(1) + ' ' + (y + Math.sin(rot + q[0]) * sz * q[1]).toFixed(1);
    });
    dustD += 'Z';
  }
  el('path', { d: dustD }, fg);

  SHARDS.forEach(function (s) {
    var clip = el('clipPath', { id: 'clip-' + s.id }, defs);
    el('polygon', { points: ptsAttr(s.pts) }, clip);
    s.g = el('g', {}, world);
    s.poly = el('polygon', { class: 'shard-poly', points: ptsAttr(s.pts) }, s.g);
    s.art = el('g', { 'clip-path': 'url(#clip-' + s.id + ')' }, s.g);
    var artT = 'translate(' + s.cx.toFixed(1) + ' ' + s.cy.toFixed(1) + ') rotate(' + (-(s.R + s.a)) + ')';
    el('g', { class: 'art ghost', transform: artT }, s.art).innerHTML = ART[s.id]();
    s.live = el('g', { class: 'art live', transform: artT }, s.art);
    s.live.innerHTML = ART[s.id]();
    s.d = -1; s.av = -1; s.seen = false;
  });
  // The whole V as one shape. Six abutting polygons always leak a hairline of
  // paper along their shared edges; whenever the logo is meant to be whole,
  // this single shape sits over them, so the V reads as the original mark.
  var solidV = el('path', { d: 'M100 150H280L500 650L720 150H900L500 900Z', fill: '#121316' }, world);
  // The seal: one cobalt line traced round the whole V on the On Solana leg.
  var seal = el('path', { class: 'seal', pathLength: 1, d: 'M100 150H280L500 650L720 150H900L500 900Z' }, world);

  // The map: the same six shards, small, one link each.
  var mapLinks = SHARDS.map(function (s) {
    var a = el('a', { href: '#' + s.id, 'aria-label': s.code + ': ' + s.name }, mapSvg);
    el('polygon', { points: ptsAttr(s.pts) }, a);
    return a;
  });
  var mapCode = document.getElementById('map-code'), mapName = document.getElementById('map-name');

  // ---------------------------------------------------------------- legs --
  var legs = Array.prototype.map.call(root.querySelectorAll('[data-sc-segment]'), function (nd) {
    return { w: parseFloat(nd.getAttribute('data-sc-w')) || 1 };
  });
  var run = 0;
  legs.forEach(function (l) { l.c = run; run += l.w; });
  var TOTAL = run;

  // Copy windows from leg fractions, so retuning a weight never desyncs copy.
  Array.prototype.forEach.call(root.querySelectorAll('[data-sc-copy][data-leg]'), function (c) {
    var lg = legs[+c.getAttribute('data-leg')];
    var from = (lg.c + parseFloat(c.getAttribute('data-from')) * lg.w) / TOTAL;
    var to = Math.min(1, (lg.c + parseFloat(c.getAttribute('data-to')) * lg.w) / TOTAL);
    c.setAttribute('data-sc-window', from.toFixed(4) + ' ' + to.toFixed(4) + ' ' +
      (c.getAttribute('data-rin') || '0.23') + ' ' + (c.getAttribute('data-rout') || '0.23'));
  });
  ScrollCraft.mount(document.body);

  // ------------------------------------------------------------- camera --
  var vw = 0, vh = 0, mobile = false, K = {};
  function cam(x, y, s, r, ax, ay) { return { x: x, y: y, s: s, r: r, ax: ax, ay: ay }; }
  function scaled(c, f) { return cam(c.x, c.y, c.s * f, c.r, c.ax, c.ay); }

  function computeKeys() {
    vw = innerWidth; vh = innerHeight;
    mobile = vw <= 760 || vw / vh < 0.9;
    svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
    var vS = function (h, w) { return Math.min(h * vh / 760, w * vw / 800); };  // V height / width as viewport fractions
    if (mobile) {
      K.hero = cam(500, 520, 0.80 * vw / 800, 0, 0.5, 0.33);
      K.over = cam(500, 530, 0.92 * vw / 1060, 0, 0.5, 0.31);
      var ms = Math.min(0.56 * vw, 0.3 * vh) / 160;
      K.shard = SHARDS.map(function (s) { return cam(s.cx + s.dx, s.cy + s.dy, ms, s.R, 0.5, 0.29); });
      K.rejoin = cam(500, 525, 0.62 * vw / 800, 0, 0.5, 0.28);
      K.lb = cam(500, 525, 46 / 760, 0, 0.5, (86 + 23) / vh);   // a small mark under the top bar
      K.chain = cam(500, 525, vS(0.26, 0.5), 0, 0.5, 0.2);
      K.final = cam(500, 525, 0.62 * vw / 800, 0, 0.5, 0.28);
    } else {
      K.hero = cam(500, 525, vS(0.68, 0.44), 0, 0.68, 0.48);
      K.over = cam(500, 530, Math.min(0.80 * vh / 980, 0.56 * vw / 1080), 0, 0.62, 0.5);
      var ds = Math.min(0.38 * vw, 0.68 * vh) / 160;
      K.shard = SHARDS.map(function (s, i) { return cam(s.cx + s.dx, s.cy + s.dy, ds, s.R, i % 2 === 0 ? 0.71 : 0.29, 0.5); });
      K.rejoin = cam(500, 525, vS(0.36, 0.34), 0, 0.5, 0.31);
      K.lb = cam(500, 525, vS(0.3, 0.17), 0, 0.15, 0.5);
      K.chain = cam(500, 525, vS(0.62, 0.42), 0, 0.71, 0.5);
      K.final = cam(500, 525, vS(0.36, 0.34), 0, 0.5, 0.31);
    }
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function ease(v) { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }

  // A hop: position eases across, zoom eases in log space and dips in the
  // middle, so a long move pulls back to show where it is going.
  function hop(a, b, e, dip) {
    var ls = Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e - dip * Math.sin(Math.PI * e);
    return cam(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, Math.exp(ls),
      a.r + (b.r - a.r) * e, a.ax + (b.ax - a.ax) * e, a.ay + (b.ay - a.ay) * e);
  }

  var PUSH = 1.06;
  // state(t): camera, explode, crack, art visibility, seal, leg, local progress
  function state(t) {
    t = Math.max(0, Math.min(TOTAL, t));
    var k = 0;
    for (var i = 0; i < legs.length; i++) if (t >= legs[i].c) k = i;
    var u = clamp01((t - legs[k].c) / legs[k].w);
    var c, ex = 1, cr = 1, av = 1, sl = 0;
    var heroPushed = scaled(K.hero, 1.06), heroEnd = hop(heroPushed, K.over, 0.45, 0), overEnd = scaled(K.over, 0.97);

    if (k === HERO) {               // a clean, flat V; then it starts to give
      c = u < 0.45 ? scaled(K.hero, 1 + 0.06 * smooth(u / 0.45)) : hop(heroPushed, K.over, 0.45 * ease((u - 0.45) / 0.55), 0);
      ex = 0;
      cr = 0.5 * smooth((u - 0.4) / 0.6);
      av = smooth((u - 0.45) / 0.55);        // the drawings inside show through the cracks
    } else if (k === FRAC) {        // crack, then break
      c = hop(heroEnd, K.over, ease(u / 0.3), 0);
      c = scaled(c, 1 - 0.03 * smooth((u - 0.3) / 0.7));
      cr = 0.5 + 0.5 * smooth(u / 0.2);
      ex = smooth((u - 0.22) / 0.5);
    } else if (k < REJOIN) {        // the six shards
      var si = k - S0;
      var from = si === 0 ? overEnd : scaled(K.shard[si - 1], PUSH);
      c = hop(from, K.shard[si], ease(u / 0.4), si === 0 ? 0 : (si === 3 ? 0.62 : 0.4));
      c = scaled(c, 1 + (PUSH - 1) * smooth((u - 0.4) / 0.6));
    } else if (k === REJOIN) {      // pull out, shards fly home, the V is whole and clean again
      c = hop(scaled(K.shard[5], PUSH), K.rejoin, ease(u / 0.55), 0);
      ex = 1 - smooth((u - 0.08) / 0.5);
      cr = 1 - smooth((u - 0.4) / 0.25);
      av = 1 - smooth((u - 0.3) / 0.3);
    } else if (k === LB) {          // the V steps aside for the leaderboard
      c = scaled(hop(K.rejoin, K.lb, ease(u / 0.28), 0), 1 + 0.03 * smooth((u - 0.28) / 0.72));
      ex = 0; cr = 0; av = 0;
    } else if (k === CHAIN) {       // the V comes back up, and a line seals it
      c = scaled(hop(scaled(K.lb, 1.03), K.chain, ease(u / 0.3), 0), 1 + 0.03 * smooth((u - 0.3) / 0.7));
      ex = 0; cr = 0; av = 0;
      sl = smooth((u - 0.18) / 0.45);
    } else {                        // finale: the clean V, centred
      c = hop(scaled(K.chain, 1.03), K.final, ease(u / 0.5), 0);
      ex = 0; cr = 0; av = 0;
      sl = 1 - smooth((u - 0.1) / 0.35);
    }
    return { c: c, ex: ex, cr: cr, av: av, sl: sl, k: k, u: u, t: t };
  }

  // Reduced motion: no flights. Each leg is one settled composition.
  var SETTLE = [0, 0.99, 0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.99, 0.75, 0.85, 1];
  function settled(t) {
    var k = state(t).k;
    return state(legs[k].c + legs[k].w * SETTLE[k]);
  }

  // --------------------------------------------------------- leaderboard --
  var lbRows = document.getElementById('lb-rows'), lbCut = document.getElementById('lb-cut');
  var lbStatus = document.getElementById('lb-status');
  var lb = { rows: [], els: {}, live: false, lastU: -1, rowH: 52 };

  function fmtParts(p) {
    return ['T', 'A', 'H', 'R'].map(function (k) { return p[k] === null || p[k] === undefined ? '—' : Math.round(p[k]); }).join(' · ');
  }
  function renderRows(rows) {
    var ranked = V.rank(rows);
    var catalog = V.REGISTRY.map(function (r) { return r.endpointId; });
    // endpoints the server knows about that the registry doesn't go to the end
    rows.forEach(function (r) { if (catalog.indexOf(r.endpointId) < 0) catalog.push(r.endpointId); });
    var ids = ranked.map(function (r) { return r.endpointId; }).join(',');
    var rebuild = ids !== lb.ids;
    lb.ids = ids;
    if (rebuild) {
      Array.prototype.forEach.call(lbRows.querySelectorAll('.lb-row'), function (e) { e.remove(); });
      lb.els = {};
    }
    ranked.forEach(function (r, i) {
      var reg = V.byId(r.endpointId) || { name: r.endpointId, path: r.endpointId };
      var e = lb.els[r.endpointId];
      if (!e) {
        e = document.createElement('div');
        e.className = 'lb-row'; e.setAttribute('role', 'row');
        e.innerHTML =
          '<span class="r-rank" role="cell"></span>' +
          '<span class="r-name" role="cell"><b></b><small></small></span>' +
          '<span class="r-score" role="cell"><span class="meter"><i></i></span><b></b></span>' +
          '<span class="r-label" role="cell"><em class="pill"></em></span>' +
          '<span class="r-parts" role="cell"></span>' +
          '<span class="r-ratings" role="cell"></span>';
        lbRows.appendChild(e);
        lb.els[r.endpointId] = e;
      }
      var prev = e._score;
      e._rank = i; e._cat = catalog.indexOf(r.endpointId); e._score = r.score; e._avoid = r.score < V.TRUST_CUTOFF; e._label = r.label;
      e.querySelector('.r-rank').textContent = String(i + 1);
      e.querySelector('.r-name b').textContent = reg.name;
      e.querySelector('.r-name small').textContent = reg.path + ' · $' + r.price.toFixed(2);
      e.querySelector('.pill').textContent = r.tag;
      e.querySelector('.r-parts').textContent = fmtParts(r.parts);
      e.querySelector('.r-ratings').textContent = r.ratings === null ? '—' : String(r.ratings);
      e.setAttribute('aria-label', reg.name + ', score ' + r.score + ', ' + r.tag);
      if (prev !== undefined && prev !== r.score) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
    });
    lb.rows = ranked;
    lb.nTrusted = ranked.filter(function (r) { return r.score >= V.TRUST_CUTOFF; }).length;
    lbRows.style.setProperty('--rows', ranked.length);
    lb.lastU = -1;
  }

  function drawLeaderboard(u) {
    if (Math.abs(u - lb.lastU) < 0.0005) return;
    lb.lastU = u;
    var sortRaw = reduce ? 1 : clamp01((u - 0.12) / 0.4);
    var sortP = smooth(sortRaw);
    var fillP = reduce ? 1 : smooth((u - 0.02) / 0.32);
    var cutP = reduce ? 1 : smooth((u - 0.52) / 0.12);
    var tintP = reduce ? 1 : smooth((u - 0.56) / 0.14);
    var rh = lb.rowH;
    Object.keys(lb.els).forEach(function (id) {
      var e = lb.els[id];
      // Staggered by final rank: the top settles first, then each row below it.
      var sp = smooth((sortRaw - e._rank * 0.055) / 0.56);
      var pos = e._cat + (e._rank - e._cat) * sp;
      e.style.transform = 'translate3d(0,' + (pos * rh).toFixed(1) + 'px,0)';
      // rows in transit dip, so the reshuffle reads as movement, not a pile-up
      e.style.opacity = e._rank === e._cat ? '1' : (1 - 0.82 * Math.sin(Math.PI * sp)).toFixed(3);
      e.querySelector('.meter i').style.transform = 'scaleX(' + (e._score / 100 * fillP).toFixed(4) + ')';
      e.querySelector('.r-score b').textContent = String(Math.round(e._score * fillP));
      e.querySelector('.r-rank').style.opacity = sortP.toFixed(3);
      // verdict colour arrives with the cutoff: cobalt above, red below, grey if unrated
      var hue = e._label === 'unrated' ? 'var(--sc-ink-soft)' : e._avoid ? 'var(--bad)' : 'var(--sc-accent)';
      var pct = (tintP * 100).toFixed(1) + '%';
      e.style.setProperty('--fill', 'color-mix(in oklab, ' + hue + ' ' + pct + ', var(--sc-ink))');
      e.style.setProperty('--num', e._avoid ? 'color-mix(in oklab, var(--bad) ' + pct + ', var(--sc-ink))' : 'var(--sc-ink)');
      e.querySelector('.pill').style.color = 'color-mix(in oklab, ' + hue + ' ' + pct + ', var(--sc-ink-soft))';
    });
    lbCut.style.top = (lb.nTrusted * rh) + 'px';
    lbCut.style.transform = 'scaleX(' + cutP.toFixed(4) + ')';
    lbCut.style.opacity = lb.nTrusted > 0 && lb.nTrusted < lb.rows.length ? '1' : '0';
  }

  function stamp() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function pollScores() {
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 3500);
    fetch('/vouch/scores', { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (body) {
        clearTimeout(to);
        var rows = V.fromScores(body);
        if (!rows.length) throw new Error('empty');
        lb.live = true;
        renderRows(rows);
        lbStatus.dataset.state = 'live';
        lbStatus.textContent = 'Live from the Vouch server · updated ' + stamp();
        setTimeout(pollScores, 3000);
      })
      .catch(function () {
        clearTimeout(to);
        if (!lb.live || !lb.rows.length) renderRows(V.sampleRows());
        lb.live = false;
        lbStatus.dataset.state = 'sample';
        lbStatus.textContent = 'Sample data: the Vouch server is not running. Start it on :4000 for live scores.';
        setTimeout(pollScores, 15000);
      });
  }

  // ------------------------------------------------------------ on-chain --
  var ch = { total: null, lastRead: 0, recs: {} };
  var chTotal = document.getElementById('ch-total'), chAuth = document.getElementById('ch-auth');
  var chRecs = document.getElementById('ch-recs'), chStatus = document.getElementById('ch-status');
  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function b58(bytes) {
    var digits = [0];
    for (var i = 0; i < bytes.length; i++) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    var s = '';
    for (var z = 0; z < bytes.length && bytes[z] === 0; z++) s += '1';
    for (var q = digits.length - 1; q >= 0; q--) s += B58[digits[q]];
    return s;
  }
  function bytesOf(b64) { var bin = atob(b64), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  var shortAddr = function (a) { return a.slice(0, 4) + '…' + a.slice(-4); };

  // Rows for the per-endpoint list, in catalog order.
  V.REGISTRY.forEach(function (r) {
    var li = document.createElement('li');
    li.innerHTML = '<span></span><span class="gb"><i class="g"></i><i class="b"></i></span><span class="n">—</span>';
    li.firstChild.textContent = r.name;
    chRecs.appendChild(li);
    ch.recs[r.endpointId] = { li: li, good: 0, bad: 0 };
  });

  function readChain() {
    ch.lastRead = Date.now();
    var keys = [V.CONFIG_PDA].concat(V.REGISTRY.map(function (r) { return r.pda; }));
    fetch('https://api.devnet.solana.com', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [keys, { encoding: 'base64', commitment: 'confirmed' }] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var vals = j && j.result && j.result.value;
      if (!vals) throw new Error('rpc');
      if (vals[0]) {
        var cfg = bytesOf(vals[0].data[0]), dv = new DataView(cfg.buffer);
        chAuth.textContent = shortAddr(b58(cfg.subarray(8, 40))) + ' (Vouch server)';
        ch.total = Number(dv.getBigUint64(40, true));
      }
      V.REGISTRY.forEach(function (r, i) {
        var v = vals[i + 1], rec = ch.recs[r.endpointId];
        if (v) {
          var b = bytesOf(v.data[0]), d = new DataView(b.buffer), len = d.getUint32(8, true);
          rec.good = d.getUint32(12 + len, true); rec.bad = d.getUint32(16 + len, true);
        } else { rec.good = 0; rec.bad = 0; }
        rec.li.querySelector('.n').textContent = rec.good + ' / ' + rec.bad;
        rec.li.setAttribute('aria-label', r.name + ': ' + rec.good + ' good, ' + rec.bad + ' bad');
      });
      ch.max = Math.max.apply(null, V.REGISTRY.map(function (r) { var x = ch.recs[r.endpointId]; return x.good + x.bad; }).concat([1]));
      chStatus.dataset.state = 'live';
      chStatus.textContent = 'Read from Solana devnet at ' + stamp() + ' · good / bad';
      ch.lastU = -1;
    }).catch(function () {
      chStatus.dataset.state = 'off';
      chStatus.textContent = 'Could not reach Solana devnet just now.';
    });
  }

  function drawChain(u) {
    if (Math.abs(u - (ch.lastU || -1)) < 0.0005) return;
    ch.lastU = u;
    var p = reduce ? 1 : smooth((u - 0.12) / 0.4);
    chTotal.textContent = ch.total === null ? '—' : String(Math.round(ch.total * p));
    if (!ch.max) return;
    V.REGISTRY.forEach(function (r) {
      var rec = ch.recs[r.endpointId], i = rec.li.querySelectorAll('.gb i');
      i[0].style.width = (rec.good / ch.max * 100 * p).toFixed(2) + '%';
      i[1].style.width = (rec.bad / ch.max * 100 * p).toFixed(2) + '%';
    });
  }

  // --------------------------------------------------------------- render --
  function f(v) { return v.toFixed(3); }
  var lastKey = '', jumps = document.querySelectorAll('[data-jump]');
  function render(st) {
    var c = st.c, ax = c.ax * vw, ay = c.ay * vh;
    world.setAttribute('transform', 'translate(' + f(ax) + ' ' + f(ay) + ') rotate(' + f(c.r) + ') scale(' + f(c.s) + ') translate(' + f(-c.x) + ' ' + f(-c.y) + ')');
    var sb = Math.pow(c.s / K.hero.s, 0.5) * K.hero.s;
    bg.setAttribute('transform', 'translate(' + f(ax) + ' ' + f(ay) + ') rotate(' + f(c.r * 0.5) + ') scale(' + f(sb) + ') translate(' + f(-c.x) + ' ' + f(-c.y) + ')');
    if (!reduce) fg.setAttribute('transform', 'translate(' + f(ax) + ' ' + f(ay) + ') rotate(' + f(c.r * 1.2) + ') scale(' + f(c.s * 1.45) + ') translate(' + f(-c.x) + ' ' + f(-c.y) + ')');

    SHARDS.forEach(function (s, i) {
      var ex = st.ex;
      s.g.setAttribute('transform', 'translate(' + f(s.cx + s.dx * ex) + ' ' + f(s.cy + s.dy * ex) + ') rotate(' + f(s.a * ex) + ') scale(' + f(1 + (s.k - 1) * ex) + ') translate(' + f(-s.cx) + ' ' + f(-s.cy) + ')');
      s.poly.style.strokeWidth = (st.cr * 5).toFixed(2);
      if (Math.abs(st.av - s.av) > 0.002) { s.art.style.opacity = st.av.toFixed(3); s.art.style.visibility = st.av > 0.002 ? 'visible' : 'hidden'; s.av = st.av; }
      var leg = legs[S0 + i];
      var d = reduce || st.k >= REJOIN ? 1 : smooth((st.t - (leg.c + 0.24 * leg.w)) / (0.42 * leg.w));
      if (Math.abs(d - s.d) > 0.002) { s.live.style.setProperty('--d', d.toFixed(3)); s.d = d; }
      if (d > 0.6 && st.k >= S0) s.seen = true;
    });
    var whole = 1 - clamp01(Math.max(st.ex * 20, st.cr * 8, st.av * 8));
    solidV.style.opacity = whole.toFixed(3);
    solidV.style.visibility = whole > 0.002 ? 'visible' : 'hidden';
    seal.style.strokeDashoffset = (1 - st.sl).toFixed(4);
    seal.style.visibility = st.sl > 0.001 ? 'visible' : 'hidden';

    var lu = st.k < LB ? 0 : st.k > LB ? 1 : st.u;
    drawLeaderboard(lu);
    drawChain(st.k < CHAIN ? 0 : st.k > CHAIN ? 1 : st.u);
    if (st.k === CHAIN && Date.now() - ch.lastRead > 20000) readChain();

    var cur = st.k >= S0 && st.k < REJOIN ? st.k - S0 : -1;
    var key = st.k + ':' + cur + ':' + SHARDS.map(function (s) { return s.seen ? 1 : 0; }).join('');
    if (key !== lastKey) {
      lastKey = key;
      mapLinks.forEach(function (a, i) {
        if (i === cur) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
        a.classList.toggle('seen', SHARDS[i].seen);
      });
      if (cur >= 0) { mapCode.textContent = SHARDS[cur].code; mapName.textContent = SHARDS[cur].name; }
      else if (st.k >= REJOIN) { mapCode.textContent = '200 OK'; mapName.textContent = 'Rated and recorded'; }
      else { mapCode.textContent = 'Vouch'; mapName.textContent = st.k === FRAC ? 'Six moments' : 'Overview'; }
      root.setAttribute('data-stage', st.k === LB || st.k === CHAIN ? 'data' : 'world');
      document.body.setAttribute('data-stage', root.getAttribute('data-stage'));
      jumps.forEach(function (a) { a.setAttribute('aria-current', String(+a.getAttribute('data-jump') === st.k)); });
    }
  }

  // ----------------------------------------------------------------- loop --
  var shown = null, last = performance.now();
  function target() { return (scrollY || pageYOffset) / Math.max(vh, 1); }
  function frame(now) {
    var dt = Math.min(64, now - last); last = now;
    var tt = target();
    if (reduce || shown === null) shown = tt;
    else {
      var a = 1 - Math.pow(1 - 0.12, dt / 16.67);   // damped playhead, frame-rate independent
      shown += (tt - shown) * a;
      if (Math.abs(tt - shown) < 0.0004) shown = tt;
    }
    render(reduce ? settled(shown) : state(shown));
    requestAnimationFrame(frame);
  }

  function relayout() {
    computeKeys();
    lb.rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')) || 52;
    lb.lastU = -1;
    render(reduce ? settled(target()) : state(shown === null ? target() : shown));
  }
  addEventListener('resize', relayout);
  addEventListener('load', function () { dispatchEvent(new Event('resize')); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { dispatchEvent(new Event('resize')); });

  // Jumps. The camera flies there through everything in between.
  function jumpTo(k, frac) { scrollTo({ top: (legs[k].c + legs[k].w * frac) * vh, behavior: 'instant' }); }
  mapLinks.forEach(function (a, i) { a.addEventListener('click', function (e) { e.preventDefault(); jumpTo(S0 + i, 0.72); }); });
  jumps.forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); jumpTo(+a.getAttribute('data-jump'), 0.75); }); });
  document.querySelector('.wordmark').addEventListener('click', function (e) { e.preventDefault(); scrollTo({ top: 0, behavior: 'instant' }); });

  // Read-only hook for the verification pass.
  window.__vouchShatter = { get shown() { return shown; }, get target() { return target(); }, total: TOTAL };

  computeKeys();
  lb.rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')) || 52;
  renderRows(V.sampleRows());
  pollScores();
  readChain();
  requestAnimationFrame(frame);
})();
