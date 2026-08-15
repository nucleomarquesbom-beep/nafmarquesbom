import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.__NAF_SUPABASE = supabase;
const ADMIN_NUMERO = 9999;

const state = {
    user: null,
    socio: null,
    admin: false,
    adminSocios: [],
    selectedSocios: new Set()
};


  async function loadPublicMembers() {
    const root = document.getElementById('public-members-list');
    if (!root) return;
    try {
      const client = supabase;
      const { data, error } = await client.rpc('socios_publicos_por_categoria');
      if (error) throw error;
      const groups = { Futebol: [], Futsal: [] };
      (data || []).forEach(row => {
        const modalidade = String(row.modalidade || '').toLowerCase() === 'futsal' ? 'Futsal' : 'Futebol';
        if (!row.categoria || !row.nome) return;
        (groups[modalidade] ||= []).push({ categoria: String(row.categoria), nome: String(row.nome) });
      });
      const order = {
        Futebol:['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
        Futsal:['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
      };
      const norm = v => v.trim().toLowerCase();
      root.innerHTML = '';
      Object.entries(groups).forEach(([modalidade, rows]) => {
        const cats = [...new Set(rows.map(r => r.categoria))].sort((a,b) => {
          const ia=order[modalidade].findIndex(x=>norm(x)===norm(a));
          const ib=order[modalidade].findIndex(x=>norm(x)===norm(b));
          return (ia<0?999:ia)-(ib<0?999:ib) || a.localeCompare(b,'pt');
        });
        if (!cats.length) return;
        const group=document.createElement('section');
        group.className='public-members-group';
        group.innerHTML=`<h3>${modalidade}</h3><div class="public-category-row"></div>`;
        const rowEl=group.querySelector('.public-category-row');
        cats.forEach(cat=>{
          const members=rows.filter(r=>norm(r.categoria)===norm(cat)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt'));
          const wrap=document.createElement('div');
          wrap.className='public-category';
          const button=document.createElement('button');
          button.type='button'; button.className='public-category-trigger'; button.textContent=cat;
          button.setAttribute('aria-expanded','false');
          const panel=document.createElement('div');
          panel.className='public-category-members';
          const ul=document.createElement('ul');
          members.forEach(m=>{const li=document.createElement('li'); li.textContent=m.nome; ul.appendChild(li);});
          panel.appendChild(ul); wrap.append(button,panel); rowEl.appendChild(wrap);
          button.addEventListener('click',()=>{
            if (window.matchMedia('(max-width: 700px)').matches) {
              const open=!wrap.classList.contains('open');
              document.querySelectorAll('.public-category.open').forEach(x=>{x.classList.remove('open');x.querySelector('button')?.setAttribute('aria-expanded','false')});
              wrap.classList.toggle('open',open); button.setAttribute('aria-expanded',String(open));
            }
          });
        });
        root.appendChild(group);
      });
      if (!root.children.length) root.innerHTML='<div class="vazio">Não existem categorias com sócios ativos.</div>';
    } catch (e) {
      console.error('Sócios públicos:',e);
      root.innerHTML='<div class="vazio">Não foi possível carregar a lista de sócios.</div>';
    }
  }
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[c]));
}

function showMessage(text, type = 'info') {
    const el = $('#socio-message');
    if (!el) return;
    el.textContent = text;
    el.className = `socio-message ${type}`;
    el.hidden = false;
}

function hideMessage() {
    const el = $('#socio-message');
    if (el) el.hidden = true;
}

/*
 * Regra importante:
 * nenhum dado privado é colocado no HTML antes de existir uma sessão
 * autenticada e um registo válido na tabela socios.
 */
function clearPrivateUI() {
    state.user = null;
    state.socio = null;
    state.admin = false;

    if ($('#login-panel')) $('#login-panel').hidden = false;
    if ($('#dashboard')) $('#dashboard').hidden = true;
    if ($('#admin-panel')) $('#admin-panel').hidden = true;

    const clearIds = [
        '#socio-name', '#socio-number', '#dados-nome', '#dados-numero',
        '#dados-nascimento', '#dados-email', '#dados-morada',
        '#dados-telemovel', '#dados-arbitro', '#dados-af',
        '#dados-modalidade', '#dados-categoria', '#funlearn-total', '#funlearn-total-top'
    ];

    clearIds.forEach((id) => {
        const el = $(id);
        if (el) el.textContent = '—';
    });

    if ($('#funlearn-total')) $('#funlearn-total').textContent = '0';
    if ($('#funlearn-total-top')) $('#funlearn-total-top').textContent = '0';

    if ($('#docs-list')) $('#docs-list').innerHTML = '';
    if ($('#funlearn-history')) $('#funlearn-history').innerHTML = '';
    if ($('#admin-socios-lista')) $('#admin-socios-lista').innerHTML = '';

    const photo = $('#socio-photo');
    const placeholder = $('#socio-photo-placeholder');
    if (photo) {
        photo.removeAttribute('src');
        photo.hidden = true;
    }
    if (placeholder) placeholder.hidden = false;
}

async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
}

async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
}

