import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[c]));

let activeEdition = null;
let currentAttempt = null;

function injectStyles() {
  if ($('#dr-arbitro-runtime-css')) return;
  const style = document.createElement('style');
  style.id = 'dr-arbitro-runtime-css';
  style.textContent = `
    .dr-arbitro-box{display:grid;gap:18px}
    .dr-card{border:1px solid rgba(0,0,0,.1);border-radius:16px;padding:20px;background:var(--card-bg,#fff)}
    .dr-tests{display:grid;gap:12px}
    .dr-test{display:flex;justify-content:space-between;gap:15px;align-items:center;border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:14px}
    .dr-muted{opacity:.7}
    .dr-question{padding:18px;border:1px solid rgba(0,0,0,.08);border-radius:14px;margin-bottom:12px}
    .dr-options{display:grid;gap:8px;margin-top:12px}
    .dr-option{display:flex;gap:9px;align-items:flex-start;padding:10px;border-radius:10px;background:rgba(0,0,0,.025)}
    .dr-admin-grid{display:grid;gap:12px}
    .dr-admin-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px;border:1px solid rgba(0,0,0,.08);border-radius:12px}
    .dr-result{font-size:1.15rem;font-weight:700;padding:16px;border-radius:12px;background:rgba(0,120,70,.08)}
  `;
  document.head.appendChild(style);
}

function ensureUI() {
  const tabs = document.querySelector('.socio-tabs');
  if (tabs && !tabs.querySelector('[data-tab="dr-arbitro"]')) {
    const button = document.createElement('button');
    button.className = 'socio-tab';
    button.type = 'button';
    button.dataset.tab = 'dr-arbitro';
    button.textContent = 'Drº Árbitro';
    const before = tabs.querySelector('[data-tab="quotas"]');
    tabs.insertBefore(button, before || null);
  }

  const dashboard = $('#dashboard');
  if (dashboard && !$('#dr-arbitro')) {
    const section = document.createElement('section');
    section.className = 'socio-tab-content';
    section.id = 'dr-arbitro';
    section.innerHTML = `
      <div class="tab-heading-row">
        <div>
          <h2>Drº Árbitro</h2>
          <p>Testes e avaliação de conhecimentos de arbitragem.</p>
        </div>
      </div>
      <div id="dr-arbitro-content" class="dr-arbitro-box">
        <div class="vazio">A carregar…</div>
      </div>`;
    $('#quotas')?.parentNode?.insertBefore(section, $('#quotas'));
  }

  const admin = $('#admin-panel');
  if (admin && !$('#dr-admin-panel')) {
    const box = document.createElement('div');
    box.className = 'admin-subpanel';
    box.id = 'dr-admin-panel';
    box.innerHTML = `
      <h3>Drº Árbitro</h3>
      <p>Controla se a funcionalidade aparece aos sócios e se as inscrições estão abertas.</p>
      <div id="dr-admin-content"><div class="vazio">A carregar…</div></div>`;
    admin.insertBefore(box, admin.firstChild);
  }
}

