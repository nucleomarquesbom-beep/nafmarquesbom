import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_NUMERO = 9999;

const state = {
    user: null,
    socio: null,
    admin: false
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
}[c]));

function msg(text, type = 'info', target = '#socio-message') {
    const el = $(target);
    if (!el) return;
    el.textContent = text;
    el.className = `socio-message ${type}`;
    el.hidden = false;
}

function clearPrivateUI() {
    state.user = null;
    state.socio = null;
    state.admin = false;

    $('#login-panel') && ($('#login-panel').hidden = false);
    $('#dashboard') && ($('#dashboard').hidden = true);
    $('#admin-panel') && ($('#admin-panel').hidden = true);

    [
        '#socio-name', '#socio-number', '#funlearn-total',
        '#funlearn-total-top'
    ].forEach((id) => {
        const el = $(id);
        if (el) el.textContent = '—';
    });

    const photo = $('#socio-photo');
    const avatar = $('#socio-avatar');
    if (photo) {
        photo.removeAttribute('src');
        photo.hidden = true;
    }
    if (avatar) avatar.hidden = false;
}

async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session || null;
}

async function loadProfile(user) {
    if (!user?.id) throw new Error('Utilizador autenticado inválido.');

    const { data, error } = await supabase
        .from('socios')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .maybeSingle();

    if (error) throw error;
    if (!data) {
        throw new Error('A conta autenticada não está associada a um sócio ativo.');
    }

    state.user = user;
    state.socio = data;
    state.admin =
        Number(data.numero_socio) === ADMIN_NUMERO &&
        data.is_admin === true &&
        data.ativo === true;
}

function setupTabs() {
    $$('.socio-tab').forEach((button) => {
        button.addEventListener('click', () => {
            $$('.socio-tab').forEach((item) => item.classList.remove('active'));
            $$('.socio-tab-content').forEach((panel) => panel.classList.remove('active'));

            button.classList.add('active');

            const panelId = `#tab-${button.dataset.tab}`;
            const panel = $(panelId);

            if (panel) {
                panel.classList.add('active');
            }
        });
    });
}

async function loadPhoto() {
    const photo = $('#socio-photo');
    const avatar = $('#socio-avatar');

    if (!photo || !avatar || !state.socio) return;

    const path = state.socio.fotografia_path || null;

    if (!path) {
        photo.removeAttribute('src');
        photo.hidden = true;
        avatar.hidden = false;
        return;
    }

    if (/^https?:\/\//i.test(path)) {
        photo.src = path;
        photo.hidden = false;
        avatar.hidden = true;
        return;
    }

    const { data, error } = await supabase
        .storage
        .from('fotografias-socios')
        .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
        photo.removeAttribute('src');
        photo.hidden = true;
        avatar.hidden = false;
        return;
    }

    photo.src = `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(path)}`;
    photo.hidden = false;
    avatar.hidden = true;
}

