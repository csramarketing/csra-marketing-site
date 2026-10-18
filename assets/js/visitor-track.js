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
        pages: []  // {url, title, ts, timeOnPage}
      };
    }
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
      profile.visitCount++;
    }
    profile.lastVisit = nowIso;

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
        ts: nowIso,
        timeOnPage: null
      });
      // Cap at 50 pages to avoid bloat
      if (profile.pages.length > 50) {
        profile.pages = profile.pages.slice(-50);
      }
    }

    saveProfile(profile);

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
      profile.pages.forEach(function(p) {
        pageCounts[p.url] = (pageCounts[p.url] || 0) + 1;
      });
      var topPages = Object.keys(pageCounts)
        .sort(function(a, b) { return pageCounts[b] - pageCounts[a]; })
        .slice(0, 5)
        .map(function(url) { return url + ' (' + pageCounts[url] + 'x)'; });

      return {
        visitorId: profile.vid,
        visitCount: profile.visitCount,
        firstVisit: profile.firstVisit,
        lastVisit: profile.lastVisit,
        totalPagesViewed: profile.pages.length,
        topPages: topPages.join('; ')
      };
    },

    getSummaryString: function() {
      var s = this.getSummary();
      return 'Visits: ' + s.visitCount
        + ' | First: ' + s.firstVisit.split('T')[0]
        + ' | Pages viewed: ' + s.totalPagesViewed
        + ' | Top: ' + s.topPages;
    }
  };

  // Track on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }

  // Record time on page when leaving
  window.addEventListener('beforeunload', function() {
    var profile = getProfile();
    if (profile.pages.length > 0) {
      var lastPage = profile.pages[profile.pages.length - 1];
      if (!lastPage.timeOnPage) {
        lastPage.timeOnPage = Math.round(
          (new Date() - new Date(lastPage.ts)) / 1000
        );
        saveProfile(profile);
      }
    }
  });
})();
