// CSRA Marketing — location-dynamic copy + schema (Worker, advanced mode).
// NOTE: this site deploys as a Worker with static assets, NOT Pages —
// Pages Functions (functions/) never execute here; _worker.js does.
// Three jobs, all driven by the visitor's location at the edge (request.cf):
//  1. Body copy: swaps the visitor's city into marked spans (data-geo-slot)
//     on /services/ and /tools/lost-revenue-calculator/.
//  2. Schema: rewrites the JSON-LD "areaServed" city cluster on /services/,
//     /contact/ and /about/ to the visitor's metro cluster (starter map
//     below; unmapped cities fall back to the city + its state).
//  3. Audit hero city: on /roofing-website-score/ only, injects the
//     visitor's city as a same-origin signal (a meta tag + a
//     data-visitor-city attribute) for the page's own H1 script. It never
//     rewrites H1 text server-side; the page inserts " in [City]" itself
//     when a signal is present, and keeps its original headline otherwise.
// Pages ship with the home-base (CSRA metro) wording as the default, so:
//   - bots/crawlers, no city known, or any error -> the default page is
//     served untouched (fail-open by design; this must never break the site)
//   - titles, meta descriptions and H1 text are never modified here.

// Roofing Lead Leak Audit 2.0 (Phase 3): the scoring engine lives in
// audit-scoring.js (pure functions, shared with the Node unit tests).
// The site Worker does NOT inject GA4 / Pixel / visitor-track site-wide:
// other pages carry those snippets inline. The audit page carries them
// inline too (see roofing-website-score/index.html), so nothing is
// double-added here.
import { parsePageSpeed, pageChecks, scoreReport, isBotChallengePage } from "./audit-scoring.js";
import { fetchPlaces } from "./places-helpers.js";

const SPAN_PATHS = new Set([
  "/services",
  "/services/",
  "/tools/lost-revenue-calculator",
  "/tools/lost-revenue-calculator/",
]);

const SCHEMA_PATHS = new Set([
  "/services",
  "/services/",
  "/contact",
  "/contact/",
  "/about",
  "/about/",
]);

// Audit 2.0 hero city: the live /roofing-website-score/ page reads the
// visitor's city from same-origin signals only (meta tag + data attribute).
const CITY_PATHS = new Set([
  "/roofing-website-score",
  "/roofing-website-score/",
]);

const BOT_RE =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|applebot|ia_archiver|crawler|spider|headless/i;

