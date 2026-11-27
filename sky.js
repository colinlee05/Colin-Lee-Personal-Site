/* Live sky over Baton Rouge. Bright-star catalog plus a low-precision moon.
   Positions are computed in the browser from the clock. No network. */
(function (global) {
  var LAT = 30.41;
  var LON = -91.18;
  var INK = "#f4f1e8";
  /* ra hours, dec degrees, visual magnitude. Bright stars only. */
  var STARS = [
    [6.752, -16.72, -1.46], [5.242, 45.998, 0.03], [14.261, 19.182, 0.03],
    [4.598, 16.509, 0.08], [7.655, 5.225, 0.34], [5.919, 7.407, 0.42],
    [1.628, -57.237, 0.46], [14.845, -60.373, 0.61], [13.42, -11.161, 0.77],
    [7.576, 31.888, 0.08], [5.278, -8.202, 0.13], [6.399, -52.696, -0.74],
    [18.615, 38.783, 0.03], [20.691, 45.28, 1.25], [2.53, 89.264, 2.02],
    [0.139, 29.09, 2.06], [3.405, 49.861, 1.79], [5.438, -0.299, 1.64],
    [6.977, -28.972, 1.5], [7.755, 28.026, 1.14], [8.375, -59.51, 1.86],
    [10.14, 11.967, 1.35], [11.062, 61.751, 1.79], [12.443, -63.099, 1.25],
    [12.9, -59.689, 1.63], [13.792, -47.288, 1.91], [16.49, -26.432, 1.06],
    [17.56, -37.103, 1.83], [18.402, -34.384, 1.85], [19.846, 8.868, 0.76],
    [20.371, -56.735, 1.94], [22.137, -46.961, 1.16], [22.961, -29.622, 1.16],
    [1.911, 20.808, 2.01], [2.12, 23.462, 2.0], [3.079, 40.956, 1.79],
    [4.498, -17.822, 2.04], [5.603, -1.202, 1.69], [6.629, -43.432, 1.86],
    [7.655, -26.393, 1.98], [9.133, -43.432, 1.93], [10.335, -59.373, 1.67],
    [12.519, -57.113, 1.33], [13.398, -53.466, 1.91], [14.111, -36.37, 2.06],
    [15.578, 26.715, 2.14], [16.005, -22.621, 2.29], [17.582, 12.56, 2.08],
    [18.921, -26.296, 2.05], [19.507, 27.96, 2.23], [21.736, 9.876, 2.08],
    [23.079, 28.083, 2.07],     [0.726, -17.987, 2.04], [11.818, 14.572, 2.14],
    [16.808, -34.293, 1.92], [4.952, 33.166, 1.65], [6.746, -52.696, 1.86]
  ];

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildField() {
    var rng = mulberry32(0x5a11);
    var out = [];
    var n;
    for (n = 0; n < 640; n++) {
      var mag = 2.6 + rng() * 2.1;
      if (rng() < 0.035) mag = 1.45 + rng() * 0.7;
      out.push([rng() * 24, (Math.asin(rng() * 2 - 1) * 180) / Math.PI, mag]);
    }
    return out;
  }

  var FIELD = buildField();

  function daysSinceJ2000(ms) {
    return (ms - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  }

  function lstDegrees(ms) {
    var d = daysSinceJ2000(ms);
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    if (gmst < 0) gmst += 360;
    return (gmst + LON + 360) % 360;
  }

  function altAz(raHours, decDeg, lst) {
    var ha = ((lst - raHours * 15) * Math.PI) / 180;
    var dec = (decDeg * Math.PI) / 180;
    var lat = (LAT * Math.PI) / 180;
    var sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(ha));
    return { alt: (alt * 180) / Math.PI, az: ((az * 180) / Math.PI + 360) % 360 };
  }

  function moonEquatorial(ms) {
    var d = daysSinceJ2000(ms);
    var L = ((218.316 + 13.176396 * d) * Math.PI) / 180;
    var M = ((134.963 + 13.064993 * d) * Math.PI) / 180;
    var F = ((93.272 + 13.22935 * d) * Math.PI) / 180;
    var lon = L + ((6.289 * Math.sin(M)) * Math.PI) / 180;
    var lat = ((5.128 * Math.sin(F)) * Math.PI) / 180;
    var eps = (23.439 * Math.PI) / 180;
    var ra = Math.atan2(Math.sin(lon) * Math.cos(eps) - Math.tan(lat) * Math.sin(eps), Math.cos(lon));
    var dec = Math.asin(Math.sin(lat) * Math.cos(eps) + Math.cos(lat) * Math.sin(eps) * Math.sin(lon));
    if (ra < 0) ra += Math.PI * 2;
    return { raHours: (ra * 12) / Math.PI, dec: (dec * 180) / Math.PI };
  }

  function moonAge(ms) {
    var d = daysSinceJ2000(ms);
    var age = (d - 5.597661) % 29.530588853;
    if (age < 0) age += 29.530588853;
    return age;
  }

  function project(alt, az, w, groundY) {
    if (alt < 4) return null;
    var rel = ((az - 180 + 540) % 360) - 180;
    if (Math.abs(rel) > 140) return null;
    var sky = Math.max(80, groundY - 24);
    return {
      x: w * 0.5 + (rel / 140) * (w * 0.42),
      y: groundY - (Math.min(alt, 82) / 82) * sky * 0.78
    };
  }

  function moonLit(nx, ny, phase) {
    var limb = Math.cos(phase * Math.PI * 2);
    var edge = limb * Math.sqrt(Math.max(0, 1 - ny * ny));
    return phase < 0.5 ? nx > edge : nx < -edge;
  }

  function hash2(a, b) {
    var s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function shadeBlob(ctx, radius, cx, cy, rings) {
    var i;
    for (i = 0; i < rings.length; i++) {
      var ring = rings[i];
      ctx.beginPath();
      ctx.ellipse(cx * radius, cy * radius, ring[0] * radius, ring[1] * radius, ring[2], 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMoon(ctx, x, y, radius, phase) {
    ctx.save();
    ctx.translate(x, y);
    var glow = ctx.createRadialGradient(0, 0, radius * 0.85, 0, 0, radius * 2.1);
    glow.addColorStop(0, "rgba(244,241,232,0.18)");
    glow.addColorStop(0.55, "rgba(244,241,232,0.05)");
    glow.addColorStop(1, "rgba(244,241,232,0)");
    ctx.fillStyle = glow;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 0.4, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = INK;
    var litSide = phase < 0.5 ? 1 : -1;
    var row;
    var col;
    var step = 1.05;
    for (row = -radius; row <= radius; row += step) {
      for (col = -radius; col <= radius; col += step) {
        var jx = (hash2(row, col) - 0.5) * step * 0.95;
        var jy = (hash2(col, row + 3) - 0.5) * step * 0.95;
        var px = col + jx;
        var py = row + jy;
        var nx = px / radius;
        var ny = py / radius;
        if (nx * nx + ny * ny > 0.86) continue;
        if (!moonLit(nx, ny, phase)) continue;
        var mare = (nx + 0.2) * (nx + 0.2) / 0.05 + (ny + 0.16) * (ny + 0.16) / 0.025;
        var mare2 = (nx - 0.1) * (nx - 0.1) / 0.018 + (ny + 0.2) * (ny + 0.2) / 0.016;
        var mare3 = (nx - 0.28) * (nx - 0.28) / 0.03 + (ny - 0.04) * (ny - 0.04) / 0.012;
        if (mare < 1 || mare2 < 1 || mare3 < 1) {
          if (hash2(row + 4, col + 9) > 0.35) continue;
        }
        var limb = Math.cos(phase * Math.PI * 2);
        var edge = limb * Math.sqrt(Math.max(0, 1 - ny * ny));
        var depth = phase < 0.5 ? nx - edge : -edge - nx;
        var fade = Math.max(0, Math.min(1, depth * 7));
        var toward = (nx * litSide + 1) * 0.5;
        ctx.globalAlpha = (0.22 + toward * 0.62) * (0.45 + fade * 0.55);
        ctx.beginPath();
        ctx.arc(px, py, 0.42 + toward * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(-0.05 * radius, 0.12 * radius, radius * 0.08, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.22 * radius, -0.18 * radius, radius * 0.05, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.05;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function placeMoon(mp, w, groundY) {
    var nice = { x: w * 0.8, y: Math.max(46, groundY * 0.15) };
    if (!mp) return nice;
    var high = mp.y > 30 && mp.y < groundY * 0.3;
    var right = mp.x > w * 0.64 && mp.x < w * 0.9;
    if (high && right) return mp;
    return nice;
  }

  function paint(ctx, w, h, groundY, now, hideCaption) {
    var ms = now || Date.now();
    var lst = lstDegrees(ms);
    var i;
    var eq = moonEquatorial(ms);
    var moonPos = altAz(eq.raHours, eq.dec, lst);
    var phase = moonAge(ms) / 29.530588853;
    var placed = placeMoon(project(moonPos.alt, moonPos.az, w, groundY), w, groundY);
    var radius = Math.max(12, Math.min(15, w * 0.011));
    var moon = { x: placed.x, y: placed.y, r: radius };
    ctx.fillStyle = INK;
    var shown = 0;
    function drawStar(star) {
      if (shown > 230) return;
      var pos = altAz(star[0], star[1], lst);
      var p = project(pos.alt, pos.az, w, groundY);
      if (!p || p.y < 16 || p.y > groundY - 10 || p.x < 8 || p.x > w - 8) return;
      if (Math.hypot(p.x - moon.x, p.y - moon.y) < moon.r + 6) return;
      var mag = star[2];
      var dot = mag < 0.2 ? 1.7 : mag < 1 ? 1.25 : mag < 2 ? 0.95 : mag < 3.2 ? 0.72 : 0.55;
      ctx.globalAlpha = mag < 0.2 ? 0.96 : mag < 1 ? 0.84 : mag < 2 ? 0.68 : mag < 3.2 ? 0.5 : 0.38;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dot, 0, Math.PI * 2);
      ctx.fill();
      shown += 1;
    }
    for (i = 0; i < STARS.length; i++) drawStar(STARS[i]);
    for (i = 0; i < FIELD.length; i++) drawStar(FIELD[i]);
    drawMoon(ctx, moon.x, moon.y, moon.r, phase);
    if (!hideCaption) {
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = INK;
      ctx.font = "10px IBM Plex Mono, ui-monospace, monospace";
      var caption = "Sky over Baton Rouge, live";
      var tw = ctx.measureText(caption).width;
      var cx = 16;
      var cy = Math.min(78, Math.max(36, groundY * 0.1));
      if (moon && Math.abs(cx - moon.x) < moon.r + tw && Math.abs(cy - moon.y) < moon.r + 16) {
        cy = moon.y + moon.r + 16;
      }
      ctx.fillText(caption, cx, cy);
    }
    ctx.globalAlpha = 1;
    return { phase: phase, moonUp: !!moon };
  }

  global.BatonRougeSky = { paint: paint, lat: LAT, lon: LON };
})(window);
