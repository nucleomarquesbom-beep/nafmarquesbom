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

function boot() {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'css/questoes-socios.css?v=20260822-1';
  document.head.appendChild(stylesheet);

  initMemberQuestions();
  ensureObservadorOption();

  const observer = new MutationObserver(() => {
    initMemberQuestions();
    ensureObservadorOption();
    });
  observer.observe(document.body, { childList: true, subtree: true });

  supabase.auth.onAuthStateChange(() => {
    socioCache = null;
    setTimeout(() => {
      initMemberQuestions();
      ensureObservadorOption();
      if ($('questoes')?.classList.contains('active')) loadMemberQuestions();
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
