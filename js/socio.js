import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Exposição controlada para os módulos integrados (Ações, Drº Árbitro e Administração).
window.__NAF_SUPABASE = supabase;
const ADMIN_NUMERO = 9999;

const state = {
    user: null,
    socio: null,
    admin: false,
    adminSocios: [],
    selectedSocios: new Set(),
    adminLoaded: false,
    adminLoading: false
};

async function loadPublicMembers() {
    const root = document.getElementById('public-members-list');
    if (!root) return;

    try {
        const client = supabase;
        const { data, error } = await client.rpc('socios_publicos_por_categoria');

        if (error) throw error;

        const groups = {
            Futebol: [],
            Futsal: []
        };

        (data || []).forEach(row => {
            const modalidade =
                String(row.modalidade || '').toLowerCase() === 'futsal'
                    ? 'Futsal'
                    : 'Futebol';

            if (!row.categoria || !row.nome) return;

            (groups[modalidade] ||= []).push({
                categoria: String(row.categoria),
                nome: String(row.nome)
            });
        });

        const order = {
            Futebol: [
                'C1',
                'C2',
                'C3',
                'C4',
                'C4 Core',
                'C5',
                'C6',
                'C7',
                'Cj',
                'CF1',
                'CF2',
                'CF3',
                'CF4'
            ],
            Futsal: [
                'C1',
                'C2',
                'C3',
                'C4',
                'C5',
                'C6',
                'C7',
                'Cj',
                'CFF1',
                'CFF2'
            ]
        };

        const norm = value =>
            value.trim().toLowerCase();

        root.innerHTML = '';

        Object.entries(groups).forEach(([modalidade, rows]) => {
            const cats = [
                ...new Set(rows.map(row => row.categoria))
            ].sort((a, b) => {
                const ia = order[modalidade].findIndex(
                    x => norm(x) === norm(a)
                );

                const ib = order[modalidade].findIndex(
                    x => norm(x) === norm(b)
                );

                return (
                    (ia < 0 ? 999 : ia) -
                    (ib < 0 ? 999 : ib)
                ) || a.localeCompare(b, 'pt');
            });

            if (!cats.length) return;

            const group = document.createElement('section');
            group.className = 'public-members-group';

            group.innerHTML = `
                <h3>${modalidade}</h3>
                <div class="public-category-row"></div>
            `;

            const rowEl =
                group.querySelector('.public-category-row');

            cats.forEach(cat => {
                const members = rows
                    .filter(
                        row =>
                            norm(row.categoria) === norm(cat)
                    )
                    .sort(
                        (a, b) =>
                            a.nome.localeCompare(
                                b.nome,
                                'pt'
                            )
                    );

                const wrap =
                    document.createElement('div');

                wrap.className = 'public-category';

                const button =
                    document.createElement('button');

                button.type = 'button';
                button.className =
                    'public-category-trigger';
                button.textContent = cat;
                button.setAttribute(
                    'aria-expanded',
                    'false'
                );

                const panel =
                    document.createElement('div');

                panel.className =
                    'public-category-members';

                const ul =
                    document.createElement('ul');

                members.forEach(member => {
                    const li =
                        document.createElement('li');

                    li.textContent = member.nome;

                    ul.appendChild(li);
                });

                panel.appendChild(ul);

                wrap.append(
                    button,
                    panel
                );

                rowEl.appendChild(wrap);

                button.addEventListener(
                    'click',
                    () => {
                        if (
                            window.matchMedia(
                                '(max-width: 700px)'
                            ).matches
                        ) {
                            const open =
                                !wrap.classList.contains(
                                    'open'
                                );

                            document
                                .querySelectorAll(
                                    '.public-category.open'
                                )
                                .forEach(x => {
                                    x.classList.remove(
                                        'open'
                                    );

                                    x.querySelector(
                                        'button'
                                    )?.setAttribute(
                                        'aria-expanded',
                                        'false'
                                    );
                                });

                            wrap.classList.toggle(
                                'open',
                                open
                            );

                            button.setAttribute(
                                'aria-expanded',
                                String(open)
                            );
                        }
                    }
                );
            });

            root.appendChild(group);
        });

        if (!root.children.length) {
            root.innerHTML =
                '<div class="vazio">Não existem categorias com sócios ativos.</div>';
        }
    } catch (error) {
        console.error(
            'Sócios públicos:',
            error
        );

        root.innerHTML =
            '<div class="vazio">Não foi possível carregar a lista de sócios.</div>';
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
    state.adminLoaded = false;
    state.adminLoading = false;

    if ($('#login-panel')) $('#login-panel').hidden = false;
    if ($('#dashboard')) $('#dashboard').hidden = true;
    if ($('#admin-panel')) $('#admin-panel').hidden = true;
    const adminTab = $('#admin-tab');
    if (adminTab) {
        adminTab.hidden = true;
        adminTab.classList.remove('admin-visible');
    }

    const clearIds = [
        '#socio-name', '#socio-number', '#dados-nome', '#dados-numero',
        '#dados-nif', '#dados-nascimento', '#dados-naturalidade',
        '#dados-cartao-cidadao', '#dados-profissao', '#dados-email',
        '#dados-morada', '#dados-localidade', '#dados-codigo-postal',
        '#dados-telemovel', '#dados-arbitro', '#dados-af',
        '#dados-modalidade', '#funlearn-total', '#funlearn-total-top'
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

    const { data, error } = await supabase
        .from('socios')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .single();

    if (error) throw error;
    if (!data) throw new Error('A conta autenticada não está associada a um sócio ativo.');

    state.user = user;
    state.socio = data;

    /*
     * ADMINISTRACAO
     *
     * Qualquer socio marcado como is_admin pode usar a area
     * administrativa. O socio 9999 continua a ser o administrador
     * principal e a regra de permissoes sensiveis e tratada
     * separadamente por assertPrincipalAdmin().
     */
    state.admin =
        data.is_admin === true &&
        data.ativo === true;

    updateAdminVisibility();
}

function updateAdminVisibility() {
    const adminTab = $('#admin-tab');
    const adminPanel = $('#admin-panel');
    const adminSection = $('#administracao');

    if (adminTab) {
        adminTab.hidden = !state.admin;
        adminTab.classList.toggle('admin-visible', state.admin);
        adminTab.setAttribute('aria-hidden', String(!state.admin));
    }

    if (adminPanel) {
        adminPanel.hidden = !state.admin;
    }

    if (adminSection && !state.admin) {
        adminSection.hidden = true;
        adminSection.classList.remove('active');
    }

    syncMobileTabSelector();
}

function isPrincipalAdmin() {
    return state.admin &&
        Number(state.socio?.numero_socio) === ADMIN_NUMERO;
}

async function assertPrincipalAdmin() {
    const session = await getSession();
    if (!session) throw new Error('Sessao nao autenticada.');

    const { data, error } = await supabase
        .from('socios')
        .select('id,numero_socio,is_admin,ativo')
        .eq('user_id', session.user.id)
        .eq('ativo', true)
        .single();

    if (error) throw error;

    if (
        data.is_admin !== true ||
        Number(data.numero_socio) !== ADMIN_NUMERO
    ) {
        throw new Error('Esta operacao esta reservada ao administrador principal.');
    }

    return session;
}

function loadStylesheetOnce(href) {
    const absolute = new URL(href, window.location.href).href;
    if ([...document.querySelectorAll('link[rel="stylesheet"]')].some(link => link.href === absolute)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.nafAdminStyle = 'true';
    document.head.appendChild(link);
}

async function loadScriptOnce(src) {
    const existing = document.querySelector(`script[data-naf-src="${src}"]`);
    if (existing) return;

    await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.dataset.nafSrc = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
        document.head.appendChild(script);
    });
}

async function loadIntegratedAdmin() {
    if (!state.admin) return;

    const host = $('#integrated-admin-host');
    const loading = $('#integrated-admin-loading');
    const errorBox = $('#integrated-admin-error');
    if (!host || state.adminLoading) return;
    if (state.adminLoaded) return;

    state.adminLoading = true;
    try {
        if (loading) loading.hidden = false;
        if (errorBox) errorBox.hidden = true;

        // O admin continua a ser a fonte oficial do HTML administrativo.
        // Apenas o seu conteúdo é colocado dentro da aba; não existe iframe.
        const response = await fetch(`admin.html?embedded=1&_=${Date.now()}`, { cache:'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar a área administrativa.');

        const adminHtml = await response.text();
        const doc = new DOMParser().parseFromString(adminHtml, 'text/html');
        const source = doc.querySelector('#admin-app');
        if (!source) throw new Error('O admin.html não contém #admin-app.');

        // O admin.html traz o seu próprio CSS através do <head>, mas ao
        // integrar apenas #admin-app esse <head> não é copiado.
        // Carregamos o CSS oficial da administração e mantemos a classe
        // admin-modern no contentor, para que o grafismo seja exatamente
        // o mesmo da página administrativa autónoma.
        loadStylesheetOnce('css/admin.css?v=20260823-admin-final');
        loadStylesheetOnce('css/acoes.css?v=20260823-admin-final');
        loadStylesheetOnce('css/acoes-admin.css?v=20260823-admin-final');

        const clone = source.cloneNode(true);
        clone.hidden = false;
        clone.classList.add('admin-modern');
        host.replaceChildren(clone);
        host.hidden = false;

        // Carregamos exatamente os módulos que o admin.html usa.
        if (!window.supabase?.createClient) {
            await loadScriptOnce('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
        }
        await loadScriptOnce('js/admin-config.js?v=20260820-clean');
        await loadScriptOnce('js/admin.js?v=20260820-clean');
        await loadScriptOnce('js/admin-criar-socio.js?v=20260820-clean');
        await loadScriptOnce('js/admin-import-socios-excel.js?v=20260823-final');
        await loadScriptOnce('js/admin-quotas-manual.js?v=20260820-clean');
        await loadScriptOnce('js/admin-excel.js?v=20260820-clean');
        await loadScriptOnce('js/dr-arbitro.js?v=20260820-clean');
        await loadScriptOnce('js/acoes-admin.js?v=20260823-final');
        try { await import(`./admin-questoes.js?v=20260823-final`); } catch (questionError) { console.error('Questões administrativas:', questionError); }
        window.bindAdminExcel?.();
        window.bindAdminQuotasManual?.();

        // Todos os refreshes futuros passam por este wrapper, para que
        // a coluna Admin seja reconstruída depois de cada renderização.
        if (typeof window.loadMembers === 'function' && !window.__NAF_LOAD_MEMBERS_WRAPPED) {
            const originalLoadMembers = window.loadMembers;
            window.loadMembers = async (...args) => {
                const result = await originalLoadMembers(...args);
                await patchAdminPermissionColumn();
                return result;
            };
            window.__NAF_LOAD_MEMBERS_WRAPPED = true;
        }

        await new Promise(r => setTimeout(r, 50));
        buildIntegratedAdminTabs();
        patchAdminPermissionColumn();

        if (typeof window.loadMembers === 'function') {
            await window.loadMembers();
        }
        patchAdminPermissionColumn();
        window.loadAdminQuestions?.();

        if (loading) loading.hidden = true;
        state.adminLoaded = true;
    } catch (error) {
        console.error('Administração integrada:', error);
        if (loading) loading.hidden = true;
        if (errorBox) {
            errorBox.textContent = error.message || 'Não foi possível carregar a administração.';
            errorBox.hidden = false;
        }
    } finally {
        state.adminLoading = false;
    }
}

function buildIntegratedAdminTabs() {
    const host = $('#integrated-admin-host');
    if (!host || host.querySelector('.socio-admin-subtabs')) return;

    const app = host.querySelector('#admin-app');
    if (!app) return;

    const panels = {
        socios: app.querySelector('#panel-socios'),
        email: app.querySelector('#panel-email'),
        funlearn: app.querySelector('#panel-funlearn'),
        dr: app.querySelector('#panel-dr-arbitro'),
        questoes: app.querySelector('#panel-questoes'),
        acoes: app.querySelector('#panel-acoes'),
        quotas: app.querySelector('#panel-quotas'),
        admins: app.querySelector('#panel-admins')
    };

    if (!panels.socios || !panels.email || !panels.funlearn || !panels.dr || !panels.questoes || !panels.acoes) {
        throw new Error('A estrutura administrativa esperada não foi encontrada.');
    }

    if (panels.admins) panels.admins.hidden = true;

    const subtabs = document.createElement('div');
    subtabs.className = 'socio-admin-subtabs';
    subtabs.setAttribute('role', 'tablist');
    subtabs.setAttribute('aria-label', 'Secções da administração');
    subtabs.innerHTML = `
        <button type="button" class="socio-admin-subtab active" role="tab" aria-selected="true" data-admin-section="socios">Sócios</button>
        <button type="button" class="socio-admin-subtab" role="tab" aria-selected="false" data-admin-section="email">Email</button>
        <button type="button" class="socio-admin-subtab" role="tab" aria-selected="false" data-admin-section="funlearn">Fun&amp;Learn</button>
        <button type="button" class="socio-admin-subtab" role="tab" aria-selected="false" data-admin-section="dr-arbitro">Drº Árbitro</button>
        <button type="button" class="socio-admin-subtab" role="tab" aria-selected="false" data-admin-section="questoes">Questões</button>
        <button type="button" class="socio-admin-subtab" role="tab" aria-selected="false" data-admin-section="acoes">Ações</button>
    `;

    const groups = {};
    for (const name of ['socios','email','funlearn','dr','questoes','acoes']) {
        const group = document.createElement('div');
        const sectionName = name === 'dr' ? 'dr-arbitro' : name;
        group.className = `integrated-admin-group${name === 'socios' ? ' active' : ''}`;
        group.dataset.adminGroup = sectionName;
        group.appendChild(panels[name]);
        if (name === 'socios' && panels.quotas) group.appendChild(panels.quotas);
        groups[sectionName] = group;
    }

    app.append(subtabs, ...Object.values(groups));

    const activate = (name) => {
        subtabs.querySelectorAll('.socio-admin-subtab').forEach(button => {
            const active = button.dataset.adminSection === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });
        Object.values(groups).forEach(group => {
            group.classList.toggle('active', group.dataset.adminGroup === name);
        });

        if (name === 'acoes') window.loadAcoesAdmin?.();
        if (name === 'questoes') window.loadAdminQuestions?.();
        if (name === 'dr-arbitro') window.NAF_DR_ARBITRO_START?.();
    };

    subtabs.querySelectorAll('.socio-admin-subtab').forEach(button => {
        button.addEventListener('click', () => activate(button.dataset.adminSection));
    });
}

async function getAdminMembersMap() {
    const client = window.__NAF_SUPABASE || supabase;
    const { data, error } = await client.rpc('admin_listar_socios');
    if (error) throw error;
    return new Map((data || []).map(m => [String(m.id), m]));
}

async function patchAdminPermissionColumn() {
    const host = $('#integrated-admin-host');
    const body = host?.querySelector('#members-body');
    const table = host?.querySelector('.admin-table');
    if (!host || !body || !table) return;

    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('.admin-permission-col')) {
        const th = document.createElement('th');
        th.className = 'admin-permission-col';
        th.textContent = 'Admin';
        const actions = headerRow.lastElementChild;
        headerRow.insertBefore(th, actions);
    }

    let members;
    try {
        members = await getAdminMembersMap();
    } catch (error) {
        console.error('Não foi possível obter as permissões administrativas:', error);
        return;
    }

    const principal = isPrincipalAdmin();

    body.querySelectorAll('tr').forEach(row => {
        if (row.querySelector('.admin-permission-cell')) return;
        const check = row.querySelector('.member-check');
        const actions = row.lastElementChild;
        if (!check || !actions) return;

        const member = members.get(String(check.value));
        if (!member) return;

        const cell = document.createElement('td');
        cell.className = 'admin-permission-cell';

        const isMemberPrincipal = Number(member.numero_socio) === ADMIN_NUMERO;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `admin-small-btn admin-permission-button ${member.is_admin ? 'danger' : 'primary'}`;

        if (isMemberPrincipal) {
            button.textContent = 'ADMIN PRINCIPAL';
            button.disabled = true;
        } else if (!principal) {
            button.textContent = member.is_admin ? 'Admin' : 'Sócio';
            button.disabled = true;
        } else {
            button.textContent = member.is_admin ? 'Retirar admin' : 'Dar admin';
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    const client = window.__NAF_SUPABASE || supabase;
                    const { error } = await client.rpc('admin_definir_admin', {
                        p_socio_id: member.id,
                        p_is_admin: !member.is_admin
                    });
                    if (error) throw error;
                    await window.loadMembers();
                    await patchAdminPermissionColumn();
                    showMessage('Permissões de administrador atualizadas.', 'sucesso');
                } catch (error) {
                    console.error(error);
                    showMessage(error.message || 'Não foi possível alterar a permissão.', 'erro');
                    button.disabled = false;
                }
            });
        }

        cell.appendChild(button);
        row.insertBefore(cell, actions);
    });
}


