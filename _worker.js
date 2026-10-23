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


async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (!SPAN_PATHS.has(path) && !SCHEMA_PATHS.has(path)) {
    return env.ASSETS.fetch(request);
  }

  const response = await env.ASSETS.fetch(request);
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
