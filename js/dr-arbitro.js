/*
 * NÚCLEO MARQUES BOM — DRº ÁRBITRO
 * Futebol + Futsal
 *
 * Regras:
 * - o administrador ativa/desativa cada modalidade;
 * - o administrador cria a edição e define o número de testes;
 * - o PDF é lido exclusivamente no navegador e NÃO é guardado;
 * - apenas as perguntas/opções/respostas corretas são gravadas na BD;
 * - o sócio só vê a modalidade que corresponde a socios.modalidade;
 * - uma tentativa iniciada não pode ser reiniciada;
 * - a correção é feita no backend/RPC, nunca no navegador.
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

  async function getCurrentUser() {
    const s = await client();
    const { data: { user }, error } = await s.auth.getUser();
    if (error || !user) return null;
    return user;
  }

  async function getCurrentSocio() {
    const s = await client();
    const user = await getCurrentUser();
    if (!user) return null;

    const { data, error } = await s
      .from('socios')
      .select('id,nome,numero_socio,ativo,is_admin,modalidade')
      .eq('user_id', user.id)
      .eq('ativo', true)
      .single();

    return error ? null : data;
  }

  async function isAdmin() {
    const user = await getCurrentUser();
    if (!user) return false;

    // Igual ao admin.js: a interface administrativa usa os metadados da conta.
    // Mantemos também a RPC como confirmação quando estiver disponível.
    const metadataAdmin =
      user.user_metadata?.tipo_utilizador === 'admin' ||
      user.user_metadata?.role === 'admin' ||
      user.app_metadata?.tipo_utilizador === 'admin' ||
      user.app_metadata?.role === 'admin';

    if (metadataAdmin) return true;

    const s = await client();
    const { data, error } = await s.rpc('is_admin');
    return !error && data === true;
  }

  /* ============================================================
     ADMIN
     ============================================================ */

  // API pública: o admin.js chama isto depois de autenticar o administrador.
  window.initDrArbitroAdmin = adminInit;

  async function adminInit() {
    if (window.__NAF_DR_ADMIN_INITIALIZED) return true;
    if (!(await isAdmin())) return false;

    /*
     * A aba e o painel Drº Árbitro pertencem ao layout fixo de admin.html,
     * exatamente como as restantes funcionalidades administrativas.
     * Este módulo apenas preenche o painel existente.
     */
    const app = $('#admin-app');
    const tabs = $('.admin-tabs');
    const panel = $('#panel-dr-arbitro');

    if (!app || !tabs || !panel) {
      console.error('Drº Árbitro: painel administrativo não encontrado no HTML.');
      return;
    }

    const futebol = $('#dr-futebol', panel);
    const futsal = $('#dr-futsal', panel);

    if (!futebol || !futsal) {
      console.error('Drº Árbitro: contentores Futebol/Futsal não encontrados.');
      return false;
    }

    window.__NAF_DR_ADMIN_INITIALIZED = true;
    await Promise.all(['futebol', 'futsal'].map(loadModalidade));
    return true;
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
        <button class="admin-small-btn" id="dr-new-${codigo}" type="button">
          Nova edição
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
        return;
      }
      await loadModalidade(codigo);
    });

    $(`#dr-save-${codigo}`).addEventListener('click', () => saveEdicao(codigo, modalidade, edicao));
    $(`#dr-new-${codigo}`).addEventListener('click', () => createNewEdition(codigo, modalidade));

    if (edicao) await renderTests(codigo, edicao);
  }

  async function createNewEdition(codigo, modalidade) {
    const nomeBase = codigo === 'futebol' ? 'Drº Árbitro — Futebol' : 'Drº Árbitro — Futsal';
    const nome = prompt('Nome da nova edição:', `${nomeBase} — ${new Date().toLocaleDateString('pt-PT')}`);
    if (nome === null) return;
    const numero = Number(prompt('Quantos testes terá esta edição?', '1'));
    if (!Number.isInteger(numero) || numero < 1 || numero > 50) {
      alert('Indica um número de testes entre 1 e 50.');
      return;
    }

    const s = await client();
    const { data: edicao, error } = await s.from('dr_arbitro_edicoes').insert({
      modalidade_id: modalidade.id,
      nome: nome.trim() || nomeBase,
      numero_testes: numero,
      ativo: false,
      inscricoes_abertas: false
    }).select().single();

    if (error) {
      alert(error.message);
      return;
    }

    for (let i = 1; i <= numero; i++) {
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

    if (!oldEdicao) {
      await createEditionWithValues(codigo, modalidade, { nome, numero, ativo, inscricoes });
      return;
    }

    const { data: edicao, error } = await s.from('dr_arbitro_edicoes')
      .update({ nome, numero_testes: numero, ativo, inscricoes_abertas: inscricoes })
      .eq('id', oldEdicao.id)
      .select().single();

    if (error) {
      alert(error.message);
      return;
    }

    const { data: existentes, error: listError } = await s
      .from('dr_arbitro_testes')
      .select('numero_teste')
      .eq('edicao_id', edicao.id);
    if (listError) {
      alert(listError.message);
      return;
    }

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

  async function createEditionWithValues(codigo, modalidade, values) {
    const s = await client();
    const { data: edicao, error } = await s.from('dr_arbitro_edicoes').insert({
      modalidade_id: modalidade.id,
      nome: values.nome,
      numero_testes: values.numero,
      ativo: values.ativo,
      inscricoes_abertas: values.inscricoes
    }).select().single();
    if (error) {
      alert(error.message);
      return;
    }

    for (let i = 1; i <= values.numero; i++) {
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
          <span class="dr-badge ${t.ativo ? 'on' : 'off'}">${t.ativo ? 'Ativo' : 'Inativo'}</span>
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
        <div class="dr-meta" data-pdf-status="${t.id}">
          📄 As perguntas são carregadas diretamente do PDF; o PDF não é guardado.
        </div>
        <div class="dr-actions">
          <button class="admin-small-btn primary" data-save-test="${t.id}" type="button">Guardar teste</button>
          <button class="admin-small-btn" data-questions="${t.id}" type="button">Ver perguntas</button>
        </div>
        <div class="dr-question-list" id="dr-q-${t.id}"></div>
      </article>
    `).join('') || '<p class="dr-muted">Ainda não existem testes nesta edição.</p>';

    $$('[data-save-test]', target).forEach(button => {
      button.addEventListener('click', () => saveTest(button.dataset.saveTest, edicao.id, codigo));
    });

    $$('[data-questions]', target).forEach(button => {
      button.addEventListener('click', () => loadQuestions(button.dataset.questions));
    });
  }

  /* ============================================================
     PDF — LEITURA LOCAL, SEM STORAGE
     ============================================================ */

  async function parsePdfFile(file) {
    if (!file) throw new Error('Seleciona primeiro um PDF.');
    if (file.type !== 'application/pdf') throw new Error('O ficheiro tem de ser PDF.');

    const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const lines = [];

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const groups = [];

      for (const item of content.items) {
        const text = String(item.str || '').trim();
        if (!text) continue;
        const x = Number(item.transform?.[4] || 0);
        const y = Number(item.transform?.[5] || 0);
        let group = groups.find(g => Math.abs(g.y - y) <= 3);
        if (!group) {
          group = { y, items: [] };
          groups.push(group);
        }
        group.items.push({ x, text });
      }

      groups.sort((a,b) => b.y - a.y);
      for (const group of groups) {
        group.items.sort((a,b) => a.x - b.x);
        const line = group.items.map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
        if (line) lines.push(line);
      }
    }

    return parseQuestionLines(lines);
  }

  function parseQuestionLines(lines) {
    const questions = [];
    let current = null;
    let currentOption = null;

    const finish = () => {
      if (!current) return;
      for (const key of ['a','b','c','d']) current[`opcao_${key}`] = String(current[`opcao_${key}`] || '').trim();
      current.pergunta = String(current.pergunta || '').trim();
      current.resposta_correta = String(current.resposta_correta || '').toUpperCase().trim();
      if (current.pergunta || current.opcao_a || current.opcao_b || current.opcao_c || current.opcao_d) questions.push(current);
      current = null;
      currentOption = null;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const qMatch = line.match(/^(?:quest[aã]o\s*)?(\d{1,4})\s*[\.)\-:]\s*(.*)$/i);
      const optMatch = line.match(/^([ABCD])\s*[\.)\-:]\s*(.*)$/i);
      const answerMatch = line.match(/^(?:resposta|resposta\s+correcta|resposta\s+correta|correcta|correta|resposta\s+certa|resposta\s+certa)\s*[:\-]?\s*([ABCD])\b/i);

      if (qMatch) {
        finish();
        current = {
          numero: Number(qMatch[1]),
          pergunta: qMatch[2] || '',
          opcao_a: '', opcao_b: '', opcao_c: '', opcao_d: '',
          resposta_correta: ''
        };
        currentOption = null;
        continue;
      }

      if (!current) continue;

      if (optMatch) {
        currentOption = optMatch[1].toLowerCase();
        current[`opcao_${currentOption}`] = optMatch[2] || '';
        continue;
      }

      if (answerMatch) {
        current.resposta_correta = answerMatch[1].toUpperCase();
        currentOption = null;
        continue;
      }

      if (/^(?:resposta|resposta\s+correcta|resposta\s+correta)\b/i.test(line)) {
        const letter = line.match(/\b([ABCD])\b/i)?.[1];
        if (letter) current.resposta_correta = letter.toUpperCase();
        continue;
      }

      if (currentOption) {
        current[`opcao_${currentOption}`] += ` ${line}`;
      } else {
        current.pergunta += ` ${line}`;
      }
    }

    finish();

    const errors = [];
    const seen = new Set();
    questions.forEach((q, index) => {
      const n = Number(q.numero) || index + 1;
      if (seen.has(n)) errors.push(`Pergunta ${n}: número repetido.`);
      seen.add(n);
      if (!q.pergunta) errors.push(`Pergunta ${n}: falta o texto da pergunta.`);
      for (const letter of ['a','b','c','d']) {
        if (!q[`opcao_${letter}`]) errors.push(`Pergunta ${n}: falta a opção ${letter.toUpperCase()}.`);
      }
      if (!['A','B','C','D'].includes(q.resposta_correta)) {
        errors.push(`Pergunta ${n}: não foi encontrada a resposta correta A/B/C/D.`);
      }
    });

    if (!questions.length) {
      throw new Error('Não foram encontradas perguntas. Usa o formato: 1. pergunta / A) / B) / C) / D) / Resposta correcta: C.');
    }
    if (errors.length) throw new Error(`O PDF foi lido, mas existem problemas:\n\n${errors.slice(0, 12).join('\n')}${errors.length > 12 ? `\n… e mais ${errors.length - 12}.` : ''}`);

    return questions.sort((a,b) => a.numero - b.numero);
  }

  async function importQuestionsFromPdf(testeId, file) {
    const questions = await parsePdfFile(file);
    const s = await client();

    const { error: deleteError } = await s.from('dr_arbitro_perguntas').delete().eq('teste_id', testeId);
    if (deleteError) throw deleteError;

    const rows = questions.map(q => ({
      teste_id: testeId,
      numero: q.numero,
      pergunta: q.pergunta,
      opcao_a: q.opcao_a,
      opcao_b: q.opcao_b,
      opcao_c: q.opcao_c,
      opcao_d: q.opcao_d,
      resposta_correta: q.resposta_correta
    }));

    const { error: insertError } = await s.from('dr_arbitro_perguntas').insert(rows);
    if (insertError) throw insertError;

    return questions.length;
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

    const { error } = await s.from('dr_arbitro_testes').update({
      titulo: title,
      inicio_em: inicio,
      fim_em: fim,
      ativo: active
    }).eq('id', id);
    if (error) {
      alert(error.message);
      return;
    }

    if (file) {
      const status = $(`[data-pdf-status="${id}"]`);
      if (status) status.textContent = 'A ler PDF…';
      try {
        const total = await importQuestionsFromPdf(id, file);
        } catch (err) {
        alert(`O teste foi guardado, mas o PDF não foi importado.\n\n${err.message || err}`);
        await loadModalidade(codigo);
        return;
      }
    }

    alert(file ? 'Teste guardado e perguntas importadas. O PDF não foi armazenado.' : 'Teste guardado.');
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

    const modalidade = normalizarModalidade(currentSocio.modalidade);
    if (!['futebol','futsal'].includes(modalidade)) return;

    const s = await client();
    const { data: config } = await s
      .from('dr_arbitro_modalidades')
      .select('id,ativo,codigo')
      .eq('codigo', modalidade)
      .eq('ativo', true)
      .maybeSingle();

    if (!config) return;

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

  function normalizarModalidade(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
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
    if (!target || !currentSocio) return;

    const modalidadeCodigo = normalizarModalidade(currentSocio.modalidade);
    if (!['futebol','futsal'].includes(modalidadeCodigo)) {
      target.innerHTML = '<div class="vazio">O Drº Árbitro não está disponível para a modalidade deste sócio.</div>';
      return;
    }

    const { data: modalidade, error: modalidadeError } = await s
      .from('dr_arbitro_modalidades')
      .select('id,codigo,ativo')
      .eq('codigo', modalidadeCodigo)
      .eq('ativo', true)
      .maybeSingle();

    if (modalidadeError) {
      target.innerHTML = `<p class="dr-error">${esc(modalidadeError.message)}</p>`;
      return;
    }
    if (!modalidade) {
      target.innerHTML = '<div class="vazio">O Drº Árbitro não está disponível neste momento.</div>';
      return;
    }

    const { data: edicao, error: edicaoError } = await s
      .from('dr_arbitro_edicoes')
      .select('*')
      .eq('modalidade_id', modalidade.id)
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (edicaoError) {
      target.innerHTML = `<p class="dr-error">${esc(edicaoError.message)}</p>`;
      return;
    }
    if (!edicao) {
      target.innerHTML = '<div class="vazio">Não existe nenhuma edição ativa neste momento.</div>';
      return;
    }

    const { data: inscricao, error: inscricaoError } = await s
      .from('dr_arbitro_inscricoes')
      .select('id,edicao_id')
      .eq('socio_id', currentSocio.id)
      .eq('edicao_id', edicao.id)
      .maybeSingle();

    if (inscricaoError) {
      target.innerHTML = `<p class="dr-error">${esc(inscricaoError.message)}</p>`;
      return;
    }

    const nome = modalidadeCodigo === 'futebol' ? '⚽ Futebol' : '🏆 Futsal';
    target.innerHTML = `
      <article class="dr-socio-modalidade">
        <div class="dr-modalidade-head">
          <h3>Drº Árbitro — ${nome}</h3>
          <span class="dr-badge on">Disponível</span>
        </div>
        <p><strong>${esc(edicao.nome)}</strong></p>
        ${inscricao
          ? '<span class="dr-badge on">Inscrito</span>'
          : edicao.inscricoes_abertas
            ? '<button class="botao dr-inscrever" type="button">Inscrever-me</button>'
            : '<span class="dr-badge off">Inscrições encerradas</span>'}
        <div class="dr-socio-tests"></div>
      </article>
    `;

    const registerButton = $('.dr-inscrever', target);
    if (registerButton) {
      registerButton.addEventListener('click', async () => {
        registerButton.disabled = true;
        try {
          const { data, error } = await s.rpc('dr_arbitro_inscrever', { p_edicao_id: edicao.id });
          if (error) throw error;
          if (data === false) throw new Error('Não foi possível efetuar a inscrição.');
          await loadSocioArea();
        } catch (err) {
          alert(err.message || 'Não foi possível efetuar a inscrição.');
          registerButton.disabled = false;
        }
      });
    }

    await renderSocioTests($('.dr-socio-tests', target), edicao, !!inscricao);
  }

  async function renderSocioTests(target, edicao, inscrito) {
    if (!target) return;
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
      <div class="dr-result-box" data-test-result="${t.id}"></div>
    `).join('') || '<p class="dr-muted">Ainda não existem testes configurados.</p>';

    for (const teste of testes || []) await updateSocioTestAction(teste);
  }

  async function updateSocioTestAction(teste) {
    const s = await client();
    const el = $(`[data-test-action="${teste.id}"]`);
    if (!el || !currentSocio) return;

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

    const now = Date.now();
    const inicio = new Date(teste.inicio_em).getTime();
    const fim = new Date(teste.fim_em).getTime();

    if (tentativa?.submeteu_em) {
      el.innerHTML = `<span class="dr-badge on">${esc(tentativa.nota ?? 0)}/${esc(tentativa.total_perguntas ?? 0)} — ${esc(tentativa.percentagem ?? 0)}%</span>`;
      if (now >= fim) await loadResultSummary(teste.id);
      return;
    }

    if (tentativa && now >= fim) {
      // O backend finaliza a tentativa quando o resultado é consultado.
      try {
        await finalizeExpiredAttempt(tentativa.id);
        return updateSocioTestAction(teste);
      } catch (_) {
        el.innerHTML = '<span class="dr-badge off">Prazo terminado — a calcular resultado</span>';
        return;
      }
    }

    if (tentativa) {
      el.innerHTML = '<span class="dr-badge off">Teste iniciado — não pode voltar a entrar</span>';
      return;
    }

    if (!teste.ativo || now < inicio) {
      el.innerHTML = `<span class="dr-badge off">Inicia ${dateText(teste.inicio_em)}</span>`;
      return;
    }

    if (now >= fim) {
      el.innerHTML = '<span class="dr-badge off">Terminado</span>';
      return;
    }

    el.innerHTML = '<button class="botao" type="button">Iniciar teste</button>';
    el.querySelector('button').addEventListener('click', async () => {
      const button = el.querySelector('button');
      button.disabled = true;
      try {
        const { data, error: rpcError } = await s.rpc('dr_arbitro_iniciar_teste', { p_teste_id: teste.id });
        if (rpcError) throw rpcError;
        currentAttempt = data;
        await openTest(teste, data);
      } catch (err) {
        alert(err.message || 'Não foi possível iniciar o teste.');
        button.disabled = false;
      }
    });
  }

  async function finalizeExpiredAttempt(tentativaId) {
    const s = await client();
    const { data, error } = await s.rpc('dr_arbitro_finalizar_tentativa', { p_tentativa_id: tentativaId });
    if (error) throw error;
    return data;
  }

  async function loadResultSummary(testeId) {
    const el = $(`[data-test-result="${testeId}"]`);
    if (!el) return;
    const s = await client();
    const { data, error } = await s.rpc('dr_arbitro_resultado_teste', { p_teste_id: testeId });
    if (error) {
      // O resultado pode ainda não estar disponível; não estragamos o cartão do teste.
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (!result) return;

    el.innerHTML = `
      <div class="dr-result-card">
        <strong>Resultado</strong>
        <span>Nota: ${esc(result.nota ?? 0)}/${esc(result.total_perguntas ?? 0)}</span>
        <span>Percentagem: ${esc(result.percentagem ?? 0)}%</span>
        <span>Média do teste: ${esc(result.media_teste ?? 0)}%</span>
        <button class="admin-small-btn" type="button" data-show-answers="${testeId}">Ver respostas</button>
        <div class="dr-answers" data-answers="${testeId}"></div>
      </div>
    `;

    $(`[data-show-answers="${testeId}"]`)?.addEventListener('click', () => loadAnswers(testeId));
  }

  async function loadAnswers(testeId) {
    const el = $(`[data-answers="${testeId}"]`);
    if (!el) return;
    const s = await client();
    const { data, error } = await s.rpc('dr_arbitro_resultado_teste', { p_teste_id: testeId });
    if (error) {
      el.innerHTML = `<p class="dr-error">${esc(error.message)}</p>`;
      return;
    }

    el.innerHTML = (data || []).map(q => `
      <div class="dr-answer-row ${q.correta ? 'correct' : 'wrong'}">
        <strong>${esc(q.pergunta_numero)}. ${esc(q.pergunta)}</strong>
        <span>A tua resposta: ${esc(q.resposta_dada || 'Sem resposta')}</span>
        <span>Resposta correta: ${esc(q.resposta_correta)}</span>
      </div>
    `).join('') || '<p class="dr-muted">Não existem respostas disponíveis.</p>';
  }

  async function openTest(teste, tentativaData) {
    const s = await client();
    const tentativaId = tentativaData?.id || tentativaData?.tentativa?.id || tentativaData;
    if (!tentativaId) throw new Error('Tentativa inválida.');

    const { data: perguntas, error } = await s
      .from('dr_arbitro_perguntas_publicas')
      .select('id,numero,pergunta,opcao_a,opcao_b,opcao_c,opcao_d')
      .eq('teste_id', teste.id)
      .order('numero');

    if (error) throw error;
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

      const result = Array.isArray(data) ? data[0] : data;
      if (auto) alert('O tempo terminou. O teste foi submetido automaticamente.');
      else alert(`Teste submetido: ${result?.nota ?? 0}/${result?.total_perguntas ?? perguntas.length}.`);

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
    link.href = 'css/dr-arbitro.css?v=20260812-3';
    link.dataset.drArbitroCss = '1';
    document.head.appendChild(link);
  }

  async function boot() {
    ensureCss();

    try {
      /*
       * admin.html carrega este ficheiro com `defer`.
       * Um script defer já é executado depois de o HTML ter sido
       * totalmente analisado. Esperar aqui pelo DOMContentLoaded cria
       * uma espera circular: o próprio script bloqueia o evento que
       * está à espera.
       */
      await client();

      if (/\/admin\.html$/i.test(location.pathname)) {
        // O admin.js é a única autoridade para arrancar o módulo no modo
        // administrador. Evitamos aqui uma segunda via de inicialização.
      }

      if (/\/socio\.html$/i.test(location.pathname)) {
        for (let tentativa = 0; tentativa < 120; tentativa++) {
          if ($('#dashboard') && $('.socio-tabs')) {
            await socioInit();
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    } catch (error) {
      console.error('Drº Árbitro: não foi possível inicializar.', error);
    }
  }

  boot();
})();
