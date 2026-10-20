/**
 * CSRA Marketing - Universal Form Helper
 *
 * Drop this on any page with a form. It automatically:
 * 1. Attaches visitor history (from visitor-track.js) to every form submission
 * 2. Adds a hidden honeypot field for spam protection
 *
 * Usage: just include the script. No configuration needed.
 * It hooks into all <form> elements on the page automatically.
 *
 * Requires: visitor-track.js must be loaded before this script.
 */
(function() {
  'use strict';

  function attachVisitorData(form) {
    if (typeof CSRAVisitor === 'undefined') return;

    try {
      var summary = CSRAVisitor.getSummary();

      var fields = {
        'visitor_id': summary.visitorId,
        'visit_count': String(summary.visitCount),
        'first_visit': summary.firstVisit,
        'pages_viewed': String(summary.totalPagesViewed),
        'top_pages': summary.topPages,
        'funnel_breakdown': summary.funnelBreakdown,
        'dominant_funnel': summary.dominantFunnel,
        'time_on_site': summary.totalTimeFormatted,
        'session_breakdown': summary.sessionBreakdown,
        'traffic_source': summary.trafficSource || '',
        'email_token': summary.emailToken || '',
        'email_src': summary.emailSource || '',
        'meta_fbp': summary.metaFbp || '',
        'meta_fbc': summary.metaFbc || '',
        'meta_fbclid': summary.fbclid || '',
        'utm_source': summary.utmSource || '',
        'utm_medium': summary.utmMedium || '',
        'utm_campaign': summary.utmCampaign || ''
      };

      Object.keys(fields).forEach(function(name) {
        // Don't duplicate if already present
        if (form.querySelector('input[name="' + name + '"]')) return;
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = fields[name];
        form.appendChild(input);
      });
    } catch (e) { /* tracking unavailable, skip silently */ }
  }

  function addHoneypot(form) {
    if (form.querySelector('input[name="website_confirm"]')) return;
    var hp = document.createElement('input');
    hp.type = 'text';
    hp.name = 'website_confirm';
    hp.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;height:1px;width:1px;';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    form.appendChild(hp);
  }

  function init() {
    var forms = document.querySelectorAll('form');
    forms.forEach(function(form) {
      // Attach visitor data just before submit (freshest data)
      form.addEventListener('submit', function() {
        attachVisitorData(form);
      });
      addHoneypot(form);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
