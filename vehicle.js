/* Measured pad drawing. Meters, then a crisp line skeleton with stippled light.
   Block 2 stack: ship 52.1 m, booster 71 m, diameter 9 m, tower 146 m. */
(function (global) {
  var INK = "#f4f1e8";
  var R = 4.5;
  var SHIP = 52.1;
  var BOOST = 71;
  var HOT = 1.8;
  var NOSE = 15;
  var TOWER = 146;
  var YAW = 0.38;
  var DECK = 12.5;
  var BELL = 15.1;

  var FACTS = [
    "LSU senior. Information Systems and Analytics, cyber risk focus, computer science minor. Geaux Tigers.",
    "Expected graduation Spring 2027. GPA 3.8.",
    "I once debugged code all night during an LSU game week.",
    "Vexel is a full-stack web app, live in beta.",
    "Summer 2024: administrative assistant, MAC-RE LLC, Metairie.",
    "Studying CISA material in ISDS 4096 and CISSP material in ISDS 4070. Not certifications held.",
    "In progress: SAFe Scrum Master (Scaled Agile), CompTIA Network+, AWS Certified Cloud Practitioner.",
    "Other sites and projects: github.com/colinlee05. LinkedIn: colinlee05."
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function ogive(dist, L, radius) {
    if (dist <= 0) return 0.02;
    if (dist >= L) return radius;
    var rho = (radius * radius + L * L) / (2 * radius);
    var v = rho * rho - (L - dist) * (L - dist);
    return v > 0 ? Math.sqrt(v) + radius - rho : 0;
  }

  function shipRadius(y) {
    if (y >= SHIP - NOSE) return ogive(SHIP - y, NOSE, R);
    return R;
  }

  function project(p, cam) {
    var x = p.x - cam.lookX;
    var y = p.y - cam.lookY;
    var z = p.z || 0;
    var c = Math.cos(YAW);
    var s = Math.sin(YAW);
    var xr = x * c + z * s;
    var zr = -x * s + z * c;
    var k = cam.scale * (1 + zr * 0.01);
    return { x: cam.ox + xr * k, y: cam.oy - y * k };
  }

  function xform(p, pose) {
    if (!pose) return p;
    var dx = p.x - pose.pivotX;
    var dy = p.y - pose.pivotY;
    var a = (pose.rot || 0) * Math.PI / 180;
    var c = Math.cos(a);
    var s = Math.sin(a);
    return {
      x: pose.x + dx * c - dy * s,
      y: pose.y + dx * s + dy * c,
      z: (p.z || 0) + (pose.z || 0)
    };
  }

  function rotN(n, rot) {
    var a = (rot || 0) * Math.PI / 180;
    var c = Math.cos(a);
    var s = Math.sin(a);
    return { x: n.x * c - n.y * s, y: n.x * s + n.y * c, z: n.z };
  }

  function facing(n) {
    var s = Math.sin(YAW);
    var c = Math.cos(YAW);
    return -n.x * s + n.z * c;
  }

  function shade(n, y) {
    var f = facing(n);
    var key = Math.max(0, n.y * 0.55 + f);
    var rim = Math.max(0, n.x * 0.85 - f * 0.2);
    var flood = Math.max(0, 1 - y / 26) * 0.28;
    return Math.max(0.08, Math.min(1, 0.18 + key * 0.62 + rim * 0.22 + flood));
  }

  function line(arr, a, b, alpha, width) {
    arr.push({ a: a, b: b, alpha: alpha, w: width || 1 });
  }

  function cylRing(arr, y, r, alpha, width) {
    var n = 36;
    var i;
    for (i = 0; i < n; i++) {
      var t0 = (i / n) * Math.PI * 2;
      var t1 = ((i + 1) / n) * Math.PI * 2;
      if (Math.sin((t0 + t1) / 2) < -0.25) continue;
      line(arr,
        { x: r * Math.cos(t0), y: y, z: r * Math.sin(t0) },
        { x: r * Math.cos(t1), y: y, z: r * Math.sin(t1) },
        alpha, width);
    }
  }

  function silhouette(arr, y0, y1, radiusFn) {
    var steps = 48;
    var thR = YAW;
    var thL = YAW + Math.PI;
    var prevL = null;
    var prevR = null;
    var i;
    for (i = 0; i <= steps; i++) {
      var y = y0 + ((y1 - y0) * i) / steps;
      var r = radiusFn(y);
      var L = { x: r * Math.cos(thL), y: y, z: r * Math.sin(thL) };
      var Rt = { x: r * Math.cos(thR), y: y, z: r * Math.sin(thR) };
      if (prevL) line(arr, prevL, L, 0.95, 1.15);
      if (prevR) line(arr, prevR, Rt, 0.95, 1.15);
      prevL = L;
      prevR = Rt;
    }
  }

  function flap(arr, pts) {
    var i;
    for (i = 0; i < pts.length; i++) line(arr, pts[i], pts[(i + 1) % pts.length], 0.95, 1.25);
    var midH = {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2,
      z: (pts[0].z + pts[1].z) / 2
    };
    var midO = {
      x: (pts[2].x + pts[3].x) / 2,
      y: (pts[2].y + pts[3].y) / 2,
      z: (pts[2].z + pts[3].z) / 2
    };
    line(arr, midH, midO, 0.55, 0.9);
    line(arr, pts[0], midO, 0.28, 0.7);
    line(arr, pts[1], midO, 0.28, 0.7);
  }

  function mirrorFlap(pts) {
    return pts.map(function (p) { return { x: -p.x, y: p.y, z: p.z }; });
  }

  function buildShip() {
    var dots = [];
    var lines = [];
    var rng = mulberry32(0x51a1);
    var y;
    var th;
    for (y = 0.4; y <= SHIP; y += 0.48) {
      var rad = shipRadius(y);
      var dth = 0.5 / Math.max(0.4, rad);
      for (th = 0; th < Math.PI * 2; th += dth) {
        if (Math.sin(th) < -0.15 && rng() > 0.15) continue;
        var tile = y < SHIP - 1.2 && y > 6 && Math.abs(angleDiff(th, Math.PI)) < 1.02;
        dots.push({
          x: rad * Math.cos(th), y: y, z: rad * Math.sin(th),
          nx: Math.cos(th), ny: 0, nz: Math.sin(th),
          tile: tile ? 1 : 0
        });
      }
    }
    silhouette(lines, 0.2, SHIP - 0.05, shipRadius);
    var k;
    for (k = 1; k < 8; k++) cylRing(lines, (SHIP - NOSE) * k / 8, R, 0.55, 0.9);
    for (k = 1; k <= 6; k++) {
      var dist = (NOSE * k) / 7;
      cylRing(lines, SHIP - dist, ogive(dist, NOSE, R), 0.5, 0.8);
    }
    cylRing(lines, SHIP - 2.2, ogive(2.2, NOSE, R) * 0.92, 0.7, 1);
    line(lines, { x: 0, y: SHIP, z: 0 }, { x: 0.01, y: SHIP - 0.01, z: 0 }, 1, 1.2);

    var edge = 1.02;
    var ye;
    for (ye = 7; ye < SHIP - NOSE + 1; ye += 1.6) {
      line(lines,
        { x: R * Math.cos(Math.PI - edge), y: ye, z: R * Math.sin(Math.PI - edge) },
        { x: R * Math.cos(Math.PI - edge), y: ye + 1.5, z: R * Math.sin(Math.PI - edge) },
        0.85, 1.05);
      line(lines,
        { x: R * Math.cos(Math.PI + edge), y: ye, z: R * Math.sin(Math.PI + edge) },
        { x: R * Math.cos(Math.PI + edge), y: ye + 1.5, z: R * Math.sin(Math.PI + edge) },
        0.85, 1.05);
    }
    line(lines,
      { x: -R * 0.15, y: 2, z: R * 0.98 },
      { x: -R * 0.15, y: SHIP - NOSE, z: R * 0.98 },
      0.7, 1);
    line(lines,
      { x: R * 0.15, y: 2, z: R * 0.98 },
      { x: R * 0.15, y: SHIP - NOSE, z: R * 0.98 },
      0.55, 0.8);

    var fwd = [
      { x: R + 0.2, y: SHIP - 9.6, z: 0.35 },
      { x: R + 0.45, y: SHIP - 17.8, z: 0.2 },
      { x: R + 6.4, y: SHIP - 21.8, z: 1.15 },
      { x: R + 5.2, y: SHIP - 10.4, z: 1.45 }
    ];
    flap(lines, fwd);
    flap(lines, mirrorFlap(fwd));
    fairing(lines, fwd[0], fwd[1]);
    fairing(lines, { x: -fwd[0].x, y: fwd[0].y, z: fwd[0].z }, { x: -fwd[1].x, y: fwd[1].y, z: fwd[1].z });

    var aft = [
      { x: R + 0.25, y: 14.6, z: 0.4 },
      { x: R + 0.5, y: 2.6, z: 0.15 },
      { x: R + 7.6, y: 0.6, z: 1.05 },
      { x: R + 5.8, y: 13.2, z: 1.4 }
    ];
    flap(lines, aft);
    flap(lines, mirrorFlap(aft));
    fairing(lines, aft[0], aft[1]);
    fairing(lines, { x: -aft[0].x, y: aft[0].y, z: aft[0].z }, { x: -aft[1].x, y: aft[1].y, z: aft[1].z });

    addHex(lines);
    addShipEngines(lines, dots);
    return { dots: dots, lines: lines, pivotX: 0, pivotY: SHIP / 2 };
  }

  function angleDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function fairing(arr, top, bot) {
    var i;
    for (i = 0; i < 5; i++) {
      var t = i / 4;
      var y = top.y + (bot.y - top.y) * t;
      var x = top.x + (bot.x - top.x) * t;
      cylRing(arr, y, 0.01, 0, 0);
      line(arr,
        { x: x + 0.15, y: y, z: 0.15 },
        { x: x + 0.55, y: y, z: 0.45 },
        0.8, 1);
    }
    line(arr, { x: top.x + 0.35, y: top.y, z: 0.3 }, { x: bot.x + 0.35, y: bot.y, z: 0.3 }, 0.9, 1.3);
  }

  function addHex(arr) {
    var rad = R * 0.98;
    var span = 0.72;
    var y;
    var row = 0;
    for (y = 7.2; y < SHIP - NOSE + 2; y += 0.78) {
      var shift = (row % 2) * span * 0.5;
      row++;
      var s;
      for (s = -4.2 + shift; s <= 4.2; s += span) {
        var th = Math.PI + s / rad;
        if (Math.abs(s) > 4.15) continue;
        var cx = rad * Math.cos(th);
        var cz = rad * Math.sin(th);
        var hx = -Math.sin(th);
        var hz = Math.cos(th);
        var hr = 0.3;
        var pts = [];
        var k;
        for (k = 0; k < 6; k++) {
          var a = (Math.PI / 6) + (k / 6) * Math.PI * 2;
          pts.push({
            x: cx + Math.cos(a) * hr * hx,
            y: y + Math.sin(a) * hr,
            z: cz + Math.cos(a) * hr * hz
          });
        }
        for (k = 0; k < 6; k++) line(arr, pts[k], pts[(k + 1) % 6], 0.42, 0.7);
      }
    }
  }

  function addShipEngines(lines, dots) {
    var i;
    var vac = [
      { x: 0, z: 0.2 },
      { x: 0.9, z: -0.45 },
      { x: -0.9, z: -0.45 }
    ];
    var sl = [];
    for (i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2 + 0.4;
      sl.push({ x: Math.cos(a) * 2.15, z: Math.sin(a) * 2.15 });
    }
    vac.forEach(function (p) { bell(lines, dots, p.x, p.z, 1.3, 2.4, 0.72); });
    sl.forEach(function (p) { bell(lines, dots, p.x, p.z, 1.1, 1.55, 0.48); });
  }

  function bell(lines, dots, x, z, yTop, len, radius) {
    var n = 10;
    var i;
    for (i = 0; i < n; i++) {
      var t0 = (i / n) * Math.PI * 2;
      var t1 = ((i + 1) / n) * Math.PI * 2;
      line(lines,
        { x: x + Math.cos(t0) * radius * 0.45, y: yTop, z: z + Math.sin(t0) * radius * 0.45 },
        { x: x + Math.cos(t0) * radius, y: yTop - len, z: z + Math.sin(t0) * radius },
        0.8, 0.9);
      line(lines,
        { x: x + Math.cos(t0) * radius, y: yTop - len, z: z + Math.sin(t0) * radius },
        { x: x + Math.cos(t1) * radius, y: yTop - len, z: z + Math.sin(t1) * radius },
        0.85, 0.9);
    }
    var k;
    for (k = 0; k < 8; k++) {
      var a = Math.random() * Math.PI * 2;
      dots.push({
        x: x + Math.cos(a) * radius * 0.7,
        y: yTop - len * (0.3 + Math.random() * 0.7),
        z: z + Math.sin(a) * radius * 0.7,
        nx: Math.cos(a), ny: -0.4, nz: Math.sin(a), tile: 0
      });
    }
  }

  function buildBooster() {
    var dots = [];
    var lines = [];
    var rng = mulberry32(0xb007);
    var y;
    var th;
    for (y = 2.2; y <= BOOST - HOT; y += 0.5) {
      var dth = 0.52 / R;
      for (th = 0; th < Math.PI * 2; th += dth) {
        if (Math.sin(th) < -0.18 && rng() > 0.12) continue;
        dots.push({
          x: R * Math.cos(th), y: y, z: R * Math.sin(th),
          nx: Math.cos(th), ny: 0, nz: Math.sin(th), tile: 0
        });
      }
    }
    silhouette(lines, 2.4, BOOST - HOT, function () { return R; });
    var yy = 3.2;
    while (yy < BOOST - HOT) {
      cylRing(lines, yy, R, 0.62, 0.95);
      yy += 1.83;
    }
    var s;
    for (s = 0; s < 6; s++) {
      var ths = YAW + 0.5 + s * 0.42;
      line(lines,
        { x: R * Math.cos(ths), y: 4, z: R * Math.sin(ths) },
        { x: R * Math.cos(ths), y: BOOST - HOT - 1, z: R * Math.sin(ths) },
        0.28, 0.7);
    }
    line(lines,
      { x: R * 0.72, y: 5, z: R * 0.72 },
      { x: R * 0.78, y: BOOST - 8, z: R * 0.7 },
      0.75, 1.05);
    line(lines,
      { x: R * 0.55, y: 5, z: R * 0.82 },
      { x: R * 0.6, y: BOOST - 8, z: R * 0.8 },
      0.45, 0.8);

    skirt(lines);
    hotStage(lines, dots);
    gridFins(lines);
    catchPins(lines);
    boosterEngines(lines, dots);
    var c;
    for (c = 0; c < 8; c++) {
      var a = (c / 8) * Math.PI * 2;
      if (Math.sin(a) < 0) continue;
      cylRing(lines, 6.2, 0.01, 0, 0);
      var cr = 0.45;
      ringSmall(lines, R * 0.82 * Math.cos(a), 6.4, R * 0.82 * Math.sin(a), cr);
    }
    return { dots: dots, lines: lines, pivotX: 0, pivotY: BOOST / 2 };
  }

  function ringSmall(arr, x, y, z, r) {
    var n = 8;
    var i;
    for (i = 0; i < n; i++) {
      var t0 = (i / n) * Math.PI * 2;
      var t1 = ((i + 1) / n) * Math.PI * 2;
      line(arr,
        { x: x + Math.cos(t0) * r, y: y, z: z + Math.sin(t0) * r * 0.6 },
        { x: x + Math.cos(t1) * r, y: y, z: z + Math.sin(t1) * r * 0.6 },
        0.6, 0.8);
    }
  }

  function skirt(arr) {
    var y0 = 5.6;
    var y1 = 8.4;
    var i;
    for (i = 0; i <= 16; i++) {
      var t = (i / 16) * Math.PI * 2;
      if (Math.sin(t) < -0.2) continue;
      var r0 = R * 1.02;
      var r1 = R * 1.18;
      line(arr,
        { x: r0 * Math.cos(t), y: y1, z: r0 * Math.sin(t) },
        { x: r1 * Math.cos(t), y: y0, z: r1 * Math.sin(t) },
        0.75, 0.9);
    }
    cylRing(arr, y0, R * 1.18, 0.8, 1);
    cylRing(arr, y1, R * 1.02, 0.7, 0.9);
  }

  function hotStage(lines, dots) {
    var y0 = BOOST - HOT;
    var y1 = BOOST - 0.15;
    var r = R * 1.06;
    var n = 14;
    var i;
    cylRing(lines, y0, r, 0.9, 1.15);
    cylRing(lines, y1, r, 0.9, 1.15);
    for (i = 0; i < n; i++) {
      var t = (i / n) * Math.PI * 2;
      if (Math.sin(t) < -0.3) continue;
      var open = i % 2 === 0;
      line(lines,
        { x: r * Math.cos(t), y: y0, z: r * Math.sin(t) },
        { x: r * Math.cos(t), y: y1, z: r * Math.sin(t) },
        open ? 0.9 : 0.35, 1);
      if (!open) {
        var y;
        for (y = y0; y < y1; y += 0.3) {
          dots.push({
            x: r * Math.cos(t), y: y, z: r * Math.sin(t),
            nx: Math.cos(t), ny: 0, nz: Math.sin(t), tile: 0
          });
        }
      }
    }
  }

  function gridFins(arr) {
    var angles = [0.95, 2.25, 3.85, 5.35];
    angles.forEach(function (phi) {
      var y0 = BOOST - 9.4;
      var y1 = y0 + 4.4;
      var inner = R * 0.9;
      var outer = R + 4.6;
      var ox = Math.cos(phi);
      var oz = Math.sin(phi);
      var px = -oz;
      var pz = ox;
      function corner(rad, y, side) {
        return {
          x: ox * rad + px * side,
          y: y,
          z: oz * rad + pz * side
        };
      }
      var thick = 0.18;
      line(arr, corner(inner, y0, -thick), corner(outer, y0, -thick), 0.95, 1.1);
      line(arr, corner(outer, y0, -thick), corner(outer, y1, -thick), 0.95, 1.1);
      line(arr, corner(outer, y1, -thick), corner(inner, y1, -thick), 0.95, 1.1);
      line(arr, corner(inner, y1, -thick), corner(inner, y0, -thick), 0.95, 1.1);
      var g;
      for (g = 1; g <= 4; g++) {
        var y = y0 + ((y1 - y0) * g) / 5;
        line(arr, corner(inner, y, 0), corner(outer, y, 0), 0.92, 1);
      }
      for (g = 1; g <= 4; g++) {
        var rad = inner + ((outer - inner) * g) / 5;
        line(arr, corner(rad, y0, 0), corner(rad, y1, 0), 0.92, 1);
      }
    });
  }

  function catchPins(arr) {
    var angles = [1.3, 2.9, 4.5, 6.0];
    angles.forEach(function (phi) {
      var ox = Math.cos(phi);
      var oz = Math.sin(phi);
      var y = BOOST - 6.4;
      line(arr,
        { x: ox * R, y: y, z: oz * R },
        { x: ox * (R + 0.7), y: y, z: oz * (R + 0.7) },
        0.9, 1.4);
      line(arr,
        { x: ox * (R + 0.7), y: y - 0.35, z: oz * (R + 0.7) },
        { x: ox * (R + 0.7), y: y + 0.35, z: oz * (R + 0.7) },
        0.9, 1.3);
    });
  }

  function boosterEngines(lines, dots) {
    var rings = [
      { n: 20, rad: 3.85, len: 3.1, bell: 0.62 },
      { n: 10, rad: 2.2, len: 2.6, bell: 0.55 },
      { n: 3, rad: 0.75, len: 2.8, bell: 0.58 }
    ];
    rings.forEach(function (ring) {
      var i;
      for (i = 0; i < ring.n; i++) {
        var a = (i / ring.n) * Math.PI * 2 + 0.1;
        if (Math.sin(a) < -0.05 && ring.n > 3) continue;
        bell(lines, dots, Math.cos(a) * ring.rad, Math.sin(a) * ring.rad, 5.4, ring.len + 1.1, ring.bell + 0.12);
      }
    });
  }

  function buildTowerLines(cx) {
    var arr = [];
    var hw = 4.1;
    var corners = [
      { x: cx - hw, z: -hw },
      { x: cx + hw, z: -hw },
      { x: cx + hw, z: hw },
      { x: cx - hw, z: hw }
    ];
    var i;
    corners.forEach(function (c) {
      line(arr, { x: c.x, y: 0, z: c.z }, { x: c.x, y: TOWER, z: c.z }, 0.9, 1.15);
    });
    var bay = 7.4;
    var y;
    for (y = bay; y < TOWER; y += bay) {
      var f;
      for (f = 0; f < 4; f++) {
        var a = corners[f];
        var b = corners[(f + 1) % 4];
        line(arr, { x: a.x, y: y, z: a.z }, { x: b.x, y: y, z: b.z }, 0.55, 0.9);
        line(arr, { x: a.x, y: y - bay, z: a.z }, { x: b.x, y: y, z: b.z }, 0.38, 0.75);
        line(arr, { x: b.x, y: y - bay, z: b.z }, { x: a.x, y: y, z: a.z }, 0.38, 0.75);
      }
    }
    line(arr, { x: cx, y: TOWER, z: 0 }, { x: cx, y: TOWER + 7, z: 0 }, 0.85, 1.1);
    line(arr, { x: cx - 3.2, y: TOWER + 1.2, z: 0.4 }, { x: cx + 4.5, y: TOWER + 1.2, z: 0.4 }, 0.7, 1);
    line(arr, { x: cx, y: TOWER + 7, z: 0 }, { x: cx + 1.4, y: TOWER + 5.2, z: 0 }, 0.6, 0.8);
    return arr;
  }

  function buildPadLines() {
    var arr = [];
    var y = DECK;
    cylRing(arr, y, 11.2, 0.85, 1.2);
    cylRing(arr, y + 0.8, 10.4, 0.55, 0.8);
    cylRing(arr, y, 5.4, 0.7, 1);
    var i;
    for (i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + 0.3;
      line(arr,
        { x: Math.cos(a) * 9.5, y: y, z: Math.sin(a) * 9.5 },
        { x: Math.cos(a) * 16, y: 0, z: Math.sin(a) * 16 },
        0.8, 1.15);
      line(arr,
        { x: Math.cos(a) * 9.2, y: y + 1.1, z: Math.sin(a) * 9.2 },
        { x: Math.cos(a) * 7.4, y: y + 1.1, z: Math.sin(a) * 7.4 },
        0.75, 1.2);
    }
    for (i = 0; i < 16; i++) {
      var t = (i / 16) * Math.PI * 2;
      if (Math.sin(t) < -0.2) continue;
      line(arr,
        { x: Math.cos(t) * 8.2, y: y + 0.2, z: Math.sin(t) * 8.2 },
        { x: Math.cos(t) * 8.2, y: y + 1.5, z: Math.sin(t) * 8.2 },
        0.65, 1);
    }
    line(arr, { x: -4, y: 1.2, z: 8 }, { x: 14, y: 0.3, z: 18 }, 0.45, 1.2);
    line(arr, { x: -2, y: 2.4, z: 7 }, { x: 16, y: 0.6, z: 16 }, 0.35, 1);
    line(arr, { x: 14, y: 0.3, z: 18 }, { x: 18, y: 0, z: 14 }, 0.4, 1);
    var tanks = [-42, -38, -34.5, -31];
    tanks.forEach(function (x, idx) {
      var h = 7 + (idx % 3) * 3;
      line(arr, { x: x, y: 0, z: -6 }, { x: x, y: h, z: -6 }, 0.28, 0.8);
      line(arr, { x: x + 1.4, y: 0, z: -6 }, { x: x + 1.4, y: h - 0.4, z: -6 }, 0.22, 0.7);
    });
    line(arr, { x: -48, y: 0, z: 4 }, { x: -48, y: 28, z: 4 }, 0.25, 0.7);
    line(arr, { x: -50, y: 26, z: 4 }, { x: -46, y: 26, z: 4 }, 0.22, 0.7);
    return arr;
  }

  function create(w, h, cramped) {
    var ship = buildShip();
    var booster = buildBooster();
    var towerX = -21;
    var tower = buildTowerLines(towerX);
    var pad = buildPadLines();
    var marginTop = cramped ? 96 : 76;
    var marginBot = cramped ? 176 : 46;
    var scale = (h - marginTop - marginBot) / (TOWER + 8);
    var cam = {
      scale: scale,
      ox: w * (cramped ? 0.6 : 0.5),
      oy: h - marginBot,
      lookX: 0,
      lookY: 0,
      yaw: YAW
    };
    var ui = layoutUI(cam, w, h, cramped);
    return {
      w: w, h: h, cramped: cramped,
      ship: ship, booster: booster, tower: tower, pad: pad,
      towerX: towerX,
      cam0: cam,
      ui: ui,
      mission: null,
      rng: mulberry32(0x11fe)
    };
  }

  function layoutUI(cam, w, h, cramped) {
    function P(x, y, z) { return project({ x: x, y: y, z: z || 0 }, cam); }
    var tip = P(0, BELL + BOOST + SHIP, 0);
    var ground = P(0, 0, 0);
    var mid = P(0, 80, 0);
    var side = P(11, 90, 0);
    var towerL = P(-21 - 4.1, 120, 0);
    var compW = cramped ? 58 : 86;
    var compH = compW * 0.72;
    var compAnchor = P(cramped ? 16 : 30, 0, 8);
    var comp = {
      x: Math.min(w - compW - 16, compAnchor.x + 8),
      y: ground.y - compH - 6,
      w: compW,
      h: compH
    };
    var bezel = Math.max(6, compW * 0.1);
    return {
      yTip: tip.y,
      base: ground.y,
      cx: mid.x,
      hw: Math.abs(side.x - mid.x),
      leftReach: towerL.x,
      rightReach: side.x,
      comp: comp,
      screen: {
        x: comp.x + bezel,
        y: comp.y + bezel * 0.55,
        w: comp.w - bezel * 2,
        h: Math.max(16, comp.h * 0.52)
      },
      anchors: {
        nose: { x: tip.x + 8, y: tip.y + 4 },
        tower: { x: towerL.x, y: P(-21, 130, 0).y },
        booster: { x: towerL.x, y: P(-21, BELL + 30, 0).y },
        pad: { x: P(-8, DECK, 0).x, y: P(-8, DECK, 0).y },
        flap: { x: P(9.2, BELL + BOOST + SHIP - 16, 0).x, y: P(9.2, BELL + BOOST + SHIP - 16, 0).y },
        hull: { x: P(R, BELL + BOOST + 24, 0).x, y: P(R, BELL + BOOST + 24, 0).y },
        aft: { x: P(10, BELL + BOOST + 8, 0).x, y: P(10, BELL + BOOST + 8, 0).y },
        fin: { x: P(8.2, BELL + BOOST - 6, 0).x, y: P(8.2, BELL + BOOST - 6, 0).y },
        terminal: { x: comp.x + comp.w, y: comp.y + comp.h * 0.35 }
      },
      engines: [P(0, BELL, 2)],
      deckY: P(0, DECK, 0).y
    };
  }

  function padPose() {
    return {
      ship: { x: 0, y: BELL + BOOST + SHIP / 2, rot: 0, pivotX: 0, pivotY: SHIP / 2, thrust: 0, plasma: 0 },
      booster: { x: 0, y: BELL + BOOST / 2, rot: 0, pivotX: 0, pivotY: BOOST / 2, thrust: 0 },
      qd: 0,
      clamps: 0,
      steam: 0,
      sticksOpen: 0.72,
      sticksY: BELL + BOOST - 2,
      scene: "pad",
      blend: 0,
      ang: 0,
      deorbit: 0,
      tower2: 0
    };
  }

  function poseAt(model, t) {
    var pose = padPose();
    var cam = {
      scale: model.cam0.scale,
      ox: model.cam0.ox,
      oy: model.cam0.oy,
      lookX: 0,
      lookY: 0
    };
    var beat = "Pad.";
    if (t < 1.7) {
      pose.qd = t / 1.7;
      beat = "Ship quick-disconnect swinging clear.";
    } else if (t < 3.4) {
      pose.qd = 1;
      var u = (t - 1.7) / 1.7;
      pose.clamps = u;
      pose.steam = u;
      pose.booster.thrust = u;
      beat = "Engines lighting. Deluge on the mount.";
    } else if (t < 8.2) {
      pose.qd = 1;
      pose.clamps = 1;
      pose.steam = 1;
      pose.booster.thrust = 1;
      var u2 = (t - 3.4) / 4.8;
      var rise = u2 * u2 * 70;
      pose.ship.y += rise;
      pose.booster.y += rise;
      cam.lookY = rise * 0.55;
      cam.scale = model.cam0.scale * (1 - u2 * 0.28);
      beat = "Liftoff.";
    } else if (t < 11.2) {
      pose.qd = 1;
      pose.clamps = 1;
      var u3 = (t - 8.2) / 3;
      var baseRise = 70;
      pose.booster.y += baseRise + u3 * 10;
      pose.booster.thrust = 1 - u3 * 0.7;
      pose.ship.y += baseRise + 18 + u3 * 48;
      pose.ship.thrust = 1;
      cam.lookY = 46;
      cam.scale = model.cam0.scale * 0.7;
      beat = "Hot staging. Ship separates.";
    } else if (t < 19) {
      var u4 = (t - 11.2) / 7.8;
      pose.ship.y = BELL + BOOST + SHIP / 2 + 150 + u4 * 70;
      pose.ship.thrust = u4 < 0.25 ? 0.8 : 0;
      var rot = u4 < 0.32 ? (u4 / 0.32) * 165 : u4 < 0.62 ? 165 - ((u4 - 0.32) / 0.3) * 165 : 0;
      pose.booster.rot = rot;
      pose.booster.thrust = u4 < 0.78 ? 1 : 0.35;
      pose.booster.x = -11 * Math.min(1, u4 * 1.15);
      pose.booster.y = BELL + BOOST / 2 + 90 * (1 - smooth(Math.min(1, (u4 - 0.15) / 0.85)));
      pose.sticksY = pose.booster.y + 8;
      pose.sticksOpen = u4 < 0.72 ? 0.85 : 0.85 - ((u4 - 0.72) / 0.28) * 0.7;
      cam.lookX = -8;
      cam.lookY = 40;
      cam.scale = model.cam0.scale * 0.58;
      beat = u4 < 0.45 ? "Booster flips and boosts back." : "Chopsticks close. Booster caught.";
    } else if (t < 22.2) {
      pose.scene = "blend";
      pose.blend = (t - 19) / 3.2;
      pose.ship.y = BELL + BOOST + SHIP / 2 + 230;
      cam.scale = model.cam0.scale * (0.58 - pose.blend * 0.4);
      cam.lookY = 80;
      beat = "Ship continues. The view pulls out.";
    } else if (t < 34) {
      pose.scene = "earth";
      pose.ang = ((t - 22.2) / 12) * Math.PI * 1.55;
      pose.deorbit = t > 31.5 ? (t - 31.5) / 2.5 : 0;
      beat = t < 31.5 ? "On orbit. Payloads away." : "Deorbit burn.";
    } else if (t < 43.5) {
      pose.scene = "landing";
      var u5 = (t - 34) / 9.5;
      pose.plasma = u5 < 0.42 ? u5 / 0.42 : u5 < 0.62 ? 1 - (u5 - 0.42) / 0.2 : 0;
      pose.ship.rot = u5 < 0.55 ? 92 : 92 - ((u5 - 0.55) / 0.2) * 92;
      if (pose.ship.rot < 0) pose.ship.rot = 0;
      pose.ship.thrust = u5 > 0.62 ? 1 : 0;
      var landY = 70 + (1 - smooth(Math.max(0, (u5 - 0.5) / 0.45))) * 80;
      pose.ship.x = 0;
      pose.ship.y = landY;
      pose.sticksOpen = u5 < 0.78 ? 0.8 : 0.8 - ((u5 - 0.78) / 0.22) * 0.65;
      pose.sticksY = landY;
      pose.tower2 = 1;
      beat = u5 < 0.4 ? "Reentry. Heat shield takes the plasma." : u5 < 0.6 ? "Belly-flop." : u5 < 0.8 ? "Flip and landing burn." : "Caught on the second tower.";
    } else if (t < 46.5) {
      pose.scene = "blendback";
      pose.blend = (t - 43.5) / 3;
      beat = "Back on the pad.";
    } else {
      pose.done = true;
      beat = "Back on the pad.";
    }
    pose.beat = beat;
    pose.cam = cam;
    pose.t = t;
    return pose;
  }

  function smooth(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function start(model, now) {
    model.mission = { t0: now };
  }

  function stop(model) {
    model.mission = null;
  }

  function active(model) {
    return !!(model && model.mission);
  }

  function paint(ctx, model, now) {
    var pose = model.mission ? poseAt(model, (now - model.mission.t0) / 1000) : padPose();
    if (pose.done) {
      model.mission = null;
      pose = padPose();
    }
    model.last = pose;
    if (pose.scene === "earth") {
      drawEarth(ctx, model, pose);
      return;
    }
    if (pose.scene === "blend") {
      drawPad(ctx, model, pose);
      ctx.save();
      ctx.globalAlpha = pose.blend;
      drawEarth(ctx, model, { ang: 0.2, deorbit: 0, t: pose.t });
      ctx.restore();
      return;
    }
    if (pose.scene === "blendback") {
      if (pose.blend > 0.8) {
        drawPad(ctx, model, padPose());
        return;
      }
      drawLanding(ctx, model, poseAt(model, 43.4));
      ctx.save();
      ctx.globalAlpha = pose.blend;
      drawPad(ctx, model, padPose());
      ctx.restore();
      return;
    }
    if (pose.scene === "landing") {
      drawLanding(ctx, model, pose);
      return;
    }
    drawPad(ctx, model, pose);
  }

  function drawPad(ctx, model, pose) {
    var cam = pose.cam || model.cam0;
    strokeAll(ctx, model.pad, null, cam, 1);
    strokeAll(ctx, model.tower, null, cam, 1);
    if (!model.cramped) strokeAll(ctx, buildTowerLines(42), null, cam, 0.18);
    drawBody(ctx, model.booster, pose.booster, cam, 1);
    drawBody(ctx, model.ship, pose.ship, cam, 1);
    drawChopsticks(ctx, cam, model.towerX, pose.sticksY, pose.sticksOpen, 1);
    drawQD(ctx, cam, model.towerX, pose.qd, pose.ship);
    drawClamps(ctx, cam, pose.clamps);
    if (pose.steam > 0.05) drawSteam(ctx, cam, pose.steam);
    if (pose.booster.thrust > 0.05) drawExhaust(ctx, cam, pose.booster, 2.2, pose.booster.thrust, model);
    if (pose.ship.thrust > 0.05) drawExhaust(ctx, cam, pose.ship, 0.4, pose.ship.thrust * 0.7, model);
    if (pose.plasma > 0.05) drawPlasma(ctx, model.ship, pose.ship, cam, pose.plasma);
    if (!model.mission) drawComputer(ctx, model);
  }

  function drawLanding(ctx, model, pose) {
    var cam = {
      scale: model.cam0.scale * 0.72,
      ox: model.w * 0.58,
      oy: model.h * 0.78,
      lookX: 0,
      lookY: 40
    };
    var tower = buildTowerLines(-16);
    strokeAll(ctx, tower, null, cam, 1);
    strokeAll(ctx, model.pad, null, cam, 0.8);
    drawBody(ctx, model.ship, pose.ship, cam, 1);
    drawChopsticks(ctx, cam, -16, pose.sticksY, pose.sticksOpen, 1);
    if (pose.ship.thrust > 0.05) drawExhaust(ctx, cam, pose.ship, 1.2, pose.ship.thrust, model);
    if (pose.plasma > 0.05) drawPlasma(ctx, model.ship, pose.ship, cam, pose.plasma);
  }

  function drawBody(ctx, body, pose, cam, alpha) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < body.dots.length; i++) {
      var d = body.dots[i];
      var n = rotN(d, pose.rot);
      if (facing(n) < -0.08) continue;
      var p = project(xform(d, pose), cam);
      var lit = shade(n, d.y);
      if (d.tile) lit *= 0.42;
      ctx.globalAlpha = alpha * (0.25 + lit * 0.75);
      ctx.fillRect(p.x, p.y, lit > 0.75 ? 1.4 : 1, lit > 0.75 ? 1.4 : 1);
    }
    strokeAll(ctx, body.lines, pose, cam, alpha);
  }

  function strokeAll(ctx, lines, pose, cam, alpha) {
    var i;
    ctx.lineCap = "round";
    ctx.strokeStyle = INK;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln.alpha <= 0) continue;
      var a = project(pose ? xform(ln.a, pose) : ln.a, cam);
      var b = project(pose ? xform(ln.b, pose) : ln.b, cam);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.globalAlpha = alpha * ln.alpha;
      ctx.lineWidth = ln.w;
      ctx.stroke();
    }
  }

  function drawChopsticks(ctx, cam, towerX, y, open, alpha) {
    var face = towerX + 4.1;
    var gap = 1.3 + open * 3.6;
    var reach = 10.4;
    [y - gap, y + gap].forEach(function (yy) {
      [-0.42, 0, 0.42].forEach(function (off) {
        strokeAll(ctx, [{
          a: { x: face, y: yy + off, z: 0.5 },
          b: { x: face + reach, y: yy + off * 0.6, z: 1.3 },
          alpha: off === 0 ? 0.95 : 0.7,
          w: 1.35
        }], null, cam, alpha);
      });
      strokeAll(ctx, [{
        a: { x: face + reach, y: yy - 0.5, z: 1.3 },
        b: { x: face + reach, y: yy + 0.5, z: 1.3 },
        alpha: 0.9, w: 1.4
      }], null, cam, alpha);
    });
    strokeAll(ctx, [
      { a: { x: face - 0.2, y: y - gap - 1.2, z: 1 }, b: { x: face - 0.2, y: y + gap + 1.4, z: 1 }, alpha: 0.8, w: 1.3 },
      { a: { x: face + 0.15, y: 8, z: 2.2 }, b: { x: face + 0.15, y: 130, z: 2.2 }, alpha: 0.45, w: 0.9 },
      { a: { x: face + 0.8, y: 8, z: 2.6 }, b: { x: face + 0.8, y: 130, z: 2.6 }, alpha: 0.35, w: 0.8 }
    ], null, cam, alpha);
  }

  function drawQD(ctx, cam, towerX, retract, shipPose) {
    var pivot = { x: towerX + 4.3, y: BELL + BOOST + 16, z: 1.4 };
    var attached = { x: -R - 0.2, y: 18, z: 0.4 };
    var worldTip = xform(attached, shipPose);
    var parked = { x: towerX + 3.2, y: pivot.y + 10, z: 2.4 };
    var tip = {
      x: worldTip.x + (parked.x - worldTip.x) * retract,
      y: worldTip.y + (parked.y - worldTip.y) * retract,
      z: worldTip.z + (parked.z - worldTip.z) * retract
    };
    strokeAll(ctx, [
      { a: pivot, b: tip, alpha: 0.9, w: 1.25 },
      { a: { x: tip.x, y: tip.y - 0.6, z: tip.z }, b: { x: tip.x, y: tip.y + 0.8, z: tip.z }, alpha: 0.8, w: 1.3 }
    ], null, cam, 1);
  }

  function drawClamps(ctx, cam, open) {
    var i;
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      if (Math.sin(a) < -0.15) continue;
      var x = Math.cos(a) * 6.2;
      var z = Math.sin(a) * 6.2;
      var spread = open * 1.4;
      strokeAll(ctx, [{
        a: { x: x, y: DECK + 1.2, z: z },
        b: { x: x + Math.cos(a) * spread, y: DECK + 1.2 + open * 1.6, z: z + Math.sin(a) * spread },
        alpha: 0.85, w: 1.2
      }], null, cam, 1);
    }
  }

  function drawSteam(ctx, cam, amount) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 80 * amount; i++) {
      var a = Math.random() * Math.PI * 2;
      var rr = Math.random() * 14;
      var p = project({
        x: Math.cos(a) * rr,
        y: DECK + Math.random() * 10 * amount,
        z: Math.sin(a) * rr
      }, cam);
      ctx.globalAlpha = (1 - rr / 14) * 0.35 * amount;
      ctx.fillRect(p.x, p.y, 1.6, 1.6);
    }
  }

  function drawExhaust(ctx, cam, pose, localY, power, model) {
    var origin = xform({ x: 0, y: localY, z: 0 }, pose);
    var dir = xform({ x: 0, y: localY - 1, z: 0 }, pose);
    var dx = dir.x - origin.x;
    var dy = dir.y - origin.y;
    var i;
    ctx.fillStyle = INK;
    var n = Math.floor(70 * power);
    for (i = 0; i < n; i++) {
      var k = Math.random();
      var spread = k * k * 5.5;
      var side = (Math.random() - 0.5) * spread;
      var p = project({
        x: origin.x + dx * (0.4 + k * 8) + side,
        y: origin.y + dy * (0.4 + k * 8),
        z: (Math.random() - 0.5) * spread
      }, cam);
      ctx.globalAlpha = (1 - k) * 0.55 * power;
      ctx.fillRect(p.x, p.y, k > 0.65 ? 2.2 : 1.2, k > 0.65 ? 2.2 : 1.2);
    }
    if (model) model._exhaust = n;
  }

  function drawPlasma(ctx, body, pose, cam, amount) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 50 * amount; i++) {
      var y = 8 + Math.random() * (SHIP - 12);
      var th = Math.PI + (Math.random() - 0.5) * 1.4;
      var rad = shipRadius(y) + Math.random() * 0.8;
      var p = project(xform({
        x: rad * Math.cos(th),
        y: y,
        z: rad * Math.sin(th)
      }, pose), cam);
      ctx.globalAlpha = 0.35 * amount * Math.random();
      ctx.fillRect(p.x - 1, p.y, 3, 1.2);
    }
  }

  function drawComputer(ctx, model) {
    var c = model.ui.comp;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x, c.y, c.w, c.h * 0.72);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(c.x + 1, c.y + c.h, 8, 1);
    var neck = c.x + c.w * 0.42;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(neck, c.y + c.h * 0.72);
    ctx.lineTo(neck + 4, c.y + c.h + 8);
    ctx.lineTo(neck + c.w * 0.28, c.y + c.h + 8);
    ctx.stroke();
    ctx.strokeRect(c.x - 4, c.y + c.h + 8, c.w + 10, 7);
    var row;
    var col;
    ctx.globalAlpha = 0.8;
    for (row = 0; row < 2; row++) {
      for (col = 0; col < 8; col++) ctx.fillRect(c.x + 2 + col * ((c.w - 4) / 8), c.y + c.h + 10 + row * 2.4, 2, 1.5);
    }
    if (!model.cramped) {
      var rx = c.x + c.w + 8;
      ctx.globalAlpha = 0.75;
      ctx.strokeRect(rx, c.y + 6, 16, c.h * 0.7);
      var b;
      for (b = 1; b < 6; b++) {
        ctx.beginPath();
        ctx.moveTo(rx + 2, c.y + 6 + (c.h * 0.7 * b) / 6);
        ctx.lineTo(rx + 14, c.y + 6 + (c.h * 0.7 * b) / 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawEarth(ctx, model, pose) {
    var cx = model.w * 0.5;
    var cy = model.h * (model.cramped ? 0.42 : 0.48);
    var radius = Math.min(model.w, model.h) * (model.cramped ? 0.24 : 0.3);
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 900; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rr = Math.sqrt(Math.random()) * radius;
      var x = cx + Math.cos(ang) * rr;
      var y = cy + Math.sin(ang) * rr * 0.96;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > radius * radius) continue;
      ctx.globalAlpha = 0.15 + Math.random() * 0.55;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * 0.98, 0, 0, Math.PI * 2);
    ctx.stroke();
    var a = pose.ang || 0.4;
    var orbit = radius + (model.cramped ? 26 : 36);
    var sx = cx + Math.cos(a) * orbit;
    var sy = cy + Math.sin(a) * orbit * 0.42;
    ctx.globalAlpha = 0.95;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(3, 6);
    ctx.lineTo(-3, 6);
    ctx.closePath();
    ctx.stroke();
    if (pose.deorbit > 0) {
      ctx.globalAlpha = 0.6 * pose.deorbit;
      ctx.fillRect(-1, 6, 2, 8);
    }
    ctx.restore();
    model._shipScreen = { x: sx, y: sy };
    model._cards = cardsFor(pose, model, sx, sy);
  }

  function cardsFor(pose, model, sx, sy) {
    if (!pose || pose.scene !== "earth" || pose.t < 23.5) return [];
    var n = Math.min(FACTS.length, Math.floor((pose.t - 23.5) / 1.15) + 1);
    var out = [];
    var i;
    for (i = 0; i < n; i++) {
      var col = model.cramped ? 12 : model.w * 0.62;
      var row = model.cramped ? 78 + i * 46 : 90 + (i % 4) * 78;
      var x = model.cramped ? col : col + (i > 3 ? 210 : 0);
      out.push({ text: FACTS[i], x: x, y: Math.min(row, model.h - 120), fromX: sx, fromY: sy });
    }
    return out;
  }

  function drawShadow(ctx, cam) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 30; i++) {
      var p = project({ x: (Math.random() - 0.5) * 10, y: 0.2, z: (Math.random() - 0.5) * 8 }, cam);
      ctx.globalAlpha = 0.08;
      ctx.fillRect(p.x, p.y, 2, 1);
    }
  }

  global.Vehicle = {
    create: create,
    paint: paint,
    start: start,
    stop: stop,
    active: active,
    FACTS: FACTS
  };
})(window);
