(() => {
  'use strict';

  /*
   * ============================================================
   * AÇÕES — ADMINISTRAÇÃO
   * ============================================================
   *
   * Compatível com o admin.html atual.
   *
   * Não depende de:
   *   - acoes-admin-tab-fix.js
   *   - outro ficheiro de fix
   *
   * Tabelas Supabase:
   *   - acoes
   *   - acoes_inscricoes
   *
   * ============================================================
   */

  const state = {
    sb: null,
    actions: [],
    initialized: false,
    loading: false,
    editing: false
  };

  const $ = (id) => document.getElementById(id);

  /* ============================================================
     UTILITÁRIOS
  ============================================================ */

  function esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[c])
    );
  }

  function money(value) {
    return `${Number(value || 0).toFixed(2).replace('.', ',')} €`;
  }

  function formatDate(value) {
    if (!value) return '—';

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return String(value);
    }

    return d.toLocaleDateString('pt-PT');
  }

  function formatDateTime(value) {
    if (!value) return '—';

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return String(value);
    }

    return d.toLocaleString('pt-PT');
  }

  function showResult(message, type = 'success') {
    const el = $('acoes-admin-result');

    if (!el) return;

    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  function hideResult() {
    const el = $('acoes-admin-result');

    if (!el) return;

    el.hidden = true;
    el.textContent = '';
  }

  function errorMessage(error) {
    if (!error) return 'Ocorreu um erro.';

    if (error.message) {
      return error.message;
    }

    return String(error);
  }

  function fail(error) {
    console.error('[AÇÕES ADMIN]', error);
    showResult(errorMessage(error), 'error');
  }

  /* ============================================================
     SUPABASE
  ============================================================ */

  function getSupabase() {
    if (state.sb) {
      return state.sb;
    }

    /*
     * Primeiro tenta reutilizar o cliente que já possa ter
     * sido criado pelo restante da aplicação.
     */
    if (
      window.__NAF_SUPABASE &&
      typeof window.__NAF_SUPABASE.from === 'function'
    ) {
      state.sb = window.__NAF_SUPABASE;
      return state.sb;
    }

    if (
      window.supabaseClient &&
      typeof window.supabaseClient.from === 'function'
    ) {
      state.sb = window.supabaseClient;
      return state.sb;
    }

    /*
     * Caso ainda não exista cliente, cria um utilizando
     * admin-config.js.
     */
    const config = window.NAF_ADMIN_CONFIG || {};

    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
      throw new Error(
        'Configuração do Supabase incompleta.'
      );
    }

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      throw new Error(
        'A biblioteca Supabase não foi carregada.'
      );
    }

    state.sb = window.supabase.createClient(
      config.SUPABASE_URL,
      config.SUPABASE_ANON_KEY
    );

    return state.sb;
  }

  /* ============================================================
     BOTÕES DE TOGGLE
  ============================================================ */

  function setupToggleButtons() {
    const buttons = document.querySelectorAll(
      '#panel-acoes .acao-toggle[data-toggle]'
    );

    buttons.forEach((button) => {
      const inputId = button.dataset.toggle;
      const input = $(inputId);

      if (!input) return;

      if (button.dataset.acoesReady !== '1') {
        button.dataset.acoesReady = '1';

        button.addEventListener('click', (event) => {
          event.preventDefault();

          input.checked = !input.checked;

          syncToggle(button, input);

          input.dispatchEvent(
            new Event('change', {
              bubbles: true
            })
          );
        });

        input.addEventListener('change', () => {
          syncToggle(button, input);
        });
      }

      syncToggle(button, input);
    });
  }

  function syncToggle(button, input) {
    const active = input.checked === true;

    button.classList.toggle('active', active);

    button.setAttribute(
      'aria-pressed',
      active ? 'true' : 'false'
    );
  }

  /* ============================================================
     FORMULÁRIO
  ============================================================ */

  function resetForm() {
    const form = $('acao-form');

    if (form) {
      form.reset();
    }

    if ($('acao-id')) {
      $('acao-id').value = '';
    }

    if ($('acao-valor')) {
      $('acao-valor').value = '0';
    }

    if ($('acao-ativa')) {
      $('acao-ativa').checked = false;
    }

    if ($('acao-aberta')) {
      $('acao-aberta').checked = false;
    }

    if ($('acao-pagamento')) {
      $('acao-pagamento').checked = false;
    }

    if ($('acao-comprovativo')) {
      $('acao-comprovativo').checked = false;
    }

    if ($('acoes-form-title')) {
      $('acoes-form-title').textContent =
        'Criar nova atividade';
    }

    if ($('acao-save')) {
      $('acao-save').textContent =
        'Criar atividade';

      $('acao-save').disabled = false;
    }

    if ($('acao-cancel-edit')) {
      $('acao-cancel-edit').hidden = true;
    }

    state.editing = false;

    setupToggleButtons();
  }

  function editAction(action) {
    if (!action) return;

    state.editing = true;

    $('acao-id').value = action.id || '';

    $('acao-titulo').value =
      action.titulo || '';

    $('acao-local').value =
      action.local || '';

    $('acao-data').value =
      action.data || '';

    $('acao-hora').value =
      action.hora
        ? String(action.hora).slice(0, 5)
        : '';

    if (action.prazo_inscricao) {
      const d = new Date(action.prazo_inscricao);

      if (!Number.isNaN(d.getTime())) {
        const local = new Date(
          d.getTime() -
          d.getTimezoneOffset() * 60000
        );

        $('acao-prazo').value =
          local.toISOString().slice(0, 16);
      } else {
        $('acao-prazo').value = '';
      }
    } else {
      $('acao-prazo').value = '';
    }

    $('acao-limite').value =
      action.limite_inscricoes ?? '';

    $('acao-valor').value =
      action.valor ?? 0;

    $('acao-ativa').checked =
      action.ativa === true;

    $('acao-aberta').checked =
      action.inscricoes_abertas === true;

    $('acao-pagamento').checked =
      action.pagamento_obrigatorio === true;

    $('acao-comprovativo').checked =
      action.comprovativo_obrigatorio === true;

    $('acao-descricao').value =
      action.descricao || '';

    $('acoes-form-title').textContent =
      `Editar: ${action.titulo || 'atividade'}`;

    $('acao-save').textContent =
      'Guardar alterações';

    $('acao-cancel-edit').hidden = false;

    setupToggleButtons();

    $('panel-acoes')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function readForm() {
    const titulo =
      $('acao-titulo')?.value?.trim();

    if (!titulo) {
      throw new Error(
        'Indica o nome da atividade.'
      );
    }

    const ativa =
      $('acao-ativa')?.checked === true;

    let inscricoesAbertas =
      $('acao-aberta')?.checked === true;

    const pagamento =
      $('acao-pagamento')?.checked === true;

    const comprovativo =
      $('acao-comprovativo')?.checked === true;

    /*
     * Se a atividade estiver fechada/inativa,
     * não faz sentido manter inscrições abertas.
     */
    if (!ativa) {
      inscricoesAbertas = false;
    }

    /*
     * O comprovativo só faz sentido com pagamento.
     */
    if (comprovativo && !pagamento) {
      throw new Error(
        'O comprovativo obrigatório só pode ser utilizado quando o pagamento é obrigatório.'
      );
    }

    let limite = null;

    const limiteRaw =
      $('acao-limite')?.value?.trim();

    if (limiteRaw) {
      limite = Number(limiteRaw);

      if (
        !Number.isInteger(limite) ||
        limite <= 0
      ) {
        throw new Error(
          'O limite de inscrições tem de ser um número inteiro positivo.'
        );
      }
    }

    let valor = Number(
      $('acao-valor')?.value || 0
    );

    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(
        'O valor da atividade não é válido.'
      );
    }

    /*
     * Se não houver pagamento, o valor fica 0.
     */
    if (!pagamento) {
      valor = 0;
    }

    let prazo = null;

    const prazoRaw =
      $('acao-prazo')?.value?.trim();

    if (prazoRaw) {
      const d = new Date(prazoRaw);

      if (Number.isNaN(d.getTime())) {
        throw new Error(
          'O prazo de inscrição não é válido.'
        );
      }

      prazo = d.toISOString();
    }

    return {
      titulo,

      descricao:
        $('acao-descricao')?.value?.trim() ||
        null,

      local:
        $('acao-local')?.value?.trim() ||
        null,

      data:
        $('acao-data')?.value ||
        null,

      hora:
        $('acao-hora')?.value ||
        null,

      prazo_inscricao: prazo,

      limite_inscricoes: limite,

      ativa,

      inscricoes_abertas:
        inscricoesAbertas,

      pagamento_obrigatorio:
        pagamento,

      valor,

      comprovativo_obrigatorio:
        pagamento && comprovativo
    };
  }

  /* ============================================================
     GUARDAR ATIVIDADE
  ============================================================ */

  async function saveAction(event) {
    event?.preventDefault();

    hideResult();

    const button = $('acao-save');

    if (button) {
      button.disabled = true;
    }

    try {
      const sb = getSupabase();

      const payload = readForm();

      const id =
        $('acao-id')?.value?.trim();

      let result;

      if (id) {
        result = await sb
          .from('acoes')
          .update(payload)
          .eq('id', id)
          .select('*')
          .single();
      } else {
        result = await sb
          .from('acoes')
          .insert(payload)
          .select('*')
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      showResult(
        id
          ? 'Atividade atualizada com sucesso.'
          : 'Atividade criada com sucesso.',
        'success'
      );

      resetForm();

      await loadActions();

    } catch (error) {
      fail(error);
    } finally {
      if (button) {
        button.disabled = false;
      }
    }
  }

  /* ============================================================
     CARREGAR ATIVIDADES
  ============================================================ */

  async function loadActions() {
    if (state.loading) return;

    state.loading = true;

    const container = $('acoes-admin-list');

    if (container) {
      container.innerHTML =
        '<div class="admin-loading">A carregar atividades…</div>';
    }

    try {
      const sb = getSupabase();

      const result = await sb
        .from('acoes')
        .select('*')
        .order('data', {
          ascending: true,
          nullsFirst: false
        })
        .order('created_at', {
          ascending: false,
          nullsFirst: false
        });

      if (result.error) {
        throw result.error;
      }

      state.actions =
        result.data || [];

      await loadRegistrationCounts();

      renderActions();

    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="admin-result error">
            ${esc(errorMessage(error))}
          </div>
        `;
      }

      console.error(
        '[AÇÕES ADMIN] Erro ao carregar atividades:',
        error
      );

    } finally {
      state.loading = false;
    }
  }

  /* ============================================================
     CONTAGEM DE INSCRIÇÕES
  ============================================================ */

  async function loadRegistrationCounts() {
    if (!state.actions.length) {
      state.actions.forEach((action) => {
        action.__inscritos = 0;
      });

      return;
    }

    const sb = getSupabase();

    const ids =
      state.actions.map(
        (action) => action.id
      );

    const result = await sb
      .from('acoes_inscricoes')
      .select('id,acao_id,estado')
      .in('acao_id', ids);

    if (result.error) {
      /*
       * A lista de atividades continua a funcionar
       * mesmo que a contagem falhe.
       */
      console.warn(
        '[AÇÕES ADMIN] Não foi possível carregar contagens:',
        result.error
      );

      state.actions.forEach((action) => {
        action.__inscritos = null;
      });

      return;
    }

    const counts = new Map();

    for (const row of result.data || []) {
      /*
       * Canceladas não contam como inscrições ativas.
       */
      if (
        String(row.estado || '').toLowerCase() ===
        'cancelada'
      ) {
        continue;
      }

      const key = String(row.acao_id);

      counts.set(
        key,
        (counts.get(key) || 0) + 1
      );
    }

    state.actions.forEach((action) => {
      action.__inscritos =
        counts.get(String(action.id)) || 0;
    });
  }

  /* ============================================================
     RENDER DA LISTA
  ============================================================ */

  function renderActions() {
    const container =
      $('acoes-admin-list');

    if (!container) return;

    if (!state.actions.length) {
      container.innerHTML = `
        <div class="acao-empty">
          Ainda não existem atividades criadas.
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.actions.map(renderActionCard).join('');

    /*
     * Botões editar
     */
    container
      .querySelectorAll('[data-action-edit]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            const id =
              button.dataset.actionEdit;

            const action =
              state.actions.find(
                (item) =>
                  String(item.id) ===
                  String(id)
              );

            editAction(action);
          }
        );
      });

    /*
     * Botões ativar/desativar
     */
    container
      .querySelectorAll('[data-action-toggle-active]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            toggleActive(
              button.dataset.actionToggleActive
            );
          }
        );
      });

    /*
     * Botões abrir/fechar inscrições
     */
    container
      .querySelectorAll('[data-action-toggle-open]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            toggleOpen(
              button.dataset.actionToggleOpen
            );
          }
        );
      });

    /*
     * Botões ver inscrições
     */
    container
      .querySelectorAll('[data-action-registrations]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            showRegistrations(
              button.dataset.actionRegistrations
            );
          }
        );
      });

    /*
     * Botões exportar atividade
     */
    container
      .querySelectorAll('[data-action-export]')
      .forEach((button) => {
        button.addEventListener(
          'click',
          () => {
            exportRegistrations(
              button.dataset.actionExport
            );
          }
        );
      });
  }

  function renderActionCard(action) {
    const active =
      action.ativa === true;

    const open =
      action.inscricoes_abertas === true;

    const paid =
      action.pagamento_obrigatorio === true;

    const proof =
      action.comprovativo_obrigatorio === true;

    const count =
      action.__inscritos === null
        ? '—'
        : action.__inscritos;

    const limit =
      action.limite_inscricoes
        ? ` / ${action.limite_inscricoes}`
        : '';

    return `
      <article
        class="acao-admin-item"
        data-action-id="${esc(action.id)}"
      >

        <div class="acao-admin-item-head">

          <div>
            <span class="admin-badge">
              ${active ? 'Ativa' : 'Inativa'}
            </span>

            <h3>
              ${esc(action.titulo || 'Sem título')}
            </h3>
          </div>

          <div class="acao-admin-status">
            <span class="${active ? 'is-active' : 'is-inactive'}">
              ${active ? 'Ativa' : 'Inativa'}
            </span>

            <span class="${open ? 'is-active' : 'is-inactive'}">
              ${open ? 'Inscrições abertas' : 'Inscrições fechadas'}
            </span>
          </div>

        </div>

        <div class="acao-admin-meta">

          <span>
            📅 ${formatDate(action.data)}
          </span>

          ${
            action.hora
              ? `<span>🕐 ${esc(String(action.hora).slice(0, 5))}</span>`
              : ''
          }

          ${
            action.local
              ? `<span>📍 ${esc(action.local)}</span>`
              : ''
          }

          <span>
            👥 ${count}${limit}
          </span>

        </div>

        ${
          action.descricao
            ? `
              <p class="acao-admin-description">
                ${esc(action.descricao)}
              </p>
            `
            : ''
        }

        <div class="acao-admin-options">

          <span class="acao-admin-option ${
            paid ? 'active' : ''
          }">
            ${paid ? '✓' : '○'} Pagamento
          </span>

          <span class="acao-admin-option ${
            proof ? 'active' : ''
          }">
            ${proof ? '✓' : '○'} Comprovativo
          </span>

          ${
            paid
              ? `<span class="acao-admin-option">
                   ${money(action.valor)}
                 </span>`
              : `<span class="acao-admin-option">
                   Gratuita
                 </span>`
          }

        </div>

        <div class="admin-actions">

          <button
            type="button"
            class="admin-small-btn"
            data-action-edit="${esc(action.id)}"
          >
            Editar
          </button>

          <button
            type="button"
            class="admin-small-btn ${
              active ? 'danger' : 'primary'
            }"
            data-action-toggle-active="${esc(action.id)}"
          >
            ${active ? 'Desativar' : 'Ativar'}
          </button>

          <button
            type="button"
            class="admin-small-btn ${
              open ? 'danger' : 'primary'
            }"
            data-action-toggle-open="${esc(action.id)}"
            ${!active ? 'disabled' : ''}
          >
            ${
              open
                ? 'Fechar inscrições'
                : 'Abrir inscrições'
            }
          </button>

          <button
            type="button"
            class="admin-small-btn"
            data-action-registrations="${esc(action.id)}"
          >
            Ver inscritos (${count})
          </button>

          <button
            type="button"
            class="admin-small-btn"
            data-action-export="${esc(action.id)}"
          >
            Exportar Excel
          </button>

        </div>

        <div
          id="acoes-registrations-${esc(action.id)}"
          class="acao-admin-registrations"
          hidden
        ></div>

      </article>
    `;
  }

  /* ============================================================
     ATIVAR / DESATIVAR
  ============================================================ */

  async function toggleActive(id) {
    const action =
      state.actions.find(
        (item) =>
          String(item.id) === String(id)
      );

    if (!action) return;

    const newValue =
      action.ativa !== true;

    try {
      const sb = getSupabase();

      const update = {
        ativa: newValue
      };

      /*
       * Se desativarmos a atividade,
       * fechamos também as inscrições.
       */
      if (!newValue) {
        update.inscricoes_abertas = false;
      }

      const result = await sb
        .from('acoes')
        .update(update)
        .eq('id', id);

      if (result.error) {
        throw result.error;
      }

      showResult(
        newValue
          ? 'Atividade ativada.'
          : 'Atividade desativada.',
        'success'
      );

      await loadActions();

    } catch (error) {
      fail(error);
    }
  }

  /* ============================================================
     ABRIR / FECHAR INSCRIÇÕES
  ============================================================ */

  async function toggleOpen(id) {
    const action =
      state.actions.find(
        (item) =>
          String(item.id) === String(id)
      );

    if (!action) return;

    if (!action.ativa) {
      showResult(
        'Não é possível abrir inscrições numa atividade inativa.',
        'error'
      );

      return;
    }

    const newValue =
      action.inscricoes_abertas !== true;

    try {
      const sb = getSupabase();

      const result = await sb
        .from('acoes')
        .update({
          inscricoes_abertas: newValue
        })
        .eq('id', id);

      if (result.error) {
        throw result.error;
      }

      showResult(
        newValue
          ? 'Inscrições abertas.'
          : 'Inscrições fechadas.',
        'success'
      );

      await loadActions();

    } catch (error) {
      fail(error);
    }
  }

  /* ============================================================
     INSCRIÇÕES
  ============================================================ */

  async function showRegistrations(id) {
    const container =
      $(`acoes-registrations-${id}`);

    if (!container) return;

    if (!container.hidden) {
      container.hidden = true;
      return;
    }

    container.hidden = false;

    container.innerHTML =
      '<div class="admin-loading">A carregar inscritos…</div>';

    try {
      const sb = getSupabase();

      const result = await sb
        .from('acoes_inscricoes')
        .select(`
          id,
          acao_id,
          socio_id,
          data_inscricao,
          estado,
          pagamento_confirmado,
          comprovativo_nome,
          comprovativo_path,
          comprovativo_tipo,
          comprovativo_tamanho,
          socios (
            id,
            numero_socio,
            nome,
            email,
            telemovel
          )
        `)
        .eq('acao_id', id)
        .order('data_inscricao', {
          ascending: false
        });

      if (result.error) {
        throw result.error;
      }

      renderRegistrations(
        container,
        result.data || [],
        id
      );

    } catch (error) {
      console.error(
        '[AÇÕES ADMIN] Erro nas inscrições:',
        error
      );

      /*
       * Se a relação socios não existir no schema,
       * tentamos novamente sem a relação.
       */
      try {
        const sb = getSupabase();

        const fallback =
          await sb
            .from('acoes_inscricoes')
            .select(`
              id,
              acao_id,
              socio_id,
              data_inscricao,
              estado,
              pagamento_confirmado,
              comprovativo_nome,
              comprovativo_path,
              comprovativo_tipo,
              comprovativo_tamanho
            `)
            .eq('acao_id', id)
            .order('data_inscricao', {
              ascending: false
            });

        if (fallback.error) {
          throw fallback.error;
        }

        renderRegistrations(
          container,
          fallback.data || [],
          id
        );

      } catch (fallbackError) {
        container.innerHTML = `
          <div class="admin-result error">
            ${esc(errorMessage(fallbackError))}
          </div>
        `;
      }
    }
  }

  function renderRegistrations(
    container,
    registrations,
    actionId
  ) {
    if (!registrations.length) {
      container.innerHTML = `
        <div class="acao-empty">
          Ainda não existem inscrições nesta atividade.
        </div>
      `;

      return;
    }

    container.innerHTML = `
      <div class="acao-admin-registrations-inner">

        <div class="acoes-section-head">
          <div>
            <h4>Inscritos</h4>
            <p class="admin-help">
              ${registrations.length}
              inscrição(ões) registada(s).
            </p>
          </div>

          <button
            type="button"
            class="admin-small-btn primary"
            data-export-inline="${esc(actionId)}"
          >
            Exportar Excel
          </button>
        </div>

        <div class="admin-table-wrap">

          <table class="admin-table">

            <thead>
              <tr>
                <th>Nº</th>
                <th>Nome</th>
                <th>Email</th>
                <th>Inscrição</th>
                <th>Estado</th>
                <th>Pagamento</th>
                <th>Comprovativo</th>
              </tr>
            </thead>

            <tbody>

              ${registrations.map((row) => {

                const socio =
                  row.socios || {};

                const estado =
                  row.estado || 'pendente';

                const pagamento =
                  row.pagamento_confirmado === true
                    ? 'Confirmado'
                    : 'Pendente';

                const comprovativo =
                  row.comprovativo_nome
                    ? esc(row.comprovativo_nome)
                    : '—';

                return `
                  <tr>

                    <td>
                      ${esc(
                        socio.numero_socio ??
                        row.socio_id ??
                        ''
                      )}
                    </td>

                    <td>
                      ${esc(
                        socio.nome ||
                        '—'
                      )}
                    </td>

                    <td>
                      ${esc(
                        socio.email ||
                        '—'
                      )}
                    </td>

                    <td>
                      ${formatDateTime(
                        row.data_inscricao
                      )}
                    </td>

                    <td>
                      ${esc(estado)}
                    </td>

                    <td>
                      ${esc(pagamento)}
                    </td>

                    <td>
                      ${comprovativo}
                    </td>

                  </tr>
                `;
              }).join('')}

            </tbody>

          </table>

        </div>

      </div>
    `;

    container
      .querySelector('[data-export-inline]')
      ?.addEventListener(
        'click',
        () => {
          exportRegistrations(actionId);
        }
      );
  }

  /* ============================================================
     EXPORTAÇÃO EXCEL
  ============================================================ */

  async function exportRegistrations(
    actionId = null
  ) {
    try {
      const sb = getSupabase();

      let query =
        sb
          .from('acoes_inscricoes')
          .select(`
            id,
            acao_id,
            socio_id,
            data_inscricao,
            estado,
            pagamento_confirmado,
            comprovativo_nome,
            comprovativo_tipo,
            comprovativo_tamanho,
            acoes (
              titulo,
              data,
              hora,
              local,
              valor,
              pagamento_obrigatorio,
              comprovativo_obrigatorio
            ),
            socios (
              numero_socio,
              nome,
              email,
              telemovel,
              nif,
              data_nascimento,
              naturalidade,
              profissao,
              morada,
              localidade,
              codigo_postal
            )
          `);

      if (actionId) {
        query = query.eq(
          'acao_id',
          actionId
        );
      }

      query = query.order(
        'data_inscricao',
        {
          ascending: true
        }
      );

      let result =
        await query;

      /*
       * Fallback caso alguma relação adicional
       * não exista ou seja diferente.
       */
      if (result.error) {
        let fallback =
          sb
            .from('acoes_inscricoes')
            .select(`
              id,
              acao_id,
              socio_id,
              data_inscricao,
              estado,
              pagamento_confirmado,
              comprovativo_nome
            `);

        if (actionId) {
          fallback =
            fallback.eq(
              'acao_id',
              actionId
            );
        }

        fallback =
          fallback.order(
            'data_inscricao',
            {
              ascending: true
            }
          );

        result =
          await fallback;
      }

      if (result.error) {
        throw result.error;
      }

      const rows =
        result.data || [];

      if (!rows.length) {
        showResult(
          'Não existem inscrições para exportar.',
          'error'
        );

        return;
      }

      const action =
        actionId
          ? state.actions.find(
              (item) =>
                String(item.id) ===
                String(actionId)
            )
          : null;

      const csv =
        buildExcelCsv(
          rows,
          action
        );

      downloadExcel(
        csv,
        action
          ? `inscricoes-${safeFileName(action.titulo)}.xls`
          : 'inscricoes-acoes.xls'
      );

      showResult(
        `${rows.length} inscrição(ões) exportada(s).`,
        'success'
      );

    } catch (error) {
      fail(error);
    }
  }

  async function exportAllRegistrations() {
    await exportRegistrations(null);
  }

  function buildExcelCsv(
    rows,
    selectedAction
  ) {
    const header = [
      'Atividade',
      'Data da atividade',
      'Hora',
      'Local',
      'Valor',
      'Pagamento obrigatório',
      'Comprovativo obrigatório',
      'Nº Sócio',
      'Nome',
      'Email',
      'Telemóvel',
      'NIF',
      'Data de nascimento',
      'Naturalidade',
      'Profissão',
      'Morada',
      'Localidade',
      'Código postal',
      'Data de inscrição',
      'Estado',
      'Pagamento confirmado',
      'Comprovativo'
    ];

    const lines = [
      header
        .map(excelCell)
        .join('\t')
    ];

    for (const row of rows) {
      const action =
        row.acoes || selectedAction || {};

      const socio =
        row.socios || {};

      const values = [
        action.titulo || '',
        action.data || '',
        action.hora
          ? String(action.hora).slice(0, 5)
          : '',
        action.local || '',
        action.valor ?? '',
        action.pagamento_obrigatorio
          ? 'Sim'
          : 'Não',
        action.comprovativo_obrigatorio
          ? 'Sim'
          : 'Não',

        socio.numero_socio ??
          row.socio_id ??
          '',

        socio.nome || '',
        socio.email || '',
        socio.telemovel || '',
        socio.nif || '',
        socio.data_nascimento || '',
        socio.naturalidade || '',
        socio.profissao || '',
        socio.morada ||
          socio.morada_completa ||
          '',
        socio.localidade || '',
        socio.codigo_postal || '',

        row.data_inscricao || '',
        row.estado || '',
        row.pagamento_confirmado
          ? 'Sim'
          : 'Não',
        row.comprovativo_nome || ''
      ];

      lines.push(
        values
          .map(excelCell)
          .join('\t')
      );
    }

    /*
     * UTF-8 BOM para o Excel reconhecer
     * corretamente os acentos portugueses.
     */
    return '\uFEFF' + lines.join('\r\n');
  }

  function excelCell(value) {
    let text =
      String(value ?? '');

    /*
     * Impede que Excel interprete valores
     * iniciados por =, +, -, @ como fórmulas.
     */
    if (
      /^[=+\-@]/.test(text)
    ) {
      text = `'${text}`;
    }

    return text
      .replace(/\t/g, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/\r/g, ' ');
  }

  function safeFileName(value) {
    return String(value || 'atividade')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 80) || 'atividade';
  }

  function downloadExcel(
    content,
    filename
  ) {
    const blob =
      new Blob(
        [content],
        {
          type:
            'application/vnd.ms-excel;charset=utf-8;'
        }
      );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement('a');

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);

    link.click();

    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* ============================================================
     INICIALIZAÇÃO
  ============================================================ */

  function bindEvents() {
    const form =
      $('acao-form');

    if (
      form &&
      form.dataset.acoesFormReady !== '1'
    ) {
      form.dataset.acoesFormReady = '1';

      form.addEventListener(
        'submit',
        saveAction
      );
    }

    const refresh =
      $('acoes-refresh');

    if (
      refresh &&
      refresh.dataset.acoesReady !== '1'
    ) {
      refresh.dataset.acoesReady = '1';

      refresh.addEventListener(
        'click',
        () => {
          loadActions().catch(fail);
        }
      );
    }

    const exportAll =
      $('acoes-export-all');

    if (
      exportAll &&
      exportAll.dataset.acoesReady !== '1'
    ) {
      exportAll.dataset.acoesReady = '1';

      exportAll.addEventListener(
        'click',
        () => {
          exportAllRegistrations();
        }
      );
    }

    const cancel =
      $('acao-cancel-edit');

    if (
      cancel &&
      cancel.dataset.acoesReady !== '1'
    ) {
      cancel.dataset.acoesReady = '1';

      cancel.addEventListener(
        'click',
        () => {
          resetForm();
          hideResult();
        }
      );
    }

    setupToggleButtons();
  }

  function isAdminPanelReady() {
    return Boolean(
      $('panel-acoes') &&
      $('acoes-admin-module')
    );
  }

  async function init() {
    if (state.initialized) {
      return;
    }

    if (!isAdminPanelReady()) {
      return;
    }

    state.initialized = true;

    try {
      bindEvents();

      /*
       * Não dependemos da aba estar ativa.
       * Carregamos as atividades logo que o módulo
       * administrativo existe.
       */
      await loadActions();

    } catch (error) {
      state.initialized = false;

      console.error(
        '[AÇÕES ADMIN] Inicialização falhou:',
        error
      );

      showResult(
        errorMessage(error),
        'error'
      );
    }
  }

  /*
   * DOM já carregado.
   */
  if (
    document.readyState ===
    'loading'
  ) {
    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }

  /*
   * Disponibilizamos uma inicialização pública
   * caso o admin.js precise de voltar a inicializar
   * os módulos depois do login.
   */
  window.initAcoesAdmin = init;

  /*
   * Também disponibilizamos funções úteis
   * sem obrigar outros ficheiros a importá-las.
   */
  window.loadAcoesAdmin = loadActions;
  window.exportAcoesAdmin = exportAllRegistrations;

})();
