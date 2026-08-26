(() => {
  'use strict';

  let sb = null;
  let socio = null;
  let actions = [];

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[c]));
  const d = v => v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-PT') : '—';
  const dt = v => v ? new Date(v).toLocaleString('pt-PT') : '—';

  function ensureActionAdminStyle() {
    if (document.getElementById('naf-acoes-final-style')) return;
    const style = document.createElement('style');
    style.id = 'naf-acoes-final-style';
    style.textContent = '.acao-admin-buttons .admin-small-btn.danger{border-color:#b42318;background:#fff;color:#b42318}.acao-admin-buttons .admin-small-btn.danger:hover{background:#fff1f0}';
    document.head.appendChild(style);
  }

  function msg(text, type = 'sucesso') {
    const el = $('acoes-socio-result');
    if (!el) return;
    el.textContent = text;
    el.className = `socio-message ${type}`;
    el.hidden = false;
  }

  function ensureTab() {
    let tab = $('acoes-tab');
    const panel = $('acoes');
    if (!panel) return false;

    if (!tab) {
      const nav = document.querySelector('.socio-tabs, .socio-tab-list, .socio-navigation, .socio-nav');
      if (nav) {
        tab = document.createElement('button');
        tab.id = 'acoes-tab';
        tab.type = 'button';
        tab.className = 'socio-tab';
        tab.dataset.tab = 'acoes';
        tab.textContent = 'Ações';
        nav.appendChild(tab);
      }
    }

    if (!tab) return false;
    tab.hidden = false;
    tab.removeAttribute('aria-hidden');
    return true;
  }

  function syncMobileSelector() {
    const select = $('socio-tab-select');
    if (!select) return;
    const tabs = [...document.querySelectorAll('.socio-tab')].filter(x => !x.hidden);
    const current = select.value;
    select.innerHTML = tabs.map(b => `<option value="${esc(b.dataset.tab)}">${esc(b.textContent.trim())}</option>`).join('');
    if ([...select.options].some(o => o.value === current)) select.value = current;
  }

  function showTab(visible) {
    const tab = $('acoes-tab');
    const panel = $('acoes');
    if (tab) tab.hidden = !visible;
    if (panel && visible) panel.removeAttribute('hidden');
    syncMobileSelector();
  }

  async function load() {
    if (!sb) return;
    const sessionResult = await sb.auth.getSession();
    const session = sessionResult.data?.session;
    if (!session) return;

    const memberResult = await sb.from('socios')
      .select('id,numero_socio,nome,email,ativo')
      .eq('user_id', session.user.id)
      .eq('ativo', true)
      .single();
    if (memberResult.error) throw memberResult.error;
    socio = memberResult.data;

    /* A aba existe sempre para um sócio autenticado. Não a escondemos só porque
       não há atividades abertas neste momento. */
    ensureTab();
    showTab(true);

    const activeResult = await sb.from('acoes')
      .select('*')
      .eq('anulada', false)
      .eq('ativa', true)
      .eq('inscricoes_abertas', true)
      .order('data', { ascending: true, nullsFirst: false });
    if (activeResult.error) throw activeResult.error;
    actions = activeResult.data || [];

    /* Não usamos um JOIN com acoes para as inscrições do sócio: uma ação anulada
       pode deixar de ser pública, mas a inscrição histórica continua visível ao
       próprio sócio. */
    const mineResult = await sb.from('acoes_inscricoes')
      .select('id,acao_id,data_inscricao,estado,pagamento_confirmado,comprovativo_nome')
      .eq('socio_id', socio.id)
      .order('data_inscricao', { ascending: false });
    if (mineResult.error) throw mineResult.error;

    const mine = mineResult.data || [];
    const ids = [...new Set(mine.map(r => r.acao_id).filter(Boolean))];
    let historical = [];
    if (ids.length) {
      const historicalResult = await sb.from('acoes')
        .select('id,titulo,descricao,data,hora,local,pagamento_obrigatorio,valor,comprovativo_obrigatorio,ativa,inscricoes_abertas,anulada,anulada_em')
        .in('id', ids);
      if (historicalResult.error) throw historicalResult.error;
      historical = historicalResult.data || [];
    }

    const actionMap = new Map(historical.map(a => [a.id, a]));
    render(actions, mine, actionMap);
  }

  function render(active, mine, actionMap) {
    const available = $('acoes-disponiveis');
    const mineRoot = $('acoes-minhas');
    if (!available || !mineRoot) return;

    const mineMap = new Map(mine.map(x => [x.acao_id, x]));

    available.innerHTML = active.length ? active.map(a => {
      const r = mineMap.get(a.id);
      return `<article class="acao-socio-card">
        <h3>${esc(a.titulo)}</h3>
        <div class="acao-meta">
          <span>📅 ${d(a.data)}</span>
          ${a.hora ? `<span>🕐 ${esc(String(a.hora).slice(0,5))}</span>` : ''}
          ${a.local ? `<span>📍 ${esc(a.local)}</span>` : ''}
        </div>
        <p class="acao-description">${esc(a.descricao || '')}</p>
        <div class="acao-price">${a.pagamento_obrigatorio ? `${Number(a.valor || 0).toFixed(2).replace('.', ',')} €` : 'Inscrição gratuita'}</div>
        ${a.comprovativo_obrigatorio ? '<p class="acao-note">É obrigatório anexar o comprovativo.</p>' : ''}
        ${r ? '<p class="acao-note"><strong>Já está inscrito.</strong> Consulte o estado abaixo.</p>' : `<form class="acao-register-form" data-id="${esc(a.id)}">
          ${a.comprovativo_obrigatorio ? '<label class="acao-file-label">Comprovativo<input type="file" accept=".pdf,.jpg,.jpeg,.png" required></label>' : ''}
          <div class="acao-socio-actions"><button class="botao" type="submit">Inscrever-me</button></div>
        </form>`}
      </article>`;
    }).join('') : '<div class="acao-empty">Neste momento não existem atividades abertas.</div>';

    mineRoot.innerHTML = mine.length ? mine.map(r => {
      const a = actionMap.get(r.acao_id) || {};
      const cancelled = r.estado === 'cancelada';
      const annulled = a.anulada === true;
      return `<article class="acao-socio-card">
        <h3>${esc(a.titulo || 'Atividade')}</h3>
        <div class="acao-meta">
          <span>📅 ${d(a.data)}</span>
          ${a.hora ? `<span>🕐 ${esc(String(a.hora).slice(0,5))}</span>` : ''}
          ${a.local ? `<span>📍 ${esc(a.local)}</span>` : ''}
        </div>
        <p class="acao-note">Inscrito em: ${dt(r.data_inscricao)}</p>
        <p class="acao-note">Pagamento: <strong>${a.pagamento_obrigatorio ? (r.pagamento_confirmado ? 'Confirmado' : 'Pendente') : 'Sem pagamento'}</strong></p>
        <p class="acao-note">Estado: <strong class="acao-status ${esc(r.estado)}">${esc(r.estado)}</strong></p>
        ${annulled ? '<p class="acao-note"><strong>Esta atividade foi anulada.</strong> A sua inscrição permanece no histórico.</p>' : ''}
        ${r.comprovativo_nome ? `<p class="acao-note">Comprovativo: ${esc(r.comprovativo_nome)}</p>` : ''}
        ${!cancelled && !annulled ? `<div class="acao-socio-actions"><button class="botao-secundario" data-cancel="${esc(r.id)}">Cancelar inscrição</button></div>` : ''}
      </article>`;
    }).join('') : '<div class="acao-empty">Ainda não está inscrito em nenhuma atividade.</div>';

    document.querySelectorAll('.acao-register-form').forEach(form => {
      form.onsubmit = e => { e.preventDefault(); register(form.dataset.id, form); };
    });
    document.querySelectorAll('[data-cancel]').forEach(button => {
      button.onclick = () => cancel(button.dataset.cancel);
    });
  }

  async function register(id, form) {
    const a = actions.find(x => x.id === id);
    const button = form.querySelector('button');
    if (!a || !button) return;
    button.disabled = true;
    try {
      const file = form.querySelector('input[type=file]')?.files?.[0];
      if (a.comprovativo_obrigatorio && !file) throw new Error('É obrigatório anexar o comprovativo.');
      if (file && (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
        throw new Error('Comprovativo: PDF/JPG/PNG até 10 MB.');
      }

      const inserted = await sb.from('acoes_inscricoes')
        .insert({ acao_id: id, socio_id: socio.id, estado: 'pendente', pagamento_confirmado: !a.pagamento_obrigatorio })
        .select('id').single();
      if (inserted.error) {
        if (inserted.error.code === '23505') throw new Error('Já está inscrito nesta atividade.');
        throw inserted.error;
      }

      if (file) {
        const path = `${socio.id}/${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}`;
        const upload = await sb.storage.from('comprovativos-acoes').upload(path, file, { contentType: file.type });
        if (upload.error) {
          await sb.from('acoes_inscricoes').delete().eq('id', inserted.data.id);
          throw upload.error;
        }
        const update = await sb.from('acoes_inscricoes').update({
          comprovativo_path: path,
          comprovativo_nome: file.name,
          comprovativo_tipo: file.type,
          comprovativo_tamanho: file.size
        }).eq('id', inserted.data.id).eq('socio_id', socio.id);
        if (update.error) throw update.error;
      }

      msg('Inscrição realizada com sucesso.');
      await load();
    } catch (e) {
      console.error('[AÇÕES SÓCIO]', e);
      msg(e.message || String(e), 'erro');
    } finally {
      button.disabled = false;
    }
  }

  async function cancel(id) {
    if (!window.confirm('Tem a certeza de que pretende cancelar esta inscrição?')) return;
    const r = await sb.from('acoes_inscricoes')
      .update({ estado: 'cancelada' })
      .eq('id', id)
      .eq('socio_id', socio.id);
    if (r.error) msg(r.error.message, 'erro');
    else { msg('Inscrição cancelada.'); await load(); }
  }

  /*
   * Correção administrativa sem reescrever o módulo administrativo existente:
   * adiciona o botão Anular ação depois de o painel Ações ser renderizado.
   */
  async function annulAction(id) {
    if (!sb || !id) return;
    if (!confirm('Tem a certeza de que pretende ANULAR esta atividade?\n\nA atividade será fechada e ficará preservada no histórico. As inscrições não serão apagadas.')) return;
    const r = await sb.from('acoes').update({
      anulada: true,
      anulada_em: new Date().toISOString(),
      ativa: false,
      inscricoes_abertas: false
    }).eq('id', id);
    if (r.error) {
      console.error('[AÇÕES ADMIN] anulação:', r.error);
      alert(r.error.message);
      return;
    }
    msg('Atividade anulada. O histórico foi preservado.');
    await window.loadAcoesAdmin?.();
  }

  function installAdminAnnulButtons() {
    const root = $('acoes-admin-list');
    if (!root) return;
    root.querySelectorAll('.acao-admin-item').forEach(item => {
      const toggle = item.querySelector('[data-action-toggle]');
      const id = toggle?.dataset.actionToggle;
      if (!id || item.querySelector('[data-action-annul]')) return;
      const badges = [...item.querySelectorAll('.acao-badge')].map(x => x.textContent.toLowerCase()).join(' ');
      if (badges.includes('anulada')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-small-btn danger';
      button.dataset.actionAnnul = id;
      button.textContent = 'Anular ação';
      button.addEventListener('click', () => annulAction(id));
      toggle.insertAdjacentElement('afterend', button);
    });
  }

  function initAdminObserver() {
    const root = $('acoes-admin-list');
    if (!root || root.__nafActionObserver) return;
    const observer = new MutationObserver(installAdminAnnulButtons);
    observer.observe(root, { childList: true, subtree: true });
    root.__nafActionObserver = observer;
    installAdminAnnulButtons();
  }

  function init() {
    ensureActionAdminStyle();
    sb = window.__NAF_SUPABASE || window.supabaseClient;
    if (!sb) return;
    load().catch(error => {
      console.error('[AÇÕES SÓCIO]', error);
      /* Uma falha nas ações não deve apagar as restantes funcionalidades do sócio. */
      if (socio) showTab(true);
    });
    initAdminObserver();
  }

  window.NAF_ACOES_ANNUL = annulAction;
  document.addEventListener('DOMContentLoaded', init, { once: true });
})();
