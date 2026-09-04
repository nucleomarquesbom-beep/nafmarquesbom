/* NAF Marques Bom — runtime consolidado 2026-08-28
   - remove duplicação do Drº Árbitro na Administração
   - remove controlos de fotografia do Admin
   - mantém a administração integrada no Sócio coerente com admin.html
   - elimina a necessidade dos antigos ficheiros *fix/dedup
*/
(() => {
  'use strict';

  const isStandaloneAdmin = /(^|\/)admin\.html$/i.test(location.pathname) || /(^|\/)admin\/?$/i.test(location.pathname);
  const $ = (id) => document.getElementById(id);

  function injectStyles() {
    if (document.getElementById('naf-admin-runtime-css')) return;
    const style = document.createElement('style');
    style.id = 'naf-admin-runtime-css';
    style.textContent = `
      .member-photo-open, [data-member-photo], #admin-photo-input { display:none !important; }
      .socio-admin-subtabs { display:flex; gap:5px; flex-wrap:wrap; margin:0 0 22px; padding:5px; background:#f1edf4; border:1px solid #e6dfea; border-radius:14px; }
      .socio-admin-subtab { border:0; min-height:42px; padding:9px 19px; border-radius:10px; background:transparent; color:#5b2a72; font:inherit; font-weight:700; cursor:pointer; }
      .socio-admin-subtab.active { background:#fff; color:#4a205e; box-shadow:0 2px 7px rgba(50,25,60,.10); }
      .integrated-admin-group { display:none; width:100%; }
      .integrated-admin-group.active { display:block; }
      #integrated-admin-host .admin-tabs { display:none !important; }
      @media(max-width:800px){ .socio-admin-subtabs{overflow-x:auto;flex-wrap:nowrap;} .socio-admin-subtab{flex:0 0 auto;white-space:nowrap;} }
    `;
    document.head.appendChild(style);
  }

  function removeAdminPhotoControls(root = document) {
    root.querySelectorAll('.member-photo-open,[data-member-photo],#admin-photo-input').forEach(el => el.remove());
  }

  function deduplicateDrArbitro(root = document) {
    const official = root.querySelector('#panel-dr-arbitro');
    const dedicated = root.querySelector('#dr-futebol, #dr-futsal');
    const integrated = root.querySelector('#dr-arbitro-admin-integrado');
    if (official && dedicated && integrated) integrated.remove();
    if (isStandaloneAdmin && official) {
      root.querySelectorAll('#dr-arbitro-admin-integrado').forEach(el => el.remove());
    }
  }

  function setupStandaloneTabs() {
    if (!isStandaloneAdmin) return;
    document.querySelectorAll('.admin-tab').forEach(tab => {
      if (tab.dataset.nafRuntimeBound === '1') return;
      tab.dataset.nafRuntimeBound = '1';
      tab.addEventListener('click', () => {
        const name = tab.dataset.panel;
        document.querySelectorAll('.admin-tab').forEach(t => {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', String(active));
        });
        document.querySelectorAll('.admin-tab-panel').forEach(panel => {
          const active = panel.id === `panel-${name}`;
          panel.classList.toggle('active', active);
          panel.hidden = !active;
        });
      });
    });
  }

  function setupIntegratedAdmin(host) {
    const app = host?.querySelector('#admin-app');
    if (!host || !app || host.dataset.nafRuntimeReady === '1') return;

    // A Administração integrada deve usar exatamente os mesmos painéis do admin.html.
    const panelIds = ['socios','quotas','email','funlearn','dr-arbitro','questoes','acoes'];
    const panels = Object.fromEntries(panelIds.map(id => [id, app.querySelector(`#panel-${id}`)]));
    if (!panels.socios || !panels.quotas || !panels.email || !panels.funlearn || !panels['dr-arbitro'] || !panels.questoes || !panels.acoes) return;

    const existingTabs = app.querySelector('.socio-admin-subtabs');
    app.querySelectorAll('.integrated-admin-group').forEach(g => g.remove());
    const tabs = existingTabs || document.createElement('div');
    tabs.className = 'socio-admin-subtabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Secções da administração');
    tabs.innerHTML = '';

    const labels = [
      ['socios','Sócios'], ['quotas','Quotas'], ['email','Email'],
      ['funlearn','Fun&Learn'], ['dr-arbitro','Drº Árbitro'],
      ['questoes','Questões'], ['acoes','Ações']
    ];
    const groups = {};

    for (const [name,label] of labels) {
      const button = document.createElement('button');
      button.type='button'; button.className='socio-admin-subtab';
      button.dataset.adminSection=name; button.setAttribute('role','tab');
      button.textContent=label; tabs.appendChild(button);
      const group=document.createElement('div');
      group.className='integrated-admin-group'; group.dataset.adminGroup=name;
      group.appendChild(panels[name]); groups[name]=group;
    }

    app.prepend(tabs);
    app.append(...Object.values(groups));

    const activate = (name) => {
      tabs.querySelectorAll('.socio-admin-subtab').forEach(b => {
        const active=b.dataset.adminSection===name;
        b.classList.toggle('active',active); b.setAttribute('aria-selected',String(active));
      });
      Object.values(groups).forEach(g=>g.classList.toggle('active',g.dataset.adminGroup===name));
      if(name==='acoes') window.loadAcoesAdmin?.();
      if(name==='questoes') window.loadAdminQuestions?.();
      if(name==='dr-arbitro') window.NAF_DR_ARBITRO_START?.();
    };
    tabs.querySelectorAll('.socio-admin-subtab').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.adminSection)));
    activate('socios');
    host.dataset.nafRuntimeReady='1';
  }

  // Expor a inicialização para o socio.js poder arrancar as sub-abas
  // imediatamente após inserir o #admin-app, sem depender apenas do MutationObserver.
  window.NAF_SETUP_INTEGRATED_ADMIN = setupIntegratedAdmin;

  function run() {
    injectStyles();
    removeAdminPhotoControls();
    deduplicateDrArbitro();
    setupStandaloneTabs();
    const host=$('#integrated-admin-host');
    if(host?.querySelector('#admin-app')) setupIntegratedAdmin(host);
  }

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run,{once:true}); else run();
})();