async function resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}`
    });
    if (error) throw error;
}

async function logout() {
    await supabase.auth.signOut();
    clearPrivateUI();
    window.location.reload();
}

async function loadProfile(user) {
    if (!user?.id) throw new Error('Utilizador autenticado inválido.');
    let data;
    const { data: acesso, error: acessoError } = await supabase.rpc('validar_acesso_socio');
    if (!acessoError) {
        const resultado = Array.isArray(acesso) ? acesso[0] : acesso;
        if (!resultado?.permitido) throw new Error(resultado?.motivo || 'O acesso ao espaço de sócio está inativo.');
    } else {
        // Compatibilidade durante a transição: a migration da regra pode ainda não ter sido aplicada.
        const fallback = await supabase.from('socios').select('*').eq('user_id', user.id).eq('ativo', true).single();
        if (fallback.error) throw fallback.error;
        data = fallback.data;
    }
    const result = data ? { data, error: null } : await supabase.from('socios').select('*').eq('user_id', user.id).eq('ativo', true).single();
    if (result.error) throw result.error;
    data = result.data;
    if (!data) throw new Error('A conta autenticada não está associada a um sócio ativo.');
    state.user=user; state.socio=data; state.admin=data.is_admin===true && data.ativo===true;
}

function renderProfile() {
    const s = state.socio;
    if (!s) return;

    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;
    $('#admin-panel').hidden = !state.admin;

    $('#socio-name').textContent = s.nome || 'Sócio';
    $('#socio-number').textContent = s.numero_socio ?? '—';

    $('#dados-nome').textContent = s.nome || '—';
    $('#dados-numero').textContent = s.numero_socio ?? '—';
    $('#dados-nascimento').textContent = s.data_nascimento
        ? new Date(`${s.data_nascimento}T00:00:00`).toLocaleDateString('pt-PT')
        : '—';
    $('#dados-morada').textContent = s.morada || '—';
    $('#dados-email').textContent = s.email || state.user?.email || '—';
    $('#dados-telemovel').textContent = s.telemovel || '—';
    $('#dados-arbitro').textContent = s.numero_arbitro || '—';
    $('#dados-af').textContent = s.associacao_futebol || '—';
    $('#dados-modalidade').textContent = s.modalidade || '—';

    const categoriaView = $('#dados-categoria');
    if (categoriaView) categoriaView.textContent = s.categoria || '—';

    fillEditForms();
    setupArbitragemSelectors();
    loadPhoto();
    loadQuotas();
    loadDocuments();
    loadFunlearn();
    window.NAF_DR_ARBITRO_START?.();

    if (state.admin) {
        loadAdminSocios();
    }
}

async function loadPhoto() {
    const image = $('#socio-photo');
    const placeholder = $('#socio-photo-placeholder');
    if (!image || !placeholder || !state.socio) return;

    const path = state.socio.fotografia_path || state.socio.fotografia_url || null;

    if (!path) {
        image.removeAttribute('src');
        image.hidden = true;
        placeholder.hidden = false;
        return;
    }

    if (/^https?:\/\//i.test(path)) {
        image.src = path;
        image.hidden = false;
        placeholder.hidden = true;
        return;
    }

    const { data, error } = await supabase.storage
        .from('fotografias-socios')
        .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
        image.removeAttribute('src');
        image.hidden = true;
        placeholder.hidden = false;
        return;
    }

    image.src = data.signedUrl;
    image.hidden = false;
    placeholder.hidden = true;
}

async function uploadPhoto(file) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error('A fotografia deve ser JPG, PNG ou WEBP.');
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    const path = `${state.socio.id}/fotografia.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('fotografias-socios')
        .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
        .from('socios')
        .update({ fotografia_path: path })
        .eq('id', state.socio.id)
        .eq('user_id', state.user.id);

    if (dbError) throw dbError;

    state.socio.fotografia_path = path;
    state.socio.fotografia_url = path;
    await loadPhoto();
}

function cleanupDuplicateQuotaMarkup() {
    const sections = [...document.querySelectorAll('section#quotas')];
    if (sections.length <= 1) return;

    sections.slice(1).forEach(section => section.remove());
}

function quotaStatusClass(status) {
    const value = String(status || '').trim().toLowerCase();

    if ([
        'paga',
        'pago',
        'regularizada',
        'regularizado',
        'liquidada',
        'liquidado'
    ].includes(value)) {
        return 'paga';
    }

    if ([
        'em_atraso',
        'em atraso',
        'atrasada',
        'atrasado',
        'vencida',
        'vencido',
        'não paga',
        'nao paga'
    ].includes(value)) {
        return 'atrasada';
    }

    return 'pendente';
}

function quotaStatusLabel(status) {
    const value = String(status || '').trim().toLowerCase();

    const labels = {
        paga: 'Paga',
        pago: 'Pago',
        regularizada: 'Regularizada',
        regularizado: 'Regularizado',
        liquidada: 'Liquidada',
        liquidado: 'Liquidado',
        em_atraso: 'Em atraso',
        'em atraso': 'Em atraso',
        atrasada: 'Em atraso',
        atrasado: 'Em atraso',
        vencida: 'Em atraso',
        vencido: 'Em atraso',
        'não paga': 'Não paga',
        'nao paga': 'Não paga',
        pendente: 'Pendente'
    };

    return labels[value] || (status ? String(status) : 'Pendente');
}

function formatQuotaMonth(month) {
    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const number = Number(month);
    if (Number.isInteger(number) && number >= 1 && number <= 12) {
        return months[number - 1];
    }

    return month ? String(month) : '';
}

function formatQuotaValue(value) {
    if (value === null || value === undefined || value === '') return '—';

    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);

    return new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: 'EUR'
    }).format(number);
}

async function loadQuotas() {
    cleanupDuplicateQuotaMarkup();

    const el = $('#quotas-list');
    if (!el) return;

    if (!state.socio?.id) {
        el.innerHTML = '<div class="vazio">Não foi possível identificar o sócio.</div>';
        return;
    }

    el.innerHTML = '<div class="vazio">A carregar quotas…</div>';

    try {
        const { data, error } = await supabase
            .from('quotas')
            .select('ano,mes,valor,estado')
            .eq('socio_id', state.socio.id)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false });

        if (error) throw error;

        const quotas = Array.isArray(data) ? data : [];

        if (!quotas.length) {
            el.innerHTML = `
                <div class="vazio">
                    ${escapeHtml(state.socio.quotas || 'Não existem quotas registadas para este sócio.')}
                </div>
            `;
            return;
        }

        const pagas = quotas.filter(q => quotaStatusClass(q.estado) === 'paga');
        const atrasadas = quotas.filter(q => quotaStatusClass(q.estado) === 'atrasada');
        const pendentes = quotas.filter(q => quotaStatusClass(q.estado) === 'pendente');

        const resumo = `
            <div class="vazio quota-resumo">
                <strong>${quotas.length}</strong>
                quota${quotas.length === 1 ? '' : 's'}
                ${pagas.length ? ` • <strong>${pagas.length}</strong> paga${pagas.length === 1 ? '' : 's'}` : ''}
                ${pendentes.length ? ` • <strong>${pendentes.length}</strong> pendente${pendentes.length === 1 ? '' : 's'}` : ''}
                ${atrasadas.length ? ` • <strong>${atrasadas.length}</strong> em atraso` : ''}
            </div>
        `;

        const lista = quotas.map(quota => {
            const statusClass = quotaStatusClass(quota.estado);
            const statusLabel = quotaStatusLabel(quota.estado);
            const periodo = [formatQuotaMonth(quota.mes), quota.ano]
                .filter(Boolean)
                .join(' ');

            return `
                <div class="quota-item ${statusClass}">
                    <div class="quota-info">
                        <strong>${escapeHtml(periodo || 'Quota')}</strong>
                        <small>${escapeHtml(formatQuotaValue(quota.valor))}</small>
                    </div>
                    <span class="quota-estado ${statusClass}">
                        ${escapeHtml(statusLabel)}
                    </span>
                </div>
            `;
        }).join('');

        el.innerHTML = `${resumo}<div class="quotas-items">${lista}</div>`;
    } catch (error) {
        console.error('Erro ao carregar quotas:', error);

        el.innerHTML = `
            <div class="vazio">
                Não foi possível carregar as quotas neste momento.
            </div>
        `;
    }
}

