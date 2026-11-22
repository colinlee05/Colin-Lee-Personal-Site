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
    var persp = zr * 0.006;
    if (persp > 0.1) persp = 0.1;
    if (persp < -0.1) persp = -0.1;
    var k = cam.scale * (1 + persp);
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

  /* Forward and aft flaps. Hinge azimuth 0 is leeward (+X), PI is the tiled
     windward belly. Real hinges sit just leeward of the port and starboard
     edges; the planform folds toward the lee side, so neither flap grows out
     of the heat shield. Coordinates are meters in the ship frame. */
  function addFlap(lines, dots, spec) {
    var phi = spec.phi;
    var nx = Math.cos(phi);
    var nz = Math.sin(phi);
    var lee = spec.lee;
    var ox = nx * (1 - lee) + lee;
    var oz = nz * (1 - lee);
    var ol = Math.hypot(ox, oz) || 1;
    ox /= ol;
    oz /= ol;
    var bx = oz;
    var bz = -ox;
    var thick = spec.thick;
    var N = 9;

    function at(y, span, side) {
      var hull = shipRadius(y);
      var td = thick * side;
      return {
        x: nx * (hull + 0.06) + ox * span + bx * td,
        y: y + side * thick * 0.65,
        z: nz * (hull + 0.06) + oz * span + bz * td
      };
    }
    function rootY(c) { return spec.yLE + (spec.yTE - spec.yLE) * c; }
    function tipY(c) {
      var tipLE = spec.yLE - spec.sweep;
      var tipTE = tipLE - spec.tipChord;
      return tipLE + (tipTE - tipLE) * c;
    }
    function rootSpan(c) {
      return spec.rootGap + Math.sin(c * Math.PI) * spec.fillet;
    }
    function tipSpan(c) {
      return spec.spanLE + (spec.spanTE - spec.spanLE) * c;
    }

    var outline = [];
    var i;
    for (i = 0; i <= N; i++) outline.push(at(tipY(i / N), tipSpan(i / N), 1));
    for (i = N; i >= 0; i--) outline.push(at(rootY(i / N), rootSpan(i / N), 1));
    if (spec.ghost) {
      for (i = 0; i < N; i++) {
        line(lines, outline[i], outline[i + 1], 0.42, 0.9);
      }
      line(lines, outline[0], outline[outline.length - 1], 0.28, 0.8);
      return;
    }
    for (i = 0; i < outline.length; i++) {
      line(lines, outline[i], outline[(i + 1) % outline.length], 0.98, 1.35);
    }
    for (i = 0; i < N; i++) {
      var u0 = i / N;
      var u1 = (i + 1) / N;
      line(lines, at(tipY(u0), tipSpan(u0), -1), at(tipY(u1), tipSpan(u1), -1), 0.72, 1);
      line(lines, at(rootY(u0), rootSpan(u0), -1), at(rootY(u1), rootSpan(u1), -1), 0.4, 0.75);
    }
    line(lines, at(tipY(0), tipSpan(0), 1), at(tipY(0), tipSpan(0), -1), 0.9, 1.15);
    line(lines, at(tipY(1), tipSpan(1), 1), at(tipY(1), tipSpan(1), -1), 0.9, 1.15);
    var rib;
    for (rib = 1; rib <= 3; rib++) {
      var u = rib / 4;
      line(lines, at(rootY(u), rootSpan(u), 1), at(tipY(u), tipSpan(u), 1), 0.62, 0.85);
      line(lines, at(rootY(u), rootSpan(u) + 0.15, 1), at(rootY(u), rootSpan(u) + 0.15, -1), 0.55, 0.8);
    }

    var bands = 4;
    var b;
    for (b = 0; b <= bands; b++) {
      var prev = null;
      for (i = 0; i <= N; i++) {
        var u = i / N;
        var span = rootSpan(u) * (b / bands);
        var arch = Math.sin((b / bands) * Math.PI) * spec.cover;
        var p = at(rootY(u), span, 1);
        p.x += bx * arch;
        p.z += bz * arch;
        if (prev) line(lines, prev, p, b === 0 || b === bands ? 0.82 : 0.4, 0.9);
        prev = p;
      }
    }
    for (i = 0; i <= N; i += 2) {
      var u = i / N;
      line(lines, at(rootY(u), 0.04, 1), at(rootY(u), rootSpan(u), 1), 0.5, 0.8);
    }

    var row;
    var col;
    for (row = 0; row <= 14; row++) {
      for (col = 0; col <= 8; col++) {
        var u = row / 14;
        var v = col / 8;
        var span = rootSpan(u) + (tipSpan(u) - rootSpan(u)) * v;
        var y = rootY(u) + (tipY(u) - rootY(u)) * v;
        var face = at(y, span, 1);
        var back = at(y, span, -1);
        var lift = 0.22 - v * 0.18;
        dots.push({ x: face.x, y: face.y, z: face.z, nx: bx, ny: lift, nz: bz, tile: 0 });
        dots.push({ x: back.x, y: back.y, z: back.z, nx: -bx, ny: lift, nz: -bz, tile: 0 });
      }
    }
  }

  function addFlaps(lines, dots) {
    var sides = [1.02, -1.02];
    var s;
    for (s = 0; s < sides.length; s++) {
      var ghost = sides[s] < 0;
      addFlap(lines, dots, {
        phi: sides[s], lee: 0.84, thick: 0.48, ghost: ghost,
        yLE: 48.6, yTE: 36.8, sweep: 7.2, tipChord: 2.35,
        spanLE: 5.8, spanTE: 3.15, rootGap: 0.06, fillet: 1.85, cover: 0.9
      });
      addFlap(lines, dots, {
        phi: sides[s], lee: 0.8, thick: 0.55, ghost: ghost,
        yLE: 23.2, yTE: 2.2, sweep: 9.6, tipChord: 5.4,
        spanLE: 8.6, spanTE: 5.5, rootGap: 0.08, fillet: 2.5, cover: 1.15
      });
    }
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

    addFlaps(lines, dots);
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
    var model = {
      w: w, h: h, cramped: cramped,
      ship: ship, booster: booster, tower: tower, pad: pad,
      tower2: buildTowerLines(-16),
      farTower: buildTowerLines(42),
      towerX: towerX,
      cam0: cam,
      ui: ui,
      mission: null,
      rng: mulberry32(0x11fe)
    };
    global.Vehicle.current = model;
    return model;
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
        flap: { x: P(9.4, BELL + BOOST + 44, 1.4).x, y: P(9.4, BELL + BOOST + 44, 1.4).y },
        hull: { x: P(R, BELL + BOOST + 24, 0).x, y: P(R, BELL + BOOST + 24, 0).y },
        aft: { x: P(10, BELL + BOOST + 8, 0).x, y: P(10, BELL + BOOST + 8, 0).y },
        fin: { x: P(8.2, BELL + BOOST - 6, 0).x, y: P(8.2, BELL + BOOST - 6, 0).y },
        terminal: { x: comp.x + comp.w, y: comp.y + comp.h * 0.35 }
      },
      engines: [P(0, BELL, 2)],
      deckY: P(0, DECK, 0).y
    };
  }

  /* Flight profile. Cinematic clock (about 50 s) in the same order as a
     Starship flight, scaled down from public Flight 5 / Flight 6 timing.

     Real beat (approx)          Clock    What the picture shows
     -------------------------   -----    ---------------------------------
     T-3 s  QD arm retracts      0-1.5    arm swings off the ship
     T+0    Raptor startup       1.5-2.6  deluge, plume grows from the mount
     T+2 s  liftoff              2.6-5    slow rise, clamps open
     T+8 s  tower clear          5-7.2    stack above the tower, still near vertical
     T+60 s max-Q                7.2-10.4 pitched ~20°, engines dip
     T+2:40 MECO / hot stage     10.6-13  ship Raptors light while still mated,
                                          exhaust leaves the vented ring, then
                                          the ship pulls away along its axis
     +10 s  booster flip         13-17    one continuous rotation, engines
                                          swing to face back toward the pad
     +40 s  boostback            14-18    plume toward the launch site
     +6 min descent              18-21    engines rotate back under the booster
     +7 min landing burn + catch 21-24    burn, then the arms close on the pins
     coast / SECO                26-28    crossfade to orbit (same ship mesh)
     payload door + PEZ          29-35    flat satellites leave one at a time,
                                          tumble, and unfold into the fact cards
     deorbit burn                36-38    ship turns engines-forward and burns
     entry interface             38-43    belly to the flow, plasma on the tiles
     belly-flop then flip        43-45    horizontal, then rotate to vertical
     landing burn + catch        45-48    second tower, arms close
     return to the pad           48-50    crossfade back to the stacked hero

     The pose is a pure function of t. Positions are linearly keyframed and
     the ramps use smoothstep, so nothing teleports. Particles are a fixed
     pool indexed by a phase of t, not Math.random each frame. Cameras are
     functions of those same positions. Fades are opacity only, and the
     outgoing shot is already held still before it fades. */

  var T_SPLIT = 12.2;
  var CATCH_X = -1.6;
  var CATCH_Y = 92;
  var CATCH2_X = -3.6;
  var CATCH2_Y = 86;
  var T_END = 50.6;

  var ANCHOR_Y = [
    { t: 0, v: BELL }, { t: 2.55, v: BELL },
    { t: 3.4, v: BELL + 8 }, { t: 4.6, v: BELL + 32 },
    { t: 6.2, v: BELL + 86 }, { t: 8.4, v: BELL + 176 },
    { t: 10.6, v: BELL + 292 }, { t: 12.2, v: BELL + 400 }
  ];
  var ANCHOR_X = [
    { t: 0, v: 0 }, { t: 4.8, v: 0 },
    { t: 6.6, v: 8 }, { t: 8.6, v: 22 },
    { t: 10.6, v: 40 }, { t: 12.2, v: 58 }
  ];
  var ANCHOR_A = [
    { t: 0, v: 0 }, { t: 4.8, v: 0 },
    { t: 6.5, v: -8 }, { t: 8.6, v: -18 },
    { t: 10.6, v: -28 }, { t: 12.2, v: -34 }
  ];

  function smooth(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t * t * (3 - 2 * t);
  }

  function clamp(t, a, b) {
    return t < a ? a : t > b ? b : t;
  }

  function mix(a, b, u) {
    return a + (b - a) * u;
  }

  function lin(keys, t) {
    if (t <= keys[0].t) return keys[0].v;
    var i;
    for (i = 1; i < keys.length; i++) {
      if (t <= keys[i].t) {
        var a = keys[i - 1];
        var b = keys[i];
        var u = (t - a.t) / (b.t - a.t);
        return a.v + (b.v - a.v) * u;
      }
    }
    return keys[keys.length - 1].v;
  }

  function ramp(t, a, b) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    return smooth((t - a) / (b - a));
  }

  function hash(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function fract(x) {
    return x - Math.floor(x);
  }

  function bodyPose(x, y, rot, pivotY) {
    return {
      x: x, y: y, z: 0, rot: rot, pivotX: 0, pivotY: pivotY,
      thrust: 0, plasma: 0, door: 0
    };
  }

  function stackBodies(ax, ay, ang) {
    var a = ang * Math.PI / 180;
    var s = Math.sin(a);
    var c = Math.cos(a);
    return {
      booster: bodyPose(ax - s * (BOOST / 2), ay + c * (BOOST / 2), ang, BOOST / 2),
      ship: bodyPose(ax - s * (BOOST + SHIP / 2), ay + c * (BOOST + SHIP / 2), ang, SHIP / 2)
    };
  }

  function slide(pose, dist, drot) {
    var a = pose.rot * Math.PI / 180;
    return bodyPose(
      pose.x - Math.sin(a) * dist,
      pose.y + Math.cos(a) * dist,
      pose.rot + drot,
      pose.pivotY
    );
  }

  function blendCam(a, b, u) {
    return {
      scale: mix(a.scale, b.scale, u),
      ox: mix(a.ox, b.ox, u),
      oy: mix(a.oy, b.oy, u),
      lookX: mix(a.lookX, b.lookX, u),
      lookY: mix(a.lookY, b.lookY, u)
    };
  }

  function padPose() {
    return {
      ship: bodyPose(0, BELL + BOOST + SHIP / 2, 0, SHIP / 2),
      booster: bodyPose(0, BELL + BOOST / 2, 0, BOOST / 2),
      qd: 0,
      clamps: 0,
      steam: 0,
      shock: 0,
      sticksOpen: 0.72,
      sticksY: BELL + BOOST - 6.4,
      sticks2Open: 1,
      sticks2Y: CATCH2_Y + (34 - SHIP / 2),
      landShip: null,
      landCam: null,
      useHero: false,
      worldAlpha: 1,
      earthAlpha: 0,
      landAlpha: 0,
      door: 0,
      deorbit: 0,
      ang: -0.35,
      scene: "pad",
      beat: "Pad.",
      t: 0,
      done: false
    };
  }

  function beatFor(t) {
    if (t < 1.45) return "Ship quick-disconnect swinging clear.";
    if (t < 2.55) return "Raptors lighting. Water deluge on the mount.";
    if (t < 5.1) return "Liftoff.";
    if (t < 7.2) return "Tower clear.";
    if (t < 10.5) return "Max-Q. Engines easing.";
    if (t < 12.2) return "MECO. Ship engines light through the vented ring.";
    if (t < 13.6) return "Hot staging. The ship pulls away.";
    if (t < 17.8) return "Booster flips and boosts back.";
    if (t < 21.3) return "Booster descent.";
    if (t < 24.3) return "Landing burn. Chopsticks closing.";
    if (t < 26.4) return "Booster caught.";
    if (t < 28.7) return "Ship on orbit.";
    if (t < 30.2) return "Payload door opening.";
    if (t < 35.5) return "Satellites deploying.";
    if (t < 37.9) return "Deorbit burn.";
    if (t < 43.3) return "Reentry. Plasma on the heat shield.";
    if (t < 45.2) return "Flip to vertical.";
    if (t < 46.6) return "Landing burn.";
    if (t < 48.5) return "Caught on the second tower.";
    return "Back on the pad.";
  }

  function poseAt(model, t) {
    var pose = padPose();
    pose.t = t;
    pose.beat = beatFor(t);
    pose.done = t >= T_END;
    var ax = lin(ANCHOR_X, Math.min(t, T_SPLIT));
    var ay = lin(ANCHOR_Y, Math.min(t, T_SPLIT));
    var ang = lin(ANCHOR_A, Math.min(t, T_SPLIT));
    var stacked = stackBodies(ax, ay, ang);
    var split = stackBodies(lin(ANCHOR_X, T_SPLIT), lin(ANCHOR_Y, T_SPLIT), lin(ANCHOR_A, T_SPLIT));

    if (t <= T_SPLIT) {
      pose.ship = stacked.ship;
      pose.booster = stacked.booster;
    } else {
      var dist = lin([
        { t: T_SPLIT, v: 0 }, { t: 12.55, v: 7 }, { t: 13.5, v: 36 },
        { t: 16.2, v: 110 }, { t: 20.5, v: 210 }, { t: 26.4, v: 360 }, { t: 29, v: 400 }
      ], t);
      var extra = lin([
        { t: T_SPLIT, v: 0 }, { t: 18, v: -6 }, { t: 26, v: -8 }
      ], t);
      pose.ship = slide(split.ship, dist, extra);
      var peak = -176 - split.booster.rot;
      var dx = lin([
        { t: T_SPLIT, v: 0 },
        { t: 14.2, v: 10 },
        { t: 17.4, v: (CATCH_X - split.booster.x) * 0.5 },
        { t: 20.6, v: (CATCH_X - split.booster.x) * 0.84 },
        { t: 23.1, v: CATCH_X - split.booster.x },
        { t: 29, v: CATCH_X - split.booster.x }
      ], t);
      var dy = lin([
        { t: T_SPLIT, v: 0 },
        { t: 14.4, v: 24 },
        { t: 17.6, v: -20 },
        { t: 21.0, v: (CATCH_Y - split.booster.y) * 0.8 },
        { t: 23.2, v: CATCH_Y - split.booster.y },
        { t: 29, v: CATCH_Y - split.booster.y }
      ], t);
      var drot = lin([
        { t: T_SPLIT, v: 0 },
        { t: 13.3, v: -28 },
        { t: 14.9, v: peak },
        { t: 17.2, v: peak - 36 },
        { t: 20.2, v: -250 },
        { t: 22.8, v: -360 - split.booster.rot },
        { t: 29, v: -360 - split.booster.rot }
      ], t);
      pose.booster = bodyPose(
        split.booster.x + dx,
        split.booster.y + dy,
        split.booster.rot + drot,
        BOOST / 2
      );
    }

    var bTh = ramp(t, 1.45, 2.45);
    var dip = ramp(t, 7.15, 7.75) * (1 - ramp(t, 8.55, 9.25));
    bTh *= 1 - 0.4 * dip;
    var meco = ramp(t, 10.55, 11.4);
    bTh = bTh * (1 - meco) + 0.1 * meco;
    if (t >= T_SPLIT) {
      var residual = 0.1 * (1 - ramp(t, T_SPLIT, T_SPLIT + 0.7));
      var bb = ramp(t, 13.35, 14.05) * (1 - ramp(t, 17.3, 18.15));
      var landBurn = ramp(t, 21.25, 22.0) * (1 - ramp(t, 23.75, 24.35));
      bTh = residual + bb * 0.95 + landBurn;
    }
    pose.booster.thrust = bTh;
    pose.shock = dip;
    pose.ship.thrust = ramp(t, 10.65, 11.75) * (1 - ramp(t, 15.7, 16.5));
    pose.qd = ramp(t, 0.15, 1.55);
    pose.clamps = ramp(t, 2.15, 2.75);
    pose.steam = ramp(t, 1.35, 2.15) * (1 - ramp(t, 6.4, 8.3));

    var pin = xform({ x: 0, y: BOOST - 6.4, z: 0 }, pose.booster);
    var pin0 = BELL + BOOST - 6.4;
    pose.sticksY = mix(pin0, pin.y, ramp(t, 18.2, 21.6));
    pose.sticksOpen = mix(0.72 + 0.26 * ramp(t, 0.2, 1.75), 0.16, ramp(t, 22.45, 23.85));

    var follow = ramp(t, 2.65, 6.1);
    var scaleMul = 1 - 0.42 * ramp(t, 2.85, 7.4);
    var scale = model.cam0.scale * scaleMul;
    var targetSy = mix(model.cam0.oy - ay * model.cam0.scale, model.h * 0.58, follow);
    var targetSx = mix(model.cam0.ox, model.w * 0.5, follow);
    var ascentCam = {
      scale: scale,
      ox: targetSx - ax * (1 - follow) * scale,
      oy: targetSy + ay * (1 - follow) * scale,
      lookX: ax * follow,
      lookY: ay * follow
    };
    var boostCam = {
      scale: model.cam0.scale * (model.cramped ? 0.74 : 0.82),
      ox: model.w * (model.cramped ? 0.54 : 0.56),
      oy: model.h * 0.52,
      lookX: pose.booster.x,
      lookY: pose.booster.y
    };
    pose.cam = blendCam(ascentCam, boostCam, ramp(t, 13.15, 15.5));

    var ly = lin([
      { t: 38.2, v: 158 }, { t: 41.6, v: 124 }, { t: 44.2, v: 100 },
      { t: 46.2, v: CATCH2_Y }, { t: 50, v: CATCH2_Y }
    ], t);
    var lx = lin([
      { t: 38.2, v: 34 }, { t: 42.4, v: 14 }, { t: 44.8, v: 1 },
      { t: 46.2, v: CATCH2_X }, { t: 50, v: CATCH2_X }
    ], t);
    var lrot = lin([
      { t: 38.2, v: 90 }, { t: 43.15, v: 90 }, { t: 43.7, v: 68 },
      { t: 44.45, v: 22 }, { t: 45.15, v: 0 }, { t: 50, v: 0 }
    ], t);
    pose.landShip = bodyPose(lx, ly, lrot, SHIP / 2);
    pose.landShip.thrust = ramp(t, 44.35, 44.95) * (1 - ramp(t, 46.55, 47.15));
    pose.landShip.plasma = ramp(t, 38.5, 39.3) * (1 - ramp(t, 43.6, 44.8));
    pose.sticks2Y = CATCH2_Y + (34 - SHIP / 2);
    pose.sticks2Open = mix(0.98, 0.16, ramp(t, 45.55, 46.75));
    pose.landCam = {
      scale: model.cam0.scale * (model.cramped ? 0.88 : 0.94),
      ox: model.w * (model.cramped ? 0.56 : 0.58),
      oy: model.h * 0.48,
      lookX: pose.landShip.x,
      lookY: pose.landShip.y
    };

    pose.worldAlpha = 1 - ramp(t, 26.2, 27.55);
    if (t >= 48.45) pose.worldAlpha = ramp(t, 48.45, 49.95);
    pose.earthAlpha = ramp(t, 26.85, 28.25) * (1 - ramp(t, 37.65, 38.95));
    pose.landAlpha = ramp(t, 38.35, 39.75) * (1 - ramp(t, 48.45, 49.95));
    pose.useHero = t >= 48.45;
    pose.door = ramp(t, 28.65, 30.05) * (1 - ramp(t, 36.7, 37.55));
    pose.deorbit = ramp(t, 35.55, 36.95) * (1 - ramp(t, 37.45, 38.15));
    pose.retro = ramp(t, 35.55, 36.95);
    pose.ang = -0.4 + Math.max(0, t - 26.2) * 0.09;
    if (pose.landAlpha > pose.earthAlpha && pose.landAlpha > pose.worldAlpha) pose.scene = "landing";
    else if (pose.earthAlpha > pose.worldAlpha) pose.scene = "earth";
    else pose.scene = "pad";
    return pose;
  }


  function missionSeconds(model, now) {
    var m = model.mission;
    if (!m) return 0;
    if (m.t0 == null) return m.elapsed || 0;
    return (now - m.t0) / 1000;
  }

  function start(model, now) {
    model.mission = { t0: now, elapsed: 0 };
  }

  function stop(model) {
    model.mission = null;
  }

  function hold(model, now) {
    if (!model || !model.mission || model.mission.t0 == null) return;
    model.mission.elapsed = (now - model.mission.t0) / 1000;
    model.mission.t0 = null;
  }

  function resume(model, now) {
    if (!model || !model.mission || model.mission.t0 != null) return;
    model.mission.t0 = now - (model.mission.elapsed || 0) * 1000;
  }

  function seek(model, seconds, now) {
    model.mission = { t0: now - seconds * 1000, elapsed: seconds };
  }

  function fadeCtx(ctx, alpha) {
    if (alpha >= 0.999) return ctx;
    return new Proxy(ctx, {
      get: function (target, prop) {
        var v = target[prop];
        return typeof v === "function" ? v.bind(target) : v;
      },
      set: function (target, prop, value) {
        if (prop === "globalAlpha") target.globalAlpha = alpha * Number(value);
        else target[prop] = value;
        return true;
      }
    });
  }

  function active(model) {
    return !!(model && model.mission);
  }

  function paint(ctx, model, now) {
    var pose = model.mission ? poseAt(model, missionSeconds(model, now)) : padPose();
    if (pose.done) {
      model.mission = null;
      pose = padPose();
    }
    model.last = pose;
    model._cards = [];
    ctx.save();
    if (pose.landAlpha > 0.004) drawLanding(fadeCtx(ctx, pose.landAlpha), model, pose);
    if (pose.worldAlpha > 0.004) {
      var shown = pose.useHero ? padPose() : pose;
      if (pose.useHero) shown.showComputer = true;
      drawPad(fadeCtx(ctx, pose.worldAlpha), model, shown);
    }
    if (pose.earthAlpha > 0.004) drawEarth(fadeCtx(ctx, pose.earthAlpha), model, pose);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawPad(ctx, model, pose) {
    var cam = pose.cam || model.cam0;
    var t = pose.t || 0;
    strokeAll(ctx, model.pad, null, cam, 1);
    strokeAll(ctx, model.tower, null, cam, 1);
    if (!model.cramped && model.farTower) strokeAll(ctx, model.farTower, null, cam, 0.18);
    drawBody(ctx, model.booster, pose.booster, cam, 1);
    if (Math.abs(pose.ship.y - (cam.lookY || 0)) < 240 && Math.abs(pose.ship.x - (cam.lookX || 0)) < 180) {
      drawBody(ctx, model.ship, pose.ship, cam, 1);
    }
    drawChopsticks(ctx, cam, model.towerX, pose.sticksY, pose.sticksOpen, 1);
    drawQD(ctx, cam, model.towerX, pose.qd, pose.ship);
    drawClamps(ctx, cam, pose.clamps);
    if (pose.steam > 0.04) drawSteam(ctx, cam, pose.steam, t);
    if (pose.shock > 0.04) drawShock(ctx, cam, pose, pose.shock);
    if (pose.ship.thrust > 0.12) {
      var base = xform({ x: 0, y: 0, z: 0 }, pose.ship);
      var top = xform({ x: 0, y: BOOST, z: 0 }, pose.booster);
      if (Math.hypot(base.x - top.x, base.y - top.y) < 16) {
        drawVents(ctx, cam, pose.booster, pose.ship.thrust, t);
      }
    }
    if (pose.booster.thrust > 0.04) drawPlume(ctx, cam, pose.booster, 1.05, pose.booster.thrust, t, 10);
    if (pose.ship.thrust > 0.04) drawPlume(ctx, cam, pose.ship, -0.25, pose.ship.thrust, t, 80);
    if (!model.mission || pose.showComputer) drawComputer(ctx, model);
  }

  function drawLanding(ctx, model, pose) {
    var cam = pose.landCam || pose.cam || model.cam0;
    var ship = pose.landShip || pose.ship;
    var t = pose.t || 0;
    strokeAll(ctx, model.pad, null, cam, 0.85);
    strokeAll(ctx, model.tower2, null, cam, 1);
    drawBody(ctx, model.ship, ship, cam, 1);
    drawChopsticks(ctx, cam, -16, pose.sticks2Y, pose.sticks2Open, 1);
    if (ship.thrust > 0.04) drawPlume(ctx, cam, ship, -0.25, ship.thrust, t, 90);
    if (ship.plasma > 0.04) drawPlasma(ctx, ship, cam, ship.plasma, t);
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

  function drawSteam(ctx, cam, amount, t) {
    if (amount < 0.04) return;
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 70; i++) {
      var phase = fract(hash(i + 4) * 1.7 + t * (0.22 + hash(i + 9) * 0.28));
      var ang = hash(i + 2) * Math.PI * 2;
      var rad = (2 + hash(i + 6) * 11) * (0.25 + phase);
      var p = project({
        x: Math.cos(ang) * rad,
        y: DECK + phase * (5 + amount * 11),
        z: Math.sin(ang) * rad
      }, cam);
      ctx.globalAlpha = (1 - phase) * 0.32 * amount;
      ctx.fillRect(p.x, p.y, 1.8, 1.8);
    }
  }

  function drawPlume(ctx, cam, pose, localY, power, t, seed) {
    if (power < 0.03) return;
    var origin = xform({ x: 0, y: localY, z: 0 }, pose);
    var tip = xform({ x: 0, y: localY - 1, z: 0 }, pose);
    var dx = tip.x - origin.x;
    var dy = tip.y - origin.y;
    var dz = (tip.z || 0) - (origin.z || 0);
    var px = -dy;
    var py = dx;
    var plen = Math.hypot(px, py) || 1;
    px /= plen;
    py /= plen;
    var n = 78;
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < n; i++) {
      var phase = fract(hash(seed + i * 3) + t * (0.65 + hash(seed + i) * 0.85));
      var len = phase * (7 + power * 18);
      var wob = (hash(seed + i + 11) - 0.5) * 2 * (0.25 + phase * phase * 2.7);
      var wob2 = (hash(seed + i + 29) - 0.5) * 2 * (0.25 + phase * phase * 2.7);
      var p = project({
        x: origin.x + dx * len + px * wob,
        y: origin.y + dy * len + py * wob,
        z: (origin.z || 0) + dz * len + wob2
      }, cam);
      ctx.globalAlpha = (1 - phase) * (0.14 + 0.5 * power);
      var s = phase > 0.62 ? 2.15 : 1.15;
      ctx.fillRect(p.x, p.y, s, s);
    }
  }

  function drawVents(ctx, cam, booster, power, t) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 40; i++) {
      var ang = (i / 40) * Math.PI * 2;
      if (Math.sin(ang) < -0.25) continue;
      var phase = fract(hash(i + 50) + t * 1.5);
      var dist = 0.8 + phase * (3.5 + power * 5);
      var p = project(xform({
        x: Math.cos(ang) * (R * 1.05 + dist),
        y: BOOST - HOT * 0.45 + (hash(i + 51) - 0.5) * 0.8,
        z: Math.sin(ang) * (R * 1.05 + dist)
      }, booster), cam);
      ctx.globalAlpha = (1 - phase) * 0.45 * power;
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }

  function drawShock(ctx, cam, pose, amount) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 32; i++) {
      var a = (i / 32) * Math.PI * 2;
      var r = R + 1.6 + amount * 2.4;
      var p = project(xform({
        x: Math.cos(a) * r,
        y: SHIP * 0.42,
        z: Math.sin(a) * r
      }, pose.ship), cam);
      ctx.globalAlpha = 0.3 * amount;
      ctx.fillRect(p.x, p.y, 1.5, 1.5);
    }
  }

  function drawPlasma(ctx, pose, cam, amount, t) {
    if (amount < 0.04) return;
    var n = 110;
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < n; i++) {
      var phase = fract(hash(i + 21) + t * (0.7 + hash(i + 22) * 0.35));
      var y = 4 + hash(i + 23) * (SHIP - 10) - phase * 7;
      y = clamp(y, 0.3, SHIP - 0.3);
      var th = Math.PI + (hash(i + 24) - 0.5) * 1.7;
      var rad = shipRadius(y) + 0.45 + phase * 2.8;
      var p = project(xform({
        x: rad * Math.cos(th),
        y: y,
        z: rad * Math.sin(th)
      }, pose), cam);
      ctx.globalAlpha = (0.35 + 0.65 * (1 - phase)) * amount * 0.85;
      ctx.fillRect(p.x - 1, p.y, 4.2, 1.6);
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

  var LAND = [
    [[71, -156], [70, -141], [68, -136], [60, -140], [59, -138], [55, -133], [54, -130], [51, -128], [49, -125], [48, -124], [43, -124], [38, -123], [34, -120], [32, -117], [27, -114], [23, -110], [19, -105], [16, -95], [15, -92], [13, -87], [8, -77], [9, -80], [11, -84], [15, -83], [16, -88], [18, -91], [21, -90], [21.6, -87.5], [21, -86.8], [18.5, -88], [16, -94], [18, -97], [22, -97.5], [25.5, -97.2], [27.6, -97.2], [28.8, -95.5], [29.3, -94.6], [29.5, -93.4], [29.4, -91.6], [29.2, -90.2], [29.7, -89.4], [30.2, -88.4], [30.3, -87.2], [30.1, -85.7], [29.7, -84.2], [29.8, -83.4], [28.2, -82.7], [26.4, -82.2], [25.2, -81.2], [25.1, -80.4], [26.8, -80.1], [28.4, -80.6], [30.2, -81.4], [31.8, -81], [32.8, -79.8], [34.7, -76.6], [36.8, -75.8], [39.2, -74.4], [40.6, -73.2], [41.4, -70.6], [42.8, -70.4], [43.7, -69.8], [44.8, -67], [46.8, -67.8], [47.6, -64.5], [46.6, -60.4], [47.2, -56], [50.2, -55.6], [52.6, -55.8], [54.6, -57.2], [58.6, -62], [60.4, -64.6], [61.8, -70], [63.6, -68], [66.5, -62], [68.4, -68], [70.2, -80], [73.2, -86], [74, -95], [70.4, -105], [68.6, -114], [69.4, -125], [70.2, -140], [71, -156]],
    [[12.2, -72], [10.6, -75], [8.2, -77], [4, -77], [0, -80], [-5, -81], [-12, -77], [-18, -71], [-22, -70], [-30, -71], [-40, -73], [-46, -75], [-52, -68], [-55, -67], [-52, -70], [-42, -65], [-35, -57], [-23, -43], [-15, -39], [-8, -35], [-2, -44], [2, -51], [6, -58], [8, -62], [10.6, -68], [12.2, -72]],
    [[35, -6], [32, -9], [28, -13], [22, -17], [15, -17], [10, -15], [5, -8], [4, -6], [6, 3], [5, 8], [4, 9], [6, 12], [10, 14], [12, 16], [15, 17], [20, 16], [25, 15], [31, 10], [32, 10], [33, 8], [37, 10], [36, 3], [35, -2], [35, -6]],
    [[36, -6], [40, -9], [43, -9], [44, -1], [46, -1], [48, -5], [50, -5], [51, 2], [54, 8], [56, 8], [58, 10], [60, 5], [62, 5], [64, 12], [68, 16], [70, 28], [69, 40], [66, 44], [64, 40], [60, 28], [56, 22], [52, 20], [48, 16], [45, 14], [44, 12], [41, 10], [38, 9], [36, 6], [36, -2], [36, -6]],
    [[22, 88], [16, 95], [8, 98], [1, 104], [-4, 105], [-8, 115], [-8, 125], [-15, 125], [-22, 114], [-35, 118], [-35, 137], [-31, 153], [-25, 153], [-15, 145], [-12, 136], [-10, 142], [0, 128], [6, 116], [10, 108], [16, 108], [22, 91], [22, 88]],
    [[72, -56], [76, -68], [81, -65], [83, -45], [82, -22], [76, -18], [70, -22], [68, -28], [70, -42], [72, -56]],
    [[23.2, -82.4], [22.2, -84.2], [21.6, -82.8], [20.2, -77.2], [20.6, -74.6], [22.2, -77.8], [23.2, -80.2], [23.2, -82.4]]
  ];

  function inPoly(lat, lon, poly) {
    var c = false;
    var i;
    var j = poly.length - 1;
    for (i = 0; i < poly.length; j = i++) {
      var yi = poly[i][0];
      var xi = poly[i][1];
      var yj = poly[j][0];
      var xj = poly[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  function isLand(lat, lon) {
    var i;
    for (i = 0; i < LAND.length; i++) if (inPoly(lat, lon, LAND[i])) return true;
    return false;
  }

  function buildGlobe() {
    var rng = mulberry32(0xe427);
    var lat0 = 28 * Math.PI / 180;
    var lon0 = -90.6 * Math.PI / 180;
    var dots = [];
    var i;
    for (i = 0; i < 14000; i++) {
      var lon = (rng() * 2 - 1) * Math.PI;
      var lat = Math.asin(rng() * 2 - 1);
      var cosLat = Math.cos(lat);
      var dlon = lon - lon0;
      var z = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * cosLat * Math.cos(dlon);
      if (z <= 0.02) continue;
      var x = cosLat * Math.sin(dlon);
      var y = Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * cosLat * Math.cos(dlon);
      var land = isLand(lat * 180 / Math.PI, lon * 180 / Math.PI);
      dots.push({ x: x, y: y, z: z, land: land, city: land && rng() < 0.045 });
    }
    return dots;
  }

  function earthLayout(model) {
    var cramped = model.cramped;
    var radius = cramped
      ? Math.min(model.w * 0.22, model.h * 0.125)
      : Math.min(model.h * 0.3, model.w * 0.22);
    var cy = cramped ? Math.max(radius + 108, model.h * 0.2) : model.h * 0.46;
    var cx = model.w * (cramped ? 0.5 : 0.34);
    return { cx: cx, cy: cy, radius: radius };
  }

  function drawEarth(ctx, model, pose) {
    if (!model.globe) model.globe = buildGlobe();
    var lay = earthLayout(model);
    var cx = lay.cx;
    var cy = lay.cy;
    var radius = lay.radius;
    var sun = { x: 0.82, y: 0.12, z: 0.56 };
    var sl = Math.hypot(sun.x, sun.y, sun.z);
    sun.x /= sl;
    sun.y /= sl;
    sun.z /= sl;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#10141c";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < model.globe.length; i++) {
      var d = model.globe[i];
      var day = d.x * sun.x + d.y * sun.y + d.z * sun.z;
      var sx = cx + d.x * radius;
      var sy = cy - d.y * radius;
      if (d.land) {
        if (day > 0.05) {
          ctx.globalAlpha = 0.35 + day * 0.6;
          ctx.fillRect(sx, sy, day > 0.55 ? 1.7 : 1.2, day > 0.55 ? 1.7 : 1.2);
        } else if (d.city) {
          ctx.globalAlpha = 0.55 + Math.abs(day) * 0.4;
          ctx.fillRect(sx, sy, 1.5, 1.5);
        } else {
          ctx.globalAlpha = 0.08;
          ctx.fillRect(sx, sy, 1, 1);
        }
      } else if (day > 0) {
        ctx.globalAlpha = 0.05 + day * 0.16;
        ctx.fillRect(sx, sy, 1, 1);
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    for (i = 0; i < 80; i++) {
      var ang = (i / 80) * Math.PI * 2;
      var lx = Math.cos(ang);
      var ly = Math.sin(ang);
      var limb = lx * sun.x + ly * sun.y;
      if (limb < 0) continue;
      ctx.globalAlpha = limb * 0.45;
      ctx.fillRect(cx + lx * radius * 1.035, cy - ly * radius * 1.035, 1.6, 1.6);
    }
    var a = pose.ang || 0.4;
    var orbit = radius + (model.cramped ? 18 : 28);
    var k;
    ctx.lineWidth = 1;
    for (k = 18; k >= 1; k--) {
      var a0 = a - k * 0.045;
      var a1 = a - (k - 1) * 0.045;
      ctx.globalAlpha = 0.05 + (1 - k / 18) * 0.45;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * orbit, cy + Math.sin(a0) * orbit * 0.55);
      ctx.lineTo(cx + Math.cos(a1) * orbit, cy + Math.sin(a1) * orbit * 0.55);
      ctx.stroke();
    }
    var sx = cx + Math.cos(a) * orbit;
    var sy = cy + Math.sin(a) * orbit * 0.55;
    var vx = -Math.sin(a);
    var vy = Math.cos(a) * 0.55;
    var len = Math.hypot(vx, vy) || 1;
    var rot = Math.atan2(vx / len, -vy / len) * 180 / Math.PI;
    var ppm = model.cramped ? 1.45 : 2.05;
    var shipCam = {
      scale: ppm,
      ox: sx,
      oy: sy,
      lookX: 0,
      lookY: SHIP / 2
    };
    var shipPose = {
      x: 0, y: SHIP / 2, rot: rot + 180 * (pose.retro || 0), pivotX: 0, pivotY: SHIP / 2,
      thrust: pose.deorbit || 0, plasma: 0, door: pose.door || 0
    };
    drawBody(ctx, model.ship, shipPose, shipCam, 1);
    drawPayloadDoor(ctx, shipCam, shipPose, pose.door || 0);
    if (pose.deorbit > 0) drawPlume(ctx, shipCam, shipPose, -0.2, pose.deorbit, pose.t || 0, 120);
    var doorP = project(xform({ x: R + 0.45, y: 33.6, z: 0 }, shipPose), shipCam);
    model._shipScreen = { x: sx, y: sy };
    model._cards = cardsFor(pose, model, doorP, lay);
    drawSats(ctx, model._cards);
    ctx.restore();
  }

  function drawPayloadDoor(ctx, cam, shipPose, open) {
    var y0 = 30.2;
    var y1 = 37.4;
    var slide = (open || 0) * 6.4;
    function corner(y, side) {
      return { x: R + 0.22, y: y, z: side * 1.2 };
    }
    var slot = [corner(y1, -1), corner(y1, 1), corner(y0, 1), corner(y0, -1)];
    var panel = [corner(y1 - slide, -1), corner(y1 - slide, 1), corner(y0 - slide, 1), corner(y0 - slide, -1)];
    var lines = [];
    var i;
    for (i = 0; i < 4; i++) {
      line(lines, slot[i], slot[(i + 1) % 4], open > 0.05 ? 0.85 : 0.35, 1.1);
      line(lines, panel[i], panel[(i + 1) % 4], 0.95, 1.2);
    }
    line(lines, panel[0], panel[2], 0.35, 0.7);
    strokeAll(ctx, lines, shipPose, cam, 1);
  }

  function cardSlots(model, lay) {
    var n = FACTS.length;
    var cramped = model.cramped;
    var cols = cramped ? 2 : 1;
    var rows = Math.ceil(n / cols);
    var gap = 6;
    var top = cramped ? lay.cy + lay.radius + 16 : 66;
    var bot = model.h - (cramped ? 150 : 126);
    var avail = Math.max(rows * 40, bot - top);
    var cardH = Math.floor((avail - gap * (rows - 1)) / rows);
    cardH = Math.max(48, Math.min(cramped ? 86 : 80, cardH));
    var cardW;
    var x0;
    if (cramped) {
      cardW = Math.floor((model.w - 18 - gap) / 2);
      x0 = 8;
    } else {
      x0 = Math.min(model.w - 236, lay.cx + lay.radius + 36);
      cardW = Math.min(224, model.w - x0 - 12);
    }
    var slots = [];
    var i;
    for (i = 0; i < n; i++) {
      var col = cramped ? i % cols : 0;
      var row = cramped ? Math.floor(i / cols) : i;
      slots.push({
        x: x0 + col * (cardW + gap),
        y: top + row * (cardH + gap),
        w: cardW,
        h: cardH
      });
    }
    return slots;
  }

  function cardsFor(pose, model, doorP, lay) {
    if (!pose || pose.t < 29.3) return [];
    var slots = cardSlots(model, lay);
    var out = [];
    var i;
    for (i = 0; i < FACTS.length; i++) {
      var born = 29.35 + i * 0.72;
      if (pose.t < born) break;
      var u = clamp((pose.t - born) / 1.5, 0, 1);
      var travel = smooth(Math.min(1, u / 0.46));
      var grow = smooth(clamp((u - 0.4) / 0.6, 0, 1));
      var slot = slots[i];
      var laneX = model.cramped
        ? (slot.x < model.w * 0.5 ? 4 : model.w - 14)
        : slot.x - 64;
      var p0 = doorP;
      var p1 = { x: laneX, y: doorP.y };
      var p2 = { x: laneX, y: slot.y + slot.h * 0.35 };
      var pos;
      if (travel < 0.5) {
        var a = travel / 0.5;
        pos = { x: mix(p0.x, p1.x, a), y: mix(p0.y, p1.y, a) };
      } else {
        var b = (travel - 0.5) / 0.5;
        pos = { x: mix(p1.x, p2.x, b), y: mix(p1.y, p2.y, b) };
      }
      var w = mix(16, slot.w, grow);
      var h = mix(8, slot.h, grow);
      var x = mix(pos.x, slot.x, grow);
      var y = mix(pos.y, slot.y, grow);
      if (grow < 0.92) {
        var j;
        for (j = 0; j < i; j++) {
          var s = slots[j];
          var hit = x < s.x + s.w && x + w > s.x + 4 && y < s.y + s.h && y + h > s.y + 2;
          if (hit) {
            x = Math.min(x, s.x - w - 10);
          }
        }
      }
      var spin = (1 - grow) * (i % 2 ? 0.5 : -0.5) * (0.5 + (i % 3) * 0.18);
      out.push({
        text: FACTS[i],
        x: x, y: y, w: w, h: h, spin: spin, grow: grow,
        opacity: smooth(clamp((u - 0.72) / 0.28, 0, 1)) * (pose.earthAlpha == null ? 1 : pose.earthAlpha),
        hw: 1 - smooth(clamp((u - 0.8) / 0.2, 0, 1))
      });
    }
    return out;
  }

  function drawSats(ctx, cards) {
    if (!cards || !cards.length) return;
    var i;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.hw < 0.03) continue;
      ctx.save();
      ctx.translate(c.x + c.w / 2, c.y + c.h / 2);
      ctx.rotate(c.spin);
      ctx.globalAlpha = Math.min(0.95, c.hw);
      ctx.strokeRect(-c.w / 2, -c.h / 2, c.w, c.h);
      if (c.grow < 0.65) {
        ctx.beginPath();
        ctx.moveTo(-c.w / 2 + 2, 0);
        ctx.lineTo(c.w / 2 - 2, 0);
        ctx.moveTo(0, -c.h / 2);
        ctx.lineTo(0, c.h / 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
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

  function frames(model) {
    var cam = model.cam0;
    function P(x, y, z) { return project({ x: x, y: y, z: z || 0 }, cam); }
    function box(pts, pad) {
      var minX = 1e9;
      var minY = 1e9;
      var maxX = -1e9;
      var maxY = -1e9;
      var i;
      for (i = 0; i < pts.length; i++) {
        var s = P(pts[i][0], pts[i][1], pts[i][2]);
        if (s.x < minX) minX = s.x;
        if (s.y < minY) minY = s.y;
        if (s.x > maxX) maxX = s.x;
        if (s.y > maxY) maxY = s.y;
      }
      return {
        x: Math.max(0, Math.floor(minX - pad)),
        y: Math.max(0, Math.floor(minY - pad)),
        width: Math.ceil(maxX - minX + pad * 2),
        height: Math.ceil(maxY - minY + pad * 2)
      };
    }
    var top = BELL + BOOST + SHIP;
    var finY = BELL + BOOST - 6;
    return {
      ship: box([[-16, top + 2, 2], [16, top - 18, 2], [-14, top - 34, 1], [16, BELL + BOOST + 28, 2]], 34),
      fins: box([[-16, finY + 10, 2], [16, finY - 8, 2], [0, BELL + BOOST - 2, 0], [-8, BELL + BOOST + 8, 1]], 30),
      base: box([[-18, 0, 8], [18, 0, 8], [0, BELL + 8, 0], [-10, DECK, 10], [12, 6, -4]], 18),
      tower: box([[-28, 0, -4], [-14, TOWER + 8, 4], [-21, 80, 6], [-10, 40, 0]], 12)
    };
  }

  global.Vehicle = {
    create: create,
    paint: paint,
    start: start,
    stop: stop,
    hold: hold,
    resume: resume,
    seek: seek,
    poseAt: poseAt,
    active: active,
    frames: frames,
    FACTS: FACTS,
    DURATION: T_END
  };
})(window);
