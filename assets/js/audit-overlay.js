/* CSRA Marketing - Audit 2.0 exit-intent / welcome overlay (Kemar, 2026-11-15).
 *
 * The Audit 2.0 hero as a centered modal. Two triggers, same overlay:
 *   Welcome: homepage only, 12 seconds after landing.
 *   Exit intent: any page except the audit page, booking pages and
 *     thank-you pages. Desktop: mouse heads for the top of the page.
 *     Mobile: fast scroll-up, or the back button (one intercepted press
 *     per session, then the back button works normally).
 * Frequency: no 30 day cap. No action (no audit run, no booking) means
 * it shows again on every visit. Close (X, tap outside, Esc) hides it
 * for that session only; it comes back on a later visit. Run the audit
 * or book a call and it never shows again.
 * Location: the headline swaps in the visitor city from the Worker
 * same-origin signal (data-visitor-city / visitor-city meta), exactly
 * like the audit page. No city signal means the plain headline with no
 * city. Augusta is never a fallback.
 * The form submits through the exact same path as the live audit page
 * form: the same four stage POSTs to /api/roofing-website-score, the
 * same visitor summary fields, the same honeypot, the same tracking
 * (GA4 audit_completed, Meta Pixel Lead, 24 month token record).
 * No em dashes or en dashes in any client-facing copy in this file. */

