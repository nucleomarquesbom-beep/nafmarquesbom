/* NAF Marques Bom — Drº Árbitro
   Versão consolidada.
   Funciona em:
   - admin.html
   - socio.html (incluindo o painel de administrador dentro de socio.html)

   Não depende da ordem dos scripts: espera pelo cliente Supabase exposto
   em window.__NAF_SUPABASE ou window.supabaseClient.
*/
(() => {
  'use strict';

  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));

  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  let started = false;
  let waitTimer = null;
  let memberTabBound = false;

  function injectCss() {
    if (document.getElementById('naf-dr-arbitro-css')) return;

    const s = document.createElement('style');
    s.id = 'naf-dr-arbitro-css';
    s.textContent = `
      .dr-admin-panel{margin-top:18px}
      .dr-admin-grid,.dr-tests{display:grid;gap:12px}
      .dr-modalidade{border:1px solid rgba(0,0,0,.10);border-radius:14px;padding:16px;margin-top:12px}
      .dr-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:10px}
      .dr-actions{display:flex;gap:8px;flex-wrap:wrap}
      .dr-muted{opacity:.7}
      .dr-question{border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:16px;margin:10px 0}
      .dr-options{display:grid;gap:8px;margin-top:10px}
      .dr-option{display:flex;gap:8px;padding:9px;border-radius:8px;background:rgba(0,0,0,.025)}
      .dr-result{padding:16px;border-radius:12px;background:rgba(0,120,70,.08);font-weight:700}
    `;
    document.head.appendChild(s);
  }

  async function rpc(name, args = {}) {
    const c = getClient();
    if (!c) throw new Error('Cliente Supabase não disponível.');
    const { data, error } = await c.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function isAdmin() {
    try {
      return (await rpc('is_admin')) === true;
    } catch {
      return false;
    }
  }

  function ordinalEdition(n) {
    return `${Number(n)}.ª Edição`;
  }

  async function getGlobalNextEditionNumber(client) {
    const { data, error } = await client
      .from('dr_arbitro_edicoes')
      .select('numero_edicao')
      .order('numero_edicao', { ascending: false })
      .limit(1);

    if (error) throw error;

    const max = Number(data?.[0]?.numero_edicao || 0);
    return max + 1;
  }

  async function ensureAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) return null;

    let panel = document.getElementById('dr-arbitro-admin-integrado');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'dr-arbitro-admin-integrado';
      panel.className = 'admin-subpanel dr-admin-panel';
      panel.innerHTML = `
        <div class="tab-heading-row">
          <div>
            <h3>Drº Árbitro</h3>
            <p>
              Ativa/desativa o Drº Árbitro e controla as inscrições.
              A próxima edição será criada automaticamente.
            </p>
          </div>
        </div>
        <div id="dr-integrado-content">
          <div class="vazio">A carregar…</div>
        </div>
      `;

      // Coloca no fim do painel administrativo, sem alterar o layout existente.
      adminPanel.appendChild(panel);
    }

    return panel;
  }

  async function renderAdminInto(root) {
    const client = getClient();
    if (!client || !root) return;

    if (!(await isAdmin())) {
      root.innerHTML = '';
      return;
    }

    try {
      const { data: modalidades, error: modalidadesError } = await client
        .from('dr_arbitro_modalidades')
        .select('id,codigo,nome,ativo')
        .eq('ativo', true)
        .order('nome');

      if (modalidadesError) throw modalidadesError;

      if (!modalidades?.length) {
        root.innerHTML = '<div class="vazio">Não existem modalidades do Drº Árbitro ativas.</div>';
        return;
      }

      const nextEdition = await getGlobalNextEditionNumber(client);

      const sections = [];

      for (const modalidade of modalidades) {
        const { data: edicoes, error: edicoesError } = await client
          .from('dr_arbitro_edicoes')
          .select('*')
          .eq('modalidade_id', modalidade.id)
          .order('numero_edicao', { ascending: false })
          .order('created_at', { ascending: false });

        if (edicoesError) throw edicoesError;

        sections.push(`
          <div class="dr-modalidade">
            <h4>${esc(modalidade.nome)}</h4>

            <div class="dr-actions">
              <button
                type="button"
                class="admin-small-btn"
                data-dr-create="${esc(modalidade.id)}"
                data-dr-next="${nextEdition}"
              >
                Criar ${esc(ordinalEdition(nextEdition))}
              </button>
            </div>

            <div class="dr-admin-grid">
              ${(edicoes || []).map(edicao => `
                <div class="dr-row">
                  <div>
                    <strong>${esc(edicao.nome)}</strong>
                    <div class="dr-muted">
                      ${edicao.ativo ? '🟢 Ativa' : '⚪ Inativa'}
                      · ${edicao.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
                      · ${Number(edicao.numero_testes || 0)} teste(s)
                    </div>
                  </div>

                  <div class="dr-actions">
                    <button
                      type="button"
                      class="admin-small-btn"
                      data-dr-toggle="${esc(edicao.id)}"
                      data-dr-value="${edicao.ativo ? 'false' : 'true'}"
                    >
                      ${edicao.ativo ? 'Desativar' : 'Ativar'}
                    </button>

                    <button
                      type="button"
                      class="admin-small-btn"
                      data-dr-ins="${esc(edicao.id)}"
                      data-dr-ins-value="${edicao.inscricoes_abertas ? 'false' : 'true'}"
                    >
                      ${edicao.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `);
      }

      root.innerHTML = sections.join('');

      root.querySelectorAll('[data-dr-create]').forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;

          try {
            const numero = Number(button.dataset.drNext);

            // O esquema atual exige numero_testes >= 1.
            const { error } = await client
              .from('dr_arbitro_edicoes')
              .insert({
                modalidade_id: button.dataset.drCreate,
                numero_edicao: numero,
                nome: `Drº Árbitro - ${ordinalEdition(numero)}`,
                ativo: false,
                numero_testes: 1,
                inscricoes_abertas: false
              });

            if (error) throw error;

            await renderAdminInto(root);
          } catch (error) {
            alert(error.message || String(error));
          } finally {
            button.disabled = false;
          }
        });
      });

      root.querySelectorAll('[data-dr-toggle]').forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;

          try {
            await rpc('dr_arbitro_admin_definir_ativo', {
              p_edicao_id: button.dataset.drToggle,
              p_ativo: button.dataset.drValue === 'true'
            });

            await renderAdminInto(root);
            await refreshMemberAvailability();
          } catch (error) {
            alert(error.message || String(error));
          } finally {
            button.disabled = false;
          }
        });
      });

      root.querySelectorAll('[data-dr-ins]').forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;

          try {
            await rpc('dr_arbitro_admin_definir_inscricoes', {
              p_edicao_id: button.dataset.drIns,
              p_abertas: button.dataset.drInsValue === 'true'
            });

            await renderAdminInto(root);
          } catch (error) {
            alert(error.message || String(error));
          } finally {
            button.disabled = false;
          }
        });
      });
    } catch (error) {
      console.error('Drº Árbitro admin:', error);
      root.innerHTML = `
        <div class="vazio">
          Não foi possível carregar o Drº Árbitro.
          <br><small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function renderAdmin() {
    const dedicatedTargets = [
      document.getElementById('dr-futebol'),
      document.getElementById('dr-futsal')
    ].filter(Boolean);

    if (dedicatedTargets.length) {
      // Painel de admin.html: usa os dois blocos existentes.
      const client = getClient();
      if (!client || !(await isAdmin())) return;

      const { data: modalidades, error } = await client
        .from('dr_arbitro_modalidades')
        .select('id,codigo,nome,ativo')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;

      const nextEdition = await getGlobalNextEditionNumber(client);

      for (const modalidade of modalidades || []) {
        const target = String(modalidade.codigo).toLowerCase() === 'futsal'
          ? document.getElementById('dr-futsal')
          : document.getElementById('dr-futebol');

        if (!target) continue;

        const { data: edicoes, error: edicoesError } = await client
          .from('dr_arbitro_edicoes')
          .select('*')
          .eq('modalidade_id', modalidade.id)
          .order('numero_edicao', { ascending: false });

        if (edicoesError) throw edicoesError;

        target.innerHTML = `
          <h4>${esc(modalidade.nome)}</h4>
          <div class="dr-actions">
            <button
              type="button"
              class="admin-small-btn"
              data-dr-create="${esc(modalidade.id)}"
              data-dr-next="${nextEdition}"
            >
              Criar ${esc(ordinalEdition(nextEdition))}
            </button>
          </div>

          <div class="dr-admin-grid">
            ${(edicoes || []).map(edicao => `
              <div class="dr-row">
                <div>
                  <strong>${esc(edicao.nome)}</strong>
                  <div class="dr-muted">
                    ${edicao.ativo ? '🟢 Ativa' : '⚪ Inativa'}
                    · ${edicao.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
                    · ${Number(edicao.numero_testes || 0)} teste(s)
                  </div>
                </div>

                <div class="dr-actions">
                  <button
                    type="button"
                    class="admin-small-btn"
                    data-dr-toggle="${esc(edicao.id)}"
                    data-dr-value="${edicao.ativo ? 'false' : 'true'}"
                  >
                    ${edicao.ativo ? 'Desativar' : 'Ativar'}
                  </button>

                  <button
                    type="button"
                    class="admin-small-btn"
                    data-dr-ins="${esc(edicao.id)}"
                    data-dr-ins-value="${edicao.inscricoes_abertas ? 'false' : 'true'}"
                  >
                    ${edicao.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;

        target.querySelectorAll('[data-dr-create]').forEach(button => {
          button.addEventListener('click', async () => {
            try {
              const numero = Number(button.dataset.drNext);

              const { error: insertError } = await client
                .from('dr_arbitro_edicoes')
                .insert({
                  modalidade_id: button.dataset.drCreate,
                  numero_edicao: numero,
                  nome: `Drº Árbitro - ${ordinalEdition(numero)}`,
                  ativo: false,
                  numero_testes: 1,
                  inscricoes_abertas: false
                });

              if (insertError) throw insertError;

              await renderAdmin();
            } catch (error) {
              alert(error.message || String(error));
            }
          });
        });

        target.querySelectorAll('[data-dr-toggle]').forEach(button => {
          button.addEventListener('click', async () => {
            try {
              await rpc('dr_arbitro_admin_definir_ativo', {
                p_edicao_id: button.dataset.drToggle,
                p_ativo: button.dataset.drValue === 'true'
              });

              await renderAdmin();
              await refreshMemberAvailability();
            } catch (error) {
              alert(error.message || String(error));
            }
          });
        });

        target.querySelectorAll('[data-dr-ins]').forEach(button => {
          button.addEventListener('click', async () => {
            try {
              await rpc('dr_arbitro_admin_definir_inscricoes', {
                p_edicao_id: button.dataset.drIns,
                p_abertas: button.dataset.drInsValue === 'true'
              });

              await renderAdmin();
            } catch (error) {
              alert(error.message || String(error));
            }
          });
        });
      }
    }

    // Painel administrativo integrado em socio.html.
    const integratedPanel = await ensureAdminPanel();

    if (integratedPanel) {
      const root = integratedPanel.querySelector('#dr-integrado-content');
      await renderAdminInto(root);
    }
  }

  function ensureMemberUI() {
    const tabs = document.querySelector('.socio-tabs');
    const dashboard = document.getElementById('dashboard');

    if (!tabs || !dashboard) return;

    let button = document.querySelector('[data-tab="dr-arbitro"]');
    let section = document.getElementById('dr-arbitro');

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'socio-tab';
      button.dataset.tab = 'dr-arbitro';
      button.textContent = 'Drº Árbitro';
      tabs.appendChild(button);
    }

    if (!section) {
      section = document.createElement('section');
      section.className = 'socio-tab-content';
      section.id = 'dr-arbitro';
      section.innerHTML = `
        <div class="tab-heading-row">
          <div>
            <h2>Drº Árbitro</h2>
            <p>Testes de conhecimentos de arbitragem.</p>
          </div>
        </div>
        <div id="dr-member-content">
          <div class="vazio">A carregar…</div>
        </div>
      `;

      const funlearn = document.getElementById('funlearn');
      funlearn?.parentNode.insertBefore(section, funlearn);
    }

    if (!button.dataset.drBound) {
      button.dataset.drBound = '1';

      button.addEventListener('click', () => {
        tabs.querySelectorAll('.socio-tab').forEach(tab => {
          tab.classList.toggle('active', tab === button);
        });

        dashboard.querySelectorAll('.socio-tab-content').forEach(panel => {
          panel.classList.remove('active');
        });

        section.classList.add('active');
        loadMember();
      });
    }

    if (typeof window.syncMobileTabSelector === 'function') {
      try { window.syncMobileTabSelector(); } catch (_) {}
    }
  }

  async function loadMember() {
    const client = getClient();
    const root = document.getElementById('dr-member-content');
    const section = document.getElementById('dr-arbitro');
    const button = document.querySelector('[data-tab="dr-arbitro"]');

    if (!client || !root || !section || !button) return;

    try {
      const { data: edition, error } = await client
        .from('dr_arbitro_edicoes')
        .select('*,dr_arbitro_modalidades(nome,codigo)')
        .eq('ativo', true)
        .order('numero_edicao', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!edition) {
        button.hidden = true;
        section.hidden = true;
        return;
      }

      button.hidden = false;
      section.hidden = false;

      const { data: tests, error: testsError } = await client
        .from('dr_arbitro_testes')
        .select('*')
        .eq('edicao_id', edition.id)
        .eq('ativo', true)
        .order('numero_teste');

      if (testsError) throw testsError;

      root.innerHTML = `
        <div class="dr-modalidade">
          <h3>${esc(edition.nome)}</h3>
          <p>
            ${edition.inscricoes_abertas
              ? 'Inscrições abertas.'
              : 'Inscrições fechadas.'}
          </p>

          ${edition.inscricoes_abertas
            ? '<button class="botao" id="dr-inscrever">Inscrever-me</button>'
            : ''}
        </div>

        <div class="dr-tests">
          ${(tests || []).length
            ? tests.map(test => `
              <div class="dr-row">
                <div>
                  <strong>${esc(test.titulo)}</strong>
                  <div class="dr-muted">Teste ${esc(test.numero_teste)}</div>
                </div>
                <button
                  class="botao"
                  type="button"
                  data-dr-test="${esc(test.id)}"
                >
                  Iniciar
                </button>
              </div>
            `).join('')
            : '<div class="vazio">Ainda não existem testes ativos.</div>'}
        </div>
      `;

      document.getElementById('dr-inscrever')?.addEventListener('click', async () => {
        try {
          await rpc('dr_arbitro_inscrever', { p_edicao_id: edition.id });
          await loadMember();
        } catch (error) {
          alert(error.message || String(error));
        }
      });

      root.querySelectorAll('[data-dr-test]').forEach(buttonTest => {
        buttonTest.addEventListener('click', () => startTest(buttonTest.dataset.drTest));
      });
    } catch (error) {
      root.innerHTML = `
        <div class="vazio">
          Não foi possível carregar o Drº Árbitro.
          <br><small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function startTest(testId) {
    const client = getClient();
    const root = document.getElementById('dr-member-content');

    if (!client || !root) return;

    try {
      const attempt = await rpc('dr_arbitro_iniciar_teste', {
        p_teste_id: testId
      });

      const { data: questions, error } = await client
        .from('dr_arbitro_perguntas')
        .select('*')
        .eq('teste_id', testId)
        .order('numero');

      if (error) throw error;

      if (!questions?.length) {
        root.innerHTML = '<div class="vazio">Este teste ainda não tem perguntas.</div>';
        return;
      }

      root.innerHTML = `
        <form id="dr-form">
          <h3>Teste</h3>

          ${questions.map(question => `
            <fieldset class="dr-question">
              <legend>
                <strong>
                  ${esc(question.numero)}. ${esc(question.pergunta)}
                </strong>
              </legend>

              <div class="dr-options">
                ${[
                  ['A', question.opcao_a],
                  ['B', question.opcao_b],
                  ['C', question.opcao_c],
                  ['D', question.opcao_d]
                ].filter(option => option[1] !== null && option[1] !== undefined && option[1] !== '')
                  .map(option => `
                    <label class="dr-option">
                      <input
                        required
                        type="radio"
                        name="q_${esc(question.id)}"
                        value="${esc(option[0])}"
                      >
                      <span>
                        <strong>${esc(option[0])}</strong>
                        — ${esc(option[1])}
                      </span>
                    </label>
                  `).join('')}
              </div>
            </fieldset>
          `).join('')}

          <button class="botao" type="submit">
            Submeter teste
          </button>
        </form>
      `;

      document.getElementById('dr-form').addEventListener('submit', async event => {
        event.preventDefault();

        const answers = {};

        questions.forEach(question => {
          const selected = document.querySelector(
            `input[name="q_${question.id}"]:checked`
          );

          answers[question.id] = selected?.value || null;
        });

        try {
          const result = await rpc('dr_arbitro_submeter_teste', {
            p_tentativa_id: attempt,
            p_respostas: answers
          });

          const row = Array.isArray(result) ? result[0] : result;

          root.innerHTML = `
            <div class="dr-result">
              Resultado:
              ${esc(row?.nota ?? 0)}
              /
              ${esc(row?.total_perguntas ?? questions.length)}
              —
              ${esc(row?.percentagem ?? 0)}%
            </div>
          `;
        } catch (error) {
          alert(error.message || String(error));
        }
      });
    } catch (error) {
      alert(error.message || String(error));
    }
  }

  async function refreshMemberAvailability() {
    if (document.getElementById('dashboard')) {
      ensureMemberUI();
      await loadMember();
    }
  }

  async function boot() {
    if (started) return true;

    injectCss();

    const client = getClient();

    if (!client) {
      return false;
    }

    started = true;

    // O mesmo módulo serve admin.html e socio.html.
    try {
      await renderAdmin();
    } catch (error) {
      console.error('Erro no painel Drº Árbitro:', error);
    }

    // Não mostrar a aba enquanto não existe uma edição ativa.
    if (document.getElementById('dashboard')) {
      ensureMemberUI();
      await loadMember();
    }

    return true;
  }

  function waitForClient() {
    if (waitTimer) return;

    waitTimer = setInterval(async () => {
      try {
        const ok = await boot();

        if (ok) {
          clearInterval(waitTimer);
          waitTimer = null;
        }
      } catch (error) {
        console.error('Erro ao inicializar Drº Árbitro:', error);
      }
    }, 100);
  }

  // API usada pelo socio.js depois de carregar o perfil.
  window.NAF_DR_ARBITRO_START = async () => {
    started = false;
    waitTimer && clearInterval(waitTimer);
    waitTimer = null;
    injectCss();

    const ready = await boot();

    if (!ready) {
      waitForClient();
      return;
    }

    if (document.getElementById('dashboard')) {
      ensureMemberUI();
      await loadMember();
    }
  };

  // Arranque automático para admin.html e para o painel integrado de socio.html.
  const autoStart = () => {
    injectCss();

    if (getClient()) {
      boot().catch(error => console.error('Drº Árbitro:', error));
    } else {
      waitForClient();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoStart, { once: true });
  } else {
    autoStart();
  }
})();