// Audit 2.0 hero city: sanitize + per-word title-case a Cloudflare city
// name before it is injected as a same-origin signal. City level only,
// never precise, never stored. Returns "" when the value is not a
// plausible city name; the page then keeps its original headline.
function sanitizeAuditCity(raw) {
  if (typeof raw !== "string") return "";
  const city = raw.trim().replace(/\s+/g, " ");
  if (city.length < 2 || city.length > 60) return "";
  if (/unknown|undefined|null/i.test(city)) return "";
  if (!/^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’.\- ]*$/.test(city)) return "";
  return city
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Metro clusters: key "city|statecode" (lowercase) -> [[city, state], ...]
const CLUSTERS = {
  "augusta|ga": [["Augusta","Georgia"],["Grovetown","Georgia"],["Evans","Georgia"],["Martinez","Georgia"],["North Augusta","South Carolina"],["Aiken","South Carolina"]],
  "atlanta|ga": [["Atlanta","Georgia"],["Marietta","Georgia"],["Decatur","Georgia"],["Sandy Springs","Georgia"],["Roswell","Georgia"],["Alpharetta","Georgia"],["Kennesaw","Georgia"],["Smyrna","Georgia"]],
  "savannah|ga": [["Savannah","Georgia"],["Pooler","Georgia"],["Richmond Hill","Georgia"],["Bluffton","South Carolina"]],
  "columbus|ga": [["Columbus","Georgia"],["Phenix City","Alabama"],["Fort Mitchell","Alabama"]],
  "dallas|tx": [["Dallas","Texas"],["Fort Worth","Texas"],["Arlington","Texas"],["Plano","Texas"],["Irving","Texas"],["Garland","Texas"],["Frisco","Texas"]],
  "fort worth|tx": [["Dallas","Texas"],["Fort Worth","Texas"],["Arlington","Texas"],["Plano","Texas"],["Irving","Texas"],["Garland","Texas"],["Frisco","Texas"]],
  "houston|tx": [["Houston","Texas"],["Pasadena","Texas"],["Sugar Land","Texas"],["The Woodlands","Texas"],["Katy","Texas"],["Pearland","Texas"]],
  "austin|tx": [["Austin","Texas"],["Round Rock","Texas"],["Pflugerville","Texas"],["Cedar Park","Texas"],["Georgetown","Texas"]],
  "san antonio|tx": [["San Antonio","Texas"],["New Braunfels","Texas"],["Boerne","Texas"],["Schertz","Texas"]],
  "el paso|tx": [["El Paso","Texas"],["Horizon City","Texas"],["Socorro","Texas"]],
  "corpus christi|tx": [["Corpus Christi","Texas"],["Portland","Texas"],["Rockport","Texas"]],
  "lubbock|tx": [["Lubbock","Texas"],["Wolfforth","Texas"],["Shallowater","Texas"]],
  "midland|tx": [["Midland","Texas"],["Odessa","Texas"]],
  "odessa|tx": [["Midland","Texas"],["Odessa","Texas"]],
  "amarillo|tx": [["Amarillo","Texas"],["Canyon","Texas"]],
  "wichita falls|tx": [["Wichita Falls","Texas"],["Burkburnett","Texas"]],
  "tyler|tx": [["Tyler","Texas"],["Lindale","Texas"],["Whitehouse","Texas"]],
  "college station|tx": [["College Station","Texas"],["Bryan","Texas"]],
  "waco|tx": [["Waco","Texas"],["Hewitt","Texas"],["Woodway","Texas"]],
  "abilene|tx": [["Abilene","Texas"],["Clyde","Texas"]],
  "charlotte|nc": [["Charlotte","North Carolina"],["Concord","North Carolina"],["Gastonia","North Carolina"],["Rock Hill","South Carolina"],["Huntersville","North Carolina"]],
  "raleigh|nc": [["Raleigh","North Carolina"],["Durham","North Carolina"],["Cary","North Carolina"],["Apex","North Carolina"],["Wake Forest","North Carolina"],["Chapel Hill","North Carolina"]],
  "durham|nc": [["Raleigh","North Carolina"],["Durham","North Carolina"],["Cary","North Carolina"],["Apex","North Carolina"],["Wake Forest","North Carolina"],["Chapel Hill","North Carolina"]],
  "asheville|nc": [["Asheville","North Carolina"],["Hendersonville","North Carolina"],["Arden","North Carolina"],["Weaverville","North Carolina"]],
  "wilmington|nc": [["Wilmington","North Carolina"],["Leland","North Carolina"],["Hampstead","North Carolina"],["Carolina Beach","North Carolina"]],
  "columbia|sc": [["Columbia","South Carolina"],["Lexington","South Carolina"],["Irmo","South Carolina"],["Cayce","South Carolina"]],
  "greenville|sc": [["Greenville","South Carolina"],["Spartanburg","South Carolina"],["Anderson","South Carolina"],["Greer","South Carolina"],["Mauldin","South Carolina"]],
  "charleston|sc": [["Charleston","South Carolina"],["North Charleston","South Carolina"],["Mount Pleasant","South Carolina"],["Summerville","South Carolina"]],
  "myrtle beach|sc": [["Myrtle Beach","South Carolina"],["North Myrtle Beach","South Carolina"],["Conway","South Carolina"],["Murrells Inlet","South Carolina"]],
  "nashville|tn": [["Nashville","Tennessee"],["Franklin","Tennessee"],["Murfreesboro","Tennessee"],["Hendersonville","Tennessee"],["Brentwood","Tennessee"]],
  "memphis|tn": [["Memphis","Tennessee"],["Germantown","Tennessee"],["Collierville","Tennessee"],["Bartlett","Tennessee"]],
  "knoxville|tn": [["Knoxville","Tennessee"],["Maryville","Tennessee"],["Farragut","Tennessee"],["Oak Ridge","Tennessee"]],
  "chattanooga|tn": [["Chattanooga","Tennessee"],["Cleveland","Tennessee"],["Hixson","Tennessee"],["East Ridge","Tennessee"]],
  "phoenix|az": [["Phoenix","Arizona"],["Mesa","Arizona"],["Scottsdale","Arizona"],["Gilbert","Arizona"],["Chandler","Arizona"],["Glendale","Arizona"],["Tempe","Arizona"]],
  "tucson|az": [["Tucson","Arizona"],["Oro Valley","Arizona"],["Marana","Arizona"],["Sahuarita","Arizona"]],
  "tampa|fl": [["Tampa","Florida"],["St. Petersburg","Florida"],["Clearwater","Florida"],["Brandon","Florida"],["Lakeland","Florida"]],
  "st. petersburg|fl": [["Tampa","Florida"],["St. Petersburg","Florida"],["Clearwater","Florida"],["Brandon","Florida"],["Lakeland","Florida"]],
  "orlando|fl": [["Orlando","Florida"],["Winter Park","Florida"],["Kissimmee","Florida"],["Sanford","Florida"],["Altamonte Springs","Florida"]],
  "jacksonville|fl": [["Jacksonville","Florida"],["Orange Park","Florida"],["St. Johns","Florida"],["Fleming Island","Florida"]],
  "fort myers|fl": [["Fort Myers","Florida"],["Cape Coral","Florida"],["Bonita Springs","Florida"],["Estero","Florida"]],
  "west palm beach|fl": [["West Palm Beach","Florida"],["Palm Beach Gardens","Florida"],["Jupiter","Florida"],["Lake Worth Beach","Florida"],["Boynton Beach","Florida"]],
  "miami|fl": [["Miami","Florida"],["Fort Lauderdale","Florida"],["Pembroke Pines","Florida"],["Hollywood","Florida"],["Boca Raton","Florida"]],
  "fort lauderdale|fl": [["Miami","Florida"],["Fort Lauderdale","Florida"],["Pembroke Pines","Florida"],["Hollywood","Florida"],["Boca Raton","Florida"]],
  "birmingham|al": [["Birmingham","Alabama"],["Hoover","Alabama"],["Vestavia Hills","Alabama"],["Trussville","Alabama"]],
  "huntsville|al": [["Huntsville","Alabama"],["Madison","Alabama"],["Decatur","Alabama"],["Athens","Alabama"]],
  "mobile|al": [["Mobile","Alabama"],["Daphne","Alabama"],["Fairhope","Alabama"],["Saraland","Alabama"]],
  "columbus|oh": [["Columbus","Ohio"],["Dublin","Ohio"],["Westerville","Ohio"],["Reynoldsburg","Ohio"]],
  "cleveland|oh": [["Cleveland","Ohio"],["Akron","Ohio"],["Parma","Ohio"],["Lakewood","Ohio"],["Mentor","Ohio"]],
  "cincinnati|oh": [["Cincinnati","Ohio"],["Mason","Ohio"],["West Chester","Ohio"],["Covington","Kentucky"],["Florence","Kentucky"]],
  "indianapolis|in": [["Indianapolis","Indiana"],["Carmel","Indiana"],["Fishers","Indiana"],["Noblesville","Indiana"],["Greenwood","Indiana"]],
  "denver|co": [["Denver","Colorado"],["Aurora","Colorado"],["Lakewood","Colorado"],["Arvada","Colorado"],["Westminster","Colorado"]],
  "colorado springs|co": [["Colorado Springs","Colorado"],["Fountain","Colorado"],["Monument","Colorado"],["Peyton","Colorado"]],
  "louisville|ky": [["Louisville","Kentucky"],["Jeffersonville","Indiana"],["New Albany","Indiana"],["Clarksville","Indiana"]],
  "lexington|ky": [["Lexington","Kentucky"],["Georgetown","Kentucky"],["Nicholasville","Kentucky"],["Richmond","Kentucky"]],
  "oklahoma city|ok": [["Oklahoma City","Oklahoma"],["Norman","Oklahoma"],["Edmond","Oklahoma"],["Moore","Oklahoma"]],
  "tulsa|ok": [["Tulsa","Oklahoma"],["Broken Arrow","Oklahoma"],["Owasso","Oklahoma"],["Jenks","Oklahoma"]],
  "richmond|va": [["Richmond","Virginia"],["Glen Allen","Virginia"],["Mechanicsville","Virginia"],["Midlothian","Virginia"]],
  "virginia beach|va": [["Virginia Beach","Virginia"],["Norfolk","Virginia"],["Chesapeake","Virginia"],["Hampton","Virginia"],["Newport News","Virginia"]],
  "kansas city|mo": [["Kansas City","Missouri"],["Overland Park","Kansas"],["Independence","Missouri"],["Lee's Summit","Missouri"],["Olathe","Kansas"]],
  "kansas city|ks": [["Kansas City","Missouri"],["Overland Park","Kansas"],["Independence","Missouri"],["Lee's Summit","Missouri"],["Olathe","Kansas"]],
  "st. louis|mo": [["St. Louis","Missouri"],["St. Charles","Missouri"],["Chesterfield","Missouri"],["Florissant","Missouri"]],
  "saint louis|mo": [["St. Louis","Missouri"],["St. Charles","Missouri"],["Chesterfield","Missouri"],["Florissant","Missouri"]],
  "salt lake city|ut": [["Salt Lake City","Utah"],["Sandy","Utah"],["Murray","Utah"],["Draper","Utah"],["Lehi","Utah"]],
  "las vegas|nv": [["Las Vegas","Nevada"],["Henderson","Nevada"],["North Las Vegas","Nevada"],["Boulder City","Nevada"]],
  "pittsburgh|pa": [["Pittsburgh","Pennsylvania"],["Bethel Park","Pennsylvania"],["Monroeville","Pennsylvania"],["Cranberry Township","Pennsylvania"]],
  "milwaukee|wi": [["Milwaukee","Wisconsin"],["Waukesha","Wisconsin"],["Brookfield","Wisconsin"],["Racine","Wisconsin"]],
  "grand rapids|mi": [["Grand Rapids","Michigan"],["Wyoming","Michigan"],["Kentwood","Michigan"],["Grandville","Michigan"]],
  "des moines|ia": [["Des Moines","Iowa"],["West Des Moines","Iowa"],["Ankeny","Iowa"],["Urbandale","Iowa"]],
  "little rock|ar": [["Little Rock","Arkansas"],["North Little Rock","Arkansas"],["Conway","Arkansas"],["Benton","Arkansas"]],
  "fayetteville|ar": [["Fayetteville","Arkansas"],["Springdale","Arkansas"],["Rogers","Arkansas"],["Bentonville","Arkansas"]],
  "jackson|ms": [["Jackson","Mississippi"],["Madison","Mississippi"],["Ridgeland","Mississippi"],["Brandon","Mississippi"]],
  "boise|id": [["Boise","Idaho"],["Meridian","Idaho"],["Nampa","Idaho"],["Eagle","Idaho"]],
  "wichita|ks": [["Wichita","Kansas"],["Derby","Kansas"],["Andover","Kansas"],["Haysville","Kansas"]],
  "albuquerque|nm": [["Albuquerque","New Mexico"],["Rio Rancho","New Mexico"],["Santa Fe","New Mexico"],["Los Ranchos de Albuquerque","New Mexico"]],
  "seattle|wa": [["Seattle","Washington"],["Bellevue","Washington"],["Tacoma","Washington"],["Everett","Washington"],["Renton","Washington"],["Kent","Washington"],["Redmond","Washington"]],
  "tacoma|wa": [["Seattle","Washington"],["Bellevue","Washington"],["Tacoma","Washington"],["Everett","Washington"],["Renton","Washington"],["Kent","Washington"],["Redmond","Washington"]],
  "spokane|wa": [["Spokane","Washington"],["Spokane Valley","Washington"],["Coeur d'Alene","Idaho"],["Liberty Lake","Washington"],["Post Falls","Idaho"]],
  "portland|or": [["Portland","Oregon"],["Beaverton","Oregon"],["Hillsboro","Oregon"],["Gresham","Oregon"],["Vancouver","Washington"],["Lake Oswego","Oregon"]],
  "eugene|or": [["Eugene","Oregon"],["Springfield","Oregon"],["Cottage Grove","Oregon"]],
  "bend|or": [["Bend","Oregon"],["Redmond","Oregon"],["Sisters","Oregon"]],
  "sacramento|ca": [["Sacramento","California"],["Roseville","California"],["Folsom","California"],["Elk Grove","California"],["Citrus Heights","California"],["Rocklin","California"]],
  "san francisco|ca": [["San Francisco","California"],["Oakland","California"],["Daly City","California"],["Berkeley","California"],["San Mateo","California"],["Walnut Creek","California"]],
  "oakland|ca": [["San Francisco","California"],["Oakland","California"],["Daly City","California"],["Berkeley","California"],["San Mateo","California"],["Walnut Creek","California"]],
  "san jose|ca": [["San Jose","California"],["Santa Clara","California"],["Sunnyvale","California"],["Fremont","California"],["Milpitas","California"]],
  "los angeles|ca": [["Los Angeles","California"],["Long Beach","California"],["Glendale","California"],["Pasadena","California"],["Torrance","California"],["Inglewood","California"]],
  "anaheim|ca": [["Anaheim","California"],["Santa Ana","California"],["Irvine","California"],["Fullerton","California"],["Huntington Beach","California"],["Garden Grove","California"]],
  "santa ana|ca": [["Anaheim","California"],["Santa Ana","California"],["Irvine","California"],["Fullerton","California"],["Huntington Beach","California"],["Garden Grove","California"]],
  "san diego|ca": [["San Diego","California"],["Chula Vista","California"],["Oceanside","California"],["Escondido","California"],["Carlsbad","California"],["El Cajon","California"]],
  "riverside|ca": [["Riverside","California"],["Moreno Valley","California"],["Corona","California"],["Temecula","California"],["Murrieta","California"],["San Bernardino","California"]],
  "san bernardino|ca": [["Riverside","California"],["Moreno Valley","California"],["Corona","California"],["Temecula","California"],["Murrieta","California"],["San Bernardino","California"]],
  "fresno|ca": [["Fresno","California"],["Clovis","California"],["Visalia","California"],["Hanford","California"]],
  "bakersfield|ca": [["Bakersfield","California"],["Delano","California"],["Shafter","California"]],
  "reno|nv": [["Reno","Nevada"],["Sparks","Nevada"],["Carson City","Nevada"]],
  "chicago|il": [["Chicago","Illinois"],["Aurora","Illinois"],["Naperville","Illinois"],["Joliet","Illinois"],["Elgin","Illinois"],["Schaumburg","Illinois"],["Evanston","Illinois"]],
  "detroit|mi": [["Detroit","Michigan"],["Warren","Michigan"],["Sterling Heights","Michigan"],["Livonia","Michigan"],["Troy","Michigan"],["Ann Arbor","Michigan"]],
  "minneapolis|mn": [["Minneapolis","Minnesota"],["St. Paul","Minnesota"],["Bloomington","Minnesota"],["Plymouth","Minnesota"],["Maple Grove","Minnesota"],["Eagan","Minnesota"]],
  "st. paul|mn": [["Minneapolis","Minnesota"],["St. Paul","Minnesota"],["Bloomington","Minnesota"],["Plymouth","Minnesota"],["Maple Grove","Minnesota"],["Eagan","Minnesota"]],
  "saint paul|mn": [["Minneapolis","Minnesota"],["St. Paul","Minnesota"],["Bloomington","Minnesota"],["Plymouth","Minnesota"],["Maple Grove","Minnesota"],["Eagan","Minnesota"]],
  "philadelphia|pa": [["Philadelphia","Pennsylvania"],["Allentown","Pennsylvania"],["Bethlehem","Pennsylvania"],["Norristown","Pennsylvania"],["Camden","New Jersey"],["Wilmington","Delaware"]],
  "boston|ma": [["Boston","Massachusetts"],["Cambridge","Massachusetts"],["Worcester","Massachusetts"],["Lowell","Massachusetts"],["Quincy","Massachusetts"],["Newton","Massachusetts"]],
  "baltimore|md": [["Baltimore","Maryland"],["Columbia","Maryland"],["Towson","Maryland"],["Annapolis","Maryland"],["Glen Burnie","Maryland"]],
  "washington|dc": [["Washington","District of Columbia"],["Arlington","Virginia"],["Alexandria","Virginia"],["Bethesda","Maryland"],["Silver Spring","Maryland"],["Rockville","Maryland"]],
  "new york|ny": [["New York","New York"],["Brooklyn","New York"],["Queens","New York"],["Staten Island","New York"],["Newark","New Jersey"],["Jersey City","New Jersey"],["Yonkers","New York"]],
  "hartford|ct": [["Hartford","Connecticut"],["New Haven","Connecticut"],["Stamford","Connecticut"],["Waterbury","Connecticut"],["Bridgeport","Connecticut"]],
  "providence|ri": [["Providence","Rhode Island"],["Warwick","Rhode Island"],["Cranston","Rhode Island"],["Pawtucket","Rhode Island"],["Fall River","Massachusetts"]],
  "buffalo|ny": [["Buffalo","New York"],["Amherst","New York"],["Cheektowaga","New York"],["Niagara Falls","New York"],["Tonawanda","New York"]],
  "rochester|ny": [["Rochester","New York"],["Greece","New York"],["Henrietta","New York"],["Webster","New York"]],
  "albany|ny": [["Albany","New York"],["Schenectady","New York"],["Troy","New York"],["Saratoga Springs","New York"]],
  "omaha|ne": [["Omaha","Nebraska"],["Bellevue","Nebraska"],["Papillion","Nebraska"],["Council Bluffs","Iowa"],["Fremont","Nebraska"]],
  "lincoln|ne": [["Lincoln","Nebraska"],["Waverly","Nebraska"],["Hickman","Nebraska"]],
  "sioux falls|sd": [["Sioux Falls","South Dakota"],["Brandon","South Dakota"],["Harrisburg","South Dakota"],["Tea","South Dakota"]],
  "rapid city|sd": [["Rapid City","South Dakota"],["Box Elder","South Dakota"],["Spearfish","South Dakota"]],
  "fargo|nd": [["Fargo","North Dakota"],["Moorhead","Minnesota"],["West Fargo","North Dakota"],["Horace","North Dakota"]],
  "billings|mt": [["Billings","Montana"],["Laurel","Montana"],["Lockwood","Montana"]],
  "cheyenne|wy": [["Cheyenne","Wyoming"],["Laramie","Wyoming"]],
  "anchorage|ak": [["Anchorage","Alaska"],["Eagle River","Alaska"],["Wasilla","Alaska"],["Palmer","Alaska"]],
  "honolulu|hi": [["Honolulu","Hawaii"],["Pearl City","Hawaii"],["Kailua","Hawaii"],["Kaneohe","Hawaii"],["Mililani","Hawaii"]],
};

