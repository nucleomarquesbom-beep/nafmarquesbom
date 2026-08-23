/* NAF — integração da aba Ações na administração do espaço de sócios */
(() => {
  'use strict';

  const ACTION_SCRIPT = 'js/acoes-admin.js?v=20260823-integrated';
  const ACTION_CSS = 'css/acoes-admin.css?v=20260823-integrated';

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(s => s.src && s.src.includes(src.split('?')[0]));
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.loaded = '0';
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error('Não foi possível carregar o módulo de Ações.'));
      document.head.appendChild(script);
    });
  }

  function loadCssOnce() {
    if ([...document.styleSheets].some(s => s.href && s.href.includes('/css/acoes-admin.css'))) return;
    if (document.querySelector('link[data-acoes-admin-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ACTION_CSS;
    link.dataset.acoesAdminCss = '1';
    document.head.appendChild(link);
  }

  async function integrate() {
    const host = document.getElementById('integrated-admin-host');
    const app = host?.querySelector('#admin-app');
    const panel = app?.querySelector('#panel-acoes');
    if (!host || !app || !panel) return false;

    loadCssOnce();

    let subtabs = app.querySelector('.socio-admin-subtabs');
    if (!subtabs) return false;

    let tab = subtabs.querySelector('[data-admin-section="acoes"]');
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'socio-admin-subtab';
      tab.dataset.adminSection = 'acoes';
      tab.textContent = 'Ações';
      subtabs.appendChild(tab);
    }

    let group = app.querySelector('.integrated-admin-group[data-admin-group="acoes"]');
    if (!group) {
      group = document.createElement('div');
      group.className = 'integrated-admin-group';
      group.dataset.adminGroup = 'acoes';
      group.appendChild(panel);
      app.appendChild(group);
    } else if (panel.parentElement !== group) {
      group.appendChild(panel);
    }

    if (tab.dataset.acoesBound !== '1') {
      tab.dataset.acoesBound = '1';
      tab.addEventListener('click', async () => {
        subtabs.querySelectorAll('.socio-admin-subtab').forEach(b => {
          b.classList.toggle('active', b === tab);
        });
        app.querySelectorAll('.integrated-admin-group').forEach(g => {
          g.classList.toggle('active', g === group);
        });
        try {
          await loadScriptOnce(ACTION_SCRIPT);
          window.initAcoesAdmin?.();
          window.loadAcoesAdmin?.();
        } catch (error) {
          console.error('[AÇÕES ADMIN INTEGRADO]', error);
        }
      });
    }

    /* O painel não pode aparecer fora da aba Ações. */
    const active = tab.classList.contains('active');
    panel.classList.toggle('active', active);
    group.classList.toggle('active', active);

    if (!app.dataset.acoesIntegratedBound) {
      app.dataset.acoesIntegratedBound = '1';
      try {
        await loadScriptOnce(ACTION_SCRIPT);
        window.initAcoesAdmin?.();
      } catch (error) {
        console.error('[AÇÕES ADMIN INTEGRADO]', error);
      }
    }

    return true;
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => integrate().catch(console.error), 50);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true });
  } else {
    schedule();
  }
})();
