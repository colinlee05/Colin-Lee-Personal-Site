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
    var yaw = cam && cam.yaw != null ? cam.yaw : YAW;
    var c = Math.cos(yaw);
    var s = Math.sin(yaw);
    var xr = x * c + z * s;
    var zr = -x * s + z * c;
    var persp = zr * 0.006;
    if (persp > 0.1) persp = 0.1;
    if (persp < -0.1) persp = -0.1;
    var k = cam.scale * (1 + persp);
    return { x: cam.ox + xr * k, y: cam.oy - y * k, k: k };
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

  function facing(n, yaw) {
    var yy = yaw == null ? YAW : yaw;
    var s = Math.sin(yy);
    var c = Math.cos(yy);
    return -n.x * s + n.z * c;
  }

  function shade(n, y) {
    var f = facing(n);
    var key = Math.max(0, n.y * 0.55 + f);
    var rim = Math.max(0, n.x * 0.85 - f * 0.2);
    var flood = Math.max(0, 1 - y / 26) * 0.28;
    return Math.max(0.08, Math.min(1, 0.18 + key * 0.62 + rim * 0.22 + flood));
  }

  function line(arr, a, b, alpha, width, kind) {
    arr.push({ a: a, b: b, alpha: alpha, w: width || 1, kind: kind || "detail" });
  }

  function cylRing(arr, y, r, alpha, width, kind) {
    var n = 36;
    var i;
    for (i = 0; i < n; i++) {
      var t0 = (i / n) * Math.PI * 2;
      var t1 = ((i + 1) / n) * Math.PI * 2;
      if (Math.sin((t0 + t1) / 2) < -0.25) continue;
      line(arr,
        { x: r * Math.cos(t0), y: y, z: r * Math.sin(t0) },
        { x: r * Math.cos(t1), y: y, z: r * Math.sin(t1) },
        alpha, width, kind || "ring");
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
      if (prevL) line(arr, prevL, L, 0.95, 1.15, "edge");
      if (prevR) line(arr, prevR, Rt, 0.95, 1.15, "edge");
      prevL = L;
      prevR = Rt;
    }
  }

  /* Forward and aft flaps. Hinge azimuth 0 is leeward (+X), PI is the tiled
     windward belly. Real hinges sit just leeward of the port and starboard
     edges; the planform folds toward the lee side, so neither flap grows out
     of the heat shield. Coordinates are meters in the ship frame. */
  function addFlap(lines, dots, spec, flaps) {
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
    if (flaps) flaps.push({ pts: outline.slice(), far: !!spec.ghost });
    if (spec.ghost) return;
    var mark = lines.length;
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
        dots.push({ x: face.x, y: face.y, z: face.z, nx: bx, ny: lift, nz: bz, tile: 0, flap: 1 });
        dots.push({ x: back.x, y: back.y, z: back.z, nx: -bx, ny: lift, nz: -bz, tile: 0, flap: 1 });
      }
    }
    for (i = mark; i < lines.length; i++) lines[i].kind = "flap";
  }

  function addFlaps(lines, dots, flaps) {
    var sides = [1.02, -1.02];
    var s;
    for (s = 0; s < sides.length; s++) {
      var ghost = sides[s] < 0;
      addFlap(lines, dots, {
        phi: sides[s], lee: 0.94, thick: 0.28, ghost: ghost,
        yLE: 44.6, yTE: 38.2, sweep: 1.8, tipChord: 3.6,
        spanLE: 2.45, spanTE: 2.05, rootGap: 0.04, fillet: 0.55, cover: 0.35
      }, flaps);
      addFlap(lines, dots, {
        phi: sides[s], lee: 0.9, thick: 0.42, ghost: ghost,
        yLE: 19.6, yTE: 3.2, sweep: 4.6, tipChord: 7.4,
        spanLE: 4.15, spanTE: 3.15, rootGap: 0.06, fillet: 1.15, cover: 0.55
      }, flaps);
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

    var flaps = [];
    addFlaps(lines, dots, flaps);
    addHex(lines);
    addShipEngines(lines, dots);
    return {
      dots: dots, lines: lines, flaps: flaps,
      kind: "ship", length: SHIP,
      radiusAt: shipRadius,
      pivotX: 0, pivotY: SHIP / 2
    };
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
    return {
      dots: dots, lines: lines, flaps: [],
      kind: "booster", length: BOOST,
      radiusAt: function (y) { return y < 5.6 ? R * 1.12 : R; },
      pivotX: 0, pivotY: BOOST / 2
    };
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
      line(arr, corner(inner, y0, -thick), corner(outer, y0, -thick), 0.95, 1.1, "fin");
      line(arr, corner(outer, y0, -thick), corner(outer, y1, -thick), 0.95, 1.1, "fin");
      line(arr, corner(outer, y1, -thick), corner(inner, y1, -thick), 0.95, 1.1, "fin");
      line(arr, corner(inner, y1, -thick), corner(inner, y0, -thick), 0.95, 1.1, "fin");
      var g;
      for (g = 1; g <= 4; g++) {
        var y = y0 + ((y1 - y0) * g) / 5;
        line(arr, corner(inner, y, 0), corner(outer, y, 0), 0.92, 1, "fin");
      }
      for (g = 1; g <= 4; g++) {
        var rad = inner + ((outer - inner) * g) / 5;
        line(arr, corner(rad, y0, 0), corner(rad, y1, 0), 0.92, 1, "fin");
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
        0.9, 1.4, "fin");
      line(arr,
        { x: ox * (R + 0.7), y: y - 0.35, z: oz * (R + 0.7) },
        { x: ox * (R + 0.7), y: y + 0.35, z: oz * (R + 0.7) },
        0.9, 1.3, "fin");
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

  function buildTowerLines(cx, z0, scale) {
    var arr = [];
    var sc = scale || 1;
    var hw = 4.1 * sc;
    var zc = z0 || 0;
    var top = TOWER * sc;
    var corners = [
      { x: cx - hw, z: zc - hw },
      { x: cx + hw, z: zc - hw },
      { x: cx + hw, z: zc + hw },
      { x: cx - hw, z: zc + hw }
    ];
    var i;
    corners.forEach(function (c) {
      line(arr, { x: c.x, y: 0, z: c.z }, { x: c.x, y: top, z: c.z }, 0.9, 1.15);
    });
    var bay = 7.4 * sc;
    var y;
    for (y = bay; y < top; y += bay) {
      var f;
      for (f = 0; f < 4; f++) {
        var a = corners[f];
        var b = corners[(f + 1) % 4];
        line(arr, { x: a.x, y: y, z: a.z }, { x: b.x, y: y, z: b.z }, 0.55, 0.9);
        line(arr, { x: a.x, y: y - bay, z: a.z }, { x: b.x, y: y, z: b.z }, 0.38, 0.75);
        line(arr, { x: b.x, y: y - bay, z: b.z }, { x: a.x, y: y, z: a.z }, 0.38, 0.75);
      }
    }
    line(arr, { x: cx, y: top, z: zc }, { x: cx, y: top + 7 * sc, z: zc }, 0.85, 1.1);
    line(arr, { x: cx - 3.2 * sc, y: top + 1.2 * sc, z: zc + 0.4 }, { x: cx + 4.5 * sc, y: top + 1.2 * sc, z: zc + 0.4 }, 0.7, 1);
    line(arr, { x: cx, y: top + 7 * sc, z: zc }, { x: cx + 1.4 * sc, y: top + 5.2 * sc, z: zc }, 0.6, 0.8);
    return arr;
  }

  function buildPadLines() {
    var arr = [];
    var top = DECK + 1.7;
    var bot = DECK - 1.6;
    var outer = 13.2;
    var inner = 6.4;
    cylRing(arr, top, outer, 0.98, 1.45);
    cylRing(arr, top, inner, 0.9, 1.25);
    cylRing(arr, bot, outer * 0.97, 0.9, 1.3);
    cylRing(arr, bot, inner * 0.92, 0.7, 1.1);
    cylRing(arr, (top + bot) / 2, outer * 0.98, 0.45, 1.05);
    var i;
    for (i = 0; i < 24; i++) {
      var t = (i / 24) * Math.PI * 2;
      line(arr,
        { x: Math.cos(t) * outer, y: bot, z: Math.sin(t) * outer },
        { x: Math.cos(t) * outer, y: top, z: Math.sin(t) * outer },
        0.72, 1.15);
    }
    for (i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + 0.2;
      line(arr,
        { x: Math.cos(a) * inner, y: top, z: Math.sin(a) * inner },
        { x: Math.cos(a) * outer, y: top, z: Math.sin(a) * outer },
        0.55, 1.05);
    }
    for (i = 0; i < 6; i++) {
      var la = (i / 6) * Math.PI * 2 + 0.42;
      var tx = -Math.sin(la);
      var tz = Math.cos(la);
      var foot = 21.5;
      var knee = 11.4;
      [-0.85, 0.85].forEach(function (side) {
        line(arr,
          { x: Math.cos(la) * knee + tx * side, y: bot, z: Math.sin(la) * knee + tz * side },
          { x: Math.cos(la) * foot + tx * side * 1.35, y: 0.15, z: Math.sin(la) * foot + tz * side * 1.35 },
          0.95, 1.45);
      });
      line(arr,
        { x: Math.cos(la) * knee - tx * 0.85, y: bot, z: Math.sin(la) * knee - tz * 0.85 },
        { x: Math.cos(la) * knee + tx * 0.85, y: bot, z: Math.sin(la) * knee + tz * 0.85 },
        0.8, 1.2);
      line(arr,
        { x: Math.cos(la) * foot - tx * 1.15, y: 0.15, z: Math.sin(la) * foot - tz * 1.15 },
        { x: Math.cos(la) * foot + tx * 1.15, y: 0.15, z: Math.sin(la) * foot + tz * 1.15 },
        0.85, 1.25);
      var mid = 0.45;
      line(arr,
        { x: Math.cos(la) * mix(knee, foot, mid) - tx * 0.9, y: mix(bot, 0.15, mid), z: Math.sin(la) * mix(knee, foot, mid) - tz * 0.9 },
        { x: Math.cos(la) * mix(knee, foot, mid) + tx * 0.9, y: mix(bot, 0.15, mid), z: Math.sin(la) * mix(knee, foot, mid) + tz * 0.9 },
        0.6, 1.05);
    }
    cylRing(arr, 0.85, 16.5, 0.72, 1.2);
    cylRing(arr, 0.85, 7.2, 0.55, 1.05);
    for (i = 0; i < 10; i++) {
      var pa = (i / 10) * Math.PI * 2;
      line(arr,
        { x: Math.cos(pa) * 7.2, y: 0.85, z: Math.sin(pa) * 7.2 },
        { x: Math.cos(pa) * 16.5, y: 0.85, z: Math.sin(pa) * 16.5 },
        0.4, 1.05);
    }
    cylRing(arr, 0.05, 34, 0.38, 1.1);
    cylRing(arr, 0.05, 22, 0.22, 1);
    var tanks = [-46, -41.2, -36.6, -32.2];
    tanks.forEach(function (x, idx) {
      var h = 11 + (idx % 2) * 4.5;
      var r = 1.7;
      line(arr, { x: x - r, y: 0, z: -16 }, { x: x - r, y: h, z: -16 }, 0.55, 1.05);
      line(arr, { x: x + r, y: 0, z: -16 }, { x: x + r, y: h, z: -16 }, 0.55, 1.05);
      line(arr, { x: x - r, y: h, z: -16 }, { x: x, y: h + 1.6, z: -16 }, 0.5, 1);
      line(arr, { x: x + r, y: h, z: -16 }, { x: x, y: h + 1.6, z: -16 }, 0.5, 1);
      line(arr, { x: x - r, y: h * 0.35, z: -16 }, { x: x + r, y: h * 0.35, z: -16 }, 0.4, 1);
      line(arr, { x: x - r, y: h * 0.7, z: -16 }, { x: x + r, y: h * 0.7, z: -16 }, 0.4, 1);
      if (idx) line(arr, { x: tanks[idx - 1], y: 2.2, z: -16 }, { x: x, y: 2.2, z: -16 }, 0.4, 1);
    });
    line(arr, { x: -26, y: 0, z: -8 }, { x: -26, y: 22, z: -8 }, 0.4, 1);
    line(arr, { x: -28.2, y: 20, z: -8 }, { x: -23.8, y: 20, z: -8 }, 0.35, 1);
    return arr;
  }

  function create(w, h, cramped) {
    var ship = buildShip();
    var booster = buildBooster();
    var towerX = -21;
    var tower = buildTowerLines(towerX);
    var pad = buildPadLines();
    var marginTop = cramped ? 108 : 76;
    var marginBot = cramped ? 200 : 46;
    var scale = (h - marginTop - marginBot) / (TOWER + 8);
    var cam = {
      scale: scale,
      ox: w * (cramped ? 0.48 : 0.5),
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
        ship: { x: P(R + 2.2, BELL + BOOST + 30, 0).x, y: P(R + 2.2, BELL + BOOST + 30, 0).y },
        home: coastSpot(cam, cramped ? -150 : -580, 18),
        dish: coastSpot(cam, cramped ? -110 : -500, 10),
        stadium: coastSpot(cam, cramped ? -40 : -330, 36),
        memorial: coastSpot(cam, cramped ? 10 : -190, 58),
        office: coastSpot(cam, cramped ? 70 : 190, 26),
        terminal: { x: comp.x + comp.w * 0.72, y: comp.y + comp.h * 0.28 },
        keys: { x: comp.x + comp.w * 0.35, y: comp.y + comp.h * 0.82 }
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
     +6 min descent              16-21    arrives beside the tower still tilted, arms open
     landing burn                21-24    two seconds tilting upright, plume on
     hover                       24-25    vertical, beside the open arms, at least a second
     catch                       25-27    arms close over a second, then a small settle
     pullback                    28-33    tower shrinks and drops off screen
     orbit                       34-43    globe fades in only after the tower is gone
     deorbit                     41-43    engines face along the velocity
     reentry                     44-51    ship fades in from above, tower already in frame
     flip, hover, catch          51-57    two-second flip, hover, arms close
     reset                       58-61    tower and ship fade together

     The pose is a pure function of t. The tilt, the flip, and the arm close
     are linear over their own holds, so each one stays readable at playback
     speed. The globe never shares the frame with the launch tower. The second
     tower is on screen for the whole descent. */

  var T_SPLIT = 12.2;
  var CATCH_X = -8;
  var CATCH_Y = 92;
  var CATCH2_X = -6.5;
  var CATCH2_Y = 86;
  var T_END = 67.2;

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

  function catmull(keys, t) {
    if (t <= keys[0].t) return keys[0].v;
    if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;
    var i = 1;
    while (i < keys.length - 1 && t > keys[i].t) i++;
    var p0 = keys[Math.max(0, i - 2)].v;
    var p1 = keys[i - 1].v;
    var p2 = keys[i].v;
    var p3 = keys[Math.min(keys.length - 1, i + 1)].v;
    var u = (t - keys[i - 1].t) / (keys[i].t - keys[i - 1].t);
    var u2 = u * u;
    var u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }

  function ramp(t, a, b) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    return smooth((t - a) / (b - a));
  }

  function span(t, a, b) {
    if (t <= a) return 0;
    if (t >= b) return 1;
    return (t - a) / (b - a);
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
      landIn: 0,
      landShow: 0,
      heroIn: 0,
      padFade: 1,
      depart: 1,
      veil: 0,
      earthIn: 1,
      entry: 0,
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
    if (t < 14.8) return "Booster flips, engines already lit.";
    if (t < 17.2) return "Boostback burn. Nose toward the pad.";
    if (t < 20.6) return "Coast. Grid fins steering.";
    if (t < 23.4) return "Landing burn. Thirteen engines.";
    if (t < 25.2) return "Three center engines. Diverting into the arms.";
    if (t < 25.6) return "Near hover between the chopsticks.";
    if (t < 26.7) return "Arms closing over the grid fins.";
    if (t < 28.2) return "Engines off. Booster sits on the arms.";
    if (t < 32.2) return "Pulling back. Ship climbing to orbit.";
    if (t < 33.2) return "Ship on orbit.";
    if (t < 34.2) return "Payload door opening.";
    if (t < 37.2) return "Satellites deploying.";
    if (t < 47.4) return "Starlink Aviation: in-flight Wi-Fi at 35,000 ft.";
    if (t < 49.0) return "Deorbit burn. Engines face the direction of flight.";
    if (t < 55.4) return "Reentry. Plasma on the heat shield.";
    if (t < 57.6) return "Flaps swing. Engines relight into the flip.";
    if (t < 59.6) return "Landing burn. Three sea-level Raptors.";
    if (t < 60.3) return "Ship hovering between the open arms.";
    if (t < 61.2) return "Arms closing on the catch pins.";
    if (t < 63.4) return "Engines off. The ship sits on the arms.";
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
        { t: T_SPLIT, v: 0 }, { t: 13.2, v: 14 }, { t: 15.4, v: 48 },
        { t: 18.5, v: 130 }, { t: 26, v: 280 }, { t: 34, v: 420 }
      ], t);
      pose.ship = slide(split.ship, dist, mix(0, -6, ramp(t, 14, 20)));
      var b0 = split.booster;
      var flipBack = smooth(span(t, 12.3, 14.7));
      var toEntry = smooth(span(t, 18.6, 21.8));
      var br = mix(mix(b0.rot, 90, flipBack), 0, toEntry);
      var bx = lin([
        { t: 12.2, v: b0.x },
        { t: 14.7, v: b0.x + 22 },
        { t: 17.0, v: 38 },
        { t: 19.4, v: 24 },
        { t: 21.4, v: 16 },
        { t: 23.0, v: 7.5 },
        { t: 24.5, v: CATCH_X + 1.3 },
        { t: 25.4, v: CATCH_X },
        { t: 27.6, v: CATCH_X }
      ], t);
      var by = lin([
        { t: 12.2, v: b0.y },
        { t: 14.6, v: b0.y - 4 },
        { t: 16.8, v: 250 },
        { t: 19.0, v: 168 },
        { t: 21.2, v: 124 },
        { t: 22.8, v: CATCH_Y + 20 },
        { t: 23.9, v: CATCH_Y + 6.5 },
        { t: 24.9, v: CATCH_Y + 1.7 },
        { t: 25.7, v: CATCH_Y + 0.35 },
        { t: 26.35, v: CATCH_Y - 0.5 },
        { t: 26.9, v: CATCH_Y + 0.16 },
        { t: 27.5, v: CATCH_Y }
      ], t);
      pose.booster = bodyPose(bx, by, br, BOOST / 2);
    }

    var bTh = ramp(t, 1.45, 2.45);
    var dip = ramp(t, 7.15, 7.75) * (1 - ramp(t, 8.55, 9.25));
    bTh *= 1 - 0.4 * dip;
    var meco = ramp(t, 10.55, 11.4);
    bTh = bTh * (1 - meco) + 0.1 * meco;
    pose.booster.bells = 3;
    if (t >= T_SPLIT) {
      var residual = 0.1 * (1 - ramp(t, T_SPLIT, T_SPLIT + 0.4));
      var flipOn = ramp(t, 12.22, 12.4);
      var bb = ramp(t, 14.45, 14.9) * (1 - ramp(t, 16.85, 17.25));
      var land13 = ramp(t, 20.55, 21.0) * (1 - ramp(t, 23.2, 23.6));
      var land3 = ramp(t, 23.1, 23.5) * (1 - ramp(t, 26.15, 26.7));
      var flipTh = flipOn * (1 - ramp(t, 16.9, 17.45)) * 0.82;
      bTh = Math.min(1, residual * (1 - flipOn) + flipTh * (1 - bb) + bb * 0.95 + land13 + land3 * 0.62);
      pose.booster.bells = land13 > 0.2 && land13 >= land3 ? 13 : 3;
    }
    pose.booster.thrust = bTh;
    pose.booster.plume = bTh > 0.04 ? bTh : (t > 26.05 && t < 26.85 ? (1 - ramp(t, 26.1, 26.8)) * 0.35 : 0);
    pose.shock = dip;
    pose.ship.thrust = ramp(t, 10.65, 11.75) * (1 - ramp(t, 15.7, 16.5));
    pose.qd = ramp(t, 0.15, 1.55);
    pose.clamps = ramp(t, 2.15, 2.75);
    pose.steam = ramp(t, 1.35, 2.15) * (1 - ramp(t, 6.4, 8.3));

    var pin0 = BELL + BOOST - 6.4;
    var pinCatch = CATCH_Y + (BOOST / 2 - 6.4);
    var trackY = clamp(pose.booster.y + (BOOST / 2 - 6.4), pin0, pinCatch + 4);
    pose.sticksY = t < 16.2 ? pin0 : mix(pin0, trackY, smooth(span(t, 16.2, 18.4)));
    pose.sticksOpen = mix(0.78 + 0.18 * ramp(t, 0.2, 1.75), 0.06, smooth(span(t, 25.6, 26.55)));

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
    var handoff = smooth(span(t, 12.25, 13.15));
    var chaseScale = model.cam0.scale * mix(0.58, 0.78, smooth(span(t, 16.4, 21.2)));
    var chase = {
      scale: chaseScale,
      ox: model.w * (model.cramped ? 0.52 : 0.56),
      oy: model.h * 0.5,
      lookX: pose.booster.x,
      lookY: pose.booster.y
    };
    pose.cam = blendCam(ascentCam, chase, handoff);
    var pull = smooth(span(t, 27.6, 30.4));
    var sep = Math.abs(pose.ship.y - pose.booster.y) + Math.abs(pose.ship.x - pose.booster.x) + 70;
    var fit = Math.min(model.cam0.scale * 0.46, (model.h * 0.52) / sep);
    pose.cam = blendCam(pose.cam, {
      scale: fit,
      ox: model.w * 0.5,
      oy: model.h * 0.5,
      lookX: (pose.booster.x + pose.ship.x) * 0.5,
      lookY: (pose.booster.y + pose.ship.y) * 0.5
    }, pull);

    var lx = lin([
      { t: 48.4, v: 72 },
      { t: 51.2, v: 48 },
      { t: 54.0, v: 28 },
      { t: 56.2, v: 14 },
      { t: 57.8, v: 5 },
      { t: 59.0, v: CATCH2_X + 0.6 },
      { t: 60.0, v: CATCH2_X },
      { t: 64.0, v: CATCH2_X }
    ], t);
    var ly = lin([
      { t: 48.4, v: 520 },
      { t: 51.4, v: 380 },
      { t: 54.0, v: 240 },
      { t: 56.2, v: 150 },
      { t: 57.6, v: CATCH2_Y + 26 },
      { t: 58.8, v: CATCH2_Y + 7 },
      { t: 59.8, v: CATCH2_Y + 1.4 },
      { t: 60.6, v: CATCH2_Y + 0.25 },
      { t: 61.3, v: CATCH2_Y - 0.45 },
      { t: 61.9, v: CATCH2_Y + 0.14 },
      { t: 62.7, v: CATCH2_Y },
      { t: 64.0, v: CATCH2_Y }
    ], t);
    var lrot = mix(86, 0, smooth(span(t, 54.8, 57.4)));
    pose.landShip = bodyPose(lx, ly, lrot, SHIP / 2);
    pose.landShip.thrust = ramp(t, 56.6, 57.2) * (1 - ramp(t, 60.4, 60.9));
    pose.landShip.plume = pose.landShip.thrust > 0.04
      ? pose.landShip.thrust
      : (t > 60.3 && t < 61.15 ? (1 - ramp(t, 60.4, 61.1)) * 0.3 : 0);
    pose.landShip.plasma = ramp(t, 48.5, 49.2) * (1 - ramp(t, 54.6, 56.0));
    var shipPin = clamp(ly + (SHIP / 2 - 8), 70, CATCH2_Y + SHIP / 2 - 6);
    pose.sticks2Y = shipPin;
    pose.sticks2Open = mix(0.96, 0.05, smooth(span(t, 60.2, 61.15)));
    var unit = model.cam0.scale / 5.05;
    var tighten = smooth(span(t, 52.8, 58.6));
    pose.landCam = {
      scale: mix(2.55, 4.05, tighten) * unit * (model.cramped ? 0.78 : 1),
      ox: model.w * (model.cramped ? 0.55 : 0.56),
      oy: model.h * 0.5,
      lookX: mix(28, CATCH2_X, tighten),
      lookY: mix(ly * 0.42 + 80, 86, tighten)
    };
    var groundScreen = pose.landCam.oy + pose.landCam.lookY * pose.landCam.scale;
    var navClear = model.h - 156;
    if (groundScreen > navClear) {
      var shipScreen = pose.landCam.oy - (ly - pose.landCam.lookY) * pose.landCam.scale;
      var need = groundScreen - navClear;
      var room = Math.max(0, shipScreen - 88);
      pose.landCam.oy -= Math.min(need, room);
      if (need > room) {
        var shipNow = shipScreen - room;
        var worldSpan = (navClear + (need - room)) - shipNow;
        if (worldSpan > 40) {
          pose.landCam.scale = Math.max(1.15, pose.landCam.scale * ((navClear - shipNow) / worldSpan));
          pose.landCam.oy = shipNow + (ly - pose.landCam.lookY) * pose.landCam.scale;
          pose.landCam.oy -= (pose.landCam.oy + pose.landCam.lookY * pose.landCam.scale) - navClear;
        }
      }
    }
    function bellyExtents(cam) {
      var tail = project(xform({ x: 0, y: 0, z: 0 }, pose.landShip), cam);
      var nose = project(xform({ x: 0, y: SHIP, z: 0 }, pose.landShip), cam);
      var dx = nose.x - tail.x;
      var dy = nose.y - tail.y;
      var al = Math.hypot(dx, dy) || 1;
      var ax = dx / al;
      var ay = dy / al;
      var px = -ay;
      var py = ax;
      if (py > 0) { px = -px; py = -py; }
      var dia = al / 5.5;
      var minX = 1e9;
      var minY = 1e9;
      var maxX = -1e9;
      var maxY = -1e9;
      var i;
      for (i = 0; i <= 16; i++) {
        var u = i / 16;
        var r = dia * 0.5;
        if (u > 0.68) r *= Math.cos(((u - 0.68) / 0.32) * Math.PI / 2);
        var flap = 0;
        if (u > 0.64 && u < 0.9) flap = dia * 0.32;
        if (u < 0.36) flap = Math.max(flap, dia * 0.46);
        var x = tail.x + ax * al * u;
        var y = tail.y + ay * al * u;
        var xs = [x + px * (r + flap), x - px * r];
        var ys = [y + py * (r + flap), y - py * r];
        var k;
        for (k = 0; k < 2; k++) {
          if (xs[k] < minX) minX = xs[k];
          if (ys[k] < minY) minY = ys[k];
          if (xs[k] > maxX) maxX = xs[k];
          if (ys[k] > maxY) maxY = ys[k];
        }
      }
      return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }
    var ext = bellyExtents(pose.landCam);
    if (ext.minX < 36) pose.landCam.ox += 36 - ext.minX;
    if (ext.maxX > model.w - 36) pose.landCam.ox -= ext.maxX - (model.w - 36);
    ext = bellyExtents(pose.landCam);
    if (ext.minY < 72) {
      var drop = 72 - ext.minY;
      var gNow = pose.landCam.oy + pose.landCam.lookY * pose.landCam.scale;
      var roomDown = Math.max(0, navClear - gNow);
      if (drop <= roomDown) pose.landCam.oy += drop;
      else {
        pose.landCam.scale = Math.max(1.05, pose.landCam.scale * (1 - (drop - roomDown) / Math.max(120, ly * pose.landCam.scale)));
        pose.landCam.oy = Math.min(navClear, gNow + roomDown) - pose.landCam.lookY * pose.landCam.scale;
      }
    }
    pose.shipIn = 1;
    pose.depart = 1 - ramp(t, 29.2, 29.9);
    pose.padFade = 1 - ramp(t, 29.5, 30.2);
    pose.satPush = 0;

    pose.worldAlpha = t >= 63.6 ? 0 : (1 - ramp(t, 29.5, 30.2));
    pose.landShow = ramp(t, 48.3, 49.3) * (1 - ramp(t, 63.6, 63.95));
    pose.heroIn = ramp(t, 64.0, 64.6);
    pose.veil = 0;
    pose.earthAlpha = ramp(t, 29.0, 30.5) * (1 - ramp(t, 48.2, 49.4));
    pose.earthIn = ramp(t, 29.0, 30.6);
    pose.landIn = pose.landShow;
    pose.useHero = pose.heroIn > 0.004;
    pose.door = ramp(t, 32.45, 33.2) * (1 - ramp(t, 40.3, 41.15));
    pose.deorbit = ramp(t, 46.5, 47.1) * (1 - ramp(t, 48.2, 48.9));
    pose.retro = ramp(t, 45.6, 46.3) * (1 - ramp(t, 48.4, 49.2));
    pose.entry = ramp(t, 49.3, 50.0) * (1 - ramp(t, 55.0, 56.2));
    pose.ang = 0.98 + Math.max(0, t - 31.0) * 0.008;
    if (pose.landShow > pose.earthAlpha && pose.landShow > 0.5 && pose.heroIn < 0.5) pose.scene = "landing";
    else if (pose.earthAlpha > pose.worldAlpha && t < 50) pose.scene = "earth";
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
    if (pose.landShow > 0.004) {
      drawLanding(fadeCtx(ctx, pose.landShow), model, pose);
    }
    if (pose.worldAlpha > 0.004 && !pose.useHero && pose.padFade > 0.004) {
      drawPad(fadeCtx(ctx, pose.worldAlpha * pose.padFade), model, pose);
    }
    if (pose.heroIn > 0.004) {
      var hero = padPose();
      hero.showComputer = true;
      hero.t = 0;
      hero.depart = 1;
      drawPad(fadeCtx(ctx, pose.heroIn), model, hero);
    }
    if (pose.earthAlpha > 0.004) drawEarth(fadeCtx(ctx, pose.earthAlpha), model, pose);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  var PAD_APART = 360;

  function drawHorizon(ctx, cam, model) {
    var g = project({ x: cam.lookX || 0, y: 0, z: 0 }, cam);
    var y = g.y;
    if (y < 8 || y > model.h - 4) return y;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(12, Math.round(y) + 0.5);
    ctx.lineTo(model.w - 12, Math.round(y) + 0.5);
    ctx.stroke();
    var i;
    for (i = 0; i < 110; i++) {
      var x = 16 + ((i * 97) % Math.max(20, model.w - 32));
      var dy = 2 + (i * 17) % 14;
      if (y + dy > model.h - 6) continue;
      ctx.globalAlpha = 0.08 + (i % 4) * 0.03;
      ctx.beginPath();
      ctx.arc(x, y + dy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return y;
  }

  function drawAnchoredTower(ctx, model, cam, spec) {
    var horizon = project({ x: cam.lookX || 0, y: 0, z: 0 }, cam);
    var dist = Math.abs(spec.x - (cam.lookX || 0));
    var shrink = 260 / (260 + Math.max(200, dist));
    var local = {
      scale: cam.scale * shrink,
      ox: cam.ox,
      oy: horizon.y,
      lookX: cam.lookX || 0,
      lookY: 0,
      yaw: cam.yaw == null ? YAW : cam.yaw
    };
    var top = project({ x: spec.x, y: TOWER, z: 0 }, local);
    var base = project({ x: spec.x, y: 0, z: 0 }, local);
    if (spec.x > 0 && base.x > model.w - 340) {
      local.ox -= base.x - (model.w - 340);
      top = project({ x: spec.x, y: TOWER, z: 0 }, local);
      base = project({ x: spec.x, y: 0, z: 0 }, local);
    }
    if (top.y > model.h + 8 || base.y < -8) return;
    var foot = 10 * local.scale;
    if (base.x - foot < 6 || base.x + foot > model.w - 6) return;
    var shift = spec.x - model.towerX;
    var pose = { x: shift, y: 0, rot: 0, pivotX: 0, pivotY: 0, z: 0 };
    strokeAll(ctx, model.tower, pose, local, spec.alpha);
    drawChopsticks(ctx, local, model.towerX + shift, spec.chopY, spec.open, spec.alpha);
    var feet = [];
    var hw = 4.1;
    var sx, sz;
    for (sx = -1; sx <= 1; sx += 2) {
      for (sz = -1; sz <= 1; sz += 2) {
        line(feet,
          { x: spec.x + sx * hw, y: 0, z: sz * hw },
          { x: spec.x + sx * hw, y: 42, z: sz * hw },
          1, 1.45);
      }
    }
    strokeAll(ctx, feet, null, local, Math.min(0.92, spec.alpha + 0.3));
    var footL = project({ x: spec.x - 7, y: 0, z: 0 }, local);
    var footR = project({ x: spec.x + 8, y: 0, z: 0 }, local);
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.globalAlpha = Math.min(0.92, spec.alpha + 0.3);
    ctx.beginPath();
    ctx.moveTo(footL.x, horizon.y);
    ctx.lineTo(footR.x, horizon.y);
    ctx.stroke();
    ctx.restore();
    if (spec.booster) {
      var b = spec.booster;
      drawBody(ctx, model.booster, bodyPose(b.x + shift, b.y, b.rot || 0, b.pivotY), local, spec.alpha * 0.92);
    }
  }

  function coastSpot(cam, px, lift) {
    var pad = project({ x: 0, y: 0, z: 0 }, cam);
    var s = Math.max(0.4, Math.min(1.15, (cam.scale || 1) / 4.86));
    return { x: pad.x + px * s, y: pad.y - (lift || 0) * s };
  }

  function drawCoast(ctx, model, cam) {
    if (!cam || cam.scale < model.cam0.scale * 0.42) return;
    var horizon = project({ x: cam.lookX || 0, y: 0, z: 0 }, cam);
    var ground = { x: project({ x: 0, y: 0, z: 0 }, cam).x, y: horizon.y };
    if (ground.y < 36) return;
    if (model.mission && ground.y > model.h - 108) return;
    var s = Math.max(0.42, Math.min(1, cam.scale / model.cam0.scale));
    var cramped = model.cramped;
    var showLabels = s >= 0.84;
    var towerXs = [
      project({ x: model.towerX, y: 0, z: 0 }, cam).x,
      project({ x: -16, y: 0, z: 0 }, cam).x
    ];
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.15;
    function site(meters, draw, label, lift, half) {
      var p = coastSpot(cam, meters, 0);
      p.y = ground.y;
      var hw = (half || 36) * s;
      if (p.x - hw < 8 || p.x + hw > model.w - 8) return;
      ctx.globalAlpha = 0.62;
      draw(ctx, p.x, p.y, s * 1.28);
      if (label && showLabels) {
        ctx.globalAlpha = 0.72;
        ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
        var tw = ctx.measureText(label).width;
        var tx = label.indexOf("LSU") === 0 ? p.x - tw + 8 : p.x - tw / 2;
        var ty = p.y - lift;
        var clear = tx > 8 && tx + tw < model.w - 8;
        var i;
        for (i = 0; i < towerXs.length && clear; i++) {
          if (tx < towerXs[i] + 34 && tx + tw > towerXs[i] - 34) clear = false;
        }
        if (clear) ctx.fillText(label, tx, ty);
      }
    }
    if (cramped) {
      var tankRight = project({ x: -30.4, y: 0, z: -16 }, cam).x;
      var towerLeft = project({ x: model.towerX - 5, y: 0, z: 0 }, cam).x;
      ctx.font = "9px IBM Plex Mono, ui-monospace, monospace";
      ctx.fillStyle = INK;
      var homeX = (tankRight + towerLeft) / 2;
      if (towerLeft - tankRight > 22) {
        ctx.globalAlpha = 0.9;
        drawHome(ctx, homeX, ground.y, 0.28);
        ctx.globalAlpha = 0.95;
        var homeW = ctx.measureText("Home").width;
        ctx.fillText("Home", Math.max(4, homeX - homeW / 2), ground.y - 30);
      }
      var comp = model.ui && model.ui.comp;
      var padBX = model.w - 16;
      var gapL = comp ? comp.x + comp.w + 8 : padBX - 40;
      var gapR = padBX - 14;
      if (gapR - gapL > 22) {
        var stadX = (gapL + gapR) / 2;
        ctx.globalAlpha = 0.88;
        drawStadium(ctx, stadX, ground.y, 0.22);
        ctx.globalAlpha = 0.95;
        var lsuW = ctx.measureText("LSU").width;
        ctx.fillText("LSU", stadX - lsuW / 2, ground.y - 28);
      }
      ctx.globalAlpha = 0.7;
      ctx.strokeRect(padBX - 3, ground.y - 36, 5, 36);
      ctx.beginPath();
      ctx.moveTo(padBX - 1, ground.y - 20);
      ctx.lineTo(padBX + 6, ground.y - 16);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.fillText("Pad B", Math.min(padBX - 4, model.w - 32), ground.y - 44);
    } else {
      site(-580, drawHome, "Home, New Orleans", 84, 48);
      site(-500, drawDish, "", 0, 16);
      site(-330, drawStadium, "LSU, Baton Rouge", 72, 62);
      site(-190, drawMemorial, "", 0, 16);
      site(190, drawOffice, "", 0, 22);
    }
    ctx.restore();
  }

  function drawStadium(ctx, x, y, s) {
    var w = 92 * s;
    var bowl = 28 * s;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.52, y);
    ctx.lineTo(x - w * 0.52, y - bowl * 0.72);
    ctx.quadraticCurveTo(x - w * 0.2, y - bowl * 1.35, x, y - bowl * 0.55);
    ctx.quadraticCurveTo(x + w * 0.22, y - bowl * 1.55, x + w * 0.52, y - bowl);
    ctx.lineTo(x + w * 0.52, y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - w * 0.34, y - 3 * s);
    ctx.quadraticCurveTo(x, y - bowl * 0.42, x + w * 0.34, y - 4 * s);
    ctx.stroke();
    ctx.strokeRect(x - w * 0.1, y - bowl * 0.28, w * 0.2, bowl * 0.16);
    function mast(mx, top) {
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(mx, y - top);
      ctx.moveTo(mx - 5 * s, y - top);
      ctx.lineTo(mx + 5 * s, y - top);
      ctx.moveTo(mx - 3 * s, y - top + 3 * s);
      ctx.lineTo(mx + 3 * s, y - top + 3 * s);
      ctx.stroke();
    }
    mast(x - w * 0.58, bowl * 1.15);
    mast(x + w * 0.58, bowl * 1.35);
  }

  function drawMemorial(ctx, x, y, s) {
    var w = 8 * s;
    var h = 72 * s;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.lineTo(x - w * 0.7, y - h);
    ctx.lineTo(x + w * 0.7, y - h);
    ctx.lineTo(x + w, y);
    ctx.moveTo(x - w * 1.15, y - h);
    ctx.lineTo(x, y - h - 18 * s);
    ctx.lineTo(x + w * 1.15, y - h);
    ctx.moveTo(x, y - h * 0.72);
    ctx.arc(x, y - h * 0.72, 4.2 * s, 0, Math.PI * 2);
    ctx.moveTo(x, y - h * 0.72 - 4.2 * s);
    ctx.lineTo(x, y - h * 0.72 + 4.2 * s);
    ctx.moveTo(x - 4.2 * s, y - h * 0.72);
    ctx.lineTo(x + 4.2 * s, y - h * 0.72);
    ctx.stroke();
  }

  function drawHome(ctx, x, y, s) {
    var w = 62 * s;
    var story = 14 * s;
    var h = story * 2;
    ctx.strokeRect(x - w * 0.38, y - h, w * 0.76, h);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.46, y - h);
    ctx.lineTo(x, y - h - 13 * s);
    ctx.lineTo(x + w * 0.46, y - h);
    ctx.moveTo(x - w * 0.38, y - story);
    ctx.lineTo(x + w * 0.38, y - story);
    ctx.stroke();
    ctx.strokeRect(x - w * 0.26, y - h + 4 * s, 8 * s, 6 * s);
    ctx.strokeRect(x + w * 0.04, y - h + 4 * s, 8 * s, 6 * s);
    ctx.beginPath();
    ctx.moveTo(x - w * 0.5, y - story * 0.15);
    ctx.lineTo(x - w * 0.5, y);
    ctx.moveTo(x - w * 0.5, y - story * 0.62);
    ctx.lineTo(x - w * 0.08, y - story * 0.62);
    ctx.lineTo(x - w * 0.08, y);
    ctx.stroke();
    ctx.strokeRect(x - w * 0.06, y - story + 2 * s, 6 * s, story - 2 * s);
    ctx.strokeRect(x + w * 0.38, y - story * 0.9, w * 0.28, story * 0.9);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.44, y - story * 0.72);
    ctx.lineTo(x + w * 0.6, y - story * 0.72);
    ctx.stroke();
  }

  function drawDish(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 * s, y - 11 * s);
    ctx.moveTo(x - 3 * s, y);
    ctx.lineTo(x + 7 * s, y);
    ctx.stroke();
    ctx.save();
    ctx.translate(x + 2 * s, y - 12 * s);
    ctx.rotate(-0.7);
    ctx.strokeRect(-8 * s, -4.5 * s, 16 * s, 9 * s);
    ctx.beginPath();
    ctx.moveTo(-5 * s, -4.5 * s);
    ctx.lineTo(5 * s, 4.5 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawOffice(ctx, x, y, s) {
    var w = 26 * s;
    var h = 34 * s;
    ctx.strokeRect(x - w / 2, y - h, w, h);
    var r;
    var c;
    for (r = 0; r < 3; r++) {
      for (c = 0; c < 2; c++) {
        ctx.strokeRect(x - w * 0.32 + c * w * 0.38, y - h + 6 * s + r * 9 * s, 4 * s, 4 * s);
      }
    }
  }

  function clipToGround(ctx, cam, model) {
    var y = project({ x: cam.lookX || 0, y: 0, z: 0 }, cam).y;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-80, -400, model.w + 160, y + 401.5);
    ctx.clip();
  }

  function drawPad(ctx, model, pose) {
    var cam = pose.cam || model.cam0;
    var t = pose.t || 0;
    drawHorizon(ctx, cam, model);
    clipToGround(ctx, cam, model);
    drawCoast(ctx, model, cam);
    var bPowEarly = pose.booster.plume != null ? pose.booster.plume : pose.booster.thrust;
    var engineY = xform({ x: 0, y: 1.2, z: 0 }, pose.booster).y;
    if (bPowEarly > 0.35 && Math.abs(pose.booster.rot || 0) < 22 && engineY > 8 && engineY < 52) {
      drawLiftoffColumn(ctx, cam, pose.booster, bPowEarly, t);
    }
    strokeAll(ctx, model.pad, null, cam, 1);
    strokeAll(ctx, model.tower, null, cam, 1);
    if (!model.cramped) {
      drawAnchoredTower(ctx, model, cam, {
        x: PAD_APART,
        alpha: 0.62,
        chopY: BELL + BOOST - 6.4,
        open: 0.72
      });
    }
    if (pose.steam > 0.04) {
      drawSteam(ctx, cam, pose.steam, t);
      drawPadCloud(ctx, cam, pose.steam, t);
    }
    if (pose.shock > 0.04) drawShock(ctx, cam, pose, pose.shock);
    var bPow = pose.booster.plume != null ? pose.booster.plume : pose.booster.thrust;
    var liftoffColumn = bPow > 0.35 && Math.abs(pose.booster.rot || 0) < 22 && engineY > 8 && engineY < 52;
    var sPow = pose.ship.plume != null ? pose.ship.plume : pose.ship.thrust;
    if (bPow > 0.04 && !liftoffColumn) {
      var bells = pose.booster.bells || 3;
      drawPlume(ctx, cam, pose.booster, 1.05, bPow, t, 10);
      drawCore(ctx, cam, pose.booster, 1.15, bells > 3 ? 3.4 : 0.72, bPow, bells);
    }
    if (sPow > 0.04) {
      drawPlume(ctx, cam, pose.ship, -0.25, sPow, t, 80);
      drawCore(ctx, cam, pose.ship, -0.15, 2.05, sPow, 3);
    }
    if (pose.ship.thrust > 0.12) {
      var base = xform({ x: 0, y: 0, z: 0 }, pose.ship);
      var top = xform({ x: 0, y: BOOST, z: 0 }, pose.booster);
      if (Math.hypot(base.x - top.x, base.y - top.y) < 16) {
        drawVents(ctx, cam, pose.booster, pose.ship.thrust, t);
      }
    }
    drawBody(ctx, model.booster, pose.booster, cam, 1);
    var shipA = pose.depart == null ? 1 : pose.depart;
    if (shipA > 0.02) drawBody(ctx, model.ship, pose.ship, cam, shipA);
    drawChopsticks(ctx, cam, model.towerX, pose.sticksY, pose.sticksOpen, 1);
    drawQD(ctx, cam, model.towerX, pose.qd, pose.ship);
    drawClamps(ctx, cam, pose.clamps);
    ctx.restore();
    if (!model.mission || pose.showComputer) drawComputer(ctx, model);
  }

  function drawLanding(ctx, model, pose) {
    var cam = pose.landCam || pose.cam || model.cam0;
    var ship = pose.landShip || pose.ship;
    var t = pose.t || 0;
    var shipA = pose.shipIn == null ? 1 : pose.shipIn;
    drawHorizon(ctx, cam, model);
    clipToGround(ctx, cam, model);
    drawCoast(ctx, model, cam);
    if (t > 52 && !model.cramped) {
      drawAnchoredTower(ctx, model, cam, {
        x: -PAD_APART,
        alpha: 0.58,
        chopY: CATCH_Y + (BOOST / 2 - 6.4),
        open: 0.1,
        booster: bodyPose(CATCH_X, CATCH_Y, 0, BOOST / 2)
      });
    }
    strokeAll(ctx, model.pad, null, cam, 0.85);
    strokeAll(ctx, model.tower2, null, cam, 1);
    var sPow = (ship.plume != null ? ship.plume : ship.thrust) * shipA;
    if (sPow > 0.04) {
      drawPlume(ctx, cam, ship, -0.25, sPow, t, 90);
      drawCore(ctx, cam, ship, -0.15, 2.05, sPow, 3);
    }
    if (ship.plasma > 0.04 && shipA > 0.05) drawPlasma(ctx, ship, cam, ship.plasma * shipA, t);
    drawBody(ctx, model.ship, ship, cam, shipA);
    drawChopsticks(ctx, cam, -16, pose.sticks2Y, pose.sticks2Open, 1);
    ctx.restore();
  }

  var SKY = "#1c1a21";

  function lodOf(pose, cam, len) {
    var px = Math.abs((len || 50) * ((cam && cam.scale) || 1));
    var tilt = Math.abs(pose.rot || 0) % 180;
    if (tilt > 90) tilt = 180 - tilt;
    if (tilt > 20 || px < 110) return 0;
    if (tilt > 8 || px < 165) return 1;
    return 2;
  }

  function keepLine(ln, lod) {
    if (!ln || ln.kind === "flap") return false;
    if (ln.kind === "fin") return true;
    if (lod <= 0) return false;
    if (lod === 1) return ln.kind === "edge" || ln.kind === "ring" || ln.kind === "engine";
    return true;
  }

  function fillSilhouette(ctx, body, pose, cam, alpha, strokeIt) {
    var len = body.length || SHIP;
    var radiusAt = body.radiusAt || function () { return R; };
    var tail = project(xform({ x: 0, y: 0, z: 0 }, pose), cam);
    var nose = project(xform({ x: 0, y: len, z: 0 }, pose), cam);
    var ax = nose.x - tail.x;
    var ay = nose.y - tail.y;
    var al = Math.hypot(ax, ay) || 1;
    var px = -ay / al;
    var py = ax / al;
    var steps = 26;
    var upper = [];
    var lower = [];
    var i;
    var k;
    for (i = 0; i <= steps; i++) {
      var y = (len * i) / steps;
      var r = radiusAt(y);
      var bestU = -1e9;
      var bestL = 1e9;
      var uP = null;
      var lP = null;
      for (k = 0; k < 16; k++) {
        var th = (k / 16) * Math.PI * 2;
        var p = project(xform({ x: r * Math.cos(th), y: y, z: r * Math.sin(th) }, pose), cam);
        var side = (p.x - tail.x) * px + (p.y - tail.y) * py;
        if (side > bestU) { bestU = side; uP = p; }
        if (side < bestL) { bestL = side; lP = p; }
      }
      upper.push(uP);
      lower.push(lP);
    }
    var measured = 0;
    for (i = 0; i <= steps; i++) {
      measured += Math.hypot(upper[i].x - lower[i].x, upper[i].y - lower[i].y);
    }
    measured /= (steps + 1);
    var targetW = al / 5.5;
    if (measured > 0.5 && measured < targetW * 0.82) {
      var grow = targetW / measured;
      for (i = 0; i <= steps; i++) {
        var mx = (upper[i].x + lower[i].x) * 0.5;
        var my = (upper[i].y + lower[i].y) * 0.5;
        upper[i] = { x: mx + (upper[i].x - mx) * grow, y: my + (upper[i].y - my) * grow };
        lower[i] = { x: mx + (lower[i].x - mx) * grow, y: my + (lower[i].y - my) * grow };
      }
    }
    ctx.beginPath();
    ctx.moveTo(lower[0].x, lower[0].y);
    for (i = 1; i <= steps; i++) ctx.lineTo(lower[i].x, lower[i].y);
    for (i = steps; i >= 0; i--) ctx.lineTo(upper[i].x, upper[i].y);
    ctx.closePath();
    ctx.fillStyle = SKY;
    ctx.globalAlpha = alpha;
    ctx.fill();
    if (strokeIt) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.35;
      ctx.lineJoin = "round";
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }
  }

  function drawBellyProfile(ctx, pose, cam, alpha) {
    var tail = project(xform({ x: 0, y: 0, z: 0 }, pose), cam);
    var nose = project(xform({ x: 0, y: SHIP, z: 0 }, pose), cam);
    var dx = nose.x - tail.x;
    var dy = nose.y - tail.y;
    var al = Math.hypot(dx, dy) || 1;
    var ax = dx / al;
    var ay = dy / al;
    var px = -ay;
    var py = ax;
    if (py > 0) { px = -px; py = -py; }
    var dia = al / 5.5;
    function radiusAt(u) {
      var r = dia * 0.5;
      if (u > 0.68) r *= Math.cos(((u - 0.68) / 0.32) * Math.PI / 2);
      else if (u < 0.035) r *= Math.sin((u / 0.035) * Math.PI / 2);
      return r;
    }
    function at(u, side) {
      return {
        x: tail.x + ax * al * u + px * side,
        y: tail.y + ay * al * u + py * side
      };
    }
    var steps = 22;
    var i;
    ctx.beginPath();
    for (i = steps; i >= 0; i--) {
      var u = i / steps;
      var p = at(u, -radiusAt(u));
      if (i === steps) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (i = 0; i <= steps; i++) {
      var q = at(i / steps, radiusAt(i / steps));
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.fillStyle = SKY;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha;
    ctx.stroke();
    function flap(u0, u1, rise) {
      var a = at(u0, radiusAt(u0) * 0.92);
      var b = at(u1, radiusAt(u1) * 0.92);
      var c = at(u1 - (u1 - u0) * 0.18, radiusAt(u1) + rise);
      var d = at(u0 + (u1 - u0) * 0.22, radiusAt(u0) + rise * 0.72);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fillStyle = SKY;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.25;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    }
    flap(0.76, 0.86, dia * 0.16);
    flap(0.68, 0.77, dia * 0.24);
    flap(0.05, 0.16, dia * 0.3);
    flap(0.14, 0.28, dia * 0.4);
    ctx.fillStyle = INK;
    for (i = 0; i < 36; i++) {
      var u = 0.1 + (i / 35) * 0.72;
      var p = at(u, -(radiusAt(u) + 1.4 + (i % 4) * 0.7));
      ctx.globalAlpha = alpha * (0.28 + (i % 5) * 0.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.7 + (i % 3) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawFlapShape(ctx, flap, pose, cam, alpha) {
    var pts = flap.pts;
    var proj = [];
    var i;
    for (i = 0; i < pts.length; i++) proj.push(project(xform(pts[i], pose), cam));
    ctx.beginPath();
    ctx.moveTo(proj[0].x, proj[0].y);
    for (i = 1; i < proj.length; i++) ctx.lineTo(proj[i].x, proj[i].y);
    ctx.closePath();
    ctx.fillStyle = SKY;
    ctx.globalAlpha = alpha;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.25;
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha;
    ctx.stroke();
  }

  function drawBody(ctx, body, pose, cam, alpha) {
    var lod = lodOf(pose, cam, body.length);
    var flaps = body.flaps || [];
    var i;
    var tilt = Math.abs(pose.rot || 0) % 180;
    if (tilt > 90) tilt = 180 - tilt;
    var profile = body.kind === "ship" && tilt > 42;
    if (profile) {
      drawBellyProfile(ctx, pose, cam, alpha);
      return;
    }
    for (i = 0; i < flaps.length; i++) if (flaps[i].far) drawFlapShape(ctx, flaps[i], pose, cam, alpha);
    fillSilhouette(ctx, body, pose, cam, alpha, lod < 2);
    {
      for (i = 0; i < flaps.length; i++) if (!flaps[i].far) drawFlapShape(ctx, flaps[i], pose, cam, alpha);
    }
    if (lod >= 2) {
      ctx.fillStyle = INK;
      for (i = 0; i < body.dots.length; i++) {
        var d = body.dots[i];
        if (d.flap) continue;
        var n = rotN(d, pose.rot);
        if (facing(n, cam && cam.yaw) < -0.08) continue;
        var p = project(xform(d, pose), cam);
        var lit = shade(n, d.y);
        if (d.tile) lit *= 0.42;
        ctx.globalAlpha = alpha * (0.25 + lit * 0.75);
        ctx.fillRect(p.x, p.y, lit > 0.75 ? 1.4 : 1, lit > 0.75 ? 1.4 : 1);
      }
    }
    if (lod > 0) {
      var kept = [];
      for (i = 0; i < body.lines.length; i++) if (keepLine(body.lines[i], lod)) kept.push(body.lines[i]);
      strokeAll(ctx, kept, pose, cam, alpha);
    } else {
      var fins = [];
      for (i = 0; i < body.lines.length; i++) if (body.lines[i].kind === "fin") fins.push(body.lines[i]);
      if (fins.length) strokeAll(ctx, fins, pose, cam, alpha);
    }
  }

  function strokeAll(ctx, lines, pose, cam, alpha) {
    var i;
    var vw = ctx.canvas.clientWidth || 1440;
    var vh = ctx.canvas.clientHeight || 900;
    var margin = 140;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    for (i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln.alpha <= 0) continue;
      var a = project(pose ? xform(ln.a, pose) : ln.a, cam);
      var b = project(pose ? xform(ln.b, pose) : ln.b, cam);
      if ((a.x < -margin && b.x < -margin) || (a.x > vw + margin && b.x > vw + margin)) continue;
      if ((a.y < -margin && b.y < -margin) || (a.y > vh + margin && b.y > vh + margin)) continue;
      var ax = Math.round(a.x * 2) / 2;
      var ay = Math.round(a.y * 2) / 2;
      var bx = Math.round(b.x * 2) / 2;
      var by = Math.round(b.y * 2) / 2;
      if (Math.hypot(bx - ax, by - ay) < 0.6) continue;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.globalAlpha = alpha * ln.alpha;
      var zoom = cam && cam.scale ? cam.scale / 5 : 1;
      ctx.lineWidth = Math.max(1, Math.min(1.65, (ln.w || 1.15) * (0.82 + 0.22 * Math.min(zoom, 1.5))));
      ctx.stroke();
    }
  }

  function armPoint(pivotX, y, z, ang, along, up) {
    return {
      x: pivotX + Math.cos(ang) * along - Math.sin(ang) * up,
      y: y + Math.sin(ang) * along + Math.cos(ang) * up,
      z: z
    };
  }

  function drawChopsticks(ctx, cam, towerX, y, open, alpha) {
    var pivotX = towerX + 4.25;
    var z = 1.5;
    var len = 16;
    var depth = 2.05;
    var spread = 0.07 + open * 0.62;
    function drawArm(ang) {
      var lines = [];
      var half = depth / 2;
      var top0 = armPoint(pivotX, y, z, ang, 0.3, half);
      var top1 = armPoint(pivotX, y, z, ang, len, half * 0.62);
      var bot0 = armPoint(pivotX, y, z, ang, 0.3, -half);
      var bot1 = armPoint(pivotX, y, z, ang, len, -half * 0.62);
      line(lines, top0, top1, 0.98, 1.4);
      line(lines, bot0, bot1, 0.98, 1.4);
      line(lines, top0, bot0, 0.9, 1.25);
      var bay;
      for (bay = 1; bay <= 5; bay++) {
        var u = bay / 5;
        var a = armPoint(pivotX, y, z, ang, 0.3 + (len - 0.3) * u, half * mix(1, 0.62, u));
        var b = armPoint(pivotX, y, z, ang, 0.3 + (len - 0.3) * u, -half * mix(1, 0.62, u));
        line(lines, a, b, 0.75, 1.15);
        if (bay < 5) {
          var u2 = (bay + 1) / 5;
          var c = armPoint(pivotX, y, z, ang, 0.3 + (len - 0.3) * u2, -half * mix(1, 0.62, u2));
          line(lines, a, c, 0.45, 1.1);
        }
      }
      var shoe = armPoint(pivotX, y, z, ang, len + 0.15, 0);
      line(lines, top1, shoe, 0.95, 1.45);
      line(lines, bot1, shoe, 0.95, 1.45);
      line(lines,
        armPoint(pivotX, y, z, ang, len - 0.2, 0.85),
        armPoint(pivotX, y, z, ang, len - 0.2, -0.85),
        0.9, 1.5);
      strokeAll(ctx, lines, null, cam, alpha);
    }
    drawArm(-spread);
    drawArm(spread);
    strokeAll(ctx, [
      { a: { x: pivotX - 0.4, y: y - 3.1, z: z }, b: { x: pivotX + 0.8, y: y - 3.1, z: z }, alpha: 0.95, w: 1.4 },
      { a: { x: pivotX + 0.8, y: y - 3.1, z: z }, b: { x: pivotX + 0.8, y: y + 3.1, z: z }, alpha: 0.95, w: 1.4 },
      { a: { x: pivotX + 0.8, y: y + 3.1, z: z }, b: { x: pivotX - 0.4, y: y + 3.1, z: z }, alpha: 0.95, w: 1.4 },
      { a: { x: pivotX - 0.4, y: y + 3.1, z: z }, b: { x: pivotX - 0.4, y: y - 3.1, z: z }, alpha: 0.95, w: 1.4 },
      { a: { x: pivotX - 0.15, y: 12, z: z + 0.4 }, b: { x: pivotX - 0.15, y: 132, z: z + 0.4 }, alpha: 0.7, w: 1.2 },
      { a: { x: pivotX + 0.55, y: 12, z: z + 0.8 }, b: { x: pivotX + 0.55, y: 132, z: z + 0.8 }, alpha: 0.7, w: 1.2 }
    ], null, cam, alpha);
  }

  function drawQD(ctx, cam, towerX, retract, shipPose) {
    var pivot = { x: towerX + 4.4, y: BELL + BOOST + 17.5, z: 1.3 };
    var worldTip = xform({ x: -R - 0.15, y: 15.5, z: 0.35 }, shipPose);
    var parked = { x: towerX + 2.4, y: pivot.y + 13.5, z: 2.6 };
    var tip = {
      x: worldTip.x + (parked.x - worldTip.x) * retract,
      y: worldTip.y + (parked.y - worldTip.y) * retract,
      z: worldTip.z + (parked.z - worldTip.z) * retract
    };
    var dx = tip.x - pivot.x;
    var dy = tip.y - pivot.y;
    var len = Math.hypot(dx, dy) || 1;
    var px = -dy / len;
    var py = dx / len;
    var lines = [];
    function chord(off, z) {
      return {
        a: { x: pivot.x + px * off, y: pivot.y + py * off, z: z },
        b: { x: tip.x + px * off * 0.35, y: tip.y + py * off * 0.35, z: z },
        alpha: 0.95,
        w: 1.3
      };
    }
    lines.push(chord(0.7, pivot.z));
    lines.push(chord(-0.7, pivot.z));
    lines.push(chord(0, pivot.z + 0.7));
    var n;
    for (n = 1; n <= 4; n++) {
      var u = n / 5;
      var cx = pivot.x + dx * u;
      var cy = pivot.y + dy * u;
      lines.push({
        a: { x: cx + px * 0.7 * (1 - u * 0.65), y: cy + py * 0.7 * (1 - u * 0.65), z: pivot.z },
        b: { x: cx - px * 0.7 * (1 - u * 0.65), y: cy - py * 0.7 * (1 - u * 0.65), z: pivot.z },
        alpha: 0.7, w: 1.15
      });
    }
    lines.push({
      a: { x: tip.x, y: tip.y - 1.1, z: tip.z },
      b: { x: tip.x, y: tip.y + 1.3, z: tip.z },
      alpha: 0.9, w: 1.4
    });
    strokeAll(ctx, lines, null, cam, 1);
  }

  function drawClamps(ctx, cam, open) {
    var i;
    var y0 = DECK + 1.7;
    for (i = 0; i < 10; i++) {
      var a = (i / 10) * Math.PI * 2 + 0.15;
      if (Math.sin(a) < -0.35) continue;
      var x = Math.cos(a) * 5.7;
      var z = Math.sin(a) * 5.7;
      var out = 1.1 + open * 1.8;
      strokeAll(ctx, [
        { a: { x: x, y: y0, z: z }, b: { x: x, y: y0 + 2.4, z: z }, alpha: 0.9, w: 1.35 },
        { a: { x: x, y: y0 + 2.4, z: z }, b: { x: x + Math.cos(a) * out, y: y0 + 2.4 + open * 1.2, z: z + Math.sin(a) * out }, alpha: 0.9, w: 1.3 },
        { a: { x: x - 0.35, y: y0 + 0.3, z: z }, b: { x: x + 0.35, y: y0 + 0.3, z: z }, alpha: 0.7, w: 1.2 }
      ], null, cam, 1);
    }
  }

  function stippleDot(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundStipple(ctx, x, y, r, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    var ink = "244,241,232";
    g.addColorStop(0, "rgba(" + ink + "," + alpha + ")");
    g.addColorStop(0.55, "rgba(" + ink + "," + (alpha * 0.45) + ")");
    g.addColorStop(1, "rgba(" + ink + ",0)");
    ctx.fillStyle = g;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLiftoffColumn(ctx, cam, pose, power, t) {
    var origin = xform({ x: 0, y: 1.2, z: 0 }, pose);
    var ground = project({ x: cam.lookX || 0, y: 0, z: 0 }, cam);
    var i;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.05;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (i = 0; i < 160; i++) {
      var u = i / 159;
      var half = R * (0.55 + u * 0.28);
      var side = (hash(i + 3) - 0.5) * 2 * half;
      var y = origin.y + (1.4 - origin.y) * Math.pow(u, 0.9);
      var p = project({ x: origin.x + side, y: y, z: (hash(i + 9) - 0.5) * half * 0.3 }, cam);
      roundStipple(ctx, p.x, p.y, 1.15 + hash(i + 11) * 0.7, (0.55 + 0.4 * (1 - u)) * power);
    }
    for (i = 0; i < 140; i++) {
      var u2 = i / 139;
      var half2 = R * (1.05 + u2 * 1.35);
      var side2 = (hash(i + 40) - 0.5) * 2 * half2;
      var y2 = origin.y + (0.8 - origin.y) * Math.pow(u2, 0.75);
      var p2 = project({ x: origin.x + side2, y: y2, z: (hash(i + 21) - 0.5) * half2 * 0.35 }, cam);
      roundStipple(ctx, p2.x, p2.y, 0.9 + hash(i + 8) * 0.6, (0.16 + 0.22 * (1 - u2)) * power);
    }
    var sideSign;
    for (sideSign = -1; sideSign <= 1; sideSign += 2) {
      var b;
      for (b = 0; b < 3; b++) {
        ctx.beginPath();
        var n;
        var first = true;
        for (n = 0; n <= 7; n++) {
          var along = 8 + n * 4.2 + b * 1.4;
          var hump = Math.sin((n / 7) * Math.PI) * (3.2 + b * 1.3);
          var p3 = project({
            x: sideSign * along,
            y: 0.35 + hump,
            z: (b - 1) * 3
          }, cam);
          var yb = Math.min(p3.y, ground.y - 1);
          if (first) { ctx.moveTo(p3.x, yb); first = false; }
          else ctx.quadraticCurveTo(p3.x, yb - (4 + b * 3), p3.x, yb);
        }
        ctx.globalAlpha = (0.42 - b * 0.08) * power;
        ctx.stroke();
      }
      for (i = 0; i < 70; i++) {
        var along2 = 7 + hash(i + 60) * 28;
        var puff = hash(i + 90) * 3.2;
        var p4 = project({
          x: sideSign * along2,
          y: 0.3 + puff,
          z: (hash(i + 14) - 0.5) * 6
        }, cam);
        roundStipple(ctx, p4.x, Math.min(p4.y, ground.y - 1.5), 0.9 + hash(i + 7) * 0.7, (0.16 + hash(i + 2) * 0.28) * power);
      }
    }
  }

  function drawPadCloud(ctx, cam, amount, t) {
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 90; i++) {
      var phase = fract(hash(i + 80) + t * 0.35);
      var ang = (i / 90) * Math.PI * 2;
      var rad = (6 + phase * 26) * (0.4 + amount);
      var p = project({
        x: Math.cos(ang) * rad,
        y: 0.4 + phase * 3.5,
        z: Math.sin(ang) * rad * 0.55
      }, cam);
      ctx.globalAlpha = (1 - phase) * 0.28 * amount;
      stippleDot(ctx, p.x, p.y, phase > 0.5 ? 1.05 : 0.7);
    }
  }

  function drawSteam(ctx, cam, amount, t) {
    if (amount < 0.04) return;
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 70; i++) {
      var phase = fract(hash(i + 4) * 1.7 + t * (0.22 + hash(i + 9) * 0.28));
      var ang = hash(i + 2) * Math.PI * 2;
      var rad = (4 + hash(i + 6) * 22) * (0.35 + phase);
      var p = project({
        x: Math.cos(ang) * rad,
        y: DECK + phase * (5 + amount * 11),
        z: Math.sin(ang) * rad
      }, cam);
      ctx.globalAlpha = (1 - phase) * 0.32 * amount;
      stippleDot(ctx, p.x, p.y, 0.75);
    }
  }

  function drawCore(ctx, cam, pose, localY, radius, power, nBells) {
    if (power < 0.08) return;
    var i;
    var b;
    ctx.fillStyle = INK;
    for (b = 0; b < nBells; b++) {
      var ang = (b / nBells) * Math.PI * 2 + 0.35;
      var origin = xform({
        x: Math.cos(ang) * radius,
        y: localY,
        z: Math.sin(ang) * radius
      }, pose);
      var tip = xform({
        x: Math.cos(ang) * radius,
        y: localY - 1,
        z: Math.sin(ang) * radius
      }, pose);
      var dx = tip.x - origin.x;
      var dy = tip.y - origin.y;
      var dz = (tip.z || 0) - (origin.z || 0);
      var len = (8 + power * 22) * (cam.scale < 1.8 ? 2.4 : 1);
      var sideX = -dy;
      var sideY = dx;
      var sideL = Math.hypot(sideX, sideY) || 1;
      sideX /= sideL;
      sideY /= sideL;
      for (i = 0; i < 22; i++) {
        var u = i / 21;
        if (origin.y + dy * len * u < -1) continue;
        var fan = u * u * (6 + power * 16);
        var p = project({
          x: origin.x + dx * len * u + sideX * fan,
          y: origin.y + dy * len * u + sideY * fan,
          z: (origin.z || 0) + dz * len * u
        }, cam);
        var q = project({
          x: origin.x + dx * len * u - sideX * fan,
          y: origin.y + dy * len * u - sideY * fan,
          z: (origin.z || 0) + dz * len * u
        }, cam);
        var s = (4 + (1 - u) * 7) * (0.45 + power * 0.7);
        ctx.globalAlpha = Math.pow(1 - u, 0.45) * (0.35 + 0.4 * power);
        ctx.fillRect(p.x - s * 0.5, p.y - s * 0.4, s, s * 0.8);
        ctx.fillRect(q.x - s * 0.5, q.y - s * 0.4, s, s * 0.8);
      }
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
      var wob = (hash(seed + i + 11) - 0.5) * 2 * (0.6 + phase * phase * 7.5) * (0.45 + power);
      var wob2 = (hash(seed + i + 29) - 0.5) * 2 * (0.6 + phase * phase * 7.5) * (0.45 + power);
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
    var nose = xform({ x: 0, y: SHIP / 2 + 1, z: 0 }, pose);
    var mid = xform({ x: 0, y: SHIP / 2, z: 0 }, pose);
    var ax = mid.x - nose.x;
    var ay = mid.y - nose.y;
    var al = Math.hypot(ax, ay) || 1;
    ax /= al;
    ay /= al;
    var far = cam.scale < 2.2 ? 2.6 : 1;
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < 140; i++) {
      var phase = fract(hash(i + 21) + t * (0.85 + hash(i + 22) * 0.3));
      var y = 3 + hash(i + 23) * (SHIP - 8);
      y = clamp(y, 0.4, SHIP - 0.4);
      var th = Math.PI + (hash(i + 24) - 0.5) * 1.35;
      var rad = shipRadius(y) + 0.35 + phase * 1.4;
      var body = xform({
        x: rad * Math.cos(th),
        y: y,
        z: rad * Math.sin(th)
      }, pose);
      var trail = (6 + phase * (14 + amount * 22)) * far;
      var p = project({
        x: body.x + ax * trail,
        y: body.y + ay * trail,
        z: body.z
      }, cam);
      var hot = 1 - phase;
      ctx.globalAlpha = (0.28 + 0.7 * hot) * amount;
      stippleDot(ctx, p.x, p.y, hot > 0.55 ? 1.35 : 0.8);
    }
  }

  function drawComputer(ctx, model) {
    var c = model.ui.comp;
    var x = Math.round(c.x);
    var y = Math.round(c.y);
    var w = Math.round(c.w);
    var h = Math.round(c.h * 0.72);
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = 0.92;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.globalAlpha = 0.9;
    ctx.fillText("nominal", x + 8, y + 18);
    ctx.globalAlpha = 0.6;
    ctx.fillText(">", x + 8, y + 32);
    var neckL = x + Math.round(w * 0.38);
    var neckR = x + Math.round(w * 0.62);
    var baseY = y + h + 9;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(neckL, y + h);
    ctx.lineTo(neckL - 2, baseY);
    ctx.lineTo(neckR + 2, baseY);
    ctx.lineTo(neckR, y + h);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeRect(x - 6, baseY, w + 12, 6);
    var keysY = baseY + 10;
    var keysW = w + 16;
    var keysX = x - 8;
    ctx.strokeRect(keysX, keysY, keysW, 12);
    var col;
    var row;
    ctx.globalAlpha = 0.75;
    for (row = 0; row < 2; row++) {
      for (col = 0; col < 9; col++) {
        ctx.strokeRect(keysX + 3 + col * ((keysW - 8) / 9), keysY + 2 + row * 5, 4, 3);
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
    [
      { lat: 29.95, lon: -90.07 },
      { lat: 30.45, lon: -91.19 },
      { lat: 25.99, lon: -97.16 }
    ].forEach(function (city) {
      var lat = city.lat * Math.PI / 180;
      var lon = city.lon * Math.PI / 180;
      var cosLat = Math.cos(lat);
      var dlon = lon - lon0;
      var z = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * cosLat * Math.cos(dlon);
      var x = cosLat * Math.sin(dlon);
      var y = Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * cosLat * Math.cos(dlon);
      dots.push({ x: x, y: y, z: z, land: true, city: true, mark: 1 });
    });
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

  function globePoint(latDeg, lonDeg, cx, cy, radius) {
    var lat = latDeg * Math.PI / 180;
    var lon = lonDeg * Math.PI / 180;
    var lat0 = 28 * Math.PI / 180;
    var lon0 = -90.6 * Math.PI / 180;
    var cosLat = Math.cos(lat);
    var dlon = lon - lon0;
    var z = Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * cosLat * Math.cos(dlon);
    if (z <= 0.08) return null;
    var x = cosLat * Math.sin(dlon);
    var y = Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * cosLat * Math.cos(dlon);
    return { x: cx + x * radius, y: cy - y * radius };
  }

  function drawCoastRing(ctx, ring, cx, cy, radius, alpha, fill) {
    ctx.beginPath();
    var started = false;
    var i;
    var drawn = false;
    for (i = 0; i < ring.length; i++) {
      var p = globePoint(ring[i][0], ring[i][1], cx, cy, radius);
      if (!p) { started = false; continue; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; drawn = true; }
      else ctx.lineTo(p.x, p.y);
    }
    if (!drawn) return;
    ctx.closePath();
    if (fill) {
      ctx.globalAlpha = 0.16 * alpha;
      ctx.fill();
    }
    ctx.globalAlpha = 0.9 * alpha;
    ctx.stroke();
  }

  function drawNorthAmerica(ctx, cx, cy, radius, alpha) {
    var data = global.COAST;
    if (!data) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1.2, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = INK;
    ctx.fillStyle = "rgba(244,241,232,0.9)";
    ctx.lineWidth = 1.05;
    ctx.lineJoin = "round";
    var i;
    for (i = 0; i < data.land.length; i++) drawCoastRing(ctx, data.land[i], cx, cy, radius, alpha, true);
    ctx.fillStyle = "#10141c";
    for (i = 0; i < data.lakes.length; i++) drawCoastRing(ctx, data.lakes[i], cx, cy, radius, alpha, true);
    ctx.restore();
  }

  function drawEarth(ctx, model, pose) {
    if (!model.globe) model.globe = buildGlobe();
    var lay = earthLayout(model);
    var grow = pose.earthIn == null ? 1 : (0.55 + 0.45 * pose.earthIn);
    var cx = lay.cx;
    var cy = lay.cy;
    var radius = lay.radius * grow;
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
      if (d.land && !d.mark) {
        /* Continent shape is drawn as an outline, not this noise. */
      } else if (d.land) {
        if (day > 0.05) {
          ctx.globalAlpha = 0.35 + day * 0.6;
          ctx.fillRect(sx, sy, day > 0.55 ? 1.7 : 1.2, day > 0.55 ? 1.7 : 1.2);
        } else if (d.city) {
          ctx.globalAlpha = d.mark ? 0.95 : 0.55 + Math.abs(day) * 0.4;
          ctx.fillRect(sx - (d.mark ? 1 : 0), sy, d.mark ? 3.2 : 1.5, d.mark ? 3.2 : 1.5);
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
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.07;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 2.5, 0, Math.PI * 2);
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
    var alt = (model.cramped ? 62 : 128) * grow;
    var orbit = radius + alt;
    var k;
    ctx.lineWidth = 1;
    for (k = 18; k >= 1; k--) {
      var a0 = a - k * 0.05;
      var a1 = a - (k - 1) * 0.05;
      ctx.globalAlpha = 0.05 + (1 - k / 18) * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * orbit, cy + Math.sin(a0) * orbit);
      ctx.lineTo(cx + Math.cos(a1) * orbit, cy + Math.sin(a1) * orbit);
      ctx.stroke();
    }
    var sx = cx + Math.cos(a) * orbit;
    var sy = cy + Math.sin(a) * orbit;
    var svx = -Math.sin(a);
    var svy = Math.cos(a);
    var retroRot = Math.atan2(svx, svy) * 180 / Math.PI;
    var rot = retroRot + 180 + 180 * (pose.retro || 0);
    var ppm = (model.cramped ? 0.62 : 0.72) * Math.max(grow, 0.7);
    var shipCam = {
      scale: ppm,
      ox: sx,
      oy: sy,
      lookX: 0,
      lookY: SHIP / 2,
      yaw: 0
    };
    var shipPose = {
      x: 0, y: SHIP / 2, rot: rot, pivotX: 0, pivotY: SHIP / 2,
      thrust: pose.deorbit || 0, plasma: pose.entry || 0, door: pose.door || 0
    };
    if ((pose.landShow || 0) < 0.45) {
      if (pose.deorbit > 0) {
        drawPlume(ctx, shipCam, shipPose, -0.35, pose.deorbit, pose.t || 0, 120);
        drawCore(ctx, shipCam, shipPose, -0.2, 1.7, pose.deorbit, 3);
      }
      if (shipPose.plasma > 0.04) drawPlasma(ctx, shipPose, shipCam, shipPose.plasma, pose.t || 0);
      drawBody(ctx, model.ship, shipPose, shipCam, 1);
      drawPayloadDoor(ctx, shipCam, shipPose, pose.door || 0);
    }
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1;
    var leftSide = sx < cx;
    var lx0 = leftSide ? sx - 12 : sx + 12;
    var lx1 = leftSide ? sx - 42 : sx + 42;
    var ly0 = sy - 8;
    var ly1 = sy - 26;
    ctx.beginPath();
    ctx.moveTo(lx0, ly0);
    ctx.lineTo(lx1, ly1);
    ctx.stroke();
    ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
    var outX = sx - cx;
    var outY = sy - cy;
    var outL = Math.hypot(outX, outY) || 1;
    ctx.fillText("ship", sx + outX / outL * 36 - 8, sy + outY / outL * 22);
    var doorP = project(xform({ x: R + 0.45, y: 33.6, z: 0 }, shipPose), shipCam);
    model._shipScreen = { x: sx, y: sy };
    model._cards = cardsFor(pose, model, {
      cx: cx, cy: cy, orbit: orbit, ang: a, radius: radius
    });
    drawSats(ctx, model._cards, pose);
    drawAirliner(ctx, model, pose, model._cards, { cx: cx, cy: cy, radius: radius });
    drawHomeLink(ctx, model, pose, model._cards, { cx: cx, cy: cy, radius: radius });
    drawNorthAmerica(ctx, cx, cy, radius, pose.earthAlpha || 1);
    if ((pose.t || 0) > 33 && (pose.t || 0) < 48.6 && (pose.earthAlpha || 0) > 0.35) {
      var coast = globePoint(30.2, -91.05, cx, cy, radius);
      var nola = globePoint(29.95, -90.25, cx, cy, radius);
      ctx.fillStyle = INK;
      ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
      ctx.globalAlpha = 0.95 * pose.earthAlpha;
      if (coast) {
        ctx.fillRect(coast.x - 1.5, coast.y - 1.5, 3, 3);
        ctx.fillText("Louisiana", coast.x + 5, coast.y - 6);
      }
      if (nola) ctx.fillRect(nola.x - 1.2, nola.y - 1.2, 2.4, 2.4);
    }
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

  function cardsFor(pose, model, geo) {
    if (!pose || !geo || pose.t < 32.7) return [];
    var out = [];
    var earthA = pose.earthAlpha == null ? 1 : pose.earthAlpha;
    var i;
    var latest = -1;
    for (i = 0; i < FACTS.length; i++) {
      var born = 32.85 + i * 0.92;
      var age = pose.t - born;
      if (age < 0) break;
      var along = smooth(clamp(age / 0.8, 0, 1));
      var unfold = smooth(clamp((age - 0.62) / 0.85, 0, 1));
      var cardIn = unfold > 0.98 ? smooth(clamp((age - 1.5) / 0.32, 0, 1)) : 0;
      if (cardIn > 0.2) latest = i;
      var ang = mix(geo.ang - 0.012, geo.ang - (i + 1) * 0.21, along);
      var satX = geo.cx + Math.cos(ang) * geo.orbit;
      var satY = geo.cy + Math.sin(ang) * geo.orbit;
      var ox = Math.cos(ang);
      var oy = Math.sin(ang);
      var big = i === 0 ? 1 + (1 - Math.min(1, unfold)) * Math.min(1, age / 0.25) * 1.5 : 1;
      if (big > 1.04) {
        satX += ox * (big - 1) * 42;
        satY += oy * (big - 1) * 42;
      }
      out.push({
        text: FACTS[i],
        satX: satX,
        satY: satY,
        ox: ox,
        oy: oy,
        unfold: unfold,
        cardIn: cardIn,
        show: Math.max(along, 0.35),
        big: big,
        earthA: earthA,
        spin: 0,
        grow: cardIn,
        opacity: 0,
        x: satX,
        y: satY,
        w: 8,
        h: 8
      });
    }
    for (i = 0; i < out.length; i++) {
      var c = out[i];
      if (i !== latest) continue;
      var globeBottom = geo.cy + geo.radius;
      var w = Math.min(280, Math.max(168, model.w * 0.2));
      var cols = Math.max(22, Math.floor((w - 20) / 6.6));
      var linesN = Math.max(1, Math.ceil(c.text.length / cols));
      var h = 20 + linesN * 17;
      var x = 16;
      var y = Math.max(globeBottom + 18, model.h - h - 84);
      x = clamp(x, 10, model.w - w - 10);
      y = clamp(y, 72, model.h - h - 86);
      c.x = x;
      c.y = y;
      c.w = w;
      c.h = h;
      c.opacity = c.cardIn * c.earthA;
      c.leader = Math.hypot(c.satX - (x + w * 0.5), c.satY - (y + h * 0.5)) < 130;
    }
    return out;
  }

  function drawSats(ctx, cards, pose) {
    if (!cards || !cards.length) return;
    var i;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    for (i = 0; i < cards.length; i++) {
      var c = cards[i];
      var sc = c.big || 1;
      ctx.save();
      ctx.translate(c.satX, c.satY);
      ctx.rotate(-0.2);
      ctx.scale(sc, sc);
      ctx.globalAlpha = 0.95 * c.show;
      ctx.strokeRect(-9, -4.5, 18, 9);
      ctx.globalAlpha = 0.45 * c.show;
      ctx.strokeRect(-10, -3, 20, 6);
      var wing;
      var seg;
      var panel = 10;
      var gap = 3;
      for (wing = -1; wing <= 1; wing += 2) {
        for (seg = 0; seg < 2; seg++) {
          var out = c.unfold * (seg + 1) * (panel + gap);
          var x0 = wing > 0 ? 9 + out - panel : -9 - out;
          ctx.globalAlpha = (0.35 + 0.6 * c.unfold) * c.show;
          ctx.strokeRect(x0, -6, panel, 12);
          if (seg > 0 && c.unfold > 0.08) {
            ctx.beginPath();
            ctx.moveTo(wing > 0 ? x0 : x0 + panel, 0);
            ctx.lineTo(wing > 0 ? x0 - gap : x0 + panel + gap, 0);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      if (c.leader && c.opacity > 0.05) {
        var tx = c.x + (c.satX < c.x + c.w * 0.5 ? 0 : c.w);
        var ty = c.y + c.h * 0.45;
        ctx.globalAlpha = 0.75 * Math.min(1, c.opacity * 2);
        ctx.beginPath();
        ctx.moveTo(c.satX, c.satY);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function beamPackets(ctx, x0, y0, x1, y1, t, seed, alpha) {
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.28 * alpha;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    var i;
    for (i = 0; i < 3; i++) {
      var u = fract((t * 0.28) + seed + i * 0.33);
      ctx.globalAlpha = (0.35 + 0.55 * (1 - Math.abs(u - 0.5) * 1.2)) * alpha;
      ctx.fillRect(mix(x0, x1, u) - 1.1, mix(y0, y1, u) - 1.1, 2.2, 2.2);
    }
    ctx.restore();
  }

  function drawAirliner(ctx, model, pose, cards, geo) {
    var t = pose.t || 0;
    if (!geo || t < 36.6 || t > 47.7 || (pose.earthAlpha || 0) < 0.08) return;
    var fade = ramp(t, 36.6, 37.3) * (1 - ramp(t, 47.0, 47.65)) * pose.earthAlpha;
    var panelW = model.cramped ? 250 : Math.min(460, model.w * 0.34);
    var panelH = model.cramped ? 168 : 230;
    var panelX = Math.max(12, Math.min(model.w - panelW - 16, geo.cx + geo.radius + 28));
    var panelY = model.cramped ? 88 : 100;
    ctx.save();
    ctx.globalAlpha = 0.96 * fade;
    ctx.fillStyle = "#12161e";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.75 * fade;
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
    ctx.globalAlpha = 0.22 * fade;
    var cloud;
    for (cloud = 0; cloud < 4; cloud++) {
      ctx.beginPath();
      ctx.moveTo(panelX + 12, panelY + panelH * (0.72 + cloud * 0.05));
      ctx.bezierCurveTo(
        panelX + panelW * 0.3, panelY + panelH * (0.68 + cloud * 0.04),
        panelX + panelW * 0.6, panelY + panelH * (0.76 + cloud * 0.03),
        panelX + panelW - 12, panelY + panelH * (0.71 + cloud * 0.05)
      );
      ctx.stroke();
    }
    ctx.restore();
    var x = panelX + panelW * 0.52;
    var y = panelY + panelH * 0.46;
    var L = panelW * 0.7;
    var r = L * 0.046;
    var rot = 0;
    function worldPoint(px, py) {
      return {
        x: x + px * Math.cos(rot) - py * Math.sin(rot),
        y: y + px * Math.sin(rot) + py * Math.cos(rot)
      };
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.strokeStyle = INK;
    ctx.fillStyle = SKY;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = fade;
    function shape(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      var n;
      for (n = 1; n < pts.length; n++) ctx.lineTo(pts[n][0], pts[n][1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    shape([
      [L * 0.5, 0],
      [L * 0.42, -r * 0.55],
      [L * 0.32, -r],
      [-L * 0.38, -r],
      [-L * 0.46, -r * 0.35],
      [-L * 0.5, 0],
      [-L * 0.46, r * 0.45],
      [-L * 0.38, r],
      [L * 0.32, r],
      [L * 0.42, r * 0.55]
    ]);
    shape([
      [L * 0.06, r * 0.35],
      [-L * 0.02, r * 0.45],
      [-L * 0.22, r * 2.5],
      [-L * 0.16, r * 2.85],
      [-L * 0.1, r * 2.15],
      [L * 0.02, r * 0.7]
    ]);
    shape([
      [-L * 0.2, r * 2.35],
      [-L * 0.14, r * 2.05],
      [-L * 0.12, r * 2.7],
      [-L * 0.2, r * 2.85]
    ]);
    ctx.beginPath();
    ctx.ellipse(-L * 0.08, r * 2.15, r * 0.95, r * 0.62, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-L * 0.05, r * 0.85);
    ctx.lineTo(-L * 0.08, r * 1.55);
    ctx.stroke();
    shape([
      [-L * 0.3, -r * 0.15],
      [-L * 0.4, -r * 3.4],
      [-L * 0.34, -r * 3.15],
      [-L * 0.24, -r * 0.1]
    ]);
    shape([
      [-L * 0.32, r * 0.1],
      [-L * 0.48, r * 1.15],
      [-L * 0.36, r * 0.45]
    ]);
    ctx.beginPath();
    ctx.arc(-L * 0.5, r * 0.15, 1.3, 0, Math.PI * 2);
    ctx.stroke();
    var win;
    ctx.fillStyle = INK;
    for (win = 0; win < 18; win++) ctx.fillRect(L * 0.22 - win * L * 0.028, -r * 0.12, 2.2, 1.7);
    ctx.strokeRect(L * 0.34, -r * 0.72, 7, 3.4);
    ctx.strokeRect(L * 0.36, -r * 0.15, 2.4, 1.6);
    ctx.strokeRect(L * 0.2, -r * 0.15, 3.2, r * 1.15);
    ctx.strokeRect(-L * 0.22, -r * 0.15, 3.2, r * 1.15);
    ctx.beginPath();
    ctx.ellipse(L * 0.08, -r - 2.4, L * 0.055, 2.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = SKY;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    var dome = worldPoint(L * 0.08, -r - 2.4);
    var sat = { x: panelX + panelW * 0.5, y: panelY + 18 };
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeRect(sat.x - 7, sat.y - 3, 14, 6);
    ctx.strokeRect(sat.x - 16, sat.y - 2, 8, 4);
    ctx.strokeRect(sat.x + 8, sat.y - 2, 8, 4);
    ctx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    ctx.fillStyle = INK;
    ctx.fillText("35,000 ft", panelX + 10, panelY + 16);
    ctx.restore();
    beamPackets(ctx, sat.x, sat.y + 4, dome.x, dome.y, t, 0.4, fade);
    if (!cards) return;
    var linked = [];
    var i;
    for (i = 0; i < cards.length; i++) if (cards[i].unfold > 0.9) linked.push(cards[i]);
    for (i = 0; i < linked.length - 1; i++) {
      beamPackets(ctx, linked[i].satX, linked[i].satY, linked[i + 1].satX, linked[i + 1].satY, t, i * 0.17, fade * 0.35);
    }
  }


  function drawHomeLink(ctx, model, pose, cards, geo) {
    var t = pose.t || 0;
    if (!geo || t < 35.4 || t > 47.5 || (pose.earthAlpha || 0) < 0.15) return;
    var fade = ramp(t, 35.4, 36.2) * (1 - ramp(t, 46.9, 47.45)) * pose.earthAlpha;
    var panelW = model.cramped ? 210 : 330;
    var panelH = model.cramped ? 120 : 150;
    var panelX = Math.max(12, Math.min(model.w - panelW - 16, geo.cx + geo.radius + 28));
    var panelY = (model.cramped ? 88 : 100) + (model.cramped ? 168 : 230) + 14;
    if (panelY + panelH > model.h - 70) panelY = model.h - panelH - 78;
    var s = model.cramped ? 0.85 : 1.15;
    var groundY = panelY + panelH - 28;
    var houseX = panelX + panelW * 0.42;
    ctx.save();
    ctx.globalAlpha = 0.96 * fade;
    ctx.fillStyle = "#12161e";
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = 0.75 * fade;
    ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
    ctx.globalAlpha = 0.45 * fade;
    ctx.beginPath();
    ctx.moveTo(panelX + 12, groundY);
    ctx.lineTo(panelX + panelW - 12, groundY);
    ctx.stroke();
    ctx.globalAlpha = 0.9 * fade;
    drawHome(ctx, houseX, groundY, s);
    drawDish(ctx, houseX + 58 * s, groundY, s);
    ctx.font = "12px IBM Plex Mono, ui-monospace, monospace";
    ctx.fillStyle = INK;
    ctx.fillText("Home, New Orleans", panelX + 12, panelY + 18);
    var sat = { x: panelX + panelW * 0.62, y: panelY + 34 };
    ctx.strokeRect(sat.x - 6, sat.y - 3, 12, 5);
    ctx.strokeRect(sat.x - 14, sat.y - 1, 7, 3);
    ctx.strokeRect(sat.x + 7, sat.y - 1, 7, 3);
    var dish = { x: houseX + 68 * s, y: groundY - 16 * s };
    ctx.restore();
    beamPackets(ctx, sat.x, sat.y + 4, dish.x, dish.y, t, 0.22, fade);
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
