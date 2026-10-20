/**
 * CSRA Marketing - Visitor Tracking
 *
 * First-party anonymous visitor tracking. No cookies for ad networks,
 * no cross-site tracking. Just: how many times has this person been here,
 * what did they look at, and for how long.
 *
 * When they fill out any form, their history rides along so Kemar sees
 * enriched lead data in his inbox and the Google Sheet.
 */
(function() {
  'use strict';

  var STORAGE_KEY = 'csra_visitor';
  var VISITOR_ID_KEY = 'csra_vid';
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 min

  // --- Funnel stage mapping (URL path -> TOFU/MOFU/BOFU) ---
  // BOFU = ready to buy (audit, contact, quote, pricing)
  // MOFU = evaluating options (comparisons, how-tos, tools, service pages)
  // TOFU = learning (educational blog posts, glossary, guides)
  var FUNNEL_MAP = {
    // BOFU pages
    '/website-audit/': 'BOFU',
    '/contact/': 'BOFU',
    '/quote/': 'BOFU',
    '/roofer/': 'BOFU',
    '/builds/': 'BOFU',
    '/seo-agreement/': 'BOFU',
    '/website-agreement/': 'BOFU',
    // MOFU pages
    '/web-design/': 'MOFU',
    '/local-seo/': 'MOFU',
    '/services/': 'MOFU',
    '/service-areas/': 'MOFU',
    '/learning-hub/': 'MOFU',
    '/tools/lead-cost-comparison/': 'MOFU',
    '/tools/lost-revenue-calculator/': 'MOFU',
    '/tools/estimate-follow-up/': 'MOFU',
    '/tools/gbp-scorecard/': 'MOFU',
    '/tools/roofing-marketing-glossary/': 'TOFU',
    '/guides/roofer-google-reviews/': 'MOFU',
    '/guides/storm-damage-marketing/': 'MOFU',
    '/about/': 'MOFU',
    // Blog posts (by slug)
    '/blog/roofing-website-cost/': 'MOFU',
    '/blog/roofing-seo-cost/': 'MOFU',
    '/blog/angi-vs-own-website-roofing-leads/': 'BOFU',
    '/blog/does-roofing-seo-work/': 'MOFU',
    '/blog/roofing-website-must-haves/': 'MOFU',
    '/blog/roofing-marketing-budget/': 'MOFU',
    '/blog/how-long-does-roofing-seo-take/': 'MOFU',
    '/blog/best-website-platform-for-roofers/': 'MOFU',
    '/blog/google-ads-vs-seo-cost-per-lead/': 'MOFU',
    '/blog/what-is-local-seo-for-roofers/': 'TOFU',
    '/blog/how-google-ranks-roofers-map-pack/': 'MOFU',
    '/blog/roofing-website-speed-costing-leads/': 'MOFU',
    '/blog/google-business-profile-roofers-setup/': 'MOFU',
    '/blog/roofing-website-traffic-no-calls/': 'MOFU',
    '/blog/how-many-roofing-leads-website/': 'MOFU',
    '/blog/roofing-service-area-pages-seo/': 'MOFU',
    '/blog/wix-vs-wordpress-vs-custom-roofing/': 'MOFU',
    '/blog/thumbtack-vs-angi-vs-homeadvisor-roofing/': 'MOFU'
  };

  function getFunnelStage(path) {
    // Exact match first
    if (FUNNEL_MAP[path]) return FUNNEL_MAP[path];
    // Prefix match for sub-pages
    for (var key in FUNNEL_MAP) {
      if (path.indexOf(key) === 0) return FUNNEL_MAP[key];
    }
    // Default by section
    if (path.indexOf('/blog/') === 0) return 'MOFU'; // Most blog posts are MOFU
    if (path.indexOf('/tools/') === 0) return 'MOFU';
    if (path === '/') return 'MOFU'; // Homepage = evaluating
    return 'TOFU'; // Unknown = top of funnel
  }

  // --- Visitor ID (persistent, first-party) ---
  function getVisitorId() {
    var id = null;
    try { id = localStorage.getItem(VISITOR_ID_KEY); } catch (e) {}
    if (!id) {
      id = getCookie(VISITOR_ID_KEY);
    }
    if (!id) {
      id = 'v_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
      try { localStorage.setItem(VISITOR_ID_KEY, id); } catch (e) {}
      setCookie(VISITOR_ID_KEY, id, 365);
    }
    return id;
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[2]) : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = name + '=' + encodeURIComponent(value)
      + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
  }

  // --- Meta / ad attribution bridge ---
  // Reads Meta's own cookies (_fbp browser ID, _fbc click ID) plus
  // first-touch UTM/fbclid params, so the site's own data and the
  // Meta Pixel enrich each other in both directions.
  function readMetaCookies() {
    return {
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc')
    };
  }

  function readQueryParams() {
    var q = {};
    try {
      var s = window.location.search.substring(1).split('&');
      for (var i = 0; i < s.length; i++) {
        if (!s[i]) continue;
        var kv = s[i].split('=');
        q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      }
    } catch (e) {}
    return q;
  }

  function describeTrafficSource(profile) {
    var utm = profile.firstUtm || {};
    if (profile.firstFbclid) {
      var label = 'Meta ad click';
      if (utm.campaign) label += ' — campaign: ' + utm.campaign;
      return label;
    }
    if (profile.emailRef && profile.emailRef.token) {
      return 'Email campaign click (token ' + profile.emailRef.token + ')';
    }
    if (utm.source) {
      return 'UTM: ' + utm.source + '/' + (utm.medium || '-') + (utm.campaign ? ' (' + utm.campaign + ')' : '');
    }
    return 'Direct / organic (no ad click recorded)';
  }

  // --- Identified-visit beacon ---
  // When a visitor lands from one of our own outreach links (cid param),
  // tell the lead backend who showed up — even if they never fill a form.
  var IDENT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxsjD0FBuAOV2sKvgU1_L7RYkvhvJkaNCll5hsvtw5yJK4YcIgq8gYkSHe4VDhRjKvk/exec';

  function sendVisitBeacon(profile) {
    try {
      var payload = new URLSearchParams();
      payload.append('event', 'email_visit');
      payload.append('token', profile.emailRef.token);
      payload.append('src', profile.emailRef.source || 'email');
      payload.append('page', window.location.pathname);
      payload.append('visitor_id', profile.vid);
      payload.append('visit_count', String(profile.visitCount || 1));
      payload.append('pages_viewed', String(profile.pages.length || 1));
      payload.append('landing', profile.firstLanding || window.location.pathname);
      var sent = false;
      if (navigator.sendBeacon) {
        var blob = new Blob([payload.toString()], { type: 'application/x-www-form-urlencoded' });
        sent = navigator.sendBeacon(IDENT_ENDPOINT, blob);
      }
      if (!sent && window.fetch) {
        fetch(IDENT_ENDPOINT, { method: 'POST', mode: 'no-cors', body: payload, keepalive: true }).catch(function() {});
      }
    } catch (e) {}
  }

  // --- Visitor profile ---
  function getProfile() {
    var profile = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) profile = JSON.parse(raw);
    } catch (e) {}
    if (!profile) {
      profile = {
        vid: getVisitorId(),
        firstVisit: new Date().toISOString(),
        visitCount: 0,
        lastVisit: null,
        pages: [],      // {url, title, funnel, ts, timeOnPage}
        sessions: []    // {start, end, pagesViewed, durationSec}
      };
    }
    // Backfill sessions array for profiles created before this feature
    if (!profile.sessions) profile.sessions = [];
    return profile;
  }

  function saveProfile(profile) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (e) {}
  }

  // --- Track this page view ---
  function trackPageView() {
    var profile = getProfile();
    var now = new Date();
    var nowIso = now.toISOString();

    // New visit if last visit was > 30 min ago (or first ever)
    var isNewVisit = !profile.lastVisit ||
      (now - new Date(profile.lastVisit)) > SESSION_TIMEOUT;
    if (isNewVisit) {
      // Close out the previous session
      if (profile.sessions.length > 0) {
        var prevSession = profile.sessions[profile.sessions.length - 1];
        if (!prevSession.end) {
          prevSession.end = profile.lastVisit;
          prevSession.durationSec = Math.round(
            (new Date(prevSession.end) - new Date(prevSession.start)) / 1000
          );
        }
      }
      // Start a new session
      profile.sessions.push({
        start: nowIso,
        end: null,
        pagesViewed: 0,
        durationSec: null
      });
      // Cap sessions at 20 to avoid bloat
      if (profile.sessions.length > 20) {
        profile.sessions = profile.sessions.slice(-20);
      }
      profile.visitCount++;
    }
    profile.lastVisit = nowIso;

    // --- Meta bridge: capture ad attribution (pixel -> site data) ---
    var arrivedWithCid = false;
    try {
      var metaCookies = readMetaCookies();
      profile.meta = profile.meta || {};
      if (metaCookies.fbp) profile.meta.fbp = metaCookies.fbp;
      if (metaCookies.fbc) profile.meta.fbc = metaCookies.fbc;
      // First-touch attribution (landing page + UTM + fbclid)
      var qp = readQueryParams();
      if (qp.cid) {
        arrivedWithCid = true;
        var prevRef = profile.emailRef || {};
        profile.emailRef = {
          token: qp.cid,
          source: qp.src || 'email',
          firstSeen: prevRef.firstSeen || nowIso,
          lastSeen: nowIso
        };
      } else if (profile.emailRef) {
        profile.emailRef.lastSeen = nowIso;
      }
      if (!profile.firstLanding) {
        profile.firstLanding = window.location.pathname;
        profile.firstUtm = {
          source: qp.utm_source || '',
          medium: qp.utm_medium || '',
          campaign: qp.utm_campaign || ''
        };
        if (qp.fbclid) profile.firstFbclid = qp.fbclid;
      }
    } catch (attrErr) {}

    // Record time on previous page
    if (profile.pages.length > 0) {
      var lastPage = profile.pages[profile.pages.length - 1];
      if (!lastPage.timeOnPage && lastPage.url !== window.location.pathname) {
        lastPage.timeOnPage = Math.round((now - new Date(lastPage.ts)) / 1000);
      }
    }

    // Log this page (dedupe rapid reloads of same URL within 10 sec)
    var currentPath = window.location.pathname;
    var lastEntry = profile.pages[profile.pages.length - 1];
    var isReload = lastEntry && lastEntry.url === currentPath &&
      (now - new Date(lastEntry.ts)) < 10000;
    if (!isReload) {
      profile.pages.push({
        url: currentPath,
        title: document.title || currentPath,
        funnel: getFunnelStage(currentPath),
        ts: nowIso,
        timeOnPage: null
      });
      // Cap at 50 pages to avoid bloat
      if (profile.pages.length > 50) {
        profile.pages = profile.pages.slice(-50);
      }
      // Increment current session page count
      if (profile.sessions.length > 0) {
        profile.sessions[profile.sessions.length - 1].pagesViewed++;
      }
    }

    saveProfile(profile);

    // --- Meta bridge: funnel stage feeds the pixel (site data -> Meta) ---
    if (typeof fbq === 'function') {
      try {
        fbq('track', 'ViewContent', {
          content_name: (document.title || window.location.pathname).substring(0, 120),
          content_category: getFunnelStage(window.location.pathname)
        });
        // First BOFU page reached this session = strong retargeting signal
        var sessRec = profile.sessions[profile.sessions.length - 1];
        if (getFunnelStage(window.location.pathname) === 'BOFU' && sessRec && !sessRec.metaBofuFired) {
          fbq('trackCustom', 'BOFUPageView', { page: window.location.pathname });
          sessRec.metaBofuFired = true;
          saveProfile(profile);
        }
      } catch (fbqErr) {}
    }

    // --- Identified visit beacon (outreach link arrival -> lead backend) ---
    if (arrivedWithCid && profile.emailRef) {
      try {
        var todayStr = nowIso.split('T')[0];
        var lb = profile.lastBeacon || {};
        if (lb.date !== todayStr || lb.token !== profile.emailRef.token) {
          profile.lastBeacon = { date: todayStr, token: profile.emailRef.token };
          saveProfile(profile);
          sendVisitBeacon(profile);
        }
      } catch (bcnErr) {}
    }

    // Fire GA4 event if gtag exists
    if (typeof gtag === 'function') {
      gtag('event', 'csra_visit', {
        visit_count: profile.visitCount,
        visitor_id: profile.vid
      });
    }
  }

  // --- Public API: get enriched summary for form submissions ---
  window.CSRAVisitor = {
    getSummary: function() {
      var profile = getProfile();
      var pageCounts = {};
      var funnelCounts = { TOFU: 0, MOFU: 0, BOFU: 0 };
      var totalSeconds = 0;
      profile.pages.forEach(function(p) {
        pageCounts[p.url] = (pageCounts[p.url] || 0) + 1;
        var f = p.funnel || getFunnelStage(p.url);
        if (funnelCounts[f] !== undefined) funnelCounts[f]++;
        if (p.timeOnPage) totalSeconds += p.timeOnPage;
      });
      var topPages = Object.keys(pageCounts)
        .sort(function(a, b) { return pageCounts[b] - pageCounts[a]; })
        .slice(0, 5)
        .map(function(url) { return url + ' (' + pageCounts[url] + 'x)'; });

      // Determine dominant funnel stage
      var dominant = 'TOFU';
      if (funnelCounts.MOFU >= funnelCounts.TOFU && funnelCounts.MOFU >= funnelCounts.BOFU) dominant = 'MOFU';
      if (funnelCounts.BOFU > funnelCounts.MOFU && funnelCounts.BOFU >= funnelCounts.TOFU) dominant = 'BOFU';

      // Format total time as human-readable
      var totalTime = formatDuration(totalSeconds);

      // Per-session breakdown
      var sessionList = (profile.sessions || []).map(function(s, idx) {
        var date = s.start ? s.start.split('T')[0] : 'unknown';
        var dur = s.durationSec ? formatDuration(s.durationSec) : 'in progress';
        return 'Session ' + (idx + 1) + ' (' + date + '): ' + dur + ', ' + (s.pagesViewed || 0) + ' pages';
      }).join('; ');

      // Refresh Meta cookies at summary time (pixel may have set them
      // after the pageview), so form submissions always carry the latest.
      try {
        var liveMeta = readMetaCookies();
        profile.meta = profile.meta || {};
        if (liveMeta.fbp) profile.meta.fbp = liveMeta.fbp;
        if (liveMeta.fbc) profile.meta.fbc = liveMeta.fbc;
      } catch (e) {}

      return {
        visitorId: profile.vid,
        visitCount: profile.visitCount,
        firstVisit: profile.firstVisit,
        lastVisit: profile.lastVisit,
        totalPagesViewed: profile.pages.length,
        topPages: topPages.join('; '),
        funnelBreakdown: 'TOFU:' + funnelCounts.TOFU + ' MOFU:' + funnelCounts.MOFU + ' BOFU:' + funnelCounts.BOFU,
        dominantFunnel: dominant,
        totalTimeSeconds: totalSeconds,
        totalTimeFormatted: totalTime,
        sessionBreakdown: sessionList,
        trafficSource: describeTrafficSource(profile),
        emailToken: (profile.emailRef && profile.emailRef.token) || '',
        emailSource: (profile.emailRef && profile.emailRef.source) || '',
        metaFbp: (profile.meta && profile.meta.fbp) || '',
        metaFbc: (profile.meta && profile.meta.fbc) || '',
        fbclid: profile.firstFbclid || '',
        utmSource: (profile.firstUtm && profile.firstUtm.source) || '',
        utmMedium: (profile.firstUtm && profile.firstUtm.medium) || '',
        utmCampaign: (profile.firstUtm && profile.firstUtm.campaign) || ''
      };
    },

    getSummaryString: function() {
      var s = this.getSummary();
      return 'Visits: ' + s.visitCount
        + ' | First: ' + s.firstVisit.split('T')[0]
        + ' | Pages viewed: ' + s.totalPagesViewed
        + ' | Time on site: ' + s.totalTimeFormatted
        + ' | Funnel: ' + s.funnelBreakdown + ' (' + s.dominantFunnel + ')'
        + ' | Sessions: ' + s.sessionBreakdown
        + ' | Top: ' + s.topPages;
    }
  };

  function formatDuration(seconds) {
    if (seconds < 60) return seconds + 's';
    var mins = Math.floor(seconds / 60);
    if (mins < 60) return mins + 'm ' + (seconds % 60) + 's';
    var hours = Math.floor(mins / 60);
    return hours + 'h ' + (mins % 60) + 'm';
  }

  // Track on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }

  // Record time on page when leaving (and update current session)
  window.addEventListener('beforeunload', function() {
    var profile = getProfile();
    if (profile.pages.length > 0) {
      var lastPage = profile.pages[profile.pages.length - 1];
      if (!lastPage.timeOnPage) {
        lastPage.timeOnPage = Math.round(
          (new Date() - new Date(lastPage.ts)) / 1000
        );
      }
    }
    // Update current session end time
    if (profile.sessions.length > 0) {
      var curr = profile.sessions[profile.sessions.length - 1];
      var nowIso = new Date().toISOString();
      curr.end = nowIso;
      curr.durationSec = Math.round(
        (new Date(nowIso) - new Date(curr.start)) / 1000
      );
    }
    saveProfile(profile);
  });
})();
