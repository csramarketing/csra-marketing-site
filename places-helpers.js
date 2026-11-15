// Google Places API (New) for the Roofing Website Score audit.
// Kemar approved the build 2026-11-13 (voice call).
//
// Purpose: pull the firm's Google star rating, review count, and map-pack
// rank automatically. Today Sam does this by hand in the 30-minute window.
// The API does the hunting; Sam stays the verifier, so the audit still
// reads like a human expert checked it.
//
// Design rules (standing):
// - Places API (New), Text Search only. No Place Details call is needed:
//   Text Search already returns websiteUri, rating, userRatingCount,
//   formattedAddress and addressComponents.
// - Rating + review count + website are Enterprise fields: 1,000 free
//   Enterprise requests/month, then $35/1,000. Two Text Search calls per
//   audit at most (firm search + competitor search), so the free cap
//   covers ~500 audits/month. A KV counter caps usage at 900/month.
// - A Google Cloud billing account with a card on file is REQUIRED even
//   at $0 usage (the old $200 credit ended Mar 2025). The same API key
//   as PageSpeed is used (env.PAGESPEED_API_KEY): one key, one project.
//   Until Kemar enables Places API (New) + billing on that project,
//   every call fails closed and fetchPlaces returns null.
// - The form's Name field holds the PERSON's name, not the firm name, so
//   the firm name is extracted from the audited site's own HTML
//   (JSON-LD business name, og:site_name, title, H1), with the typed
//   business value as a fallback query. Identity is proven by DOMAIN
//   MATCH: the place's websiteUri host must equal the audited site's
//   host. No domain match means unverified, never a guess.
// - Accuracy rule (standing): no result is never proof the firm has no
//   profile. fetchPlaces returns null on any failure or no match, and
//   the PDF keeps the "not yet verified by hand check" wording.
// - The API returns at most 20 places per Text Search, so a firm absent
//   from the competitor search is "not in the first 20 results", not
//   "not ranked at all". That distinction rides in mapsTruncated, and
//   only Sam's hand check can say "not ranked".
// - The Places star breakdown (5/4/3/2/1 counts) is not available from
//   the API, so the PDF renders average + total only for API numbers.

export const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
export const PLACES_MONTHLY_ENTERPRISE_CAP = 900;
export const PLACES_REQUEST_TIMEOUT_MS = 8000;

const FIRM_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.types",
].join(",");

const COMP_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
].join(",");

// ---- Pure helpers (unit-tested, no I/O) ----

export function normalizeHost(host) {
  return String(host || "").trim().toLowerCase().replace(/^www\./, "");
}

export function hostOf(url) {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return "";
  }
}

export function slugifyName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A place matches the audited site only when its listed website is the
// same host (www-insensitive). This is the identity check: a same-name
// firm in another city must never inherit this firm's rating.
export function placeMatchesSite(place, siteUrl) {
  const siteHost = hostOf(siteUrl);
  if (!siteHost) return false;
  const site = place && typeof place.websiteUri === "string" ? hostOf(place.websiteUri) : "";
  return site !== "" && site === siteHost;
}

export function pickPlace(places, siteUrl) {
  const list = Array.isArray(places) ? places : [];
  for (const p of list) {
    if (placeMatchesSite(p, siteUrl)) return p;
  }
  return null;
}

export function cityStateFromComponents(components) {
  let city = "";
  let state = "";
  for (const c of Array.isArray(components) ? components : []) {
    const types = Array.isArray(c.types) ? c.types : [];
    if (!city && types.includes("locality")) city = c.longText || "";
    if (!state && types.includes("administrative_area_level_1")) state = c.shortText || c.longText || "";
  }
  return { city: String(city || "").trim(), state: String(state || "").trim() };
}

// Extract firm-name candidates from the audited site's own HTML, best
// first: JSON-LD business name, og:site_name, <title> before its
// separator, first H1. Generic words never count as a firm name.
export function firmNameCandidates(html) {
  const text = String(html || "");
  const out = [];
  const push = (v) => {
    const s = String(v || "").replace(/\s+/g, " ").trim();
    if (s.length < 3 || s.length > 80) return;
    if (/^(home|welcome|roofing|roofers|roof repair|contact|about)$/i.test(s)) return;
    if (!/[a-z]/i.test(s)) return;
    if (!out.includes(s)) out.push(s);
  };
  // JSON-LD blocks: the business name inside a LocalBusiness /
  // Organization / RoofingContractor object.
  const ldBlocks = text.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const block of ldBlocks) {
    const inner = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    let parsed = null;
    try { parsed = JSON.parse(inner); } catch { parsed = null; }
    const objs = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    for (const o of objs) {
      if (o && typeof o === "object" && typeof o.name === "string") push(o.name);
      if (o && typeof o === "object" && Array.isArray(o["@graph"])) {
        for (const g of o["@graph"]) {
          if (g && typeof g === "object" && typeof g.name === "string") push(g.name);
        }
      }
    }
  }
  // og:site_name.
  const og = text.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)
    || text.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
  if (og) push(og[1]);
  // <title> before its separator.
  // <title> before its separator. Separators are built from char codes
  // (en dash 8211, em dash 8212) so no dash characters sit in source.
  const titleSep = new RegExp("[|" + String.fromCharCode(8211, 8212) + "\\-:]");
  const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const before = title[1].split(titleSep)[0].trim();
    push(before);
  }
  // First H1.
  const h1 = text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) push(h1[1].replace(/<[^>]+>/g, "").trim());
  return out;
}