function renderProfile() {
    const s = state.socio;
    if (!s) return;

    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;
    updateAdminVisibility();

    $('#socio-name').textContent = s.nome || 'Sócio';
    $('#socio-number').textContent = s.numero_socio ?? '—';

    $('#dados-nome').textContent = s.nome || '—';
    $('#dados-numero').textContent = s.numero_socio ?? '—';
    $('#dados-nif').textContent = s.nif || '—';
    $('#dados-nascimento').textContent = s.data_nascimento
        ? new Date(`${s.data_nascimento}T00:00:00`).toLocaleDateString('pt-PT')
        : '—';
    $('#dados-naturalidade').textContent = s.naturalidade || '—';
    $('#dados-cartao-cidadao').textContent = s.cartao_cidadao || '—';
    $('#dados-profissao').textContent = s.profissao || '—';
    $('#dados-morada').textContent = s.morada || '—';
    $('#dados-localidade').textContent = s.localidade || '—';
    $('#dados-codigo-postal').textContent = s.codigo_postal || '—';
    $('#dados-email').textContent = s.email || state.user?.email || '—';
    $('#dados-telemovel').textContent = s.telemovel || '—';
    $('#dados-arbitro').textContent = s.numero_arbitro || '—';
    $('#dados-af').textContent = s.associacao_futebol || '—';
    $('#dados-modalidade').textContent = s.modalidade || '—';
    if ($('#dados-categoria')) $('#dados-categoria').textContent = s.categoria || '—';

    fillEditForms();
    loadPhoto();
    loadQuotas();
    loadDocuments();
    loadFunlearn();

    if (state.admin) {
        updateAdminVisibility();
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
    // O HTML publicado chegou a conter mais do que uma secção de quotas.
    // Mantemos apenas a primeira secção com id="quotas" para evitar IDs duplicados.
    const sections = [...document.querySelectorAll('section#quotas')];
    if (sections.length > 1) {
        sections.slice(1).forEach(section => section.remove());
    }

    // Também pode existir mais do que um elemento #quotas-list.
    // O primeiro pertence à secção oficial; os restantes são removidos.
    const lists = [...document.querySelectorAll('#quotas-list')];
    if (lists.length > 1) {
        lists.slice(1).forEach(list => list.remove());
    }
}

function quotaStatusLabel(status) {
    const normalized = String(status || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (['paga', 'pago', 'regularizada', 'regularizado', 'liquidada', 'liquidado'].includes(normalized)) {
        return 'Paga';
    }
    if (['em_atraso', 'em atraso', 'atrasada', 'atrasado', 'vencida', 'vencido'].includes(normalized)) {
        return 'Em atraso';
    }
    if (['pendente', 'por_pagar', 'por pagar'].includes(normalized)) {
        return 'Pendente';
    }
    return status ? String(status) : 'Por regularizar';
}

function quotaStatusClass(status) {
    const label = quotaStatusLabel(status).toLowerCase();
    if (label === 'paga') return 'quota-paga';
    if (label === 'em atraso') return 'quota-atraso';
    return 'quota-pendente';
}

function formatQuotaMonth(year, month) {
    if (!year || !month) return '';
    const date = new Date(Number(year), Number(month) - 1, 1);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
}

async function loadQuotas() {
    cleanupDuplicateQuotaMarkup();

    const el = $('#quotas-list');
    if (!el || !state.socio?.id) return;

    // Nunca deixamos o texto estático "A carregar…" se a consulta falhar.
    el.innerHTML = '<div class="vazio">A carregar quotas…</div>';

    try {
        const { data, error } = await supabase
            .from('quotas')
            .select('ano,mes,valor,pago,estado')
            .eq('socio_id', state.socio.id)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false });

        if (error) {
            console.error('Erro ao carregar quotas:', error);
            throw error;
        }

        const quotas = Array.isArray(data) ? data : [];

        if (!quotas.length) {
            el.innerHTML = `<div class="vazio">${escapeHtml(
                state.socio.quotas || 'Não existem quotas registadas.'
            )}</div>`;
            return;
        }

        const current = new Date();
        const currentMonth = new Date(current.getFullYear(), current.getMonth(), 1);

        const quotaDueDate = (q) => {
            const year = Number(q.ano);
            const month = Number(q.mes || 12);
            if (!Number.isInteger(year) || year < 1900 || !Number.isInteger(month) || month < 1 || month > 12) {
                return null;
            }
            return new Date(year, month - 1, 1);
        };

        const isPaidQuota = (q) => {
            const status = String(q.estado || '').trim().toLowerCase();
            return q.pago === true || ['pago', 'paga', 'isento', 'anulado'].includes(status);
        };

        const isOverdueQuota = (q) => {
            const dueDate = quotaDueDate(q);
            return !isPaidQuota(q) && dueDate !== null && dueDate < currentMonth;
        };

        const isPendingQuota = (q) => !isPaidQuota(q) && !isOverdueQuota(q);

        const atrasadas = quotas.filter(isOverdueQuota);
        const pagas = quotas.filter(isPaidQuota);
        const pendentes = quotas.filter(isPendingQuota);

        const resumo = `
            <div class="vazio">
                ${atrasadas.length ? `<strong>Quotas em atraso: ${atrasadas.length}</strong>` : 'Quotas regularizadas.'}
                ${pagas.length ? ` • ${pagas.length} pagas` : ''}
            </div>`;

        const linhas = quotas.map(q => {
            const periodo = formatQuotaMonth(q.ano, q.mes) ||
                [q.ano, q.mes].filter(Boolean).join('/');
            const valor = q.valor !== null && q.valor !== undefined && q.valor !== ''
                ? `${Number(q.valor).toFixed(2).replace('.', ',')} €`
                : '';
            const estado = isPaidQuota(q)
                ? 'Paga'
                : (isOverdueQuota(q) ? 'Em atraso' : 'Pendente');

            return `
                <div class="quota-row">
                    <div>
                        <strong>${escapeHtml(periodo || 'Quota')}</strong>
                        ${valor ? `<small>${escapeHtml(valor)}</small>` : ''}
                    </div>
                    <span class="${quotaStatusClass(q.estado)}">${escapeHtml(estado)}</span>
                </div>`;
        }).join('');

        el.innerHTML = resumo + `<div class="quotas-tabela">${linhas}</div>`;
    } catch (error) {
        // Se a tabela ainda não existir ou as políticas RLS impedirem a leitura,
        // mostramos uma mensagem útil em vez de deixar "A carregar…" para sempre.
        const fallback = state.socio.quotas
            ? escapeHtml(state.socio.quotas)
            : 'Não foi possível carregar as quotas neste momento.';
        el.innerHTML = `<div class="vazio">${fallback}</div>`;
    }
}

