(() => {
  'use strict';

  /*
   * ============================================================
   * AÇÕES — ADMINISTRAÇÃO
   * ============================================================
   *
   * Compatível diretamente com o admin.html atual:
   *
   *   #panel-acoes
   *   #acoes-admin-module
   *   #acao-form
   *   #acao-id
   *   #acao-titulo
   *   #acao-local
   *   #acao-data
   *   #acao-hora
   *   #acao-prazo
   *   #acao-limite
   *   #acao-valor
   *   #acao-ativa
   *   #acao-aberta
   *   #acao-pagamento
   *   #acao-comprovativo
   *   #acao-descricao
   *   #acao-save
   *   #acao-cancel-edit
   *   #acoes-admin-list
   *   #acoes-refresh
   *   #acoes-export-all
   *
   * IMPORTANTE:
   * - Não cria CSS.
   * - Não cria a aba Ações.
   * - Não altera outras áreas do administrador.
   * - Não depende de acoes-admin-tab-fix.js.
   * - Usa a configuração já existente em admin-config.js.
   * ============================================================
   */


  const state = {
    supabase: null,
    actions: [],
    registrations: new Map()
  };


  /* ============================================================
     HELPERS
  ============================================================ */

  const $ = (id) => document.getElementById(id);


  const esc = (value) => {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      })[char]
    );
  };


  const money = (value) => {
    const number = Number(value || 0);

    return `${number.toFixed(2).replace('.', ',')} €`;
  };


  const datePt = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleDateString('pt-PT');
  };


  const dateTimePt = (value) => {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('pt-PT');
  };


  function showResult(message, type = 'success') {

    const element = $('acoes-admin-result');

    if (!element) return;

    element.textContent = message;
    element.className = `admin-result ${type}`;
    element.hidden = false;
  }


  function hideResult() {

    const element = $('acoes-admin-result');

    if (!element) return;

    element.hidden = true;
    element.textContent = '';
  }


  function fail(error) {

    console.error('[AÇÕES]', error);

    showResult(
      error?.message ||
      String(error),
      'error'
    );
  }


  function getConfig() {

    return window.NAF_ADMIN_CONFIG || {};
  }


  /* ============================================================
     SUPABASE
  ============================================================ */

  function createSupabaseClient() {

    if (state.supabase) {
      return state.supabase;
    }

    /*
     * admin-config.js é carregado antes deste ficheiro.
     */

    const config = getConfig();

    if (
      !config.SUPABASE_URL ||
      !config.SUPABASE_ANON_KEY
    ) {
      throw new Error(
        'Configuração do Supabase incompleta.'
      );
    }


    /*
     * O admin.html já carrega:
     *
     * https://cdn.jsdelivr.net/npm/@Supabase/supabase-js@2
     *
     */

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== 'function'
    ) {
      throw new Error(
        'A biblioteca Supabase não foi carregada.'
      );
    }


    state.supabase =
      window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY
      );

    return state.supabase;
  }


  /* ============================================================
     BOTÕES DE ESTADO
  ============================================================ */

  function setupToggleButtons() {

    const buttons =
      document.querySelectorAll(
        '#panel-acoes .acao-toggle[data-toggle]'
      );


    buttons.forEach((button) => {

      const inputId =
        button.dataset.toggle;

      const input =
        $(inputId);

      if (!input) {
        console.warn(
          `[AÇÕES] Checkbox não encontrado: ${inputId}`
        );

        return;
      }


      /*
       * Evita registar o evento duas vezes.
       */

      if (
        button.dataset.acoesToggleReady === '1'
      ) {
        syncToggleButton(
          button,
          input
        );

        return;
      }


      button.dataset.acoesToggleReady = '1';


      /*
       * Estado inicial.
       */

      syncToggleButton(
        button,
        input
      );


      /*
       * Clique.
       */

      button.addEventListener(
        'click',
        (event) => {

          event.preventDefault();

          input.checked =
            !input.checked;

          syncToggleButton(
            button,
            input
          );


          /*
           * Dispara change para qualquer
           * código externo que esteja a ouvir
           * os checkboxes.
           */

          input.dispatchEvent(
            new Event(
              'change',
              {
                bubbles: true
              }
            )
          );
        }
      );


      /*
       * Alteração externa do checkbox.
       */

      input.addEventListener(
        'change',
        () => {

          syncToggleButton(
            button,
            input
          );
        }
      );
    });
  }


  function syncToggleButton(
    button,
    input
  ) {

    const active =
      input.checked === true;


    button.setAttribute(
      'aria-pressed',
      active
        ? 'true'
        : 'false'
    );


    button.classList.toggle(
      'active',
      active
    );
  }


  /* ============================================================
     FORMULÁRIO
  ============================================================ */

  function resetForm() {

    const form =
      $('acao-form');

    if (form) {
      form.reset();
    }


    if ($('acao-id')) {
      $('acao-id').value = '';
    }


    if ($('acao-valor')) {
      $('acao-valor').value = '0';
    }


    /*
     * Estado inicial recomendado:
     *
     * atividade ativa
     * inscrições fechadas
     * pagamento não obrigatório
     * comprovativo não obrigatório
     */

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

      $('acao-save').disabled =
        false;
    }


    if ($('acao-cancel-edit')) {
      $('acao-cancel-edit').hidden =
        true;
    }


    setupToggleButtons();
  }


  function editAction(action) {

    if (!action) {
      return;
    }


    if ($('acao-id')) {
      $('acao-id').value =
        action.id || '';
    }


    if ($('acao-titulo')) {
      $('acao-titulo').value =
        action.titulo || '';
    }


    if ($('acao-local')) {
      $('acao-local').value =
        action.local || '';
    }


    if ($('acao-data')) {
      $('acao-data').value =
        action.data || '';
    }


    if ($('acao-hora')) {
      $('acao-hora').value =
        action.hora
          ? String(action.hora)
              .substring(0, 5)
          : '';
    }


    if ($('acao-prazo')) {

      if (action.prazo_inscricao) {

        const date =
          new Date(
            action.prazo_inscricao
          );

        if (!Number.isNaN(date.getTime())) {

          /*
           * datetime-local precisa do
           * formato YYYY-MM-DDTHH:mm.
           */

          const local =
            new Date(
              date.getTime() -
              date.getTimezoneOffset() * 60000
            )
              .toISOString()
              .slice(0, 16);

          $('acao-prazo').value =
            local;
        } else {
          $('acao-prazo').value = '';
        }

      } else {

        $('acao-prazo').value = '';
      }
    }


    if ($('acao-limite')) {
      $('acao-limite').value =
        action.limite_inscricoes ??
        '';
    }


    if ($('acao-valor')) {
      $('acao-valor').value =
        action.valor ??
        0;
    }


    if ($('acao-ativa')) {
      $('acao-ativa').checked =
        action.ativa === true;
    }


    if ($('acao-aberta')) {
      $('acao-aberta').checked =
        action.inscricoes_abertas === true;
    }


    if ($('acao-pagamento')) {
      $('acao-pagamento').checked =
        action.pagamento_obrigatorio === true;
    }


    if ($('acao-comprovativo')) {
      $('acao-comprovativo').checked =
        action.comprovativo_obrigatorio === true;
    }


    if ($('acao-descricao')) {
      $('acao-descricao').value =
        action.descricao || '';
    }


    if ($('acoes-form-title')) {
      $('acoes-form-title').textContent =
        `Editar: ${action.titulo || 'atividade'}`;
    }


    if ($('acao-save')) {
      $('acao-save').textContent =
        'Guardar alterações';

      $('acao-save').disabled =
        false;
    }


    if ($('acao-cancel-edit')) {
      $('acao-cancel-edit').hidden =
        false;
    }


    setupToggleButtons();


    /*
     * Leva o administrador até ao formulário.
     */

    $('panel-acoes')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
  }


  /* ============================================================
     VALIDAÇÃO DO FORMULÁRIO
  ============================================================ */

  function readActionForm() {

    const titulo =
      $('acao-titulo')
        ?.value
        ?.trim();


    if (!titulo) {

      throw new Error(
        'Indica o nome da atividade.'
      );
    }


    const pagamento =
      $('acao-pagamento')
        ?.checked === true;


    const comprovativo =
      $('acao-comprovativo')
        ?.checked === true;


    if (
      comprovativo &&
      !pagamento
    ) {

      throw new Error(
        'O comprovativo só pode ser obrigatório quando o pagamento é obrigatório.'
      );
    }


    const limiteRaw =
      $('acao-limite')
        ?.value
        ?.trim();


    let limite = null;

    if (limiteRaw) {

      limite =
        Number(limiteRaw);

      if (
        !Number.isInteger(limite) ||
        limite <= 0
      ) {

        throw new Error(
          'O limite de inscrições tem de ser um número inteiro positivo.'
        );
      }
    }


    const valorRaw =
      $('acao-valor')
        ?.value
        ?.trim();


    const valor =
      pagamento
        ? Number(valorRaw || 0)
        : 0;


    if (
      !Number.isFinite(valor) ||
      valor < 0
    ) {

      throw new Error(
        'O valor da atividade não é válido.'
      );
    }


    let prazo = null;

    const prazoRaw =
      $('acao-prazo')
        ?.value
        ?.trim();


    if (prazoRaw) {

      const date =
        new Date(prazoRaw);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {

        throw new Error(
          'O prazo de inscrição não é válido.'
        );
      }

      prazo =
        date.toISOString();
    }


    const ativa =
      $('acao-ativa')
        ?.checked === true;


    let inscricoesAbertas =
      $('acao-aberta')
        ?.checked === true;


    /*
     * Uma atividade inativa não pode
     * ter inscrições abertas.
     */

    if (!ativa) {
      inscricoesAbertas = false;
    }


    return {

      titulo,

      descricao:
        $('acao-descricao')
          ?.value
          ?.trim() ||
        null,

      local:
        $('acao-local')
          ?.value
          ?.trim() ||
        null,

      data:
        $('acao-data')
          ?.value ||
        null,

      hora:
        $('acao-hora')
          ?.value ||
        null,

      prazo_inscricao:
        prazo,

      limite_inscricoes:
        limite,

      ativa,

      inscricoes_abertas:
        inscricoesAbertas,

      pagamento_obrigatorio:
        pagamento,

      valor,

      comprovativo_obrigatorio:
        pagamento &&
        comprovativo
    };
  }


  /* ============================================================
     CRIAR / EDITAR
  ============================================================ */

  async function saveAction(event) {

    if (event) {
      event.preventDefault();
    }


    hideResult();


    const saveButton =
      $('acao-save');


    if (saveButton) {
      saveButton.disabled = true;
    }


    try {

      const client =
        createSupabaseClient();


      const id =
        $('acao-id')
          ?.value
          ?.trim() ||
        null;


      const payload =
        readActionForm();


      if (id) {

        /*
         * EDIÇÃO
         */

        const {
          error
        } =
          await client
            .from('acoes')
            .update(payload)
            .eq(
              'id',
              id
            );


        if (error) {
          throw error;
        }


        showResult(
          'Atividade atualizada com sucesso.'
        );

      } else {

        /*
         * CRIAÇÃO
         */

        const {
          error
        } =
          await client
            .from('acoes')
            .insert(payload);


        if (error) {
          throw error;
        }


        showResult(
          'Atividade criada com sucesso.'
        );
      }


      resetForm();

      await loadActions();

    } catch (error) {

      fail(error);

    } finally {

      if (saveButton) {
        saveButton.disabled =
          false;
      }
    }
  }


  /* ============================================================
     CARREGAR ATIVIDADES
  ============================================================ */

  async function loadActions() {

    const client =
      createSupabaseClient();


    const list =
      $('acoes-admin-list');


    if (list) {

      list.innerHTML =
        '<div class="admin-loading">A carregar…</div>';
    }


    const {
      data,
      error
    } =
      await client
        .from('acoes')
        .select('*')
        .order(
          'created_at',
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    state.actions =
      data || [];


    renderActions();
  }


  /* ============================================================
     RENDER DAS ATIVIDADES
  ============================================================ */

  function renderActions() {

    const list =
      $('acoes-admin-list');


    if (!list) {
      return;
    }


    if (!state.actions.length) {

      list.innerHTML =
        `
          <div class="acao-empty">
            Ainda não existem atividades criadas.
          </div>
        `;

      return;
    }


    list.innerHTML =
      state.actions
        .map(
          renderActionCard
        )
        .join('');


    bindActionButtons();
  }


  function renderActionCard(action) {

    const payment =
      action.pagamento_obrigatorio
        ? `Pagamento: ${money(action.valor)}`
        : 'Sem pagamento';


    const activeClass =
      action.ativa
        ? 'ok'
        : '';


    const openClass =
      action.inscricoes_abertas
        ? 'ok'
        : '';


    return `
      <article
        class="acao-admin-item"
        data-action-id="${esc(action.id)}"
      >

        <div class="acao-admin-item-head">

          <div>

            <h4>
              ${esc(action.titulo)}
            </h4>

            <div class="acao-admin-meta">

              <span>
                📅 ${datePt(action.data)}
              </span>

              ${
                action.hora
                  ? `
                    <span>
                      🕐 ${esc(
                        String(
                          action.hora
                        ).substring(0, 5)
                      )}
                    </span>
                  `
                  : ''
              }

              ${
                action.local
                  ? `
                    <span>
                      📍 ${esc(
                        action.local
                      )}
                    </span>
                  `
                  : ''
              }

              <span>
                💶 ${esc(payment)}
              </span>

              ${
                action.limite_inscricoes
                  ? `
                    <span>
                      👥 Limite:
                      ${esc(
                        action.limite_inscricoes
                      )}
                    </span>
                  `
                  : ''
              }

            </div>

          </div>


          <div class="acao-badges">

            <span
              class="acao-badge ${activeClass}"
            >
              ${
                action.ativa
                  ? 'Ativa'
                  : 'Inativa'
              }
            </span>


            <span
              class="acao-badge ${openClass}"
            >
              ${
                action.inscricoes_abertas
                  ? 'Inscrições abertas'
                  : 'Inscrições fechadas'
              }
            </span>


            ${
              action.pagamento_obrigatorio
                ? `
                  <span class="acao-badge">
                    Pagamento
                  </span>
                `
                : ''
            }


            ${
              action.comprovativo_obrigatorio
                ? `
                  <span class="acao-badge warn">
                    Comprovativo obrigatório
                  </span>
                `
                : ''
            }

          </div>

        </div>


        <p class="acao-admin-description">
          ${
            esc(
              action.descricao ||
              'Sem descrição.'
            )
          }
        </p>


        <div class="acao-admin-buttons">

          <button
            type="button"
            class="admin-small-btn primary"
            data-action-edit="${esc(action.id)}"
          >
            Editar
          </button>


          <button
            type="button"
            class="admin-small-btn"
            data-action-toggle="${esc(action.id)}"
          >
            ${
              action.ativa
                ? 'Desativar'
                : 'Ativar'
            }
          </button>


          <button
            type="button"
            class="admin-small-btn"
            data-action-open="${esc(action.id)}"
          >
            ${
              action.inscricoes_abertas
                ? 'Fechar inscrições'
                : 'Abrir inscrições'
            }
          </button>


          <button
            type="button"
            class="admin-small-btn"
            data-action-registrations="${esc(action.id)}"
          >
            Ver inscritos
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
          id="acao-inscricoes-${esc(action.id)}"
          class="acao-inscricoes-wrap"
          hidden
        ></div>

      </article>
    `;
  }


  /* ============================================================
     BOTÕES DAS ATIVIDADES
  ============================================================ */

  function bindActionButtons() {


    document
      .querySelectorAll(
        '[data-action-edit]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            const action =
              state.actions.find(
                (item) =>
                  String(item.id) ===
                  String(
                    button.dataset.actionEdit
                  )
              );


            if (action) {
              editAction(action);
            }
          }
        );
      });


    document
      .querySelectorAll(
        '[data-action-toggle]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            toggleAction(
              button.dataset.actionToggle,
              'ativa'
            );
          }
        );
      });


    document
      .querySelectorAll(
        '[data-action-open]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            toggleAction(
              button.dataset.actionOpen,
              'inscricoes_abertas'
            );
          }
        );
      });


    document
      .querySelectorAll(
        '[data-action-registrations]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            toggleRegistrations(
              button.dataset.actionRegistrations
            );
          }
        );
      });


    document
      .querySelectorAll(
        '[data-action-export]'
      )
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


  /* ============================================================
     ATIVAR / DESATIVAR
  ============================================================ */

  async function toggleAction(
    actionId,
    field
  ) {

    try {

      const client =
        createSupabaseClient();


      const action =
        state.actions.find(
          (item) =>
            String(item.id) ===
            String(actionId)
        );


      if (!action) {

        throw new Error(
          'Atividade não encontrada.'
        );
      }


      const next =
        !Boolean(
          action[field]
        );


      const update = {
        [field]: next
      };


      /*
       * Se a atividade for desativada,
       * fechamos também as inscrições.
       */

      if (
        field === 'ativa' &&
        next === false
      ) {

        update.inscricoes_abertas =
          false;
      }


      /*
       * Não é possível abrir inscrições
       * numa atividade inativa.
       */

      if (
        field === 'inscricoes_abertas' &&
        next === true &&
        action.ativa !== true
      ) {

        throw new Error(
          'A atividade tem de estar ativa antes de abrir as inscrições.'
        );
      }


      const {
        error
      } =
        await client
          .from('acoes')
          .update(update)
          .eq(
            'id',
            actionId
          );


      if (error) {
        throw error;
      }


      showResult(
        field === 'ativa'
          ? (
              next
                ? 'Atividade ativada.'
                : 'Atividade desativada e inscrições fechadas.'
            )
          : (
              next
                ? 'Inscrições abertas.'
                : 'Inscrições fechadas.'
            )
      );


      await loadActions();

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     INSCRIÇÕES
  ============================================================ */

  async function loadRegistrations(
    actionId
  ) {

    const client =
      createSupabaseClient();


    const {
      data,
      error
    } =
      await client
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
          socios(
            numero_socio,
            nome,
            email,
            telemovel
          ),
          acoes(
            titulo,
            data,
            hora,
            local,
            valor,
            pagamento_obrigatorio
          )
        `)
        .eq(
          'acao_id',
          actionId
        )
        .order(
          'data_inscricao',
          {
            ascending: false
          }
        );


    if (error) {
      throw error;
    }


    return data || [];
  }


  async function toggleRegistrations(
    actionId
  ) {

    const container =
      $(
        `acao-inscricoes-${actionId}`
      );


    if (!container) {
      return;
    }


    if (!container.hidden) {

      container.hidden =
        true;

      return;
    }


    container.hidden =
      false;


    container.innerHTML =
      `
        <div class="admin-loading">
          A carregar inscrições…
        </div>
      `;


    try {

      const rows =
        await loadRegistrations(
          actionId
        );


      state.registrations.set(
        String(actionId),
        rows
      );


      renderRegistrations(
        container,
        rows
      );

    } catch (error) {

      container.innerHTML =
        `
          <div class="admin-result error">
            ${esc(
              error?.message ||
              String(error)
            )}
          </div>
        `;
    }
  }


  /* ============================================================
     RENDER INSCRIÇÕES
  ============================================================ */

  function renderRegistrations(
    container,
    rows
  ) {

    if (!rows.length) {

      container.innerHTML =
        `
          <div class="acao-empty">
            Ainda não existem inscrições nesta atividade.
          </div>
        `;

      return;
    }


    container.innerHTML =
      `
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

            ${
              rows
                .map(
                  renderRegistrationRow
                )
                .join('')
            }

          </tbody>

        </table>
      `;


    /*
     * Comprovativos.
     */

    container
      .querySelectorAll(
        '[data-proof]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            openProof(
              button.dataset.proof
            );
          }
        );
      });


    /*
     * Estado.
     */

    container
      .querySelectorAll(
        '[data-state]'
      )
      .forEach((select) => {

        select.addEventListener(
          'change',
          () => {

            changeRegistrationState(
              select.dataset.state,
              select.value
            );
          }
        );
      });


    /*
     * Pagamento.
     */

    container
      .querySelectorAll(
        '[data-pay]'
      )
      .forEach((button) => {

        button.addEventListener(
          'click',
          () => {

            confirmPayment(
              button.dataset.pay
            );
          }
        );
      });
  }


  function renderRegistrationRow(
    row
  ) {

    const paymentRequired =
      row.acoes
        ?.pagamento_obrigatorio === true;


    const paymentConfirmed =
      row.pagamento_confirmado === true;


    return `
      <tr>

        <td>
          ${esc(
            row.socios
              ?.numero_socio ??
            ''
          )}
        </td>


        <td>

          <strong>
            ${esc(
              row.socios
                ?.nome ??
              ''
            )}
          </strong>

          ${
            row.socios?.email
              ? `
                <br>
                <span class="acao-small-note">
                  ${esc(
                    row.socios.email
                  )}
                </span>
              `
              : ''
          }

        </td>


        <td>
          ${dateTimePt(
            row.data_inscricao
          )}
        </td>


        <td>

          ${
            !paymentRequired

              ? 'Sem pagamento'

              : (
                  paymentConfirmed
                    ? '✅ Confirmado'
                    : '⏳ Pendente'
                )
          }

        </td>


        <td>

          ${
            row.comprovativo_path

              ? `
                <button
                  type="button"
                  class="admin-small-btn"
                  data-proof="${esc(row.id)}"
                >
                  Abrir
                </button>
              `

              : '—'
          }

        </td>


        <td>

          <span
            class="
              acao-status
              acao-status-${esc(
                row.estado ||
                'pendente'
              )}
            "
          >
            ${esc(
              row.estado ||
              'pendente'
            )}
          </span>

        </td>


        <td>

          <select
            class="acao-state"
            data-state="${esc(row.id)}"
          >

            ${renderStateOptions(
              row.estado
            )}

          </select>


          ${
            paymentRequired &&
            !paymentConfirmed

              ? `
                <button
                  type="button"
                  class="admin-small-btn primary"
                  data-pay="${esc(row.id)}"
                >
                  Confirmar pagamento
                </button>
              `

              : ''
          }

        </td>

      </tr>
    `;
  }


  function renderStateOptions(
    current
  ) {

    const states = [
      'pendente',
      'confirmada',
      'cancelada',
      'rejeitada'
    ];


    return states
      .map(
        (status) =>
          `
            <option
              value="${status}"
              ${
                String(current || 'pendente') ===
                status
                  ? 'selected'
                  : ''
              }
            >
              ${status}
            </option>
          `
      )
      .join('');
  }


  /* ============================================================
     ALTERAR ESTADO DA INSCRIÇÃO
  ============================================================ */

  async function changeRegistrationState(
    registrationId,
    estado
  ) {

    try {

      const client =
        createSupabaseClient();


      const {
        error
      } =
        await client
          .from('acoes_inscricoes')
          .update({
            estado
          })
          .eq(
            'id',
            registrationId
          );


      if (error) {
        throw error;
      }


      showResult(
        'Estado da inscrição atualizado.'
      );


      /*
       * Atualiza os dados em memória.
       */

      for (
        const rows
        of state.registrations.values()
      ) {

        const row =
          rows.find(
            (item) =>
              String(item.id) ===
              String(registrationId)
          );


        if (row) {
          row.estado =
            estado;
        }
      }

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     CONFIRMAR PAGAMENTO
  ============================================================ */

  async function confirmPayment(
    registrationId
  ) {

    try {

      const client =
        createSupabaseClient();


      const {
        error
      } =
        await client
          .from('acoes_inscricoes')
          .update({
            pagamento_confirmado: true,
            estado: 'confirmada'
          })
          .eq(
            'id',
            registrationId
          );


      if (error) {
        throw error;
      }


      showResult(
        'Pagamento confirmado e inscrição marcada como confirmada.'
      );


      /*
       * Descobrir a atividade à qual
       * pertence a inscrição.
       */

      let actionId = null;


      for (
        const [
          key,
          rows
        ]
        of state.registrations.entries()
      ) {

        if (
          rows.some(
            (row) =>
              String(row.id) ===
              String(registrationId)
          )
        ) {

          actionId =
            key;

          break;
        }
      }


      if (actionId) {

        const container =
          $(
            `acao-inscricoes-${actionId}`
          );


        if (
          container &&
          !container.hidden
        ) {

          const rows =
            await loadRegistrations(
              actionId
            );


          state.registrations.set(
            String(actionId),
            rows
          );


          renderRegistrations(
            container,
            rows
          );
        }
      }

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     COMPROVATIVO
  ============================================================ */

  async function openProof(
    registrationId
  ) {

    try {

      const client =
        createSupabaseClient();


      let row = null;


      for (
        const rows
        of state.registrations.values()
      ) {

        row =
          rows.find(
            (item) =>
              String(item.id) ===
              String(registrationId)
          );


        if (row) {
          break;
        }
      }


      if (
        !row ||
        !row.comprovativo_path
      ) {

        throw new Error(
          'Comprovativo não encontrado.'
        );
      }


      /*
       * O caminho depende do bucket utilizado
       * pela área de Ações.
       *
       * Primeiro tentamos o bucket específico.
       */

      const buckets = [
        'comprovativos-acoes',
        'comprovativos'
      ];


      let signedUrl = null;
      let lastError = null;


      for (
        const bucket
        of buckets
      ) {

        try {

          const {
            data,
            error
          } =
            await client.storage
              .from(bucket)
              .createSignedUrl(
                row.comprovativo_path,
                300
              );


          if (
            !error &&
            data?.signedUrl
          ) {

            signedUrl =
              data.signedUrl;

            break;
          }


          lastError =
            error;

        } catch (error) {

          lastError =
            error;
        }
      }


      if (!signedUrl) {

        throw (
          lastError ||
          new Error(
            'Não foi possível abrir o comprovativo.'
          )
        );
      }


      window.open(
        signedUrl,
        '_blank',
        'noopener,noreferrer'
      );

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     EXCEL
  ============================================================ */

  async function loadXlsx() {

    if (window.XLSX) {
      return window.XLSX;
    }


    await new Promise(
      (resolve, reject) => {

        const script =
          document.createElement(
            'script'
          );


        script.src =
          'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';


        script.onload =
          resolve;


        script.onerror =
          () =>
            reject(
              new Error(
                'Não foi possível carregar o módulo Excel.'
              )
            );


        document.head.appendChild(
          script
        );
      }
    );


    return window.XLSX;
  }


  async function getAllRegistrations(
    actionId = null
  ) {

    const client =
      createSupabaseClient();


    let query =
      client
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
          socios(
            numero_socio,
            nome,
            email,
            telemovel
          ),
          acoes(
            titulo,
            data,
            hora,
            local,
            valor,
            pagamento_obrigatorio
          )
        `)
        .order(
          'data_inscricao',
          {
            ascending: false
          }
        );


    if (actionId) {

      query =
        query.eq(
          'acao_id',
          actionId
        );
    }


    const {
      data,
      error
    } =
      await query;


    if (error) {
      throw error;
    }


    return data || [];
  }


  function registrationToExcelRow(
    row
  ) {

    return {

      'Nº Sócio':
        row.socios
          ?.numero_socio ??
        '',

      'Nome':
        row.socios
          ?.nome ??
        '',

      'Email':
        row.socios
          ?.email ??
        '',

      'Telemóvel':
        row.socios
          ?.telemovel ??
        '',

      'Atividade':
        row.acoes
          ?.titulo ??
        '',

      'Data da atividade':
        row.acoes
          ?.data ??
        '',

      'Hora':
        row.acoes?.hora
          ? String(
              row.acoes.hora
            ).substring(0, 5)
          : '',

      'Local':
        row.acoes
          ?.local ??
        '',

      'Data da inscrição':
        row.data_inscricao
          ? new Date(
              row.data_inscricao
            ).toLocaleString(
              'pt-PT'
            )
          : '',

      'Valor (€)':
        row.acoes
          ?.pagamento_obrigatorio
          ? Number(
              row.acoes.valor ||
              0
            )
          : 0,

      'Pagamento obrigatório':
        row.acoes
          ?.pagamento_obrigatorio
          ? 'Sim'
          : 'Não',

      'Pagamento confirmado':
        row.pagamento_confirmado
          ? 'Sim'
          : 'Não',

      'Comprovativo':
        row.comprovativo_nome ||
        '',

      'Estado':
        row.estado ||
        'pendente',

      'Observações':
        row.observacoes ||
        ''
    };
  }


  function safeFilename(
    text
  ) {

    return String(
      text ||
      'todas'
    )
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-zA-Z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )
      .toLowerCase() ||
      'todas';
  }


  async function exportRegistrations(
    actionId = null
  ) {

    try {

      const XLSX =
        await loadXlsx();


      const rows =
        await getAllRegistrations(
          actionId
        );


      if (!rows.length) {

        throw new Error(
          'Não existem inscrições para exportar.'
        );
      }


      const excelRows =
        rows.map(
          registrationToExcelRow
        );


      const worksheet =
        XLSX.utils.json_to_sheet(
          excelRows
        );


      /*
       * Larguras das colunas.
       */

      worksheet['!cols'] = [
        { wch: 12 },
        { wch: 30 },
        { wch: 34 },
        { wch: 16 },
        { wch: 30 },
        { wch: 18 },
        { wch: 10 },
        { wch: 24 },
        { wch: 22 },
        { wch: 14 },
        { wch: 20 },
        { wch: 22 },
        { wch: 28 },
        { wch: 16 },
        { wch: 35 }
      ];


      const workbook =
        XLSX.utils.book_new();


      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        'Inscrições'
      );


      const action =
        actionId
          ? state.actions.find(
              (item) =>
                String(item.id) ===
                String(actionId)
            )
          : null;


      const filename =
        `inscricoes-${
          safeFilename(
            action?.titulo ||
            'todas'
          )
        }-${
          new Date()
            .toISOString()
            .slice(0, 10)
        }.xlsx`;


      XLSX.writeFile(
        workbook,
        filename
      );


      showResult(
        'Ficheiro Excel exportado com sucesso.'
      );

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     INICIALIZAÇÃO
  ============================================================ */

  function bindEvents() {


    /*
     * Formulário.
     */

    const form =
      $('acao-form');


    if (form) {

      form.addEventListener(
        'submit',
        saveAction
      );
    }


    /*
     * Cancelar edição.
     */

    $('acao-cancel-edit')
      ?.addEventListener(
        'click',
        () => {

          resetForm();

          hideResult();
        }
      );


    /*
     * Atualizar atividades.
     */

    $('acoes-refresh')
      ?.addEventListener(
        'click',
        async () => {

          try {

            hideResult();

            await loadActions();

            showResult(
              'Lista de atividades atualizada.'
            );

          } catch (error) {

            fail(error);
          }
        }
      );


    /*
     * Exportar todas.
     */

    $('acoes-export-all')
      ?.addEventListener(
        'click',
        () => {

          exportRegistrations(
            null
          );
        }
      );


    /*
     * Botões dos quatro estados.
     */

    setupToggleButtons();
  }


  async function init() {

    /*
     * Não fazemos nada se esta página não
     * tiver a área Ações.
     *
     * Isto permite que o ficheiro seja carregado
     * sem interferir com outras páginas.
     */

    if (
      !$('panel-acoes') ||
      !$('acoes-admin-module')
    ) {
      return;
    }


    try {

      createSupabaseClient();

      bindEvents();

      await loadActions();

    } catch (error) {

      fail(error);
    }
  }


  /* ============================================================
     ARRANQUE
  ============================================================ */

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

})();
