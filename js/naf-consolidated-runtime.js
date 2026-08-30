/* Runtime único: uma instância Supabase partilhada por todos os módulos. */
(() => {
  'use strict';
  const getConfig = () => window.NAF_ADMIN_CONFIG || {};

  function getSharedClient() {
    if (window.__NAF_SUPABASE) return window.__NAF_SUPABASE;
    if (window.supabaseClient) {
      window.__NAF_SUPABASE = window.supabaseClient;
      return window.__NAF_SUPABASE;
    }
    const cfg = getConfig();
    if (!window.supabase?.createClient) return null;
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
    const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.__NAF_SUPABASE = client;
    window.supabaseClient = client;
    return client;
  }

  window.NAF_GET_SHARED_SUPABASE = getSharedClient;
  window.NAF_SUPABASE_READY = !!getSharedClient();

  function bindAdminTabs(root = document) {
    root.querySelectorAll('.admin-tab[data-panel]').forEach(btn => {
      if (btn.dataset.consolidatedBound === '1') return;
      btn.dataset.consolidatedBound = '1';
      btn.addEventListener('click', () => {
        const name = btn.dataset.panel;
        root.querySelectorAll('.admin-tab[data-panel]').forEach(b => {
          const active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        });
        root.querySelectorAll('.admin-tab-panel[id]').forEach(panel => {
          const active = panel.id === `panel-${name}`;
          panel.hidden = !active;
          panel.classList.toggle('active', active);
        });
        if (name === 'acoes') window.loadAcoesAdmin?.();
        if (name === 'questoes') window.loadAdminQuestions?.();
        if (name === 'dr-arbitro') window.NAF_DR_ARBITRO_START?.();
      });
    });
  }


  const boot = () => { getSharedClient(); bindAdminTabs(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
