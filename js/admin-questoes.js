import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'questoes-socios';
const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[c]));

/*
 * A estrutura da aba pertence ao admin.html.
 * Este módulo NÃO cria abas, NÃO move cartões e NÃO altera o painel Sócios.
 * Existe exatamente um #panel-questoes e um #admin-questoes-card no HTML.
 */
function getQuestionsPanel() {
  const panel = $('panel-questoes');
  const card = $('admin-questoes-card');
  if (!panel || !card) return null;

  // Proteção contra versões antigas/caches que possam ter duplicado o cartão.
  // O módulo atual nunca cria um segundo cartão; se houver cópias com o mesmo
  // ID no DOM, mantém apenas o primeiro dentro do painel oficial.
  const cards = [...document.querySelectorAll('#admin-questoes-card')];
  const official = cards.find((el) => el.parentElement === panel) || card;
  cards.filter((el) => el !== official).forEach((el) => el.remove());
  if (official.parentElement !== panel) panel.appendChild(official);

  return panel;
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? null : (data?.signedUrl || null);
}

async function uploadPdf(file, path) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('O ficheiro de resposta tem de ser PDF.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O PDF não pode ultrapassar 10 MB.');
  }
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false
  });
  if (error) throw error;
}

async function loadQuestions() {
  getQuestionsPanel();

  const list = $('admin-questoes-list');
  if (!list) return;

  list.innerHTML = '<div class="admin-loading">A carregar…</div>';

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

    const ids = [...new Set((questions || []).map(q => q.socio_id).filter(Boolean))];
    const { data: members, error: membersError } = ids.length
      ? await supabase.from('socios').select('id,nome,numero_socio,email').in('id', ids)
      : { data: [], error: null };
    if (membersError) throw membersError;

    const memberMap = new Map((members || []).map(m => [m.id, m]));

    if (!questions?.length) {
      list.innerHTML = '<div class="vazio">Não existem questões colocadas pelos sócios.</div>';
      return;
    }

    const html = [];
    for (const q of questions) {
      const member = memberMap.get(q.socio_id) || {};
      const questionUrl = await signedUrl(q.anexo_storage_path);
      const answerUrl = await signedUrl(q.resposta_storage_path);
      const answered = q.estado === 'respondida';

      html.push(`
        <article class="admin-questao-item" data-id="${esc(q.id)}">
          <div class="admin-questao-meta">
            <strong>${esc(member.numero_socio)} — ${esc(member.nome || 'Sócio')}</strong>
            <span>${q.created_at ? new Date(q.created_at).toLocaleString('pt-PT') : ''}</span>
            <b class="${answered ? 'respondida' : 'aberta'}">${answered ? 'Respondida' : 'Aberta'}</b>
          </div>
          <div class="admin-questao-body">${q.texto ? esc(q.texto).replace(/\n/g, '<br>') : '<em>Questão enviada através de PDF.</em>'}</div>
          ${questionUrl ? `<a class="questao-file" href="${questionUrl}" target="_blank" rel="noopener">📎 Abrir PDF da questão</a>` : ''}
          ${answered && answerUrl ? `<div class="admin-questao-current-answer"><strong>PDF de resposta atual:</strong> <a href="${answerUrl}" target="_blank" rel="noopener">Abrir PDF</a></div>` : ''}
          <div class="admin-questao-response">
            <label>Resposta por texto<textarea class="admin-questao-answer" rows="5" placeholder="Escreva a resposta ao sócio…">${esc(q.resposta_texto || '')}</textarea></label>
            <label>PDF de resposta (opcional)<input class="admin-questao-pdf" type="file" accept="application/pdf"></label>
            <button type="button" class="admin-small-btn primary admin-questao-send">${answered ? 'Atualizar resposta' : 'Responder ao sócio'}</button>
            <div class="admin-questao-result" hidden></div>
          </div>
        </article>`);
    }

    list.innerHTML = html.join('');
    list.querySelectorAll('.admin-questao-item').forEach(card => {
      card.querySelector('.admin-questao-send')?.addEventListener('click', () => respond(card));
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="vazio">${esc(error?.message || 'Não foi possível carregar as questões.')}</div>`;
  }
}

async function respond(card) {
  const id = card.dataset.id;
  const text = card.querySelector('.admin-questao-answer')?.value.trim() || '';
  const file = card.querySelector('.admin-questao-pdf')?.files?.[0] || null;
  const button = card.querySelector('.admin-questao-send');
  const result = card.querySelector('.admin-questao-result');

  try {
    if (!text && !file) throw new Error('Escreva uma resposta ou anexe um PDF.');
    button.disabled = true;
    button.textContent = 'A enviar…';

    let path = null;
    if (file) {
      path = `admin/${id}-${crypto.randomUUID()}.pdf`;
      await uploadPdf(file, path);
    }

    const { error } = await supabase.rpc('admin_responder_questao', {
      p_questao_id: id,
      p_resposta_texto: text || null,
      p_resposta_storage_path: path,
      p_resposta_nome: file?.name || null
    });
    if (error) throw error;

    result.textContent = 'Resposta registada e email colocado na fila de envio.';
    result.className = 'admin-result success';
    result.hidden = false;
    await loadQuestions();
  } catch (error) {
    result.textContent = error?.message || 'Não foi possível responder à questão.';
    result.className = 'admin-result error';
    result.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Responder ao sócio';
  }
}

// Disponibilizado para páginas integradas que já tenham o painel dentro do DOM.
window.loadAdminQuestions = loadQuestions;

function init() {
  const panel = getQuestionsPanel();
  const list = $('admin-questoes-list');
  if (!panel || !list || list.dataset.bound === '1') return;

  list.dataset.bound = '1';
  $('questoes-admin-refresh')?.addEventListener('click', loadQuestions);
  loadQuestions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