async function loadDocuments() {
    const list = $('#docs-list');
    if (!list || !state.socio) return;

    const { data, error } = await supabase
        .from('documentos_socios')
        .select('id,nome_ficheiro,storage_path,tamanho_bytes,tipo_mime,created_at')
        .eq('socio_id', state.socio.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        list.innerHTML = '<div class="vazio">Não foi possível carregar os documentos.</div>';
        return;
    }

    const documents = data || [];
    $('#docs-count').textContent = `${documents.length} / 12`;

    if (!documents.length) {
        list.innerHTML = '<div class="vazio">Ainda não existem documentos.</div>';
        return;
    }

    const urlResults = await Promise.all(
        documents.map(async record => {
            if (!record.storage_path) return [record.id, null];
            const cached = window.__NAF_DOC_URL_CACHE?.get(record.storage_path);
            if (cached && cached.expires > Date.now()) return [record.id, cached.url];

            const result = await supabase.storage
                .from('documentos-socios')
                .createSignedUrl(record.storage_path, 3600);

            const signedUrl = result.error ? null : (result.data?.signedUrl || null);
            if (signedUrl) {
                window.__NAF_DOC_URL_CACHE ||= new Map();
                window.__NAF_DOC_URL_CACHE.set(record.storage_path, {
                    url: signedUrl,
                    expires: Date.now() + (55 * 60 * 1000)
                });
            }
            return [record.id, signedUrl];
        })
    );

    const urlById = new Map(urlResults);

    list.innerHTML = documents.map(record => {
        const signedUrl = urlById.get(record.id);
        return `
            <div class="documento-socio-item">
                <div>
                    <strong>📄 ${escapeHtml(record.nome_ficheiro || 'Documento PDF')}</strong>
                    <small>${record.created_at
                        ? new Date(record.created_at).toLocaleDateString('pt-PT')
                        : ''}</small>
                </div>
                ${signedUrl ? `<a class="botao" href="${escapeHtml(signedUrl)}" target="_blank" rel="noopener">Abrir</a>` : ''}
            </div>
        `;
    }).join('');
}

