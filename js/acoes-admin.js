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

    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString('pt-PT');
  };

  const dateTimePt = value => {
    if (!value) return '—';

    const d = new Date(value);

    return Number.isNaN(d.getTime())
      ? String(value)
      : d.toLocaleString('pt-PT');
  };

  const money = value =>
    `${Number(value || 0).toFixed(2).replace('.', ',')} €`;


  /* =========================================================
     ABA AÇÕES
  ========================================================= */

  function installAcoesTabAndStyles() {

    const panel = $('panel-acoes');
    const tabs = document.querySelector('.admin-tabs');

    if (!tabs) return;


    /*
      GARANTE QUE A ABA AÇÕES EXISTE
    */

    let tab = $('tab-acoes');

    if (!tab) {

      tab = document.createElement('button');

      tab.id = 'tab-acoes';
      tab.className = 'admin-tab';
      tab.dataset.panel = 'acoes';
      tab.type = 'button';

      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', 'panel-acoes');

      tab.textContent = 'Ações';
    }


    /*
      COLOCA AÇÕES ENTRE DRº ÁRBITRO E QUESTÕES
    */

    const dr = $('tab-dr-arbitro');
    const questoes = $('tab-questoes');

    if (questoes) {

      tabs.insertBefore(tab, questoes);

    } else if (dr) {

      dr.insertAdjacentElement('afterend', tab);

    } else {

      tabs.appendChild(tab);
    }


    /*
      GARANTE QUE A ABA NÃO ESTÁ ESCONDIDA
    */

    tab.hidden = false;
    tab.style.display = '';


    /*
      O PAINEL DE AÇÕES DEVE FICAR DEPOIS DA BARRA
      DE SEPARADORES.
    */

    if (panel) {

      const parent = tabs.parentElement;

      if (parent && panel.parentElement !== parent) {
        parent.appendChild(panel);
      }
    }


    /*
      LIGAÇÃO DA ABA
    */

    if (!tab.dataset.acoesBound) {

      tab.dataset.acoesBound = 'true';

      tab.addEventListener('click', () => {

        document.querySelectorAll('.admin-tab').forEach(t => {

          t.classList.remove('active');

          t.setAttribute(
            'aria-selected',
            t === tab ? 'true' : 'false'
          );
        });


        document.querySelectorAll('.admin-tab-panel').forEach(p => {

          p.classList.toggle(
            'active',
            p === panel
          );
        });


        if (panel) {

          panel.hidden = false;
          panel.classList.add('active');
        }
      });
    }


    /*
      BOTÕES DE ESTADO
    */

    const toggleIds = [
      ['acao-ativa', 'Atividade ativa'],
      ['acao-aberta', 'Inscrições abertas'],
      ['acao-pagamento', 'Pagamento obrigatório'],
      ['acao-comprovativo', 'Comprovativo obrigatório']
    ];


    toggleIds.forEach(([id, text]) => {

      const input = $(id);

      if (!input) return;


      const label = input.closest('label');

      if (!label) return;


      label.classList.add('acoes-toggle-label');

      label.setAttribute('role', 'button');
      label.setAttribute('tabindex', '0');

      label.dataset.toggleFor = id;


      input.classList.add('acoes-toggle-input');

      input.setAttribute(
        'aria-hidden',
        'true'
      );


      /*
        TEXTO DO BOTÃO
      */

      let textNode =
        label.querySelector('.acoes-toggle-text');


      if (!textNode) {

        textNode = document.createElement('span');

        textNode.className =
          'acoes-toggle-text';

        textNode.textContent = text;

        label.insertBefore(
          textNode,
          input
        );
      }


      /*
        INDICADOR ✓
      */

      let check =
        label.querySelector('.acoes-toggle-check');


      if (!check) {

        check = document.createElement('span');

        check.className =
          'acoes-toggle-check';

        check.setAttribute(
          'aria-hidden',
          'true'
        );

        label.appendChild(check);
      }


      const sync = () => {

        label.classList.toggle(
          'active',
          input.checked
        );

        check.textContent =
          input.checked ? '✓' : '';

        label.setAttribute(
          'aria-pressed',
          input.checked ? 'true' : 'false'
        );
      };


      sync();


      /*
        NÃO DUPLICAR EVENTOS
      */

      if (!label.dataset.toggleBound) {

        label.dataset.toggleBound = 'true';


        label.addEventListener(
          'click',
          event => {

            if (event.target === input) {
              return;
            }

            input.checked =
              !input.checked;

            input.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );

            sync();
          }
        );


        label.addEventListener(
          'keydown',
          event => {

            if (
              event.key !== 'Enter' &&
              event.key !== ' '
            ) {
              return;
            }

            event.preventDefault();

            input.checked =
              !input.checked;

            input.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );

            sync();
          }
        );


        input.addEventListener(
          'change',
          sync
        );
      }
    });


    /*
      CSS DOS BOTÕES
      Fica dentro deste próprio ficheiro.
      Não é necessário criar outro JS.
    */

    if (!$('acoes-inline-style')) {

      const style =
        document.createElement('style');

      style.id =
        'acoes-inline-style';


      style.textContent = `

        /* ==========================================
           ABA AÇÕES
        ========================================== */

        #tab-acoes {
          display: inline-flex !important;
        }


        /* ==========================================
           BOTÕES DE ESTADO
        ========================================== */

        .acoes-toggle-label {

          position: relative;

          display: inline-flex !important;

          align-items: center !important;

          justify-content: space-between !important;

          gap: 12px !important;

          min-height: 46px;

          padding: 10px 14px !important;

          border: 1px solid #e4dce8 !important;

          border-radius: 13px !important;

          background: #ffffff !important;

          color: #51247a !important;

          font-weight: 700 !important;

          cursor: pointer;

          box-sizing: border-box;

          transition:
            background .18s ease,
            border-color .18s ease,
            color .18s ease,
            box-shadow .18s ease,
            transform .18s ease;

          user-select: none;
        }


        .acoes-toggle-label:hover {

          border-color: #cfa81a !important;

          transform: translateY(-1px);
        }


        /*
          BOTÃO ATIVO
        */

        .acoes-toggle-label.active {

          background: #cfa81a !important;

          border-color: #cfa81a !important;

          color: #ffffff !important;

          box-shadow:
            0 5px 14px rgba(0,0,0,.10);
        }


        /*
          CHECKBOX ORIGINAL ESCONDIDO
        */

        .acoes-toggle-input {

          position: absolute !important;

          opacity: 0 !important;

          pointer-events: none !important;

          width: 1px !important;

          height: 1px !important;
        }


        /*
          TEXTO
        */

        .acoes-toggle-text {

          flex: 1;
        }


        /*
          CÍRCULO DO ✓
        */

        .acoes-toggle-check {

          display: inline-flex;

          align-items: center;

          justify-content: center;

          width: 24px;

          height: 24px;

          border-radius: 50%;

          border: 1px solid currentColor;

          font-size: 14px;

          line-height: 1;

          flex-shrink: 0;
        }


        .acoes-toggle-label.active
        .acoes-toggle-check {

          background:
            rgba(255,255,255,.18);

          border-color:
            rgba(255,255,255,.85);
        }


        /*
          GRELHA DOS QUATRO BOTÕES
        */

        .acoes-options {

          display: grid !important;

          grid-template-columns:
            repeat(
              2,
              minmax(220px, 1fr)
            );

          gap: 10px !important;

          width: 100%;

          margin:
            4px 0 6px;
        }


        /*
          PAINEL
        */

        #panel-acoes {

          width: 100%;

          box-sizing: border-box;
        }


        /*
          RESPONSIVO
        */

        @media (max-width: 720px) {

          .acoes-options {

            grid-template-columns:
              1fr;
          }
        }

      `;


      document.head.appendChild(style);
    }
  }



  /* =========================================================
     EXCEL
  ========================================================= */

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
          () => reject(
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



  /* =========================================================
     FORMULÁRIO
  ========================================================= */

  function resetForm() {

    $('acao-form').reset();

    $('acao-id').value = '';

    $('acao-valor').value = '0';

    $('acoes-form-title').textContent =
      'Criar nova atividade';

    $('acao-save').textContent =
      'Criar atividade';

    $('acao-cancel-edit').hidden =
      true;

    installAcoesTabAndStyles();
  }



  function fillForm(action) {

    $('acao-id').value =
      action.id;

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

    $('acao-prazo').value =
      action.prazo_inscricao
        ? new Date(
            action.prazo_inscricao
          ).toISOString().slice(0, 16)
        : '';

    $('acao-limite').value =
      action.limite_inscricoes ?? '';

    $('acao-valor').value =
      action.valor ?? 0;


    $('acao-ativa').checked =
      !!action.ativa;

    $('acao-aberta').checked =
      !!action.inscricoes_abertas;

    $('acao-pagamento').checked =
      !!action.pagamento_obrigatorio;

    $('acao-comprovativo').checked =
      !!action.comprovativo_obrigatorio;


    $('acao-descricao').value =
      action.descricao || '';


    $('acoes-form-title').textContent =
      `Editar: ${action.titulo}`;

    $('acao-save').textContent =
      'Guardar alterações';

    $('acao-cancel-edit').hidden =
      false;


    installAcoesTabAndStyles();


    document
      .querySelector('#panel-acoes')
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
  }



  /* =========================================================
     CARREGAR AÇÕES
  ========================================================= */

  async function loadActions() {

    const {
      data,
      error
    } = await state.sb
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



  /* =========================================================
     LISTA DE AÇÕES
  ========================================================= */

  function renderActions() {

    const root =
      $('acoes-admin-list');


    if (!root) {
      return;
    }


    if (!state.actions.length) {

      root.innerHTML =
        '<div class="acao-empty">Ainda não existem atividades criadas.</div>';

      return;
    }


    root.innerHTML =
      state.actions.map(
        action => {

          const payment =
            action.pagamento_obrigatorio
              ? `Pagamento: ${money(action.valor)}`
              : 'Sem pagamento';


          return `

            <article class="acao-admin-item">

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
                              ).slice(0,5)
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
                    class="acao-badge ${
                      action.ativa
                        ? 'ok'
                        : ''
                    }"
                  >
                    ${
                      action.ativa
                        ? 'Ativa'
                        : 'Inativa'
                    }
                  </span>


                  <span
                    class="acao-badge ${
                      action.inscricoes_abertas
                        ? 'ok'
                        : ''
                    }"
                  >
                    ${
                      action.inscricoes_abertas
                        ? 'Inscrições abertas'
                        : 'Inscrições fechadas'
                    }
                  </span>


                  ${
                    action.comprovativo_obrigatorio
                      ? `
                        <span
                          class="acao-badge warn"
                        >
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
      ).join('');


    /*
      EDITAR
    */

    root
      .querySelectorAll(
        '[data-action-edit]'
      )
      .forEach(btn => {

        btn.onclick = () => {

          const action =
            state.actions.find(
              a =>
                a.id ===
                btn.dataset.actionEdit
            );


          if (action) {
            fillForm(action);
          }
        };
      });


    /*
      ATIVAR / DESATIVAR
    */

    root
      .querySelectorAll(
        '[data-action-toggle]'
      )
      .forEach(btn => {

        btn.onclick = () =>
          toggleAction(
            btn.dataset.actionToggle,
            'ativa'
          );
      });


    /*
      ABRIR / FECHAR INSCRIÇÕES
    */

    root
      .querySelectorAll(
        '[data-action-open]'
      )
      .forEach(btn => {

        btn.onclick = () =>
          toggleAction(
            btn.dataset.actionOpen,
            'inscricoes_abertas'
          );
      });


    /*
      VER INSCRITOS
    */

    root
      .querySelectorAll(
        '[data-action-registrations]'
      )
      .forEach(btn => {

        btn.onclick = () =>
          toggleRegistrations(
            btn.dataset.actionRegistrations
          );
      });


    /*
      EXPORTAR
    */

    root
      .querySelectorAll(
        '[data-action-export]'
      )
      .forEach(btn => {

        btn.onclick = () =>
          exportRegistrations(
            btn.dataset.actionExport
          );
      });
  }



  /* =========================================================
     ATIVAR / DESATIVAR
  ========================================================= */

  async function toggleAction(
    id,
    field
  ) {

    try {

      const action =
        state.actions.find(
          a => a.id === id
        );


      if (!action) {
        return;
      }


      const next =
        !action[field];


      const payload = {
        [field]: next
      };


      if (
        field === 'ativa' &&
        !next
      ) {

        payload.inscricoes_abertas =
          false;
      }


      const {
        error
      } = await state.sb
        .from('acoes')
        .update(payload)
        .eq('id', id);


      if (error) {
        throw error;
      }


      showResult(
        field === 'ativa'
          ? (
              next
                ? 'Atividade ativada.'
                : 'Atividade desativada.'
            )
          : (
              next
                ? 'Inscrições abertas.'
                : 'Inscrições fechadas.'
            )
      );


      await loadActions();

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /* =========================================================
     GUARDAR AÇÃO
  ========================================================= */

  async function saveAction(event) {

    event.preventDefault();

    hideResult();


    const button =
      $('acao-save');


    button.disabled =
      true;


    try {

      const id =
        $('acao-id').value ||
        null;


      const pagamento =
        $('acao-pagamento').checked;


      const comprovativo =
        $('acao-comprovativo').checked;


      if (
        comprovativo &&
        !pagamento
      ) {

        throw new Error(
          'O comprovativo só pode ser obrigatório quando existe pagamento.'
        );
      }


      const payload = {

        titulo:
          $('acao-titulo')
            .value
            .trim(),

        descricao:
          $('acao-descricao')
            .value
            .trim() ||
          null,

        local:
          $('acao-local')
            .value
            .trim() ||
          null,

        data:
          $('acao-data').value ||
          null,

        hora:
          $('acao-hora').value ||
          null,

        prazo_inscricao:
          $('acao-prazo').value
            ? new Date(
                $('acao-prazo').value
              ).toISOString()
            : null,

        limite_inscricoes:
          $('acao-limite').value
            ? Number(
                $('acao-limite').value
              )
            : null,

        ativa:
          $('acao-ativa').checked,

        inscricoes_abertas:
          $('acao-aberta').checked,

        pagamento_obrigatorio:
          pagamento,

        valor:
          pagamento
            ? Number(
                $('acao-valor')
                  .value ||
                0
              )
            : 0,

        comprovativo_obrigatorio:
          pagamento &&
          comprovativo
      };


      if (!payload.titulo) {

        throw new Error(
          'Indica o nome da atividade.'
        );
      }


      if (id) {

        const {
          error
        } = await state.sb
          .from('acoes')
          .update(payload)
          .eq('id', id);


        if (error) {
          throw error;
        }


        showResult(
          'Atividade atualizada com sucesso.'
        );

      } else {

        const {
          error
        } = await state.sb
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

      showResult(
        error.message ||
        String(error),
        'error'
      );

    } finally {

      button.disabled =
        false;
    }
  }



  /* =========================================================
     INSCRIÇÕES
  ========================================================= */

  async function getRegistrations(
    actionId = null
  ) {

    let query =
      state.sb
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
    } = await query;


    if (error) {
      throw error;
    }


    return data || [];
  }



  async function toggleRegistrations(
    actionId
  ) {

    const root =
      $(
        `acao-inscricoes-${actionId}`
      );


    if (!root) {
      return;
    }


    if (!root.hidden) {

      root.hidden =
        true;

      return;
    }


    root.hidden =
      false;


    root.innerHTML =
      '<div class="admin-loading">A carregar inscrições…</div>';


    try {

      const rows =
        await getRegistrations(
          actionId
        );


      state.registrations.set(
        actionId,
        rows
      );


      renderRegistrations(
        root,
        rows
      );

    } catch (error) {

      root.innerHTML =
        `
          <div class="admin-result error">
            ${esc(
              error.message ||
              String(error)
            )}
          </div>
        `;
    }
  }



  /* =========================================================
     MOSTRAR INSCRIÇÕES
  ========================================================= */

  function renderRegistrations(
    root,
    rows
  ) {

    if (!rows.length) {

      root.innerHTML =
        '<div class="acao-empty">Ainda não existem inscrições.</div>';

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

          ${
            rows.map(row => {

              const paid =
                row.pagamento_confirmado;


              const needsPayment =
                !!row.acoes
                  ?.pagamento_obrigatorio;


              return `

                <tr>

                  <td>
                    ${esc(
                      row.socios
                        ?.numero_socio
                    )}
                  </td>


                  <td>

                    <strong>
                      ${esc(
                        row.socios
                          ?.nome
                      )}
                    </strong>

                    <br>

                    <span
                      class="acao-small-note"
                    >
                      ${esc(
                        row.socios
                          ?.email ||
                        ''
                      )}
                    </span>

                  </td>


                  <td>
                    ${dateTimePt(
                      row.data_inscricao
                    )}
                  </td>


                  <td>

                    ${
                      needsPayment

                        ? (
                            paid
                              ? '✅ Confirmado'
                              : '⏳ Pendente'
                          )

                        : 'Sem pagamento'
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
                          row.estado
                        )}
                      "
                    >
                      ${esc(
                        row.estado
                      )}
                    </span>

                  </td>


                  <td>

                    <select
                      class="acao-state"
                      data-state="${esc(row.id)}"
                    >

                      ${
                        [
                          'pendente',
                          'confirmada',
                          'cancelada',
                          'rejeitada'
                        ]
                        .map(
                          status =>
                            `
                              <option
                                value="${status}"
                                ${
                                  row.estado ===
                                  status
                                    ? 'selected'
                                    : ''
                                }
                              >
                                ${status}
                              </option>
                            `
                        )
                        .join('')
                      }

                    </select>


                    ${
                      needsPayment &&
                      !paid

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
            }).join('')
          }

        </tbody>

      </table>
    `;


    /*
      COMPROVATIVOS
    */

    root
      .querySelectorAll(
        '[data-proof]'
      )
      .forEach(btn => {

        btn.onclick =
          () =>
            openProof(
              btn.dataset.proof
            );
      });


    /*
      ESTADOS
    */

    root
      .querySelectorAll(
        '[data-state]'
      )
      .forEach(select => {

        select.onchange =
          () =>
            changeRegistrationState(
              select.dataset.state,
              select.value
            );
      });


    /*
      PAGAMENTOS
    */

    root
      .querySelectorAll(
        '[data-pay]'
      )
      .forEach(btn => {

        btn.onclick =
          () =>
            confirmPayment(
              btn.dataset.pay
            );
      });
  }



  /* =========================================================
     ABRIR COMPROVATIVO
  ========================================================= */

  async function openProof(
    registrationId
  ) {

    try {

      const rows =
        [
          ...state.registrations.values()
        ].flat();


      const row =
        rows.find(
          r =>
            r.id ===
            registrationId
        );


      if (
        !row?.comprovativo_path
      ) {

        throw new Error(
          'Comprovativo não encontrado.'
        );
      }


      const {
        data,
        error
      } =
        await state.sb.storage
          .from(
            'comprovativos-acoes'
          )
          .createSignedUrl(
            row.comprovativo_path,
            300
          );


      if (error) {
        throw error;
      }


      window.open(
        data.signedUrl,
        '_blank',
        'noopener,noreferrer'
      );

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /* =========================================================
     ALTERAR ESTADO
  ========================================================= */

  async function changeRegistrationState(
    id,
    estado
  ) {

    try {

      const {
        error
      } =
        await state.sb
          .from(
            'acoes_inscricoes'
          )
          .update({
            estado
          })
          .eq(
            'id',
            id
          );


      if (error) {
        throw error;
      }


      showResult(
        'Estado da inscrição atualizado.'
      );

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /* =========================================================
     CONFIRMAR PAGAMENTO
  ========================================================= */

  async function confirmPayment(
    id
  ) {

    try {

      const {
        error
      } =
        await state.sb
          .from(
            'acoes_inscricoes'
          )
          .update({
            pagamento_confirmado:
              true,

            estado:
              'confirmada'
          })
          .eq(
            'id',
            id
          );


      if (error) {
        throw error;
      }


      showResult(
        'Pagamento confirmado e inscrição marcada como confirmada.'
      );


      const row =
        [
          ...state.registrations.values()
        ]
        .flat()
        .find(
          r =>
            r.id === id
        );


      if (row) {

        const root =
          $(
            `acao-inscricoes-${row.acao_id}`
          );


        if (
          root &&
          !root.hidden
        ) {

          const rows =
            await getRegistrations(
              row.acao_id
            );


          state.registrations.set(
            row.acao_id,
            rows
          );


          renderRegistrations(
            root,
            rows
          );
        }
      }

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /* =========================================================
     EXPORTAR EXCEL
  ========================================================= */

  async function exportRegistrations(
    actionId = null
  ) {

    try {

      const XLSX =
        await loadXlsx();


      const rows =
        await getRegistrations(
          actionId
        );


      if (!rows.length) {

        throw new Error(
          'Não existem inscrições para exportar.'
        );
      }


      const data =
        rows.map(
          row => ({

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
                  ).slice(0,5)
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
                      row.acoes
                        ?.valor ||
                      0
                    )
                  : 0,

            'Pagamento confirmado':
              row.pagamento_confirmado
                ? 'Sim'
                : 'Não',

            'Comprovativo':
              row.comprovativo_nome ||
              '',

            'Estado':
              row.estado ||
              '',

            'Observações':
              row.observacoes ||
              ''
          })
        );


      const ws =
        XLSX.utils.json_to_sheet(
          data
        );


      ws['!cols'] =
        Object.keys(
          data[0]
        ).map(
          key => ({
            wch:
              Math.min(
                42,
                Math.max(
                  14,
                  key.length + 4
                )
              )
          })
        );


      const wb =
        XLSX.utils.book_new();


      XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Inscrições'
      );


      const action =
        actionId
          ? state.actions.find(
              a =>
                a.id ===
                actionId
            )
          : null;


      const safe =
        (action?.titulo || 'todas')
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
            /^-|-$/g,
            ''
          )
          .toLowerCase();


      XLSX.writeFile(
        wb,
        `inscricoes-${
          safe || 'todas'
        }-${
          new Date()
            .toISOString()
            .slice(0,10)
        }.xlsx`
      );


      showResult(
        'Ficheiro Excel exportado com sucesso.'
      );

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /* =========================================================
     INICIALIZAÇÃO
  ========================================================= */

  async function init() {

    /*
      PRIMEIRO:
      corrige/integraliza a aba Ações
    */

    installAcoesTabAndStyles();


    const module =
      $('acoes-admin-module');


    if (!module) {
      return;
    }


    /*
      USA A MESMA LIGAÇÃO SUPABASE
      DO RESTO DO ADMINISTRADOR
    */

    state.sb =
      window.__NAF_SUPABASE ||
      window.supabaseClient;


    if (!state.sb) {

      showResult(
        'Ligação ao Supabase ainda não está disponível. Atualiza a página.',
        'error'
      );

      return;
    }


    /*
      FORMULÁRIO
    */

    $('acao-form')
      ?.addEventListener(
        'submit',
        saveAction
      );


    /*
      CANCELAR EDIÇÃO
    */

    $('acao-cancel-edit')
      ?.addEventListener(
        'click',
        resetForm
      );


    /*
      ATUALIZAR
    */

    $('acoes-refresh')
      ?.addEventListener(
        'click',
        async () => {

          try {

            await loadActions();

            showResult(
              'Lista de atividades atualizada.'
            );

          } catch (error) {

            showResult(
              error.message ||
              String(error),
              'error'
            );
          }
        }
      );


    /*
      EXPORTAR TODAS
    */

    $('acoes-export-all')
      ?.addEventListener(
        'click',
        () =>
          exportRegistrations(
            null
          )
      );


    /*
      CARREGAR
    */

    try {

      await loadActions();

    } catch (error) {

      showResult(
        error.message ||
        String(error),
        'error'
      );
    }
  }



  /*
    DOM READY
  */

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

})();
