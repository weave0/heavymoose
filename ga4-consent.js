/* GA4: one site stream, explicit analytics choice, advertising always denied. */
(() => {
  'use strict';
  const tag = document.currentScript;
  const id = tag && tag.dataset.ga4;
  const hosts = tag && (tag.dataset.hosts || '').split(',');
  if (!/^G-[A-Z0-9]+$/.test(id || '') || !hosts.includes(location.hostname) || window.__gfdGa4Consent) return;
  window.__gfdGa4Consent = true;
  const key = 'gfd-analytics-consent-v1';
  let choice;
  try { choice = localStorage.getItem(key); } catch (_) {}
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
  window.gtag('set', {allow_google_signals: false, allow_ad_personalization_signals: false});
  let loaded = false;
  function cleanUrl(value) {
    try { const u = new URL(value); return u.origin + u.pathname; } catch (_) { return ''; }
  }
  function apply(value) {
    choice = value;
    window['ga-disable-' + id] = value !== 'granted';
    window.gtag('consent', 'update', {analytics_storage: value === 'granted' ? 'granted' : 'denied'});
    if (value !== 'granted' || loaded) return;
    loaded = true;
    window.gtag('js', new Date());
    window.gtag('config', id, {
      page_location: cleanUrl(location.href), page_referrer: cleanUrl(document.referrer),
      allow_google_signals: false, allow_ad_personalization_signals: false,
      debug_mode: new URLSearchParams(location.search).get('ga_debug') === '1'
    });
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(script);
  }
  if (choice === 'granted' || choice === 'denied') apply(choice);
  function mount() {
    const style = document.createElement('style');
    style.textContent = '#gfd-analytics-choice{position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;z-index:2147483646;padding:18px;background:#111827;color:#fff;border:1px solid #64748b;border-radius:12px;box-shadow:0 8px 32px #0005;font:15px/1.5 system-ui,sans-serif}#gfd-analytics-choice p{margin:0 0 12px}#gfd-analytics-choice button,#gfd-analytics-settings{font:inherit;cursor:pointer;border:1px solid #94a3b8;border-radius:6px;padding:8px 12px;margin:0 8px 0 0;background:#fff;color:#111827}#gfd-analytics-settings{position:fixed;bottom:8px;left:8px;z-index:2147483645;font:12px system-ui,sans-serif}';
    document.head.appendChild(style);
    const panel = document.createElement('section');
    panel.id = 'gfd-analytics-choice';
    panel.setAttribute('role','region');
    panel.setAttribute('aria-label','Analytics preferences');
    const text = document.createElement('p');
    text.textContent = 'Allow Google Analytics to help us understand site visits? Analytics stays off until you choose. Advertising tracking stays off.';
    panel.appendChild(text);
    for (const [label,value] of [['Allow analytics','granted'],['Decline analytics','denied']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => {
        try { localStorage.setItem(key,value); } catch (_) {}
        apply(value); panel.hidden = true;
      });
      panel.appendChild(button);
    }
    panel.hidden = choice === 'granted' || choice === 'denied';
    document.body.appendChild(panel);
    const settings = document.createElement('button');
    settings.type = 'button'; settings.id = 'gfd-analytics-settings'; settings.textContent = 'Analytics preferences';
    settings.addEventListener('click', () => { panel.hidden = !panel.hidden; });
    document.body.appendChild(settings);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