async function uploadPhoto(file) {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        throw new Error('A fotografia deve ser JPG, PNG ou WEBP.');
    }

    if (file.size > 6 * 1024 * 1024) {
        throw new Error('A fotografia não pode ultrapassar 6 MB.');
    }

    const extension = file.type === 'image/jpeg'
        ? 'jpg'
        : file.type.split('/')[1];

    const oldPath = state.socio.fotografia_path || null;
    const path = `${state.socio.id}/fotografia-${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase
        .storage
        .from('fotografias-socios')
        .upload(path, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
        .from('socios')
        .update({ fotografia_path: path })
        .eq('id', state.socio.id)
        .eq('user_id', state.user.id);

    if (dbError) {
        await supabase.storage.from('fotografias-socios').remove([path]);
        throw dbError;
    }

    state.socio.fotografia_path = path;

    if (oldPath) {
        await supabase.storage
            .from('fotografias-socios')
            .remove([oldPath]);
    }

    await loadPhoto();
}

function quotaStateLabel(value) {
    const s = String(value ?? '').trim().toLowerCase();

    if (!s) return 'Estado não definido';

    if (['paga', 'pago', 'pagas', 'pagos', 'regular', 'regularizada', 'regularizado', 'em dia'].includes(s)) {
        return 'Quotas regularizadas';
    }

    if (['em_atraso', 'em atraso', 'atrasada', 'atrasado', 'unpaid', 'pending'].includes(s)) {
        return 'Quotas em atraso';
    }

    return String(value);
}

async function loadQuotas() {
    const list = $('#quotas-list');
    if (!list || !state.socio) return;

    /*
     * O HTML atual começa vazio.
     * A versão anterior do socio.js nunca preenchia #quotas-list,
     * por isso o estado ficava permanentemente em "A carregar…"
     * quando essa versão do HTML era utilizada.
     */

    try {
        const { data, error } = await supabase
            .from('quotas')
            .select('ano, mes, valor, estado')
            .eq('socio_id', state.socio.id)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false });

        if (!error && Array.isArray(data)) {
            if (!data.length) {
                const legacy = state.socio.quotas;

                list.innerHTML = `
                    <div class="vazio">
                        ${legacy
                            ? esc(quotaStateLabel(legacy))
                            : 'Não existem quotas registadas.'}
                    </div>
                `;

                return;
            }

            const overdue = data.filter((quota) => {
                const status = String(quota.estado ?? '').trim().toLowerCase();
                return ['em_atraso', 'em atraso', 'atrasada', 'atrasado', 'unpaid', 'pending'].includes(status);
            });

            const paid = data.filter((quota) => {
                const status = String(quota.estado ?? '').trim().toLowerCase();
                return ['paga', 'pago', 'pagas', 'pagos', 'regular', 'regularizada', 'regularizado', 'em dia'].includes(status);
            });

            const total = data.reduce((sum, quota) => sum + Number(quota.valor || 0), 0);

            list.innerHTML = `
                <div class="quota-status-card ${overdue.length ? 'atrasada' : 'regular'}">
                    <span class="quota-status-icon">${overdue.length ? '⚠️' : '✓'}</span>
                    <div>
                        <strong>
                            ${overdue.length
                                ? `Quotas em atraso: ${overdue.length}`
                                : 'Quotas regularizadas'}
                        </strong>
                        <small>
                            ${paid.length} quota(s) paga(s)
                            ${total ? ` • Total registado: ${total.toFixed(2)} €` : ''}
                        </small>
                    </div>
                </div>
            `;

            return;
        }

        /*
         * Compatibilidade com a estrutura antiga enquanto a nova tabela
         * de quotas ainda não estiver criada no Supabase.
         */
        if (state.socio.quotas) {
            list.innerHTML = `
                <div class="vazio">
                    ${esc(quotaStateLabel(state.socio.quotas))}
                </div>
            `;
            return;
        }

        throw error || new Error('Não foi possível consultar as quotas.');

    } catch (error) {
        console.warn('Quotas:', error);

        list.innerHTML = `
            <div class="vazio">
                Não foi possível carregar a situação das quotas.
            </div>
        `;
    }
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
    const count = $('#docs-count');

    if (count) count.textContent = `${documents.length} / 12`;

    if (!documents.length) {
        list.innerHTML = '<div class="vazio">Ainda não existem documentos.</div>';
        return;
    }

    list.innerHTML = '';

    for (const record of documents) {
        let url = null;
        const path = record.storage_path || record.ficheiro_path;

        if (path) {
            const result = await supabase
                .storage
                .from('documentos-socios')
                .createSignedUrl(path, 3600);

            if (!result.error) url = result.data?.signedUrl || null;
        }

        const item = document.createElement('div');
        item.className = 'documento-socio-item';

        item.innerHTML = `
            <div>
                <strong>📄 ${esc(record.nome_ficheiro || 'Documento PDF')}</strong>
                <small>
                    ${record.created_at
                        ? new Date(record.created_at).toLocaleDateString('pt-PT')
                        : ''}
                </small>
            </div>
            ${url
                ? `<a class="botao" href="${url}" target="_blank" rel="noopener">Abrir</a>`
                : ''}
        `;

        list.appendChild(item);
    }
}

async function uploadPdf(file) {
    if (!file || file.type !== 'application/pdf') {
        throw new Error('Só são permitidos ficheiros PDF.');
    }

    const { count, error: countError } = await supabase
        .from('documentos_socios')
        .select('id', { count: 'exact', head: true })
        .eq('socio_id', state.socio.id);

    if (countError) throw countError;

    if ((count || 0) >= 12) {
        throw new Error('Já atingiu o limite máximo de 12 documentos.');
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase
        .storage
        .from('documentos-socios')
        .upload(path, file, {
            contentType: 'application/pdf',
            upsert: false
        });

    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
        .from('documentos_socios')
        .insert({
            socio_id: state.socio.id,
            nome_ficheiro: file.name,
            ficheiro_path: path,
            storage_path: path,
            mime_type: 'application/pdf',
            tipo_mime: 'application/pdf',
            tamanho_bytes: file.size
        });

    if (insertError) {
        await supabase.storage.from('documentos-socios').remove([path]);
        throw insertError;
    }

    await loadDocuments();
}

async function loadFunlearn() {
    const history = $('#funlearn-history');
    if (!history || !state.socio) return;

    const { data, error } = await supabase
        .from('funlearn_pontos')
        .select('*')
        .eq('socio_id', state.socio.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        history.innerHTML = '<div class="vazio">Não foi possível carregar o histórico.</div>';
        return;
    }

    const rows = data || [];
    const total = rows.reduce((sum, row) => sum + Number(row.pontos || 0), 0);

    $('#funlearn-total') && ($('#funlearn-total').textContent = total);
    $('#funlearn-total-top') && ($('#funlearn-total-top').textContent = total);

    history.innerHTML = rows.length
        ? rows.map((row) => `
            <div class="fun-row">
                <div>
                    <strong>${esc(row.atividade || 'Fun&Learn')}</strong>
                    <small>${esc(row.descricao || '')}</small>
                </div>
                <b>${Number(row.pontos || 0) > 0 ? '+' : ''}${Number(row.pontos || 0)}</b>
            </div>
        `).join('')
        : '<div class="vazio">Ainda não existem movimentos de pontos.</div>';
}

function fillProfileForm() {
    const s = state.socio;
    if (!s) return;

    $('#profile-nome') && ($('#profile-nome').value = s.nome || '');
    $('#profile-numero') && ($('#profile-numero').value = s.numero_socio ?? '');
    $('#profile-email') && ($('#profile-email').value = s.email || state.user?.email || '');
    $('#profile-telemovel') && ($('#profile-telemovel').value = s.telemovel || '');
    $('#profile-nascimento') && ($('#profile-nascimento').value = s.data_nascimento || '');
    $('#profile-morada') && ($('#profile-morada').value = s.morada || '');
    $('#profile-arbitro') && ($('#profile-arbitro').value = s.numero_arbitro || '');
    $('#profile-af') && ($('#profile-af').value = s.associacao_futebol || '');
    $('#profile-modalidade') && ($('#profile-modalidade').value = s.modalidade || '');
    $('#profile-quotas') && ($('#profile-quotas').value = s.quotas || '');
}

async function updateProfile(event) {
    event.preventDefault();

    const fields = {
        email: $('#profile-email')?.value.trim() || '',
        telemovel: $('#profile-telemovel')?.value.trim() || '',
        data_nascimento: $('#profile-nascimento')?.value || null,
        morada: $('#profile-morada')?.value.trim() || '',
        numero_arbitro: $('#profile-arbitro')?.value.trim() || '',
        associacao_futebol: $('#profile-af')?.value.trim() || '',
        modalidade: $('#profile-modalidade')?.value.trim() || ''
    };

    const { data, error } = await supabase
        .from('socios')
        .update(fields)
        .eq('id', state.socio.id)
        .eq('user_id', state.user.id)
        .select('*')
        .single();

    if (error) throw error;

    state.socio = data;
    fillProfileForm();
    await loadQuotas();
    msg('Dados atualizados.', 'sucesso');
}

function renderProfile() {
    const s = state.socio;
    if (!s) return;

    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;
    $('#admin-panel').hidden = !state.admin;

    $('#socio-name').textContent = s.nome || 'Sócio';
    $('#socio-number').textContent = s.numero_socio ?? '—';

    fillProfileForm();

    loadPhoto().catch((error) => console.error('Fotografia:', error));
    loadQuotas().catch((error) => console.error('Quotas:', error));
    loadDocuments().catch((error) => console.error('Documentos:', error));
    loadFunlearn().catch((error) => console.error('Fun&Learn:', error));
}

async function resetPassword() {
    const email = $('#login-email')?.value.trim();

    if (!email) {
        msg('Introduz primeiro o teu email.');
        return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}${location.pathname}`
    });

    if (error) throw error;

    msg('Foi enviado um email para redefinir a palavra-passe.', 'sucesso');
}