(function () {
  'use strict';

  if (window.__CSRA_OVERLAY_INIT__) return;
  window.__CSRA_OVERLAY_INIT__ = true;

  var LS_CONVERTED = 'csra_overlay_converted';
  var LS_AUDIT_LEAD = 'csra_audit_lead';
  var SS_SHOWN = 'csra_overlay_shown';
  var SS_CLOSED = 'csra_overlay_closed';
  var WELCOME_DELAY_MS = 12000;
  var BOT_RE = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandex|sogou|exabot|facebot|facebookexternalhit|twitterbot|linkedinbot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|applebot|ia_archiver|crawler|spider|headless|phantomjs/i;

  function storeGet(key, store) {
    try { return store.getItem(key); } catch (e) { return null; }
  }
  function storeSet(key, value, store) {
    try { store.setItem(key, value); } catch (e) {}
  }

  function isBot() {
    try {
      if (navigator.webdriver) return true;
      return BOT_RE.test(navigator.userAgent || '');
    } catch (e) { return false; }
  }

  /* Converted: the audit ran (this overlay, or the audit page itself,
   * which writes csra_audit_lead), or a call was booked. Permanent. */
  function isConverted() {
    if (storeGet(LS_CONVERTED, window.localStorage)) return true;
    try {
      var lead = JSON.parse(storeGet(LS_AUDIT_LEAD, window.localStorage) || 'null');
      if (lead && lead.auditedAt) return true;
    } catch (e) {}
    return false;
  }
  function markConverted() {
    storeSet(LS_CONVERTED, new Date().toISOString(), window.localStorage);
  }

  function path() {
    return window.location.pathname || '/';
  }
  function isHomepage() {
    var p = path();
    return p === '/' || p === '/index.html' || p === '';
  }
  function isAuditPage() {
    return path().indexOf('/roofing-website-score') === 0;
  }
  function isExcludedPage() {
    var p = path().toLowerCase();
    if (isAuditPage()) return true;
    if (p.indexOf('thank') !== -1) return true;
    if (p.indexOf('booking') !== -1) return true;
    if (p.indexOf('book-a-call') !== -1) return true;
    if (p.indexOf('/schedule') !== -1) return true;
    return false;
  }

  /* City: same sanitize rules as the audit page H1 script. Returns the
   * title-cased city, or null when no city is confidently known. */
  function sanitizeCity(raw) {
    if (typeof raw !== 'string') return null;
    var city = raw.trim().replace(/\s+/g, ' ');
    if (city.length < 2 || city.length > 60) return null;
    if (/unknown|undefined|null/i.test(city)) return null;
    if (!/^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’.\- ]*$/.test(city)) return null;
    return city.split(' ').map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(' ');
  }
  function getCity() {
    var raw = '';
    try {
      raw = document.documentElement.getAttribute('data-visitor-city') || '';
      if (!raw) {
        var meta = document.querySelector('meta[name="visitor-city"]');
        if (meta) raw = meta.getAttribute('content') || '';
      }
    } catch (e) {}
    return sanitizeCity(raw);
  }

  function canShow() {
    if (isBot()) return false;
    if (isExcludedPage()) return false;
    if (isConverted()) return false;
    if (storeGet(SS_SHOWN, window.sessionStorage)) return false;
    if (storeGet(SS_CLOSED, window.sessionStorage)) return false;
    return true;
  }

  /* ---------- overlay DOM ---------- */

  var backdrop = null;
  var formEl = null;
  var statusEl = null;
  var submitBtn = null;
  var lastFocused = null;
  var shown = false;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function headlineText() {
    var city = getCity();
    if (city) return 'Get your roofing website score in ' + city + ' and find the leaks losing you roofing jobs.';
    return 'Get your roofing website score and find the leaks losing you roofing jobs.';
  }

  function buildOverlay() {
    backdrop = el('div', 'csra-overlay-backdrop');
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Free roofing website audit');

    var card = el('div', 'csra-overlay-card');

    var closeBtn = el('button', 'csra-overlay-close', 'x');
    closeBtn.setAttribute('type', 'button');
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', function () { closeOverlay(); });
    card.appendChild(closeBtn);

    var logo = document.createElement('img');
    logo.className = 'csra-overlay-logo';
    logo.src = '/assets/csra-logo.png';
    logo.alt = 'CSRA Marketing logo';
    card.appendChild(logo);

    card.appendChild(el('p', 'csra-overlay-eyebrow', 'Free audit for roofing companies'));
    card.appendChild(el('h2', 'csra-overlay-h1', headlineText()));
    card.appendChild(el('p', 'csra-overlay-blurb', 'Get the audit that turns website visitors into booked roofing jobs.'));
    card.appendChild(el('p', 'csra-overlay-lead', 'Put in your website. Get your roofing website score in plain words. It checks mobile speed, lead generation, local SEO, trust signals, and accessibility. Measured by Google, not guessed.'));

    formEl = el('form', 'csra-overlay-form');
    formEl.setAttribute('novalidate', 'novalidate');
    var grid = el('div', 'csra-overlay-grid');
    var fields = [
      { id: 'csra-ov-name', name: 'name', label: 'Name', type: 'text', placeholder: 'Your name', auto: 'name' },
      { id: 'csra-ov-website', name: 'website', label: 'Website', type: 'text', placeholder: 'www.yourcompany.com', auto: 'url' },
      { id: 'csra-ov-phone', name: 'phone', label: 'Phone number', type: 'tel', placeholder: '(706) 555-0123', auto: 'tel' },
      { id: 'csra-ov-email', name: 'email', label: 'Email', type: 'email', placeholder: 'you@yourcompany.com', auto: 'email' }
    ];
    fields.forEach(function (f) {
      var wrap = el('div', 'csra-overlay-field');
      var label = el('label', null, f.label);
      label.setAttribute('for', f.id);
      var input = document.createElement('input');
      input.id = f.id;
      input.name = f.name;
      input.type = f.type;
      input.required = true;
      input.placeholder = f.placeholder;
      input.setAttribute('autocomplete', f.auto);
      if (f.type === 'tel') input.setAttribute('inputmode', 'tel');
      if (f.type === 'text' && f.name === 'website') input.setAttribute('inputmode', 'url');
      wrap.appendChild(label);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
    formEl.appendChild(grid);

    /* Honeypot, same field the audit page form-helper adds. A filled
     * value means a bot; the Worker rejects it before anything runs. */
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'website_confirm';
    hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;height:1px;width:1px;';
    hp.tabIndex = -1;
    hp.setAttribute('autocomplete', 'off');
    formEl.appendChild(hp);

    submitBtn = el('button', 'csra-overlay-submit', 'Run my audit');
    submitBtn.setAttribute('type', 'submit');
    formEl.appendChild(submitBtn);
    formEl.appendChild(el('p', 'csra-overlay-under', 'Four fields, all required: name, website, phone number, and email. Your report lands in your inbox within 30 minutes.'));
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      runCheck();
    });
    card.appendChild(formEl);

    statusEl = el('p', 'csra-overlay-status');
    card.appendChild(statusEl);

    card.appendChild(el('p', 'csra-overlay-footer', '© 2026 CSRA Marketing'));

    backdrop.appendChild(card);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeOverlay();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && shown) closeOverlay();
    });
  }

  function showOverlay(trigger) {
    if (shown) return;
    if (!canShow()) return;
    if (!backdrop) buildOverlay();
    /* Refresh the headline at show time, in case the city signal
     * arrived after the page loaded. */
    var h1 = backdrop.querySelector('.csra-overlay-h1');
    if (h1) h1.textContent = headlineText();
    lastFocused = document.activeElement;
    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden';
    shown = true;
    storeSet(SS_SHOWN, '1', window.sessionStorage);
    try {
      var closeBtn = backdrop.querySelector('.csra-overlay-close');
      if (closeBtn) closeBtn.focus();
    } catch (e) {}
    try {
      if (typeof gtag === 'function') gtag('event', 'overlay_shown', { trigger: trigger || '' });
    } catch (e) {}
  }

  function closeOverlay() {
    if (!shown) return;
    shown = false;
    storeSet(SS_CLOSED, '1', window.sessionStorage);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    document.body.style.overflow = '';
    try {
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    } catch (e) {}
  }

  /* ---------- submit: same path as the audit page ---------- */

  function visitorSummary() {
    try {
      if (window.CSRAVisitor && typeof window.CSRAVisitor.getSummary === 'function') {
        return window.CSRAVisitor.getSummary();
      }
    } catch (e) {}
    return null;
  }

  function postStage(stage, payload, timeoutMs, extra) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    var body = { website: payload.website, email: payload.email, business: payload.business, roofer: payload.roofer, stage: stage };
    if (extra) {
      Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
    }
    try {
      var summary = visitorSummary();
      if (summary) {
        body.visitor_id = summary.visitorId;
        body.visit_count = String(summary.visitCount);
        body.first_visit = summary.firstVisit;
        body.pages_viewed = String(summary.totalPagesViewed);
        body.top_pages = summary.topPages;
        body.funnel_breakdown = summary.funnelBreakdown;
        body.dominant_funnel = summary.dominantFunnel;
        body.time_on_site = summary.totalTimeFormatted;
        body.session_breakdown = summary.sessionBreakdown;
        body.traffic_source = summary.trafficSource || '';
        body.email_token = summary.emailToken || '';
        body.email_src = summary.emailSource || '';
        body.meta_fbp = summary.metaFbp || '';
        body.meta_fbc = summary.metaFbc || '';
        body.meta_fbclid = summary.fbclid || '';
        body.utm_source = summary.utmSource || '';
        body.utm_medium = summary.utmMedium || '';
        body.utm_campaign = summary.utmCampaign || '';
      }
    } catch (e) {}
    try {
      var hp = formEl.querySelector('input[name="website_confirm"]');
      if (hp) body.website_confirm = hp.value || '';
    } catch (e) {}
    return fetch('/api/roofing-website-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    .then(function (res) {
      clearTimeout(timer);
      if (!res.ok) return { data: null, timedOut: false };
      return res.json().then(function (data) { return { data: data, timedOut: false }; });
    })
    .catch(function (err) {
      clearTimeout(timer);
      return { data: null, timedOut: !!(err && err.name === 'AbortError') };
    });
  }

  /* Completion tracking: same as the audit page. Score only, never
   * name or email into Google. The token + lead record stays in the
   * visitor's own browser for 24 months. */
  function trackCompletion(rep, formData) {
    if (!rep || !rep.checkedOfFive) return;
    try {
      if (typeof gtag === 'function') {
        var params = { categories_checked: rep.checkedOfFive };
        if (typeof rep.overall === 'number') params.value = rep.overall;
        gtag('event', 'audit_completed', params);
      }
    } catch (e) {}
    try {
      if (typeof fbq === 'function') fbq('track', 'Lead');
    } catch (e) {}
    try {
      if (!window.localStorage) return;
      var KEY = 'csra_audit_lead';
      var existing = null;
      try { existing = JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (e) {}
      var now = Date.now();
      var DAY = 24 * 60 * 60 * 1000;
      var firstSeen = now;
      if (existing && typeof existing.firstSeen === 'number' && now - existing.firstSeen < 730 * DAY) {
        firstSeen = existing.firstSeen;
      }
      var token = null;
      try {
        var summary = visitorSummary();
        if (summary && summary.visitorId) token = summary.visitorId;
      } catch (e) {}
      if (!token && existing && existing.token) token = existing.token;
      if (!token) {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') token = window.crypto.randomUUID();
        else token = 'audit-' + now + '-' + Math.floor(Math.random() * 1000000);
      }
      window.localStorage.setItem(KEY, JSON.stringify({
        token: token,
        name: formData.name,
        website: formData.website,
        phone: formData.phone,
        email: formData.email,
        overall: rep.overall,
        checkedOfFive: rep.checkedOfFive,
        auditedAt: new Date().toISOString(),
        firstSeen: firstSeen
      }));
    } catch (e) {}
    markConverted();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function showResult(rep, formData) {
    formEl.style.display = 'none';
    setStatus('');
    var result = el('div', 'csra-overlay-result');
    if (rep && typeof rep.overall === 'number') {
      result.appendChild(el('div', 'csra-overlay-score', String(rep.overall)));
      var band = (rep.overallBand && rep.overallBand.label) ? rep.overallBand.label : '';
      result.appendChild(el('p', 'csra-overlay-band', band ? band + ' out of 100' : 'out of 100'));
      result.appendChild(el('p', null, 'Your full report lands in your inbox within 30 minutes.'));
    } else {
      result.appendChild(el('p', null, 'We could not check your website. Try again.'));
      var retry = el('button', 'csra-overlay-secondary', 'Try again');
      retry.setAttribute('type', 'button');
      retry.addEventListener('click', function () {
        result.parentNode.removeChild(result);
        formEl.style.display = '';
        runCheck();
      });
      result.appendChild(retry);
    }
    var close = el('button', 'csra-overlay-secondary', 'Close');
    close.setAttribute('type', 'button');
    close.addEventListener('click', function () { closeOverlay(); });
    result.appendChild(close);
    backdrop.querySelector('.csra-overlay-card').insertBefore(result, backdrop.querySelector('.csra-overlay-footer'));
  }

  var running = false;
  function runCheck() {
    if (running) return;
    var name = document.getElementById('csra-ov-name').value.trim();
    var website = document.getElementById('csra-ov-website').value.trim();
    var phone = document.getElementById('csra-ov-phone').value.trim();
    var email = document.getElementById('csra-ov-email').value.trim();
    if (!name || !website || !phone || !email) {
      setStatus('All four fields are required.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setStatus('That email does not look right. Check it and try again.');
      return;
    }
    running = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking your site...';

    var payload = { website: website, email: email, business: name, roofer: true };
    var page = {};
    var speed = {};
    var google = {};
    var anyData = false;

    setStatus('Checking your pages...');
    postStage('page', payload, 30000)
    .then(function (r) {
      if (r.data && !r.data.error) { page = r.data; anyData = true; }
      setStatus('Checking mobile speed...');
      return postStage('speed', payload, 75000);
    })
    .then(function (r) {
      if (r.data && !r.data.error) { speed = r.data; anyData = true; }
      setStatus('Checking your Google listing...');
      return postStage('google', payload, 30000);
    })
    .then(function (r) {
      if (r.data && !r.data.error) { google = r.data; anyData = true; }
      setStatus('Scoring your site...');
      var speedForScore = {};
      Object.keys(speed).forEach(function (k) { if (k !== 'phoneScreenshot') speedForScore[k] = speed[k]; });
      return postStage('score', payload, 15000, { page: page, speed: speedForScore, google: google });
    })
    .then(function (r) {
      running = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Run my audit';
      var rep = (r.data && !r.data.error) ? r.data : null;
      if (rep) trackCompletion(rep, { name: name, website: website, phone: phone, email: email });
      showResult(anyData ? rep : null, { name: name, website: website, phone: phone, email: email });
    });
  }

  /* ---------- triggers ---------- */

  /* Welcome: homepage only, 12 seconds after landing. If the tab is
   * hidden when the timer fires, wait until it is visible again. */
  function armWelcome() {
    if (!isHomepage()) return;
    var fired = false;
    function fire() {
      if (fired) return;
      if (document.hidden) {
        document.addEventListener('visibilitychange', function onVis() {
          if (!document.hidden) {
            document.removeEventListener('visibilitychange', onVis);
            fire();
          }
        });
        return;
      }
      fired = true;
      showOverlay('welcome');
    }
    setTimeout(fire, WELCOME_DELAY_MS);
  }

  /* Exit intent, desktop: the mouse heads for the top of the page. */
  function armDesktopExit() {
    var mouseSeen = false;
    document.addEventListener('mousemove', function () { mouseSeen = true; }, { passive: true });
    document.addEventListener('mouseout', function (e) {
      if (!mouseSeen) return;
      if (e.relatedTarget) return;
      if (typeof e.clientY === 'number' && e.clientY <= 0) showOverlay('exit-intent');
    });
  }

  /* Exit intent, mobile: a fast scroll up. A 200px or more upward move
   * inside 400ms, while still below the top of the page. */
  function armMobileExit() {
    var samples = [];
    window.addEventListener('scroll', function () {
      var y = window.scrollY || window.pageYOffset || 0;
      var now = Date.now();
      samples.push({ y: y, t: now });
      while (samples.length && now - samples[0].t > 400) samples.shift();
      var first = samples[0];
      if (!first) return;
      var dt = now - first.t;
      var dy = first.y - y;
      if (dt >= 100 && dt <= 400 && dy > 200 && y > 50) showOverlay('exit-intent');
    }, { passive: true });
  }

  /* Exit intent, mobile: the back button. One intercepted press per
   * session. We push one history entry at load; a back press pops it
   * and shows the overlay instead of leaving. After the overlay has
   * shown or been closed, the back button works normally. */
  function armBackIntent() {
    var coarse = false;
    try {
      coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    } catch (e) {}
    if (!coarse) return;
    try {
      if (!history.state || !history.state.csraOverlay) {
        history.pushState({ csraOverlay: true }, '');
      }
    } catch (e) { return; }
    window.addEventListener('popstate', function () {
      showOverlay('exit-intent-back');
    });
  }

  /* Booking: a call booked through the Cal.com embed posts a message
   * to the parent page. Only messages from a cal.com origin that
   * describe a completed booking count. Clicking a booking link alone
   * is not a booking, so it never marks converted. */
  function armBooking() {
    window.addEventListener('message', function (e) {
      try {
        var origin = String(e.origin || '');
        if (origin.indexOf('cal.com') === -1) return;
        var text = JSON.stringify(e.data || '');
        if (/bookingSuccessful|booking-successful|booking_successful/i.test(text)) {
          markConverted();
        }
      } catch (err) {}
    });
  }

  /* ---------- init ---------- */

  function init() {
    if (isBot()) return;
    if (isExcludedPage()) return;
    if (isConverted()) return;
    armWelcome();
    armDesktopExit();
    armMobileExit();
    armBackIntent();
    armBooking();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
