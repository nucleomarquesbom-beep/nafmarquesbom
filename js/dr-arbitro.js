/*
 * NÚCLEO MARQUES BOM — DRº ÁRBITRO
 * Futebol + Futsal
 * Integração única para admin.html e socio.html.
 * Não depende de alterações no sistema principal de sócios.
 */
(() => {
  'use strict';

  if (window.__NAF_DR_ARBITRO_BOOTED) return;
  window.__NAF_DR_ARBITRO_BOOTED = true;

  const CONFIG = window.NAF_ADMIN_CONFIG || {
    SUPABASE_URL: 'https://pvaupgdhtrmbumaxvvrj.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi'
  };

  let sb = null;
  let currentSocio = null;
  let countdownTimer = null;
  let currentAttempt = null;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[c]));

  async function client() {
    if (sb) return sb;
    if (window.supabase?.createClient) {
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      return sb;
    }
    const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = mod.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    return sb;
  }

  const dateText = value => value
    ? new Date(value).toLocaleString('pt-PT', { dateStyle:'short', timeStyle:'short' })
    : '—';

  const localValue = value => {
    const d = new Date(value);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  const isoValue = value => new Date(value).toISOString();

  async function getCurrentSocio() {
    const s = await client();
    const { data: { user }, error: authError } = await s.auth.getUser();
    if (authError || !user) return null;

    const { data, error } = await s
      .from('socios')
      .select('id,nome,numero_socio,ativo,is_admin')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .single();

    return error ? null : data;
  }

  async function isAdmin() {
    const s = await client();
    const { data, error } = await s.rpc('is_admin');
    return !error && data === true;
  }

  /* ============================================================
     ADMIN
     ============================================================ */

  async function adminInit() {
    if (!(await isAdmin())) return;

    const app = $('#admin-app');
    const tabs = $('.admin-tabs');
    if (!app || !tabs || tabs.querySelector('[data-panel="dr-arbitro"]')) return;

    tabs.insertAdjacentHTML('beforeend',
      '<button class="admin-tab" data-panel="dr-arbitro" type="button">Drº Árbitro</button>'
    );

    app.insertAdjacentHTML('beforeend', `
      <section id="panel-dr-arbitro" class="admin-tab-panel">
        <div class="admin-card dr-card">
          <div class="dr-page-head">
            <div>
              <h3>Drº Árbitro</h3>
              <p class="admin-help">Gestão das atividades exclusivas de Futebol e Futsal.</p>
            </div>
          </div>
          <div class="dr-grid">
            <div id="dr-futebol" class="dr-modalidade"></div>
            <div id="dr-futsal" class="dr-modalidade"></div>
          </div>
        </div>
      </section>
    `);

    const tab = tabs.querySelector('[data-panel="dr-arbitro"]');
    tab.addEventListener('click', () => {
      $$('.admin-tab', tabs).forEach(x => x.classList.remove('active'));
      $$('.admin-tab-panel', app).forEach(x => x.classList.remove('active'));
      tab.classList.add('active');
      $('#panel-dr-arbitro', app)?.classList.add('active');
    });

    await Promise.all(['futebol', 'futsal'].map(loadModalidade));
  }

  async function loadModalidade(codigo) {
    const s = await client();
    const box = $(`#dr-${codigo}`);
    if (!box) return;

    const { data: modalidade, error: modalidadeError } = await s
      .from('dr_arbitro_modalidades')
      .select('*')
      .eq('codigo', codigo)
      .single();

    if (modalidadeError || !modalidade) {
      box.innerHTML = `<p class="dr-error">${esc(modalidadeError?.message || 'Modalidade não encontrada.')}</p>`;
      return;
    }

    const { data: edicoes, error: edicoesError } = await s
      .from('dr_arbitro_edicoes')
      .select('*')
      .eq('modalidade_id', modalidade.id)
      .order('created_at', { ascending: false });

    if (edicoesError) {
      box.innerHTML = `<p class="dr-error">${esc(edicoesError.message)}</p>`;
      return;
    }

    const edicao = edicoes?.[0] || null;
    const nome = codigo === 'futebol' ? '⚽ Drº Árbitro — Futebol' : '🏆 Drº Árbitro — Futsal';

    box.innerHTML = `
      <div class="dr-modalidade-head">
        <h4>${nome}</h4>
        <span class="dr-badge ${modalidade.ativo ? 'on' : 'off'}">
          ${modalidade.ativo ? 'Ativo' : 'Desativo'}
        </span>
      </div>

      <label class="dr-check">
        <input id="dr-m-${codigo}" type="checkbox" ${modalidade.ativo ? 'checked' : ''}>
        Disponível no site
      </label>

      <div class="dr-form">
        <label class="wide">
          Nome da edição
          <input id="dr-n-${codigo}" value="${esc(edicao?.nome || nome)}">
        </label>
        <label>
          N.º de testes
          <input id="dr-num-${codigo}" type="number" min="1" max="50" value="${edicao?.numero_testes || 1}">
        </label>
        <label class="dr-check">
          <input id="dr-ed-${codigo}" type="checkbox" ${edicao?.ativo ? 'checked' : ''}>
          Edição ativa
        </label>
        <label class="dr-check">
          <input id="dr-ins-${codigo}" type="checkbox" ${edicao?.inscricoes_abertas ? 'checked' : ''}>
          Inscrições abertas
        </label>
      </div>

      <div class="dr-actions">
        <button class="admin-small-btn primary" id="dr-save-${codigo}" type="button">
          ${edicao ? 'Guardar edição' : 'Criar edição'}
        </button>
      </div>

      <div id="dr-tests-${codigo}"></div>
    `;

    $(`#dr-m-${codigo}`).addEventListener('change', async event => {
      const { error } = await s
        .from('dr_arbitro_modalidades')
        .update({ ativo: event.target.checked })
        .eq('id', modalidade.id);
      if (error) {
        event.target.checked = !event.target.checked;
        alert(error.message);
      }
    });

    $(`#dr-save-${codigo}`).addEventListener('click', () => saveEdicao(codigo, modalidade, edicao));

    if (edicao) await renderTests(codigo, edicao);
  }

  async function saveEdicao(codigo, modalidade, oldEdicao) {
    const s = await client();
    const nome = $(`#dr-n-${codigo}`).value.trim();
    const numero = Number($(`#dr-num-${codigo}`).value);
    const ativo = $(`#dr-ed-${codigo}`).checked;
    const inscricoes = $(`#dr-ins-${codigo}`).checked;

    if (!nome || !Number.isInteger(numero) || numero < 1 || numero > 50) {
      alert('Indica um nome e um número de testes entre 1 e 50.');
      return;
    }

    const payload = {
      nome,
      numero_testes: numero,
      ativo,
      inscricoes_abertas: inscricoes
    };

    const result = oldEdicao
      ? await s.from('dr_arbitro_edicoes').update(payload).eq('id', oldEdicao.id).select().single()
      : await s.from('dr_arbitro_edicoes').insert({ ...payload, modalidade_id: modalidade.id }).select().single();

    if (result.error) {
      alert(result.error.message);
      return;
    }

    const edicao = result.data;
    const { data: existentes } = await s
      .from('dr_arbitro_testes')
      .select('numero_teste')
      .eq('edicao_id', edicao.id);

    const numeros = new Set((existentes || []).map(x => Number(x.numero_teste)));

    for (let i = 1; i <= numero; i++) {
      if (numeros.has(i)) continue;
      const r = await s.from('dr_arbitro_testes').insert({
        edicao_id: edicao.id,
        numero_teste: i,
        titulo: `Teste ${i}`,
        inicio_em: new Date(Date.now() + 3600000).toISOString(),
        fim_em: new Date(Date.now() + 7200000).toISOString(),
        ativo: false
      });
      if (r.error) {
        alert(r.error.message);
        return;
      }
    }

    await loadModalidade(codigo);
  }

  async function renderTests(codigo, edicao) {
    const s = await client();
    const target = $(`#dr-tests-${codigo}`);
    if (!target) return;

    const { data: testes, error } = await s
      .from('dr_arbitro_testes')
      .select('*')
      .eq('edicao_id', edicao.id)
      .order('numero_teste');

    if (error) {
      target.innerHTML = `<p class="dr-error">${esc(error.message)}</p>`;
      return;
    }

    target.innerHTML = (testes || []).map(t => `
      <article class="dr-test-card">
        <div class="dr-test-head">
          <strong>${esc(t.titulo)}</strong>
          <span class="dr-badge ${t.ativo ? 'on' : 'off'}">
            ${t.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <div class="dr-form">
          <label class="wide">Título
            <input data-title="${t.id}" value="${esc(t.titulo)}">
          </label>
          <label>Início
            <input type="datetime-local" data-start="${t.id}" value="${localValue(t.inicio_em)}">
          </label>
          <label>Fim
            <input type="datetime-local" data-end="${t.id}" value="${localValue(t.fim_em)}">
          </label>
          <label class="dr-check">
            <input type="checkbox" data-active="${t.id}" ${t.ativo ? 'checked' : ''}>
            Teste ativo
          </label>
          <label class="wide">PDF das perguntas
            <input type="file" accept="application/pdf" data-pdf="${t.id}">
          </label>
        </div>
        <div class="dr-meta">
          ${t.ficheiro_path ? '📄 PDF carregado' : '📄 PDF por carregar'}
        </div>
        <div class="dr-actions">
          <button class="admin-small-btn primary" data-save-test="${t.id}" type="button">Guardar teste</button>
          <button class="admin-small-btn" data-questions="${t.id}" type="button">Ver perguntas</button>
        </div>
        <div class="dr-question-list" id="dr-q-${t.id}"></div>
      </article>
    `).join('');

    $$('[data-save-test]', target).forEach(button => {
      button.addEventListener('click', () => saveTest(button.dataset.saveTest, edicao.id, codigo));
    });

    $$('[data-questions]', target).forEach(button => {
      button.addEventListener('click', () => loadQuestions(button.dataset.questions));
    });
  }

  async function saveTest(id, edicaoId, codigo) {
    const s = await client();
    const title = $(`[data-title="${id}"]`).value.trim();
    const start = $(`[data-start="${id}"]`).value;
    const end = $(`[data-end="${id}"]`).value;
    const active = $(`[data-active="${id}"]`).checked;
    const file = $(`[data-pdf="${id}"]`).files?.[0];

    if (!title || !start || !end) {
      alert('Preenche o título, início e fim.');
      return;
    }

    const inicio = isoValue(start);
    const fim = isoValue(end);
    if (new Date(fim) <= new Date(inicio)) {
      alert('O fim tem de ser posterior ao início.');
      return;
    }

    let ficheiroPath;
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('O ficheiro tem de ser PDF.');
        return;
      }

      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      ficheiroPath = `${edicaoId}/${id}/${Date.now()}-${safe}`;
      const upload = await s.storage.from('dr-arbitro').upload(ficheiroPath, file, {
        upsert: true,
        contentType: 'application/pdf'
      });

      if (upload.error) {
        alert(upload.error.message);
        return;
      }
    }

    const payload = { titulo: title, inicio_em: inicio, fim_em: fim, ativo: active };
    if (ficheiroPath) payload.ficheiro_path = ficheiroPath;

    const { error } = await s.from('dr_arbitro_testes').update(payload).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }

    alert('Teste guardado.');
    await loadModalidade(codigo);
  }

  async function loadQuestions(id) {
    const s = await client();
    const el = $(`#dr-q-${id}`);
    if (!el) return;

    const { data, error } = await s
      .from('dr_arbitro_perguntas')
      .select('numero,pergunta,opcao_a,opcao_b,opcao_c,opcao_d,resposta_correta')
      .eq('teste_id', id)
      .order('numero');

    if (error) {
      el.innerHTML = `<p class="dr-error">${esc(error.message)}</p>`;
      return;
    }

    el.innerHTML = (data || []).map(q => `
      <div class="dr-question">
        <strong>${q.numero}. ${esc(q.pergunta)}</strong>
        <div>A — ${esc(q.opcao_a)}</div>
        <div>B — ${esc(q.opcao_b)}</div>
        <div>C — ${esc(q.opcao_c)}</div>
        <div>D — ${esc(q.opcao_d)}</div>
        <b>Correta: ${esc(q.resposta_correta)}</b>
      </div>
    `).join('') || '<p class="dr-muted">Ainda não existem perguntas neste teste.</p>';
  }

  /* ============================================================
     SÓCIO
     ============================================================ */

  async function socioInit() {
    currentSocio = await getCurrentSocio();
    if (!currentSocio) return;

    const dashboard = $('#dashboard');
    const tabs = $('.socio-tabs');
    if (!dashboard || !tabs) return;

    if (!tabs.querySelector('[data-tab="dr-arbitro"]')) {
      tabs.insertAdjacentHTML('beforeend',
        '<button class="socio-tab" data-tab="dr-arbitro" type="button">Drº Árbitro</button>'
      );
      tabs.querySelector('[data-tab="dr-arbitro"]').addEventListener('click', activateSocioTab);
    }

    if (!$('#dr-arbitro-socio-panel')) {
      dashboard.insertAdjacentHTML('beforeend', `
        <section id="dr-arbitro-socio-panel" class="socio-tab-content">
          <div class="dr-card">
            <div class="tab-heading-row">
              <div>
                <h2>Drº Árbitro</h2>
                <p>Atividade exclusiva para sócios.</p>
              </div>
            </div>
            <div id="dr-socio-content">
              <div class="vazio">A carregar…</div>
            </div>
          </div>
        </section>
      `);
    }

    await loadSocioArea();
  }

  function activateSocioTab() {
    $$('.socio-tab').forEach(x => x.classList.remove('active'));
    $$('.socio-tab-content').forEach(x => x.classList.remove('active'));
    $('.socio-tab[data-tab="dr-arbitro"]')?.classList.add('active');
    $('#dr-arbitro-socio-panel')?.classList.add('active');
  }

  async function loadSocioArea() {
    const s = await client();
    const target = $('#dr-socio-content');
    if (!target) return;

    const { data: modalidades, error } = await s
      .from('dr_arbitro_modalidades')
      .select('*')
      .eq('ativo', true);

    if (error) {
      target.innerHTML = `<p class="dr-error">${esc(error.message)}</p>`;
      return;
    }

    if (!modalidades?.length) {
      target.innerHTML = '<div class="vazio">O Drº Árbitro não está disponível neste momento.</div>';
      return;
    }

    const { data: edicoes, error: edicaoError } = await s
      .from('dr_arbitro_edicoes')
      .select('*')
      .eq('ativo', true)
      .order('created_at', { ascending: false });

    if (edicaoError) {
      target.innerHTML = `<p class="dr-error">${esc(edicaoError.message)}</p>`;
      return;
    }

    const { data: inscricoes, error: inscricaoError } = await s
      .from('dr_arbitro_inscricoes')
      .select('id,edicao_id')
      .eq('socio_id', currentSocio.id);

    if (inscricaoError) {
      target.innerHTML = `<p class="dr-error">${esc(inscricaoError.message)}</p>`;
      return;
    }

    const cards = modalidades.map(m => {
      const edicao = (edicoes || []).find(e => e.modalidade_id === m.id);
      if (!edicao) return '';
      const inscrito = (inscricoes || []).some(i => i.edicao_id === edicao.id);
      const nome = m.codigo === 'futebol' ? '⚽ Futebol' : '🏆 Futsal';

      return `
        <article class="dr-socio-modalidade">
          <div class="dr-modalidade-head">
            <h3>Drº Árbitro — ${nome}</h3>
            <span class="dr-badge on">Disponível</span>
          </div>
          <p><strong>${esc(edicao.nome)}</strong></p>
          ${inscrito
            ? '<span class="dr-badge on">Inscrito</span>'
            : edicao.inscricoes_abertas
              ? `<button class="botao dr-inscrever" data-ed="${edicao.id}" type="button">Inscrever-me</button>`
              : '<span class="dr-badge off">Inscrições encerradas</span>'}
          <div class="dr-socio-tests" data-ed-tests="${edicao.id}"></div>
        </article>
      `;
    }).join('');

    target.innerHTML = cards || '<div class="vazio">Não existe nenhuma edição ativa neste momento.</div>';

    $$('.dr-inscrever', target).forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          const { data, error: rpcError } = await s.rpc('dr_arbitro_inscrever', {
            p_edicao_id: button.dataset.ed
          });
          if (rpcError) throw rpcError;
          if (data === false) throw new Error('Não foi possível efetuar a inscrição.');
          await loadSocioArea();
        } catch (err) {
          alert(err.message || 'Não foi possível efetuar a inscrição.');
          button.disabled = false;
        }
      });
    });

    for (const edicao of edicoes || []) {
      const el = target.querySelector(`[data-ed-tests="${edicao.id}"]`);
      if (el) {
        await renderSocioTests(
          el,
          edicao,
          (inscricoes || []).some(i => i.edicao_id === edicao.id)
        );
      }
    }
  }

  async function renderSocioTests(target, edicao, inscrito) {
    if (!inscrito) {
      target.innerHTML = '<p class="dr-muted">Inscreve-te para veres os testes.</p>';
      return;
    }

    const s = await client();
    const { data: testes, error } = await s
      .from('dr_arbitro_testes')
      .select('id,numero_teste,titulo,inicio_em,fim_em,ativo')
      .eq('edicao_id', edicao.id)
      .order('numero_teste');

    if (error) {
      target.innerHTML = `<p class="dr-error">${esc(error.message)}</p>`;
      return;
    }

    target.innerHTML = (testes || []).map(t => `
      <div class="dr-socio-test">
        <div>
          <strong>${esc(t.titulo)}</strong>
          <small>${dateText(t.inicio_em)} → ${dateText(t.fim_em)}</small>
        </div>
        <span data-test-action="${t.id}">A verificar…</span>
      </div>
    `).join('') || '<p class="dr-muted">Ainda não existem testes configurados.</p>';

    for (const teste of testes || []) await updateSocioTestAction(teste);
  }

  async function updateSocioTestAction(teste) {
    const s = await client();
    const el = $(`[data-test-action="${teste.id}"]`);
    if (!el) return;

    const { data: tentativa, error } = await s
      .from('dr_arbitro_tentativas')
      .select('id,iniciou_em,submeteu_em,nota,total_perguntas,percentagem')
      .eq('teste_id', teste.id)
      .eq('socio_id', currentSocio.id)
      .maybeSingle();

    if (error) {
      el.innerHTML = `<span class="dr-error">${esc(error.message)}</span>`;
      return;
    }

    if (tentativa?.submeteu_em) {
      el.innerHTML = `<span class="dr-badge on">${esc(tentativa.nota ?? 0)}/${esc(tentativa.total_perguntas ?? 0)} — ${esc(tentativa.percentagem ?? 0)}%</span>`;
      return;
    }

    const now = Date.now();
    const inicio = new Date(teste.inicio_em).getTime();
    const fim = new Date(teste.fim_em).getTime();

    if (tentativa && now >= fim) {
      // O prazo acabou. Não reabrimos a tentativa. A classificação é apresentada
      // assim que o backend a tiver finalizado.
      el.innerHTML = '<span class="dr-badge off">Prazo terminado</span>';
      return;
    }

    if (tentativa) {
      // Regra do Drº Árbitro: depois de entrar no teste não existe botão
      // "voltar a entrar". A tentativa fica bloqueada nesta sessão/estado.
      el.innerHTML = '<span class="dr-badge off">Teste iniciado — não pode voltar a entrar</span>';
      return;
    }

    if (!teste.ativo || now < inicio) {
      el.innerHTML = `<span class="dr-badge off">Inicia ${dateText(teste.inicio_em)}</span>`;
      return;
    }

    if (now > fim) {
      el.innerHTML = '<span class="dr-badge off">Terminado</span>';
      return;
    }

    el.innerHTML = '<button class="botao" type="button">Iniciar teste</button>';
    el.querySelector('button').addEventListener('click', async () => {
      const button = el.querySelector('button');
      button.disabled = true;
      try {
        const { data, error: rpcError } = await s.rpc('dr_arbitro_iniciar_teste', {
          p_teste_id: teste.id
        });
        if (rpcError) throw rpcError;
        currentAttempt = data;
        await openTest(teste, data);
      } catch (err) {
        alert(err.message || 'Não foi possível iniciar o teste.');
        button.disabled = false;
      }
    });
  }

  async function openTest(teste, tentativaId) {
    const s = await client();
    const { data: perguntas, error } = await s
      .from('dr_arbitro_perguntas_publicas')
      .select('id,numero,pergunta,opcao_a,opcao_b,opcao_c,opcao_d')
      .eq('teste_id', teste.id)
      .order('numero');

    if (error) {
      alert(error.message);
      return;
    }

    if (!perguntas?.length) {
      alert('Este teste ainda não tem perguntas.');
      return;
    }

    let overlay = $('#dr-test-overlay');
    if (!overlay) {
      document.body.insertAdjacentHTML('beforeend', '<div id="dr-test-overlay" class="dr-test-overlay"></div>');
      overlay = $('#dr-test-overlay');
    }

    overlay.innerHTML = `
      <div class="dr-test-window" role="dialog" aria-modal="true" aria-labelledby="dr-test-title">
        <div class="dr-test-head">
          <div>
            <h2 id="dr-test-title">${esc(teste.titulo)}</h2>
            <p>Depois de iniciar, não podes sair e voltar a entrar neste teste.</p>
          </div>
          <strong id="dr-countdown">—</strong>
        </div>
        <form id="dr-test-form">
          ${perguntas.map(q => `
            <fieldset class="dr-question">
              <legend>${q.numero}. ${esc(q.pergunta)}</legend>
              ${['A','B','C','D'].map(letra => `
                <label class="dr-option">
                  <input type="radio" name="q-${q.id}" value="${letra}">
                  <span><b>${letra}</b> ${esc(q[`opcao_${letra.toLowerCase()}`])}</span>
                </label>
              `).join('')}
            </fieldset>
          `).join('')}
          <button class="botao" id="dr-submit-test" type="submit">Submeter respostas</button>
        </form>
      </div>
    `;

    overlay.hidden = false;
    document.body.classList.add('dr-test-running');

    const submit = async auto => {
      const button = $('#dr-submit-test');
      if (button) button.disabled = true;

      const respostas = perguntas.map(q => {
        const selected = $(`input[name="q-${q.id}"]:checked`);
        return selected ? { pergunta_id: q.id, resposta: selected.value } : null;
      }).filter(Boolean);

      const { data, error: rpcError } = await s.rpc('dr_arbitro_submeter_teste', {
        p_tentativa_id: tentativaId,
        p_respostas: respostas
      });

      if (rpcError) {
        if (button) button.disabled = false;
        if (!auto) alert(rpcError.message);
        return false;
      }

      stopCountdown();
      overlay.hidden = true;
      document.body.classList.remove('dr-test-running');
      currentAttempt = null;

      if (auto) {
        alert('O tempo terminou. O teste foi submetido automaticamente.');
      } else {
        const result = Array.isArray(data) ? data[0] : data;
        alert(`Teste submetido: ${result?.nota ?? 0}/${result?.total_perguntas ?? perguntas.length}.`);
      }

      await loadSocioArea();
      return true;
    };

    $('#dr-test-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!confirm('Submeter o teste? Depois de submeter não poderás alterar as respostas.')) return;
      await submit(false);
    });

    startCountdown(teste.fim_em, () => submit(true));
  }

  function startCountdown(end, onExpire) {
    stopCountdown();
    const tick = () => {
      const el = $('#dr-countdown');
      if (!el) return;
      let remaining = new Date(end).getTime() - Date.now();
      if (remaining <= 0) {
        el.textContent = 'Tempo terminado';
        stopCountdown();
        onExpire?.();
        return;
      }
      remaining = Math.floor(remaining / 1000);
      el.textContent = remaining >= 3600
        ? `${Math.floor(remaining / 3600)}h ${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}m`
        : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function ensureCss() {
    if (document.querySelector('link[data-dr-arbitro-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/dr-arbitro.css?v=20260812-2';
    link.dataset.drArbitroCss = '1';
    document.head.appendChild(link);
  }

  async function boot() {
    ensureCss();
    try {
      await client();
      if (/\/admin\.html$/i.test(location.pathname)) {
        setTimeout(() => adminInit().catch(console.error), 300);
      }
      if (/\/socio\.html$/i.test(location.pathname)) {
        setTimeout(() => socioInit().catch(console.error), 300);
      }
    } catch (error) {
      console.error('Drº Árbitro: não foi possível inicializar.', error);
    }
  }

  boot();
})();