function ensureQuotaUploadStatus() {
    const input = $('#quota-comprovativo');
    if (!input) return null;

    let status = $('#quota-comprovativo-file-name');
    if (!status) {
        status = document.createElement('div');
        status.id = 'quota-comprovativo-file-name';
        status.className = 'admin-result';
        status.hidden = true;
        input.closest('.upload-box')?.insertAdjacentElement('afterend', status);
    }

    return status;
}

async function uploadQuotaComprovativo(file) {
    if (!state.socio?.id) throw new Error('É necessário iniciar sessão para enviar um comprovativo.');
    if (!file || file.type !== 'application/pdf') throw new Error('O comprovativo tem de ser um ficheiro PDF.');
    if (file.size > 8 * 1024 * 1024) throw new Error('O comprovativo não pode ultrapassar 8 MB.');

    const status = ensureQuotaUploadStatus();
    if (status) {
        status.hidden = false;
        status.className = 'admin-result';
        status.textContent = `Ficheiro selecionado: ${file.name} — a enviar…`;
    }

    const { data: quotas, error: quotaError } = await supabase
        .from('quotas')
        .select('id,ano,mes,valor,pago,estado')
        .eq('socio_id', state.socio.id)
        .order('ano', { ascending: true })
        .order('mes', { ascending: true });

    if (quotaError) throw quotaError;

    const unpaid = (quotas || []).filter(q => {
        const estado = String(q.estado || 'pendente').trim().toLowerCase();
        return q.pago !== true && !['pago', 'paga', 'isento', 'anulado'].includes(estado);
    });

    if (!unpaid.length) throw new Error('Não existem quotas por regularizar para associar a este comprovativo.');

    /* O comprovativo é associado à quota em dívida mais antiga. */
    const quota = unpaid[0];
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
        .from('comprovativos-quotas')
        .upload(path, file, {
            contentType: 'application/pdf',
            upsert: false
        });

    if (uploadError) throw uploadError;

    try {
        const { error: dbError } = await supabase
            .from('quota_comprovativos')
            .insert({
                quota_id: quota.id,
                socio_id: state.socio.id,
                storage_path: path,
                nome_ficheiro: file.name,
                tamanho_bytes: file.size,
                tipo_mime: 'application/pdf',
                estado: 'pendente',
                submitted_at: new Date().toISOString()
            });

        if (dbError) throw dbError;
    } catch (error) {
        await supabase.storage.from('comprovativos-quotas').remove([path]).catch(() => {});
        throw error;
    }

    if (status) {
        status.hidden = false;
        status.className = 'admin-result success';
        const periodo = formatQuotaMonth(quota.ano, quota.mes) || `${quota.ano}/${quota.mes}`;
        status.textContent = `Comprovativo “${file.name}” enviado com sucesso e associado à quota ${periodo}. Aguarda validação.`;
    }

    await loadQuotas();
}

