/* NAF — Correção integral da Área de Sócios
   Carregar depois de socio.js.
   Não altera dr-arbitro.js.
*/
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const client = () => window.__NAF_SUPABASE;

  const ASSOCIACOES = [
    'AF Algarve','AF Angra do Heroísmo','AF Aveiro','AF Beja','AF Braga',
    'AF Bragança','AF Castelo Branco','AF Coimbra','AF Évora','AF Guarda',
    'AF Horta','AF Leiria','AF Lisboa','AF Madeira','AF Ponta Delgada',
    'AF Portalegre','AF Porto','AF Santarém','AF Setúbal',
    'AF Viana do Castelo','AF Vila Real','AF Viseu'
  ];

  const CATEGORIAS = {
    Futebol: ['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
    Futsal: ['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
  };

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  function show(text, type='info') {
    const el = $('socio-message');
    if (!el) return;
    el.textContent = text;
    el.className = `socio-message ${type}`;
    el.hidden = false;
  }

  async function rpc(name, args={}) {
    const c = client();
    if (!c) throw new Error('Ligação à BD indisponível.');
    const {data, error} = await c.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function getCurrentSocio() {
    const c = client();
    const {data:user, error:ue} = await c.auth.getUser();
    if (ue || !user?.user?.id) throw new Error('Sessão não autenticada.');
    const {data:s, error:se} = await c.from('socios')
      .select('id,user_id,numero_socio,nome,email,ativo,is_admin,numero_arbitro,associacao_futebol,modalidade,categoria')
      .eq('user_id', user.user.id)
      .eq('ativo', true)
      .single();
    if (se) throw se;
    return s;
  }

  function setOptions(select, options, placeholder, selected='') {
    select.innerHTML = `<option value="">${esc(placeholder)}</option>` +
      options.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (selected) select.value = selected;
  }

  async function setupArbitragem() {
    const form = $('arbitragem-edit-form');
    if (!form || form.dataset.nafReady) return;
    form.dataset.nafReady = '1';

    const afOld = $('edit-af');
    const modOld = $('edit-modalidade');

    const af = document.createElement('select');
    af.id = 'edit-af';
    af.name = 'associacao_futebol';
    af.required = true;
    afOld?.replaceWith(af);

    const modalidade = document.createElement('select');
    modalidade.id = 'edit-modalidade';
    modalidade.name = 'modalidade';
    modalidade.required = true;
    modOld?.replaceWith(modalidade);

    const catLabel = document.createElement('label');
    catLabel.id = 'edit-categoria-label';
    catLabel.innerHTML = `
      Categoria
      <select id="edit-categoria" name="categoria" required disabled>
        <option value="">Selecionar categoria</option>
      </select>
    `;
    (modalidade.closest('label') || form.querySelector('.socio-edit-grid')).insertAdjacentElement('afterend', catLabel);

    setOptions(af, ASSOCIACOES, 'Selecionar Associação de Futebol');
    setOptions(modalidade, ['Futebol','Futsal'], 'Selecionar modalidade');

    const categoria = $('edit-categoria');
    const refreshCategories = selected => {
      setOptions(categoria, CATEGORIAS[modalidade.value] || [], 'Selecionar categoria', selected);
      categoria.disabled = !modalidade.value;
    };

    modalidade.addEventListener('change', () => refreshCategories(''));

    const s = await getCurrentSocio();
    $('edit-arbitro').value = s.numero_arbitro || '';
    af.value = s.associacao_futebol || '';
    modalidade.value = s.modalidade || '';
    refreshCategories(s.categoria || '');

    // Nome e nº de sócio continuam bloqueados para o próprio sócio.
    const numero = $('edit-numero');
    if (numero) {
      numero.readOnly = true;
      numero.disabled = true;
    }
  }

  function addCategoryToView(value) {
    let el = $('dados-categoria');
    if (el) {
      el.textContent = value || '—';
      return;
    }
    const view = $('arbitragem-view');
    if (!view) return;
    const block = document.createElement('div');
    block.innerHTML = `<span>Categoria</span><strong id="dados-categoria">${esc(value || '—')}</strong>`;
    view.appendChild(block);
  }

  async function saveArbitragemCapture(event) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const modalidade = $('edit-modalidade')?.value || '';
    const categoria = $('edit-categoria')?.value || '';
    const associacao = $('edit-af')?.value || '';
    const numero = $('edit-arbitro')?.value?.trim() || '';

    if (!CATEGORIAS[modalidade]) throw new Error('Seleciona Futebol ou Futsal.');
    if (!CATEGORIAS[modalidade].includes(categoria)) throw new Error('Seleciona uma categoria válida.');
    if (!ASSOCIACOES.includes(associacao)) throw new Error('Seleciona uma Associação de Futebol válida.');

    const data = await rpc('atualizar_dados_arbitragem_socio', {
      p_numero_arbitro: numero || null,
      p_associacao_futebol: associacao,
      p_modalidade: modalidade,
      p_categoria: categoria
    });

    if ($('dados-arbitro')) $('dados-arbitro').textContent = data.numero_arbitro || '—';
    if ($('dados-af')) $('dados-af').textContent = data.associacao_futebol || '—';
    if ($('dados-modalidade')) $('dados-modalidade').textContent = data.modalidade || '—';
    addCategoryToView(data.categoria);

    $('arbitragem-edit-form').hidden = true;
    $('arbitragem-view').hidden = false;
    if ($('editar-arbitragem-btn')) $('editar-arbitragem-btn').hidden = false;

    show('Dados de arbitragem atualizados com sucesso.', 'sucesso');
  }

  function adminRowsTemplate(rows) {
    return rows.map(s => `
      <div class="naf-admin-row" data-id="${esc(s.id)}">
        <input class="admin-socio-select naf-select" type="checkbox" value="${esc(s.id)}" data-name="${esc(s.nome || '')}">
        <span class="admin-socio-numero">${esc(s.numero_socio)}</span>
        <span class="admin-socio-main">
          <strong>${esc(s.nome || '')}</strong>
          <small>${esc(s.email || 'Sem email')}</small>
        </span>
        <div class="naf-admin-tools">
          <input class="naf-number" type="number" min="1" value="${esc(s.numero_socio)}" aria-label="Número de sócio">
          <button type="button" class="admin-small-btn naf-number-save">Guardar nº</button>
          <label class="naf-admin-check">
            <input type="checkbox" class="naf-admin-toggle" ${s.is_admin ? 'checked' : ''}>
            Admin
          </label>
          <button type="button" class="admin-small-btn naf-mail">Email individual</button>
        </div>
      </div>
    `).join('');
  }

  async function renderAdminSocios() {
    const root = $('admin-socios-lista');
    if (!root || $('admin-panel')?.hidden) return;

    const rows = await rpc('admin_listar_socios');
    const active = Array.isArray(rows) ? rows : [];

    root.innerHTML = active.length ? adminRowsTemplate(active) :
      '<div class="vazio">Ainda não existem sócios.</div>';

    const removeSelect = $('admin-remove-socio');
    if (removeSelect) {
      removeSelect.innerHTML = active.filter(s => s.ativo).map(s =>
        `<option value="${esc(s.id)}">${esc(s.numero_socio)} — ${esc(s.nome)}</option>`
      ).join('');
    }

    bindAdminRowActions();
    updateSelectionCount();
  }

  async function bindAdminRowActions() {
    const root = $('admin-socios-lista');
    if (!root || root.dataset.nafDelegated) return;
    root.dataset.nafDelegated = '1';

    root.addEventListener('change', async event => {
      const row = event.target.closest('.naf-admin-row');
      if (!row) return;

      if (event.target.classList.contains('naf-admin-toggle')) {
        const checkbox = event.target;
        try {
          checkbox.disabled = true;
          await rpc('admin_definir_admin', {
            p_socio_id: row.dataset.id,
            p_is_admin: checkbox.checked
          });
          show(checkbox.checked ? 'Administrador atribuído.' : 'Administrador retirado.', 'sucesso');
        } catch (e) {
          checkbox.checked = !checkbox.checked;
          show(e.message || 'Não foi possível alterar a permissão.', 'erro');
        } finally {
          checkbox.disabled = false;
        }
      }

      if (event.target.classList.contains('naf-select')) updateSelectionCount();
    });

    root.addEventListener('click', async event => {
      const row = event.target.closest('.naf-admin-row');
      if (!row) return;

      if (event.target.classList.contains('naf-number-save')) {
        const button = event.target;
        try {
          button.disabled = true;
          await rpc('admin_alterar_numero_socio', {
            p_socio_id: row.dataset.id,
            p_novo_numero: Number(row.querySelector('.naf-number').value)
          });
          show('Número de sócio atualizado.', 'sucesso');
          await renderAdminSocios();
        } catch (e) {
          show(e.message || 'Não foi possível alterar o número.', 'erro');
        } finally {
          button.disabled = false;
        }
      }

      if (event.target.classList.contains('naf-mail')) {
        const button = event.target;
        const email = row.querySelector('.admin-socio-main small')?.textContent || '';
        if (!email || email === 'Sem email') {
          show('Este sócio não tem email registado.', 'erro');
          return;
        }

        const assunto = prompt('Assunto do email:', 'Comunicação — Núcleo Marques Bom');
        if (assunto === null) return;
        const mensagem = prompt('Mensagem:', '');
        if (mensagem === null) return;
        if (!mensagem.trim()) {
          show('A mensagem não pode ficar vazia.', 'erro');
          return;
        }

        try {
          button.disabled = true;
          const {data,error}=await client().functions.invoke('admin-mail', {
            body: {
              action: 'individual',
              socio_id: row.dataset.id,
              subject: assunto,
              message: mensagem
            }
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          show(`Email enviado para ${email}.`, 'sucesso');
        } catch (e) {
          show(e.message || 'Falha no envio do email.', 'erro');
        } finally {
          button.disabled = false;
        }
      }
    });
  }

  function selectedIds(selector = '#admin-socios-lista .naf-select:checked') {
    return $$(selector).map(x => x.value);
  }

  function updateSelectionCount() {
    const n = selectedIds().length;
    const el = $('admin-selected-count');
    if (el) el.textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
  }

  function replaceButton(id, handler) {
    const old = $(id);
    if (!old) return;
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    fresh.addEventListener('click', handler);
  }

  function bindAdminButtons() {
    replaceButton('admin-select-all', () => {
      $$('#admin-socios-lista .naf-select').forEach(x => x.checked = true);
      updateSelectionCount();
    });

    replaceButton('admin-clear-selection', () => {
      $$('#admin-socios-lista .naf-select').forEach(x => x.checked = false);
      updateSelectionCount();
    });

    replaceButton('admin-quotas-atraso', async () => {
      const ids = selectedIds();
      if (!ids.length) {
        show('Seleciona pelo menos um sócio.', 'erro');
        return;
      }
      const btn = $('admin-quotas-atraso');
      try {
        btn.disabled = true;
        const {data,error}=await client().functions.invoke('admin-mail', {
          body: {action:'quotas_em_atraso', socio_ids:ids}
        });
        if(error) throw error;
        if(data?.error) throw new Error(data.error);
        show(`Email de quotas em atraso enviado. ${data.sent || 0} enviado(s).`, 'sucesso');
      } catch(e) {
        show(e.message || 'Falha no envio de emails.', 'erro');
      } finally {
        btn.disabled = false;
      }
    });

    replaceButton('admin-overdue-select-all', () => {
      $$('#admin-overdue-list input[type="checkbox"]').forEach(x => x.checked = true);
      updateOverdueCount();
    });

    replaceButton('admin-overdue-clear', () => {
      $$('#admin-overdue-list input[type="checkbox"]').forEach(x => x.checked = false);
      updateOverdueCount();
    });

    $('admin-overdue-list')?.addEventListener('change', updateOverdueCount);
  }

  async function renderOverdue() {
    const root = $('admin-overdue-list');
    if (!root || $('admin-panel')?.hidden) return;

    const rows = await rpc('admin_listar_socios');
    const active = (rows || []).filter(s => s.ativo);
    if (!active.length) {
      root.innerHTML = '<div class="vazio">Não existem sócios ativos.</div>';
      return;
    }

    const ids = active.map(s => s.id);
    const {data: quotas, error} = await client()
      .from('quotas')
      .select('socio_id,ano,valor,estado')
      .in('socio_id', ids)
      .in('estado', ['em_atraso','atrasada','atrasado','vencida','vencido']);

    if (error) throw error;

    const debt = (quotas || []).reduce((m,q) => {
      m[q.socio_id] = (m[q.socio_id] || 0) + Number(q.valor || 0);
      return m;
    }, {});

    const debtRows = active.filter(s => debt[s.id] > 0);
    root.innerHTML = debtRows.length ? debtRows.map(s => `
      <label class="admin-overdue-row">
        <input type="checkbox" value="${esc(s.id)}">
        <strong>${esc(s.numero_socio)} — ${esc(s.nome)}</strong>
        <span>${Number(debt[s.id]).toFixed(2)} €</span>
      </label>
    `).join('') : '<div class="vazio">Não existem quotas em atraso.</div>';

    updateOverdueCount();
  }

  function updateOverdueCount() {
    const n = $$('#admin-overdue-list input[type="checkbox"]:checked').length;
    const el = $('admin-overdue-count');
    if (el) el.textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
  }

  function patchDocumentReading() {
    // Cache local curto dos URLs assinados para não repetir chamadas ao Storage.
    const cache = new Map();
    window.NAF_DOCUMENT_URL = async path => {
      if (!path) return null;
      const hit = cache.get(path);
      if (hit && hit.expires > Date.now()) return hit.url;
      const {data,error}=await client().storage.from('documentos-socios').createSignedUrl(path,3600);
      if (error || !data?.signedUrl) return null;
      cache.set(path,{url:data.signedUrl,expires:Date.now()+55*60*1000});
      return data.signedUrl;
    };
  }

  function boot() {
    patchDocumentReading();
    setupArbitragem().catch(e => console.error('Arbitragem:', e));

    const panel = $('admin-panel');
    if (panel && !panel.dataset.nafObserver) {
      panel.dataset.nafObserver='1';
      const observer = new MutationObserver(() => {
        if (!panel.hidden) {
          if (!$('admin-socios-lista .naf-admin-row')) {
            renderAdminSocios().catch(e => show(e.message || 'Falha ao carregar sócios.', 'erro'));
          }
          bindAdminButtons();
          renderOverdue().catch(e => console.error('Quotas em atraso:', e));
        }
      });
      observer.observe(panel,{attributes:true,childList:true,subtree:true});
      if (!panel.hidden) {
        renderAdminSocios().catch(console.error);
        renderOverdue().catch(console.error);
        bindAdminButtons();
      }
    }

    $('editar-arbitragem-btn')?.addEventListener('click', () => {
      setupArbitragem().catch(e => show(e.message,'erro'));
    });

    const form = $('arbitragem-edit-form');
    if (form && !form.dataset.nafSubmitBound) {
      form.dataset.nafSubmitBound='1';
      form.addEventListener('submit', e => {
        saveArbitragemCapture(e).catch(err => show(err.message || 'Não foi possível guardar os dados.','erro'));
      }, true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  } else {
    boot();
  }
})();
