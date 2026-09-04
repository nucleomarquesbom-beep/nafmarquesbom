/* NAF Marques Bom — Drº Árbitro
   Correção consolidada:
   - painel admin integrado em socio.html
   - configuração da edição
   - criação/configuração dos testes
   - PDF privado das questões
   - janela de acesso (data/hora início e fim)
   - duração do teste
   - temporizador
   - abandono imediato quando o sócio sai do teste
   - mesma tentativa não pode ser iniciada duas vezes
*/
(() => {
  'use strict';

  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));

  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  let started = false;
  let waitTimer = null;
  let currentAttemptId = null;
  let currentTestId = null;
  let currentDeadline = 0;
  let timerHandle = null;
  let abandonmentSent = false;
  let cachedAccessToken = null;

  function injectCss() {
    if (document.getElementById('naf-dr-arbitro-css')) return;

    const s = document.createElement('style');
    s.id = 'naf-dr-arbitro-css';
    s.textContent = `
      .dr-admin-grid,.dr-tests{display:grid;gap:12px}
      .dr-modalidade,.dr-test-admin{border:1px solid rgba(0,0,0,.10);border-radius:14px;padding:16px;margin-top:12px}
      .dr-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:10px}
      .dr-actions{display:flex;gap:8px;flex-wrap:wrap}
      .dr-muted{opacity:.7}
      .dr-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dr-form-grid .wide{grid-column:1/-1}
      .dr-form-grid label{display:grid;gap:6px}
      .dr-form-grid input,.dr-form-grid select{width:100%;box-sizing:border-box}
      .dr-test-error{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(170,0,0,.08)}
      .dr-timer{position:sticky;top:10px;z-index:5;padding:12px 16px;border-radius:12px;background:rgba(0,0,0,.06);font-size:1.1rem;font-weight:700;margin-bottom:14px}
      .dr-timer.warning{background:rgba(170,90,0,.12)}
      .dr-result{padding:16px;border-radius:12px;background:rgba(0,120,70,.08);font-weight:700}
      .dr-question{border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:16px;margin:10px 0}
      .dr-options{display:grid;gap:8px;margin-top:10px}
      .dr-option{display:flex;gap:8px;padding:9px;border-radius:8px;background:rgba(0,0,0,.025)}
      @media(max-width:700px){
        .dr-form-grid{grid-template-columns:1fr}
        .dr-form-grid .wide{grid-column:auto}
      }
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

  async function notifyDrActivation(editionId) {
    const c = getClient();
    if (!c || !editionId) return;
    const { data, error } = await c.functions.invoke('notificar-ativacao', {
      body: {
        tipo: 'dr_arbitro',
        recurso_id: editionId,
        activation_token: crypto.randomUUID()
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function cacheSession() {
    const c = getClient();
    if (!c) return;
    try {
      const { data } = await c.auth.getSession();
      cachedAccessToken = data?.session?.access_token || null;
    } catch (_) {}
  }

  async function isAdmin() {
    try {
      return (await rpc('is_admin')) === true;
    } catch {
      return false;
    }
  }

  function editionLabel(n) {
    return `${Number(n)}.ª Edição`;
  }

  function localDatetime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const p = n => String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function isoFromLocal(value) {
    return value ? new Date(value).toISOString() : null;
  }

  async function nextEditionNumber(c, modalidadeId = null) {
    let query = c
      .from('dr_arbitro_edicoes')
      .select('numero_edicao')
      .order('numero_edicao', { ascending: false })
      .limit(1);
    if (modalidadeId) query = query.eq('modalidade_id', modalidadeId);
    const { data, error } = await query;

    if (error) throw error;
    return Number(data?.[0]?.numero_edicao || 0) + 1;
  }

  function adminPanelElement() {
    // Na administração integrada, o painel oficial do Drº Árbitro
    // é #panel-dr-arbitro. Usá-lo como contentor principal evita que
    // o editor de edições/testes seja criado fora da sub-aba visível.
    return document.getElementById('panel-dr-arbitro')
      || document.getElementById('admin-panel');
  }

  async function ensureIntegratedAdmin() {
    const admin = adminPanelElement();
    if (!admin) return null;

    let panel = document.getElementById('dr-arbitro-admin-integrado');

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'dr-arbitro-admin-integrado';
      panel.className = 'admin-subpanel';
      panel.innerHTML = `
        <div class="tab-heading-row">
          <div>
            <h3>Drº Árbitro</h3>
            <p>Ativa a edição e configura testes, PDFs, duração e horários de acesso.</p>
          </div>
        </div>
        <div id="dr-integrado-content">
          <div class="vazio">A carregar…</div>
        </div>
      `;
      admin.appendChild(panel);
    }

    return panel;
  }

  async function uploadPdf(file, editionId, testNumber) {
    if (!file || file.type !== 'application/pdf') {
      throw new Error('Selecione um PDF válido.');
    }

    const c = getClient();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `edicoes/${editionId}/teste-${testNumber}-${crypto.randomUUID()}-${safe}`;

    const { error } = await c.storage
      .from('dr-arbitro')
      .upload(path, file, { contentType: 'application/pdf', upsert: false });

    if (error) throw error;
    return path;
  }

  async function removePdf(path) {
    if (!path) return;
    try {
      await getClient().storage.from('dr-arbitro').remove([path]);
    } catch (_) {}
  }

  function clearTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  }

  async function submitAttempt(automatic = false) {
    const form = document.getElementById('dr-form');
    if (!form || !currentAttemptId) return;

    const answers = {};
    document.querySelectorAll('#dr-form input[type="radio"]:checked').forEach(input => {
      const m = input.name.match(/^q_(.+)$/);
      if (m) answers[m[1]] = input.value;
    });

    try {
      const result = await rpc('dr_arbitro_submeter_teste', {
        p_tentativa_id: currentAttemptId,
        p_respostas: answers
      });

      const row = Array.isArray(result) ? result[0] : result;
      clearTimer();
      currentAttemptId = null;
      currentTestId = null;

      const root = document.getElementById('dr-member-content');
      if (!root) return;

      root.innerHTML = `
        <div class="dr-result">
          Resultado: ${esc(row?.nota ?? 0)} /
          ${esc(row?.total_perguntas ?? 0)} —
          ${esc(row?.percentagem ?? 0)}%
          ${automatic ? '<br><small>O teste foi submetido automaticamente porque terminou o tempo.</small>' : ''}
        </div>
      `;
    } catch (error) {
      alert(error.message || String(error));
    }
  }

  async function abandonCurrentAttempt() {
    if (!currentAttemptId || abandonmentSent || !cachedAccessToken) return;

    abandonmentSent = true;
    const c = getClient();
    if (!c) return;

    try {
      const url = `${c.supabaseUrl}/rest/v1/rpc/dr_arbitro_abandonar_tentativa`;

      await fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': c.supabaseKey,
          'Authorization': `Bearer ${cachedAccessToken}`
        },
        body: JSON.stringify({ p_tentativa_id: currentAttemptId })
      });
    } catch (_) {
      // Não interromper o fecho da página.
    }
  }

  function bindAbandonHandlers() {
    const handler = () => {
      if (currentAttemptId) {
        void abandonCurrentAttempt();
      }
    };

    window.addEventListener('pagehide', handler, { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handler();
    });
  }

  async function loadMember() {
    const c = getClient();
    const tabs = document.querySelector('.socio-tabs');
    const dashboard = document.getElementById('dashboard');
    if (!c || !tabs || !dashboard) return;

    let button = tabs.querySelector('[data-tab="dr-arbitro"]');
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
      (funlearn?.parentNode || dashboard).insertBefore(section, funlearn || null);
    }

    if (!button.dataset.drBound) {
      button.dataset.drBound = '1';

      button.addEventListener('click', () => {
        tabs.querySelectorAll('.socio-tab').forEach(x => x.classList.toggle('active', x === button));
        dashboard.querySelectorAll('.socio-tab-content').forEach(x => x.classList.remove('active'));
        section.classList.add('active');
        loadMember().catch(console.error);
      });
    }

    try {
      const { data: edition, error } = await c
        .from('dr_arbitro_edicoes')
        .select('*')
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

      const { data: tests, error: testsError } = await c
        .from('dr_arbitro_testes')
        .select('id,numero_teste,titulo,inicio_em,fim_em,ativo,duracao_minutos,ficheiro_path')
        .eq('edicao_id', edition.id)
        .eq('ativo', true)
        .order('numero_teste');

      if (testsError) throw testsError;

      const now = Date.now();

      document.getElementById('dr-member-content').innerHTML = `
        <div class="dr-modalidade">
          <h3>${esc(edition.nome)}</h3>
          <p>${edition.inscricoes_abertas ? 'Inscrições abertas.' : 'Inscrições fechadas.'}</p>
          ${edition.inscricoes_abertas ? '<button class="botao" id="dr-inscrever">Inscrever-me</button>' : ''}
        </div>

        <div class="dr-tests">
          ${(tests || []).length ? tests.map(test => {
            const start = new Date(test.inicio_em).getTime();
            const end = new Date(test.fim_em).getTime();
            const available = now >= start && now <= end;
            const label = now < start ? 'Ainda não disponível' : (now > end ? 'Encerrado' : 'Iniciar');

            return `
              <div class="dr-row">
                <div>
                  <strong>Teste ${esc(test.numero_teste)} — ${esc(test.titulo)}</strong>
                  <div class="dr-muted">
                    ${new Date(test.inicio_em).toLocaleString('pt-PT')}
                    → ${new Date(test.fim_em).toLocaleString('pt-PT')}
                    · ${Number(test.duracao_minutos || 60)} min
                  </div>
                </div>
                <button class="botao" type="button" data-start-test="${esc(test.id)}" ${available ? '' : 'disabled'}>
                  ${label}
                </button>
              </div>
            `;
          }).join('') : '<div class="vazio">Ainda não existem testes ativos.</div>'}
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

      document.querySelectorAll('[data-start-test]').forEach(btn => {
        btn.addEventListener('click', () => startTest(btn.dataset.startTest));
      });
    } catch (error) {
      document.getElementById('dr-member-content').innerHTML = `
        <div class="dr-test-error">
          Não foi possível carregar o Drº Árbitro.<br>
          <small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function startTest(testId) {
    const c = getClient();
    const root = document.getElementById('dr-member-content');
    if (!c || !root) return;

    clearTimer();
    abandonmentSent = false;

    try {
      const { data: test, error: testError } = await c
        .from('dr_arbitro_testes')
        .select('*')
        .eq('id', testId)
        .single();

      if (testError) throw testError;

      const now = Date.now();
      const start = new Date(test.inicio_em).getTime();
      const end = new Date(test.fim_em).getTime();

      if (now < start || now > end) {
        throw new Error('Este teste não está disponível neste momento.');
      }

      const attempt = await rpc('dr_arbitro_iniciar_teste', { p_teste_id: testId });
      currentAttemptId = attempt;
      currentTestId = testId;

      const { data: questions, error } = await c
        .from('dr_arbitro_perguntas')
        .select('*')
        .eq('teste_id', testId)
        .order('numero');

      if (error) throw error;
      if (!questions?.length) {
        currentAttemptId = null;
        currentTestId = null;
        root.innerHTML = '<div class="dr-test-error">Este teste ainda não tem perguntas.</div>';
        return;
      }

      const durationMs = Math.max(1, Number(test.duracao_minutos || 60)) * 60 * 1000;
      currentDeadline = Math.min(Date.now() + durationMs, end);

      root.innerHTML = `
        <div id="dr-timer" class="dr-timer">
          Tempo restante: <span>--:--</span>
        </div>

        <form id="dr-form">
          <h3>${esc(test.titulo)}</h3>

          ${questions.map(question => `
            <fieldset class="dr-question">
              <legend><strong>${esc(question.numero)}. ${esc(question.pergunta)}</strong></legend>

              <div class="dr-options">
                ${[
                  ['A', question.opcao_a],
                  ['B', question.opcao_b],
                  ['C', question.opcao_c],
                  ['D', question.opcao_d]
                ]
                  .filter(o => o[1] !== null && o[1] !== undefined && o[1] !== '')
                  .map(o => `
                    <label class="dr-option">
                      <input required type="radio" name="q_${esc(question.id)}" value="${esc(o[0])}">
                      <span><strong>${esc(o[0])}</strong> — ${esc(o[1])}</span>
                    </label>
                  `).join('')}
              </div>
            </fieldset>
          `).join('')}

          <button class="botao" type="submit">Submeter teste</button>
        </form>
      `;

      const timer = document.getElementById('dr-timer');
      const timerSpan = timer.querySelector('span');

      const updateTimer = () => {
        const remaining = Math.max(0, currentDeadline - Date.now());
        const seconds = Math.ceil(remaining / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;

        timerSpan.textContent =
          `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

        if (seconds <= 60) timer.classList.add('warning');

        if (remaining <= 0) {
          clearTimer();
          void submitAttempt(true);
        }
      };

      timerHandle = setInterval(updateTimer, 500);
      updateTimer();

      document.getElementById('dr-form').addEventListener('submit', event => {
        event.preventDefault();
        void submitAttempt(false);
      });
    } catch (error) {
      currentAttemptId = null;
      currentTestId = null;
      root.innerHTML = `
        <div class="dr-test-error">
          Não foi possível iniciar o teste.<br>
          <small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function configureTest(root, edition, test, nextNumber) {
    const old = root.querySelector('.dr-test-form');
    if (old) old.remove();

    const numero = Number(test?.numero_teste || nextNumber);
    const box = document.createElement('div');
    box.className = 'dr-test-admin dr-test-form';

    box.innerHTML = `
      <h4>${test ? 'Configurar' : 'Criar'} teste ${esc(numero)}</h4>

      <form>
        <div class="dr-form-grid">
          <label>
            Título
            <input name="titulo" required value="${esc(test?.titulo || `Teste ${numero}`)}">
          </label>

          <label>
            Duração (minutos)
            <input name="duracao" type="number" min="1" max="600" required value="${Number(test?.duracao_minutos || 60)}">
          </label>

          <label>
            Disponível a partir de
            <input name="inicio" type="datetime-local" required value="${localDatetime(test?.inicio_em)}">
          </label>

          <label>
            Disponível até
            <input name="fim" type="datetime-local" required value="${localDatetime(test?.fim_em)}">
          </label>

          <label class="wide">
            PDF das questões
            <input name="pdf" type="file" accept="application/pdf">
          </label>

          <label class="wide">
            <span>
              <input name="ativo" type="checkbox" ${test?.ativo ? 'checked' : ''}>
              Teste ativo
            </span>
          </label>
        </div>

        ${test?.ficheiro_path ? '<p class="dr-muted">PDF já carregado. Selecionar outro substitui o atual.</p>' : ''}

        <div class="dr-actions">
          <button class="botao" type="submit">Guardar teste</button>
          <button class="botao-secundario" type="button" data-cancelar>Cancelar</button>
        </div>
      </form>
    `;

    root.appendChild(box);
    box.querySelector('[data-cancelar]').onclick = () => box.remove();

    box.querySelector('form').onsubmit = async event => {
      event.preventDefault();

      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;

      try {
        const titulo = form.querySelector('[name="titulo"]').value.trim();
        const inicio = form.querySelector('[name="inicio"]').value;
        const fim = form.querySelector('[name="fim"]').value;
        const duracao = Number(form.querySelector('[name="duracao"]').value);
        const ativo = form.querySelector('[name="ativo"]').checked;
        const file = form.querySelector('[name="pdf"]').files?.[0];

        if (!titulo) throw new Error('Indica o título.');
        if (!inicio || !fim) throw new Error('Define o início e o fim.');
        if (new Date(inicio) >= new Date(fim)) throw new Error('O fim tem de ser posterior ao início.');
        if (!Number.isInteger(duracao) || duracao < 1 || duracao > 600) {
          throw new Error('A duração deve estar entre 1 e 600 minutos.');
        }

        let ficheiroPath = test?.ficheiro_path || null;

        if (file) {
          const newPath = await uploadPdf(file, edition.id, numero);
          if (ficheiroPath) await removePdf(ficheiroPath);
          ficheiroPath = newPath;
        }

        const payload = {
          edicao_id: edition.id,
          numero_teste: numero,
          titulo,
          inicio_em: isoFromLocal(inicio),
          fim_em: isoFromLocal(fim),
          ativo,
          ficheiro_path: ficheiroPath,
          duracao_minutos: duracao
        };

        const c = getClient();
        let saveError = null;

        if (test?.id) {
          ({ error: saveError } = await c
            .from('dr_arbitro_testes')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', test.id));
        } else {
          ({ error: saveError } = await c
            .from('dr_arbitro_testes')
            .insert(payload));
        }

        if (saveError) throw saveError;

        await renderEditionAdmin(root, edition);
      } catch (error) {
        const message = document.createElement('div');
        message.className = 'dr-test-error';
        message.textContent = error.message || String(error);
        box.appendChild(message);
      } finally {
        button.disabled = false;
      }
    };
  }

  async function renderEditionAdmin(root, edition) {
    const c = getClient();

    root.innerHTML = `
      <div class="dr-row">
        <div>
          <strong>${esc(edition.nome)}</strong>
          <div class="dr-muted">
            ${edition.ativo ? '🟢 Ativa' : '⚪ Inativa'}
            · ${edition.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
          </div>
        </div>

        <div class="dr-actions">
          <button type="button" class="admin-small-btn" id="dr-back-editions">← Voltar</button>
          <button type="button" class="admin-small-btn" id="dr-toggle-ed">
            ${edition.ativo ? 'Desativar' : 'Ativar'}
          </button>
          <button type="button" class="admin-small-btn" id="dr-toggle-ins">
            ${edition.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
          </button>
        </div>
      </div>

      <div id="dr-tests-editor" class="dr-tests"></div>
      <button type="button" class="admin-small-btn" id="dr-new-test">+ Novo teste</button>
    `;

    document.getElementById('dr-back-editions').onclick = () => renderIntegratedAdmin();

    document.getElementById('dr-toggle-ed').onclick = async () => {
      try {
        const nextActive = !edition.ativo;
        await rpc('dr_arbitro_admin_definir_ativo', {
          p_edicao_id: edition.id,
          p_ativo: nextActive
        });
        if (nextActive) {
          try {
            await notifyDrActivation(edition.id);
          } catch (mailError) {
            console.error('Drº Árbitro ativado, mas a notificação não foi enviada:', mailError);
          }
        }
        await renderIntegratedAdmin();
      } catch (error) {
        alert(error.message || String(error));
      }
    };

    document.getElementById('dr-toggle-ins').onclick = async () => {
      try {
        await rpc('dr_arbitro_admin_definir_inscricoes', {
          p_edicao_id: edition.id,
          p_abertas: !edition.inscricoes_abertas
        });
        await renderEditionAdmin(root, { ...edition, inscricoes_abertas: !edition.inscricoes_abertas });
      } catch (error) {
        alert(error.message || String(error));
      }
    };

    document.getElementById('dr-new-test').onclick = async () => {
      try {
        const { data: tests, error } = await c
          .from('dr_arbitro_testes')
          .select('numero_teste')
          .eq('edicao_id', edition.id)
          .order('numero_teste', { ascending: false })
          .limit(1);

        if (error) throw error;

        const next = Number(tests?.[0]?.numero_teste || 0) + 1;
        await configureTest(document.getElementById('dr-tests-editor'), edition, null, next);
      } catch (error) {
        alert(error.message || String(error));
      }
    };

    try {
      const { data: tests, error } = await c
        .from('dr_arbitro_testes')
        .select('id,numero_teste,titulo,ficheiro_path,inicio_em,fim_em,ativo,duracao_minutos')
        .eq('edicao_id', edition.id)
        .order('numero_teste');

      if (error) throw error;

      const editor = document.getElementById('dr-tests-editor');

      if (!tests?.length) {
        editor.innerHTML = '<div class="dr-muted">Ainda não existem testes nesta edição.</div>';
        return;
      }

      editor.innerHTML = tests.map(test => `
        <div class="dr-row">
          <div>
            <strong>Teste ${esc(test.numero_teste)} — ${esc(test.titulo)}</strong>
            <div class="dr-muted">
              ${test.ativo ? '🟢 Ativo' : '⚪ Inativo'}
              · ${Number(test.duracao_minutos || 60)} min
              · ${new Date(test.inicio_em).toLocaleString('pt-PT')}
              → ${new Date(test.fim_em).toLocaleString('pt-PT')}
            </div>
            <div class="dr-muted">${test.ficheiro_path ? 'PDF carregado' : 'Sem PDF'}</div>
          </div>
          <button type="button" class="admin-small-btn" data-config-test="${esc(test.id)}">Editar</button>
        </div>
      `).join('');

      editor.querySelectorAll('[data-config-test]').forEach(button => {
        button.onclick = () => {
          const test = tests.find(item => item.id === button.dataset.configTest);
          configureTest(editor, edition, test, test.numero_teste);
        };
      });
    } catch (error) {
      document.getElementById('dr-tests-editor').innerHTML = `
        <div class="dr-test-error">
          Não foi possível carregar os testes.
          <br><small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function renderIntegratedAdmin() {
    const panel = await ensureIntegratedAdmin();
    if (!panel) return;

    const root = panel.querySelector('#dr-integrado-content');
    const c = getClient();
    if (!c) {
      root.innerHTML = '<div class="dr-test-error">Cliente Supabase não disponível.</div>';
      return;
    }

    if (!(await isAdmin())) {
      root.innerHTML = '';
      return;
    }

    try {
      const { data: modalidades, error: mError } = await c
        .from('dr_arbitro_modalidades')
        .select('id,codigo,nome,ativo')
        .eq('ativo', true)
        .order('nome');

      if (mError) throw mError;

      const next = await nextEditionNumber(c, m.id);

      root.innerHTML = modalidades.map(m => `
        <div class="dr-modalidade">
          <h4>${esc(m.nome)}</h4>
          <div class="dr-actions">
            <button class="admin-small-btn" type="button" data-create-ed="${esc(m.id)}">
              Criar ${esc(editionLabel(next))}
            </button>
          </div>
          <div class="dr-admin-grid" data-editions="${esc(m.id)}">
            <div class="dr-muted">A carregar…</div>
          </div>
        </div>
      `).join('');

      for (const m of modalidades || []) {
        const grid = root.querySelector(`[data-editions="${CSS.escape(m.id)}"]`);

        const { data: editions, error } = await c
          .from('dr_arbitro_edicoes')
          .select('*')
          .eq('modalidade_id', m.id)
          .order('numero_edicao', { ascending: false });

        if (error) throw error;

        grid.innerHTML = editions?.length ? editions.map(ed => `
          <div class="dr-row">
            <div>
              <strong>${esc(ed.nome)}</strong>
              <div class="dr-muted">
                ${ed.ativo ? '🟢 Ativa' : '⚪ Inativa'}
                · ${ed.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
              </div>
            </div>
            <button type="button" class="admin-small-btn" data-config-ed="${esc(ed.id)}">Editar</button>
          </div>
        `).join('') : '<div class="dr-muted">Sem edições.</div>';

        grid.querySelectorAll('[data-config-ed]').forEach(btn => {
          btn.onclick = () => {
            const ed = editions.find(item => item.id === btn.dataset.configEd);
            renderEditionAdmin(root, ed);
          };
        });
      }

      root.querySelectorAll('[data-create-ed]').forEach(btn => {
        btn.onclick = async () => {
          try {
            const numero = await nextEditionNumber(c, btn.dataset.createEd);

            const { error } = await c.from('dr_arbitro_edicoes').insert({
              modalidade_id: btn.dataset.createEd,
              numero_edicao: numero,
              nome: `Drº Árbitro - ${editionLabel(numero)}`,
              ativo: false,
              numero_testes: 1,
              inscricoes_abertas: false
            });

            if (error) throw error;
            await renderIntegratedAdmin();
          } catch (error) {
            alert(error.message || String(error));
          }
        };
      });
    } catch (error) {
      root.innerHTML = `
        <div class="dr-test-error">
          Não foi possível carregar o Drº Árbitro.
          <br><small>${esc(error.message || String(error))}</small>
        </div>
      `;
    }
  }

  async function renderDedicatedAdmin() {
    const c = getClient();
    const futebol = document.getElementById('dr-futebol');
    const futsal = document.getElementById('dr-futsal');
    if (!c || (!futebol && !futsal) || !(await isAdmin())) return;

    // Mantém o admin.html existente compatível, mas usa o mesmo editor.
    const { data: modalidades, error } = await c
      .from('dr_arbitro_modalidades')
      .select('id,codigo,nome,ativo')
      .eq('ativo', true)
      .order('nome');

    if (error) throw error;

    for (const m of modalidades || []) {
      const target = String(m.codigo).toLowerCase() === 'futsal' ? futsal : futebol;
      if (!target) continue;

      const { data: editions, error: e } = await c
        .from('dr_arbitro_edicoes')
        .select('*')
        .eq('modalidade_id', m.id)
        .order('numero_edicao', { ascending: false });

      if (e) throw e;

      target.innerHTML = `
        <h4>${esc(m.nome)}</h4>
        <div class="dr-actions" style="margin:10px 0">
          <button type="button" class="admin-small-btn primary" data-create-ed="${esc(m.id)}">+ Criar nova edição</button>
        </div>
        <div class="dr-admin-grid">
          ${(editions || []).map(ed => `
            <div class="dr-row">
              <div>
                <strong>${esc(ed.nome)}</strong>
                <div class="dr-muted">
                  ${ed.ativo ? '🟢 Ativa' : '⚪ Inativa'}
                  · ${ed.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}
                </div>
              </div>
              <button type="button" class="admin-small-btn" data-config-ed="${esc(ed.id)}">Editar</button>
            </div>
          `).join('')}
        </div>
      `;

      target.querySelectorAll('[data-config-ed]').forEach(btn => {
        btn.onclick = () => {
          const ed = editions.find(item => item.id === btn.dataset.configEd);
          target.innerHTML = '';
          renderEditionAdmin(target, ed).catch(error => {
            target.innerHTML = `<div class="dr-test-error">${esc(error.message || String(error))}</div>`;
          });
        };
      });

      target.querySelectorAll('[data-create-ed]').forEach(btn => {
        btn.onclick = async () => {
          try {
            const numero = await nextEditionNumber(c, btn.dataset.createEd);
            const { data: sessionData } = await c.auth.getSession();
            const { error: insertError } = await c.from('dr_arbitro_edicoes').insert({
              modalidade_id: btn.dataset.createEd,
              numero_edicao: numero,
              nome: `Drº Árbitro - ${editionLabel(numero)}`,
              ativo: false,
              numero_testes: 1,
              inscricoes_abertas: false,
              criado_por: sessionData?.session?.user?.id || null
            });
            if (insertError) throw insertError;
            await renderDedicatedAdmin();
          } catch (error) {
            alert(error.message || String(error));
          }
        };
      });
    }
  }

  async function boot() {
    if (started) return true;
    injectCss();

    const c = getClient();
    if (!c) return false;

    started = true;

    await cacheSession();
    bindAbandonHandlers();

    try { await renderDedicatedAdmin(); } catch (e) { console.error(e); }
    try { await renderIntegratedAdmin(); } catch (e) { console.error(e); }
    try { await loadMember(); } catch (e) { console.error(e); }

    return true;
  }

  window.NAF_DR_ARBITRO_START = async () => {
    started = false;

    if (waitTimer) {
      clearInterval(waitTimer);
      waitTimer = null;
    }

    if (!(await boot())) {
      waitTimer = setInterval(() => {
        boot().then(ok => {
          if (ok) {
            clearInterval(waitTimer);
            waitTimer = null;
          }
        }).catch(console.error);
      }, 100);
    }
  };

  const auto = () => {
    if (getClient()) {
      boot().catch(console.error);
    } else {
      waitTimer = setInterval(() => {
        boot().then(ok => {
          if (ok) {
            clearInterval(waitTimer);
            waitTimer = null;
          }
        }).catch(console.error);
      }, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', auto, { once: true });
  } else {
    auto();
  }
})();
