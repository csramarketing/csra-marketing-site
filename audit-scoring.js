// Roofing Lead Leak Audit 2.0 — scoring engine (Phase 3).
//
// Pure functions only: no fetch, no secrets, no I/O. The Cloudflare
// Worker imports this module; Node can import it directly for tests.
// Scoring methodology is filed in:
//   files/roofing-lead-leak-audit-2.0-phase1-assessment-2026-11-12.md (section 3)
//
// HONESTY RULES (binding, from the assessment):
// - A sub-check that fails to run scores nothing and is labeled
//   "Could not check". It is left OUT of the category math, never zero.
// - A category with no checked sub-checks reads "Could not check".
//   The overall is averaged from the categories that did check, and the
//   report states how many of the five were checked.
// - A finding resting on heuristic evidence is labeled "Needs Manual
//   Review". Sam confirms it before it goes into any outreach.
// - No invented numbers. No lost-lead estimates. No revenue loss claims.
//   No ranking claims. No guaranteed results.
//
// Score bands (Kemar's table, unchanged):
//   0-49 Red Critical | 50-59 Orange Needs Attention | 60-69 Yellow Fair
//   70-79 Teal Good | 80-100 Green Strong
// Colors follow the score, never the category. Every bar carries the
// number and the word label, so nobody relies on color alone.

export const BANDS = [
  { min: 80, label: "Strong", color: "#12805C", css: "band-strong" },
  { min: 70, label: "Good", color: "#0E9384", css: "band-good" },
  { min: 60, label: "Fair", color: "#EAB308", css: "band-fair" },
  { min: 50, label: "Needs Attention", color: "#E8821E", css: "band-attention" },
  { min: 0, label: "Critical", color: "#D92D20", css: "band-critical" },
];

export function bandFor(score) {
  if (typeof score !== "number" || Number.isNaN(score)) return null;
  for (const b of BANDS) if (score >= b.min) return b;
  return BANDS[BANDS.length - 1];
}

