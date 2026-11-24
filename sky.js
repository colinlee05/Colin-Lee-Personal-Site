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
    [23.079, 28.083, 2.07], [0.726, -17.987, 2.04], [11.818, 14.572, 2.14],
    [16.808, -34.293, 1.92], [4.952, 33.166, 1.65], [6.746, -52.696, 1.86]
  ];

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
    if (Math.abs(rel) > 108) return null;
    var sky = Math.max(80, groundY - 24);
    return {
      x: w * 0.5 + (rel / 108) * (w * 0.48),
      y: groundY - (Math.min(alt, 82) / 82) * sky * 0.86
    };
  }

  function drawMoon(ctx, x, y, radius, phase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = INK;
    ctx.fillStyle = "#121116";
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 1.2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.34;
    var dot;
    for (dot = 0; dot < 16; dot++) {
      var ang = dot * 0.9;
      var rr = (0.18 + (dot % 4) * 0.16) * radius;
      ctx.fillRect(Math.cos(ang) * rr - 0.4, Math.sin(ang) * rr - 0.4, 1.1, 1.1);
    }
    ctx.restore();
    var waxing = phase <= 0.5;
    var limb = Math.cos(phase * Math.PI * 2);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius - 0.4, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.86;
    ctx.beginPath();
    ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, waxing);
    ctx.ellipse(0, 0, Math.max(0.6, Math.abs(limb) * radius), radius, 0, Math.PI / 2, -Math.PI / 2, limb > 0 ? !waxing : waxing);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(0.6, Math.abs(limb) * radius), radius - 0.4, 0, waxing ? -Math.PI / 2 : Math.PI / 2, waxing ? Math.PI / 2 : -Math.PI / 2);
    ctx.stroke();
    ctx.restore();
  }

  function paint(ctx, w, h, groundY, now, hideCaption) {
    var ms = now || Date.now();
    var lst = lstDegrees(ms);
    var i;
    ctx.fillStyle = INK;
    for (i = 0; i < STARS.length; i++) {
      var star = STARS[i];
      var pos = altAz(star[0], star[1], lst);
      var p = project(pos.alt, pos.az, w, groundY);
      if (!p || p.y < 18 || p.y > groundY - 8 || p.x < 6 || p.x > w - 6) continue;
      var mag = star[2];
      var bright = Math.max(0, 2.4 - mag) / 3.6;
      ctx.globalAlpha = 0.22 + bright * 0.62;
      var r = mag < 0.2 ? 1.7 : mag < 1 ? 1.25 : 0.85;
      ctx.fillRect(p.x, p.y, r, r);
    }
    var eq = moonEquatorial(ms);
    var moonPos = altAz(eq.raHours, eq.dec, lst);
    var mp = project(moonPos.alt, moonPos.az, w, groundY);
    var phase = moonAge(ms) / 29.530588853;
    var moon = null;
    if (mp && mp.y > 28 && mp.y < groundY - 36) {
      var radius = Math.max(12, Math.min(16, w * 0.012));
      drawMoon(ctx, mp.x, mp.y, radius, phase);
      moon = { x: mp.x, y: mp.y, r: radius };
    }
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
