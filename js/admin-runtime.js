/* NAF Marques Bom — integração da Administração em socio.html.
   Fonte de verdade da estrutura: admin.html.
   Este ficheiro NÃO implementa a Administração; apenas adapta a mesma
   estrutura quando ela é apresentada dentro do dashboard do sócio.
*/
(() => {
  'use strict';

  const isStandaloneAdmin = /(^|\/)admin\.html$/i.test(location.pathname) || /(^|\/)admin\/?$/i.test(location.pathname);
  const $ = id => document.getElementById(id);

  const sections = [
    ['socios', 'Sócios'],
    ['quotas', 'Quotas'],
    ['email', 'Email'],
    ['funlearn', 'Fun&Learn'],
    ['dr-arbitro', 'Drº Árbitro'],
    ['questoes', 'Questões'],
    ['acoes', 'Ações']
  ];

  function injectStyles() {
    if ($('naf-admin-runtime-css')) return;
    const style = document.createElement('style');
    style.id = 'naf-admin-runtime-css';
    style.textContent = `
      .member-photo-open,[data-member-photo],#admin-photo-input{display:none!important}
      #integrated-admin-host .admin-tabs{display:none!important}
      #integrated-admin-host .socio-admin-subtabs{display:flex!important;align-items:center;gap:5px;flex-wrap:wrap;width:max-content;max-width:100%;margin:0 0 22px;padding:5px;background:#f1edf4;border:1px solid #e6dfea;border-radius:14px}
      #integrated-admin-host .socio-admin-subtab{border:0;min-height:42px;padding:9px 19px;border-radius:10px;background:transparent;color:#5b2a72;font:inherit;font-weight:700;cursor:pointer}
      #integrated-admin-host .socio-admin-subtab.active{background:#fff;color:#4a205e;box-shadow:0 2px 7px rgba(50,25,60,.10)}
      #integrated-admin-host .integrated-admin-group{display:none!important;width:100%}
      #integrated-admin-host .integrated-admin-group.active{display:block!important}
      #integrated-admin-host .integrated-admin-group>.admin-tab-panel{display:block!important}
      @media(max-width:800px){#integrated-admin-host .socio-admin-subtabs{width:100%;overflow-x:auto;flex-wrap:nowrap}#integrated-admin-host .socio-admin-subtab{flex:0 0 auto;white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function removeAdminPhotoControls(root = document) {
    root.querySelectorAll('.member-photo-open,[data-member-photo],#admin-photo-input').forEach(el => el.remove());
  }

  function deduplicateDrArbitro(root = document) {
    const official = root.querySelector('#panel-dr-arbitro');
    const dedicated = root.querySelector('#dr-futebol,#dr-futsal');
    const integrated = root.querySelector('#dr-arbitro-admin-integrado');
    if (official && dedicated && integrated) integrated.remove();
    if (isStandaloneAdmin && official) {
      root.querySelectorAll('#dr-arbitro-admin-integrado').forEach(el => el.remove());
    }
  }

  function setupIntegratedAdmin(host) {
    const app = host?.querySelector('#admin-app');
    if (!host || !app) return false;

    // Se já existe uma montagem válida, não a reconstruir.
    // O host pode sobreviver a uma recarga do admin.html. Nunca confiamos
    // apenas numa flag antiga: verificamos sempre a montagem atual.
    const existingTabs = app.querySelector(':scope > .socio-admin-subtabs');
    if (existingTabs && sections.every(([name]) => app.querySelector(`#integrated-admin-group-${name}`))) {
      host.dataset.nafRuntimeReady = '1';
      return true;
    }

    const panels = {};
    for (const [name] of sections) {
      panels[name] = app.querySelector(`#panel-${name}`);
    }

    // O admin.html é a fonte oficial. Se algum painel estiver em falta,
    // mostramos ainda assim as abas e um aviso explícito em vez de esconder
    // toda a navegação administrativa.
    const tabs = document.createElement('div');
    tabs.className = 'socio-admin-subtabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Secções da administração');

    const groups = {};
    for (const [name, label] of sections) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'socio-admin-subtab';
      button.dataset.adminSection = name;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `integrated-admin-group-${name}`);
      button.textContent = label;
      tabs.appendChild(button);

      const group = document.createElement('div');
      group.className = 'integrated-admin-group';
      group.id = `integrated-admin-group-${name}`;
      group.dataset.adminGroup = name;

      if (panels[name]) {
        group.appendChild(panels[name]);
      } else {
        const card = document.createElement('div');
        card.className = 'admin-card';
        card.innerHTML = `<h3>${label}</h3><p class="admin-help">Este módulo não está presente no <code>admin.html</code> publicado.</p>`;
        group.appendChild(card);
      }
      groups[name] = group;
    }

    app.querySelectorAll('.integrated-admin-group,.socio-admin-subtabs').forEach(el => el.remove());
    app.prepend(tabs);
    app.append(...Object.values(groups));

    const activate = name => {
      for (const button of tabs.querySelectorAll('.socio-admin-subtab')) {
        const active = button.dataset.adminSection === name;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      }
      for (const group of Object.values(groups)) {
        group.classList.toggle('active', group.dataset.adminGroup === name);
      }

      if (name === 'acoes') window.loadAcoesAdmin?.();
      if (name === 'questoes') window.loadAdminQuestions?.();
      if (name === 'dr-arbitro') window.NAF_DR_ARBITRO_START?.();
    };

    tabs.querySelectorAll('.socio-admin-subtab').forEach(button => {
      button.addEventListener('click', () => activate(button.dataset.adminSection));
    });

    activate('socios');
    host.dataset.nafRuntimeReady = '1';
    return true;
  }

  window.NAF_SETUP_INTEGRATED_ADMIN = setupIntegratedAdmin;

  function run() {
    injectStyles();
    removeAdminPhotoControls();
    deduplicateDrArbitro();

    if (!isStandaloneAdmin) {
      const host = $('#integrated-admin-host');
      if (host?.querySelector('#admin-app')) setupIntegratedAdmin(host);
    }
  }

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
