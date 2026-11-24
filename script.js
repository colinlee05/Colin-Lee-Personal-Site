/* Colin Lee — night pad. Original canvas scene; content stays in the DOM. */
(function () {
  const INK = "#f4f1e8";
  const html = document.documentElement;
  const stage = document.getElementById("stage");
  const canvas = document.getElementById("sky");
  const dossier = document.getElementById("content");
  const scrim = document.getElementById("scrim");
  const kicker = document.getElementById("sheet-kicker");
  const live = document.getElementById("live");
  const term = document.getElementById("term");
  const termLog = document.getElementById("term-log");
  const termForm = document.getElementById("term-form");
  const termIn = document.getElementById("term-in");
  const shipHot = document.getElementById("ship-hot");
  const termHot = document.getElementById("term-hot");

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = motionQuery.matches;
  motionQuery.addEventListener("change", function () {
    reduce = motionQuery.matches;
    if (!reduce) startLoop();
  });

  const KICK = {
    index: "index",
    about: "me",
    education: "education",
    certifications: "certifications",
    projects: "projects",
    skills: "skills",
    experience: "experience",
    "blog-updates": "updates",
    publications: "publications",
    resources: "resources",
    social: "social",
    contact: "contact",
  };

  const RIDES = { ship: 1, nose: 1 };

  let ctx;
  let view = { w: 1, h: 1, dpr: 1 };
  let geo = null;
  let model = null;
  let stars = [];
  let groundLayer = null;
  let towerLayer = null;
  let shipLayer = null;
  let grain = null;
  let joints = [];
  let hoverId = null;
  let mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let launchStart = 0;
  let shipShift = 0;
  let particles = [];
  let lastFrame = 0;
  let looping = false;
  let turnstileWidget = null;
  let lastFocus = null;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function inside(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i][1];
      const yj = pts[j][1];
      if ((yi > y) !== (yj > y)) {
        const xi = pts[i][0];
        const xj = pts[j][0];
        const xCross = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (x < xCross) c = !c;
      }
    }
    return c;
  }

  function polyPath(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }

  function spray(g, x, y, rng, scale) {
    g.globalAlpha = (0.5 + rng() * 0.5) * scale;
    const s = rng() > 0.94 ? 1.8 : 1;
    g.fillRect(x, y, s, s);
    if (rng() > 0.86) {
      g.globalAlpha *= 0.7;
      g.fillRect(x + (rng() - 0.5) * 2.2, y + (rng() - 0.5) * 2.2, 1, 1);
    }
  }

  function edgeBand(g, pts, rng, spacing, band, passes, scale) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const steps = Math.max(1, Math.ceil(len / spacing));
      const nx = -dy / len;
      const ny = dx / len;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = a[0] + dx * t;
        const y = a[1] + dy * t;
        for (let p = 0; p < passes; p++) {
          const m = rng() + rng() - 1;
          spray(g, x + nx * m * band, y + ny * m * band, rng, scale * (1 - Math.abs(m) * 0.25));
        }
      }
    }
  }

  function fillDots(g, pts, rng, density, scale) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const area = Math.max(1, (maxX - minX) * (maxY - minY));
    const target = area * density;
    let made = 0;
    let guard = 0;
    const limit = target * 14;
    while (made < target && guard < limit) {
      guard++;
      const x = minX + rng() * (maxX - minX);
      const y = minY + rng() * (maxY - minY);
      if (!inside(pts, x, y)) continue;
      spray(g, x, y, rng, scale);
      made++;
    }
  }

  function paintShape(g, pts, rng, opt) {
    g.save();
    g.fillStyle = INK;
    g.globalAlpha = opt.wash || 0;
    if (opt.wash) {
      polyPath(g, pts);
      g.fill();
    }
    g.fillStyle = INK;
    edgeBand(g, pts, rng, opt.spacing || 2.1, opt.band || 2.3, opt.passes || 2, opt.edge || 1);
    if (opt.density) fillDots(g, pts, rng, opt.density, opt.fill || 0.62);
    g.restore();
  }

  function stippleLine(g, x0, y0, x1, y1, rng, spacing, band, scale) {
    g.fillStyle = INK;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.max(1, Math.ceil(len / spacing));
    const nx = -dy / len;
    const ny = dx / len;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const j = (rng() - 0.5) * band;
      spray(g, x0 + dx * t + nx * j, y0 + dy * t + ny * j, rng, scale);
    }
  }

  function makeGrain() {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 160;
    const g = c.getContext("2d");
    const img = g.createImageData(160, 160);
    const rng = mulberry32(0x51ed);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = rng() * 255;
      d[i] = d[i + 1] = d[i + 2] = n;
      d[i + 3] = rng() < 0.22 ? 70 + rng() * 80 : 0;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  function layer() {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(view.w * view.dpr));
    c.height = Math.max(1, Math.round(view.h * view.dpr));
    const g = c.getContext("2d");
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    return { c: c, g: g };
  }

  function buildGeometry(w, h, cramped) {
    const whisper = document.querySelector(".whisper");
    const whisperH = whisper ? whisper.offsetHeight : 80;
    const dock = cramped ? 132 : 0;
    const bottomReserve = cramped ? dock + 58 : Math.max(whisperH + 16, 40);
    const topReserve = cramped ? 62 : 86;
    let H = Math.min(h - topReserve - bottomReserve - 8, cramped ? w * 0.92 : h * 0.64);
    H = clamp(H, 220, 780);
    const cx = w * (cramped ? 0.48 : 0.42);
    let base = cramped ? h - dock - 52 : Math.min(h * 0.83, h - bottomReserve + 6);
    if (base - H < topReserve) H = Math.max(200, base - topReserve);

    const hw = clamp(H * 0.046, 13, 40);
    const engineH = H * 0.078;
    const skirtH = H * 0.02;
    const hotH = H * 0.032;
    const boosterH = H * 0.5;
    const shipH = H - engineH - skirtH - hotH - boosterH;
    const legH = Math.max(16, H * 0.048);
    const yEngine = base - legH;
    const ySkirt = yEngine - engineH;
    const yBooster = ySkirt - skirtH;
    const yHot = yBooster - boosterH;
    const yShip = yHot - hotH;
    const yTip = yShip - shipH;
    const noseH = shipH * 0.42;
    const yNose = yTip + noseH;

    const gap = Math.max(hw * 3.1, 58);
    const towerW = clamp(H * 0.062, 20, 40);
    const towerX = cx - hw - gap - towerW;
    const towerTop = yNose + H * 0.01;

    const nose = [];
    const noseL = [];
    const steps = 18;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = yTip + noseH * t;
      const x = hw * Math.pow(Math.sin((t * Math.PI) / 2), 0.9);
      nose.push([cx + x, y]);
      noseL.push([cx - x, y]);
    }
    const nosePoly = nose.concat(noseL.reverse());

    const hull = [
      [cx - hw, yNose],
      [cx + hw, yNose],
      [cx + hw, yShip],
      [cx - hw, yShip],
    ];
    const booster = [
      [cx - hw, yHot],
      [cx + hw, yHot],
      [cx + hw, yBooster],
      [cx - hw, yBooster],
    ];
    const skirt = [
      [cx - hw * 0.98, yBooster],
      [cx + hw * 0.98, yBooster],
      [cx + hw * 1.28, ySkirt],
      [cx - hw * 1.28, ySkirt],
    ];

    function flap(dir, hy, len, root, tip) {
      return [
        [cx + dir * hw * 0.92, hy - root * 0.2],
        [cx + dir * (hw + len), hy + len * 0.22],
        [cx + dir * (hw + len * 0.82), hy + tip + len * 0.28],
        [cx + dir * hw * 0.94, hy + root],
      ];
    }
    const flapLen = hw * 1.55;
    const fwdY = yNose - noseH * 0.08;
    const aftY = yShip - shipH * 0.16;
    const flaps = [
      flap(1, fwdY, flapLen * 0.92, H * 0.02, H * 0.045),
      flap(-1, fwdY, flapLen * 0.92, H * 0.02, H * 0.045),
      flap(1, aftY, flapLen * 1.35, H * 0.028, H * 0.07),
      flap(-1, aftY, flapLen * 1.35, H * 0.028, H * 0.07),
    ];

    function fin(dir, hy, len, th, yOff) {
      const x0 = cx + dir * hw * 0.9;
      return [
        [x0, hy + yOff],
        [x0 + dir * len, hy + yOff + th * 0.08],
        [x0 + dir * len, hy + yOff + th],
        [x0, hy + yOff + th * 0.88],
      ];
    }
    const finY = yHot + H * 0.012;
    const finTh = H * 0.04;
    const fins = [
      fin(1, finY, hw * 1.45, finTh, 0),
      fin(-1, finY, hw * 1.45, finTh, 0),
      fin(1, finY, hw * 0.78, finTh * 0.82, finTh * 0.28),
      fin(-1, finY, hw * 0.78, finTh * 0.82, finTh * 0.28),
    ];

    const bells = [];
    const engines = [];
    function addBells(n, span, top, hScale, wScale) {
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const x = cx - span / 2 + span * t;
        const edge = Math.abs(t - 0.5) * 2;
        const bh = engineH * hScale * (1 - edge * 0.18);
        const wt = hw * wScale * 0.55;
        const wb = hw * wScale;
        bells.push([
          [x - wt, top],
          [x + wt, top],
          [x + wb, top + bh],
          [x - wb, top + bh],
        ]);
        engines.push({ x: x, y: top + bh });
      }
    }
    addBells(11, hw * 2.55, ySkirt - 1, 0.72, 0.2);
    addBells(7, hw * 1.55, ySkirt + engineH * 0.08, 0.62, 0.16);
    addBells(3, hw * 0.55, ySkirt + engineH * 0.18, 0.7, 0.18);

    const armGap = Math.max(10, H * 0.034);
    const armTh = Math.max(7, H * 0.016);
    const armY = yShip + hotH * 0.15;
    const armEnd = cx - hw - Math.max(8, hw * 0.28);
    const armStart = towerX + towerW - 2;
    function beam(y, x1, thick) {
      return [
        [armStart, y],
        [x1, y + thick * 0.08],
        [x1, y + thick],
        [armStart, y + thick * 0.92],
      ];
    }
    const arms = [beam(armY - armGap, armEnd, armTh), beam(armY + armGap * 0.35, armEnd, armTh)];
    const qdY = yNose + shipH * 0.36;
    const qd = beam(qdY, cx - hw - 5, Math.max(3.5, H * 0.008));

    const reach = hw + flapLen * 1.35;
    const compW = cramped ? 64 : clamp(H * 0.15, 68, 108);
    const compH = compW * 0.78;
    const compX = Math.min(cx + reach + 36, w - compW - (cramped ? 14 : 36));
    const compY = base - compH - 4;
    const bezel = Math.max(7, compW * 0.1);
    const chin = compH * 0.22;
    const screen = {
      x: compX + bezel,
      y: compY + bezel * 0.6,
      w: compW - bezel * 2,
      h: Math.max(18, compH - chin - bezel),
    };
    const rackW = cramped ? 0 : Math.max(16, compW * 0.22);
    const rack = rackW && compX + compW + rackW + 18 < w
      ? { x: compX + compW + 12, y: compY + compH * 0.08, w: rackW, h: compH * 0.92 }
      : null;

    const anchors = {
      nose: { x: cx - hw * 0.15, y: yTip + 4 },
      tower: { x: towerX, y: towerTop + 8 },
      booster: { x: towerX - 2, y: yHot + boosterH * 0.62 },
      pad: { x: towerX + towerW * 0.15, y: base - 6 },
      flap: { x: cx + hw + flapLen * 0.7, y: fwdY + 4 },
      hull: { x: cx + hw, y: yNose + (yShip - yNose) * 0.45 },
      aft: { x: cx + hw + flapLen * 1.05, y: aftY + 6 },
      fin: { x: cx + hw + hw * 1.35, y: finY + finTh * 0.45 },
      terminal: { x: (rack ? rack.x + rack.w : compX + compW), y: compY + compH * 0.42 },
    };

    const shipRings = [];
    for (let i = 1; i <= 5; i++) shipRings.push(yNose + (yShip - yNose) * i / 6);
    const boosterRings = [];
    for (let i = 1; i <= 14; i++) boosterRings.push(yHot + (yBooster - yHot) * i / 15);

    return {
      w: w, h: h, H: H, cx: cx, hw: hw, base: base, cramped: cramped,
      yTip: yTip, yNose: yNose, yShip: yShip, yHot: yHot, yBooster: yBooster,
      ySkirt: ySkirt, yEngine: yEngine, noseH: noseH, shipH: shipH, hotH: hotH,
      towerX: towerX, towerW: towerW, towerTop: towerTop,
      nose: nosePoly, hull: hull, booster: booster, skirt: skirt,
      flaps: flaps, fins: fins, bells: bells, engines: engines,
      arms: arms, qd: qd, armStart: armStart, armEnd: armEnd, armY: armY, armTh: armTh, armGap: armGap,
      rightReach: cx + reach,
      leftReach: towerX,
      comp: { x: compX, y: compY, w: compW, h: compH },
      rack: rack,
      screen: screen,
      anchors: anchors,
      shipRings: shipRings,
      boosterRings: boosterRings,
      deckY: yEngine + H * 0.012,
    };
  }

  function drawGround(g, G, rng) {
    g.fillStyle = INK;
    const base = G.base;
    for (let x = 4; x < G.w; x += 2.7) {
      const roll = rng();
      const tall = roll > 0.86;
      const hgt = tall ? 16 + rng() * 22 : 7 + rng() * 12;
      const lean = (rng() - 0.5) * (tall ? 5 : 2);
      const y0 = base + rng() * 2;
      stippleLine(g, x, y0, x + lean, y0 - hgt, rng, 2.1, 0.7, tall ? 0.9 : 0.62);
      if (tall && rng() > 0.4) {
        g.globalAlpha = 0.75;
        g.beginPath();
        g.arc(x + lean, y0 - hgt, 1.5 + rng(), 0, Math.PI * 2);
        g.fill();
      }
    }
    for (let y = base + 5; y < base + 22; y += 5) {
      const fade = 1 - (y - base) / 22;
      for (let x = 0; x < G.w; x += 7) {
        if (rng() > 0.4) continue;
        g.globalAlpha = fade * 0.22;
        g.fillRect(x + rng() * 4, y, 1, 2);
      }
    }
    if (!G.cramped && G.towerX > 150) {
      const farm = [0.16, 0.22, 0.13, 0.19, 0.11];
      farm.forEach(function (scale, i) {
        const x = 36 + i * 18;
        const hgt = G.H * scale;
        const top = base - hgt;
        g.globalAlpha = 0.28;
        g.fillStyle = INK;
        stippleLine(g, x, base, x, top, rng, 2.4, 1.1, 0.45);
        stippleLine(g, x + 10, base, x + 10, top + 4, rng, 2.4, 1.1, 0.45);
        g.globalAlpha = 0.35;
        g.beginPath();
        g.ellipse(x + 5, top + 2, 6, 2.2, 0, 0, Math.PI * 2);
        g.fill();
      });
      stippleLine(g, 18, base - G.H * 0.28, 18, base, rng, 2.6, 0.5, 0.32);
      stippleLine(g, 12, base - G.H * 0.26, 24, base - G.H * 0.26, rng, 2, 0.4, 0.32);
    }

    const deck = G.deckY;
    const mountL = G.cx - G.hw * 2.15;
    const mountR = G.cx + G.hw * 2.15;
    const hole = G.hw * 0.72;
    const steel = { wash: 0.08, density: 0.07, spacing: 1.8, band: 1.6, passes: 2, edge: 0.9, fill: 0.6 };
    paintShape(g, [
      [mountL, deck],
      [G.cx - hole, deck],
      [G.cx - hole * 0.7, deck + 7],
      [mountL + 8, deck + 7],
    ], rng, steel);
    paintShape(g, [
      [G.cx + hole, deck],
      [mountR, deck - 1],
      [mountR - 8, deck + 7],
      [G.cx + hole * 0.7, deck + 7],
    ], rng, steel);
    [[mountL + 6, mountL - G.hw * 0.35], [mountL + G.hw * 0.7, mountL + G.hw * 0.15],
      [mountR - G.hw * 0.7, mountR - G.hw * 0.15], [mountR - 6, mountR + G.hw * 0.35]].forEach(function (pair) {
      paintShape(g, [
        [pair[0], deck + 5],
        [pair[0] + 5, deck + 5],
        [pair[1] + 4, base],
        [pair[1] - 3, base],
      ], rng, steel);
    });
    stippleLine(g, mountL, deck + 10, mountR, deck + 10, rng, 2.4, 0.6, 0.4);
    for (let i = 0; i < 8; i++) {
      const x = mountL + 10 + i * ((mountR - mountL - 20) / 7);
      stippleLine(g, x, deck + 10, x, deck + 16, rng, 2, 0.4, 0.45);
    }

    drawWorkstation(g, G, rng);
  }

  function drawWorkstation(g, G, rng) {
    const c = G.comp;
    const bezel = { wash: 0.12, density: 0.1, spacing: 1.6, band: 2.2, passes: 3, edge: 1, fill: 0.8 };
    paintShape(g, [
      [c.x, c.y + 3],
      [c.x + c.w, c.y + 1],
      [c.x + c.w - 1, c.y + c.h],
      [c.x + 2, c.y + c.h - 1],
    ], rng, bezel);
    const neckX = c.x + c.w * 0.46;
    paintShape(g, [
      [neckX, c.y + c.h],
      [neckX + c.w * 0.1, c.y + c.h],
      [neckX + c.w * 0.16, G.base - 10],
      [neckX - c.w * 0.04, G.base - 10],
    ], rng, { wash: 0.08, density: 0.08, spacing: 1.8, band: 1.3, passes: 2, edge: 0.85, fill: 0.55 });
    paintShape(g, [
      [c.x + c.w * 0.22, G.base - 10],
      [c.x + c.w * 0.78, G.base - 10],
      [c.x + c.w * 0.88, G.base - 3],
      [c.x + c.w * 0.12, G.base - 3],
    ], rng, { wash: 0.07, density: 0.06, spacing: 1.8, band: 1.2, passes: 2, edge: 0.8, fill: 0.5 });

    const keyY = G.base - 9;
    paintShape(g, [
      [c.x - 4, keyY],
      [c.x + c.w + 8, keyY - 1],
      [c.x + c.w + 14, G.base - 1],
      [c.x - 10, G.base - 1],
    ], rng, { wash: 0.06, density: 0.08, spacing: 1.8, band: 1.2, passes: 2, edge: 0.9, fill: 0.5 });
    for (let row = 0; row < 3; row++) {
      const cols = row === 2 ? 6 : 10;
      for (let k = 0; k < cols; k++) {
        g.globalAlpha = 0.7;
        g.fillStyle = INK;
        g.fillRect(c.x + 2 + k * ((c.w - 4) / cols), keyY + 1 + row * 2.4, 2, 1.6);
      }
    }

    if (G.rack) {
      const r = G.rack;
      paintShape(g, [
        [r.x, r.y],
        [r.x + r.w, r.y],
        [r.x + r.w, r.y + r.h],
        [r.x, r.y + r.h],
      ], rng, { wash: 0.1, density: 0.09, spacing: 1.6, band: 1.5, passes: 2, edge: 1, fill: 0.7 });
      const bays = Math.max(4, Math.round(r.h / 7));
      for (let i = 1; i < bays; i++) {
        const y = r.y + (r.h * i) / bays;
        stippleLine(g, r.x + 2, y, r.x + r.w - 2, y, rng, 1.8, 0.3, 0.55);
      }
      g.globalAlpha = 0.8;
      g.fillRect(r.x + r.w * 0.25, r.y + 4, 2, 2);
      stippleLine(g, c.x + c.w, c.y + c.h * 0.7, r.x, r.y + r.h * 0.4, rng, 2.4, 0.6, 0.4);
    }
  }

  function drawTower(g, G, rng) {
    const x0 = G.towerX;
    const x1 = G.towerX + G.towerW;
    const xm = (x0 + x1) / 2;
    const top = G.towerTop;
    const bot = G.base;
    const segs = 12;
    [x0, xm, x1].forEach(function (x) {
      stippleLine(g, x, top, x, bot, rng, 2, 1.05, 0.9);
    });
    for (let i = 0; i <= segs; i++) {
      const y = top + ((bot - top) * i) / segs;
      stippleLine(g, x0, y, x1, y, rng, 2.2, 0.7, 0.55);
      if (i < segs) {
        const y2 = top + ((bot - top) * (i + 1)) / segs;
        stippleLine(g, x0, y, xm, y2, rng, 2.6, 0.55, 0.42);
        stippleLine(g, xm, y, x1, y2, rng, 2.6, 0.55, 0.42);
        stippleLine(g, xm, y, x0, y2, rng, 2.6, 0.55, 0.42);
        stippleLine(g, x1, y, xm, y2, rng, 2.6, 0.55, 0.42);
      }
    }
    stippleLine(g, xm, top, xm, top - G.H * 0.04, rng, 2.2, 0.5, 0.6);
    const carriage = {
      wash: 0.12, density: 0.1, spacing: 1.6, band: 1.6, passes: 2, edge: 1, fill: 0.75,
    };
    paintShape(g, [
      [x1 - 3, G.armY - G.armGap - 12],
      [x1 + 7, G.armY - G.armGap - 12],
      [x1 + 7, G.armY + G.armGap + G.armTh + 16],
      [x1 - 3, G.armY + G.armGap + G.armTh + 16],
    ], rng, carriage);
    const armOpt = { wash: 0.16, density: 0.13, spacing: 1.5, band: 2, passes: 3, edge: 1, fill: 0.9 };
    G.arms.forEach(function (arm) { paintShape(g, arm, rng, armOpt); });
    paintShape(g, G.qd, rng, { wash: 0.1, density: 0.08, spacing: 1.7, band: 1.2, passes: 2, edge: 0.95, fill: 0.7 });
    const grabTop = G.armY - G.armGap - 2;
    const grabBot = G.armY + G.armGap + G.armTh + 4;
    stippleLine(g, G.armEnd, grabTop, G.armEnd, grabBot, rng, 1.5, 1.2, 1);
    stippleLine(g, G.armEnd + 4, grabTop + 3, G.armEnd + 4, grabBot - 2, rng, 1.7, 0.7, 0.75);
    const qd = G.qd;
    const qx = qd[1][0];
    const qy = qd[1][1];
    paintShape(g, [
      [qx - 2, qy - 4],
      [qx + 5, qy - 4],
      [qx + 5, qy + 8],
      [qx - 2, qy + 8],
    ], rng, carriage);
  }

  function drawGrid(g, fin, rng) {
    const x0 = fin[0][0];
    const x1 = fin[1][0];
    const y0 = Math.min(fin[0][1], fin[1][1]);
    const y1 = Math.max(fin[2][1], fin[3][1]);
    for (let i = 1; i <= 4; i++) {
      const y = y0 + ((y1 - y0) * i) / 5;
      stippleLine(g, x0, y, x1, y, rng, 1.8, 0.35, 0.7);
    }
    for (let i = 1; i <= 3; i++) {
      const x = x0 + ((x1 - x0) * i) / 4;
      stippleLine(g, x, y0, x, y1, rng, 1.8, 0.35, 0.65);
    }
  }

  function drawTiles(g, G, rng) {
    const tile = Math.max(3.2, G.H * 0.0072);
    const x0 = G.cx + G.hw * 0.16;
    const x1 = G.cx + G.hw * 0.9;
    const y0 = G.yTip + G.noseH * 0.45;
    const y1 = G.yShip - 2;
    g.fillStyle = INK;
    let row = 0;
    for (let y = y0; y < y1; y += tile) {
      const shift = (row % 2) * tile * 0.5;
      row++;
      for (let x = x0 + shift; x < x1; x += tile) {
        const mx = x + tile * 0.45;
        const my = y + tile * 0.45;
        if (!inside(G.hull, mx, my) && !inside(G.nose, mx, my)) continue;
        g.globalAlpha = 0.5;
        g.strokeStyle = INK;
        g.lineWidth = 0.6;
        g.strokeRect(x, y, tile * 0.82, tile * 0.82);
      }
    }
  }

  function drawShip(g, G, rng) {
    const hullOpt = { wash: 0.11, density: 0.1, spacing: 1.6, band: 2.3, passes: 3, edge: 1, fill: 0.85 };
    const partOpt = { wash: 0.09, density: 0.08, spacing: 1.6, band: 1.8, passes: 2, edge: 1, fill: 0.75 };
    G.bells.forEach(function (b) { paintShape(g, b, rng, partOpt); });
    paintShape(g, G.skirt, rng, partOpt);
    paintShape(g, G.booster, rng, hullOpt);
    paintShape(g, G.hull, rng, hullOpt);
    paintShape(g, G.nose, rng, hullOpt);

    g.save();
    g.globalCompositeOperation = "destination-out";
    g.fillStyle = "rgba(0,0,0,0.62)";
    g.fillRect(G.cx + G.hw * 0.12, G.yTip + G.noseH * 0.42, G.hw * 0.7, G.yShip - G.yTip - G.noseH * 0.4);
    g.fillRect(G.cx + G.hw * 0.1, G.yHot + 2, G.hw * 0.72, (G.yBooster - G.yHot) * 0.35);
    g.restore();

    const edge = G.hw * 0.9;
    G.shipRings.forEach(function (y) {
      stippleLine(g, G.cx - edge, y, G.cx + edge, y, rng, 2, 0.4, 0.55);
    });
    G.boosterRings.forEach(function (y) {
      stippleLine(g, G.cx - edge, y, G.cx + edge, y, rng, 2, 0.35, 0.5);
    });
    stippleLine(g, G.cx - G.hw * 0.55, G.yNose, G.cx - G.hw * 0.5, G.yBooster, rng, 2.4, 0.5, 0.4);
    stippleLine(g, G.cx + G.hw * 0.62, G.yHot, G.cx + G.hw * 0.66, G.yBooster, rng, 2.2, 0.7, 0.48);

    const vents = 8;
    const slotW = (G.hw * 2.3) / vents;
    for (let i = 0; i < vents; i++) {
      if (i % 2 === 0) continue;
      const x = G.cx - G.hw * 1.15 + i * slotW;
      paintShape(g, [
        [x, G.yShip + 1],
        [x + slotW * 0.62, G.yShip + 1],
        [x + slotW * 0.62, G.yHot - 1],
        [x, G.yHot - 1],
      ], rng, partOpt);
    }
    stippleLine(g, G.cx - G.hw * 1.16, G.yShip, G.cx + G.hw * 1.16, G.yShip, rng, 1.7, 0.4, 0.85);
    stippleLine(g, G.cx - G.hw * 1.16, G.yHot, G.cx + G.hw * 1.16, G.yHot, rng, 1.7, 0.4, 0.85);

    drawTiles(g, G, rng);
    G.fins.forEach(function (f) {
      paintShape(g, f, rng, partOpt);
      drawGrid(g, f, rng);
    });
    G.flaps.forEach(function (f) { paintShape(g, f, rng, partOpt); });
  }

  function rebuild() {
    var elapsed = null;
    if (model && model.mission) {
      elapsed = model.mission.t0 == null
        ? model.mission.elapsed
        : (performance.now() - model.mission.t0) / 1000;
    }
    const rect = canvas.getBoundingClientRect();
    view.w = Math.max(1, rect.width);
    view.h = Math.max(1, rect.height);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;

    const cramped = view.w < 860 || view.h < 620;
    html.classList.toggle("cramped", cramped);
    model = Vehicle.create(view.w, view.h, cramped);
    if (elapsed != null) Vehicle.seek(model, elapsed, performance.now());
    geo = model.ui;

    const rng = mulberry32((view.w * 131 + view.h * 17) >>> 0);
    stars = [];
    const count = clamp(Math.round((view.w * view.h) / 16000), 48, 170);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: rng() * view.w,
        y: rng() * (geo.base - 10),
        r: rng() > 0.94 ? 1.8 : 0.7 + rng() * 0.7,
        a: 0.35 + rng() * 0.65,
        ph: rng() * Math.PI * 2,
        spd: 0.35 + rng() * 1.3,
      });
    }

    placeCallouts();
    draw(performance.now());
    html.classList.add("ready");
  }

  function placeCallouts() {
    if (!geo) return;
    const els = Array.prototype.slice.call(document.querySelectorAll(".callouts [data-anchor]"));
    const left = els.filter(function (el) { return el.dataset.side === "left"; });
    const right = els.filter(function (el) { return el.dataset.side === "right"; });
    const cramped = html.classList.contains("cramped");
    els.forEach(function (el) {
      el.style.top = "";
      el.style.left = "";
      el.style.right = "";
    });
    if (!cramped && geo.anchors) placeLabels(els);
    measureJoints();
    const lift = shipShift;
    shipHot.style.left = geo.cx - geo.hw - 18 + "px";
    shipHot.style.top = geo.yTip - 8 + "px";
    shipHot.style.width = geo.hw * 2 + 36 + "px";
    shipHot.style.height = geo.base - geo.yTip + 16 + "px";
    shipHot.style.transform = "translateY(" + lift + "px)";
    termHot.style.left = geo.comp.x - 8 + "px";
    termHot.style.top = geo.comp.y - 8 + "px";
    termHot.style.width = geo.comp.w + 20 + "px";
    termHot.style.height = geo.base - geo.comp.y + 10 + "px";
  }

  function idOfCallout(el) {
    return el.dataset.open || "resume";
  }

  function overlaps(a, b, pad) {
    return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
      a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  }

  function placeLabels(els) {
    const A = geo.anchors;
    const byId = {};
    els.forEach(function (el) { byId[idOfCallout(el)] = el; });
    const boxes = [];
    function add(id, x, y) {
      const el = byId[id];
      if (!el) return;
      boxes.push({
        id: id,
        el: el,
        x: x,
        y: y,
        w: el.offsetWidth,
        h: el.offsetHeight
      });
    }
    function stack(ids, x, y) {
      let cursor = y;
      ids.forEach(function (id) {
        const el = byId[id];
        if (!el) return;
        add(id, x, cursor);
        cursor += el.offsetHeight + 6;
      });
    }
    if (A.home && byId.about) add("about", A.home.x - byId.about.offsetWidth - 16, A.home.y - 28);
    if (A.stadium && byId.education) {
      add("education", A.stadium.x - byId.education.offsetWidth - 20, A.stadium.y - byId.education.offsetHeight - 92);
    }
    if (A.memorial && byId.certifications) {
      add("certifications", A.memorial.x - byId.certifications.offsetWidth - 28, A.memorial.y - 36);
    }
    if (A.dish && byId.contact) add("contact", A.dish.x + 16, A.dish.y - byId.contact.offsetHeight - 2);
    if (geo.comp) {
      const col = ["experience", "resume", "projects", "skills", "resources"].filter(function (id) { return byId[id]; });
      const widest = col.reduce(function (m, id) { return Math.max(m, byId[id].offsetWidth); }, 0);
      const total = col.reduce(function (m, id) { return m + byId[id].offsetHeight + 6; }, -6);
      stack(col, geo.comp.x + geo.comp.w - widest, geo.comp.y - total - 10);
    }
    if (A.ship && byId["blog-updates"]) {
      add("blog-updates", A.ship.x + 22, A.ship.y - byId["blog-updates"].offsetHeight * 0.5);
    }
    boxes.forEach(function (a) {
      a.x = Math.max(8, Math.min(view.w - a.w - 12, a.x));
      a.y = Math.max(70, Math.min(view.h - a.h - 28, a.y));
    });
    boxes.forEach(function (b) {
      b.el.style.left = Math.round(b.x) + "px";
      b.el.style.top = Math.round(b.y) + "px";
    });
  }

  function spread(els, y0, y1, side, xAnchor) {
    const n = els.length;
    els.forEach(function (el, i) {
      const y = n === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * i) / (n - 1);
      el.style.top = Math.round(y - el.offsetHeight / 2) + "px";
      el.style.right = "auto";
      if (side === "left") el.style.left = Math.max(12, Math.round(xAnchor - el.offsetWidth)) + "px";
      else el.style.left = Math.round(xAnchor) + "px";
    });
  }

  function measureJoints() {
    const crect = canvas.getBoundingClientRect();
    joints = Array.prototype.map.call(document.querySelectorAll(".callouts [data-anchor]"), function (el) {
      const r = el.getBoundingClientRect();
      const side = el.dataset.side;
      return {
        id: el.dataset.open || "resume",
        anchor: el.dataset.anchor,
        side: side,
        x: (side === "left" ? r.right : r.left) - crect.left + (side === "left" ? 2 : -2),
        y: r.top + r.height / 2 - crect.top,
      };
    });
  }

  function anchorXY(name) {
    const a = geo.anchors[name];
    if (!a) return { x: 0, y: 0 };
    const ride = RIDES[name] ? shipShift : 0;
    return { x: a.x, y: a.y + ride };
  }

  function launchOffset(ms) {
    const rise = Math.min(geo.H * 0.2, 130);
    if (ms < 320) return 0;
    if (ms < 1700) {
      const t = (ms - 320) / 1380;
      return -rise * (1 - Math.pow(1 - t, 3));
    }
    if (ms < 2500) return -rise;
    if (ms < 4000) {
      const t = (ms - 2500) / 1500;
      const s = t * t * (3 - 2 * t);
      return -rise * (1 - s);
    }
    return 0;
  }

  function thrust(ms) {
    if (ms < 140 || ms > 3100) return 0;
    if (ms < 420) return (ms - 140) / 280;
    if (ms < 2400) return 1;
    return Math.max(0, 1 - (ms - 2400) / 700);
  }

  function drawSky(now) {
    const w = view.w;
    const h = view.h;
    const g = ctx.createRadialGradient(w * 0.48, h * 0.38, h * 0.08, w * 0.5, h * 0.42, h * 0.9);
    g.addColorStop(0, "#322e38");
    g.addColorStop(0.5, "#1c1a21");
    g.addColorStop(1, "#121116");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const hz = ctx.createLinearGradient(0, geo.base - 50, 0, geo.base + 30);
    hz.addColorStop(0, "rgba(244,241,232,0)");
    hz.addColorStop(0.7, "rgba(244,241,232,0.045)");
    hz.addColorStop(1, "rgba(244,241,232,0)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, geo.base - 50, w, 90);

    if (window.BatonRougeSky && geo) {
      window.BatonRougeSky.paint(ctx, w, h, geo.base, Date.now(), html.classList.contains("mission"));
    }
    ctx.globalAlpha = 1;
  }

  function drawScreen(now) {
    const s = geo.screen;
    const glow = ctx.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 4, s.x + s.w / 2, s.y + s.h / 2, s.w * 0.9);
    glow.addColorStop(0, "rgba(70, 29, 124, 0.55)");
    glow.addColorStop(1, "rgba(70, 29, 124, 0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - 16, s.y - 16, s.w + 32, s.h + 32);
    ctx.fillStyle = "rgba(28, 16, 48, 0.94)";
    ctx.fillRect(s.x, s.y, s.w, s.h);
    ctx.fillStyle = "rgba(243, 239, 230, 0.05)";
    for (let y = s.y + 2; y < s.y + s.h; y += 3) ctx.fillRect(s.x, y, s.w, 1);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = "#f6f1ea";
    ctx.font = "11px " + '"IBM Plex Mono", ui-monospace, monospace';
    ctx.fillText("pad:~$", s.x + 6, s.y + 14);
    const on = reduce || Math.floor(now / 540) % 2 === 0;
    if (on) {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#d9c8ef";
      ctx.fillRect(s.x + 8, s.y + 20, 8, 2);
    }
  }

  function drawLeaders() {
    if (html.classList.contains("cramped") || !joints.length) return;
    ctx.lineCap = "round";
    joints.forEach(function (j) {
      if (html.classList.contains("panel-open") && j.side === "right") return;
      const a = anchorXY(j.anchor);
      const hot = hoverId === j.id;
      const elbow = j.x + (a.x >= j.x ? 16 : -16);
      ctx.beginPath();
      ctx.moveTo(j.x, j.y);
      ctx.lineTo(elbow, j.y);
      ctx.lineTo(elbow, a.y);
      ctx.lineTo(a.x, a.y);
      ctx.strokeStyle = hot ? "rgba(244,241,232,0.95)" : "rgba(244,241,232,0.4)";
      ctx.lineWidth = hot ? 1.35 : 1;
      ctx.stroke();
      ctx.globalAlpha = hot ? 1 : 0.75;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(a.x, a.y, hot ? 2.4 : 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawPlume(now) {
    if (reduce || !launchStart || !geo) return;
    const t = thrust(now - launchStart);
    if (t <= 0) return;
    ctx.fillStyle = INK;
    const n = Math.round(170 * t);
    for (let i = 0; i < n; i++) {
      const e = geo.engines[(Math.random() * geo.engines.length) | 0];
      const k = Math.random();
      const y = e.y + shipShift + k * (geo.deckY - e.y) * (0.55 + 0.45 * t);
      const spread = (6 + k * k * geo.hw * 2.6) * t;
      ctx.globalAlpha = (1 - k) * 0.62 * t;
      ctx.fillRect(e.x + (Math.random() - 0.5) * spread, y, k > 0.75 ? 2.6 : 1.3, k > 0.75 ? 2.6 : 1.3);
    }
    ctx.globalAlpha = 1;
  }

  function drawClamps(now) {
    if (!geo) return;
    const ms = launchStart ? now - launchStart : 0;
    const open = !launchStart || reduce ? 0 : Math.max(0, Math.min(1, (ms - 180) / 420));
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = 0.9;
    const y = geo.deckY + 2;
    const len = Math.max(10, geo.hw * 0.55);
    [-1, 1].forEach(function (dir) {
      const x = geo.cx + dir * geo.hw * 0.95;
      const ang = dir * (0.15 + open * 1.15);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(Math.abs(ang)) * len * 0.45);
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x + Math.cos(ang) * len * 0.7, y + 4 + Math.sin(Math.abs(ang)) * len * 0.3);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawParticles() {
    ctx.fillStyle = INK;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life) * 0.75;
      ctx.fillRect(p.x, p.y, p.s, p.s);
    }
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    if (!ctx || !geo) return;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawSky(now);
    const px = reduce ? 0 : mouse.x * 2.2;
    const py = reduce ? 0 : mouse.y * 1.4;
    ctx.globalAlpha = 1;
    if (model) Vehicle.paint(ctx, model, now);
    syncMission(now);
    if (!Vehicle.active(model)) {
      drawScreen(now);
      drawLeaders();
    }

    if (grain) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      const pat = ctx.createPattern(grain, "repeat");
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, view.w, view.h);
      ctx.restore();
    }
    const v = ctx.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.35, view.w / 2, view.h / 2, view.h * 0.78);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  function update(now) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    if (launchStart) {
      const ms = now - launchStart;
      shipShift = reduce ? 0 : launchOffset(ms);
      if (ms > 4300) {
        launchStart = 0;
        shipShift = 0;
      }
    } else {
      shipShift = 0;
    }
    shipHot.style.transform = "translate(" + (reduce ? 0 : mouse.x * 2.2) + "px," + (shipShift + (reduce ? 0 : mouse.y * 1.4)) + "px)";

    if (!reduce && geo && !Vehicle.active(model)) {
      const ms = launchStart ? now - launchStart : 0;
      const power = thrust(ms);
      if (power > 0.05) {
        const exhaustN = Math.round(10 * power);
        for (let n = 0; n < exhaustN && particles.length < 380; n++) {
          const e = geo.engines[(Math.random() * geo.engines.length) | 0];
          particles.push({
            x: e.x + (Math.random() - 0.5) * 8,
            y: e.y + shipShift,
            vx: (Math.random() - 0.5) * 30 * power,
            vy: (30 + Math.random() * 70) * power,
            life: 0.35 + Math.random() * 0.4,
            s: Math.random() > 0.7 ? 2.4 : 1.3,
            kind: "exhaust",
          });
        }
        if (particles.length < 380 && Math.random() < 0.8) {
          particles.push({
            x: geo.cx + (Math.random() - 0.5) * geo.hw * 2.2,
            y: geo.deckY - 4,
            vx: (Math.random() - 0.5) * 18,
            vy: -(10 + Math.random() * 28),
            life: 0.5 + Math.random() * 0.5,
            s: 1.2,
            kind: "spray",
          });
        }
        if (particles.length < 380) {
          particles.push({
            x: geo.cx + (Math.random() - 0.5) * geo.hw,
            y: geo.engines[0].y + shipShift + 6,
            vx: (Math.random() - 0.5) * 10,
            vy: 8 + Math.random() * 14,
            life: 0.9 + Math.random() * 0.7,
            s: 2.2 + Math.random() * 2.2,
            kind: "smoke",
          });
        }
      } else if (Math.random() < 0.18 && particles.length < 40) {
        const e = geo.engines[(Math.random() * geo.engines.length) | 0];
        particles.push({
          x: e.x, y: e.y, vx: (Math.random() - 0.5) * 4, vy: 8,
          life: 0.35, s: 1, kind: "exhaust",
        });
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "smoke") p.vy += 6 * dt;
      else if (p.kind === "spray") p.vy += 22 * dt;
      else p.vy += 28 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function frame(now) {
    if (!looping) return;
    update(now);
    draw(now);
    if (document.hidden) {
      looping = false;
      return;
    }
    requestAnimationFrame(frame);
  }

  function startLoop() {
    if (looping || reduce) return;
    looping = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function ignite() {
    if (reduce) {
      var summary = document.getElementById("mission-summary");
      summary.hidden = false;
      live.textContent = "Mission held still. Notes are on screen.";
      document.getElementById("summary-close").focus();
      return;
    }
    if (!model || Vehicle.active(model)) return;
    Vehicle.start(model, performance.now());
    html.classList.add("mission");
    document.getElementById("skip-mission").hidden = false;
    document.getElementById("mission-caption").hidden = false;
    live.textContent = "Mission running. Escape or skip mission ends it. Labels along the bottom still open each section.";
    startLoop();
  }

  function endMission() {
    if (model) Vehicle.stop(model);
    html.classList.remove("mission");
    var skip = document.getElementById("skip-mission");
    var cap = document.getElementById("mission-caption");
    if (skip) skip.hidden = true;
    if (cap) { cap.hidden = true; cap.textContent = ""; }
    var box = document.getElementById("payloads");
    if (box) box.replaceChildren();
    if (ctx && geo) draw(performance.now());
  }

  function syncMission(now) {
    var cap = document.getElementById("mission-caption");
    var box = document.getElementById("payloads");
    if (!model || !Vehicle.active(model)) {
      if (html.classList.contains("mission")) endMission();
      return;
    }
    var pose = model.last;
    if (cap && pose && pose.beat && cap.textContent !== pose.beat) {
      cap.hidden = false;
      cap.textContent = pose.beat;
      live.textContent = pose.beat;
    }
    if (!box || !pose) return;
    var cards = model._cards || [];
    while (box.children.length < cards.length) {
      var el = document.createElement("p");
      el.className = "payload";
      box.appendChild(el);
    }
    while (box.children.length > cards.length) box.removeChild(box.lastChild);
    cards.forEach(function (card, i) {
      var el = box.children[i];
      if (el.textContent !== card.text) el.textContent = card.text;
      el.style.left = card.x + "px";
      el.style.top = card.y + "px";
      el.style.width = card.w + "px";
      el.style.height = card.h + "px";
      el.style.opacity = String(card.opacity || 0);
      el.style.transform = "rotate(" + (card.spin || 0) + "rad)";
      if ((card.opacity || 0) < 0.08) el.setAttribute("hidden", "");
      else el.removeAttribute("hidden");
    });
  }

  /* ---------- panels ---------- */

  function sceneOn() {
    return html.classList.contains("scene");
  }

  function markCurrent(id) {
    document.querySelectorAll(".callouts [data-open], .crumbs a").forEach(function (el) {
      const href = el.getAttribute("href");
      const open = el.dataset.open;
      const match = open === id || href === "#" + id;
      if (match) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
    if (kicker) kicker.textContent = KICK[id] || id;
  }

  function openPanel(id, opts) {
    if (id === "why-rocket") id = "about";
    opts = opts || {};
    const section = document.getElementById(id);
    if (!section || !sceneOn()) return;
    closeTerm();
    dossier.querySelectorAll("section").forEach(function (s) { s.classList.remove("on"); });
    section.classList.add("on");
    markCurrent(id);
    html.classList.add("panel-open");
    dossier.inert = false;
    dossier.setAttribute("aria-hidden", "false");
    stage.inert = true;
    scrim.hidden = false;
    dossier.scrollTop = 0;
    if (!opts.silent && location.hash !== "#" + id) {
      history.replaceState({ panel: id }, "", "#" + id);
    }
    if (id === "contact") ensureTurnstile();
    const closeBtn = document.getElementById("sheet-close");
    if (!opts.silent) closeBtn.focus();
    if (reduce) draw(performance.now());
  }

  function reallyClose() {
    html.classList.remove("panel-open");
    dossier.inert = sceneOn();
    dossier.setAttribute("aria-hidden", sceneOn() ? "true" : "false");
    stage.inert = false;
    scrim.hidden = true;
    markCurrent(null);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (reduce && sceneOn()) draw(performance.now());
  }

  function closePanel() {
    if (!html.classList.contains("panel-open")) return;
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    reallyClose();
  }

  window.addEventListener("popstate", function () {
    if (!sceneOn()) return;
    const id = location.hash.slice(1);
    if (id && document.getElementById(id)) openPanel(id, { silent: true });
    else reallyClose();
  });

  function enableText() {
    closeTerm();
    html.classList.remove("scene", "panel-open", "ready");
    dossier.inert = false;
    dossier.setAttribute("aria-hidden", "false");
    stage.inert = true;
    scrim.hidden = true;
    document.body.style.overflow = "";
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) el.scrollIntoView();
    }
  }

  function enableScene() {
    html.classList.add("scene");
    stage.inert = false;
    dossier.inert = !html.classList.contains("panel-open");
    const id = location.hash.slice(1);
    if (id && document.getElementById(id)) openPanel(id, { silent: true });
    else reallyClose();
    rebuild();
    if (!reduce) startLoop();
  }

  document.getElementById("text-toggle").addEventListener("click", enableText);
  document.getElementById("pad-toggle").addEventListener("click", enableScene);
  document.getElementById("index-btn").addEventListener("click", function () {
    lastFocus = document.getElementById("index-btn");
    openPanel("index");
  });
  document.getElementById("sheet-close").addEventListener("click", closePanel);
  scrim.addEventListener("click", closePanel);

  document.querySelectorAll(".callouts [data-open]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (Vehicle.active(model)) endMission();
      lastFocus = btn;
      openPanel(btn.dataset.open);
    });
  });

  document.addEventListener("click", function (e) {
    const a = e.target.closest("a[href^='#']");
    if (!a || !sceneOn()) return;
    const id = a.getAttribute("href").slice(1);
    if (!document.getElementById(id)) return;
    e.preventDefault();
    lastFocus = a;
    openPanel(id);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (Vehicle.active(model)) { endMission(); return; }
      var summary = document.getElementById("mission-summary");
      if (summary && !summary.hidden) { summary.hidden = true; return; }
      if (!term.hidden) { closeTerm(); return; }
      if (html.classList.contains("panel-open")) closePanel();
    }
    if (e.key !== "Tab") return;
    const box = !term.hidden ? term : html.classList.contains("panel-open") ? dossier : null;
    if (!box) return;
    const items = Array.prototype.filter.call(
      box.querySelectorAll("a, button, input, textarea, select"),
      function (el) { return !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null; }
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.querySelector(".skip").addEventListener("click", function (e) {
    if (!sceneOn()) return;
    e.preventDefault();
    openPanel("index");
  });

  /* ---------- terminal ---------- */

  const ALIAS = {
    me: "about", about: "about", education: "education", school: "education",
    certs: "certifications", certifications: "certifications",
    projects: "projects", project: "projects", skills: "skills",
    experience: "experience", work: "experience",
    updates: "blog-updates", blog: "blog-updates", update: "blog-updates",
    publications: "publications", writing: "publications",
    resources: "resources", social: "social", contact: "contact", index: "index",
  };

  const TERM_LINKS = {
    vexel: "https://vexel.wtf",
    x: "https://twitter.com/colinlee05",
    ig: "https://instagram.com/colinlee.05",
    in: "https://www.linkedin.com/in/colinlee05",
    gh: "https://github.com/colinlee05",
  };

  function say(text) {
    if (text == null || text === "") return;
    const block = document.createElement("div");
    block.textContent = String(text);
    termLog.appendChild(block);
    termLog.scrollTop = termLog.scrollHeight;
  }

  function sayLink(prefix, key) {
    const href = TERM_LINKS[key];
    if (!href) return;
    const block = document.createElement("div");
    if (prefix) block.appendChild(document.createTextNode(prefix));
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = href;
    block.appendChild(a);
    termLog.appendChild(block);
    termLog.scrollTop = termLog.scrollHeight;
  }

  const COMMANDS = {
    help: function () {
      return [
        "help          list commands",
        "whoami        short bio",
        "ls projects   what I'm building",
        "cat resume    link to resume.pdf",
        "certs         in progress, and coursework",
        "contact       GitHub and LinkedIn",
        "launch        replay the mission",
        "clear",
        "open <name>   open a section",
      ].join("\n");
    },
    whoami: function () {
      return "Colin Lee. LSU senior, Information Systems and Analytics, cyber risk focus, computer science minor. New Orleans. Geaux Tigers.";
    },
    status: function () {
      return "Currently: LSU Senior · Cyber Risk focus\nExpected graduation: Spring 2027 · GPA 3.8";
    },
    ls: function (arg) {
      if ((arg || "").toLowerCase() === "projects") {
        return "vexel     full-stack web app, live in beta\npassword  strength analyzer, runs in the browser";
      }
      return "about  education  certifications  projects  skills\nexperience  updates  publications  resources  social  contact";
    },
    cat: function (arg) {
      if ((arg || "").toLowerCase() !== "resume") return "try: cat resume";
      const block = document.createElement("div");
      const a = document.createElement("a");
      a.href = "resume.pdf";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "resume.pdf";
      block.appendChild(a);
      termLog.appendChild(block);
      termLog.scrollTop = termLog.scrollHeight;
      return "";
    },
    certs: function () {
      return [
        "In progress, not yet held:",
        "  SAFe Scrum Master (Scaled Agile)",
        "  CompTIA Network+",
        "  AWS Certified Cloud Practitioner",
        "Coursework, not certifications held:",
        "  CISA material, ISDS 4096",
        "  CISSP material, ISDS 4070",
      ].join("\n");
    },
    contact: function () {
      say("GitHub");
      sayLink("  ", "gh");
      say("LinkedIn");
      sayLink("  ", "in");
      return "";
    },
    open: function (arg) {
      const id = ALIAS[(arg || "").toLowerCase()];
      if (!id) return "try: open projects";
      openPanel(id);
      return "opening " + (KICK[id] || id);
    },
    resume: function () {
      window.open("resume.pdf", "_blank", "noopener");
      return "opening resume.pdf";
    },
    launch: function () {
      if (model && window.Vehicle && Vehicle.active(model)) Vehicle.stop(model);
      ignite();
      return reduce ? "motion reduced — the stack stays on the pad." : "launching.";
    },
    vexel: function () {
      say("Full-stack web app, live in beta.");
      sayLink("", "vexel");
      return "";
    },
    social: function () {
      sayLink("X  ", "x");
      sayLink("Instagram  ", "ig");
      sayLink("LinkedIn  ", "in");
      return "";
    },
    geaux: function () {
      return "I once debugged code all night during an LSU game week!";
    },
    clear: function () {
      termLog.replaceChildren();
      return "";
    },
  };

  function openTerm() {
    if (html.classList.contains("panel-open")) closePanel();
    term.hidden = false;
    if (!termLog.childNodes.length) {
      say("COLIN.LEE  flight computer\ntype help");
    }
    termIn.focus();
  }

  function closeTerm(restore) {
    const wasOpen = !term.hidden;
    term.hidden = true;
    if (restore && wasOpen && termHot) termHot.focus();
  }

  termForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const raw = termIn.value.trim();
    termIn.value = "";
    if (!raw) return;
    say("> " + raw);
    const bits = raw.split(/\s+/);
    const cmd = bits[0].toLowerCase();
    const fn = COMMANDS[cmd];
    say(fn ? fn(bits.slice(1).join(" ")) : "unknown command. try help.");
  });

  document.getElementById("term-close").addEventListener("click", function () { closeTerm(true); });
  termHot.addEventListener("click", openTerm);
  shipHot.addEventListener("click", ignite);
  document.getElementById("skip-mission").addEventListener("click", endMission);
  document.getElementById("summary-close").addEventListener("click", function () {
    document.getElementById("mission-summary").hidden = true;
  });

  stage.addEventListener("pointermove", function (e) {
    const r = canvas.getBoundingClientRect();
    mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    const hit = e.target.closest("[data-open], [data-resume]");
    const id = hit ? hit.dataset.open || "resume" : null;
    if (id !== hoverId) {
      hoverId = id;
      if (reduce) draw(performance.now());
    }
  });
  stage.addEventListener("pointerleave", function () {
    mouse.tx = 0;
    mouse.ty = 0;
    hoverId = null;
    if (reduce) draw(performance.now());
  });

  /* ---------- preserved interactions ---------- */

  const funFactBtn = document.getElementById("fun-fact-btn");
  const funFact = document.getElementById("fun-fact");
  if (funFactBtn && funFact) {
    funFactBtn.addEventListener("click", function () {
      funFact.classList.toggle("hidden");
    });
  }

  const passwordInput = document.getElementById("password-input");
  const strengthBar = document.getElementById("strength-bar");
  const strengthText = document.getElementById("strength-text");

  function assessPasswordStrength(password) {
    let strength = 0;
    const passLength = password.length;
    if (passLength < 8) strength = 0;
    else if (passLength < 12) strength = 1;
    else strength = 2;
    if (strength > 0) {
      if (password.match(/[a-z]/)) strength++;
      if (password.match(/[A-Z]/)) strength++;
      if (password.match(/[0-9]/)) strength++;
      if (password.match(/[^a-zA-Z0-9]/)) strength++;
    }
    switch (strength) {
      case 0:
      case 1:
        return { level: "Weak", color: "#e06b6b", width: 25 };
      case 2:
      case 3:
        return { level: "Medium", color: "#e0a15a", width: 66 };
      case 4:
      case 5:
      case 6:
        return { level: "Strong", color: "#7dcea0", width: 100 };
      default:
        return { level: "Weak", color: "#e06b6b", width: 0 };
    }
  }

  if (passwordInput && strengthBar && strengthText) {
    passwordInput.addEventListener("input", function () {
      const password = passwordInput.value;
      if (password.length === 0) {
        strengthBar.style.width = "0%";
        strengthText.textContent = "";
        return;
      }
      const result = assessPasswordStrength(password);
      strengthBar.style.width = result.width + "%";
      strengthBar.style.backgroundColor = result.color;
      strengthText.textContent = "Strength: " + result.level;
      strengthText.style.color = result.color;
    });
  }

  const contactForm = document.querySelector("#contact form");
  if (contactForm) {
    contactForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const formData = new FormData(contactForm);
      const submitButton = contactForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      const existingMsg = contactForm.querySelector(".form-message");
      if (existingMsg) existingMsg.remove();
      try {
        const response = await fetch(contactForm.action, { method: "POST", body: formData });
        if (response.ok) {
          try {
            const data = await response.json();
            if (data.success) {
              showFormMessage("Message successfully sent! 👍", "success");
              contactForm.reset();
            } else {
              showFormMessage("Message not delivered. Please try again. ⚠️", "error");
            }
          } catch (jsonError) {
            showFormMessage("Message successfully sent! 👍", "success");
            contactForm.reset();
          }
        } else {
          showFormMessage("Message not delivered. Please try again. ⚠️", "error");
        }
      } catch (error) {
        showFormMessage("Message not delivered. Please try again. ⚠️", "error");
      } finally {
        submitButton.disabled = false;
        if (window.turnstile) {
          if (turnstileWidget != null) window.turnstile.reset(turnstileWidget);
          else window.turnstile.reset();
        }
      }
    });
  }

  function showFormMessage(text, type) {
    const message = document.createElement("div");
    message.classList.add("form-message", type);
    message.textContent = text;
    contactForm.appendChild(message);
    setTimeout(function () { message.style.opacity = "0"; }, 5000);
    setTimeout(function () { message.remove(); }, 5300);
  }

  function ensureTurnstile() {
    if (!window.turnstile || turnstileWidget != null) return;
    const box = document.getElementById("turnstile-box");
    if (!box) return;
    turnstileWidget = window.turnstile.render(box, {
      sitekey: "0x4AAAAAAB1PvBKaMsHMUxVJ",
      action: "managed",
      theme: "dark",
    });
  }

  let turnstileTries = 0;
  const turnstileTimer = setInterval(function () {
    turnstileTries++;
    if (window.turnstile || turnstileTries > 40) {
      clearInterval(turnstileTimer);
      if (!sceneOn() || (location.hash === "#contact")) ensureTurnstile();
    }
  }, 250);

  /* ---------- boot ---------- */

  window.LiveFlight = { flight: null };

  function rememberFlight(flight) {
    window.LiveFlight.flight = flight;
    try {
      sessionStorage.setItem("live-flight", JSON.stringify({ at: Date.now(), flight: flight }));
    } catch (err) { /* private mode */ }
  }

  function loadLiveFlight() {
    try {
      var cached = JSON.parse(sessionStorage.getItem("live-flight") || "null");
      if (cached && cached.flight && Date.now() - cached.at < 180000) {
        window.LiveFlight.flight = cached.flight;
        return;
      }
    } catch (err) { /* ignore a bad cache */ }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 4000);
    fetch("https://opensky-network.org/api/states/all?lamin=24&lomin=-125&lamax=49&lomax=-66", { signal: ctrl.signal })
      .then(function (res) {
        if (!res.ok) throw new Error("status");
        return res.json();
      })
      .then(function (data) {
        var states = (data && data.states) || [];
        var prefixes = { HAL: 1, QTR: 1, BTI: 1, WJA: 1, UAL: 1, ASA: 1 };
        var best = null;
        var i;
        for (i = 0; i < states.length; i++) {
          var s = states[i];
          if (!s || s[8]) continue;
          var cs = String(s[1] || "").replace(/\s+/g, "");
          if (!prefixes[cs.slice(0, 3)]) continue;
          if (s[7] == null || s[7] < 2500 || s[6] == null || s[5] == null) continue;
          if (!best || s[7] > best.altM) best = { callsign: cs, altM: s[7], lat: s[6], lon: s[5] };
        }
        if (!best) return;
        var altFt = Math.round((best.altM * 3.28084) / 100) * 100;
        var ns = best.lat >= 0 ? "N" : "S";
        var ew = best.lon >= 0 ? "E" : "W";
        rememberFlight({
          callsign: best.callsign,
          altFt: altFt,
          lat: best.lat,
          lon: best.lon,
          line1: "Live: " + best.callsign + " at " + altFt.toLocaleString("en-US") + " ft",
          line2: "near " + Math.abs(best.lat).toFixed(1) + ns + " " + Math.abs(best.lon).toFixed(1) + ew + " · Starlink-equipped airline"
        });
      })
      .catch(function () { /* keep the drawn airliner and its generic caption */ })
      .then(function () { clearTimeout(timer); });
  }

  function boot() {
    try {
      grain = makeGrain();
      const params = new URLSearchParams(location.search);
      if (params.get("view") === "text") {
        enableText();
        ensureTurnstile();
        return;
      }
      dossier.inert = true;
      dossier.setAttribute("aria-hidden", "true");
      const id = location.hash.slice(1);
      rebuild();
      loadLiveFlight();
      if (id && document.getElementById(id)) openPanel(id, { silent: true });
      if (!reduce) startLoop();
      else draw(performance.now());
    } catch (err) {
      html.classList.remove("scene");
      dossier.inert = false;
      dossier.setAttribute("aria-hidden", "false");
    }
  }

  document.addEventListener("visibilitychange", function () {
    var now = performance.now();
    if (document.hidden) {
      if (model) Vehicle.hold(model, now);
      return;
    }
    if (model) Vehicle.resume(model, now);
    if (sceneOn() && !reduce) startLoop();
  });

  window.addEventListener("resize", function () {
    if (sceneOn()) rebuild();
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (sceneOn()) {
        placeCallouts();
        draw(performance.now());
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
