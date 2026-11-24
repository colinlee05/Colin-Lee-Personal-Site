/* Cloudflare Worker. GET /api/flight
   Reads OpenSky from the edge, where CORS does not apply, and answers
   the site with one airborne flight from a Starlink airline. */

var PREFIXES = ["HAL", "QTR", "BTI", "WJA", "UAL", "ASA"];
var OPENSKY = "https://opensky-network.org/api/states/all?lamin=24&lomin=-125&lamax=49&lomax=-66";
var ALLOWED = {
  "https://colinlee.me": true,
  "https://www.colinlee.me": true
};

function corsHeaders(request) {
  var origin = request.headers.get("Origin") || "";
  var allow = ALLOWED[origin] ? origin : "https://colinlee.me";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "vary": "Origin"
  };
}

function json(request, body, status) {
  var headers = corsHeaders(request);
  headers["content-type"] = "application/json; charset=utf-8";
  headers["cache-control"] = "public, max-age=90";
  return new Response(JSON.stringify(body), { status: status || 200, headers: headers });
}

function pick(states) {
  var best = null;
  var i;
  for (i = 0; i < states.length; i++) {
    var s = states[i];
    if (!s || s[8]) continue;
    var callsign = String(s[1] || "").replace(/\s+/g, "");
    if (PREFIXES.indexOf(callsign.slice(0, 3)) < 0) continue;
    var alt = s[7];
    var lat = s[6];
    var lon = s[5];
    if (alt == null || alt < 2500 || lat == null || lon == null) continue;
    if (!best || alt > best.alt) best = { callsign: callsign, alt: alt, lat: lat, lon: lon };
  }
  if (!best) return { callsign: null, alt_ft: null, lat: null, lon: null, ts: Date.now() };
  return {
    callsign: best.callsign,
    alt_ft: Math.round((best.alt * 3.28084) / 100) * 100,
    lat: Math.round(best.lat * 100) / 100,
    lon: Math.round(best.lon * 100) / 100,
    ts: Date.now()
  };
}

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname !== "/api/flight") {
      return new Response("Not found", { status: 404, headers: corsHeaders(request) });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders(request) });
    }

    var cache = caches.default;
    var cacheKey = new Request(url.origin + "/api/flight", { method: "GET" });
    var cached = await cache.match(cacheKey);
    if (cached) {
      var headers = new Headers(cached.headers);
      var cors = corsHeaders(request);
      Object.keys(cors).forEach(function (key) { headers.set(key, cors[key]); });
      return new Response(cached.body, { status: cached.status, headers: headers });
    }

    var payload;
    try {
      var upstream = await fetch(OPENSKY, { headers: { "accept": "application/json" } });
      if (!upstream.ok) throw new Error("upstream");
      var data = await upstream.json();
      payload = pick((data && data.states) || []);
    } catch (err) {
      payload = { callsign: null, alt_ft: null, lat: null, lon: null, ts: Date.now() };
    }

    var response = json(request, payload);
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  }
};