function clusterFor(geo) {
  const key = `${geo.city.toLowerCase()}|${(geo.regionCode || "").toLowerCase()}`;
  if (CLUSTERS[key]) return CLUSTERS[key];
  return [[geo.city, geo.regionName || null]];
}

function areaServedObjects(cluster) {
  return cluster
    .map(([name, state]) =>
      state
        ? `{"@type":"City","name":${JSON.stringify(name)},"containedInPlace":{"@type":"State","name":${JSON.stringify(state)}}}`
        : `{"@type":"City","name":${JSON.stringify(name)}}`
    )
    .join(",");
}

function areaServedNames(cluster) {
  return cluster.map(([name]) => JSON.stringify(name)).join(",");
}

// Replace every "areaServed": [ ... ] array in a JSON text. Object arrays get
// the cluster objects; string arrays (contactPoint) get the cluster names.
function rewriteAreaServed(jsonText, objectsInner, namesInner) {
  let out = jsonText;
  let idx = 0;
  while (true) {
    const k = out.indexOf('"areaServed"', idx);
    if (k < 0) break;
    const b = out.indexOf("[", k);
    if (b < 0) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = b; i < out.length; i++) {
      const ch = out[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end < 0) break;
    const inner = out.slice(b + 1, end).trim();
    const replacement = inner.startsWith("{") ? objectsInner : namesInner;
    out = out.slice(0, b) + "[" + replacement + "]" + out.slice(end + 1);
    idx = b + replacement.length + 2;
  }
  return out;
}

