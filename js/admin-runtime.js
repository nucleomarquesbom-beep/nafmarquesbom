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

    const existingTabs = app.querySelector(':scope > .socio-admin-subtabs');
    if (existingTabs && sections.every(([name]) => app.querySelector(`#integrated-admin-group-${name}`))) {
      host.dataset.nafRuntimeReady = '1';
      return true;
    }

    const panels = {};
    for (const [name] of sections) {
      panels[name] = app.querySelector(`#panel-${name}`);
    }

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

  /*
   * QUOTAS — seleção de comprovativos
   *
   * socio.js já trata do envio para a Edge Function, mas algumas versões
   * antigas do HTML/JS deixaram o input limitado a PDF. Este runtime é
   * carregado depois de socio.js e normaliza a interface para PDF + imagens.
   * Não cria um segundo listener: remove o listener antigo através da
   * substituição do input e instala apenas o fluxo novo.
   */
  function setupQuotaProofUpload() {
    const input = $('quota-comprovativo');
    if (!input || input.dataset.nafQuotaUploadReady === '1') return;

    input.dataset.nafQuotaUploadReady = '1';
    input.accept = 'application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif';

    const label = input.closest('.upload-box');
    if (label) {
      label.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && /selecionar comprovativo/i.test(node.textContent || '')) {
          node.textContent = '📄 Selecionar comprovativo PDF ou imagem';
        }
      });
    }

    // capture=true garante que este fluxo corre antes do listener antigo
    // existente no socio.js. stopImmediatePropagation impede o listener
    // antigo de rejeitar imagens como se fossem PDFs.
    input.addEventListener('change', async event => {
      event.preventDefault();
      event.stopImmediatePropagation();

      const file = event.target.files?.[0];
      if (!file) return;

      const allowed = new Set([
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif'
      ]);
      const nameOk = /\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name);

      if (!allowed.has(file.type) && !nameOk) {
        showQuotaUploadStatus('O comprovativo tem de ser PDF, JPG, JPEG, PNG ou WEBP.', 'error');
        event.target.value = '';
        return;
      }

      if (file.size > 8 * 1024 * 1024) {
        showQuotaUploadStatus('O comprovativo não pode ultrapassar 8 MB.', 'error');
        event.target.value = '';
        return;
      }

      showQuotaUploadStatus(`Ficheiro selecionado: ${file.name} — a ler e validar…`, '');

      try {
        const sb = window.__NAF_SUPABASE;
        if (!sb?.functions?.invoke) {
          throw new Error('Não foi possível inicializar o serviço de quotas.');
        }

        const formData = new FormData();
        formData.append('comprovativo', file, file.name);

        const { data, error } = await sb.functions.invoke('processar-comprovativo', {
          body: formData
        });

        if (error) {
          let message = error.message || 'Não foi possível processar o comprovativo.';
          try {
            const response = error.context;
            if (response && typeof response.json === 'function') {
              const body = await response.json();
              if (body?.error) message = body.error;
              if (Array.isArray(body?.reasons) && body.reasons.length) message = body.reasons.join(' ');
            }
          } catch (_) {}
          throw new Error(message);
        }

        if (data?.error) throw new Error(data.error);

        showQuotaUploadStatus(data?.message || 'Comprovativo processado com sucesso.', 'success');
        event.target.value = '';
      } catch (error) {
        showQuotaUploadStatus(error?.message || 'Não foi possível enviar o comprovativo.', 'error');
        event.target.value = '';
      }
    }, true);
  }

  function showQuotaUploadStatus(text, type) {
    const input = $('quota-comprovativo');
    const card = input?.closest('.quota-upload-card');
    let status = $('quota-comprovativo-file-name');
    if (!status) {
      status = document.createElement('div');
      status.id = 'quota-comprovativo-file-name';
      status.className = 'admin-result';
      card?.appendChild(status);
    }
    status.hidden = false;
    status.className = `admin-result${type ? ` ${type}` : ''}`;
    status.textContent = text;
  }

  function run() {
    injectStyles();
    removeAdminPhotoControls();
    deduplicateDrArbitro();
    setupQuotaProofUpload();

    if (!isStandaloneAdmin) {
      const host = $('#integrated-admin-host');
      if (host?.querySelector('#admin-app')) setupIntegratedAdmin(host);
    }
  }

  window.NAF_SETUP_INTEGRATED_ADMIN = setupIntegratedAdmin;

  const observer = new MutationObserver(() => run());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