async function activeEdition() {
  const {data,error} = await client
    .from('dr_arbitro_edicoes')
    .select('*')
    .eq('ativo',true)
    .order('created_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(error) throw error;
  return data;
}

async function renderMember() {
  const root = $('#dr-arbitro-content');
  if (!root) return;

  try {
    activeEdition = await activeEdition();

    if (!activeEdition) {
      const tab = document.querySelector('[data-tab="dr-arbitro"]');
      if (tab) tab.hidden = true;
      root.innerHTML = `
        <div class="dr-card">
          <strong>Drº Árbitro indisponível.</strong>
          <p class="dr-muted">O administrador ainda não ativou uma edição.</p>
        </div>`;
      return;
    }

    const tab = document.querySelector('[data-tab="dr-arbitro"]');
    if (tab) tab.hidden = false;

    const {data:tests,error} = await client
      .from('dr_arbitro_testes')
      .select('*')
      .eq('edicao_id',activeEdition.id)
      .eq('ativo',true)
      .order('numero_teste');

    if(error) throw error;

    root.innerHTML = `
      <div class="dr-card">
        <h3>${esc(activeEdition.nome)}</h3>
        <p>${activeEdition.inscricoes_abertas ? 'Inscrições abertas.' : 'Inscrições fechadas.'}</p>
        ${activeEdition.inscricoes_abertas
          ? '<button class="botao" id="dr-inscrever">Inscrever-me</button>'
          : ''}
      </div>
      <div class="dr-tests" id="dr-tests"></div>`;

    $('#dr-inscrever')?.addEventListener('click', async () => {
      try {
        await client.rpc('dr_arbitro_inscrever',{p_edicao_id:activeEdition.id});
        await renderMember();
      } catch(e) {
        alert(e.message || e);
      }
    });

    const list = $('#dr-tests');
    if (!tests?.length) {
      list.innerHTML = '<div class="dr-card dr-muted">Ainda não existem testes ativos nesta edição.</div>';
      return;
    }

    list.innerHTML = tests.map(t => `
      <div class="dr-test">
        <div>
          <strong>Teste ${esc(t.numero_teste)} — ${esc(t.titulo || '')}</strong>
          <div class="dr-muted">
            ${t.inicio_em ? new Date(t.inicio_em).toLocaleString('pt-PT') : ''}
            ${t.fim_em ? ' · ' + new Date(t.fim_em).toLocaleString('pt-PT') : ''}
          </div>
        </div>
        <button class="botao" data-dr-test="${esc(t.id)}">Iniciar</button>
      </div>`).join('');

    list.querySelectorAll('[data-dr-test]').forEach(btn => {
      btn.addEventListener('click', () => startTest(btn.dataset.drTest));
    });
  } catch(e) {
    console.error(e);
    root.innerHTML = `<div class="dr-card">Não foi possível carregar o Drº Árbitro.<br><small>${esc(e.message)}</small></div>`;
  }
}

async function startTest(testId) {
  try {
    const {data,error} = await client.rpc('dr_arbitro_iniciar_teste',{p_teste_id:testId});
    if(error) throw error;
    currentAttempt = data;
    await renderTest(testId);
  } catch(e) {
    alert(e.message || e);
  }
}

async function renderTest(testId) {
  const root = $('#dr-arbitro-content');
  const {data:questions,error} = await client
    .from('dr_arbitro_perguntas')
    .select('*')
    .eq('teste_id',testId)
    .order('numero');

  if(error) throw error;

  if(!questions?.length) {
    root.innerHTML = '<div class="dr-card">Este teste ainda não tem perguntas.</div>';
    return;
  }

  root.innerHTML = `
    <div class="dr-card">
      <h3>Teste de conhecimentos</h3>
      <form id="dr-test-form">
        ${questions.map(q => `
          <fieldset class="dr-question">
            <legend><strong>${esc(q.numero)}. ${esc(q.pergunta)}</strong></legend>
            <div class="dr-options">
              ${[['A',q.opcao_a],['B',q.opcao_b],['C',q.opcao_c],['D',q.opcao_d]]
                .filter(x => x[1])
                .map(x => `
                  <label class="dr-option">
                    <input type="radio" name="q_${esc(q.id)}" value="${x[0]}">
                    <span><strong>${x[0]}</strong> — ${esc(x[1])}</span>
                  </label>`).join('')}
            </div>
          </fieldset>`).join('')}
        <button class="botao" type="submit">Submeter teste</button>
      </form>
    </div>`;

  $('#dr-test-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const answers = {};
    questions.forEach(q => {
      const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
      answers[q.id] = selected?.value || null;
    });

    try {
      const {data,error} = await client.rpc('dr_arbitro_submeter_teste',{
        p_tentativa_id:currentAttempt,
        p_respostas:answers
      });
      if(error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      root.innerHTML = `
        <div class="dr-result">
          Resultado: ${esc(result?.nota ?? 0)} / ${esc(result?.total_perguntas ?? questions.length)}
          — ${esc(result?.percentagem ?? 0)}%
        </div>`;
    } catch(e) {
      alert(e.message || e);
    }
  });
}

async function renderAdmin() {
  const root = $('#dr-admin-content');
  if(!root) return;

  try {
    const {data:editions,error} = await client
      .from('dr_arbitro_edicoes')
      .select('*')
      .order('created_at',{ascending:false});

    if(error) throw error;

    if(!editions?.length) {
      root.innerHTML = '<div class="dr-card dr-muted">Não existem edições criadas.</div>';
      return;
    }

    root.innerHTML = `<div class="dr-admin-grid">${
      editions.map(e => `
        <div class="dr-admin-row">
          <div>
            <strong>${esc(e.nome)}</strong>
            <div>${e.ativo ? 'Ativo' : 'Inativo'} · ${e.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas'}</div>
          </div>
          <div>
            <button class="admin-small-btn" data-dr-active="${e.id}" data-value="${!e.ativo}">
              ${e.ativo ? 'Desativar' : 'Ativar'}
            </button>
            <button class="admin-small-btn" data-dr-ins="${e.id}" data-value="${!e.inscricoes_abertas}">
              ${e.inscricoes_abertas ? 'Fechar inscrições' : 'Abrir inscrições'}
            </button>
          </div>
        </div>`).join('')
    }</div>`;

    root.querySelectorAll('[data-dr-active]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await client.rpc('dr_arbitro_admin_definir_ativo',{
            p_edicao_id:btn.dataset.drActive,
            p_ativo:btn.dataset.value === 'true'
          });
          await renderAdmin();
          await renderMember();
        } catch(e) {
          alert(e.message || e);
        }
      });
    });

    root.querySelectorAll('[data-dr-ins]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await client.rpc('dr_arbitro_admin_definir_inscricoes',{
            p_edicao_id:btn.dataset.drIns,
            p_abertas:btn.dataset.value === 'true'
          });
          await renderAdmin();
          await renderMember();
        } catch(e) {
          alert(e.message || e);
        }
      });
    });
  } catch(e) {
    root.innerHTML = `<div class="dr-card">Erro no painel Drº Árbitro: ${esc(e.message)}</div>`;
  }
}

async function start() {
  injectStyles();
  ensureUI();
  await renderMember();

  const {data:{user}} = await client.auth.getUser();
  if(user) {
    const {data:isAdmin} = await client.rpc('is_admin');
    if(isAdmin === true) await renderAdmin();
  }
}

window.NAF_DR_ARBITRO_START = start;
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded',start,{once:true});
} else {
  start();
}
