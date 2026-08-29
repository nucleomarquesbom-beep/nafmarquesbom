(() => {
  'use strict';
  const getCfg = () => window.NAF_ADMIN_CONFIG || {};
  function sharedSupabase() {
    if (window.__NAF_SUPABASE) return window.__NAF_SUPABASE;
    if (window.supabaseClient) {
      window.__NAF_SUPABASE = window.supabaseClient;
      return window.__NAF_SUPABASE;
    }
    const c=getCfg();
    if (window.supabase?.createClient && c.SUPABASE_URL && c.SUPABASE_ANON_KEY) {
      const client=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
      window.__NAF_SUPABASE=client;
      window.supabaseClient=client;
      return client;
    }
    return null;
  }
  window.NAF_GET_SHARED_SUPABASE=sharedSupabase;
  function tabs(root=document) {
    root.querySelectorAll('.admin-tab[data-panel]').forEach(btn => {
      if (btn.dataset.consolidatedBound==='1') return;
      btn.dataset.consolidatedBound='1';
      btn.addEventListener('click',()=>{
        const name=btn.dataset.panel;
        root.querySelectorAll('.admin-tab[data-panel]').forEach(b=>{
          const on=b===btn;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));
        });
        root.querySelectorAll('.admin-tab-panel[id]').forEach(panel=>{
          const on=panel.id===`panel-${name}`;
          panel.hidden=!on;panel.classList.toggle('active',on);
        });
      });
    });
  }
  function actionToggles(root=document) {
    root.querySelectorAll('.acao-toggle[data-toggle]').forEach(btn=>{
      if(btn.dataset.consolidatedBound==='1') return;
      btn.dataset.consolidatedBound='1';
      const input=root.getElementById?.(btn.dataset.toggle)||document.getElementById(btn.dataset.toggle);
      if(!input)return;
      const sync=()=>{btn.setAttribute('aria-pressed',String(input.checked));btn.classList.toggle('active',input.checked);};
      btn.addEventListener('click',()=>{input.checked=!input.checked;sync();});
      sync();
    });
  }
  document.addEventListener('DOMContentLoaded',()=>{sharedSupabase();tabs();actionToggles();});
})();