export function clamp01(x) {
  if (typeof x !== "number" || Number.isNaN(x)) return null;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// ---------------------------------------------------------------------------
// Web-vitals banding. Thresholds are Google's own good / needs-improvement
// / poor bands: LCP 2.5s / 4.0s, INP 200ms / 500ms, CLS 0.1 / 0.25.
// A "good" reading scores 100, "needs improvement" 60, "poor" 20.
// ---------------------------------------------------------------------------
export function scoreLcp(ms) {
  if (typeof ms !== "number") return null;
  if (ms <= 2500) return 100;
  if (ms <= 4000) return 60;
  return 20;
}

export function scoreInp(ms) {
  if (typeof ms !== "number") return null;
  if (ms <= 200) return 100;
  if (ms <= 500) return 60;
  return 20;
}

export function scoreCls(v) {
  if (typeof v !== "number") return null;
  if (v <= 0.1) return 100;
  if (v <= 0.25) return 60;
  return 20;
}

// ---------------------------------------------------------------------------
// PageSpeed Insights response parsing (mobile or desktop strategy).
// Defensive by design: any missing piece becomes null, never a guess.
// CrUX field data comes from loadingExperience (URL-level) with a fallback
// to originLoadingExperience (site-level). Field values are percentiles.
// ---------------------------------------------------------------------------
const SLOWDOWN_MAP = [
  ["render-blocking-resources", "Some files hold up the first paint of the page."],
  ["unused-css-rules", "The page loads styling it does not use."],
  ["unminified-css", "Some styling files are larger than they need to be."],
  ["unminified-javascript", "Some scripts are larger than they need to be."],
  ["uses-optimized-images", "Some images are larger than they need to be."],
  ["uses-responsive-images", "Some images are bigger than the phone screen needs."],
  ["server-response-time", "The server is slow to answer."],
];

function auditNum(audits, id) {
  const a = audits && audits[id];
  if (!a || typeof a.numericValue !== "number") return null;
  return a.numericValue;
}

function auditScore(audits, id) {
  const a = audits && audits[id];
  if (!a || typeof a.score !== "number") return null;
  return a.score;
}

function cruxMetric(container, id) {
  const m = container && container.metrics && container.metrics[id];
  if (!m || typeof m.percentile !== "number") return null;
  return m.percentile;
}

export function parsePageSpeed(psi) {
  const out = { ok: false };
  const lr = psi && psi.lighthouseResult;
  if (!lr) return out;
  const audits = lr.audits || {};
  const cats = lr.categories || {};

  out.ok = true;
  const perf = cats.performance && typeof cats.performance.score === "number"
    ? Math.round(cats.performance.score * 100) : null;
  const a11y = cats.accessibility && typeof cats.accessibility.score === "number"
    ? Math.round(cats.accessibility.score * 100) : null;
  out.performance = perf;
  out.accessibility = a11y;

  out.lcpMs = auditNum(audits, "largest-contentful-paint");
  out.inpMs = auditNum(audits, "interaction-to-next-paint");
  out.cls = auditNum(audits, "cumulative-layout-shift");
  out.interactiveMs = auditNum(audits, "interactive");
  out.interactiveSec = typeof out.interactiveMs === "number"
    ? Math.round((out.interactiveMs / 1000) * 10) / 10 : null;

  const lcpDisp = audits["largest-contentful-paint"];
  out.lcpDisplay = lcpDisp && typeof lcpDisp.displayValue === "string" ? lcpDisp.displayValue : null;
  const inpDisp = audits["interaction-to-next-paint"];
  out.inpDisplay = inpDisp && typeof inpDisp.displayValue === "string" ? inpDisp.displayValue : null;
  const clsDisp = audits["cumulative-layout-shift"];
  out.clsDisplay = clsDisp && typeof clsDisp.displayValue === "string" ? clsDisp.displayValue : null;

  const slowdowns = [];
  for (const [id, line] of SLOWDOWN_MAP) {
    const s = auditScore(audits, id);
    if (s !== null && s < 0.9) slowdowns.push(line);
  }
  out.slowdowns = slowdowns;

  const shot = audits["final-screenshot"] && audits["final-screenshot"].details;
  const shotData = shot && shot.data;
  if (typeof shotData === "string" && shotData.startsWith("data:image/jpeg;base64,") && shotData.length <= 1500000) {
    out.screenshot = shotData;
  }
  const tap = auditScore(audits, "tap-targets");
  if (tap !== null) out.tapTargetsPass = tap === 1;
  const font = auditScore(audits, "font-size");
  if (font !== null) out.fontSizePass = font === 1;

  const imgScore = auditScore(audits, "uses-optimized-images");
  const respImgScore = auditScore(audits, "uses-responsive-images");
  out.imageScore = imgScore !== null ? imgScore : respImgScore;
  out.renderBlockingScore = auditScore(audits, "render-blocking-resources");

  // CrUX field data: URL-level first, site-level as fallback. Labeled in
  // the report as "real visitors, last 28 days" when present.
  const le = psi.loadingExperience || psi.originLoadingExperience || null;
  const leIsOrigin = !psi.loadingExperience && !!psi.originLoadingExperience;
  const fLcp = cruxMetric(le, "LARGEST_CONTENTFUL_PAINT_MS");
  const fInp = cruxMetric(le, "INTERACTION_TO_NEXT_PAINT");
  const fCls = cruxMetric(le, "CUMULATIVE_LAYOUT_SHIFT");
  out.field = (fLcp !== null || fInp !== null || fCls !== null)
    ? { lcpMs: fLcp, inpMs: fInp, cls: fCls, originLevel: leIsOrigin }
    : null;
  return out;
}

// Bot-challenge detection. A server-side fetch of a site behind a bot
// challenge (Cloudflare "One moment, please..." and friends) returns a
// 200 with the CHALLENGE page, not the site. Scoring that page would
// invent gaps the real site does not have, so the worker treats it as a
// failed fetch ("Could not check") instead. Conservative on purpose:
// it fires only on the challenge markers themselves, never on ordinary
// page text.
export function isBotChallengePage(html) {
  if (typeof html !== "string") return false;
  if (/__cf_chl_|cf-challenge|challenges\.cloudflare\.com|window\._cf_chl_opt/i.test(html)) return true;
  const head = html.slice(0, 8000);
  if (/<title[^>]*>\s*(one moment, please|just a moment|attention required|please verify you are a human|checking your browser)/i.test(head)) return true;
  if (/cloudflare ray id/i.test(head) && /checking your browser|verify you are a human/i.test(head)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// HTML sub-checks (from the Worker's own fetch of the homepage).
// Each check returns { pass: boolean|null, evidence: string, heuristic?: bool }.
// pass === null means the check could not run (excluded from the math).
// "Above the fold" is approximated from the first 4000 characters of the
// body HTML: a phone number or CTA that lives in the header area. That is a
// heuristic, so findings resting on it are flagged Needs Manual Review.
// ---------------------------------------------------------------------------
const PHONE_RE = /(\+?1[\s.()-]?)?(\(?\d{3}\)?[\s.()-])\d{3}[\s.()-]\d{4}/;
// An estimate CTA is an action phrase ("Get a Free Roofing Estimate",
// "Schedule an Estimate", "Free Estimate", "Get a Quote"), not any label
// that happens to contain the word "estimate" — a link named "Estimate
// Follow-Up Email Generator" is a tool, not a button a visitor presses
// to ask for a price.
const ESTIMATE_RE = /(get|request|schedule|book|start)\b[^,;]{0,40}\bestimate|^(free\s+)?(roofing\s+)?estimate(\s+(now|today))?$|free quote|get (a\s+)?quote|request (a\s+)?quote|get pricing/i;
const US_STATES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
  "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
  "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio",
  "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
  "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
  "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
];
const US_STATE_ABBR = [
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
  "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
  "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc",
];

function snippet(text, re, radius = 40) {
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  const start = Math.max(0, m.index - radius);
  const end = Math.min(text.length, m.index + m[0].length + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// Window around a regex match inside a short string (a button or link
// label), so the evidence shows the matching words, not the first 80
// characters of a long label.
function matchWindow(text, re, radius = 40) {
  const m = text.match(re);
  if (!m || m.index === undefined) return text.slice(0, 80);
  const start = Math.max(0, m.index - radius);
  const end = Math.min(text.length, m.index + m[0].length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

export function pageChecks(html, pageUrl) {
  const out = {};
  const bodyIdx = html.search(/<body[\s>]/i);
  const bodyHtml = bodyIdx >= 0 ? html.slice(bodyIdx) : html;
  const headHtml = bodyIdx >= 0 ? html.slice(0, bodyIdx) : "";
  const aboveFold = bodyHtml.slice(0, 4000);
  const text = stripTags(html);
  const host = (() => { try { return new URL(pageUrl).hostname.toLowerCase(); } catch { return ""; } })();

  // --- Phone view: viewport meta tag present (quoted or unquoted value).
  out.phoneReady = /<meta[^>]+name=["']?viewport["'\s>\/=]/i.test(html);
  if (!out.phoneReady) out.phoneIssues = ["the page is not set up to fit a phone screen"];

  // --- Contact path (v1 behavior, kept).
  const hasTel = /href=["']?tel:/i.test(html);
  const hasMailto = /href=["']?mailto:/i.test(html);
  const hasForm = /<form/i.test(html);
  const hasContactLink = /href=["']?[^"'\s>]*contact/i.test(html);
  out.contactFound = hasTel || hasMailto || hasForm || hasContactLink;
  if (!out.contactFound) out.contactMissing = "a tap-to-call button, an email link, or a contact form";
  out.contactSteps = { call: hasTel, email: hasMailto, form: hasForm || hasContactLink };

  // --- Search basics (v1 behavior, kept).
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  out.pageTitle = !!(titleMatch && titleMatch[1].trim());
  out.pageTitleText = titleMatch ? titleMatch[1].trim() : "";
  let descriptionFound = false;
  let descriptionText = "";
  const metaTags = html.match(/<meta[^>]*>/gi) || [];
  for (const tag of metaTags) {
    if (/name=["']?description["'\s>\/=]/i.test(tag)) {
      const content = tag.match(/content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const value = content ? (content[1] ?? content[2] ?? content[3] ?? "") : "";
      if (value.trim()) { descriptionFound = true; descriptionText = value.trim(); }
    }
  }
  out.pageDescription = descriptionFound;
  out.pageDescriptionText = descriptionText;
  out.pageHeading = /<h1[\s>]/i.test(html);

  // --- Lead Generation ---
  const phoneMatch = aboveFold.match(PHONE_RE);
  out.phoneAboveFold = !!phoneMatch;
  out.phoneAboveFoldEvidence = phoneMatch ? "Phone number shown near the top of the page: " + phoneMatch[0] : "No phone number found near the top of the page.";

  // Estimate CTA: anchor or button text. Only short labels count: a
  // call-to-action reads like "Get a Free Roofing Estimate", not a
  // paragraph. A long link that merely mentions estimates (a citation,
  // a statistic) is not a button a visitor can press.
  const ctaTexts = [];
  const linkRe = /<(a|button)[^>]*>([\s\S]*?)<\/\1>/gi;
  let lm;
  while ((lm = linkRe.exec(html)) !== null) {
    const t = stripTags(lm[2]).trim();
    if (t) ctaTexts.push({ text: t, at: lm.index });
  }
  const est = ctaTexts.find((c) => c.text.length <= 80 && ESTIMATE_RE.test(c.text));
  out.estimateCta = !!est;
  out.estimateCtaEvidence = est ? "Button or link reads: \"" + matchWindow(est.text, ESTIMATE_RE) + "\"" : "No estimate request button or link found on the page.";
  const estAbove = est && est.at < bodyIdx + 4000;
  out.estimateCtaAboveFold = !!estAbove;
  out.estimateCtaAboveFoldEvidence = est
    ? (estAbove ? "The estimate button sits near the top of the page." : "The estimate button is further down the page, below the first screen.")
    : "No estimate request button or link found on the page.";

  // Sticky mobile contact button: a sticky/fixed element tied to call/contact.
  const stickyMatch = html.match(/class=["'][^"']*(sticky|fixed)[^"']*["'][^>]*>([\s\S]{0,200}?)(call|contact|phone|estimate)/i)
    || html.match(/(id|class)=["'][^"']*(sticky-call|floating-call|mobile-call|call-now|sticky-contact)[^"']*["']/i);
  out.stickyContact = !!stickyMatch;
  out.stickyContactEvidence = stickyMatch ? "Found a fixed contact element on the page." : "No fixed contact button found on the page.";

  // --- Form quality (first form on the page) ---
  const formMatch = html.match(/<form[\s\S]*?<\/form>/i);
  out.contactForm = hasForm;
  if (formMatch) {
    const formHtml = formMatch[0];
    const fields = formHtml.match(/<(input|select|textarea)[^>]*>/gi) || [];
    const fieldCount = fields.length;
    let labeled = 0;
    for (const f of fields) {
      const typeM = f.match(/type\s*=\s*["']?([a-z]+)/i);
      const type = typeM ? typeM[1].toLowerCase() : "text";
      if (type === "hidden" || type === "submit" || type === "button") continue;
      if (/aria-label\s*=|aria-labelledby\s*=|placeholder\s*=/i.test(f)) { labeled++; continue; }
      const idM = f.match(/id\s*=\s*["']([^"']+)["']/i);
      if (idM && new RegExp("for\\s*=\\s*[\"']" + idM[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']", "i").test(formHtml)) labeled++;
    }
    const counted = fields.filter((f) => {
      const t = (f.match(/type\s*=\s*["']?([a-z]+)/i) || [])[1];
      return t !== "hidden" && t !== "submit" && t !== "button";
    }).length;
    out.formFieldCount = counted;
    out.formLabeledShort = counted > 0 && counted <= 6 && labeled >= counted;
    out.formLabeledShortEvidence = counted === 0
      ? "The form has no fill-in fields."
      : "Form has " + counted + " field" + (counted === 1 ? "" : "s") + ", " + labeled + " labeled.";
  } else {
    out.formFieldCount = 0;
    out.formLabeledShort = false;
    out.formLabeledShortEvidence = "No contact form on the page.";
  }

  // --- Local SEO ---
  const titleText = (out.pageTitleText || "").toLowerCase();
  let titleLocal = false;
  let titleLocalWhy = "";
  if (out.pageTitle) {
    if (US_STATES.some((s) => titleText.includes(s))) { titleLocal = true; titleLocalWhy = "The page title names a state."; }
    else if (new RegExp("\\b(" + US_STATE_ABBR.join("|") + ")\\b").test(titleText)) { titleLocal = true; titleLocalWhy = "The page title names a state."; }
    else if (/serving|near|in [A-Z][a-z]+/.test(out.pageTitleText || "")) { titleLocal = true; titleLocalWhy = "The page title names a service area."; }
    else titleLocalWhy = "The page title does not name a city, state, or service area.";
  } else titleLocalWhy = "No page title found.";
  out.titleLocal = titleLocal;
  out.titleLocalEvidence = out.pageTitle ? "Title: \"" + out.pageTitleText.slice(0, 100) + "\". " + titleLocalWhy : titleLocalWhy;

  const hrefs = [];
  const hrefRe = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
  let hm;
  while ((hm = hrefRe.exec(html)) !== null) hrefs.push(hm[1]);
  const serviceRe = /roof-?(replacement|repair|installation|inspection)|residential-roofing|commercial-roofing|\/services?\b|service-area/i;
  const serviceLinks = hrefs.filter((h) => serviceRe.test(h));
  out.servicePages = serviceLinks.length > 0;
  out.servicePagesEvidence = serviceLinks.length > 0
    ? "Found a service page link: " + serviceLinks[0]
    : "No link to a roofing service page found.";
  const areaMatch = text.match(/serving (the )?[\w\s]{1,40}?(area|region)|service area|areas we serve|proudly serving/i);
  out.serviceAreaText = !!areaMatch;
  out.serviceAreaTextEvidence = areaMatch ? "Page text: \"" + areaMatch[0].slice(0, 100) + "\"" : "No service-area text found on the page.";
  const internalLinks = hrefs.filter((h) => {
    if (/^(#|mailto:|tel:|javascript:)/i.test(h)) return false;
    if (/^https?:\/\//i.test(h)) { try { return new URL(h).hostname.toLowerCase() === host; } catch { return false; } }
    return h.startsWith("/");
  });
  out.internalLinks = internalLinks.length >= 5;
  out.internalLinksEvidence = internalLinks.length + " internal link" + (internalLinks.length === 1 ? "" : "s") + " on the page.";
  const canonMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i);
  const canonHref = canonMatch ? (canonMatch[0].match(/href\s*=\s*["']([^"']+)["']/i) || [])[1] : null;
  out.canonical = !!canonHref;
  out.canonicalEvidence = canonHref ? "Canonical link: " + canonHref : "No canonical link found.";
  const ldMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  let lbType = null;
  for (const s of ldMatch) {
    const t = s.match(/"(LocalBusiness|RoofingContractor|HomeAndConstructionBusiness|ProfessionalService)"/);
    if (t) { lbType = t[1]; break; }
  }
  out.localBusinessSchema = !!lbType;
  out.localBusinessSchemaEvidence = lbType ? "Structured data found: " + lbType + "." : "No LocalBusiness structured data found.";

  // --- Trust Signals (presence only; presence is never proof the claim is true) ---
  const trustSnip = (re) => snippet(text, re);
  // "Google Reviews Guide" is a guide title, not reviews shown on the page.
  out.testimonials = /testimonial|what (our )?customers say|customer reviews?|google reviews(?! guide)|what homeowners say/i.test(text);
  out.testimonialsEvidence = out.testimonials ? "Found on the page: \"" + trustSnip(/testimonial|what (our )?customers say|customer reviews?|google reviews(?! guide)|what homeowners say/i).slice(0, 100) + "\"" : "No testimonials or reviews shown on the page.";
  const ratingMatch = text.match(/\d+(\.\d+)?\s*(out of 5|stars?)|\d+\+?\s*(google )?reviews?|\d\.\d\s*\/\s*5/i);
  out.reviewCountRating = !!ratingMatch;
  out.reviewCountRatingEvidence = ratingMatch ? "Shown on the page: \"" + ratingMatch[0] + "\"" : "No review count or rating shown on the page.";
  out.gallery = /\bgallery\b|recent projects|project showcase|\bview our work\b|\bsee our work\b|\bour portfolio\b|\bproject portfolio\b/i.test(text);
  out.galleryEvidence = out.gallery ? "Found on the page: \"" + trustSnip(/\bgallery\b|recent projects|project showcase|\bview our work\b|\bsee our work\b|\bour portfolio\b|\bproject portfolio\b/i).slice(0, 100) + "\"" : "No project gallery or past-work section found.";
  out.warranty = /warranty|guarantee/i.test(text);
  out.warrantyEvidence = out.warranty ? "Found on the page: \"" + trustSnip(/warranty|guarantee/i).slice(0, 100) + "\"" : "No warranty stated on the page.";
  out.license = /licens(e|ed|ing)|insured|bonded/i.test(text);
  out.licenseEvidence = out.license ? "Found on the page: \"" + trustSnip(/licens(e|ed|ing)|insured|bonded/i).slice(0, 100) + "\"" : "No license or insurance info stated on the page.";
  const addrMatch = text.match(/\d+\s+[A-Z][a-z]+ (St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Ln|Lane|Ct|Court|Way|Hwy|Highway)\b/);
  out.addressContact = !!addrMatch && hasTel;
  out.addressContactEvidence = addrMatch ? "Address shown: \"" + addrMatch[0] + "\"" + (hasTel ? " with a tap-to-call number." : " but no tap-to-call number.") : "No street address shown on the page.";
  out.financing = /financing|payment plan|pay over time|monthly payments/i.test(text);
  out.financingEvidence = out.financing ? "Found on the page: \"" + trustSnip(/financing|payment plan|pay over time|monthly payments/i).slice(0, 100) + "\"" : "No financing mentioned on the page.";

  // --- Accessibility (HTML part; the PageSpeed accessibility score lands in the speed stage) ---
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((t) => /\salt\s*=/i.test(t)).length;
  out.altTotal = imgs.length;
  out.altWithAlt = imgsWithAlt;
  out.altCoverage = imgs.length === 0 ? 100 : Math.round((imgsWithAlt / imgs.length) * 100);
  out.altCoverageEvidence = imgs.length === 0
    ? "No images on the page."
    : imgsWithAlt + " of " + imgs.length + " images carry alt text.";
  // Form labels (quality of what exists; a page with no form has nothing to judge).
  if (formMatch) {
    const formHtml = formMatch[0];
    const fields = (formHtml.match(/<(input|select|textarea)[^>]*>/gi) || []).filter((f) => {
      const t = (f.match(/type\s*=\s*["']?([a-z]+)/i) || [])[1];
      return t !== "hidden" && t !== "submit" && t !== "button";
    });
    let labeled = 0;
    for (const f of fields) {
      if (/aria-label\s*=|aria-labelledby\s*=|placeholder\s*=/i.test(f)) { labeled++; continue; }
      const idM = f.match(/id\s*=\s*["']([^"']+)["']/i);
      if (idM && new RegExp("for\\s*=\\s*[\"']" + idM[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']", "i").test(formHtml)) labeled++;
      else if (/<label[\s\S]*$/.test(formHtml.slice(0, formHtml.indexOf(f)))) {
        // wrapped in a label element: field sits inside <label>...</label>
        const before = formHtml.slice(0, formHtml.indexOf(f));
        const openLabels = (before.match(/<label[\s>]/gi) || []).length;
        const closeLabels = (before.match(/<\/label>/gi) || []).length;
        if (openLabels > closeLabels) labeled++;
      }
    }
    out.formLabels = fields.length === 0 ? null : Math.round((labeled / fields.length) * 100);
    out.formLabelsEvidence = fields.length === 0
      ? "The form has no fill-in fields."
      : labeled + " of " + fields.length + " form fields carry a label.";
  } else {
    out.formLabels = null;
    out.formLabelsEvidence = "No form on the page.";
  }
  const headings = (html.match(/<h([1-6])[\s>]/gi) || []).map((h) => parseInt(h[2], 10));
  const h1Count = headings.filter((h) => h === 1).length;
  let orderOk = h1Count === 1;
  let orderWhy = "";
  if (h1Count === 0) orderWhy = "No main heading (H1) on the page.";
  else if (h1Count > 1) orderWhy = h1Count + " main headings (H1) on the page.";
  else {
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] > headings[i - 1] + 1) {
        orderOk = false;
        orderWhy = "Heading level jumps from H" + headings[i - 1] + " to H" + headings[i] + ".";
        break;
      }
    }
    if (orderOk) orderWhy = "One H1, headings in order.";
  }
  out.headingOrder = orderOk;
  out.headingOrderEvidence = orderWhy;

  return out;
}

// ---------------------------------------------------------------------------
// Finding copy: one entry per sub-check that can produce a finding.
// "improvement" names the type of improvement to expect — never a number.
// ---------------------------------------------------------------------------
const FINDING_COPY = {
  "mobile-perf": { title: "Mobile speed is low", why: "A slow phone load loses visitors before they ever see your work or your number.", fix: "Compress the largest images, remove render-blocking files, and cut scripts the page does not need.", improvement: "Faster load times" },
  "mobile-lcp": { title: "Main content loads slowly on phones", why: "Visitors stare at a blank or half-built page and leave before the main content shows.", fix: "Speed up the largest content on the page, usually the hero image, and load it first.", improvement: "Faster first paint" },
  "mobile-inp": { title: "The page is slow to answer taps", why: "A visitor taps a button and nothing happens right away, so they tap away or leave.", fix: "Cut heavy scripts that run while the page loads so taps answer fast.", improvement: "Faster taps" },
  "mobile-cls": { title: "The page jumps around while it loads", why: "Text and buttons move as the page loads, so visitors tap the wrong thing or lose their place.", fix: "Set fixed sizes for images and banners so nothing shifts after it appears.", improvement: "A steadier page" },
  "mobile-images": { title: "Images are larger than they need to be", why: "Oversized images are the most common reason a roofing page loads slowly on a phone.", fix: "Compress images and serve phone-sized versions to phones.", improvement: "Faster load times" },
  "mobile-render": { title: "Files hold up the first paint", why: "Styling and script files block the page from showing until they finish loading.", fix: "Defer or remove the files that block the first paint.", improvement: "Faster first paint" },
  "lead-tel": { title: "No tap-to-call link", why: "A visitor on a phone cannot call you in one tap, so the job goes to a roofer they can reach.", fix: "Add a tap-to-call phone number on the homepage.", improvement: "More calls" },
  "lead-phone-fold": { title: "Phone number is buried below the first screen", why: "A visitor has to hunt for your number instead of calling from the first screen they see.", fix: "Put the phone number at the top of the page where it is visible on arrival.", improvement: "More calls" },
  "lead-estimate": { title: "No estimate request button", why: "A visitor ready for a price has nothing to press, so they leave to find a roofer with a clear next step.", fix: "Add a clear 'Get a Free Roofing Estimate' button to the homepage.", improvement: "More estimate requests" },
  "lead-estimate-fold": { title: "Estimate button sits below the first screen", why: "A visitor has to scroll to find the way to ask for a price, and many never do.", fix: "Move the estimate button above the fold so it is visible on arrival.", improvement: "More estimate requests" },
  "lead-form": { title: "No contact form", why: "A visitor who would rather type than call has no way to reach you.", fix: "Add a short contact form to the homepage.", improvement: "More inquiries" },
  "lead-form-quality": { title: "Contact form is long or unlabeled", why: "A long form with missing labels makes visitors give up halfway through.", fix: "Cut the form to six fields or fewer and label every field.", improvement: "More completed forms" },
  "lead-sticky": { title: "No fixed contact button on phones", why: "Once a visitor scrolls, the way to call you scrolls away with the top of the page.", fix: "Add a fixed call button that stays visible while visitors scroll on phones.", improvement: "More calls" },
  "seo-title": { title: "Page title does not name your service area", why: "Google leans on the title to know where you work. Without a city or state in it, nearby searches pass you by.", fix: "Put your service and city in the page title, for example 'Roof Replacement in Augusta, GA'.", improvement: "More local visibility" },
  "seo-description": { title: "No page description", why: "The description is the short text Google can show under your listing. Without it, fewer people click.", fix: "Write a short description that names your service and your area.", improvement: "More clicks from search" },
  "seo-heading": { title: "No main heading on the page", why: "The main heading tells Google and visitors what the page is about. Without it, both guess.", fix: "Add one clear H1 that names your roofing service.", improvement: "Clearer pages" },
  "seo-services": { title: "No roofing service pages linked", why: "Without pages for each service, Google has little to show when someone searches for that exact job.", fix: "Add pages for your main services, replacement, repair, inspection, and link them from the homepage.", improvement: "More local visibility" },
  "seo-area": { title: "No service-area text on the page", why: "Google cannot tell which towns you serve if the page never says so.", fix: "Add a short line naming the towns you serve.", improvement: "More local visibility" },
  "seo-links": { title: "Very few internal links", why: "Internal links help Google find your pages and help visitors move from the homepage to the service they need.", fix: "Link the homepage to your service and town pages.", improvement: "More pages found" },
  "seo-canonical": { title: "No canonical link", why: "Without a canonical link, Google can treat copies of a page as separate pages and split their strength.", fix: "Add a canonical link pointing at the page itself.", improvement: "Cleaner search signals" },
  "seo-schema": { title: "No LocalBusiness structured data", why: "Structured data is how Google reads your business name, area, and services directly from the page.", fix: "Add LocalBusiness structured data with your name, area, and phone number.", improvement: "Clearer Google listing" },
  "trust-testimonials": { title: "No testimonials or reviews shown", why: "A visitor with no proof of past work has no reason to trust you over the next roofer.", fix: "Show real customer testimonials or Google reviews on the homepage.", improvement: "More trust" },
  "trust-rating": { title: "No review count or rating shown", why: "A star rating and a review count are the fastest trust signals a visitor reads.", fix: "Show your Google rating and review count on the homepage.", improvement: "More trust" },
  "trust-gallery": { title: "No project gallery", why: "Visitors want to see the roofs you have done before they call.", fix: "Add photos of recent jobs to the homepage.", improvement: "More trust" },
  "trust-warranty": { title: "No warranty stated", why: "A warranty answers the fear of paying twice for the same roof.", fix: "State your workmanship warranty on the homepage.", improvement: "More trust" },
  "trust-license": { title: "No license or insurance info", why: "Homeowners check for a license before they let anyone on their roof.", fix: "State your license number and that you are insured.", improvement: "More trust" },
  "trust-address": { title: "No street address with a call number", why: "A real address plus a working number tells a visitor you are a real local business.", fix: "Show your street address next to your tap-to-call number.", improvement: "More trust" },
  "trust-financing": { title: "No financing mentioned", why: "Roofs are expensive. A visitor who cannot see a way to pay may never call.", fix: "Mention financing or payment plans on the homepage.", improvement: "More inquiries" },
  "a11y-score": { title: "Accessibility issues found", why: "Visitors who rely on screen readers or keyboards cannot use a page that fails basic accessibility checks.", fix: "Fix the flagged accessibility issues: labels, contrast, and names for controls.", improvement: "A page everyone can use" },
  "a11y-alt": { title: "Images missing alt text", why: "A screen reader cannot describe an image with no alt text, so those visitors miss the content.", fix: "Write short alt text for every image that carries meaning.", improvement: "A page everyone can use" },
  "a11y-labels": { title: "Form fields missing labels", why: "A screen reader cannot tell a visitor what to type in an unlabeled field.", fix: "Label every form field.", improvement: "A page everyone can use" },
  "a11y-headings": { title: "Heading order is off", why: "Screen readers use headings to navigate. Skipped levels and extra main headings break that map.", fix: "Use one H1 and keep heading levels in order.", improvement: "A page everyone can use" },
};

// Category definitions: sub-checks, weights (filed), and how each value is
// derived from the stage observations. value: 0-100, or null = could not check.
function mobileSpeedSubchecks(mobile) {
  const ok = !!(mobile && mobile.ok);
  const sc = [];
  const push = (id, weight, value, evidence, heuristic) =>
    sc.push({ id, weight, value, evidence: evidence || "", heuristic: !!heuristic });
  push("mobile-perf", 40,
    ok ? mobile.performance : null,
    ok ? (mobile.performance !== null ? "PageSpeed mobile performance score: " + mobile.performance + "/100." : "PageSpeed performance score unavailable.") : "PageSpeed check unavailable.");
  push("mobile-lcp", 20, ok ? scoreLcp(mobile.lcpMs) : null,
    ok ? (mobile.lcpMs !== null ? "Largest Contentful Paint: " + (mobile.lcpDisplay || (mobile.lcpMs / 1000).toFixed(1) + "s") + " on mobile." : "Largest Contentful Paint unavailable.") : "PageSpeed check unavailable.");
  push("mobile-inp", 10, ok ? scoreInp(mobile.inpMs) : null,
    ok ? (mobile.inpMs !== null ? "Interaction to Next Paint: " + (mobile.inpDisplay || mobile.inpMs + "ms") + " on mobile." : "Interaction to Next Paint unavailable.") : "PageSpeed check unavailable.");
  push("mobile-cls", 10, ok ? scoreCls(mobile.cls) : null,
    ok ? (mobile.cls !== null ? "Cumulative Layout Shift: " + (mobile.clsDisplay || String(mobile.cls)) + " on mobile." : "Cumulative Layout Shift unavailable.") : "PageSpeed check unavailable.");
  push("mobile-images", 10,
    ok ? (mobile.imageScore !== null && mobile.imageScore !== undefined ? Math.round(mobile.imageScore * 100) : null) : null,
    ok ? (mobile.imageScore !== null && mobile.imageScore !== undefined ? "Image optimization score: " + Math.round(mobile.imageScore * 100) + "/100." : "Image optimization check unavailable.") : "PageSpeed check unavailable.");
  push("mobile-render", 10,
    ok ? (mobile.renderBlockingScore !== null && mobile.renderBlockingScore !== undefined ? Math.round(mobile.renderBlockingScore * 100) : null) : null,
    ok ? (mobile.renderBlockingScore !== null && mobile.renderBlockingScore !== undefined ? "Render-blocking score: " + Math.round(mobile.renderBlockingScore * 100) + "/100." : "Render-blocking check unavailable.") : "PageSpeed check unavailable.");
  return sc;
}

function leadGenSubchecks(page) {
  if (!page || page.fetched !== true) return [];
  const sc = [];
  const b = (v) => (v ? 100 : 0);
  sc.push({ id: "lead-tel", weight: 25, value: b(!!page.contactSteps?.call), evidence: page.contactSteps?.call ? "Tap-to-call link found on the homepage." : "No tap-to-call link found on the homepage." });
  sc.push({ id: "lead-phone-fold", weight: 15, value: b(!!page.phoneAboveFold), evidence: page.phoneAboveFoldEvidence || "", heuristic: true });
  sc.push({ id: "lead-estimate", weight: 20, value: b(!!page.estimateCta), evidence: page.estimateCtaEvidence || "" });
  // No estimate button at all means its position cannot be judged: the fold
  // check is not applicable, not a second zero for the same missing button.
  // value null excludes it from the math and from the findings list.
  sc.push({ id: "lead-estimate-fold", weight: 10, value: page.estimateCta ? b(!!page.estimateCtaAboveFold) : null, evidence: page.estimateCta ? (page.estimateCtaAboveFoldEvidence || "") : "No estimate button exists, so its position on the page cannot be checked.", heuristic: true });
  sc.push({ id: "lead-form", weight: 15, value: b(!!page.contactForm), evidence: page.contactForm ? "Contact form found on the homepage." : "No contact form found on the homepage." });
  sc.push({ id: "lead-form-quality", weight: 10, value: b(!!page.formLabeledShort), evidence: page.formLabeledShortEvidence || "" });
  sc.push({ id: "lead-sticky", weight: 5, value: b(!!page.stickyContact), evidence: page.stickyContactEvidence || "" });
  return sc;
}

function localSeoSubchecks(page) {
  if (!page || page.fetched !== true) return [];
  const sc = [];
  const b = (v) => (v ? 100 : 0);
  sc.push({ id: "seo-title", weight: 15, value: b(!!page.titleLocal), evidence: page.titleLocalEvidence || "", heuristic: true });
  sc.push({ id: "seo-description", weight: 10, value: b(!!page.pageDescription), evidence: page.pageDescription ? "Description found: \"" + (page.pageDescriptionText || "").slice(0, 100) + "\"" : "No page description found." });
  sc.push({ id: "seo-heading", weight: 10, value: b(!!page.pageHeading), evidence: page.pageHeading ? "Main heading (H1) found." : "No main heading (H1) found." });
  sc.push({ id: "seo-services", weight: 15, value: b(!!page.servicePages), evidence: page.servicePagesEvidence || "" });
  sc.push({ id: "seo-area", weight: 15, value: b(!!page.serviceAreaText), evidence: page.serviceAreaTextEvidence || "" });
  sc.push({ id: "seo-links", weight: 10, value: b(!!page.internalLinks), evidence: page.internalLinksEvidence || "" });
  sc.push({ id: "seo-canonical", weight: 10, value: b(!!page.canonical), evidence: page.canonicalEvidence || "" });
  sc.push({ id: "seo-schema", weight: 15, value: b(!!page.localBusinessSchema), evidence: page.localBusinessSchemaEvidence || "" });
  return sc;
}

function trustSubchecks(page) {
  if (!page || page.fetched !== true) return [];
  const sc = [];
  const b = (v) => (v ? 100 : 0);
  sc.push({ id: "trust-testimonials", weight: 20, value: b(!!page.testimonials), evidence: page.testimonialsEvidence || "" });
  sc.push({ id: "trust-rating", weight: 10, value: b(!!page.reviewCountRating), evidence: page.reviewCountRatingEvidence || "" });
  sc.push({ id: "trust-gallery", weight: 15, value: b(!!page.gallery), evidence: page.galleryEvidence || "" });
  sc.push({ id: "trust-warranty", weight: 15, value: b(!!page.warranty), evidence: page.warrantyEvidence || "" });
  sc.push({ id: "trust-license", weight: 15, value: b(!!page.license), evidence: page.licenseEvidence || "" });
  sc.push({ id: "trust-address", weight: 15, value: b(!!page.addressContact), evidence: page.addressContactEvidence || "" });
  sc.push({ id: "trust-financing", weight: 10, value: b(!!page.financing), evidence: page.financingEvidence || "" });
  return sc;
}

function accessibilitySubchecks(page, mobile) {
  const sc = [];
  const hasPsi = mobile && mobile.ok;
  sc.push({
    id: "a11y-score", weight: 50,
    value: hasPsi ? mobile.accessibility : null,
    evidence: hasPsi
      ? (mobile.accessibility !== null ? "PageSpeed accessibility score: " + mobile.accessibility + "/100." : "PageSpeed accessibility score unavailable.")
      : "PageSpeed check unavailable.",
  });
  if (page && page.fetched === true) {
    sc.push({ id: "a11y-alt", weight: 20, value: page.altCoverage, evidence: page.altCoverageEvidence || "" });
    sc.push({
      id: "a11y-labels", weight: 15,
      value: page.formLabels,
      evidence: page.formLabelsEvidence || "",
    });
    sc.push({ id: "a11y-headings", weight: 15, value: page.headingOrder ? 100 : 0, evidence: page.headingOrderEvidence || "" });
  }
  return sc;
}

function scoreCategory(subchecks) {
  const checked = subchecks.filter((s) => typeof s.value === "number");
  if (checked.length === 0) return null;
  let earned = 0;
  let possible = 0;
  for (const s of checked) {
    earned += (s.value / 100) * s.weight;
    possible += s.weight;
  }
  return Math.round((earned / possible) * 100);
}

const CATEGORY_LABELS = {
  mobile: "Mobile Speed",
  lead: "Lead Generation",
  local: "Local SEO",
  trust: "Trust Signals",
  a11y: "Accessibility",
};

export function buildCategories(obs) {
  const page = obs.page || null;
  const mobile = obs.speed && obs.speed.mobile ? obs.speed.mobile : null;
  const defs = [
    { id: "mobile", subchecks: mobileSpeedSubchecks(mobile) },
    { id: "lead", subchecks: leadGenSubchecks(page) },
    { id: "local", subchecks: localSeoSubchecks(page) },
    { id: "trust", subchecks: trustSubchecks(page) },
    { id: "a11y", subchecks: accessibilitySubchecks(page, mobile) },
  ];
  const categories = defs.map((d) => {
    const score = scoreCategory(d.subchecks);
    return {
      id: d.id,
      label: CATEGORY_LABELS[d.id],
      score,
      band: score === null ? null : bandFor(score),
      subchecks: d.subchecks,
    };
  });
  const checked = categories.filter((c) => c.score !== null);
  const overall = checked.length === 0
    ? null
    : Math.round(checked.reduce((sum, c) => sum + c.score, 0) / checked.length);
  return { categories, overall, overallBand: overall === null ? null : bandFor(overall), checkedOfFive: checked.length };
}

// Findings: weak sub-checks only (value below 70, i.e. Fair or worse).
// Ranked Critical first, then Needs Attention, then Fair. Mobile Speed and
// Lead Generation gaps rank above equal-band gaps elsewhere, because they
// cost calls first. Then by weight.
// buildAllFindings returns every weak finding in that order. buildFindings
// is the top 3 only, for the report's "top findings" section. The action
// plan draws from ALL findings (buildAllFindings), so the fixes spread
// across the 7, 14, and 30 day windows instead of collapsing into week 1
// when the top 3 all share one category.
const CATEGORY_PRIORITY = { mobile: 0, lead: 1, local: 2, trust: 3, a11y: 4 };

export function buildAllFindings(categories) {
  const weak = [];
  for (const cat of categories) {
    if (cat.score === null) continue;
    for (const s of cat.subchecks) {
      if (typeof s.value !== "number" || s.value >= 70) continue;
      const copy = FINDING_COPY[s.id];
      if (!copy) continue;
      weak.push({
        category: cat.id,
        categoryLabel: cat.label,
        subcheck: s.id,
        score: s.value,
        band: bandFor(s.value),
        title: copy.title,
        detected: s.evidence,
        whyItMatters: copy.why,
        fix: copy.fix,
        expectedImprovement: copy.improvement,
        needsManualReview: !!s.heuristic,
      });
    }
  }
  weak.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const pa = CATEGORY_PRIORITY[a.category] ?? 9;
    const pb = CATEGORY_PRIORITY[b.category] ?? 9;
    if (pa !== pb) return pa - pb;
    return 0;
  });
  return weak;
}

// Top 3 findings only, for the report's "top findings" section.
export function buildFindings(categories) {
  return buildAllFindings(categories).slice(0, 3);
}

// Action plan, from real findings only. Callers pass ALL findings
// (buildAllFindings), so the fixes spread across the 7, 14, and 30 day
// windows in priority order. A window with no findings is left
// out instead of inventing work. No findings at all says so plainly —
// unless nothing was checked at all, in which case it says the checks
// could not run (never "no big gaps" for a check that never happened).
export function buildPlan(findings, checkedOfFive = 5) {
  const groups = [
    { window: "7 days", label: "This week", items: [], note: "Critical usability and lead-conversion gaps." },
    { window: "14 days", label: "Next 14 days", items: [], note: "Mobile performance and technical fixes." },
    { window: "30 days", label: "Next 30 days", items: [], note: "Local SEO, content, trust signals, and conversion tracking." },
  ];
  for (const f of findings) {
    if (f.category === "lead") groups[0].items.push(f);
    else if (f.category === "mobile" && f.score < 50) groups[0].items.push(f);
    else if (f.category === "mobile" || f.category === "a11y") groups[1].items.push(f);
    else groups[2].items.push(f);
  }
  const plan = groups.filter((g) => g.items.length > 0).map((g) => ({
    window: g.window,
    label: g.label,
    note: g.note,
    items: g.items.map((f) => ({ title: f.title, fix: f.fix })),
  }));
  if (plan.length === 0) {
    if (checkedOfFive === 0) {
      return [{ window: "", label: "Checks could not run", note: "", items: [{ title: "The checks could not reach the website.", fix: "Check the website address and try again." }] }];
    }
    return [{ window: "", label: "No big gaps", note: "", items: [{ title: "These checks found no big gaps.", fix: "Book a 30 minute audit call and we will walk through what to watch next." }] }];
  }
  return plan;
}

// Full scored report from the three stage observations.
// google is surfaced as unscored evidence under Local SEO: the Knowledge
// Graph listing tells us Google holds a business panel, but the filed
// Local SEO weights sum to 100 without it, so it does not move the score.
export function scoreReport(obs) {
  const built = buildCategories(obs);
  const findings = buildFindings(built.categories);
  const plan = buildPlan(buildAllFindings(built.categories), built.checkedOfFive);
  const google = obs.google || null;
  const googleListing = google && typeof google.googleFound === "boolean"
    ? {
        found: google.googleFound,
        name: google.kgName || null,
        type: google.kgType || null,
      }
    : null;
  const speed = obs.speed || null;
  return {
    ...built,
    findings,
    plan,
    googleListing,
    fieldData: speed && speed.mobile ? speed.mobile.field || null : null,
    mobileLab: speed && speed.mobile ? {
      lcpMs: speed.mobile.lcpMs ?? null,
      lcpDisplay: speed.mobile.lcpDisplay || null,
      inpMs: speed.mobile.inpMs ?? null,
      inpDisplay: speed.mobile.inpDisplay || null,
      cls: speed.mobile.cls ?? null,
      clsDisplay: speed.mobile.clsDisplay || null,
      interactiveSec: speed.mobile.interactiveSec ?? null,
      desktopSec: speed.desktopSec ?? null,
      screenshot: speed.mobile.screenshot || null,
    } : null,
  };
}