// ---- Places API calls ----

async function searchPlacesText(query, fieldMask, key, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.places) ? data.places : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Monthly Enterprise usage counter in KV (visible via wrangler kv key get).
// Key: places-usage:YYYY-MM, value: { enterprise: n, updatedAt }.
// Failing open: when KV is unavailable the cap cannot be enforced, so the
// calls still run; the 24-hour stage cache is the primary repeat guard.
export function placesUsageKey(now) {
  const d = now instanceof Date ? now : new Date();
  return "places-usage:" + d.toISOString().slice(0, 7);
}

export async function placesUsageCount(env, now) {
  try {
    if (!env || !env.AUDIT_LEADS) return 0;
    const raw = await env.AUDIT_LEADS.get(placesUsageKey(now));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed.enterprise === "number" ? parsed.enterprise : 0;
  } catch {
    return 0;
  }
}

async function placesUsageBump(env, now, by) {
  try {
    if (!env || !env.AUDIT_LEADS) return;
    const key = placesUsageKey(now);
    const current = await placesUsageCount(env, now);
    await env.AUDIT_LEADS.put(key, JSON.stringify({
      enterprise: current + by,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Usage counting must never break the audit.
  }
}

function numOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function intOrNull(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

// Main entry: returns the places object (see header) or null when the
// firm cannot be verified. Never throws. `html` is the audited homepage
// HTML when the caller already has it (full run); otherwise the firm
// name falls back to the typed business value.
export async function fetchPlaces(business, siteUrl, html, key, env) {
  try {
    if (!key || !siteUrl) return null;
    const now = new Date();
    const used = await placesUsageCount(env, now);
    if (used >= PLACES_MONTHLY_ENTERPRISE_CAP) return null;

    const queries = [];
    for (const c of firmNameCandidates(html)) queries.push(c);
    const typed = String(business || "").trim();
    if (typed && !queries.includes(typed)) queries.push(typed);
    if (queries.length === 0) return null;

    let firm = null;
    let usedCalls = 0;
    for (const q of queries.slice(0, 2)) {
      const places = await searchPlacesText(q, FIRM_FIELD_MASK, key, PLACES_REQUEST_TIMEOUT_MS);
      usedCalls += 1;
      if (!places) continue;
      firm = pickPlace(places, siteUrl);
      if (firm) break;
    }
    if (!firm) {
      await placesUsageBump(env, now, usedCalls);
      return null;
    }

    const { city, state } = cityStateFromComponents(firm.addressComponents || []);
    const name = (firm.displayName && firm.displayName.text) || "";
    const rating = numOrNull(firm.rating);
    const reviews = intOrNull(firm.userRatingCount);
    const out = {
      found: true,
      source: "places-api",
      placeId: typeof firm.id === "string" ? firm.id : null,
      name: name || null,
      rating,
      reviews,
      website: typeof firm.websiteUri === "string" ? firm.websiteUri : null,
      address: typeof firm.formattedAddress === "string" ? firm.formattedAddress : null,
      city: city || null,
      state: state || null,
      mapsQuery: city ? "roofers in " + city + (state ? ", " + state : "") : null,
      mapsRank: null,
      mapsAppears: false,
      mapsTruncated: false,
      competitors: [],
      fetchedAt: now.toISOString(),
    };

    // Map-pack rank + top 3 competitors: the same "roofers in <city>"
    // search a homeowner runs. The firm's 1-based position in the
    // returned list is its rank; absent from the first 20 means
    // mapsTruncated, never "not ranked at all".
    if (city) {
      const compPlaces = await searchPlacesText(out.mapsQuery, COMP_FIELD_MASK, key, PLACES_REQUEST_TIMEOUT_MS);
      usedCalls += 1;
      if (compPlaces) {
        const firmIdx = compPlaces.findIndex((p) => p.id === firm.id);
        if (firmIdx >= 0) {
          out.mapsRank = firmIdx + 1;
          out.mapsAppears = true;
        } else {
          out.mapsRank = null;
          out.mapsAppears = false;
          out.mapsTruncated = true;
        }
        out.competitors = compPlaces
          .filter((p) => p.id !== firm.id)
          .slice(0, 3)
          .map((p) => ({
            name: (p.displayName && p.displayName.text) || "",
            rating: numOrNull(p.rating),
            reviews: intOrNull(p.userRatingCount),
          }))
          .filter((c) => c.name !== "" && c.rating !== null && c.reviews !== null);
      }
    }
    await placesUsageBump(env, now, usedCalls);
    return out;
  } catch {
    return null;
  }
}
