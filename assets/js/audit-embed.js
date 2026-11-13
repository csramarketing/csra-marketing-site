/* Audit embed for blog posts.
   Same form, same API, same tracking as the Roofing Website Score page.
   The only difference: the result is a compact score shown on the post
   (the blog has no full report section), and the reader keeps reading.
   Form-helper.js already attaches visitor data + the honeypot to this
   form; this handler reads them out of the form at submit time. */
(function () {
  'use strict';

  var form = document.getElementById('blogAuditForm');
  if (!form) return;
  var section = form.closest('.audit-embed');
  var result = section ? section.querySelector('.audit-embed-result') : null;
  if (!result) return;
  var submitBtn = form.querySelector('button[type="submit"]');

  var OVERALL_SENTENCES = {
    'Critical': 'Your website needs work in several areas.',
    'Needs Attention': 'Your website is working, but several fixes would help.',
    'Fair': 'Your website is working, but there are several opportunities to get more visibility, build trust, and turn more visitors into estimate requests.',
    'Good': 'Your website is in good shape, with a few gaps to close.',
    'Strong': 'Your website is in strong shape.'
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  // Completion tracking: score only, never name or email into Google.
  // The token + lead record stays in the visitor's own browser for 24
  // months, so a return visit matches back to their audit.
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
        if (window.CSRAVisitor && typeof window.CSRAVisitor.getSummary === 'function') {
          var summary = window.CSRAVisitor.getSummary();
          if (summary && summary.visitorId) token = summary.visitorId;
        }
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
  }

  function showFormAgain() {
    result.hidden = true;
    result.innerHTML = '';
    form.hidden = false;
    if (submitBtn) submitBtn.disabled = false;
  }

  function renderResult(rep, website) {
    result.innerHTML = '';
    if (!rep || typeof rep.overall !== 'number') {
      result.appendChild(el('p', null, 'We could not check that website. Check the website address and try again.'));
      var alt = el('a', null, 'Run it on the audit page instead');
      alt.href = '/roofing-website-score/';
      result.appendChild(alt);
      var again = el('button', 'audit-embed-again', 'Run another audit');
      again.type = 'button';
      again.addEventListener('click', showFormAgain);
      result.appendChild(again);
      return;
    }
    result.appendChild(el('p', 'audit-embed-score', rep.overall + ' / 100'));
    if (rep.overallBand && rep.overallBand.label) {
      result.appendChild(el('p', 'audit-embed-band', rep.overallBand.label));
    }
    var verdict = (rep.overallBand && OVERALL_SENTENCES[rep.overallBand.label]) || '';
    if (verdict) result.appendChild(el('p', null, verdict));
    if (rep.checkedOfFive < 5) {
      result.appendChild(el('p', 'audit-embed-note', 'Checked ' + rep.checkedOfFive + ' of 5 categories. The rest could not be checked, so they do not count toward the score.'));
    }
    if (rep.findings && rep.findings.length) {
      result.appendChild(el('h3', null, 'Top 3 findings'));
      var list = el('ol', null);
      rep.findings.slice(0, 3).forEach(function (f) {
        var li = el('li', null);
        li.appendChild(el('strong', null, f.title + '. '));
        li.appendChild(document.createTextNode(f.detected || ''));
        list.appendChild(li);
      });
      result.appendChild(list);
    }
    var full = el('a', null, 'See your full report');
    full.href = '/roofing-website-score/';
    result.appendChild(full);
    var againBtn = el('button', 'audit-embed-again', 'Run another audit');
    againBtn.type = 'button';
    againBtn.addEventListener('click', showFormAgain);
    result.appendChild(againBtn);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.querySelector('[name="name"]').value.trim();
    var website = form.querySelector('[name="website"]').value.trim();
    var phone = form.querySelector('[name="phone"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    if (!name || !website || !phone || !email) return;

    var fd = new FormData(form);
    var body = {};
    fd.forEach(function (v, k) { body[k] = v; });
    body.website = website;
    body.email = email;
    body.business = name;
    body.roofer = true;

    form.hidden = true;
    result.hidden = false;
    result.innerHTML = '';
    result.appendChild(el('p', null, 'The check takes about 30 seconds.'));
    if (submitBtn) submitBtn.disabled = true;

    fetch('/api/roofing-website-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('audit failed');
        return res.json();
      })
      .then(function (rep) {
        renderResult(rep, website);
        trackCompletion(rep, { name: name, website: website, phone: phone, email: email });
      })
      .catch(function () {
        result.innerHTML = '';
        result.appendChild(el('p', null, 'We could not run the audit. Try again, or run it on the audit page.'));
        var alt = el('a', null, 'Run it on the audit page');
        alt.href = '/roofing-website-score/';
        result.appendChild(alt);
        var again = el('button', 'audit-embed-again', 'Run another audit');
        again.type = 'button';
        again.addEventListener('click', showFormAgain);
        result.appendChild(again);
      });
  });
})();
