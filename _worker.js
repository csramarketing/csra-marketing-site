// CSRA Marketing — location-dynamic copy + schema (Worker, advanced mode).
// NOTE: this site deploys as a Worker with static assets, NOT Pages —
// Pages Functions (functions/) never execute here; _worker.js does.
// Two jobs, both driven by the visitor's location at the edge (request.cf):
//  1. Body copy: swaps the visitor's city into marked spans (data-geo-slot)
//     on /services/ and /tools/lost-revenue-calculator/.
//  2. Schema: rewrites the JSON-LD "areaServed" city cluster on /services/,
//     /contact/ and /about/ to the visitor's metro cluster (starter map
//     below; unmapped cities fall back to the city + its state).
// Pages ship with the home-base (CSRA metro) wording as the default, so:
//   - bots/crawlers, no city known, or any error -> the default page is
//     served untouched (fail-open by design; this must never break the site)
//   - titles, meta descriptions and H1 text are never modified here.

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


const BOT_RE =
  /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|applebot|ia_archiver|crawler|spider|headless/i;

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

// Closed-list slow-down mapping: measured PageSpeed findings ONLY, in
// plain words. Nothing outside this list may appear as a slow-down line.
const SLOWDOWN_MAP = [
  ["render-blocking-resources", "Some files hold up the first paint of the page."],
  ["unused-css-rules", "The page loads styling it does not use."],
  ["unminified-css", "Some styling files are larger than they need to be."],
  ["unminified-javascript", "Some scripts are larger than they need to be."],
  ["uses-optimized-images", "Some images are larger than they need to be."],
  ["uses-responsive-images", "Some images are bigger than the phone screen needs."],
  ["server-response-time", "The server is slow to answer."],
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
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
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "CSRA-Marketing-Website-Check" },
    });
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
    return new TextDecoder().decode(merged);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function pageSpeedSeconds(url, strategy, key) {
  try {
    const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
      + "?url=" + encodeURIComponent(url)
      + "&strategy=" + strategy
      + "&category=performance"
      + "&key=" + encodeURIComponent(key);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(api, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    const data = await res.json();
    const interactive = data?.lighthouseResult?.audits?.interactive;
    const ms = interactive?.numericValue;
    if (typeof ms !== "number") return null;
    const audits = data.lighthouseResult.audits || {};
    const slowdowns = [];
    for (const [id, line] of SLOWDOWN_MAP) {
      const a = audits[id];
      if (a && typeof a.score === "number" && a.score < 0.9) slowdowns.push(line);
    }
    const out = { seconds: Math.round((ms / 1000) * 10) / 10, slowdowns };
    // Phone screenshot: the mobile test's own screenshot of the top of
    // the page. Pass-through only, never stored. Dropped when absent,
    // not a JPEG data string, or oversized, so no empty frame can ship.
    const shot = audits["final-screenshot"]?.details?.data;
    if (typeof shot === "string" && shot.startsWith("data:image/jpeg;base64,") && shot.length <= 1500000) {
      out.screenshot = shot;
    }
    const tap = audits["tap-targets"];
    if (tap && typeof tap.score === "number") out.tapTargetsPass = tap.score === 1;
    const font = audits["font-size"];
    if (font && typeof font.score === "number") out.fontSizePass = font.score === 1;
    return out;
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

function pageFields(html) {
  const out = {};
  // Phone view: viewport meta tag present (quoted or unquoted value).
  out.phoneReady = /<meta[^>]+name=["']?viewport["'\s>\/=]/i.test(html);
  if (!out.phoneReady) out.phoneIssues = ["the page is not set up to fit a phone screen"];

  // Contact path: tap-to-call, email link, or a contact form/link.
  const hasTel = /href=["']?tel:/i.test(html);
  const hasMailto = /href=["']?mailto:/i.test(html);
  const hasForm = /<form/i.test(html);
  const hasContactLink = /href=["']?[^"'\s>]*contact/i.test(html);
  out.contactFound = hasTel || hasMailto || hasForm || hasContactLink;
  if (!out.contactFound) out.contactMissing = "a tap-to-call button, an email link, or a contact form";
  out.contactSteps = { call: hasTel, email: hasMailto, form: hasForm || hasContactLink };

  // Search basics: title, description, main heading, from the same page.
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  out.pageTitle = !!(titleMatch && titleMatch[1].trim());
  let descriptionFound = false;
  const metaTags = html.match(/<meta[^>]*>/gi) || [];
  for (const tag of metaTags) {
    if (/name=["']?description["'\s>\/=]/i.test(tag)) {
      const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const value = content ? (content[1] ?? content[2] ?? content[3] ?? "") : "";
      if (value.trim()) descriptionFound = true;
    }
  }
  out.pageDescription = descriptionFound;
  out.pageHeading = /<h1[\s>]/i.test(html);
  return out;
}

async function handleRoofingWebsiteScore(request, env) {
  if (request.method !== "POST") return json({ error: "method" }, 405);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad-body" }, 400);
  }
  const url = normalizeUrl(body.website);
  const business = String(body.business || "").trim();
  if (!url || !business) return json({ error: "missing" }, 400);
  const stage = typeof body.stage === "string" ? body.stage : "";

  // Staged runs: each stage fails independently to could-not-check, so
  // one slow or failed stage never blocks the others.
  if (stage === "page") {
    const html = await fetchCapped(url, env);
    if (html === null) return json({});
    return json(pageFields(html));
  }

  if (stage === "speed") {
    const out = {};
    if (env.PAGESPEED_API_KEY) {
      const [mobile, desktop] = await Promise.all([
        pageSpeedSeconds(url, "mobile", env.PAGESPEED_API_KEY),
        pageSpeedSeconds(url, "desktop", env.PAGESPEED_API_KEY),
      ]);
      if (mobile) {
        out.speedPhones = mobile.seconds;
        out.slowdowns = mobile.slowdowns.slice(0, 3);
        if (mobile.screenshot) out.phoneScreenshot = mobile.screenshot;
        if (typeof mobile.tapTargetsPass === "boolean") out.tapTargetsPass = mobile.tapTargetsPass;
        if (typeof mobile.fontSizePass === "boolean") out.fontSizePass = mobile.fontSizePass;
      }
      if (desktop) out.speedComputers = desktop.seconds;
    }
    return json(out);
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
    return json(out);
  }

  // No stage: the original all-in-one run, kept for safety.
  const out = {};
  const html = await fetchCapped(url, env);
  if (html === null) {
    // Homepage unreachable: every section honestly reports could-not-check.
    return json(out);
  }
  Object.assign(out, pageFields(html));

  // Speed: only when the PageSpeed secret exists.
  if (env.PAGESPEED_API_KEY) {
    const [mobile, desktop] = await Promise.all([
      pageSpeedSeconds(url, "mobile", env.PAGESPEED_API_KEY),
      pageSpeedSeconds(url, "desktop", env.PAGESPEED_API_KEY),
    ]);
    if (mobile) {
      out.speedPhones = mobile.seconds;
      out.slowdowns = mobile.slowdowns.slice(0, 3);
      if (mobile.screenshot) out.phoneScreenshot = mobile.screenshot;
      if (typeof mobile.tapTargetsPass === "boolean") out.tapTargetsPass = mobile.tapTargetsPass;
      if (typeof mobile.fontSizePass === "boolean") out.fontSizePass = mobile.fontSizePass;
    }
    if (desktop) out.speedComputers = desktop.seconds;
  }

  // Google listing: only when the Knowledge Graph secret exists.
  if (env.KG_API_KEY) {
    const kg = await knowledgeGraphSearch(business, env.KG_API_KEY);
    if (kg !== null) {
      out.googleFound = kg.found;
      if (kg.name) out.kgName = kg.name;
      if (kg.type) out.kgType = kg.type;
    }
  }

  return json(out);
}

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

  // Merge http into https: every http request gets a permanent redirect
  // to the same URL on https (same host, path and query). This keeps
  // Google from splitting one page into two versions (http vs https).
  if (url.protocol === "http:") {
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }

  const path = url.pathname;
  if (path === "/api/roofing-website-score") {
    return handleRoofingWebsiteScore(request, env);
  }

  let response = await env.ASSETS.fetch(request);

  // Site-wide three trackers, automatic (Kemar standing rule, 2026-11-10):
  // every HTML page this Worker serves gets the Meta Pixel (24-month
  // persistence), Google Analytics, and the custom visitor-track.js script
  // — and any page missing one gets it added — so a new page, landing page
  // or blog post is covered without any per-page edit. The original
  // snippets in the files are never modified; this only adds to the served
  // HTML. Fail-open: any error serves the page untouched.
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    try {
      const text = await response.text();
      let injected = injectPixel(text);
      injected = injectGA(injected);
      injected = injectVisitorTrack(injected);
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      if (injected !== text) {
        // Content changed: do not let the edge cache a pre-injection copy.
        headers.set("Cache-Control", "private, no-store");
      }
      response = new Response(injected, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      response = await env.ASSETS.fetch(request);
    }
  }

  if (!SPAN_PATHS.has(path) && !SCHEMA_PATHS.has(path)) {
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
