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

  const RIDES = { nose: 1, flap: 1, hull: 1, aft: 1, fin: 1, booster: 1 };

  let ctx;
  let view = { w: 1, h: 1, dpr: 1 };
  let geo = null;
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

    const hw = clamp(H * 0.058, 15, 48);
    const engineH = H * 0.048;
    const bodyH = H - engineH;
    const boosterH = bodyH * 0.57;
    const shipH = bodyH - boosterH;
    const yBase = base;
    const ySkirt = yBase - engineH;
    const yJoin = ySkirt - boosterH;
    const yTip = yJoin - shipH;
    const noseH = shipH * 0.38;
    const yNose = yTip + noseH;

    const gap = Math.max(hw * 2.4, 46);
    const towerW = clamp(H * 0.04, 14, 28);
    const towerX = cx - hw - gap - towerW;
    const towerTop = yNose + H * 0.02;

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
      [cx + hw * 1.02, yJoin],
      [cx - hw * 1.02, yJoin],
    ];
    const booster = [
      [cx - hw * 1.04, yJoin],
      [cx + hw * 1.04, yJoin],
      [cx + hw * 1.08, ySkirt],
      [cx - hw * 1.08, ySkirt],
    ];
    const band = [
      [cx - hw * 1.12, yJoin - H * 0.006],
      [cx + hw * 1.12, yJoin - H * 0.006],
      [cx + hw * 1.12, yJoin + H * 0.012],
      [cx - hw * 1.12, yJoin + H * 0.012],
    ];

    function flap(dir, hy, len, root, tip) {
      return [
        [cx + dir * hw, hy - root * 0.15],
        [cx + dir * (hw + len), hy - tip * 0.42 + len * 0.05],
        [cx + dir * (hw + len * 0.92), hy + tip * 0.62 + len * 0.18],
        [cx + dir * hw, hy + root * 0.7],
      ];
    }
    const flapLen = hw * 1.7;
    const fwdY = yNose + shipH * 0.02;
    const aftY = yJoin - shipH * 0.2;
    const flaps = [
      flap(1, fwdY, flapLen, H * 0.028, H * 0.05),
      flap(-1, fwdY, flapLen, H * 0.028, H * 0.05),
      flap(1, aftY, flapLen * 1.28, H * 0.036, H * 0.078),
      flap(-1, aftY, flapLen * 1.28, H * 0.036, H * 0.078),
    ];

    function fin(dir, hy) {
      const len = hw * 1.15;
      const th = H * 0.05;
      return [
        [cx + dir * hw * 1.02, hy],
        [cx + dir * (hw + len), hy - th * 0.08],
        [cx + dir * (hw + len), hy + th * 0.78],
        [cx + dir * hw * 1.02, hy + th],
      ];
    }
    const finY = yJoin + boosterH * 0.18;
    const fins = [fin(1, finY), fin(-1, finY)];

    const bells = [];
    const engines = [];
    const bellN = 5;
    const span = hw * 2.7;
    for (let i = 0; i < bellN; i++) {
      const t = i / (bellN - 1);
      const x = cx - span / 2 + span * t;
      const edge = Math.abs(t - 0.5) * 2;
      const bh = engineH * (1.05 - edge * 0.28);
      const top = ySkirt - H * 0.002;
      const wt = hw * (0.22 - edge * 0.04);
      const wb = hw * (0.38 - edge * 0.06);
      bells.push([
        [x - wt, top],
        [x + wt, top],
        [x + wb, top + bh],
        [x - wb, top + bh],
      ]);
      engines.push({ x: x, y: top + bh });
    }

    const armGap = H * 0.05;
    const armTh = Math.max(8, H * 0.02);
    const armY = yJoin - H * 0.01;
    const armEnd = cx - hw - Math.max(10, hw * 0.45);
    const armStart = towerX + towerW;
    function beam(y) {
      return [
        [armStart, y],
        [armEnd, y - armTh * 0.15],
        [armEnd, y + armTh],
        [armStart, y + armTh * 1.05],
      ];
    }
    const arms = [beam(armY - armGap), beam(armY + armGap * 0.15)];

    const compW = cramped ? 70 : clamp(H * 0.17, 72, 120);
    const compH = compW * 0.82;
    const compX = Math.min(
      cx + hw + Math.max(hw * 3.1, H * 0.16),
      w - compW - (cramped ? 12 : 200)
    );
    const compY = base - compH - H * 0.015;
    const bezel = Math.max(8, compW * 0.11);
    const chin = compH * 0.24;
    const screen = {
      x: compX + bezel,
      y: compY + bezel * 0.65,
      w: compW - bezel * 2,
      h: Math.max(16, compH - chin - bezel),
    };

    const anchors = {
      nose: { x: cx, y: yTip + 2 },
      tower: { x: towerX + towerW * 0.5, y: towerTop + 6 },
      booster: { x: towerX - 2, y: yJoin + boosterH * 0.55 },
      pad: { x: towerX + towerW * 0.2, y: base - 4 },
      flap: { x: cx + hw + flapLen * 0.75, y: fwdY + 6 },
      hull: { x: cx + hw, y: (yNose + yJoin) / 2 },
      aft: { x: cx + hw + flapLen * 0.7, y: aftY + 8 },
      fin: { x: cx + hw * 1.02 + hw * 1.35, y: finY + H * 0.02 },
      terminal: { x: compX + compW, y: compY + compH * 0.35 },
    };

    return {
      w: w, h: h, H: H, cx: cx, hw: hw, base: base,
      yTip: yTip, yNose: yNose, yJoin: yJoin, ySkirt: ySkirt,
      towerX: towerX, towerW: towerW, towerTop: towerTop,
      nose: nosePoly, hull: hull, booster: booster, band: band,
      flaps: flaps, fins: fins, bells: bells, engines: engines,
      arms: arms, armStart: armStart, armEnd: armEnd, armY: armY, armTh: armTh, armGap: armGap,
      rightReach: cx + hw + flapLen * 1.28,
      leftReach: towerX,
      comp: { x: compX, y: compY, w: compW, h: compH },
      screen: screen,
      anchors: anchors,
      seams: [yNose + shipH * 0.28, yNose + shipH * 0.55, yJoin + boosterH * 0.28, yJoin + boosterH * 0.55, yJoin + boosterH * 0.8],
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
    const padL = G.towerX - 30;
    const padR = G.comp.x + G.comp.w + 36;
    for (let k = 0; k < 48; k++) {
      const x = padL + rng() * (padR - padL);
      const y = base + 1 + rng() * 8;
      g.globalAlpha = 0.18 + rng() * 0.2;
      g.fillRect(x, y, 6 + rng() * 14, 1);
    }

    const c = G.comp;
    paintShape(g, [
      [c.x, c.y + 4],
      [c.x + c.w, c.y + 2],
      [c.x + c.w - 1, c.y + c.h],
      [c.x + 3, c.y + c.h - 1],
    ], rng, { wash: 0.1, density: 0.09, spacing: 1.7, band: 2.4, passes: 3, edge: 1, fill: 0.75 });

    const foot = c.x + c.w * 0.38;
    paintShape(g, [
      [foot + 6, c.y + c.h],
      [foot + c.w * 0.22, c.y + c.h],
      [foot + c.w * 0.34, base],
      [foot - 4, base],
    ], rng, { wash: 0.08, density: 0.08, spacing: 1.8, band: 1.5, passes: 2, edge: 0.9, fill: 0.6 });

    const keyY = base - 8;
    paintShape(g, [
      [c.x + 2, keyY],
      [c.x + c.w - 2, keyY - 1],
      [c.x + c.w + 10, base - 1],
      [c.x - 8, base - 1],
    ], rng, { wash: 0.06, density: 0.07, spacing: 2, band: 1.3, passes: 2, edge: 0.85, fill: 0.5 });
    for (let k = 0; k < 9; k++) {
      g.globalAlpha = 0.55;
      g.fillRect(c.x + 6 + k * ((c.w - 8) / 9), keyY + 2, 2, 2);
    }

    stippleLine(g, c.x + 8, base, G.towerX + G.towerW, base + 6, rng, 3, 0.8, 0.28);
  }

  function drawTower(g, G, rng) {
    const x0 = G.towerX;
    const x1 = G.towerX + G.towerW;
    const top = G.towerTop;
    const bot = G.base;
    const segs = 8;
    stippleLine(g, x0, top, x0, bot, rng, 2.2, 1.15, 0.85);
    stippleLine(g, x1, top, x1, bot, rng, 2.2, 1.15, 0.85);
    for (let i = 0; i <= segs; i++) {
      const y = top + ((bot - top) * i) / segs;
      stippleLine(g, x0, y, x1, y, rng, 2.4, 0.8, 0.55);
      if (i < segs) {
        const y2 = top + ((bot - top) * (i + 1)) / segs;
        stippleLine(g, x0, y, x1, y2, rng, 2.8, 0.7, 0.4);
        stippleLine(g, x1, y, x0, y2, rng, 2.8, 0.7, 0.4);
      }
    }
    const mastX = (x0 + x1) / 2;
    stippleLine(g, mastX, top, mastX, top - G.H * 0.055, rng, 2.2, 0.6, 0.7);
    G.arms.forEach(function (arm) {
      paintShape(g, arm, rng, { wash: 0.14, density: 0.12, spacing: 1.6, band: 2.2, passes: 3, edge: 1, fill: 0.85 });
    });
    const grabTop = G.armY - G.armGap - 4;
    const grabBot = G.armY + G.armGap + G.armTh + 6;
    stippleLine(g, G.armEnd, grabTop, G.armEnd, grabBot, rng, 1.6, 1.3, 1);
    stippleLine(g, G.armEnd + 3, grabTop + 2, G.armEnd + 3, grabBot - 2, rng, 1.8, 0.8, 0.7);
    stippleLine(g, G.armStart, G.armY - G.armGap, G.armStart, G.armY + G.armGap + G.armTh, rng, 2, 1.2, 0.65);
  }

  function drawShip(g, G, rng) {
    const hullOpt = { wash: 0.09, density: 0.085, spacing: 1.7, band: 2.4, passes: 3, edge: 1, fill: 0.8 };
    const partOpt = { wash: 0.08, density: 0.07, spacing: 1.7, band: 2, passes: 2, edge: 1, fill: 0.7 };
    G.bells.forEach(function (b) { paintShape(g, b, rng, partOpt); });
    paintShape(g, G.booster, rng, hullOpt);
    paintShape(g, G.band, rng, partOpt);
    paintShape(g, G.hull, rng, hullOpt);
    paintShape(g, G.nose, rng, hullOpt);
    G.fins.forEach(function (f) {
      paintShape(g, f, rng, partOpt);
      const x0 = f[0][0];
      const x1 = f[1][0];
      const y0 = f[0][1];
      const y1 = f[3][1];
      for (let i = 1; i <= 3; i++) {
        const y = y0 + ((y1 - y0) * i) / 4;
        stippleLine(g, x0, y, x1, y - 1, rng, 2.2, 0.5, 0.45);
      }
      stippleLine(g, (x0 + x1) / 2, y0, (x0 + x1) / 2, y1, rng, 2.4, 0.5, 0.4);
    });
    G.flaps.forEach(function (f) { paintShape(g, f, rng, partOpt); });

    const left = G.cx - G.hw * 0.92;
    const right = G.cx + G.hw * 0.92;
    G.seams.forEach(function (y) {
      stippleLine(g, left, y, right, y, rng, 2.3, 0.6, 0.4);
    });
    stippleLine(g, G.cx + G.hw * 0.45, G.yNose, G.cx + G.hw * 0.5, G.ySkirt, rng, 2.6, 0.7, 0.4);

    for (let i = 0; i < 26; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = G.hw * 1.4 + rng() * 18;
      const y = G.yNose + rng() * (G.ySkirt - G.yNose);
      spray(g, G.cx + Math.cos(ang) * rad * 0.35, y, rng, 0.28);
    }
  }

  function rebuild() {
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
    geo = buildGeometry(view.w, view.h, cramped);

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

    groundLayer = layer();
    towerLayer = layer();
    shipLayer = layer();
    drawGround(groundLayer.g, geo, rng);
    drawTower(towerLayer.g, geo, rng);
    drawShip(shipLayer.g, geo, rng);
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
    if (!cramped) {
      const whisperH = document.querySelector(".whisper").offsetHeight;
      const top = Math.max(78, geo.yTip - 8);
      const botL = Math.min(view.h - 48, geo.base - 34);
      const botR = Math.min(geo.base - 28, view.h - whisperH - 30);
      const leftX = geo.leftReach - 18;
      let rightX = Math.max(geo.rightReach, geo.comp.x + geo.comp.w) + 54;
      rightX = Math.min(rightX, view.w - 250);
      spread(left, top, Math.max(top + 48, botL), "left", leftX);
      spread(right, top, Math.max(top + 48, botR), "right", rightX);
    }
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
    const rise = Math.min(geo.H * 0.11, 78);
    if (ms < 380) return 0;
    if (ms < 1500) {
      const t = (ms - 380) / 1120;
      return -rise * (1 - Math.pow(1 - t, 3));
    }
    if (ms < 2100) return -rise;
    if (ms < 3300) {
      const t = (ms - 2100) / 1200;
      const s = t * t * (3 - 2 * t);
      return -rise * (1 - s);
    }
    return 0;
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

    const ox = reduce ? 0 : mouse.x * 10;
    const oy = reduce ? 0 : mouse.y * 6;
    const t = now * 0.001;
    ctx.fillStyle = INK;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      let x = s.x + ox;
      let y = s.y + oy;
      if (x < 0) x += w;
      else if (x > w) x -= w;
      const tw = reduce ? 0.8 : 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(t * s.spd + s.ph));
      ctx.globalAlpha = s.a * tw;
      ctx.fillRect(x, y, s.r, s.r);
      if (s.r > 1.6) {
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(x - 2.5, y + s.r * 0.3, 1, 1);
        ctx.fillRect(x + s.r + 1.5, y + s.r * 0.3, 1, 1);
      }
    }
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
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(j.x, j.y);
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
    ctx.drawImage(groundLayer.c, px * 0.25, 0, view.w, view.h);
    ctx.drawImage(towerLayer.c, px * 0.6, py * 0.3, view.w, view.h);
    let shakeX = 0;
    let shakeY = 0;
    if (!reduce && launchStart) {
      const ms = now - launchStart;
      if (ms < 700) {
        shakeX = Math.sin(ms * 0.09) * 0.9;
        shakeY = Math.cos(ms * 0.13) * 0.45;
      }
    }
    ctx.drawImage(shipLayer.c, px + shakeX, shipShift + py + shakeY, view.w, view.h);
    drawParticles();
    drawScreen(now);
    drawLeaders();

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
      if (ms > 3600) {
        launchStart = 0;
        shipShift = 0;
      }
    } else {
      shipShift = 0;
    }
    shipHot.style.transform = "translate(" + (reduce ? 0 : mouse.x * 2.2) + "px," + (shipShift + (reduce ? 0 : mouse.y * 1.4)) + "px)";

    if (!reduce && geo) {
      const power = launchStart && now - launchStart < 2500 && now - launchStart > 180 ? 1 : 0;
      const idle = !power && Math.random() < 0.12;
      if (power || idle) {
        const bursts = power ? 3 : 1;
        for (let n = 0; n < bursts; n++) {
          if (particles.length > 200) break;
          const e = geo.engines[(Math.random() * geo.engines.length) | 0];
          const scale = power ? 1 : 0.35;
          particles.push({
            x: e.x + (Math.random() - 0.5) * 10,
            y: e.y + shipShift,
            vx: (Math.random() - 0.5) * 22 * scale,
            vy: (16 + Math.random() * 46) * scale,
            life: 0.28 + Math.random() * 0.45,
            s: Math.random() > 0.82 ? 2 : 1,
          });
        }
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 18 * dt;
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
    if (launchStart && performance.now() - launchStart < 3400) return;
    launchStart = performance.now();
    live.textContent = reduce
      ? "Launch sequence held still, because motion is reduced."
      : "Engines lit. The stack lifts, then settles back onto the pad.";
    if (reduce) draw(performance.now());
    else startLoop();
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

  function say(text) {
    if (text == null || text === "") return;
    const block = document.createElement("div");
    String(text).split("\n").forEach(function (line, i) {
      if (i) block.appendChild(document.createElement("br"));
      const url = line.match(/https?:\/\/\S+/);
      if (url) {
        const parts = line.split(url[0]);
        block.appendChild(document.createTextNode(parts[0]));
        const a = document.createElement("a");
        a.href = url[0];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = url[0];
        block.appendChild(a);
        block.appendChild(document.createTextNode(parts[1] || ""));
      } else {
        block.appendChild(document.createTextNode(line));
      }
    });
    termLog.appendChild(block);
    termLog.scrollTop = termLog.scrollHeight;
  }

  const COMMANDS = {
    help: function () {
      return [
        "help        list commands",
        "whoami      short bio",
        "status      where things stand",
        "ls          sections",
        "open <name> open a section",
        "resume      open the pdf",
        "launch      light the engines",
        "vexel       the beta app",
        "social      where to find me",
        "geaux       a fun fact",
        "clear",
      ].join("\n");
    },
    whoami: function () {
      return "Colin Lee — LSU junior, Information Systems & Analytics (Cyber Risk), Computer Science minor. Geaux Tigers.";
    },
    status: function () {
      return "Currently: LSU Junior · Cyber Risk focus\nExpected graduation: Spring 2027 · GPA 3.8";
    },
    ls: function () {
      return "about  education  certifications  projects  skills\nexperience  updates  publications  resources  social  contact";
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
      ignite();
      return reduce ? "motion reduced — the stack stays on the pad." : "ignition.";
    },
    vexel: function () {
      return "Full-stack web app, live in beta.\nhttps://vexel.wtf";
    },
    social: function () {
      return "X  https://twitter.com/colinlee05\nInstagram  https://instagram.com/colinlee.05";
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
    if (!document.hidden && sceneOn() && !reduce) startLoop();
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
