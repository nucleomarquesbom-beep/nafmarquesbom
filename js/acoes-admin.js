(() => {
  'use strict';

  const state = {
    sb: null,
    actions: [],
    registrations: new Map()
  };

  const $ = id => document.getElementById(id);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[c]));

  const showResult = (text, type='success') => {
    const el = $('acoes-admin-result');
    if (!el) return;
    el.textContent = text;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  };

  const hideResult = () => {
    const el = $('acoes-admin-result');
    if (el) el.hidden = true;
  };

  const datePt = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('pt-PT');
  };

  const dateTimePt = value => {
    if (!value) return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('pt-PT');
  };

  const money = value =>
    `${Number(value || 0).toFixed(2).replace('.', ',')} €`;

  async function loadXlsx() {
    if (window.XLSX) return window.XLSX;

    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o módulo Excel.'));
      document.head.appendChild(script);
    });

    return window.XLSX;
  }

  function resetForm() {
    $('acao-form').reset();
    $('acao-id').value = '';
    $('acao-valor').value = '0';
    $('acoes-form-title').textContent = 'Criar nova atividade';
    $('acao-save').textContent = 'Criar atividade';
    $('acao-cancel-edit').hidden = true;
  }

  function fillForm(action) {
    $('acao-id').value = action.id;
    $('acao-titulo').value = action.titulo || '';
    $('acao-local').value = action.local || '';
    $('acao-data').value = action.data || '';
    $('acao-hora').value = action.hora ? String(action.hora).slice(0, 5) : '';
    $('acao-prazo').value = action.prazo_inscricao
      ? new Date(action.prazo_inscricao).toISOString().slice(0, 16)
      : '';
    $('acao-limite').value = action.limite_inscricoes ?? '';
    $('acao-valor').value = action.valor ?? 0;
    $('acao-ativa').checked = !!action.ativa;
    $('acao-aberta').checked = !!action.inscricoes_abertas;
    $('acao-pagamento').checked = !!action.pagamento_obrigatorio;
    $('acao-comprovativo').checked = !!action.comprovativo_obrigatorio;
    $('acao-descricao').value = action.descricao || '';

    $('acoes-form-title').textContent = `Editar: ${action.titulo}`;
    $('acao-save').textContent = 'Guardar alterações';
    $('acao-cancel-edit').hidden = false;

    document.querySelector('#panel-acoes')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  async function loadActions() {
    const { data, error } = await state.sb
      .from('acoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    state.actions = data || [];
    renderActions();
  }

  function renderActions() {
    const root = $('acoes-admin-list');
    if (!root) return;

    if (!state.actions.length) {
      root.innerHTML = '<div class="acao-empty">Ainda não existem atividades criadas.</div>';
      return;
    }

    root.innerHTML = state.actions.map(action => {
      const payment = action.pagamento_obrigatorio
        ? `Pagamento: ${money(action.valor)}`
        : 'Sem pagamento';

      return `
        <article class="acao-admin-item">
          <div class="acao-admin-item-head">
            <div>
              <h4>${esc(action.titulo)}</h4>
              <div class="acao-admin-meta">
                <span>📅 ${datePt(action.data)}</span>
                ${action.hora ? `<span>🕐 ${esc(String(action.hora).slice(0,5))}</span>` : ''}
                ${action.local ? `<span>📍 ${esc(action.local)}</span>` : ''}
                <span>💶 ${esc(payment)}</span>
                ${action.limite_inscricoes ? `<span>👥 Limite: ${esc(action.limite_inscricoes)}</span>` : ''}
              </div>
            </div>
            <div class="acao-badges">
              <span class="acao-badge ${action.ativa ? 'ok' : ''}">
                ${action.ativa ? 'Ativa' : 'Inativa'}
              </span>
              <span class="acao-badge ${action.inscricoes_abertas ? 'ok' : ''}">
                ${action.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
              </span>
              ${action.comprovativo_obrigatorio
                ? '<span class="acao-badge warn">Comprovativo obrigatório</span>'
                : ''}
            </div>
          </div>

          <p class="acao-admin-description">${esc(action.descricao || 'Sem descrição.')}</p>

          <div class="acao-admin-buttons">
            <button type="button" class="admin-small-btn primary" data-action-edit="${esc(action.id)}">Editar</button>
            <button type="button" class="admin-small-btn" data-action-toggle="${esc(action.id)}">
              ${action.ativa ? 'Desativar' : 'Ativar'}
            </button>
            <button type="button" class="admin-small-btn" data-action-open="${esc(action.id)}">
              ${action.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
            </button>
            <button type="button" class="admin-small-btn" data-action-registrations="${esc(action.id)}">Ver inscritos</button>
            <button type="button" class="admin-small-btn" data-action-export="${esc(action.id)}">Exportar Excel</button>
          </div>

          <div id="acao-inscricoes-${esc(action.id)}" class="acao-inscricoes-wrap" hidden></div>
        </article>
      `;
    }).join('');

    root.querySelectorAll('[data-action-edit]').forEach(btn => {
      btn.onclick = () => {
        const action = state.actions.find(a => a.id === btn.dataset.actionEdit);
        if (action) fillForm(action);
      };
    });

    root.querySelectorAll('[data-action-toggle]').forEach(btn => {
      btn.onclick = () => toggleAction(btn.dataset.actionToggle, 'ativa');
    });

    root.querySelectorAll('[data-action-open]').forEach(btn => {
      btn.onclick = () => toggleAction(btn.dataset.actionOpen, 'inscricoes_abertas');
    });

    root.querySelectorAll('[data-action-registrations]').forEach(btn => {
      btn.onclick = () => toggleRegistrations(btn.dataset.actionRegistrations);
    });

    root.querySelectorAll('[data-action-export]').forEach(btn => {
      btn.onclick = () => exportRegistrations(btn.dataset.actionExport);
    });
  }

  async function toggleAction(id, field) {
    try {
      const action = state.actions.find(a => a.id === id);
      if (!action) return;

      const next = !action[field];
      const payload = { [field]: next };

      // Não faz sentido deixar inscrições abertas numa atividade inativa.
      if (field === 'ativa' && !next) payload.inscricoes_abertas = false;

      const { error } = await state.sb
        .from('acoes')
        .update(payload)
        .eq('id', id);

      if (error) throw error;

      showResult(field === 'ativa'
        ? (next ? 'Atividade ativada.' : 'Atividade desativada.')
        : (next ? 'Inscrições abertas.' : 'Inscrições fechadas.')
      );

      await loadActions();
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  async function saveAction(event) {
    event.preventDefault();
    hideResult();

    const button = $('acao-save');
    button.disabled = true;

    try {
      const id = $('acao-id').value || null;
      const pagamento = $('acao-pagamento').checked;
      const comprovativo = $('acao-comprovativo').checked;

      if (comprovativo && !pagamento) {
        throw new Error('O comprovativo só pode ser obrigatório quando existe pagamento.');
      }

      const payload = {
        titulo: $('acao-titulo').value.trim(),
        descricao: $('acao-descricao').value.trim() || null,
        local: $('acao-local').value.trim() || null,
        data: $('acao-data').value || null,
        hora: $('acao-hora').value || null,
        prazo_inscricao: $('acao-prazo').value
          ? new Date($('acao-prazo').value).toISOString()
          : null,
        limite_inscricoes: $('acao-limite').value
          ? Number($('acao-limite').value)
          : null,
        ativa: $('acao-ativa').checked,
        inscricoes_abertas: $('acao-aberta').checked,
        pagamento_obrigatorio: pagamento,
        valor: pagamento ? Number($('acao-valor').value || 0) : 0,
        comprovativo_obrigatorio: pagamento && comprovativo
      };

      if (!payload.titulo) throw new Error('Indica o nome da atividade.');

      if (id) {
        const { error } = await state.sb
          .from('acoes')
          .update(payload)
          .eq('id', id);

        if (error) throw error;
        showResult('Atividade atualizada com sucesso.');
      } else {
        const { error } = await state.sb
          .from('acoes')
          .insert(payload);

        if (error) throw error;
        showResult('Atividade criada com sucesso.');
      }

      resetForm();
      await loadActions();
    } catch (error) {
      showResult(error.message || String(error), 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function getRegistrations(actionId = null) {
    let query = state.sb
      .from('acoes_inscricoes')
      .select(`
        id,
        acao_id,
        socio_id,
        data_inscricao,
        estado,
        pagamento_confirmado,
        comprovativo_path,
        comprovativo_nome,
        observacoes,
        socios(numero_socio,nome,email,telemovel),
        acoes(titulo,data,hora,local,valor,pagamento_obrigatorio)
      `)
      .order('data_inscricao', { ascending: false });

    if (actionId) query = query.eq('acao_id', actionId);

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  }

  async function toggleRegistrations(actionId) {
    const root = $(`acao-inscricoes-${actionId}`);
    if (!root) return;

    if (!root.hidden) {
      root.hidden = true;
      return;
    }

    root.hidden = false;
    root.innerHTML = '<div class="admin-loading">A carregar inscrições…</div>';

    try {
      const rows = await getRegistrations(actionId);
      state.registrations.set(actionId, rows);
      renderRegistrations(root, rows);
    } catch (error) {
      root.innerHTML = `<div class="admin-result error">${esc(error.message || String(error))}</div>`;
    }
  }

  function renderRegistrations(root, rows) {
    if (!rows.length) {
      root.innerHTML = '<div class="acao-empty">Ainda não existem inscrições.</div>';
      return;
    }

    root.innerHTML = `
      <table class="acao-inscricoes-table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Sócio</th>
            <th>Inscrito em</th>
            <th>Pagamento</th>
            <th>Comprovativo</th>
            <th>Estado</th>
            <th>Gestão</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const paid = row.pagamento_confirmado;
            const needsPayment = !!row.acoes?.pagamento_obrigatorio;
            return `
              <tr>
                <td>${esc(row.socios?.numero_socio)}</td>
                <td>
                  <strong>${esc(row.socios?.nome)}</strong><br>
                  <span class="acao-small-note">${esc(row.socios?.email || '')}</span>
                </td>
                <td>${dateTimePt(row.data_inscricao)}</td>
                <td>${needsPayment ? (paid ? '✅ Confirmado' : '⏳ Pendente') : 'Sem pagamento'}</td>
                <td>
                  ${row.comprovativo_path
                    ? `<button type="button" class="admin-small-btn" data-proof="${esc(row.id)}">Abrir</button>`
                    : '—'}
                </td>
                <td>
                  <span class="acao-status acao-status-${esc(row.estado)}">${esc(row.estado)}</span>
                </td>
                <td>
                  <select class="acao-state" data-state="${esc(row.id)}">
                    ${['pendente','confirmada','cancelada','rejeitada'].map(status =>
                      `<option value="${status}" ${row.estado === status ? 'selected' : ''}>${status}</option>`
                    ).join('')}
                  </select>
                  ${needsPayment && !paid
                    ? `<button type="button" class="admin-small-btn primary" data-pay="${esc(row.id)}">Confirmar pagamento</button>`
                    : ''}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    root.querySelectorAll('[data-proof]').forEach(btn => {
      btn.onclick = () => openProof(btn.dataset.proof);
    });

    root.querySelectorAll('[data-state]').forEach(select => {
      select.onchange = () => changeRegistrationState(select.dataset.state, select.value);
    });

    root.querySelectorAll('[data-pay]').forEach(btn => {
      btn.onclick = () => confirmPayment(btn.dataset.pay);
    });
  }

  async function openProof(registrationId) {
    try {
      const rows = [...state.registrations.values()].flat();
      const row = rows.find(r => r.id === registrationId);
      if (!row?.comprovativo_path) throw new Error('Comprovativo não encontrado.');

      const { data, error } = await state.sb.storage
        .from('comprovativos-acoes')
        .createSignedUrl(row.comprovativo_path, 300);

      if (error) throw error;

      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  async function changeRegistrationState(id, estado) {
    try {
      const { error } = await state.sb
        .from('acoes_inscricoes')
        .update({ estado })
        .eq('id', id);

      if (error) throw error;

      showResult('Estado da inscrição atualizado.');
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  async function confirmPayment(id) {
    try {
      const { error } = await state.sb
        .from('acoes_inscricoes')
        .update({
          pagamento_confirmado: true,
          estado: 'confirmada'
        })
        .eq('id', id);

      if (error) throw error;

      showResult('Pagamento confirmado e inscrição marcada como confirmada.');

      // Atualiza a lista aberta sem fechar o cartão.
      const row = [...state.registrations.values()].flat().find(r => r.id === id);
      if (row) {
        const root = $(`acao-inscricoes-${row.acao_id}`);
        if (root && !root.hidden) {
          const rows = await getRegistrations(row.acao_id);
          state.registrations.set(row.acao_id, rows);
          renderRegistrations(root, rows);
        }
      }
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  async function exportRegistrations(actionId = null) {
    try {
      const XLSX = await loadXlsx();
      const rows = await getRegistrations(actionId);

      if (!rows.length) {
        throw new Error('Não existem inscrições para exportar.');
      }

      const data = rows.map(row => ({
        'Nº Sócio': row.socios?.numero_socio ?? '',
        'Nome': row.socios?.nome ?? '',
        'Email': row.socios?.email ?? '',
        'Telemóvel': row.socios?.telemovel ?? '',
        'Atividade': row.acoes?.titulo ?? '',
        'Data da atividade': row.acoes?.data ?? '',
        'Hora': row.acoes?.hora ? String(row.acoes.hora).slice(0,5) : '',
        'Local': row.acoes?.local ?? '',
        'Data da inscrição': row.data_inscricao
          ? new Date(row.data_inscricao).toLocaleString('pt-PT')
          : '',
        'Valor (€)': row.acoes?.pagamento_obrigatorio
          ? Number(row.acoes?.valor || 0)
          : 0,
        'Pagamento confirmado': row.pagamento_confirmado ? 'Sim' : 'Não',
        'Comprovativo': row.comprovativo_nome || '',
        'Estado': row.estado || '',
        'Observações': row.observacoes || ''
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      ws['!cols'] = Object.keys(data[0]).map(key => ({
        wch: Math.min(42, Math.max(14, key.length + 4))
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inscrições');

      const action = actionId
        ? state.actions.find(a => a.id === actionId)
        : null;

      const safe = (action?.titulo || 'todas')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

      XLSX.writeFile(
        wb,
        `inscricoes-${safe || 'todas'}-${new Date().toISOString().slice(0,10)}.xlsx`
      );

      showResult('Ficheiro Excel exportado com sucesso.');
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  async function init() {
    const module = $('acoes-admin-module');
    if (!module) return;

    state.sb = window.__NAF_SUPABASE || window.supabaseClient;
    if (!state.sb) {
      showResult('Ligação ao Supabase ainda não está disponível. Atualiza a página.', 'error');
      return;
    }

    $('acao-form')?.addEventListener('submit', saveAction);

    $('acao-cancel-edit')?.addEventListener('click', resetForm);

    $('acoes-refresh')?.addEventListener('click', async () => {
      try {
        await loadActions();
        showResult('Lista de atividades atualizada.');
      } catch (error) {
        showResult(error.message || String(error), 'error');
      }
    });

    $('acoes-export-all')?.addEventListener('click', () => exportRegistrations(null));

    try {
      await loadActions();
    } catch (error) {
      showResult(error.message || String(error), 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
