import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_NUMERO = 9999;

const state = {
    user: null,
    socio: null,
    admin: false,
    adminSocios: [],
    selectedSocios: new Set()
};

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
    state.admin =
        Number(data.numero_socio) === ADMIN_NUMERO &&
        data.is_admin === true &&
        data.ativo === true;
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

    fillEditForms();
    loadPhoto();
    loadQuotas();
    loadDocuments();
    loadFunlearn();

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

    // Mantém a primeira secção, que é a secção oficial do separador.
    // Remove apenas duplicados acidentais; não altera CSS nem layout.
    sections.slice(1).forEach(section => section.remove());
}

async function loadQuotas() {
    cleanupDuplicateQuotaMarkup();

    const el = $('#quotas-list');
    if (!el || !state.socio) return;

    try {
        const { data, error } = await supabase
            .from('quotas')
            .select('ano,mes,valor,estado')
            .eq('socio_id', state.socio.id)
            .order('ano', { ascending: false })
            .order('mes', { ascending: false });

        if (!error && Array.isArray(data) && data.length) {
            const atrasadas = data.filter(q => String(q.estado || '').toLowerCase() === 'em_atraso');
            const pagas = data.filter(q => ['paga','pago','regularizada','regularizado'].includes(String(q.estado || '').toLowerCase()));
            el.innerHTML = `
                <div class="vazio">
                    ${atrasadas.length ? `Quotas em atraso: ${atrasadas.length}` : 'Quotas regularizadas.'}
                    ${pagas.length ? ` • ${pagas.length} quotas pagas` : ''}
                </div>`;
            return;
        }
    } catch (error) {
        console.warn('Não foi possível consultar a tabela quotas; usando estado do sócio.', error);
    }

    el.innerHTML = `<div class="vazio">${escapeHtml(
        state.socio.quotas || 'Estado de quotas não definido.'
    )}</div>`;
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
        modalidade: $('#edit-modalidade').value || null
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

function setupTabs() {
    $$('.socio-tab').forEach(button => {
        button.addEventListener('click', () => {
            $$('.socio-tab').forEach(item => item.classList.remove('active'));
            $$('.socio-tab-content').forEach(panel => panel.classList.remove('active'));

            button.classList.add('active');
            document.getElementById(button.dataset.tab)?.classList.add('active');
        });
    });
}

async function init() {
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