function renderers(geo) {
  const C = geo.city;
  const search = (base) =>
    geo.regionCode
      ? `${base} ${C.toLowerCase()} ${geo.regionCode.toLowerCase()}`
      : null;
  return {
    "edition": () => `${C} roofer edition`,
    "towns-serving": () => `serving the ${C} area`,
    "typical-company": () => `A roofing company in the ${C} area`,
    "city-searches": () => `${C} area searches`,
    "in-city-area": () => `in the ${C} area`,
    "in-city-area-lead": () => ` in the ${C} area`,
    "homeowners": () => `${C} area homeowners`,
    "city-traffic": () => `${C} area traffic`,
    "city-area-roofers": () => `${C} area roofers`,
    "in-city": () => `in ${C}`,
    "in-city-lead": () => ` in ${C}`,
    "a-city-homeowner": () => `a ${C} homeowner`,
    "search-repair": () => search("roof repair"),
    "search-replacement": () => search("roof replacement"),
    "towns-pages": () => `for ${C} and the rest of your service area`,
    "same-towns": () => `the same ${C} area towns`,
    "towns-across": () => `across the ${C} area`,
    "towns-through": () => `through ${C}`,
    "city-prefix": () => `${C} `,
    "faq-company": () => `a typical roofing company in the ${C} area`,
    "closing-numbers": () => `Real ${C} Numbers`,
    "for-city-searches": () => `for ${C} area searches`,
    "h2-in-city": () => ` in ${C}`,
  };
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      return env.ASSETS.fetch(request);
    }
  },
};


const FETCH_TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function json(data, status = 200, extraHeaders) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  return new Response(JSON.stringify(data), { status, headers });
}

function normalizeUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// --- Audit 2.0 security (Phase 3) ---
// SSRF blocklist: the Worker never fetches a private or internal address,
// even when a redirect points there. Checked on the submitted URL and
// again on every redirect hop inside fetchCapped.
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
]);
const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".metadata.google.internal"];

function isPrivateIp(hostname) {
  const v4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 10) return true;                        // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 127) return true;                        // 127.0.0.0/8
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (cloud metadata)
    if (a === 0) return true;                          // 0.0.0.0/8
    return false;
  }
  // IPv6 literals only (a DNS name never contains ":").
  if (hostname.includes(":")) {
    const h = hostname.toLowerCase();
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true; // link-local / ULA
  }
  return false;
}

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((s) => h.endsWith(s))) return true;
  if (isPrivateIp(h)) return true;
  return false;
}

// Returns a normalized public http(s) URL, or null when the URL is
// malformed, the wrong scheme, or a blocked host.
function validateTargetUrl(raw) {
  const u = normalizeUrl(raw);
  if (!u) return null;
  let host;
  try { host = new URL(u).hostname; } catch { return null; }
  if (isBlockedHost(host)) return null;
  return u;
}

