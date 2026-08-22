import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET = 'questoes-socios';
const $ = (id) => document.getElementById(id);
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[c]));

/*
 * CORREÇÃO CIRÚRGICA DE ESTRUTURA
 *
 * A caixa "Questões dos sócios" TEM de ser filha de #panel-questoes.
 * Algumas versões anteriores do admin.html deixaram a caixa dentro de
 * #panel-socios, fazendo-a aparecer mesmo quando a aba "Sócios" estava ativa.
 *
 * Esta função corrige também instalações que ainda tenham o HTML antigo em
 * cache: procura a caixa pelo ID/classe, garante o painel e move a caixa para
 * o local certo. Não altera a lógica de sócios, quotas ou Drº Árbitro.
 */
function ensureQuestionsPlacement() {
  const app = $('admin-app');
  const tabs = document.querySelector('.admin-tabs');
  if (!app || !tabs) return null;

  let panel = $('panel-questoes');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'panel-questoes';
    panel.className = 'admin-tab-panel';
    const drPanel = $('panel-dr-arbitro');
    if (drPanel && drPanel.parentElement === app) {
      drPanel.insertAdjacentElement('afterend', panel);
    } else {
      app.appendChild(panel);
    }
  }

  // Aceita tanto a versão correta como a versão antiga que tinha a caixa em Sócios.
  const cards = Array.from(document.querySelectorAll('#admin-questoes-card, .admin-questoes-card'));
  let card = cards.find((el) => el.id === 'admin-questoes-card') || cards[0] || null;

  if (card) {
    // Remove duplicados, se uma versão antiga tiver criado mais do que uma caixa.
    cards.filter((el) => el !== card).forEach((el) => el.remove());

    // Movimento decisivo: a caixa passa obrigatoriamente para a aba Questões.
    if (card.parentElement !== panel) panel.appendChild(card);
  }

  let tab = tabs.querySelector('.admin-tab[data-panel="questoes"]');
  if (!tab) {
    tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'admin-tab';
    tab.dataset.panel = 'questoes';
    tab.textContent = 'Questões';
    tabs.appendChild(tab);
  }

  return { panel, tab };
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? null : (data?.signedUrl || null);
}

async function uploadPdf(file, path) {
  if (!file || file.type !== 'application/pdf') throw new Error('O ficheiro de resposta tem de ser PDF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('O PDF não pode ultrapassar 10 MB.');
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    upsert: false
  });
  if (error) throw error;
}

async function loadQuestions() {
  // Reforça a colocação antes de renderizar os dados.
  ensureQuestionsPlacement();

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

    const ids = [...new Set((questions || []).map(q => q.socio_id))];
    const { data: members } = ids.length
      ? await supabase.from('socios').select('id,nome,numero_socio,email').in('id', ids)
      : { data: [] };
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

function init() {
  const structure = ensureQuestionsPlacement();
  const list = $('admin-questoes-list');
  if (!structure || !list || list.dataset.bound === '1') return;

  list.dataset.bound = '1';
  structure.tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.admin-tab-panel').forEach(x => x.classList.remove('active'));
    structure.tab.classList.add('active');
    structure.panel.classList.add('active');
  });

  $('questoes-admin-refresh')?.addEventListener('click', loadQuestions);
  loadQuestions();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
