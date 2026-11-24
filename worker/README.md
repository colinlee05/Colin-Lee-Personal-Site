# Flight proxy

The personal site asks `GET /api/flight` for one airborne flight on an airline that has committed to Starlink. Browsers cannot call OpenSky directly: OpenSky answers with `Access-Control-Allow-Origin: https://opensky-network.org`, so a page on `https://colinlee.me` is blocked. This Worker fetches OpenSky at the edge and returns a small JSON object the page can read.

`GET /api/flight` responds with one flight, for example:

```json
{ "callsign": "UAL2482", "alt_ft": 37000, "lat": 41.9, "lon": -88.7, "ts": 1732440000000 }
```

`callsign` is `null` when OpenSky has no matching airborne flight or the upstream request fails. The site then keeps the drawn airliner and its generic caption. Nothing in the response says that particular airplane has Starlink. The prefixes considered are HAL, QTR, BTI, WJA, UAL, and ASA. Altitude is barometric, converted from meters to feet and rounded to the nearest hundred. The reply is cached for 90 seconds with the Cache API. CORS allows `https://colinlee.me` and `https://www.colinlee.me`.

## Deploy

From this directory, with Wrangler logged into the Cloudflare account that owns `colinlee.me`:

```bash
npx wrangler login
npx wrangler deploy
```

The route in `wrangler.toml` binds `colinlee.me/api/flight` and `www.colinlee.me/api/flight`. The zone has to be on that account. After it deploys, `curl -H "Origin: https://colinlee.me" https://colinlee.me/api/flight` should return JSON and `access-control-allow-origin: https://colinlee.me`.

Until the Worker is deployed, the page request fails quickly and the inset stays on the generic "Starlink Aviation · 35,000 ft" line.