// Per-IP daily cap on audit executions (soft cap: held in memory per
// isolate, so a recycled isolate resets the count; the 24-hour result
// cache keeps the real abuse surface small). Env override
// AUDIT_RATE_LIMIT_PER_DAY (default 20) exists so the cap can be
// exercised in local tests. Cache hits never count against the cap.
const AUDIT_RATE_LIMIT = new Map();
function auditRateLimitOk(request, env) {
  const capRaw = env && env.AUDIT_RATE_LIMIT_PER_DAY;
  const cap = Number.isInteger(Number(capRaw)) && Number(capRaw) > 0 ? Number(capRaw) : 20;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const day = new Date().toISOString().slice(0, 10);
  const key = ip + "|" + day;
  const used = AUDIT_RATE_LIMIT.get(key) || 0;
  if (used >= cap) return false;
  AUDIT_RATE_LIMIT.set(key, used + 1);
  return true;
}

// 24-hour result cache, keyed by stage + URL (or by a hash of the stage
// observations for the "score" stage). A cache hit skips the rate limit
// and every upstream call.
function auditCacheRequest(stage, key) {
  return new Request("https://audit-cache.internal/v1/" + stage + "?k=" + encodeURIComponent(key));
}

async function auditCacheGet(cacheReq) {
  try {
    const cached = await caches.default.match(cacheReq);
    if (!cached) return null;
    return await cached.json();
  } catch { return null; }
}

async function auditCachePut(cacheReq, payload) {
  try {
    await caches.default.put(cacheReq, new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" },
    }));
  } catch { /* cache failure never fails the audit */ }
}

function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const OWN_HOSTS = new Set(["csramarketing.com", "www.csramarketing.com"]);

