"""The embeddable InFlow tracking + red-carpet storefront snippet.

Drop-in: <script async src=".../api/public/intent/{key}/snippet.js"></script>
  - tracks page views (classified by the org's URL patterns), PDF/whitepaper clicks,
    [data-inflow-event] clicks and form submits (capturing the visitor's email)
  - window.inflow.identify({email, company}) / window.inflow.track(type, props)
  - personalizes the page for qualifying high-intent visitors: fills
    [data-inflow-headline|message|terms|promo|discount|cta], rewrites
    [data-inflow-price="99"] to the discounted price, sets input[name=inflow_promo]
    and, when no slots exist, injects a red-carpet banner.
"""
import json

_JS = r"""(function(){
  if (window.__inflowLoaded) return; window.__inflowLoaded = true;
  var KEY = "__KEY__", P = __PATTERNS__;
  var cs = document.currentScript || document.querySelector('script[src*="/api/public/intent/"]');
  var BASE = cs ? cs.src.split('/api/public/')[0] : '';
  var ls = window.localStorage || {getItem:function(){return null;},setItem:function(){}};
  var vid = ls.getItem('ifl_vid');
  if (!vid) { vid = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); ls.setItem('ifl_vid', vid); }
  var ident = {}; try { ident = JSON.parse(ls.getItem('ifl_id') || '{}'); } catch (e) {}
  var q = new URLSearchParams(location.search);
  if (q.get('ifl_email')) ident.email = q.get('ifl_email');
  if (q.get('ifl_company')) ident.company = q.get('ifl_company');
  ls.setItem('ifl_id', JSON.stringify(ident));
  function classify(u){ u = (u || '').toLowerCase(); for (var t in P) { for (var i = 0; i < P[t].length; i++) { if (P[t][i] && u.indexOf(P[t][i].toLowerCase()) > -1) return t; } } return 'page_view'; }
  function send(type, props){
    var body = JSON.stringify({type: type, vid: vid, email: ident.email || '', company: ident.company || '', url: location.href, title: document.title, properties: props || {}});
    var url = BASE + '/api/public/intent/' + KEY + '/collect';
    try { if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], {type: 'text/plain'}))) return; } catch (e) {}
    try { fetch(url, {method: 'POST', body: body, headers: {'Content-Type': 'text/plain'}, keepalive: true, mode: 'no-cors'}); } catch (e) {}
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fill(sel, val){ var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) n[i].textContent = val; return n.length; }
  function render(d){
    if (!d || !d.qualified || !d.offer) return; var o = d.offer, slots = 0;
    slots += fill('[data-inflow-headline]', o.headline || '');
    slots += fill('[data-inflow-message]', o.message || '');
    slots += fill('[data-inflow-terms]', o.contract_terms || '');
    slots += fill('[data-inflow-promo]', o.promo_code || '');
    slots += fill('[data-inflow-discount]', (o.discount_pct || 0) + '% off');
    var prices = document.querySelectorAll('[data-inflow-price]');
    for (var i = 0; i < prices.length; i++) {
      var base = parseFloat(prices[i].getAttribute('data-inflow-price')); if (!base || !o.discount_pct) continue;
      var now = Math.round(base * (100 - o.discount_pct)) / 100;
      prices[i].innerHTML = '<s style="opacity:.55;margin-right:6px">$' + base.toLocaleString() + '</s><b>$' + now.toLocaleString() + '</b>'; slots++;
    }
    var inputs = document.querySelectorAll('input[name="inflow_promo"],input[name="promo_code"]');
    for (var j = 0; j < inputs.length; j++) { inputs[j].value = o.promo_code || ''; slots++; }
    var ctas = document.querySelectorAll('[data-inflow-cta]');
    for (var k = 0; k < ctas.length; k++) { ctas[k].textContent = o.cta_label; if (o.cta_url && ctas[k].tagName === 'A') ctas[k].href = o.cta_url; slots++; }
    if (slots || document.getElementById('inflow-redcarpet')) return;
    var b = document.createElement('div'); b.id = 'inflow-redcarpet';
    b.setAttribute('style', 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000;max-width:640px;width:calc(100% - 32px);' +
      'background:rgba(10,12,20,.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#fff;border:1px solid rgba(0,82,255,.45);' +
      'border-radius:18px;padding:18px 20px;font-family:-apple-system,Segoe UI,Inter,sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.45)');
    b.innerHTML = '<div style="display:flex;gap:14px;align-items:flex-start">' +
      '<div style="flex:1"><div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#4d8bff;font-weight:700;margin-bottom:4px">Prepared for ' + esc(d.account) + '</div>' +
      '<div style="font-size:17px;font-weight:700;margin-bottom:4px">' + esc(o.headline) + '</div>' +
      (o.message ? '<div style="font-size:13px;color:#c9cbd3;margin-bottom:6px">' + esc(o.message) + '</div>' : '') +
      (o.contract_terms ? '<div style="font-size:12px;color:#9aa0ad">Terms: ' + esc(o.contract_terms) + '</div>' : '') +
      (o.promo_code ? '<div style="margin-top:8px;font-size:12px">Code <span style="font-family:monospace;background:rgba(0,82,255,.18);border:1px solid rgba(0,82,255,.45);padding:2px 8px;border-radius:6px">' + esc(o.promo_code) + '</span> · ' + esc(o.discount_pct) + '% off</div>' : '') +
      '</div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' +
      '<button id="inflow-rc-close" aria-label="Close" style="background:none;border:0;color:#9aa0ad;cursor:pointer;font-size:18px;line-height:1">&times;</button>' +
      (o.cta_url ? '<a href="' + esc(o.cta_url) + '" style="background:#0052ff;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 14px;border-radius:999px;white-space:nowrap">' + esc(o.cta_label) + '</a>' : '') +
      '</div></div>';
    document.body.appendChild(b);
    document.getElementById('inflow-rc-close').onclick = function(){ b.remove(); };
  }
  function personalize(){
    var u = BASE + '/api/public/intent/' + KEY + '/personalize?vid=' + encodeURIComponent(vid) + '&email=' + encodeURIComponent(ident.email || '') + '&company=' + encodeURIComponent(ident.company || '');
    try { fetch(u, {credentials: 'omit'}).then(function(r){ return r.json(); }).then(render).catch(function(){}); } catch (e) {}
  }
  window.inflow = {
    track: function(type, props){ send(type, props); },
    identify: function(o){ o = o || {}; if (o.email) ident.email = o.email; if (o.company) ident.company = o.company; ls.setItem('ifl_id', JSON.stringify(ident)); send('identify'); setTimeout(personalize, 1200); },
    personalize: personalize
  };
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('[data-inflow-event],a[href]') : null; if (!el) return;
    var t = el.getAttribute('data-inflow-event'); if (t) { send(t); return; }
    var h = (el.getAttribute('href') || '').toLowerCase();
    if (/\.pdf($|\?)/.test(h) || h.indexOf('whitepaper') > -1 || h.indexOf('ebook') > -1) send('whitepaper_download', {href: h.slice(0, 180)});
  }, true);
  document.addEventListener('submit', function(e){
    var f = e.target; if (!f || !f.querySelector) return;
    var em = f.querySelector('input[type=email],input[name*=email]'); var co = f.querySelector('input[name*=company],input[name*=organization]');
    if (em && em.value) ident.email = em.value; if (co && co.value) ident.company = co.value; ls.setItem('ifl_id', JSON.stringify(ident));
    var kind = classify(location.pathname + ' ' + (f.getAttribute('action') || ''));
    send(kind === 'quote_request' || kind === 'demo_request' || kind === 'trial_signup' ? kind : 'form_submit');
  }, true);
  send(classify(location.pathname + location.search));
  setTimeout(personalize, ident.email || ident.company ? 0 : 900);
})();
"""


def build_snippet(key: str, patterns: dict) -> str:
    return _JS.replace("__KEY__", key).replace("__PATTERNS__", json.dumps(patterns))