async function uploadSocioPdf(file) {
    if (!file || file.type !== 'application/pdf') {
        throw new Error('Só são permitidos ficheiros PDF.');
    }

    const { count, error: countError } = await supabase
        .from('documentos_socios')
        .select('id', { count: 'exact', head: true })
        .eq('socio_id', state.socio.id);

    if (countError) throw countError;
    if ((count || 0) >= 12) throw new Error('Já atingiu o limite máximo de 12 documentos.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from('documentos-socios')
        .upload(path, file, {
            contentType: 'application/pdf',
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
        .from('documentos_socios')
        .insert({
            socio_id: state.socio.id,
            nome_ficheiro: file.name,
            storage_path: path,
            tamanho_bytes: file.size,
            tipo_mime: 'application/pdf'
        });

    if (dbError) {
        await supabase.storage.from('documentos-socios').remove([path]);
        throw dbError;
    }
}

async function loadFunlearn() {
    const history = $('#funlearn-history');
    if (!history || !state.socio) return;

    const { data, error } = await supabase
        .from('funlearn_pontos')
        .select('id,pontos,descricao,created_at')
        .eq('socio_id', state.socio.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        history.innerHTML = '<div class="vazio">Não foi possível carregar o histórico.</div>';
        return;
    }

    const rows = data || [];
    const total = rows.reduce((sum, row) => sum + Number(row.pontos || 0), 0);

    $('#funlearn-total').textContent = total;
    $('#funlearn-total-top').textContent = total;

    history.innerHTML = rows.length
        ? rows.map(row => `
            <div class="fun-row">
                <div>
                    <strong>Fun&amp;Learn</strong>
                    <small>${escapeHtml(row.descricao || '')}${
                        row.created_at
                            ? ` • ${new Date(row.created_at).toLocaleDateString('pt-PT')}`
                            : ''
                    }</small>
                </div>
                <b>+${Number(row.pontos || 0)}</b>
            </div>
        `).join('')
        : '<div class="vazio">Ainda não existem movimentos de pontos.</div>';
}

function fillEditForms() {
    const s = state.socio;
    if (!s) return;

    $('#edit-nome').value = s.nome || '';
    $('#edit-numero').value = s.numero_socio ?? '';
    $('#edit-numero').readOnly = true;
    $('#edit-numero').disabled = true;
    $('#edit-nascimento').value = s.data_nascimento || '';
    $('#edit-email').value = s.email || state.user?.email || '';
    $('#edit-morada').value = s.morada || '';
    $('#edit-telemovel').value = s.telemovel || '';
    $('#edit-arbitro').value = s.numero_arbitro || '';
    $('#edit-af').value = s.associacao_futebol || '';
    $('#edit-modalidade').value = s.modalidade || '';

    const categoria = $('#edit-categoria');
    if (categoria) {
        const cats = CATEGORIAS_ARBITRAGEM[s.modalidade] || [];
        categoria.innerHTML = '<option value="">Selecionar categoria</option>' +
            cats.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('');
        categoria.disabled = !s.modalidade;
        categoria.value = s.categoria || '';
    }
}

function closeEditForms() {
    $('#dados-edit-form').hidden = true;
    $('#dados-view').hidden = false;
    $('#editar-dados-btn').hidden = false;

    $('#arbitragem-edit-form').hidden = true;
    $('#arbitragem-view').hidden = false;
    $('#editar-arbitragem-btn').hidden = false;
}

async function saveProfileFields(fields) {
    const { data, error } = await supabase
        .from('socios')
        .update(fields)
        .eq('id', state.socio.id)
        .eq('user_id', state.user.id)
        .select('*')
        .single();

    if (error) throw error;

    state.socio = data;
    renderProfile();
    closeEditForms();
}

async function savePersonalData() {
    const email = $('#edit-email').value.trim();
    if (!email || !email.includes('@')) throw new Error('Indica um email válido.');

    const oldEmail = (state.user?.email || '').toLowerCase();

    if (email.toLowerCase() !== oldEmail) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) throw error;
    }

    await saveProfileFields({
        data_nascimento: $('#edit-nascimento').value || null,
        morada: $('#edit-morada').value || null,
        email,
        telemovel: $('#edit-telemovel').value || null
    });
}

const CATEGORIAS_ARBITRAGEM = {
    Futebol: ['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
    Futsal: ['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
};

const ASSOCIACOES_FUTEBOL = [
    'AF Algarve','AF Angra do Heroísmo','AF Aveiro','AF Beja','AF Braga',
    'AF Bragança','AF Castelo Branco','AF Coimbra','AF Évora','AF Guarda',
    'AF Horta','AF Leiria','AF Lisboa','AF Madeira','AF Ponta Delgada',
    'AF Portalegre','AF Porto','AF Santarém','AF Setúbal',
    'AF Viana do Castelo','AF Vila Real','AF Viseu'
];

async function loadAssociacoesFutebol() {
    const select = $('#edit-af');
    if (!select) return;

    let rows = null;
    try {
        const { data, error } = await supabase.rpc('lista_associacoes_futebol');
        if (!error && Array.isArray(data)) rows = data;
    } catch (_) {}

    const nomes = (rows?.length ? rows.map(r => r.nome) : ASSOCIACOES_FUTEBOL);
    select.innerHTML = '<option value="">Selecionar Associação de Futebol</option>' +
        nomes.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    select.value = state.socio?.associacao_futebol || '';
}

function setupArbitragemSelectors() {
    const modalidade = $('#edit-modalidade');
    const af = $('#edit-af');
    const form = $('#arbitragem-edit-form');
    if (!modalidade || !af || !form) return;

    if (modalidade.tagName !== 'SELECT') {
        const select = document.createElement('select');
        select.id = 'edit-modalidade';
        select.required = true;
        modalidade.replaceWith(select);
    }

    const m = $('#edit-modalidade');
    m.innerHTML = '<option value="">Selecionar modalidade</option>' +
        '<option value="Futebol">Futebol</option>' +
        '<option value="Futsal">Futsal</option>';
    m.value = state.socio?.modalidade || '';

    if (af.tagName !== 'SELECT') {
        const select = document.createElement('select');
        select.id = 'edit-af';
        select.required = true;
        af.replaceWith(select);
    }

    let categoria = $('#edit-categoria');
    if (!categoria) {
        const label = document.createElement('label');
        label.innerHTML = 'Categoria <select id="edit-categoria" required></select>';
        const grid = form.querySelector('.socio-edit-grid');
        grid?.appendChild(label);
        categoria = $('#edit-categoria');
    }

    const refreshCategoria = () => {
        const cats = CATEGORIAS_ARBITRAGEM[m.value] || [];
        categoria.innerHTML = '<option value="">Selecionar categoria</option>' +
            cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        categoria.disabled = !m.value;
        categoria.value = state.socio?.categoria && cats.includes(state.socio.categoria)
            ? state.socio.categoria
            : '';
    };

    if (!m.dataset.nafBound) {
        m.dataset.nafBound = '1';
        m.addEventListener('change', refreshCategoria);
    }

    refreshCategoria();
    loadAssociacoesFutebol();
}

async function saveArbitragemData() {
    const modalidade = $('#edit-modalidade')?.value || '';
    const categoria = $('#edit-categoria')?.value || '';
    const associacao = $('#edit-af')?.value || '';
    const numeroArbitro = $('#edit-arbitro').value.trim();

    if (!CATEGORIAS_ARBITRAGEM[modalidade]) {
        throw new Error('Seleciona Futebol ou Futsal.');
    }
    if (!CATEGORIAS_ARBITRAGEM[modalidade].includes(categoria)) {
        throw new Error('Seleciona uma categoria válida para a modalidade.');
    }
    if (!ASSOCIACOES_FUTEBOL.includes(associacao)) {
        throw new Error('Seleciona uma Associação de Futebol válida.');
    }

    const { data, error } = await supabase.rpc('atualizar_dados_arbitragem_socio', {
        p_numero_arbitro: numeroArbitro || null,
        p_associacao_futebol: associacao,
        p_modalidade: modalidade,
        p_categoria: categoria
    });

    if (error) throw error;

    state.socio = { ...state.socio, ...data };
    renderProfile();
    closeEditForms();
}

/* ---------------- ADMIN ---------------- */

async function assertAdmin() {
    const session = await getSession();
    if (!session) throw new Error('Sessão não autenticada.');

    const { data, error } = await supabase
        .from('socios')
        .select('id,numero_socio,is_admin,ativo')
        .eq('user_id', session.user.id)
        .eq('ativo', true)
        .single();

    if (error) throw error;

    if (
        Number(data.numero_socio) !== ADMIN_NUMERO ||
        data.is_admin !== true
    ) {
        throw new Error('Acesso reservado ao administrador.');
    }

    return session;
}

async function createSocioFromAdmin() {
    await assertAdmin();

    const body = {
        nome: $('#novo-socio-nome').value.trim(),
        numero_socio: Number($('#novo-socio-numero').value),
        email: $('#novo-socio-email').value.trim(),
        telemovel: $('#novo-socio-telemovel').value.trim()
    };

    const { data, error } = await supabase.functions.invoke('criar-socio', { body });

    if (error) throw new Error(await functionError(error, 'Não foi possível criar o sócio.'));
    if (data?.error) throw new Error(data.error);

    return data?.socio || data;
}

async function functionError(error, fallback) {
    if (!error) return fallback;

    if (error.context) {
        try {
            const payload = await error.context.json();
            if (payload?.error) return payload.error;
            if (payload?.message) return payload.message;
        } catch (_) {}
    }

    return error.message || fallback;
}

async function loadAdminSocios() {
    if (!state.admin || !$('#admin-socios-lista')) return;

    const { data, error } = await supabase.rpc('admin_listar_socios');
    if (error) {
        $('#admin-socios-lista').innerHTML =
            `<div class="vazio">${escapeHtml(error.message)}</div>`;
        return;
    }

    const rows = data || [];
    state.adminSocios = rows;
    setupAdminSocioActions();

    $('#admin-socios-lista').innerHTML = rows.length
        ? rows.map(s => `
            <div class="admin-socio-row" data-socio-id="${escapeHtml(s.id)}" data-numero-original="${escapeHtml(s.numero_socio)}">
                <input
                    class="admin-socio-select"
                    type="checkbox"
                    value="${escapeHtml(s.id)}"
                    data-name="${escapeHtml(s.nome || '')}"
                    aria-label="Selecionar ${escapeHtml(s.nome || 'sócio')}"
                >
                <div class="admin-socio-number-cell">
                    <span class="admin-socio-number-display">${escapeHtml(s.numero_socio)}</span>
                    <input class="admin-socio-numero-input" type="number" min="1"
                           value="${escapeHtml(s.numero_socio)}"
                           aria-label="Número de sócio" hidden>
                    <button type="button" class="admin-small-btn admin-edit-numero">Alterar nº</button>
                    <div class="admin-numero-confirm" hidden>
                        <button type="button" class="admin-small-btn admin-confirm-numero">Confirmar</button>
                        <button type="button" class="admin-small-btn admin-cancel-numero">Cancelar</button>
                    </div>
                </div>
                <span class="admin-socio-main">
                    <strong>${escapeHtml(s.nome)}</strong>
                    <small>${escapeHtml(s.email || 'Sem email')} · ${escapeHtml(s.telemovel || 'Sem telemóvel')}</small>
                </span>
                <span class="admin-socio-status ${s.ativo ? 'ativo' : 'inativo'}">
                    ${s.ativo ? 'Ativo' : 'Inativo'}
                </span>
                <label class="admin-socio-admin-toggle">
                    <input type="checkbox" class="admin-is-admin" ${s.is_admin ? 'checked' : ''}>
                    Admin
                </label>
            </div>
        `).join('')
        : '<div class="vazio">Ainda não existem sócios.</div>';

    const select = $('#admin-remove-socio');
    if (select) {
        select.innerHTML = rows
            .filter(s => s.ativo)
            .map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.numero_socio)} — ${escapeHtml(s.nome)}</option>`)
            .join('');
    }

    updateAdminSelectionUI();
}

function selectedSocioIds() {
    return $$('.admin-socio-select:checked').map(el => el.value);
}

function setupAdminSocioActions() {
    const root = $('#admin-socios-lista');
    if (!root || root.dataset.adminActionsBound) return;
    root.dataset.adminActionsBound = '1';

    root.addEventListener('click', async (event) => {
        const row = event.target.closest('[data-socio-id]');
        if (!row) return;

        const id = row.dataset.socioId;
        const input = row.querySelector('.admin-socio-numero-input');
        const display = row.querySelector('.admin-socio-number-display');
        const editBtn = row.querySelector('.admin-edit-numero');
        const confirmBox = row.querySelector('.admin-numero-confirm');

        if (event.target.classList.contains('admin-edit-numero')) {
            input.hidden = false;
            display.hidden = true;
            editBtn.hidden = true;
            confirmBox.hidden = false;
            input.focus();
            input.select();
            return;
        }

        if (event.target.classList.contains('admin-cancel-numero')) {
            input.value = row.dataset.numeroOriginal;
            input.hidden = true;
            display.hidden = false;
            editBtn.hidden = false;
            confirmBox.hidden = true;
            return;
        }

        if (event.target.classList.contains('admin-confirm-numero')) {
            try {
                event.target.disabled = true;
                await assertAdmin();
                const numero = Number(input?.value);
                if (!Number.isInteger(numero) || numero <= 0) {
                    throw new Error('Número de sócio inválido.');
                }
                const original = Number(row.dataset.numeroOriginal);
                if (numero === original) {
                    row.querySelector('.admin-cancel-numero')?.click();
                    return;
                }
                if (!window.confirm(`Confirmar alteração do número de sócio de ${original} para ${numero}?`)) {
                    return;
                }
                const { error } = await supabase.rpc('admin_alterar_numero_socio', {
                    p_socio_id: id,
                    p_novo_numero: numero
                });
                if (error) throw error;
                await loadAdminSocios();
                showMessage('Número de sócio atualizado.', 'sucesso');
            } catch (error) {
                showMessage(error.message || 'Não foi possível alterar o número.', 'erro');
            } finally {
                event.target.disabled = false;
            }
        }
    });

    root.addEventListener('change', async (event) => {
        if (!event.target.classList.contains('admin-is-admin')) return;
        const row = event.target.closest('[data-socio-id]');
        if (!row) return;
        try {
            event.target.disabled = true;
            await assertAdmin();
            const { error } = await supabase.rpc('admin_definir_admin', {
                p_socio_id: row.dataset.socioId,
                p_is_admin: event.target.checked
            });
            if (error) throw error;
            await loadAdminSocios();
            showMessage(event.target.checked ? 'Administrador atribuído.' : 'Administrador retirado.', 'sucesso');
        } catch (error) {
            event.target.checked = !event.target.checked;
            showMessage(error.message || 'Não foi possível alterar a permissão.', 'erro');
        } finally {
            event.target.disabled = false;
        }
    });
}

function updateAdminSelectionUI() {
    const ids = selectedSocioIds();
    const count = $('#admin-selected-count');
    if (count) count.textContent = `${ids.length} selecionado${ids.length === 1 ? '' : 's'}`;
    const selectAll = $('#admin-select-all');
    const checks = $$('.admin-socio-select');
    if (selectAll) {
        selectAll.checked = checks.length > 0 && ids.length === checks.length;
        selectAll.indeterminate = ids.length > 0 && ids.length < checks.length;
    }
}

function selectAllAdminSocios(checked) {
    $$('.admin-socio-select').forEach(cb => { cb.checked = checked; });
    updateAdminSelectionUI();
}

async function invokeAdminMail(payload) {
    await assertAdmin();
    const { data, error } = await supabase.functions.invoke('admin-mail', { body: payload });
    if (error) throw new Error(await functionError(error, 'Falha no envio do email.'));
    if (data?.error) throw new Error(data.error);
    return data;
}

async function sendQuotasEmAtraso() {
    const ids = selectedSocioIds();
    if (!ids.length) throw new Error('Selecione pelo menos um sócio.');

    return invokeAdminMail({
        action: 'quotas_em_atraso',
        socio_ids: ids
    });
}

async function sendEmailSelecionados() {
    const ids = selectedSocioIds();
    if (!ids.length) throw new Error('Selecione pelo menos um sócio.');

    const subject = $('#admin-documento-assunto')?.value?.trim();
    const message = $('#admin-documento-mensagem')?.value?.trim();

    if (!subject) throw new Error('Indique o assunto do email.');
    if (!message) throw new Error('Escreva o conteúdo do email.');

    return invokeAdminMail({
        action: 'email_selecionados',
        socio_ids: ids,
        subject,
        message
    });
}

async function sendComunicacaoSelecionados(file) {
    const ids = selectedSocioIds();
    if (!ids.length) throw new Error('Selecione pelo menos um sócio.');

    const subject = $('#admin-documento-assunto')?.value?.trim();
    const message = $('#admin-documento-mensagem')?.value?.trim();
    if (!subject) throw new Error('Indique o assunto do email.');
    if (!message) throw new Error('Escreva o conteúdo do email.');

    if (!(file instanceof File)) return sendEmailSelecionados();

    const session = await assertAdmin();
    const form = new FormData();
    form.append('action', 'documento_selecionados');
    ids.forEach(id => form.append('socio_ids[]', id));
    form.append('subject', subject);
    form.append('message', message);
    form.append('documento', file);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-mail`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY
        },
        body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha no envio da comunicação.');
    return data;
}

async function sendDocumentoTodos(file) {
    if (!(file instanceof File)) throw new Error('Selecione um documento válido.');

    const session = await assertAdmin();
    const form = new FormData();
    form.append('action', 'documento_todos');
    form.append('documento', file);
    form.append('subject', $('#admin-documento-assunto')?.value?.trim() || 'Comunicação do Núcleo de Árbitros de Futebol Marques Bom');
    form.append('message', $('#admin-documento-mensagem')?.value?.trim() || '');

    const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-mail`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: SUPABASE_ANON_KEY
            },
            body: form
        }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha no envio do documento.');
    return data;
}

async function importarPDF(file) {
    if (!(file instanceof File) || file.type !== 'application/pdf') {
        throw new Error('Selecione um ficheiro PDF.');
    }

    const session = await assertAdmin();
    const form = new FormData();
    form.append('action', 'importar_pdf');
    form.append('pdf', file);

    const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-import-pdf`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: SUPABASE_ANON_KEY
            },
            body: form
        }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha na importação do PDF.');
    return data;
}