async function fetchCapped(url, env) {
  // Own-host pages come from the Worker's own static assets, not a
  // network subrequest back into the same Worker: the self-fetch path
  // fails on this host (bot challenge / route loop), while outside
  // hosts fetch fine. ASSETS returns the same page a visitor gets.
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (OWN_HOSTS.has(host) && env && env.ASSETS) {
      const res = await env.ASSETS.fetch(new Request(url));
      if (!res.ok) return null;
      const text = await res.text();
      if (text.length > MAX_BODY_BYTES) return null;
      return text;
    }
  } catch {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Redirects are followed by hand (max 5 hops) so every hop is
    // re-checked against the SSRF blocklist before it is fetched.
    let current = url;
    let res = null;
    for (let hops = 0; hops < 5; hops++) {
      const r = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "CSRA-Marketing-Website-Check" },
      });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get("location");
        if (!loc) return null;
        let next;
        try { next = new URL(loc, current).toString(); } catch { return null; }
        if (!validateTargetUrl(next)) return null;
        current = next;
        continue;
      }
      res = r;
      break;
    }
    if (!res) return null;
    if (!res.ok) return null;
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.byteLength; }
    const text = new TextDecoder().decode(merged);
    // A bot-challenge page (200, but not the site) is a failed check,
    // never scored as if it were the site.
    if (isBotChallengePage(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// PageSpeed Insights, one strategy. Returns the parsed result from
// audit-scoring.js (lab metrics, CrUX field data, screenshot pass-through,
// tap-targets, font size), or null when the check fails. A null never
// becomes a zero: the Mobile Speed category reads "Could not check".
// PageSpeed timeout is 60s (raised from 30s, 2026-11-13): a mobile run
// takes ~23s on a good day, so 30s cut it off whenever Google ran slow.
async function fetchPageSpeed(url, strategy, key) {
  try {
    const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
      + "?url=" + encodeURIComponent(url)
      + "&strategy=" + strategy
      + "&category=performance"
      + "&category=accessibility"
      + "&key=" + encodeURIComponent(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    let res;
    try {
      res = await fetch(api, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = parsePageSpeed(data);
    return parsed.ok ? parsed : null;
  } catch {
    return null;
  }
}

async function knowledgeGraphSearch(name, key) {
  try {
    const api = "https://kgsearch.googleapis.com/v1/entities:search"
      + "?query=" + encodeURIComponent(name)
      + "&limit=1&key=" + encodeURIComponent(key);
    const res = await fetch(api);
    if (!res.ok) return null;
    const data = await res.json();
    const items = data?.itemListElement || [];
    if (items.length === 0) return { found: false };
    const r = items[0].result || {};
    const t = r["@type"];
    const type = Array.isArray(t) ? t[t.length - 1] : (typeof t === "string" ? t : null);
    return {
      found: true,
      name: (typeof r.name === "string" && r.name) || null,
      type: type || null,
    };
  } catch {
    return null;
  }
}

// HTML checks live in audit-scoring.js as pageChecks(html, url): the v1
// fields (phoneReady, contactSteps, pageTitle, pageDescription,
// pageHeading) plus every Phase 3 sub-check, each with its evidence.

// Audit lead capture (Kemar, 2026-11-13): every completed audit — the blog
// embed and the dedicated audit page — drops into the CRM as a New Lead with
// the tag "Ran Audit", plus an email notification. The Worker cannot call
// the CRM directly, so it saves each completion to KV; a Muse cron reads new
// entries and upserts them into the CRM + sends the email. A KV failure must
// never break the audit response.
async function recordAuditLead(env, request, body, report) {
  try {
    if (!env.AUDIT_LEADS) return;
    if (!report || typeof report.overall !== "number") return;
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.business || "").trim();
    if (!email || !name) return;
    const categories = {};
    if (Array.isArray(report.categories)) {
      for (const c of report.categories) {
        if (c && typeof c.id === "string" && typeof c.score === "number") categories[c.id] = c.score;
      }
    }
    const mobileLab = report.mobileLab && typeof report.mobileLab === "object"
      ? (({ screenshot, ...rest }) => rest)(report.mobileLab)
      : null;
    const lead = {
      name,
      website: String(body.website || "").trim(),
      email,
      phone: String(body.phone || "").trim(),
      overall: report.overall,
      checkedOfFive: typeof report.checkedOfFive === "number" ? report.checkedOfFive : null,
      categories,
      // Full engine report for the emailed-PDF flow (Kemar, 2026-11-13).
      // mobileLab.screenshot is stripped: base64 image, not needed for the PDF.
      report: {
        overall: report.overall,
        overallBand: report.overallBand || null,
        checkedOfFive: typeof report.checkedOfFive === "number" ? report.checkedOfFive : null,
        categories: Array.isArray(report.categories) ? report.categories : [],
        findings: Array.isArray(report.findings) ? report.findings : [],
        plan: Array.isArray(report.plan) ? report.plan : [],
        mobileLab,
        fieldData: report.fieldData || null,
      },
      crmDone: false,
      notified: false,
      pdfAgencySent: false,
      pdfLeadSent: false,
      pdfSentAt: null,
      source: request.headers.get("referer") || "",
      submittedAt: new Date().toISOString(),
      visitor_id: String(body.visitor_id || ""),
      email_token: String(body.email_token || ""),
      meta_fbp: String(body.meta_fbp || ""),
      // Places API draft (rating, review count, map-pack rank + top 3
      // competitors) for Sam to verify in his hand check before the PDF.
      // Rides on googleListing, which requires the Knowledge Graph stage
      // to have run (it always does live: KG_API_KEY is set).
      places: (report.googleListing && report.googleListing.places) || null,
    };
    const key = "lead:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
    await env.AUDIT_LEADS.put(key, JSON.stringify(lead));
  } catch (e) {
    // Lead capture must never break the audit.
  }
}

// Signed agreements (Kemar, 2026-11-14): the merged proposal pages POST
// each signing here as a second path (the Google Form submit stays).
// The signing is stored in KV; the signed-agreement-sync cron picks it up,
// builds the signed PDF, emails it to the signer + the agency, syncs the
// CRM, and moves the stage to Won. Signing capture must never break the
// sign flow: any failure here returns ok:false and the page carries on.
async function handleSign(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (!env.SIGNED_AGREEMENTS) return json({ ok: false, error: "signing_unavailable" }, 503);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const product = String(body.product || "").trim().toLowerCase();
  const business = String(body.business || "").trim();
  const signer = String(body.signer || "").trim();
  const title = String(body.title || "").trim();
  const date = String(body.date || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const signature = String(body.signature || "").trim();
  if (product !== "website" && product !== "seo") return json({ ok: false, error: "bad_product" }, 400);
  if (!business || !signer || !title || !date || !email || !signature) return json({ ok: false, error: "missing_field" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "bad_email" }, 400);
  const num = (v, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : dflt;
  };
  const signing = {
    product,
    business,
    signer,
    title,
    date,
    email,
    signature,
    price: num(body.price, product === "website" ? 2500 : 1500),
    pages: product === "website" ? num(body.pages, 9) : null,
    term: product === "seo" ? num(body.term, 6) : null,
    revisions: product === "website" ? num(body.revisions, 2) : null,
    billing: String(body.billing || (product === "website" ? "onetime" : "recurring")).trim().toLowerCase(),
    extras: String(body.extras || "").trim(),
    source: String(body.source || request.headers.get("referer") || "").trim(),
    submittedAt: new Date().toISOString(),
    crmDone: false,
    pdfCustomerSent: false,
    pdfAgencySent: false,
    pdfSentAt: null,
  };
  const key = "sign:" + Date.now() + ":" + Math.random().toString(36).slice(2, 8);
  try {
    await env.SIGNED_AGREEMENTS.put(key, JSON.stringify(signing));
  } catch {
    return json({ ok: false, error: "store_failed" }, 500);
  }
  return json({ ok: true, key });
}

async function handleRoofingWebsiteScore(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-body" }, 400);
  }
  // Honeypot (form-helper.js): a filled website_confirm means a bot.
  // Reject before the cache and rate limit are touched.
  if (typeof body.website_confirm === "string" && body.website_confirm.trim() !== "") {
    return json({ error: "spam" }, 400);
  }
  const url = validateTargetUrl(body.website);
  const business = String(body.business || "").trim();
  if (!url || !business) return json({ error: "missing" }, 400);
  const stage = typeof body.stage === "string" ? body.stage : "";

  // Cache first: a hit skips the rate limit and every upstream call.
  // The "score" stage is keyed by a hash of its inputs (the three stage
  // observations); the other stages are keyed by URL.
  const cacheKey = stage === "score"
    ? djb2(JSON.stringify([body.page, body.speed, body.google]))
    : url;
  const cacheReq = auditCacheRequest(stage || "full", cacheKey);
  const cached = await auditCacheGet(cacheReq);
  if (cached) {
    await recordAuditLead(env, request, body, cached);
    return json(cached, 200, { "X-Audit-Cache": "HIT" });
  }
  if (!auditRateLimitOk(request, env)) return json({ error: "rate-limited" }, 429);

  const finish = async (payload) => {
    await auditCachePut(cacheReq, payload);
    return json(payload, 200, { "X-Audit-Cache": "MISS" });
  };

  // Staged runs: each stage fails independently to could-not-check, so
  // one slow or failed stage never blocks the others.
  if (stage === "page") {
    const html = await fetchCapped(url, env);
    if (html === null) return finish({});
    const fields = pageChecks(html, url);
    fields.fetched = true;
    return finish(fields);
  }

  if (stage === "speed") {
    const out = {};
    if (env.PAGESPEED_API_KEY) {
      const [mobile, desktop] = await Promise.all([
        fetchPageSpeed(url, "mobile", env.PAGESPEED_API_KEY),
        fetchPageSpeed(url, "desktop", env.PAGESPEED_API_KEY),
      ]);
      if (mobile) {
        out.mobile = mobile;
        out.speedPhones = mobile.interactiveSec;
        out.slowdowns = mobile.slowdowns.slice(0, 3);
        if (mobile.screenshot) out.phoneScreenshot = mobile.screenshot;
        if (typeof mobile.tapTargetsPass === "boolean") out.tapTargetsPass = mobile.tapTargetsPass;
        if (typeof mobile.fontSizePass === "boolean") out.fontSizePass = mobile.fontSizePass;
      } else {
        out.mobile = { ok: false };
      }
      if (desktop && typeof desktop.interactiveSec === "number") {
        out.speedComputers = desktop.interactiveSec;
        out.desktopSec = desktop.interactiveSec;
      }
    } else {
      out.mobile = { ok: false };
    }
    return finish(out);
  }

  if (stage === "google") {
    const out = {};
    if (env.KG_API_KEY) {
      const kg = await knowledgeGraphSearch(business, env.KG_API_KEY);
      if (kg !== null) {
        out.googleFound = kg.found;
        if (kg.name) out.kgName = kg.name;
        if (kg.type) out.kgType = kg.type;
      }
    }
    // Google Places API (New): star rating, review count, map-pack rank
    // + top 3 competitors, drafted for Sam to verify (Kemar, 2026-11-13).
    // The form's Name field holds the person's name, so the firm name
    // comes from the site's own HTML; the 8s race keeps this stage
    // inside the client's 30s timeout. Uses env.PAGESPEED_API_KEY:
    // the same key/project as PageSpeed, once Kemar enables Places
    // API (New) + billing on it. Fails closed: null means unverified.
    if (env.PAGESPEED_API_KEY) {
      let pageHtml = null;
      try {
        pageHtml = await Promise.race([
          fetchCapped(url, env),
          new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
      } catch { /* name extraction falls back to the typed business */ }
      const places = await fetchPlaces(business, url, pageHtml, env.PAGESPEED_API_KEY, env);
      if (places) out.places = places;
    }
    return finish(out);
  }

  // "score" runs no upstream checks: it scores the three stage
  // observations the client already collected.
  if (stage === "score") {
    const report = scoreReport({
      page: body.page || null,
      speed: body.speed || null,
      google: body.google || null,
    });
    await recordAuditLead(env, request, body, report);
    return finish(report);
  }

  // No stage: the original all-in-one run, now returning the full scored
  // report (plus the raw stage observations for debugging).
  let page = null;
  let speed = null;
  let google = null;
  const html = await fetchCapped(url, env);
  if (html !== null) {
    page = pageChecks(html, url);
    page.fetched = true;
  }

  // Speed: only when the PageSpeed secret exists.
  if (env.PAGESPEED_API_KEY) {
    const [mobile, desktop] = await Promise.all([
      fetchPageSpeed(url, "mobile", env.PAGESPEED_API_KEY),
      fetchPageSpeed(url, "desktop", env.PAGESPEED_API_KEY),
    ]);
    speed = {
      mobile: mobile || { ok: false },
      desktopSec: desktop && typeof desktop.interactiveSec === "number" ? desktop.interactiveSec : null,
    };
  } else {
    speed = { mobile: { ok: false }, desktopSec: null };
  }

  // Google listing: only when the Knowledge Graph secret exists.
  if (env.KG_API_KEY) {
    const kg = await knowledgeGraphSearch(business, env.KG_API_KEY);
    if (kg !== null) {
      google = { googleFound: kg.found };
      if (kg.name) google.kgName = kg.name;
      if (kg.type) google.kgType = kg.type;
    }
  }

  // Google Places API (New): same draft as the google stage, using the
  // homepage HTML already fetched above. Sam verifies before the PDF.
  if (env.PAGESPEED_API_KEY) {
    const places = await fetchPlaces(business, url, html, env.PAGESPEED_API_KEY, env);
    if (places) {
      google = google || {};
      google.places = places;
    }
  }

  const report = scoreReport({ page, speed, google });
  await recordAuditLead(env, request, body, report);
  return finish({ ...report, raw: { page, speed, google } });
}

// ---- Tracker safety net (restored from the pre-2.0 Worker, 2026-11-13) ----
// GA, Meta Pixel (+ 24-month _fbp/_fbc persistence) and visitor-track.js
// are injected into any HTML page missing them. Idempotent.
// Meta Pixel — site-wide 24-month persistence (Kemar, 2026-11-10).
// The pixel snippet is pasted into each HTML file individually and there
// is no shared template, so a new page would silently ship without the
// pixel — and without the 24-month persistence. This edge injection
// closes that gap: it runs on every HTML page the Worker serves.
// The original pixel snippet is never modified in the files.
const PIXEL_ID = "1388103953307209";
const PIXEL_END_MARKER = "<!-- End Meta Pixel Code -->";
const PIXEL_PERSIST_MARKER = "csra_fbp_v1";

const PIXEL_SNIPPET = `  <!-- Meta Pixel Code -->
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('dataProcessingOptions', ['LDU'], 0, 0);
    fbq('init', '1388103953307209');
    fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1388103953307209&ev=PageView&noscript=1" /></noscript>
  <!-- End Meta Pixel Code -->`;

const PIXEL_PERSISTENCE = `<!-- Meta Pixel 24-month persistence — aligns _fbp and _fbc to the full
     24 months (730 days), site-wide — every page, including new pages. The original
     pixel snippet above is untouched; this separate layer stores the
     _fbp and _fbc values in localStorage with a 730-day expiry, rewrites
     the cookies with Max-Age 63072000, restores them from storage if the
     cookies are missing, and builds _fbc from fbclid when it is present.
     Every visit slides the window: the stored expiry and the cookie
     Max-Age are refreshed to the full 24 months. -->
<script>
(function(){
  var PIXEL_TTL_DAYS = 730; /* 24 months */
  var PIXEL_MAX_AGE = 63072000; /* 730 days in seconds */
  var PIXEL_TTL_MS = PIXEL_TTL_DAYS * 24 * 60 * 60 * 1000;
  var FBP_STORE_KEY = 'csra_fbp_v1';
  var FBC_STORE_KEY = 'csra_fbc_v1';
  var now = Date.now();
  function readCookie(name){
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? String(decodeURIComponent(m[1])).slice(0, 500) : '';
    } catch(e){ return ''; }
  }
  function writeCookie(name, value){
    try {
      var secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = name + '=' + encodeURIComponent(value) + '; Max-Age=' + PIXEL_MAX_AGE + '; Path=/; SameSite=Lax' + secure;
    } catch(e){}
  }
  function readStored(key){
    try {
      var raw = window.localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.v && parsed.exp && parsed.exp > Date.now()) {
        return { v: String(parsed.v).slice(0, 500), exp: parsed.exp };
      }
      window.localStorage.removeItem(key);
      return null;
    } catch(e){ return null; }
  }
  function storeValue(key, value){
    try {
      window.localStorage.setItem(key, JSON.stringify({ v: value, exp: Date.now() + PIXEL_TTL_MS }));
    } catch(e){}
  }
  function persist(name, key, value){
    if (!value) return '';
    writeCookie(name, value);
    storeValue(key, value);
    return value;
  }
  function restoreOrRefresh(name, key){
    var cookieValue = readCookie(name);
    if (cookieValue) return persist(name, key, cookieValue);
    var stored = readStored(key);
    if (stored) return persist(name, key, stored.v);
    return '';
  }
  /* _fbc — built from fbclid when the visit carries one, in Meta's
     format fb.1.<timestamp>.<fbclid>. A fresh fbclid wins; otherwise
     the existing cookie or the stored copy is restored / refreshed. */
  var params = new URLSearchParams(window.location.search);
  var fbclid = params.get('fbclid') || '';
  if (fbclid) fbclid = String(fbclid).slice(0, 350);
  var fbc = '';
  if (fbclid) {
    fbc = persist('_fbc', FBC_STORE_KEY, 'fb.1.' + now + '.' + fbclid);
  } else {
    fbc = restoreOrRefresh('_fbc', FBC_STORE_KEY);
  }
  /* _fbp — restore from storage first if the cookie is missing, then
     keep polling briefly: the pixel script loads async and may set
     _fbp after this layer runs. Once _fbp exists, rewrite it with the
     full 24-month Max-Age and store it for 730 days. */
  var fbp = restoreOrRefresh('_fbp', FBP_STORE_KEY);
  if (!fbp) {
    var tries = 0;
    var poll = setInterval(function(){
      tries++;
      fbp = restoreOrRefresh('_fbp', FBP_STORE_KEY);
      if (fbp) {
        window.__fbp = fbp;
        clearInterval(poll);
      } else if (tries >= 40) {
        clearInterval(poll);
      }
    }, 250);
  }
  window.__fbp = fbp;
  window.__fbc = fbc;
})();
</script>`;

// Google Analytics — site-wide automatic (Kemar standing rule, 2026-11-10).
// GA is pasted into each HTML file individually and there is no shared
// template, so a new page would silently ship without it. This edge
// injection closes that gap, the same way injectPixel does for the Meta
// Pixel: every HTML page the Worker serves gets the GA snippet if it
// does not already carry it. The snippet is byte-identical to the one on
// the live homepage. Idempotent: a page that already has the GA ID is
// returned unchanged (no duplicate tag).
const GA_ID = "G-DWV0LCRRJS";
const GA_SNIPPET = `  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-DWV0LCRRJS"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-DWV0LCRRJS');
  </script>`;

function injectGA(html) {
  if (html.includes(GA_ID)) return html;
  const headClose = html.toLowerCase().lastIndexOf("</head>");
  if (headClose === -1) return html;
  return html.slice(0, headClose) + GA_SNIPPET + "\n" + html.slice(headClose);
}

// Custom tracking script — site-wide automatic (Kemar standing rule,
// 2026-11-10). Same gap as GA: visitor-track.js is referenced per page
// (end of body on the live homepage) and a new page would silently ship
// without it. This injects the same script tag before </body> when the
// page does not already load it. Idempotent: a page that already loads
// visitor-track.js is returned unchanged.
const VISITOR_TRACK_TAG = `<script src="/assets/js/visitor-track.js"></script>`;

function injectVisitorTrack(html) {
  if (html.includes("visitor-track.js")) return html;
  const bodyClose = html.toLowerCase().lastIndexOf("</body>");
  if (bodyClose === -1) return html;
  return html.slice(0, bodyClose) + VISITOR_TRACK_TAG + "\n" + html.slice(bodyClose);
}

// Returns the HTML with the pixel persistence layer added, and the pixel
// snippet added too if the page has none. Returns the input unchanged
// when nothing is missing, or when there is no </head> to inject before.
function injectPixel(html) {
  const hasPixel = html.includes(PIXEL_ID);
  const hasPersistence = html.includes(PIXEL_PERSIST_MARKER);
  if (hasPixel && hasPersistence) return html;

  if (!hasPixel) {
    // No pixel at all (today: /roofing-website-score/; any future page
    // created without the snippet): add the snippet and the persistence
    // layer together, just before </head>. The charset meta stays first
    // in <head> — this inserts at the end of head.
    const headClose = html.toLowerCase().lastIndexOf("</head>");
    if (headClose === -1) return html;
    return html.slice(0, headClose) + PIXEL_SNIPPET + "\n" + PIXEL_PERSISTENCE + "\n" + html.slice(headClose);
  }

  // Pixel is present but the persistence layer is not: add it right
  // after the pixel snippet, matching the proposal pages.
  const markerAt = html.indexOf(PIXEL_END_MARKER);
  if (markerAt !== -1) {
    const insertAt = markerAt + PIXEL_END_MARKER.length;
    return html.slice(0, insertAt) + "\n" + PIXEL_PERSISTENCE + html.slice(insertAt);
  }
  const headClose = html.toLowerCase().lastIndexOf("</head>");
  if (headClose === -1) return html;
  return html.slice(0, headClose) + PIXEL_PERSISTENCE + "\n" + html.slice(headClose);
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  // http -> https on the live domains (restored from the pre-2.0 Worker).
  if (url.protocol === "http:" && (url.hostname === "csramarketing.com" || url.hostname === "www.csramarketing.com")) {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = "https:";
    return Response.redirect(httpsUrl.toString(), 301);
  }

  if (path === "/api/roofing-website-score") {
    return handleRoofingWebsiteScore(request, env);
  }

  if (path === "/api/sign") {
    return handleSign(request, env);
  }

  let response = await env.ASSETS.fetch(request);

  // Tracker safety net: inject GA, Meta Pixel (+ 24-month persistence) and
  // visitor-track.js into any HTML page missing them. Idempotent — pages
  // that already carry them are returned unchanged. Non-HTML is untouched.
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const injected = injectPixel(injectVisitorTrack(injectGA(html)));
      if (injected !== html) {
        const headers = new Headers(response.headers);
        headers.delete("content-length");
        response = new Response(injected, { status: response.status, headers });
      }
    }
  } catch (err) {
    // Injection must never break a page: fall through with the original response.
  }

  if (!SPAN_PATHS.has(path) && !SCHEMA_PATHS.has(path) && !CITY_PATHS.has(path)) {
    return response;
  }

  const cf = request.cf || {};

  try {
    const ua = request.headers.get("user-agent") || "";
    if (BOT_RE.test(ua)) return response;

    const city = typeof cf.city === "string" ? cf.city.trim() : "";
    if (!city) return response;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const geo = {
      city,
      regionCode: cf.regionCode || "",
      regionName: cf.region || "",
    };

    const rewriter = new HTMLRewriter();

    if (SPAN_PATHS.has(path)) {
      const R = renderers(geo);
      rewriter.on("[data-geo-slot]", {
        element(el) {
          const slot = el.getAttribute("data-geo-slot");
          const fn = slot ? R[slot] : null;
          if (!fn) return;
          const text = fn();
          if (text === null || text === undefined) return;
          el.setInnerContent(text);
        },
      });

      if (path.includes("lost-revenue-calculator")) {
        const payload = JSON.stringify({
          city,
          region: geo.regionCode,
          homeowners: `${city} area homeowners`,
          inArea: `in the ${city} area`,
        }).replace(/</g, "\\u003c");
        rewriter.on("head", {
          element(el) {
            el.append(`<script>window.__CSRA_GEO__=${payload};</script>`, {
              html: true,
            });
          },
        });
      }
    }

    // Audit 2.0 hero city: inject the visitor's city as same-origin
    // signals only (meta tag + data-visitor-city on <html>). The page's
    // own H1 script reads them and inserts " in [City]"; with no signal
    // (unknown city, rejected value, or any error) the page is served
    // untouched and keeps its original headline. Nothing is stored.
    if (CITY_PATHS.has(path)) {
      const auditCity = sanitizeAuditCity(city);
      if (auditCity) {
        const safeCity = auditCity
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");
        rewriter.on("html", {
          element(el) {
            el.setAttribute("data-visitor-city", safeCity);
          },
        });
        rewriter.on("head", {
          element(el) {
            el.append(`<meta name="visitor-city" content="${safeCity}">`, {
              html: true,
            });
          },
        });
      }
    }

    if (SCHEMA_PATHS.has(path)) {
      const cluster = clusterFor(geo);
      const objectsInner = areaServedObjects(cluster);
      const namesInner = areaServedNames(cluster);
      let schemaBuf = "";
      rewriter.on('script[type="application/ld+json"]', {
        text(chunk) {
          schemaBuf += chunk.text;
          if (chunk.lastInTextNode) {
            const buf = schemaBuf;
            schemaBuf = "";
            if (buf.includes('#business') && buf.includes('"areaServed"')) {
              chunk.replace(rewriteAreaServed(buf, objectsInner, namesInner));
            } else {
              chunk.replace(buf);
            }
          } else {
            chunk.replace("");
          }
        },
      });
    }

    const transformed = rewriter.transform(response);
    transformed.headers.set("Cache-Control", "private, no-store");
    return transformed;
  } catch (err) {
    return response;
  }
}
