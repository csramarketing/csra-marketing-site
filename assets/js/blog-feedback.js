/* ============================================================
 * CSRA Marketing - Blog Feedback Widget (Google Form edition)
 *
 * Lets Kemar leave feedback on drafted preview posts via an
 * embedded Google Form. No backend to deploy.
 *
 * SETUP:
 * 1. Upload this file to /assets/js/blog-feedback.js in the repo.
 * 2. On each preview page, add BEFORE this script:
 *      <script>window.CSRA_FEEDBACK={postSlug:'my-slug',postTitle:'My Title'};</script>
 *
 * Only activates on /preview/ URLs.
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- CONFIG: Google Form ---------- */
  var FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSfBAwT_6pV07GyXf94dL4oB0fAbN2Pl1HE7Oi3-cwDbsoz5Pw/viewform';
  var E_POST = 'entry.588016490';      /* Post (short answer, required) */
  var E_REFTEXT = 'entry.1025621485';  /* Referenced text (paragraph, optional) */
  var E_NAME = 'entry.1232869221';     /* Your name (short answer) */
  /* ----------------------------------------- */

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
    + 'border-radius:16px;box-shadow:0 12px 40px rgba(16,35,63,.18);width:280px;overflow:hidden;display:none;}'
    + '.csra-fb-menu.open{display:block;}'
    + '.csra-fb-menu h4{margin:0;padding:14px 16px 6px;font-size:14px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:none;'
    + 'padding:12px 16px;font-size:14px;font-weight:500;color:' + NAVY + ';cursor:pointer;}'
    + '.csra-fb-opt:hover{background:#f7f9fc;}'
    + '.csra-fb-opt .dot{width:10px;height:10px;border-radius:50%;background:' + CORAL + ';flex:none;}'
    + '.csra-fb-opt small{display:block;font-size:11.5px;color:#8a97a8;font-weight:400;margin-top:2px;}'
    /* pick mode top bar */
    + '.csra-fb-bar{position:fixed;top:0;left:0;right:0;z-index:10003;background:' + NAVY + ';color:#fff;'
    + 'padding:12px 16px;display:none;align-items:center;justify-content:space-between;gap:12px;font-size:14px;font-weight:500;}'
    + '.csra-fb-bar.open{display:flex;}'
    + '.csra-fb-bar button{background:' + CORAL + ';color:#fff;border:none;border-radius:8px;padding:8px 14px;'
    + 'font-size:13px;font-weight:700;cursor:pointer;flex:none;}'
    + 'body.csra-fb-picking .csra-fb-pickable{cursor:pointer;}'
    + 'body.csra-fb-picking .csra-fb-pickable:hover{outline:2px dashed ' + CORAL + ';outline-offset:3px;background:#fff7f5;}'
    /* modal */
    + '.csra-fb-overlay{position:fixed;inset:0;z-index:10004;background:rgba(16,35,63,.55);display:none;'
    + 'align-items:center;justify-content:center;padding:20px;}'
    + '.csra-fb-overlay.open{display:flex;}'
    + '.csra-fb-modal{background:#fff;border-radius:20px;box-shadow:0 24px 64px rgba(16,35,63,.35);'
    + 'width:min(560px,100%);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}'
    + '.csra-fb-modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;'
    + 'padding:16px 20px;border-bottom:1px solid #eef2f7;flex:none;}'
    + '.csra-fb-modal-head h4{margin:0;font-size:16px;font-weight:700;color:' + NAVY + ';}'
    + '.csra-fb-modal-head p{margin:2px 0 0;font-size:12.5px;color:#8a97a8;}'
    + '.csra-fb-x{background:#eef2f7;color:' + NAVY + ';border:none;border-radius:999px;width:36px;height:36px;'
    + 'font-size:18px;font-weight:700;cursor:pointer;flex:none;line-height:1;}'
    + '.csra-fb-modal-body{flex:1;overflow:hidden;position:relative;min-height:420px;}'
    + '.csra-fb-modal-body iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;}'
    /* mobile: bottom sheet */
    + '@media (max-width:640px){'
    + '.csra-fb-overlay{padding:0;align-items:flex-end;}'
    + '.csra-fb-modal{width:100%;max-height:94vh;border-radius:20px 20px 0 0;}'
    + '.csra-fb-btn{right:14px;bottom:14px;padding:12px 18px;font-size:14px;}'
    + '.csra-fb-menu{right:14px;bottom:68px;}'
    + '}';

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- floating button + menu ---------------- */
  var root = document.createElement('div');
  root.className = 'csra-fb';
  root.innerHTML = ''
    + '<button class="csra-fb-btn" id="csraFbBtn" aria-label="Leave feedback">'
    + '<svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>'
    + 'Feedback</button>'
    + '<div class="csra-fb-menu" id="csraFbMenu">'
    + '<h4>Leave feedback</h4>'
    + '<button class="csra-fb-opt" id="csraFbPick"><span class="dot"></span><span>Comment on specific text<small>Click a paragraph, then write your note</small></span></button>'
    + '<button class="csra-fb-opt" id="csraFbGeneral"><span class="dot"></span><span>General comment<small>About the post overall</small></span></button>'
    + '</div>'
    + '<div class="csra-fb-bar" id="csraFbBar"><span>Click any paragraph or heading to attach your comment to it.</span><button id="csraFbBarCancel">Cancel</button></div>'
    + '<div class="csra-fb-overlay" id="csraFbOverlay">'
    + '<div class="csra-fb-modal" role="dialog" aria-label="Leave feedback">'
    + '<div class="csra-fb-modal-head"><div><h4>Feedback</h4><p id="csraFbSub">' + esc(POST_TITLE) + '</p></div>'
    + '<button class="csra-fb-x" id="csraFbClose" aria-label="Close">&times;</button></div>'
    + '<div class="csra-fb-modal-body"><iframe id="csraFbFrame" title="Feedback form" allow="clipboard-write"></iframe></div>'
    + '</div></div>';
  document.body.appendChild(root);

  var btn = document.getElementById('csraFbBtn');
  var menu = document.getElementById('csraFbMenu');
  var bar = document.getElementById('csraFbBar');
  var overlay = document.getElementById('csraFbOverlay');
  var frame = document.getElementById('csraFbFrame');

  function closeMenu() { menu.classList.remove('open'); }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', function (e) {
    if (!root.contains(e.target)) closeMenu();
  });

  /* ---------------- modal ---------------- */
  function formUrl(refText) {
    var q = '?embedded=true'
      + '&' + encodeURIComponent(E_POST) + '=' + encodeURIComponent(POST_SLUG)
      + '&' + encodeURIComponent(E_NAME) + '=' + encodeURIComponent('Kemar');
    if (refText) q += '&' + encodeURIComponent(E_REFTEXT) + '=' + encodeURIComponent(refText);
    return FORM_BASE + q;
  }

  function openModal(refText, label) {
    frame.src = formUrl(refText);
    document.getElementById('csraFbSub').textContent = label || POST_TITLE;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    frame.src = 'about:blank';
  }

  document.getElementById('csraFbClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); cancelPick(); closeMenu(); }
  });

  /* ---------------- pick mode ---------------- */
  var PICKABLE = 'p, h1, h2, h3, h4, li, blockquote, .callout';

  function enablePickables() {
    var els = document.querySelectorAll(PICKABLE);
    for (var i = 0; i < els.length; i++) {
      if (root.contains(els[i])) continue;
      els[i].classList.add('csra-fb-pickable');
    }
  }
  function disablePickables() {
    var els = document.querySelectorAll('.csra-fb-pickable');
    for (var i = 0; i < els.length; i++) els[i].classList.remove('csra-fb-pickable');
  }

  function startPick() {
    closeMenu();
    bar.classList.add('open');
    document.body.classList.add('csra-fb-picking');
    enablePickables();
  }
  function cancelPick() {
    bar.classList.remove('open');
    document.body.classList.remove('csra-fb-picking');
    disablePickables();
  }

  document.getElementById('csraFbPick').addEventListener('click', startPick);
  document.getElementById('csraFbBarCancel').addEventListener('click', cancelPick);

  document.getElementById('csraFbGeneral').addEventListener('click', function () {
    closeMenu();
    openModal('', 'General feedback: ' + POST_TITLE);
  });

  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('csra-fb-picking')) return;
    var t = e.target;
    if (root.contains(t)) return;
    var pick = t.closest ? t.closest('.csra-fb-pickable') : null;
    if (!pick) return;
    e.preventDefault();
    e.stopPropagation();
    var txt = (pick.innerText || pick.textContent || '').trim().replace(/\s+/g, ' ');
    if (txt.length > 200) txt = txt.slice(0, 197) + '...';
    cancelPick();
    openModal(txt, 'Comment on: "' + (txt.length > 60 ? txt.slice(0, 57) + '...' : txt) + '"');
  }, true);
})();
