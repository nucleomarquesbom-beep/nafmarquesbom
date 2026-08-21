import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'questoes-socios';
const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[c]));

let socioCache = null;
let adminLoaded = false;

async function getSocio() {
  if (socioCache) return socioCache;
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('socios')
    .select('id,nome,numero_socio,email,ativo,is_admin')
    .eq('user_id', user.id)
    .eq('ativo', true)
    .single();

  if (error) throw error;
  socioCache = data;
  return data;
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl || null;
}

async function uploadPdf(file, path) {
  if (!file) return null;
  if (file.type !== 'application/pdf') throw new Error('O ficheiro tem de ser PDF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('O PDF não pode ultrapassar 10 MB.');

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw error;
  return path;
}

function showResult(message, type = 'success') {
  const el = $('questao-result');
  if (!el) return;
  el.textContent = message;
  el.className = `admin-result ${type}`;
  el.hidden = false;
}

async function loadMemberQuestions() {
  const list = $('questoes-list');
  if (!list) return;

  try {
    const socio = await getSocio();
    if (!socio) {
      list.innerHTML = '<div class="vazio">Inicie sessão para consultar as suas questões.</div>';
      return;
    }

    const { data, error } = await supabase
      .from('questoes_socios')
      .select('*')
      .eq('socio_id', socio.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data?.length) {
      list.innerHTML = '<div class="vazio">Ainda não colocou nenhuma questão.</div>';
      return;
    }

    const cards = [];
    for (const question of data) {
      const questionUrl = await signedUrl(question.anexo_storage_path);
      const answerUrl = await signedUrl(question.resposta_storage_path);
      const answered = question.estado === 'respondida';

      cards.push(`
        <article class="questao-card">
          <div class="questao-card-head">
            <strong>Questão</strong>
            <span>${question.created_at ? new Date(question.created_at).toLocaleString('pt-PT') : ''}</span>
          </div>
          <div class="questao-texto">
            ${question.texto
              ? esc(question.texto).replace(/\n/g, '<br>')
              : '<em>Questão enviada através de PDF.</em>'}
          </div>
          ${questionUrl ? `<a class="questao-file" href="${questionUrl}" target="_blank" rel="noopener">📎 Abrir PDF da questão</a>` : ''}
          ${answered ? `
            <div class="questao-resposta">
              <div class="questao-card-head">
                <strong>Resposta do Núcleo</strong>
                <span>${question.respondido_em ? new Date(question.respondido_em).toLocaleString('pt-PT') : ''}</span>
              </div>
              <div class="questao-texto">
                ${question.resposta_texto
                  ? esc(question.resposta_texto).replace(/\n/g, '<br>')
                  : '<em>Foi anexado um PDF de resposta.</em>'}
              </div>
              ${answerUrl ? `<a class="questao-file" href="${answerUrl}" target="_blank" rel="noopener">📎 Abrir PDF da resposta</a>` : ''}
            </div>
          ` : '<div class="questao-pendente">A aguardar resposta do Núcleo.</div>'}
        </article>
      `);
    }

    list.innerHTML = cards.join('');
  } catch (error) {
    console.error('Questões do sócio:', error);
    list.innerHTML = `<div class="vazio">${esc(error?.message || 'Não foi possível carregar as questões.')}</div>`;
  }
}

async function sendQuestion(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const text = $('questao-texto')?.value.trim() || '';
  const file = $('questao-pdf')?.files?.[0] || null;

  try {
    const socio = await getSocio();
    if (!socio) throw new Error('Inicie sessão para enviar uma questão.');
    if (!text && !file) throw new Error('Escreva a questão ou carregue um PDF.');

    button.disabled = true;
    button.textContent = 'A enviar…';

    const id = crypto.randomUUID();
    const path = file ? `${socio.id}/${id}.pdf` : null;
    if (file) await uploadPdf(file, path);

    const { error } = await supabase.rpc('socio_criar_questao', {
      p_id: id,
      p_texto: text || null,
      p_anexo_storage_path: path,
      p_anexo_nome: file?.name || null
    });

    if (error) throw error;

    form.reset();
    showResult('Questão enviada. O Núcleo foi notificado por email.', 'success');
    await loadMemberQuestions();
  } catch (error) {
    console.error('Enviar questão:', error);
    showResult(error?.message || 'Não foi possível enviar a questão.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar questão';
  }
}

function ensureObservadorOption() {
  const select = $('edit-categoria');
  if (!select) return;
  if (![...select.options].some((option) => option.value.toLowerCase() === 'observador')) {
    const option = document.createElement('option');
    option.value = 'Observador';
    option.textContent = 'Observador';
    select.appendChild(option);
  }
}

function initMemberQuestions() {
  const form = $('questao-form');
  if (!form || form.dataset.bound === '1') return;
  form.dataset.bound = '1';
  form.addEventListener('submit', sendQuestion);
  ensureObservadorOption();
}

function ensureAdminCard() {
  const panel = document.querySelector('#panel-socios');
  if (!panel || $('admin-questoes-card')) return;

  const card = document.createElement('section');
  card.id = 'admin-questoes-card';
  card.className = 'admin-card admin-questoes-card';
  card.innerHTML = `
    <div class="admin-card-header">
      <div>
        <span class="admin-badge">Questões</span>
        <h3>Questões dos sócios</h3>
        <p class="admin-help">Consulte as questões recebidas e responda por texto, PDF ou pelos dois meios.</p>
      </div>
      <button id="questoes-admin-refresh" class="admin-small-btn" type="button">Atualizar</button>
    </div>
    <div id="admin-questoes-list"><div class="admin-loading">A carregar…</div></div>
  `;

  panel.appendChild(card);
  $('questoes-admin-refresh').addEventListener('click', loadAdminQuestions);
  loadAdminQuestions();
}

async function loadAdminQuestions() {
  const list = $('admin-questoes-list');
  if (!list) return;

  try {
    const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin_user');
    if (adminError) throw adminError;
    if (isAdmin !== true) {
      list.innerHTML = '<div class="vazio">Acesso reservado a administradores.</div>';
      return;
    }

    const { data: questions, error } = await supabase
      .from('questoes_socios')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const ids = [...new Set((questions || []).map((q) => q.socio_id))];
    const { data: members } = ids.length
      ? await supabase.from('socios').select('id,nome,numero_socio,email').in('id', ids)
      : { data: [] };
    const memberMap = new Map((members || []).map((member) => [member.id, member]));

    if (!questions?.length) {
      list.innerHTML = '<div class="vazio">Não existem questões colocadas pelos sócios.</div>';
      return;
    }

    const blocks = [];
    for (const question of questions) {
      const member = memberMap.get(question.socio_id) || {};
      const questionUrl = await signedUrl(question.anexo_storage_path);
      const answerUrl = await signedUrl(question.resposta_storage_path);
      const answered = question.estado === 'respondida';

      blocks.push(`
        <article class="admin-questao-item" data-id="${esc(question.id)}">
          <div class="admin-questao-meta">
            <strong>${esc(member.numero_socio)} — ${esc(member.nome || 'Sócio')}</strong>
            <span>${question.created_at ? new Date(question.created_at).toLocaleString('pt-PT') : ''}</span>
            <b class="${answered ? 'respondida' : 'aberta'}">${answered ? 'Respondida' : 'Aberta'}</b>
          </div>
          <div class="admin-questao-body">
            ${question.texto
              ? esc(question.texto).replace(/\n/g, '<br>')
              : '<em>Questão enviada através de PDF.</em>'}
          </div>
          ${questionUrl ? `<a class="questao-file" href="${questionUrl}" target="_blank" rel="noopener">📎 Abrir PDF da questão</a>` : ''}
          ${answered && answerUrl ? `<div class="admin-questao-current-answer"><strong>PDF de resposta atual:</strong> <a href="${answerUrl}" target="_blank" rel="noopener">Abrir PDF</a></div>` : ''}
          <div class="admin-questao-response">
            <label>Resposta por texto
              <textarea class="admin-questao-answer" rows="5" placeholder="Escreva a resposta ao sócio…">${esc(question.resposta_texto || '')}</textarea>
            </label>
            <label>PDF de resposta (opcional)
              <input class="admin-questao-pdf" type="file" accept="application/pdf">
            </label>
            <button type="button" class="admin-small-btn primary admin-questao-send">${answered ? 'Atualizar resposta' : 'Responder ao sócio'}</button>
            <div class="admin-questao-result" hidden></div>
          </div>
        </article>
      `);
    }

    list.innerHTML = blocks.join('');
    list.querySelectorAll('.admin-questao-item').forEach((card) => {
      card.querySelector('.admin-questao-send')?.addEventListener('click', () => respondToQuestion(card));
    });
  } catch (error) {
    console.error('Questões administrativas:', error);
    list.innerHTML = `<div class="vazio">${esc(error?.message || 'Não foi possível carregar as questões.')}</div>`;
  }
}

async function respondToQuestion(card) {
  const questionId = card.dataset.id;
  const text = card.querySelector('.admin-questao-answer')?.value.trim() || '';
  const file = card.querySelector('.admin-questao-pdf')?.files?.[0] || null;
  const button = card.querySelector('.admin-questao-send');
  const result = card.querySelector('.admin-questao-result');

  try {
    if (!text && !file) throw new Error('Escreva uma resposta ou anexe um PDF.');
    if (file && file.type !== 'application/pdf') throw new Error('O ficheiro de resposta tem de ser PDF.');
    if (file && file.size > 10 * 1024 * 1024) throw new Error('O PDF não pode ultrapassar 10 MB.');

    button.disabled = true;
    button.textContent = 'A enviar…';

    let responsePath = null;
    if (file) {
      responsePath = `admin/${questionId}-${crypto.randomUUID()}.pdf`;
      await uploadPdf(file, responsePath);
    }

    const { error } = await supabase.rpc('admin_responder_questao', {
      p_questao_id: questionId,
      p_resposta_texto: text || null,
      p_resposta_storage_path: responsePath,
      p_resposta_nome: file?.name || null
    });
    if (error) throw error;

    result.textContent = 'Resposta registada e email colocado na fila de envio.';
    result.className = 'admin-result success';
    result.hidden = false;
    await loadAdminQuestions();
  } catch (error) {
    console.error('Responder questão:', error);
    result.textContent = error?.message || 'Não foi possível responder à questão.';
    result.className = 'admin-result error';
    result.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Responder ao sócio';
  }
}

function boot() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/questoes-socios.css?v=20260822-1';
  document.head.appendChild(stylesheet);

  initMemberQuestions();
  ensureObservadorOption();
  ensureAdminCard();

  const observer = new MutationObserver(() => {
    initMemberQuestions();
    ensureObservadorOption();
    ensureAdminCard();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  supabase.auth.onAuthStateChange(() => {
    socioCache = null;
    setTimeout(() => {
      initMemberQuestions();
      ensureObservadorOption();
      if ($('questoes')?.classList.contains('active')) loadMemberQuestions();
      ensureAdminCard();
    }, 50);
  });

  document.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-tab="questoes"]');
    if (tab) setTimeout(loadMemberQuestions, 0);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
