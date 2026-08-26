/*
 * NAF Marques Bom — correções finais da Administração
 *
 * Objetivos:
 * 1) manter ações anuladas no histórico;
 * 2) transformar Quotas numa aba própria e retirar operações de quotas da aba Sócios;
 * 3) permitir gerar quotas anuais manualmente e enviar avisos de quotas em atraso;
 * 4) impedir a duplicação do módulo Drº Árbitro na administração integrada.
 *
 * Esta camada é deliberadamente independente dos módulos existentes. Não substitui
 * admin.js, acoes-admin.js ou dr-arbitro.js; integra-se sobre eles para preservar
 * as funções já existentes.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[c]));

  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  const money = v => `${Number(v || 0).toFixed(2).replace('.', ',')} €`;

  function show(message, type = 'success') {
    const el = $('admin-result');
    if (!el) return;
    el.textContent = String(message);
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  function ensureCss() {
    if ($('naf-admin-final-fixes-css')) return;
    const style = document.createElement('style');
    style.id = 'naf-admin-final-fixes-css';
    style.textContent = `
      /* Quotas como módulo independente */
      #panel-quotas.naf-quotas-panel {
        display: none;
      }
      #panel-quotas.naf-quotas-panel.active {
        display: block;
      }
      .naf-quota-toolbar {
        display:grid;
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:12px;
        align-items:end;
      }
      .naf-quota-toolbar label {
        display:grid;
        gap:6px;
      }
      .naf-quota-toolbar .wide {
        grid-column:1/-1;
      }
      .naf-quota-actions {
        display:flex;
        gap:8px;
        flex-wrap:wrap;
        align-items:center;
      }
      .naf-quota-members {
        display:grid;
        gap:8px;
        max-height:420px;
        overflow:auto;
        margin-top:12px;
      }
      .naf-quota-member {
        display:grid;
        grid-template-columns:auto 1fr auto;
        gap:12px;
        align-items:center;
        padding:10px 12px;
        border:1px solid rgba(0,0,0,.08);
        border-radius:10px;
      }
      .naf-quota-member small { display:block; opacity:.7; }
      .naf-quota-member .debt { font-weight:700; text-align:right; }
      .naf-quota-status { margin-top:10px; }
      .naf-quota-status.success { color:#087443; }
      .naf-quota-status.error { color:#b42318; }
      .naf-quota-status.info { color:#175cd3; }
      .naf-quota-history {
        display:grid;
        gap:8px;
      }
      .naf-quota-history-item {
        display:grid;
        grid-template-columns:1fr auto;
        gap:12px;
        align-items:center;
        padding:12px;
        border:1px solid rgba(0,0,0,.08);
        border-radius:10px;
      }
      .naf-quota-history-item.anulada { border-left:4px solid #b42318; }
      .naf-action-history {
        margin-top:20px;
      }
      .naf-action-history .acao-badge { margin-right:4px; }
      @media (max-width:800px) {
        .naf-quota-toolbar { grid-template-columns:1fr; }
        .naf-quota-toolbar .wide { grid-column:auto; }
        .naf-quota-member { grid-template-columns:auto 1fr; }
        .naf-quota-member .debt { grid-column:2; text-align:left; }
        .naf-quota-history-item { grid-template-columns:1fr; }
      }
      /* As operações de quotas deixam de aparecer na lista de Sócios. */
      #panel-socios .manual-quota-open,
      #panel-socios #btn-send-overdue-selected { display:none !important; }
      #panel-socios .admin-table th:nth-child(6),
      #panel-socios .admin-table td:nth-child(6) { display:none !important; }
    `;
    document.head.appendChild(style);
  }

  function addQuotasTab() {
    const app = $('admin-app');
    const tabs = app?.querySelector('.admin-tabs');
    const panel = $('panel-quotas');
    if (!app || !tabs || !panel) return null;

    panel.classList.add('admin-tab-panel', 'naf-quotas-panel');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'tab-quotas');
    panel.hidden = true;

    let tab = $('tab-quotas');
    if (!tab) {
      tab = document.createElement('button');
      tab.id = 'tab-quotas';
      tab.className = 'admin-tab';
      tab.type = 'button';
      tab.role = 'tab';
      tab.dataset.panel = 'quotas';
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', 'panel-quotas');
      tab.textContent = 'Quotas';
      tabs.appendChild(tab);
    }

    // Retira o painel da sequência da aba Sócios e coloca-o como painel próprio.
    if (panel.parentElement !== app) app.appendChild(panel);

    const activate = () => {
      app.querySelectorAll('.admin-tab').forEach(b => {
        const active = b === tab;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      app.querySelectorAll('.admin-tab-panel').forEach(p => {
        const active = p === panel;
        p.classList.toggle('active', active);
        p.hidden = !active;
      });
      panel.hidden = false;
      refreshQuotaModule().catch(e => quotaMessage(e.message || String(e), 'error'));
    };

    if (tab.dataset.nafQuotaBound !== '1') {
      tab.dataset.nafQuotaBound = '1';
      tab.addEventListener('click', activate);
    }

    return { tab, panel, activate };
  }

  function quotaMessage(message, type = 'success') {
    const targets = [$('quota-module-result'), $('quota-excel-result'), $('manual-quota-result')].filter(Boolean);
    const target = targets[0];
    if (!target) {
      show(message, type);
      return;
    }
    target.textContent = String(message);
    target.className = `admin-result ${type}`;
    target.hidden = false;
  }

  function ensureQuotaModuleUi() {
    const panel = $('panel-quotas');
    if (!panel) return;

    if (!$('quota-module-result')) {
      const intro = document.createElement('div');
      intro.className = 'admin-card';
      intro.id = 'quota-module-control-card';
      intro.innerHTML = `
        <div class="admin-card-header">
          <div>
            <span class="admin-badge">Quotas</span>
            <h3>Gestão de quotas</h3>
            <p class="admin-help">Tudo o que diz respeito a quotas fica nesta aba: gerar quotas, consultar atrasos, enviar avisos, importar/exportar e registar pagamentos.</p>
          </div>
        </div>

        <div class="naf-quota-toolbar">
          <label>
            Ano das quotas
            <input id="naf-quota-year" type="number" min="2000" max="2100" step="1">
          </label>
          <label>
            Valor anual (€)
            <input id="naf-quota-value" type="number" min="0.01" step="0.01" value="12.00">
          </label>
          <label>
            Destinatários
            <select id="naf-quota-target">
              <option value="all">Todos os sócios ativos</option>
              <option value="selected">Sócios selecionados abaixo</option>
            </select>
          </label>
          <div class="naf-quota-actions">
            <button id="naf-quota-generate" type="button" class="admin-small-btn primary">Gerar quotas</button>
          </div>
        </div>

        <div id="quota-module-result" class="admin-result" hidden aria-live="polite"></div>
      `;
      panel.prepend(intro);
    }

    const year = $('naf-quota-year');
    if (year && !year.value) year.value = String(new Date().getFullYear());

    if (!$('quota-overdue-card')) {
      const card = document.createElement('div');
      card.id = 'quota-overdue-card';
      card.className = 'admin-card';
      card.innerHTML = `
        <div class="admin-card-header">
          <div>
            <h3>Quotas em atraso</h3>
            <p class="admin-help">Aqui aparecem os sócios com quotas anuais vencidas. Podes selecionar todos ou apenas alguns e enviar o aviso por email.</p>
          </div>
          <div class="naf-quota-actions">
            <button id="naf-quota-select-all" type="button" class="admin-small-btn">Selecionar todos</button>
            <button id="naf-quota-clear" type="button" class="admin-small-btn">Limpar</button>
            <button id="naf-quota-send-email" type="button" class="admin-small-btn primary">Enviar emails de quotas em atraso</button>
          </div>
        </div>
        <div class="admin-form-grid">
          <label class="wide">Assunto<input id="naf-quota-email-subject" value="Quotas em atraso — Núcleo de Árbitros de Futebol Marques Bom"></label>
          <label class="wide">Mensagem<textarea id="naf-quota-email-message">Caro(a) {NOME},

Verificámos que existem quotas em atraso associadas ao seu registo. Pedimos que proceda à regularização assim que possível.

Obrigado,
Núcleo de Árbitros de Futebol Marques Bom</textarea></label>
        </div>
        <div id="naf-quota-overdue-list" class="naf-quota-members"><div class="admin-loading">A carregar…</div></div>
        <div id="naf-quota-email-result" class="admin-result" hidden aria-live="polite"></div>
      `;
      panel.insertBefore(card, $('admin-excel-panel') || panel.firstChild?.nextSibling || null);
    }

    if (!$('quota-history-card')) {
      const card = document.createElement('div');
      card.id = 'quota-history-card';
      card.className = 'admin-card';
      card.innerHTML = `
        <div class="admin-card-header">
          <div>
            <h3>Histórico de quotas</h3>
            <p class="admin-help">Consulta os pagamentos registados sem sair da aba Quotas.</p>
          </div>
          <button id="naf-quota-refresh-history" type="button" class="admin-small-btn">Atualizar</button>
        </div>
        <div id="naf-quota-history" class="naf-quota-history"><div class="admin-loading">A carregar…</div></div>
      `;
      panel.appendChild(card);
    }

    if ($('naf-quota-generate')?.dataset.bound !== '1') {
      $('naf-quota-generate').dataset.bound = '1';
      $('naf-quota-generate').addEventListener('click', () => generateQuotas().catch(e => quotaMessage(e.message || String(e), 'error')));
    }
    if ($('naf-quota-select-all')?.dataset.bound !== '1') {
      $('naf-quota-select-all').dataset.bound = '1';
      $('naf-quota-select-all').addEventListener('click', () => document.querySelectorAll('#naf-quota-overdue-list .naf-quota-check').forEach(x => { x.checked = true; }));
    }
    if ($('naf-quota-clear')?.dataset.bound !== '1') {
      $('naf-quota-clear').dataset.bound = '1';
      $('naf-quota-clear').addEventListener('click', () => document.querySelectorAll('#naf-quota-overdue-list .naf-quota-check').forEach(x => { x.checked = false; }));
    }
    if ($('naf-quota-send-email')?.dataset.bound !== '1') {
      $('naf-quota-send-email').dataset.bound = '1';
      $('naf-quota-send-email').addEventListener('click', () => sendOverdueEmails().catch(e => quotaMessage(e.message || String(e), 'error')));
    }
    if ($('naf-quota-refresh-history')?.dataset.bound !== '1') {
      $('naf-quota-refresh-history').dataset.bound = '1';
      $('naf-quota-refresh-history').addEventListener('click', () => loadQuotaHistory().catch(e => quotaMessage(e.message || String(e), 'error')));
    }
  }

  async function generateQuotas() {
    const client = getClient();
    if (!client) throw new Error('Ligação ao Supabase indisponível.');

    const year = Number($('naf-quota-year')?.value);
    const value = Number($('naf-quota-value')?.value);
    const target = $('naf-quota-target')?.value || 'all';
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Indica um ano válido.');
    if (!Number.isFinite(value) || value <= 0) throw new Error('Indica um valor de quota válido.');

    let ids = null;
    if (target === 'selected') {
      ids = [...document.querySelectorAll('#naf-quota-overdue-list .naf-quota-check:checked')].map(x => x.value);
      if (!ids.length) throw new Error('Seleciona pelo menos um sócio.');
    }

    const button = $('naf-quota-generate');
    if (button) { button.disabled = true; button.textContent = 'A gerar…'; }
    try {
      const { data, error } = await client.rpc('admin_gerar_quotas_anuais', {
        p_ano: year,
        p_valor: Number(value.toFixed(2)),
        p_socio_ids: ids
      });
      if (error) throw error;
      const generated = Number(data?.quotas_geradas ?? data?.geradas ?? 0);
      const skipped = Number(data?.ja_existiam ?? data?.existentes ?? 0);
      quotaMessage(`Quotas de ${year} processadas. ${generated} criada(s); ${skipped} já existiam.`, 'success');
      await refreshQuotaModule();
      if (typeof window.loadMembers === 'function') await window.loadMembers();
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Gerar quotas'; }
    }
  }

  async function loadOverdue() {
    const client = getClient();
    const root = $('naf-quota-overdue-list');
    if (!client || !root) return;

    const { data: members, error: me } = await client
      .from('socios')
      .select('id,numero_socio,nome,email,ativo')
      .eq('ativo', true)
      .order('numero_socio', { ascending: true });
    if (me) throw me;

    const ids = (members || []).map(x => x.id);
    if (!ids.length) {
      root.innerHTML = '<div class="admin-loading">Não existem sócios ativos.</div>';
      return;
    }

    const { data: quotas, error: qe } = await client
      .from('quotas')
      .select('id,socio_id,ano,mes,valor,pago,estado,data_pagamento')
      .in('socio_id', ids)
      .order('ano', { ascending: true });
    if (qe) throw qe;

    const current = new Date();
    const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);
    const byMember = new Map();

    for (const q of quotas || []) {
      const month = Number(q.mes || 12);
      const date = new Date(Number(q.ano), month - 1, 1);
      const state = String(q.estado || 'pendente').toLowerCase();
      const unpaid = q.pago !== true && !['pago','paga','isento','anulado'].includes(state);
      if (!unpaid || date >= currentMonth) continue;
      const item = byMember.get(String(q.socio_id)) || { count: 0, value: 0, years: [] };
      item.count += 1;
      item.value += Number(q.valor || 0);
      item.years.push(Number(q.ano));
      byMember.set(String(q.socio_id), item);
    }

    const overdue = (members || []).filter(m => byMember.has(String(m.id)));
    if (!overdue.length) {
      root.innerHTML = '<div class="admin-loading">Não existem quotas em atraso neste momento.</div>';
      return;
    }

    root.innerHTML = overdue.map(m => {
      const x = byMember.get(String(m.id));
      return `<label class="naf-quota-member">
        <input class="naf-quota-check" type="checkbox" value="${esc(m.id)}" ${m.email ? '' : 'disabled'}>
        <span><strong>${esc(m.numero_socio)} — ${esc(m.nome)}</strong><small>${m.email ? esc(m.email) : 'Sem email'}</small><small>${x.count} quota(s) em atraso · ${[...new Set(x.years)].sort((a,b)=>a-b).join(', ')}</small></span>
        <span class="debt">${money(x.value)}</span>
      </label>`;
    }).join('');
  }

  async function sendOverdueEmails() {
    const client = getClient();
    if (!client) throw new Error('Ligação ao Supabase indisponível.');

    const ids = [...document.querySelectorAll('#naf-quota-overdue-list .naf-quota-check:checked')].map(x => String(x.value));
    if (!ids.length) throw new Error('Seleciona pelo menos um sócio com quotas em atraso e email.');

    const subject = $('naf-quota-email-subject')?.value?.trim() || 'Quotas em atraso';
    const template = $('naf-quota-email-message')?.value?.trim() || '';
    if (!template) throw new Error('Escreve a mensagem do aviso.');

    const { data: members, error } = await client
      .from('socios')
      .select('id,numero_socio,nome,email,ativo')
      .in('id', ids)
      .eq('ativo', true);
    if (error) throw error;

    const button = $('naf-quota-send-email');
    if (button) { button.disabled = true; button.textContent = 'A enviar…'; }

    let sent = 0;
    const failures = [];
    try {
      for (const member of members || []) {
        if (!member.email) { failures.push(`${member.nome}: sem email`); continue; }
        try {
          const { data, error: fnError } = await client.functions.invoke(
            (window.NAF_ADMIN_CONFIG || {}).EMAIL_FUNCTION || 'admin-mail',
            {
              body: {
                to: member.email,
                subject,
                text: template.replaceAll('{NOME}', member.nome || 'sócio')
              }
            }
          );
          if (fnError) {
            let msg = fnError.message || 'Erro no envio.';
            try { const body = await fnError.context?.json(); if (body?.error) msg = body.error; } catch (_) {}
            throw new Error(msg);
          }
          if (data?.error) throw new Error(data.error);
          sent += 1;
        } catch (e) {
          failures.push(`${member.nome}: ${e.message || String(e)}`);
        }
      }
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Enviar emails de quotas em atraso'; }
    }

    const result = $('naf-quota-email-result');
    if (result) {
      result.hidden = false;
      if (failures.length) {
        result.className = `admin-result ${sent ? 'info' : 'error'}`;
        result.textContent = `${sent} email(s) enviado(s); ${failures.length} falharam. ${failures.slice(0,3).join(' | ')}`;
      } else {
        result.className = 'admin-result success';
        result.textContent = `${sent} aviso(s) de quotas enviado(s) com sucesso.`;
      }
    }
  }

  async function loadQuotaHistory() {
    const client = getClient();
    const root = $('naf-quota-history');
    if (!client || !root) return;

    const { data, error } = await client
      .from('recibos_quotas')
      .select('id,numero_recibo,socio_id,valor_total,metodo_pagamento,emitido_em,storage_path,email_enviado_em,email_erro,socios(numero_socio,nome,email)')
      .order('emitido_em', { ascending: false })
      .limit(100);
    if (error) throw error;

    if (!(data || []).length) {
      root.innerHTML = '<div class="admin-loading">Ainda não existem recibos de quotas.</div>';
      return;
    }

    root.innerHTML = data.map(r => `
      <div class="naf-quota-history-item">
        <div>
          <strong>Recibo nº ${esc(r.numero_recibo || r.id)}</strong>
          <div>${esc(r.socios?.numero_socio ?? '')} — ${esc(r.socios?.nome ?? '')}</div>
          <small>${r.emitido_em ? new Date(r.emitido_em).toLocaleString('pt-PT') : '—'} · ${esc(r.metodo_pagamento || '')}</small>
        </div>
        <strong>${money(r.valor_total)}</strong>
      </div>
    `).join('');
  }

  async function refreshQuotaModule() {
    ensureQuotaModuleUi();
    await Promise.all([loadOverdue(), loadQuotaHistory()]);
  }

  function preserveAnnulledActionsInAdmin() {
    const root = $('acoes-admin-list');
    if (!root || root.dataset.nafHistoryReady === '1') return;
    root.dataset.nafHistoryReady = '1';

    const renderHistory = () => {
      let box = $('naf-action-history');
      if (!box) {
        box = document.createElement('div');
        box.id = 'naf-action-history';
        box.className = 'admin-card naf-action-history';
        box.innerHTML = `
          <div class="admin-card-header">
            <div>
              <h3>Histórico de ações</h3>
              <p class="admin-help">As ações anuladas ou encerradas permanecem aqui e não são apagadas.</p>
            </div>
          </div>
          <div id="naf-action-history-list" class="naf-quota-history"></div>
        `;
        root.parentElement?.appendChild(box);
      }

      const list = $('naf-action-history-list');
      if (!list) return;

      const source = Array.isArray(window.__NAF_ACOES_ADMIN_ACTIONS)
        ? window.__NAF_ACOES_ADMIN_ACTIONS
        : null;

      if (!source) return;

      const historical = source.filter(a => a.anulada === true || a.ativa === false);
      list.innerHTML = historical.length ? historical.map(a => `
        <div class="naf-quota-history-item ${a.anulada ? 'anulada' : ''}">
          <div>
            <strong>${esc(a.titulo)}</strong>
            <div>${esc(a.data || 'Data não indicada')} ${a.hora ? '· ' + esc(String(a.hora).slice(0,5)) : ''}</div>
            <small>${a.anulada ? 'Anulada' : 'Encerrada'}${a.anulada_em ? ' · ' + new Date(a.anulada_em).toLocaleString('pt-PT') : ''}</small>
          </div>
          <span class="acao-badge ${a.anulada ? 'warn' : ''}">${a.anulada ? 'Anulada' : 'Encerrada'}</span>
        </div>
      `).join('') : '<div class="admin-loading">Ainda não existem ações no histórico.</div>';
    };

    // Observa o render do módulo Ações sem substituir a implementação original.
    const observer = new MutationObserver(() => {
      try { renderHistory(); } catch (_) {}
    });
    observer.observe(root, { childList: true, subtree: true });
    renderHistory();
  }

  function captureActionsState() {
    // O acoes-admin.js mantém o estado internamente. Criamos uma pequena ponte
    // sobre loadAcoesAdmin para expor o último conjunto apenas para o histórico.
    if (window.__NAF_ACTIONS_LOAD_WRAPPED || typeof window.loadAcoesAdmin !== 'function') return;
    const original = window.loadAcoesAdmin;
    window.loadAcoesAdmin = async (...args) => {
      const result = await original(...args);
      // Reconstitui a lista diretamente da BD, sem tocar no estado interno.
      try {
        const c = getClient();
        if (c) {
          const { data } = await c.from('acoes').select('*').order('created_at', { ascending: false });
          window.__NAF_ACOES_ADMIN_ACTIONS = data || [];
          preserveAnnulledActionsInAdmin();
        }
      } catch (_) {}
      return result;
    };
    window.__NAF_ACTIONS_LOAD_WRAPPED = true;
  }

  function removeDuplicateDrAdmin() {
    const dedicated = $('dr-futebol') || $('dr-futsal');
    if (!dedicated) return;

    document.querySelectorAll('#dr-arbitro-admin-integrado').forEach(el => el.remove());

    const panel = $('panel-dr-arbitro');
    if (panel) {
      // O módulo dedicado usa estes dois contentores. Qualquer segundo editor
      // criado dentro do mesmo painel é legado/duplicado e deve desaparecer.
      panel.querySelectorAll('.admin-subpanel').forEach(el => {
        if (el.id !== 'dr-arbitro-admin-integrado' && el.querySelector('#dr-integrado-content')) el.remove();
      });
    }
  }

  function boot() {
    ensureCss();
    addQuotasTab();
    ensureQuotaModuleUi();
    captureActionsState();
    preserveAnnulledActionsInAdmin();
    removeDuplicateDrAdmin();

    // O Drº Árbitro pode ser iniciado novamente ao abrir a aba; o observador
    // garante que o editor integrado não volta a ficar duplicado.
    const observer = new MutationObserver(() => {
      removeDuplicateDrAdmin();
      captureActionsState();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Se o módulo foi carregado antes dos restantes scripts, tentar novamente.
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      addQuotasTab();
      ensureQuotaModuleUi();
      captureActionsState();
      preserveAnnulledActionsInAdmin();
      removeDuplicateDrAdmin();
      if (attempts >= 30) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