async function loadDocuments() {
    const list = $('#docs-list');
    if (!list || !state.socio) return;

    const { data, error } = await supabase
        .from('documentos_socios')
        .select('*')
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

    list.innerHTML = '';

    for (const record of documents) {
        let signedUrl = null;

        if (record.storage_path) {
            const result = await supabase.storage
                .from('documentos-socios')
                .createSignedUrl(record.storage_path, 3600);

            if (!result.error) signedUrl = result.data?.signedUrl || null;
        }

        const item = document.createElement('div');
        item.className = 'documento-socio-item';

        item.innerHTML = `
            <div>
                <strong>📄 ${escapeHtml(record.nome_ficheiro || 'Documento PDF')}</strong>
                <small>${record.created_at
                    ? new Date(record.created_at).toLocaleDateString('pt-PT')
                    : ''}</small>
            </div>
            ${signedUrl ? `<a class="botao" href="${signedUrl}" target="_blank" rel="noopener">Abrir</a>` : ''}
        `;

        list.appendChild(item);
    }
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


function setupArbitragemSelectors() {
    const modality = $('#edit-modalidade');
    const category = $('#edit-categoria');
    if (!modality || !category) return;

    const categories = {
        Futebol: ['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
        Futsal: ['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
    };

    const refresh = () => {
        const current = category.value || state.socio?.categoria || '';
        const values = categories[modality.value] || [];
        category.innerHTML = '<option value="">Selecionar categoria</option>' +
            values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
        category.disabled = values.length === 0;
        if (current && values.includes(current)) category.value = current;
    };

    if (!modality.dataset.categoryBound) {
        modality.dataset.categoryBound = '1';
        modality.addEventListener('change', refresh);
    }
    refresh();
}

function fillEditForms() {
    const s = state.socio;
    if (!s) return;

    $('#edit-nome').value = s.nome || '';
    $('#edit-numero').value = s.numero_socio ?? '';
    $('#edit-nascimento').value = s.data_nascimento || '';
    $('#edit-email').value = s.email || state.user?.email || '';
    $('#edit-morada').value = s.morada || '';
    $('#edit-telemovel').value = s.telemovel || '';
    $('#edit-arbitro').value = s.numero_arbitro || '';
    $('#edit-af').value = s.associacao_futebol || '';
    $('#edit-modalidade').value = s.modalidade || '';
    setupArbitragemSelectors();
    $('#edit-categoria').value = s.categoria || '';
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

async function saveArbitragemData() {
    await saveProfileFields({
        data_nascimento: state.socio.data_nascimento,
        morada: state.socio.morada,
        email: state.socio.email || state.user.email,
        telemovel: state.socio.telemovel,
        numero_arbitro: $('#edit-arbitro').value || null,
        associacao_futebol: $('#edit-af').value || null,
        modalidade: $('#edit-modalidade').value || null,
        categoria: $('#edit-categoria').value || null
    });
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
        data.is_admin !== true ||
        data.ativo !== true
    ) {
        throw new Error('Acesso reservado a administradores autorizados.');
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

    const { data, error } = await supabase
        .from('socios')
        .select('id,numero_socio,nome,email,telemovel,ativo,user_id')
        .order('numero_socio', { ascending: true });

    if (error) {
        $('#admin-socios-lista').innerHTML =
            `<div class="vazio">${escapeHtml(error.message)}</div>`;
        return;
    }

    const rows = data || [];
    state.adminSocios = rows;

    $('#admin-socios-lista').innerHTML = rows.length
        ? rows.map(s => `
            <label class="admin-socio-row">
                <input
                    class="admin-socio-select"
                    type="checkbox"
                    value="${escapeHtml(s.id)}"
                    data-name="${escapeHtml(s.nome || '')}"
                >
                <span class="admin-socio-numero">${escapeHtml(s.numero_socio)}</span>
                <span class="admin-socio-main">
                    <strong>${escapeHtml(s.nome)}</strong>
                    <small>${escapeHtml(s.email || 'Sem email')} · ${escapeHtml(s.telemovel || 'Sem telemóvel')}</small>
                </span>
                <span class="admin-socio-status ${s.ativo ? 'ativo' : 'inativo'}">
                    ${s.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </label>
        `).join('')
        : '<div class="vazio">Ainda não existem sócios.</div>';

    const select = $('#admin-remove-socio');
    if (select) {
        select.innerHTML = rows
            .filter(s => s.ativo)
            .map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.numero_socio)} — ${escapeHtml(s.nome)}</option>`)
            .join('');
    }
}

function selectedSocioIds() {
    return $$('.admin-socio-select:checked').map(el => el.value);
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
    const select = $('#socio-tab-select');
    if (!select) return;

    const buttons = $$('.socio-tab').filter(button => !button.hidden);
    const active = buttons.find(button => button.classList.contains('active'))?.dataset.tab;
    const current = select.value;

    select.innerHTML = buttons.map(button =>
        `<option value="${escapeHtml(button.dataset.tab || '')}">${escapeHtml(button.textContent.trim())}</option>`
    ).join('');

    select.value = buttons.some(button => button.dataset.tab === current)
        ? current
        : (active || buttons[0]?.dataset.tab || '');
}

function activateSocioTab(tabName) {
    const button = $$('.socio-tab').find(item =>
        item.dataset.tab === tabName && !item.hidden
    );

    if (!button) return;

    $$('.socio-tab').forEach(item => item.classList.remove('active'));
    $$('.socio-tab-content').forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === 'administracao') panel.hidden = true;
    });

    button.classList.add('active');

    const panel = document.getElementById(tabName);
    if (panel) {
        panel.classList.add('active');
        if (panel.id === 'administracao') panel.hidden = false;
    }

    const select = $('#socio-tab-select');
    if (select) select.value = tabName;

    if (tabName === 'administracao' && state.admin) {
        loadIntegratedAdmin();
    }
}

window.NAF_ACTIVATE_SOCIO_TAB = activateSocioTab;
window.NAF_SYNC_MOBILE_TABS = syncMobileTabSelector;

function setupTabs() {
    $$('.socio-tab').forEach(button => {
        if (button.dataset.bound === '1') return;
        button.dataset.bound = '1';
        button.addEventListener('click', () => activateSocioTab(button.dataset.tab));
    });

    const select = $('#socio-tab-select');
    if (select && !select.dataset.bound) {
        select.dataset.bound = '1';
        select.addEventListener('change', event => activateSocioTab(event.target.value));
    }

    syncMobileTabSelector();
    updateAdminVisibility();
}


async function init() {
    // A publicação dos sócios é pública e independente do login.
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

    $('#photo-trigger')?.addEventListener('click', () => {
        $('#photo-input')?.click();
    });

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

    $('#quota-comprovativo')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        const status = ensureQuotaUploadStatus();

        if (!file) {
            if (status) status.hidden = true;
            return;
        }

        if (status) {
            status.hidden = false;
            status.className = 'admin-result';
            status.textContent = `Ficheiro selecionado: ${file.name}`;
        }

        try {
            await uploadQuotaComprovativo(file);
            showMessage('Comprovativo enviado e associado à quota em dívida mais antiga.', 'sucesso');
        } catch (error) {
            console.error('[QUOTAS] Comprovativo:', error);
            if (status) {
                status.hidden = false;
                status.className = 'admin-result error';
                status.textContent = error?.message || String(error);
            }
            showMessage(error?.message || 'Não foi possível enviar o comprovativo.', 'erro');
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
            await sendQuotasEmAtraso();
            showMessage('Email de quotas em atraso enviado aos sócios selecionados.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível enviar os emails.', 'erro');
        } finally {
            $('#admin-quotas-atraso').disabled = false;
        }
    });

    $('#admin-documento-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const file = $('#admin-documento-file')?.files?.[0];

        try {
            await sendDocumentoTodos(file);
            event.currentTarget.reset();
            showMessage('Documento enviado para toda a lista de sócios.', 'sucesso');
        } catch (error) {
            showMessage(error.message || 'Não foi possível enviar o documento.', 'erro');
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

    // O módulo de Ações é carregado apenas para utilizadores autenticados.
    // Isto mantém a área pública e as restantes funções independentes.
    try {
        await loadScriptOnce('js/acoes-socio.js?v=20260826-1');
    } catch (error) {
        console.error('Ações do sócio:', error);
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

supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session) {
        clearPrivateUI();
        return;
    }

    /*
     * O evento auth pode disparar antes do init terminar.
     * Revalidamos o perfil e atualizamos a interface sem
     * redirecionar administradores.
     */
    try {
        await loadProfile(session.user);
        renderProfile();
    } catch (error) {
        console.error('Erro ao validar a sessao:', error);
    }
});

init().catch((error) => {
    console.error('Erro de inicialização:', error);
    clearPrivateUI();
    showMessage('Não foi possível inicializar a área de sócios.', 'erro');
});