function bindEvents() {
    setupTabs();

    $('#login-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: $('#login-email').value.trim(),
                password: $('#login-password').value
            });

            if (error) throw error;

            const session = await getSession();
            if (!session) throw new Error('O login não criou uma sessão.');

            await loadProfile(session.user);
            renderProfile();

        } catch (error) {
            console.error(error);
            clearPrivateUI();
            msg(error.message || 'Não foi possível iniciar sessão.', 'erro');
        }
    });

    $('#reset-password')?.addEventListener('click', async () => {
        try {
            await resetPassword();
        } catch (error) {
            msg(error.message || 'Não foi possível enviar o email.', 'erro');
        }
    });

    $('#logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        clearPrivateUI();
        location.reload();
    });

    $('#photo-trigger')?.addEventListener('click', () => {
        $('#photo-input')?.click();
    });

    $('#photo-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            await uploadPhoto(file);
            msg('Fotografia atualizada.', 'sucesso');
        } catch (error) {
            msg(error.message || 'Não foi possível atualizar a fotografia.', 'erro');
        } finally {
            event.target.value = '';
        }
    });

    $('#doc-input')?.addEventListener('change', async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            await uploadPdf(file);
            msg('Documento carregado.', 'sucesso');
        } catch (error) {
            msg(error.message || 'Não foi possível carregar o documento.', 'erro');
        } finally {
            event.target.value = '';
        }
    });

    $('#profile-form')?.addEventListener('submit', updateProfile);
}

async function init() {
    clearPrivateUI();
    bindEvents();

    const session = await getSession();

    if (!session) return;

    try {
        await loadProfile(session.user);
        renderProfile();
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        clearPrivateUI();
        msg(error.message || 'Não foi possível carregar a área de sócio.', 'erro');
    }
}

supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
        clearPrivateUI();
    }
});

init().catch((error) => {
    console.error('Erro de inicialização:', error);
    clearPrivateUI();
    msg('Não foi possível inicializar a área de sócios.', 'erro');
});