async function retirarPontos(socioId, pontos, motivo) {
    const valor = Number(pontos);
    if (!Number.isFinite(valor) || valor <= 0) {
        throw new Error('Indique um número de pontos superior a zero.');
    }
    if (!motivo.trim()) throw new Error('Indique o motivo da retirada de pontos.');

    await assertAdmin();

    const { data, error } = await supabase.functions.invoke('admin-funlearn', {
        body: {
            action: 'retirar_pontos',
            socio_id: socioId,
            pontos: valor,
            motivo: motivo.trim(),
            notificar: true
        }
    });

    if (error) throw new Error(await functionError(error, 'Não foi possível retirar os pontos.'));
    if (data?.error) throw new Error(data.error);
    return data;
}

async function processFunlearnPdf(file, pontos, atividade, descricao) {
    if (!state.admin) throw new Error('Apenas o administrador pode processar documentos Fun&Learn.');
    if (!file || file.type !== 'application/pdf') throw new Error('O ficheiro deve ser PDF.');

    const value = Number(pontos);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error('Indica um número de pontos superior a 0.');
    }

    if (!window.pdfjsLib) {
        try {
            window.pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
        } catch (_) {
            throw new Error('Não foi possível carregar o leitor de PDF.');
        }
    }

    const path = `admin/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const { error: uploadError } = await supabase.storage
        .from('funlearn')
        .upload(path, file, { contentType: 'application/pdf', upsert: false });

    if (uploadError) throw uploadError;

    const { data: importacao, error: importError } = await supabase
        .from('funlearn_importacoes')
        .insert({
            nome_ficheiro: file.name,
            storage_path: path,
            pontos: value,
            estado: 'processando',
            created_by: state.user.id
        })
        .select()
        .single();

    if (importError) throw importError;

    try {
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let text = '';

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();
            text += ' ' + content.items.map(item => item.str).join(' ');
        }

        const normalizedText = normalizeName(text);

        const { data: socios, error: sociosError } = await supabase
            .from('socios')
            .select('id,nome,numero_socio')
            .eq('ativo', true);

        if (sociosError) throw sociosError;

        const encontrados = (socios || []).filter(s => {
            const nome = normalizeName(s.nome);
            return nome.length >= 4 && normalizedText.includes(nome);
        });

        if (encontrados.length) {
            const importRows = encontrados.map(s => ({
                importacao_id: importacao.id,
                nome_original: s.nome,
                nome_normalizado: normalizeName(s.nome),
                numero_socio: s.numero_socio,
                socio_id: s.id,
                correspondencia_encontrada: true,
                pontos_atribuidos: false
            }));

            const { error: nomesError } = await supabase
                .from('funlearn_import_nomes')
                .insert(importRows);

            if (nomesError) throw nomesError;

            const descricaoFinal = atividade
                ? `${atividade}${descricao ? ` — ${descricao}` : ''}`
                : (descricao || 'Pontuação atribuída automaticamente');

            const { error: pontosError } = await supabase
                .from('funlearn_pontos')
                .insert(encontrados.map(s => ({
                    socio_id: s.id,
                    importacao_id: importacao.id,
                    pontos: value,
                    descricao: descricaoFinal
                })));

            if (pontosError) throw pontosError;

            await supabase
                .from('funlearn_import_nomes')
                .update({ pontos_atribuidos: true })
                .eq('importacao_id', importacao.id);
        }

        await supabase
            .from('funlearn_importacoes')
            .update({
                estado: 'processado',
                total_nomes: encontrados.length,
                total_socios_encontrados: encontrados.length,
                total_pontos_atribuidos: encontrados.length * value,
                processado_at: new Date().toISOString()
            })
            .eq('id', importacao.id);

        return {
            count: encontrados.length,
            names: encontrados.map(s => `${s.numero_socio} — ${s.nome}`)
        };
    } catch (error) {
        await supabase
            .from('funlearn_importacoes')
            .update({
                estado: 'erro',
                erro: error.message || String(error)
            })
            .eq('id', importacao.id);

        throw error;
    }
}

function normalizeName(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function syncMobileTabSelector() {
    const select=$('#socio-tab-select'); if(!select) return;
    const buttons=$$('.socio-tab'); const active=buttons.find(b=>b.classList.contains('active'))?.dataset.tab;
    const previous=select.value;
    select.innerHTML=buttons.map(b=>`<option value="${escapeHtml(b.dataset.tab||'')}">${escapeHtml(b.textContent.trim())}</option>`).join('');
    select.value=buttons.some(b=>b.dataset.tab===previous)?previous:(active||buttons[0]?.dataset.tab||'');
}
function activateSocioTab(tabName) {
    const button=$$('.socio-tab').find(b=>b.dataset.tab===tabName); if(!button) return;
    $$('.socio-tab').forEach(b=>b.classList.remove('active')); $$('.socio-tab-content').forEach(p=>p.classList.remove('active'));
    button.classList.add('active'); document.getElementById(tabName)?.classList.add('active');
    const select=$('#socio-tab-select'); if(select) select.value=tabName;
}
function setupTabs() {
    $$('.socio-tab').forEach(button=>button.addEventListener('click',()=>activateSocioTab(button.dataset.tab)));
    $('#socio-tab-select')?.addEventListener('change',e=>activateSocioTab(e.target.value));
    syncMobileTabSelector();
    const tabs=$('.socio-tabs');
    if(tabs&&!tabs.dataset.mobileObserver){
      const observer=new MutationObserver(()=>{
        syncMobileTabSelector();
        $$('.socio-tab').forEach(button=>{if(!button.dataset.bound){button.dataset.bound='1';button.addEventListener('click',()=>activateSocioTab(button.dataset.tab));}});
      }); observer.observe(tabs,{childList:true}); tabs.dataset.mobileObserver='1';
    }
}

async function init() {
    await loadPublicMembers();
    // Nunca mostrar dados privados por defeito.
    clearPrivateUI();
    cleanupDuplicateQuotaMarkup();
    setupTabs();

    $('#login-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        hideMessage();

        try {
            await login(
                $('#login-email').value.trim(),
                $('#login-password').value
            );

            const session = await getSession();
            if (!session) throw new Error('O login não criou uma sessão.');

            await loadProfile(session.user);
            renderProfile();
        } catch (error) {
            console.error('Erro no login:', error);
            clearPrivateUI();
            showMessage(error.message || 'Não foi possível iniciar sessão.', 'erro');
        }
    });

    $('#reset-password')?.addEventListener('click', async () => {
        const email = $('#login-email')?.value.trim();

        if (!email) {
            showMessage('Introduz primeiro o teu email.', 'info');
            $('#login-email')?.focus();
            return;
        }

        try {
            await resetPassword(email);
            showMessage('Foi enviado um email para redefinir a palavra-passe.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível enviar o email.', 'erro');
        }
    });

    $('#logout-btn')?.addEventListener('click', logout);

    $('#photo-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            await uploadPhoto(file);
            showMessage('Fotografia atualizada.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível atualizar a fotografia.', 'erro');
        } finally {
            event.target.value = '';
        }
    });

    $('#doc-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            await uploadSocioPdf(file);
            await loadDocuments();
            showMessage('Documento carregado.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível carregar o documento.', 'erro');
        } finally {
            event.target.value = '';
        }
    });

    $('#editar-dados-btn')?.addEventListener('click', () => {
        fillEditForms();
        $('#dados-view').hidden = true;
        $('#dados-edit-form').hidden = false;
        $('#editar-dados-btn').hidden = true;
    });

    $('#cancelar-dados-btn')?.addEventListener('click', closeEditForms);

    $('#dados-edit-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            $('#guardar-dados-btn').disabled = true;
            await savePersonalData();
            showMessage('Dados pessoais atualizados.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível guardar os dados.', 'erro');
        } finally {
            $('#guardar-dados-btn').disabled = false;
        }
    });

    $('#editar-arbitragem-btn')?.addEventListener('click', () => {
        fillEditForms();
        setupArbitragemSelectors();
        $('#arbitragem-view').hidden = true;
        $('#arbitragem-edit-form').hidden = false;
        $('#editar-arbitragem-btn').hidden = true;
    });

    $('#cancelar-arbitragem-btn')?.addEventListener('click', closeEditForms);

    $('#arbitragem-edit-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = event.currentTarget.querySelector('button[type="submit"]');

        try {
            button.disabled = true;
            await saveArbitragemData();
            showMessage('Dados de arbitragem atualizados.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível guardar os dados.', 'erro');
        } finally {
            button.disabled = false;
        }
    });

    $('#novo-socio-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            $('#novo-socio-submit').disabled = true;
            const socio = await createSocioFromAdmin();

            $('#novo-socio-form').reset();
            $('#novo-socio-resultado').hidden = false;
            $('#novo-socio-resultado').textContent =
                `Sócio ${socio.numero_socio} — ${socio.nome} criado. Foi enviado um convite para ${socio.email}.`;

            await loadAdminSocios();
            showMessage('Sócio criado e convite enviado por email.', 'sucesso');
        } catch (error) {
            $('#novo-socio-resultado').hidden = false;
            $('#novo-socio-resultado').textContent = error.message || 'Não foi possível criar o sócio.';
            showMessage(error.message || 'Não foi possível criar o sócio.', 'erro');
        } finally {
            $('#novo-socio-submit').disabled = false;
        }
    });

    $('#admin-select-all')?.addEventListener('change', (event) => {
        selectAllAdminSocios(event.currentTarget.checked);
    });
    $('#admin-select-all')?.addEventListener('click', (event) => {
        if (event.currentTarget.type !== 'checkbox') {
            selectAllAdminSocios(true);
        }
    });

    $('#admin-socios-lista')?.addEventListener('change', (event) => {
        if (event.target?.classList?.contains('admin-socio-select')) {
            updateAdminSelectionUI();
        }
    });

    $('#admin-refresh-socios')?.addEventListener('click', async () => {
        try {
            await assertAdmin();
            await loadAdminSocios();
            showMessage('Lista de sócios atualizada.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível atualizar a lista.', 'erro');
        }
    });

    $('#admin-quotas-atraso')?.addEventListener('click', async () => {
        try {
            $('#admin-quotas-atraso').disabled = true;
            const result = await sendQuotasEmAtraso();
            showMessage(
                `${result?.sent || 0} email(s) de quotas em atraso enviado(s).`,
                'sucesso'
            );
        } catch (error) {
            showMessage(error.message || 'Não foi possível enviar os emails.', 'erro');
        } finally {
            $('#admin-quotas-atraso').disabled = false;
        }
    });

    $('#admin-enviar-email-selecionados')?.addEventListener('click', () => {
        const form = $('#admin-comunicacao-form');
        if (!form) return;
        form.hidden = false;
        form.dataset.mode = 'email';
        const title = form.querySelector('.admin-comunicacao-heading h4');
        if (title) title.textContent = 'Enviar email aos sócios selecionados';
        const file = $('#admin-documento-file');
        if (file) file.value = '';
        const fileLabel = file?.closest('label');
        if (fileLabel) fileLabel.hidden = true;
        $('#admin-enviar-comunicacao').textContent = 'Enviar email aos selecionados';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('#admin-enviar-documento-selecionados')?.addEventListener('click', () => {
        const form = $('#admin-comunicacao-form');
        if (!form) return;
        form.hidden = false;
        form.dataset.mode = 'documento';
        const title = form.querySelector('.admin-comunicacao-heading h4');
        if (title) title.textContent = 'Enviar comunicação aos sócios selecionados';
        const fileLabel = $('#admin-documento-file')?.closest('label');
        if (fileLabel) fileLabel.hidden = false;
        $('#admin-enviar-comunicacao').textContent = 'Enviar comunicação';
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('#admin-cancelar-comunicacao')?.addEventListener('click', () => {
        const form = $('#admin-comunicacao-form');
        if (form) form.hidden = true;
    });

    $('#admin-enviar-comunicacao')?.addEventListener('click', async () => {
        const form = $('#admin-comunicacao-form');
        const mode = form?.dataset.mode || 'email';
        const file = $('#admin-documento-file')?.files?.[0];

        try {
            $('#admin-enviar-comunicacao').disabled = true;
            const result = mode === 'documento'
                ? await sendComunicacaoSelecionados(file)
                : await sendEmailSelecionados();

            showMessage(
                `${result?.sent || 0} comunicação(ões) enviada(s).`,
                'sucesso'
            );
            if (form) form.hidden = true;
        } catch (error) {
            showMessage(error.message || 'Não foi possível enviar a comunicação.', 'erro');
        } finally {
            $('#admin-enviar-comunicacao').disabled = false;
        }
    });

    $('#admin-import-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const file = $('#admin-import-file')?.files?.[0];

        try {
            const result = await importarPDF(file);
            $('#admin-import-result').hidden = false;
            $('#admin-import-result').textContent =
                result?.message || 'Importação concluída.';
            event.currentTarget.reset();
            showMessage('PDF importado com sucesso.', 'sucesso');
            await loadAdminSocios();
        } catch (error) {
            $('#admin-import-result').hidden = false;
            $('#admin-import-result').textContent =
                error.message || 'Falha na importação do PDF.';
            showMessage(error.message || 'Falha na importação do PDF.', 'erro');
        }
    });

    $('#admin-remove-points-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            const result = await retirarPontos(
                $('#admin-remove-socio').value,
                Number($('#admin-remove-pontos').value),
                $('#admin-remove-motivo').value
            );

            event.currentTarget.reset();
            showMessage(
                result?.message || 'Pontos retirados e email de notificação enviado.',
                'sucesso'
            );

            if (state.socio) await loadFunlearn();
        } catch (error) {
            showMessage(error.message || 'Não foi possível retirar os pontos.', 'erro');
        }
    });

    $('#funlearn-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            $('#funlearn-submit').disabled = true;

            const result = await processFunlearnPdf(
                $('#funlearn-file').files?.[0],
                Number($('#funlearn-pontos').value),
                $('#funlearn-atividade').value.trim(),
                $('#funlearn-descricao').value.trim()
            );

            event.currentTarget.reset();

            showMessage(
                result.count
                    ? `Processamento concluído: ${result.count} sócio(s) recebeu(ram) pontos.`
                    : 'O PDF foi processado, mas não foi encontrado nenhum nome correspondente.',
                result.count ? 'sucesso' : 'info'
            );
        } catch (error) {
            showMessage(error.message || 'Erro ao processar o PDF.', 'erro');
        } finally {
            $('#funlearn-submit').disabled = false;
        }
    });

    // Só depois de verificar a sessão é que tentamos ler dados privados.
    const session = await getSession();

    if (!session) {
        return;
    }

    try {
        await loadProfile(session.user);
        renderProfile();
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        clearPrivateUI();
        showMessage(
            'A conta autenticada ainda não está associada a um registo de sócio ativo.',
            'erro'
        );
    }
}

supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
        clearPrivateUI();
    }
});

init().catch((error) => {
    console.error('Erro de inicialização:', error);
    clearPrivateUI();
    showMessage('Não foi possível inicializar a área de sócios.', 'erro');
});
