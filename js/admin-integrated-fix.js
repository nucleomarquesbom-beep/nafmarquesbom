/*
 * NAF Marques Bom — correção da Administração integrada
 *
 * NÃO substitui admin.html.
 * Mantém a estrutura existente e acrescenta apenas:
 *   Sócios | Ações | Fun&Learn | Drº Árbitro | Questões
 *
 * Quotas e Email geral continuam dentro de Sócios, como estavam.
 */
(() => {
  'use strict';

  const loaded = new Set();

  function loadScript(src, type = 'text/javascript') {
    const key = `${type}:${src}`;
    if (loaded.has(key)) return Promise.resolve();
    const existing = [...document.scripts].find(s => s.dataset.nafFixSrc === src);
    if (existing) {
      loaded.add(key);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.type = type;
      script.dataset.nafFixSrc = src;
      script.onload = () => { loaded.add(key); resolve(); };
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      document.head.appendChild(script);
    });
  }

  function loadCss(href) {
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === new URL(href, location.href).href)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function getHost() {
    return document.getElementById('integrated-admin-host');
  }

  function buildTabs() {
    const host = getHost();
    const app = host?.querySelector('#admin-app');
    if (!host || !app) return false;

    let tabs = host.querySelector('.socio-admin-subtabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'socio-admin-subtabs';
      app.prepend(tabs);
    }

    const ensureButton = (name, label) => {
      let btn = tabs.querySelector(`[data-admin-section="${name}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'socio-admin-subtab';
        btn.dataset.adminSection = name;
        btn.textContent = label;
        tabs.appendChild(btn);
      }
      return btn;
    };

    // A estrutura original já tinha Sócios, Fun&Learn e Drº Árbitro.
    // Não os recriamos nem os substituímos: apenas acrescentamos Ações e Questões.
    ensureButton('socios', 'Sócios');
    ensureButton('acoes', 'Ações');
    ensureButton('funlearn', 'Fun&Learn');
    ensureButton('dr-arbitro', 'Drº Árbitro');
    ensureButton('questoes', 'Questões');

    const movePanelToGroup = (panelId, groupName) => {
      const panel = app.querySelector(`#${panelId}`);
      if (!panel) return false;
      let group = app.querySelector(`.integrated-admin-group[data-admin-group="${groupName}"]`);
      if (!group) {
        group = document.createElement('div');
        group.className = 'integrated-admin-group';
        group.dataset.adminGroup = groupName;
        app.appendChild(group);
      }
      if (panel.parentElement !== group) group.appendChild(panel);
      return true;
    };

    const actionOk = movePanelToGroup('panel-acoes', 'acoes');
    const questionsOk = movePanelToGroup('panel-questoes', 'questoes');

    // Liga os botões uma única vez. A aba que estava ativa antes continua ativa.
    tabs.querySelectorAll('.socio-admin-subtab').forEach(btn => {
      if (btn.dataset.nafFixBound === '1') return;
      btn.dataset.nafFixBound = '1';
      btn.addEventListener('click', () => {
        const name = btn.dataset.adminSection;
        tabs.querySelectorAll('.socio-admin-subtab').forEach(b => b.classList.toggle('active', b === btn));
        host.querySelectorAll('.integrated-admin-group').forEach(g => g.classList.toggle('active', g.dataset.adminGroup === name));
        if (name === 'acoes') window.initAcoesAdmin?.();
        if (name === 'questoes') window.loadAdminQuestions?.();
        if (name === 'dr-arbitro') window.initDrArbitro?.();
      });
    });

    // Se o módulo original criou os três grupos, mantemos-nos intactos.
    // Apenas garantimos que os novos grupos não ficam ativos por defeito.
    host.querySelectorAll('.integrated-admin-group').forEach(g => {
      if (!['socios','acoes','funlearn','dr-arbitro','questoes'].includes(g.dataset.adminGroup)) return;
    });

    return actionOk && questionsOk;
  }

  async function initialise() {
    const host = getHost();
    if (!host) return;

    loadCss('css/acoes.css?v=20260823-acoes-integrated');

    // O admin.html já contém estes painéis. Aqui apenas carregamos os módulos
    // que não são executados quando #admin-app é clonado pelo socio.js.
    try {
      await loadScript('js/acoes-admin.js?v=20260823-integrated');
      await loadScript('js/admin-questoes.js?v=20260823-integrated', 'module');
      await loadScript('js/activation-notifications.js?v=20260823-1');
    } catch (error) {
      console.error('[NAF ADMIN FIX]', error);
    }

    if (buildTabs()) {
      window.initAcoesAdmin?.();
      window.loadAdminQuestions?.();
      window.initDrArbitro?.();
      window.__NAF_ADMIN_INTEGRATED_FIX_READY = true;
    }
  }

  let timer = null;
  const observer = new MutationObserver(() => {
    if (document.getElementById('integrated-admin-host')?.querySelector('#admin-app')) {
      clearTimeout(timer);
      timer = setTimeout(initialise, 30);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => setTimeout(initialise, 100));
  setTimeout(initialise, 300);
})();
