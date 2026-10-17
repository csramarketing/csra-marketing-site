/* ============================================================
 * CSRA Marketing - Blog Feedback Widget
 * Lets Kemar leave comments on drafted preview posts.
 *
 * SETUP:
 * 1. Deploy blog-feedback-receiver.js as an Apps Script web app
 *    (Execute as: Me, Access: Anyone).
 * 2. Paste the web app URL below as FEEDBACK_ENDPOINT.
 * 3. Upload this file to /assets/js/blog-feedback.js in the repo.
 * 4. On each preview page, add BEFORE this script:
 *      <script>window.CSRA_FEEDBACK={postSlug:'my-slug',postTitle:'My Title'};</script>
 *
 * Only activates on /preview/ URLs.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- CONFIG: paste the Apps Script web app URL here ---------- */
  var FEEDBACK_ENDPOINT = '';
  /* ------------------------------------------------------------------- */

  var cfg = window.CSRA_FEEDBACK || {};
  var POST_SLUG = cfg.postSlug || '';
  var POST_TITLE = cfg.postTitle || POST_SLUG;

  // Only run on preview pages with a configured slug
  if (window.location.pathname.indexOf('/preview/') === -1) return;
  if (!POST_SLUG) return;

  var NAVY = '#10233f', CORAL = '#ff705c', YELLOW = '#ffc61a';

  /* ---------------- CSS (injected, namespaced) ---------------- */
  var CSS = ''
    + '.csra-fb,.csra-fb *{box-sizing:border-box;font-family:Poppins,-apple-system,"Segoe UI",sans-serif;color-scheme:light;}'
    + '.csra-fb-btn{position:fixed;right:18px;bottom:18px;z-index:10001;display:flex;align-items:center;gap:8px;'
    + 'background:' + CORAL + ';color:#fff;border:none;border-radius:999px;padding:13px 20px;font-size:15px;font-weight:700;'
    + 'cursor:pointer;box-shadow:0 6px 20px rgba(255,112,92,.45);transition:transform .15s;}'
    + '.csra-fb-btn:hover{transform:translateY(-2px);}'
    + '.csra-fb-btn svg{width:18px;height:18px;fill:#fff;}'
    + '.csra-fb-menu{position:fixed;right:18px;bottom:76px;z-index:10002;background:#fff;border:1px solid #e5eaf1;'
    + 'border-radius:16px;box-shadow:0 12px 40px rgba(16,35,63,.18);width:270px;overflow:hidden;display:none;}'
    + '.csra-fb-menu.open{display:block;}'
    + '.csra-fb-menu h4{margin:0;padding:14px 16px 6px;font-size:14px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:none;'
    + 'padding:12px 16px;font-size:14px;font-weight:500;color:' + NAVY + ';cursor:pointer;}'
    + '.csra-fb-opt:hover{background:#f7f9fc;}'
    + '.csra-fb-opt .dot{width:10px;height:10px;border-radius:50%;background:' + CORAL + ';flex:none;}'
    + '.csra-fb-opt .cnt{margin-left:auto;background:#eef2f7;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-bar{position:fixed;top:0;left:0;right:0;z-index:10003;background:' + NAVY + ';color:#fff;'
    + 'padding:12px 16px;display:none;align-items:center;justify-content:space-between;gap:12px;font-size:14px;}'
    + '.csra-fb-bar.open{display:flex;}'
    + '.csra-fb-bar button{background:' + CORAL + ';color:#fff;border:none;border-radius:8px;padding:8px 14px;'
    + 'font-size:13px;font-weight:700;cursor:pointer;flex:none;}'
    + 'body.csra-fb-picking .csra-fb-pickable{cursor:pointer;}'
    + 'body.csra-fb-picking .csra-fb-pickable:hover{outline:2px dashed ' + CORAL + ';outline-offset:3px;background:#fff7f5;}'
    + '.csra-fb-selected{outline:2px solid ' + YELLOW + ' !important;outline-offset:3px;background:#fffbe8 !important;}'
    + '.csra-fb-form{position:fixed;z-index:10004;background:#fff;border:1px solid #e5eaf1;border-radius:16px;'
    + 'box-shadow:0 12px 40px rgba(16,35,63,.22);padding:18px;display:none;width:min(420px,calc(100vw - 32px));}'
    + '.csra-fb-form.open{display:block;}'
    + '.csra-fb-form h4{margin:0 0 4px;font-size:15px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-form .ref{font-size:12.5px;color:#5b6b82;background:#f7f9fc;border-radius:8px;padding:8px 10px;'
    + 'margin:0 0 10px;max-height:74px;overflow:hidden;}'
    + '.csra-fb-form textarea{width:100%;min-height:110px;border:1.5px solid #dbe3ee;border-radius:10px;'
    + 'padding:10px 12px;font-size:14px;font-family:inherit;color:' + NAVY + ';resize:vertical;}'
    + '.csra-fb-form textarea:focus{outline:none;border-color:' + CORAL + ';}'
    + '.csra-fb-row{display:flex;gap:10px;margin-top:12px;justify-content:flex-end;}'
    + '.csra-fb-submit{background:' + CORAL + ';color:#fff;border:none;border-radius:10px;padding:11px 22px;'
    + 'font-size:14px;font-weight:700;cursor:pointer;}'
    + '.csra-fb-submit:disabled{opacity:.55;cursor:default;}'
    + '.csra-fb-cancel{background:#eef2f7;color:' + NAVY + ';border:none;border-radius:10px;padding:11px 18px;'
    + 'font-size:14px;font-weight:600;cursor:pointer;}'
    + '.csra-fb-marker{position:absolute;top:-11px;right:-6px;z-index:50;min-width:24px;height:24px;padding:0 6px;'
    + 'background:' + CORAL + ';color:#fff;border-radius:999px;font-size:12px;font-weight:800;display:flex;'
    + 'align-items:center;justify-content:center;cursor:pointer;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.2);}'
    + '.csra-fb-has-marker{position:relative;}'
    + '.csra-fb-pop{position:fixed;z-index:10005;background:#fff;border:1px solid #e5eaf1;border-radius:14px;'
    + 'box-shadow:0 12px 40px rgba(16,35,63,.22);padding:16px;width:min(360px,calc(100vw - 32px));display:none;}'
    + '.csra-fb-pop.open{display:block;}'
    + '.csra-fb-pop .st{display:inline-block;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;margin-bottom:8px;}'
    + '.csra-fb-pop .st-New{background:#ffe9e6;color:#c2432f;}'
    + '.csra-fb-pop .st-Applied{background:#e2f4e5;color:#1e7a34;}'
    + '.csra-fb-pop .st-Dismissed{background:#eef2f7;color:#5b6b82;}'
    + '.csra-fb-pop p.cmt{margin:0 0 8px;font-size:14px;color:' + NAVY + ';line-height:1.55;}'
    + '.csra-fb-pop p.meta{margin:0;font-size:12px;color:#8a97a8;}'
    + '.csra-fb-pop .x{position:absolute;top:8px;right:10px;background:none;border:none;font-size:18px;'
    + 'color:#8a97a8;cursor:pointer;line-height:1;}'
    + '.csra-fb-list{position:fixed;z-index:10004;background:#fff;border:1px solid #e5eaf1;border-radius:16px;'
    + 'box-shadow:0 12px 40px rgba(16,35,63,.22);padding:18px;display:none;width:min(440px,calc(100vw - 32px));'
    + 'max-height:min(70vh,560px);overflow-y:auto;}'
    + '.csra-fb-list.open{display:block;}'
    + '.csra-fb-list h4{margin:0 0 10px;font-size:15px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-item{border-top:1px solid #eef2f7;padding:10px 0;}'
    + '.csra-fb-item .n{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;'
    + 'background:' + CORAL + ';color:#fff;border-radius:999px;font-size:11px;font-weight:800;margin-right:8px;padding:0 5px;}'
    + '.csra-fb-item p{margin:6px 0;font-size:13.5px;color:' + NAVY + ';line-height:1.55;}'
    + '.csra-fb-item .r{font-size:12px;color:#8a97a8;font-style:italic;margin:0 0 4px;}'
    + '.csra-fb-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);z-index:10006;'
    + 'background:' + NAVY + ';color:#fff;padding:13px 22px;border-radius:12px;font-size:14px;font-weight:600;'
    + 'opacity:0;pointer-events:none;transition:all .25s;box-shadow:0 8px 24px rgba(16,35,63,.3);}'
    + '.csra-fb-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}'
    + '@media(max-width:640px){.csra-fb-btn{right:14px;bottom:14px;padding:12px 16px;font-size:14px;}'
    + '.csra-fb-menu{right:14px;bottom:70px;}.csra-fb-form{left:16px !important;right:16px;top:auto !important;bottom:16px;width:auto;}'
    + '.csra-fb-list{left:16px !important;right:16px;top:auto !important;bottom:16px;width:auto;}}';

  function injectCSS() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg) {
    var t = document.querySelector('.csra-fb-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'csra-fb csra-fb-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------------- commentable elements ---------------- */
  var PICK_SELECTOR = '.post-body p, .post-body h2, .post-body h3, .post-body li';
  var fbCounter = 0;

  function pickables() {
    var els = document.querySelectorAll(PICK_SELECTOR);
    var out = [];
    for (var i = 0; i < els.length; i++) {
      // Skip empty, TOC, FAQ summaries, share rows
      var el = els[i];
      if (el.closest('.toc, .faq, .share-row, .csra-fb')) continue;
      if (!el.textContent.trim()) continue;
      out.push(el);
    }
    return out;
  }

  function ensureIds() {
    var els = pickables();
    for (var i = 0; i < els.length; i++) {
      if (!els[i].getAttribute('data-fb')) {
        els[i].setAttribute('data-fb', 'fb-' + (i + 1));
      }
    }
  }

  /* ---------------- state ---------------- */
  var comments = []; // {n, comment, referenced_text, element_id, status, date}
  var picking = false;
  var selectedEl = null;

  /* ---------------- UI builders ---------------- */
  function buildButton() {
    var b = document.createElement('button');
    b.className = 'csra-fb csra-fb-btn';
    b.setAttribute('aria-label', 'Leave feedback on this draft');
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg><span>Feedback</span>';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu();
    });
    document.body.appendChild(b);
  }

  function buildMenu() {
    var m = document.createElement('div');
    m.className = 'csra-fb csra-fb-menu';
    m.innerHTML =
      '<h4>Leave feedback</h4>'
      + '<button class="csra-fb-opt" data-act="pick"><span class="dot"></span>Comment on specific text</button>'
      + '<button class="csra-fb-opt" data-act="general"><span class="dot"></span>General comment</button>'
      + '<button class="csra-fb-opt" data-act="view"><span class="dot"></span>View comments<span class="cnt">0</span></button>';
    m.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      closeMenu();
      if (act === 'pick') startPicking();
      else if (act === 'general') openForm(null);
      else if (act === 'view') openList();
    });
    document.body.appendChild(m);
    return m;
  }

  function toggleMenu() {
    var m = document.querySelector('.csra-fb-menu');
    m.classList.toggle('open');
  }
  function closeMenu() {
    var m = document.querySelector('.csra-fb-menu');
    if (m) m.classList.remove('open');
  }

  function buildBar() {
    var bar = document.createElement('div');
    bar.className = 'csra-fb csra-fb-bar';
    bar.innerHTML = '<span>Tap any paragraph or heading to attach your comment.</span><button>Cancel</button>';
    bar.querySelector('button').addEventListener('click', stopPicking);
    document.body.appendChild(bar);
  }

  function buildForm() {
    var f = document.createElement('div');
    f.className = 'csra-fb csra-fb-form';
    f.innerHTML =
      '<h4>Your comment</h4>'
      + '<p class="ref" style="display:none;"></p>'
      + '<textarea placeholder="What should change here?" aria-label="Your comment"></textarea>'
      + '<input type="text" name="website" style="display:none" tabindex="-1" autocomplete="off">'
      + '<div class="csra-fb-row"><button class="csra-fb-cancel">Cancel</button>'
      + '<button class="csra-fb-submit">Submit</button></div>';
    f.querySelector('.csra-fb-cancel').addEventListener('click', function () {
      closeForm();
      if (picking) stopPicking();
    });
    f.querySelector('.csra-fb-submit').addEventListener('click', submitComment);
    document.body.appendChild(f);
  }

  function buildList() {
    var l = document.createElement('div');
    l.className = 'csra-fb csra-fb-list';
    l.innerHTML = '<h4>Comments (<span class="csra-fb-list-n">0</span>)</h4><div class="csra-fb-items"></div>'
      + '<div class="csra-fb-row"><button class="csra-fb-cancel">Close</button></div>';
    l.querySelector('.csra-fb-cancel').addEventListener('click', function () {
      l.classList.remove('open');
    });
    document.body.appendChild(l);
  }

  function buildPop() {
    var p = document.createElement('div');
    p.className = 'csra-fb csra-fb-pop';
    p.innerHTML = '<button class="x" aria-label="Close">&times;</button><div class="csra-fb-pop-body"></div>';
    p.querySelector('.x').addEventListener('click', function () {
      p.classList.remove('open');
    });
    document.body.appendChild(p);
  }

  /* ---------------- picking mode ---------------- */
  function startPicking() {
    if (!FEEDBACK_ENDPOINT) { toast('Feedback system is being set up.'); return; }
    picking = true;
    document.body.classList.add('csra-fb-picking');
    document.querySelector('.csra-fb-bar').classList.add('open');
  }

  function stopPicking() {
    picking = false;
    document.body.classList.remove('csra-fb-picking');
    var bar = document.querySelector('.csra-fb-bar');
    if (bar) bar.classList.remove('open');
    clearSelection();
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('csra-fb-selected');
      selectedEl = null;
    }
  }

  function onDocClick(e) {
    if (!picking) return;
    // Ignore clicks on widget UI
    if (e.target.closest('.csra-fb')) return;
    var el = e.target.closest ? e.target.closest(PICK_SELECTOR) : null;
    if (el && !el.closest('.toc, .faq, .share-row')) {
      e.preventDefault();
      e.stopPropagation();
      clearSelection();
      selectedEl = el;
      el.classList.add('csra-fb-selected');
      openForm(el);
    }
  }

  /* ---------------- form ---------------- */
  function openForm(targetEl) {
    if (!FEEDBACK_ENDPOINT) { toast('Feedback system is being set up.'); return; }
    var f = document.querySelector('.csra-fb-form');
    var ref = f.querySelector('.ref');
    var ta = f.querySelector('textarea');
    ta.value = '';
    if (targetEl) {
      var txt = targetEl.textContent.trim().replace(/\s+/g, ' ');
      if (txt.length > 160) txt = txt.slice(0, 160) + '...';
      ref.textContent = '"' + txt + '"';
      ref.style.display = 'block';
    } else {
      ref.style.display = 'none';
    }
    // Position: desktop near bottom-right, mobile bottom sheet via CSS
    f.style.right = '18px';
    f.style.bottom = '76px';
    f.classList.add('open');
    setTimeout(function () { ta.focus(); }, 50);
  }

  function closeForm() {
    var f = document.querySelector('.csra-fb-form');
    if (f) f.classList.remove('open');
    clearSelection();
  }

  function submitComment() {
    var f = document.querySelector('.csra-fb-form');
    var ta = f.querySelector('textarea');
    var honey = f.querySelector('input[name="website"]');
    var text = ta.value.trim();
    if (!text) { ta.focus(); return; }
    var btn = f.querySelector('.csra-fb-submit');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    var refText = '';
    var elId = '';
    if (selectedEl) {
      elId = selectedEl.getAttribute('data-fb') || '';
      refText = selectedEl.textContent.trim().replace(/\s+/g, ' ').slice(0, 300);
    }

    var payload = new URLSearchParams();
    payload.append('post_slug', POST_SLUG);
    payload.append('post_title', POST_TITLE);
    payload.append('comment_text', text);
    payload.append('referenced_text', refText);
    payload.append('element_id', elId);
    payload.append('timestamp', new Date().toISOString());
    payload.append('website', honey.value); // honeypot

    fetch(FEEDBACK_ENDPOINT, { method: 'POST', body: payload })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = 'Submit';
        if (res && res.ok) {
          addComment({ comment: text, referenced_text: refText, element_id: elId, status: 'New', date: new Date().toISOString() });
          closeForm();
          if (picking) stopPicking();
          toast('Comment saved.');
        } else {
          toast('Could not save. Try again.');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Submit';
        toast('Could not save. Try again.');
      });
  }

  /* ---------------- markers & popover ---------------- */
  function addComment(c) {
    c.n = comments.length + 1;
    comments.push(c);
    renderMarker(c);
    updateCounts();
  }

  function findEl(c) {
    if (c.element_id) {
      var el = document.querySelector('[data-fb="' + c.element_id + '"]');
      if (el) return el;
    }
    // Fallback: match by text snippet
    if (c.referenced_text) {
      var snippet = c.referenced_text.slice(0, 60).replace(/\s+/g, ' ').trim();
      var els = pickables();
      for (var i = 0; i < els.length; i++) {
        if (els[i].textContent.replace(/\s+/g, ' ').indexOf(snippet) !== -1) return els[i];
      }
    }
    return null;
  }

  function renderMarker(c) {
    var el = findEl(c);
    if (!el) return; // general comment: visible in the list only
    el.classList.add('csra-fb-has-marker');
    var m = document.createElement('span');
    m.className = 'csra-fb csra-fb-marker';
    m.textContent = c.n;
    m.setAttribute('data-n', c.n);
    m.setAttribute('role', 'button');
    m.setAttribute('aria-label', 'View comment ' + c.n);
    // Stack if multiple markers on same element
    var existing = el.querySelectorAll('.csra-fb-marker').length;
    m.style.right = (-6 + existing * 28) + 'px';
    m.addEventListener('click', function (e) {
      e.stopPropagation();
      showPop(c, m);
    });
    el.appendChild(m);
  }

  function showPop(c, anchor) {
    var p = document.querySelector('.csra-fb-pop');
    var body = p.querySelector('.csra-fb-pop-body');
    var d = c.date ? new Date(c.date).toLocaleString() : '';
    body.innerHTML =
      '<span class="st st-' + esc(c.status || 'New') + '">' + esc(c.status || 'New') + '</span>'
      + '<p class="cmt">' + esc(c.comment).replace(/\n/g, '<br>') + '</p>'
      + (c.referenced_text ? '<p class="meta">On: &ldquo;' + esc(c.referenced_text.slice(0, 120)) + '&rdquo;</p>' : '')
      + (d ? '<p class="meta">' + esc(d) + '</p>' : '');
    var r = anchor.getBoundingClientRect();
    p.classList.add('open');
    // Position near anchor, keep on screen
    var pw = Math.min(360, window.innerWidth - 32);
    var left = Math.max(16, Math.min(window.innerWidth - pw - 16, r.left - pw / 2));
    p.style.left = left + 'px';
    p.style.top = Math.min(window.innerHeight - 200, r.bottom + 10) + 'px';
  }

  function updateCounts() {
    var cnt = document.querySelector('.csra-fb-opt .cnt');
    if (cnt) cnt.textContent = comments.length;
    var ln = document.querySelector('.csra-fb-list-n');
    if (ln) ln.textContent = comments.length;
  }

  function openList() {
    var l = document.querySelector('.csra-fb-list');
    var items = l.querySelector('.csra-fb-items');
    l.querySelector('.csra-fb-list-n').textContent = comments.length;
    if (!comments.length) {
      items.innerHTML = '<p style="font-size:14px;color:#5b6b82;">No comments yet.</p>';
    } else {
      var html = '';
      for (var i = 0; i < comments.length; i++) {
        var c = comments[i];
        html += '<div class="csra-fb-item"><span class="n">' + c.n + '</span>'
          + '<span class="st st-' + esc(c.status || 'New') + '" style="display:inline-block;font-size:11px;font-weight:700;'
          + 'padding:3px 10px;border-radius:999px;background:' + (c.status === 'Applied' ? '#e2f4e5;color:#1e7a34' : c.status === 'Dismissed' ? '#eef2f7;color:#5b6b82' : '#ffe9e6;color:#c2432f') + ';">'
          + esc(c.status || 'New') + '</span>'
          + '<p>' + esc(c.comment).replace(/\n/g, '<br>') + '</p>'
          + (c.referenced_text ? '<p class="r">&ldquo;' + esc(c.referenced_text.slice(0, 140)) + '&rdquo;</p>' : '<p class="r">General comment</p>')
          + '</div>';
      }
      items.innerHTML = html;
    }
    l.style.right = '18px';
    l.style.bottom = '76px';
    l.classList.add('open');
  }

  /* ---------------- load existing comments ---------------- */
  function loadComments() {
    if (!FEEDBACK_ENDPOINT) return;
    fetch(FEEDBACK_ENDPOINT + '?action=list&post_slug=' + encodeURIComponent(POST_SLUG))
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok && res.comments) {
          for (var i = 0; i < res.comments.length; i++) {
            addComment(res.comments[i]);
          }
        }
      })
      .catch(function () { /* silent: comments just won't preload */ });
  }

  /* ---------------- init ---------------- */
  function init() {
    injectCSS();
    ensureIds();
    buildButton();
    buildMenu();
    buildBar();
    buildForm();
    buildList();
    buildPop();
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (picking) stopPicking();
        var p = document.querySelector('.csra-fb-pop');
        if (p) p.classList.remove('open');
        closeMenu();
      }
    });
    // Close menu when clicking elsewhere
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.csra-fb-menu') && !e.target.closest('.csra-fb-btn')) closeMenu();
    });
    loadComments();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
