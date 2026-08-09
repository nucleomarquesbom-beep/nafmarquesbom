import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
    user: null,
    socio: null,
    admin: false,
    adminSocios: [],
    selectedSocios: new Set()
};


/* ============================================================
   UTILITÁRIOS
============================================================ */

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[character]));
}


function showMessage(text, type = 'info') {
    const element = $('#socio-message');

    if (!element) {
        console.log(text);
        return;
    }

    element.textContent = text;
    element.className = `socio-message ${type}`;
    element.hidden = false;
}


function hideMessage() {
    const element = $('#socio-message');

    if (element) {
        element.hidden = true;
    }
}


function getErrorMessage(error) {
    if (!error) {
        return 'Ocorreu um erro inesperado.';
    }

    if (typeof error === 'string') {
        return error;
    }

    return (
        error.message ||
        error.error_description ||
        error.details ||
        'Ocorreu um erro inesperado.'
    );
}


async function readFunctionError(error) {
    let message = getErrorMessage(error);

    try {
        if (error?.context) {
            const payload = await error.context.json();

            if (payload?.error) {
                message = payload.error;
            }
        }
    } catch (_) {
        // Mantém a mensagem original.
    }

    return message;
}


/* ============================================================
   AUTENTICAÇÃO
============================================================ */

async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }
}


async function resetPassword(email) {
    const { error } =
        await supabase.auth.resetPasswordForEmail(email, {
            redirectTo:
                `${window.location.origin}${window.location.pathname}`
        });

    if (error) {
        throw error;
    }
}


async function logout() {
    await supabase.auth.signOut();
    window.location.reload();
}


/* ============================================================
   PERFIL
============================================================ */

async function loadProfile(user) {
    if (!user?.id) {
        throw new Error('Sessão inválida.');
    }

    const {
        data,
        error
    } = await supabase
        .from('socios')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        throw new Error(
            'A conta autenticada não está associada a nenhum registo de sócio.'
        );
    }

    if (data.ativo === false) {
        throw new Error(
            'A sua conta de sócio encontra-se inativa. Contacte o Núcleo.'
        );
    }

    state.user = user;
    state.socio = data;

    state.admin =
        Number(data.numero_socio) === 9999 &&
        data.is_admin === true &&
        data.ativo === true;

    renderProfile();
}


function renderProfile() {
    const socio = state.socio;

    if (!socio) {
        return;
    }

    const loginPanel = $('#login-panel');
    const dashboard = $('#dashboard');

    if (loginPanel) {
        loginPanel.hidden = true;
    }

    if (dashboard) {
        dashboard.hidden = false;
    }


    /* Cabeçalho */

    $('#socio-name')?.replaceChildren(
        document.createTextNode(socio.nome || 'Sócio')
    );

    if ($('#socio-number')) {
        $('#socio-number').textContent =
            socio.numero_socio ?? '—';
    }


    /* Dados pessoais */

    if ($('#dados-nome')) {
        $('#dados-nome').textContent =
            socio.nome || '—';
    }

    if ($('#dados-numero')) {
        $('#dados-numero').textContent =
            socio.numero_socio ?? '—';
    }

    if ($('#dados-nascimento')) {
        $('#dados-nascimento').textContent =
            formatDate(socio.data_nascimento);
    }

    if ($('#dados-email')) {
        $('#dados-email').textContent =
            socio.email ||
            state.user?.email ||
            '—';
    }

    if ($('#dados-morada')) {
        $('#dados-morada').textContent =
            socio.morada || '—';
    }

    if ($('#dados-telemovel')) {
        $('#dados-telemovel').textContent =
            socio.telemovel || '—';
    }


    /* Arbitragem */

    if ($('#dados-arbitro')) {
        $('#dados-arbitro').textContent =
            socio.numero_arbitro || '—';
    }

    if ($('#dados-af')) {
        $('#dados-af').textContent =
            socio.associacao_futebol || '—';
    }

    if ($('#dados-modalidade')) {
        $('#dados-modalidade').textContent =
            socio.modalidade || '—';
    }


    /* Administração */

    if ($('#admin-panel')) {
        $('#admin-panel').hidden = !state.admin;
    }


    fillEditForms();

    loadPhoto().catch(console.error);
    loadQuotas();
    loadDocuments().catch(console.error);
    loadFunlearn().catch(console.error);

    if (state.admin) {
        loadAdminSocios().catch(console.error);
    }
}


function formatDate(value) {
    if (!value) {
        return '—';
    }

    const date = new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return date.toLocaleDateString('pt-PT');
}


/* ============================================================
   FOTOGRAFIA
============================================================ */

async function loadPhoto() {
    const image = $('#socio-photo');
    const avatar =
        $('#socio-photo-placeholder') ||
        $('#socio-avatar');

    if (!image || !avatar) {
        return;
    }

    const path =
        state.socio?.fotografia_path ||
        state.socio?.fotografia_url ||
        null;

    if (!path) {
        image.hidden = true;
        image.removeAttribute('src');

        avatar.hidden = false;

        return;
    }


    /* Compatibilidade com versões antigas */

    if (
        String(path).startsWith('http://') ||
        String(path).startsWith('https://')
    ) {
        image.src = path;
        image.hidden = false;
        avatar.hidden = true;

        return;
    }


    const {
        data,
        error
    } = await supabase
        .storage
        .from('fotografias-socios')
        .createSignedUrl(path, 3600);

    if (error) {
        console.error(
            'Erro ao carregar fotografia:',
            error
        );

        image.hidden = true;
        avatar.hidden = false;

        return;
    }

    if (data?.signedUrl) {
        const separator =
            data.signedUrl.includes('?')
                ? '&'
                : '?';

        image.src =
            `${data.signedUrl}${separator}v=${encodeURIComponent(path)}`;

        image.hidden = false;
        avatar.hidden = true;
    } else {
        image.hidden = true;
        avatar.hidden = false;
    }
}


async function uploadPhoto(file) {
    if (!file) {
        return;
    }

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
        throw new Error(
            'A fotografia deve estar em JPG, PNG ou WEBP.'
        );
    }

    if (file.size > 6 * 1024 * 1024) {
        throw new Error(
            'A fotografia não pode ultrapassar 6 MB.'
        );
    }

    const extension =
        file.type === 'image/jpeg'
            ? 'jpg'
            : file.type.split('/')[1];

    const oldPath =
        state.socio?.fotografia_path ||
        state.socio?.fotografia_url ||
        null;

    const path =
        `${state.socio.id}/fotografia-${crypto.randomUUID()}.${extension}`;


    const {
        error: uploadError
    } = await supabase
        .storage
        .from('fotografias-socios')
        .upload(
            path,
            file,
            {
                contentType: file.type,
                cacheControl: '3600',
                upsert: false
            }
        );

    if (uploadError) {
        throw uploadError;
    }


    /*
       A versão atual utiliza fotografia_path.
       Mantemos fotografia_url como fallback para
       instalações antigas.
    */

    let dbError = null;

    const result =
        await supabase
            .from('socios')
            .update({
                fotografia_path: path
            })
            .eq('id', state.socio.id)
            .eq('user_id', state.user.id);

    dbError = result.error;


    /*
       Se a instalação antiga ainda não tiver
       fotografia_path, tentamos fotografia_url.
    */

    if (dbError) {
        const fallback =
            await supabase
                .from('socios')
                .update({
                    fotografia_url: path
                })
                .eq('id', state.socio.id)
                .eq('user_id', state.user.id);

        dbError = fallback.error;
    }

    if (dbError) {
        await supabase
            .storage
            .from('fotografias-socios')
            .remove([path]);

        throw dbError;
    }


    state.socio.fotografia_path = path;
    state.socio.fotografia_url = path;


    if (
        oldPath &&
        oldPath !== path &&
        !String(oldPath).startsWith('http')
    ) {
        await supabase
            .storage
            .from('fotografias-socios')
            .remove([oldPath])
            .catch(console.error);
    }

    await loadPhoto();
}


/* ============================================================
   QUOTAS
============================================================ */

async function loadQuotas() {
    const element = $('#quotas-list');

    if (!element) {
        return;
    }

    const quotas =
        state.socio?.quotas;

    element.innerHTML = `
        <div class="vazio">
            ${escapeHtml(
                quotas ||
                'Estado de quotas não definido.'
            )}
        </div>
    `;
}


/* ============================================================
   DOCUMENTOS DO SÓCIO
============================================================ */

async function loadDocuments() {
    const list = $('#docs-list');

    if (!list || !state.socio) {
        return;
    }

    const {
        data,
        error
    } = await supabase
        .from('documentos_socios')
        .select('*')
        .eq('socio_id', state.socio.id)
        .order(
            'created_at',
            { ascending: false }
        );

    if (error) {
        console.error(error);

        list.innerHTML = `
            <div class="vazio">
                Não foi possível carregar os documentos.
            </div>
        `;

        return;
    }

    const documents = data || [];

    if ($('#docs-count')) {
        $('#docs-count').textContent =
            `${documents.length} / 12`;
    }


    if (!documents.length) {
        list.innerHTML = `
            <div class="vazio">
                Ainda não existem documentos.
            </div>
        `;

        return;
    }


    list.innerHTML = '';

    for (const record of documents) {
        let path =
            record.ficheiro_path ||
            record.storage_path ||
            null;

        let signedUrl = null;

        if (path) {
            const result =
                await supabase
                    .storage
                    .from('documentos-socios')
                    .createSignedUrl(
                        path,
                        3600
                    );

            if (!result.error) {
                signedUrl =
                    result.data?.signedUrl ||
                    null;
            }
        }


        const item =
            document.createElement('div');

        item.className =
            'documento-socio-item';


        const fileName =
            record.nome_ficheiro ||
            'Documento PDF';


        item.innerHTML = `
            <span>📄</span>

            <div>
                <strong>
                    ${escapeHtml(fileName)}
                </strong>

                <small>
                    ${
                        record.created_at
                            ? new Date(
                                record.created_at
                            ).toLocaleDateString('pt-PT')
                            : ''
                    }
                </small>
            </div>

            ${
                signedUrl
                    ? `
                        <a
                            class="botao-mini"
                            href="${signedUrl}"
                            target="_blank"
                            rel="noopener"
                        >
                            Abrir
                        </a>
                    `
                    : ''
            }
        `;

        list.appendChild(item);
    }
}


async function uploadSocioPdf(file) {
    if (!file) {
        return;
    }

    if (file.type !== 'application/pdf') {
        throw new Error(
            'Só são permitidos ficheiros PDF.'
        );
    }


    const {
        count,
        error: countError
    } = await supabase
        .from('documentos_socios')
        .select('id', {
            count: 'exact',
            head: true
        })
        .eq(
            'socio_id',
            state.socio.id
        );

    if (countError) {
        throw countError;
    }

    if ((count || 0) >= 12) {
        throw new Error(
            'Já atingiu o limite máximo de 12 documentos.'
        );
    }


    const safeName =
        file.name.replace(
            /[^a-zA-Z0-9._-]/g,
            '_'
        );

    const path =
        `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;


    const {
        error: uploadError
    } = await supabase
        .storage
        .from('documentos-socios')
        .upload(
            path,
            file,
            {
                contentType: 'application/pdf',
                upsert: false
            }
        );

    if (uploadError) {
        throw uploadError;
    }


    /*
       Estrutura atual do projeto:
       ficheiro_path / mime_type
       
       Compatibilidade:
       storage_path / tipo_mime
    */

    const insertResult =
        await supabase
            .from('documentos_socios')
            .insert({
                socio_id:
                    state.socio.id,

                nome_ficheiro:
                    file.name,

                ficheiro_path:
                    path,

                mime_type:
                    'application/pdf',

                tamanho_bytes:
                    file.size
            });


    if (insertResult.error) {
        await supabase
            .storage
            .from('documentos-socios')
            .remove([path]);

        throw insertResult.error;
    }


    await loadDocuments();
}


/* ============================================================
   FUN&LEARN — SÓCIO
============================================================ */

async function loadFunlearn() {
    const history =
        $('#funlearn-history');

    if (!history || !state.socio) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from('funlearn_pontos')
        .select('*')
        .eq(
            'socio_id',
            state.socio.id
        )
        .order(
            'created_at',
            { ascending: false }
        );


    if (error) {
        console.error(error);

        history.innerHTML = `
            <div class="vazio">
                Não foi possível carregar o histórico.
            </div>
        `;

        return;
    }


    const rows = data || [];

    const total =
        rows.reduce(
            (sum, row) =>
                sum + Number(
                    row.pontos || 0
                ),
            0
        );


    if ($('#funlearn-total')) {
        $('#funlearn-total').textContent =
            total;
    }

    if ($('#funlearn-total-top')) {
        $('#funlearn-total-top').textContent =
            total;
    }


    if (!rows.length) {
        history.innerHTML = `
            <div class="vazio">
                Ainda não existem movimentos de pontos.
            </div>
        `;

        return;
    }


    history.innerHTML =
        rows.map((row) => {

            const points =
                Number(row.pontos || 0);

            const activity =
                row.atividade ||
                'Fun&Learn';

            const description =
                row.descricao || '';

            const date =
                row.created_at
                    ? new Date(
                        row.created_at
                    ).toLocaleDateString('pt-PT')
                    : '';


            return `
                <div class="fun-row">

                    <div>
                        <strong>
                            ${escapeHtml(activity)}
                        </strong>

                        <small>
                            ${escapeHtml(description)}

                            ${
                                date
                                    ? ` • ${date}`
                                    : ''
                            }
                        </small>
                    </div>

                    <b>
                        ${points > 0 ? '+' : ''}
                        ${points}
                    </b>

                </div>
            `;
        }).join('');
}


/* ============================================================
   FORMULÁRIOS DE DADOS
============================================================ */

function fillEditForms() {
    const socio = state.socio;

    if (!socio) {
        return;
    }


    $('#edit-nome') &&
        ($('#edit-nome').value =
            socio.nome || '');

    $('#edit-numero') &&
        ($('#edit-numero').value =
            socio.numero_socio ?? '');

    $('#edit-nascimento') &&
        ($('#edit-nascimento').value =
            socio.data_nascimento || '');

    $('#edit-email') &&
        ($('#edit-email').value =
            socio.email ||
            state.user?.email ||
            '');

    $('#edit-morada') &&
        ($('#edit-morada').value =
            socio.morada || '');

    $('#edit-telemovel') &&
        ($('#edit-telemovel').value =
            socio.telemovel || '');

    $('#edit-arbitro') &&
        ($('#edit-arbitro').value =
            socio.numero_arbitro || '');

    $('#edit-af') &&
        ($('#edit-af').value =
            socio.associacao_futebol || '');

    $('#edit-modalidade') &&
        ($('#edit-modalidade').value =
            socio.modalidade || '');
}


function closeEditForms() {
    const dadosView =
        $('#dados-view');

    const dadosForm =
        $('#dados-edit-form');

    const arbitragemView =
        $('#arbitragem-view');

    const arbitragemForm =
        $('#arbitragem-edit-form');


    if (dadosView) {
        dadosView.hidden = false;
    }

    if (dadosForm) {
        dadosForm.hidden = true;
    }

    if ($('#editar-dados-btn')) {
        $('#editar-dados-btn').hidden =
            false;
    }


    if (arbitragemView) {
        arbitragemView.hidden = false;
    }

    if (arbitragemForm) {
        arbitragemForm.hidden = true;
    }

    if ($('#editar-arbitragem-btn')) {
        $('#editar-arbitragem-btn').hidden =
            false;
    }
}


async function saveProfileFields(fields) {
    const {
        data,
        error
    } = await supabase
        .from('socios')
        .update(fields)
        .eq(
            'id',
            state.socio.id
        )
        .eq(
            'user_id',
            state.user.id
        )
        .select('*')
        .single();

    if (error) {
        throw error;
    }

    state.socio = data;

    renderProfile();
    closeEditForms();
}


async function savePersonalData() {
    const email =
        $('#edit-email')
            ?.value
            .trim();


    if (
        !email ||
        !email.includes('@')
    ) {
        throw new Error(
            'Indica um email válido.'
        );
    }


    const oldEmail =
        (
            state.user?.email ||
            ''
        ).toLowerCase();


    if (
        email.toLowerCase() !==
        oldEmail
    ) {
        const {
            error
        } = await supabase.auth.updateUser({
            email
        });

        if (error) {
            throw error;
        }
    }


    await saveProfileFields({
        data_nascimento:
            $('#edit-nascimento')
                ?.value || null,

        email,

        morada:
            $('#edit-morada')
                ?.value || null,

        telemovel:
            $('#edit-telemovel')
                ?.value || null
    });
}


async function saveArbitragemData() {
    await saveProfileFields({

        data_nascimento:
            state.socio.data_nascimento,

        morada:
            state.socio.morada,

        email:
            state.socio.email ||
            state.user.email,

        telemovel:
            state.socio.telemovel,

        numero_arbitro:
            $('#edit-arbitro')
                ?.value || null,

        associacao_futebol:
            $('#edit-af')
                ?.value || null,

        modalidade:
            $('#edit-modalidade')
                ?.value || null
    });
}


/* ============================================================
   ADMIN — LISTA DE SÓCIOS
============================================================ */

async function loadAdminSocios() {
    if (!state.admin) {
        return;
    }

    const list =
        $('#admin-socios-lista');

    if (!list) {
        return;
    }


    list.innerHTML = `
        <div class="vazio">
            A carregar…
        </div>
    `;


    const {
        data,
        error
    } = await supabase
        .from('socios')
        .select(
            'id,numero_socio,nome,email,telemovel,ativo,quotas,user_id'
        )
        .order(
            'numero_socio',
            { ascending: true }
        );


    if (error) {
        list.innerHTML = `
            <div class="vazio">
                ${escapeHtml(error.message)}
            </div>
        `;

        return;
    }


    state.adminSocios =
        data || [];


    renderAdminSocios();
    populateAdminRemoveSocio();
}


function renderAdminSocios() {
    const list =
        $('#admin-socios-lista');

    if (!list) {
        return;
    }


    if (!state.adminSocios.length) {
        list.innerHTML = `
            <div class="vazio">
                Ainda não existem sócios.
            </div>
        `;

        return;
    }


    list.innerHTML =
        state.adminSocios
            .map((socio) => {

                const selected =
                    state.selectedSocios.has(
                        String(socio.id)
                    );


                return `
                    <label class="admin-socio-row">

                        <input
                            type="checkbox"
                            class="admin-socio-check"
                            value="${escapeHtml(socio.id)}"
                            ${selected ? 'checked' : ''}
                        >

                        <div class="admin-socio-numero">
                            ${escapeHtml(
                                socio.numero_socio
                            )}
                        </div>

                        <div class="admin-socio-main">

                            <strong>
                                ${escapeHtml(
                                    socio.nome
                                )}
                            </strong>

                            <small>
                                ${escapeHtml(
                                    socio.email ||
                                    'Sem email'
                                )}

                                ·

                                ${escapeHtml(
                                    socio.telemovel ||
                                    'Sem telemóvel'
                                )}
                            </small>

                        </div>

                        <span
                            class="admin-socio-status ${
                                socio.ativo
                                    ? 'ativo'
                                    : 'inativo'
                            }"
                        >
                            ${
                                socio.ativo
                                    ? 'Ativo'
                                    : 'Inativo'
                            }
                        </span>

                    </label>
                `;
            })
            .join('');


    updateSelectedSociosCount();
}


function getSelectedSocioIds() {
    return [
        ...document.querySelectorAll(
            '.admin-socio-check:checked'
        )
    ].map(
        element => element.value
    );
}


function updateSelectedSociosCount() {
    const selected =
        getSelectedSocioIds();

    const button =
        $('#admin-quotas-atraso');

    if (!button) {
        return;
    }

    const count =
        selected.length;

    button.textContent =
        count
            ? `Enviar email de quotas em atraso aos selecionados (${count})`
            : 'Enviar email de quotas em atraso aos selecionados';
}


function selectAllAdminSocios() {
    state.adminSocios.forEach(
        socio => {
            state.selectedSocios.add(
                String(socio.id)
            );
        }
    );

    renderAdminSocios();
}


function clearAdminSociosSelection() {
    state.selectedSocios.clear();

    renderAdminSocios();
}


/* ============================================================
   ADMIN — CRIAR SÓCIO
============================================================ */

async function createSocioFromAdmin() {
    if (!state.admin) {
        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    const body = {
        nome:
            $('#novo-socio-nome')
                ?.value
                .trim(),

        numero_socio:
            Number(
                $('#novo-socio-numero')
                    ?.value
            ),

        email:
            $('#novo-socio-email')
                ?.value
                .trim(),

        telemovel:
            $('#novo-socio-telemovel')
                ?.value
                .trim()
    };


    const {
        data,
        error
    } = await supabase.functions.invoke(
        'criar-socio',
        { body }
    );


    if (error) {
        throw new Error(
            await readFunctionError(error)
        );
    }

    if (data?.error) {
        throw new Error(
            data.error
        );
    }

    if (!data?.socio) {
        throw new Error(
            'O sócio foi criado, mas não foi devolvido nenhum registo.'
        );
    }

    return data.socio;
}


/* ============================================================
   ADMIN — EMAIL DE QUOTAS EM ATRASO
============================================================ */

async function sendOverdueQuotaEmails() {
    if (!state.admin) {
        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    const ids =
        getSelectedSocioIds();


    if (!ids.length) {
        throw new Error(
            'Seleciona pelo menos um sócio.'
        );
    }


    const button =
        $('#admin-quotas-atraso');

    if (button) {
        button.disabled = true;
    }


    try {
        const {
            data,
            error
        } = await supabase.functions.invoke(
            'admin-mail',
            {
                body: {
                    action:
                        'quotas_em_atraso',

                    socio_ids:
                        ids
                }
            }
        );


        if (error) {
            throw new Error(
                await readFunctionError(error)
            );
        }


        if (data?.error) {
            throw new Error(
                data.error
            );
        }


        const enviados =
            Number(
                data?.enviados || 0
            );

        const erros =
            Array.isArray(
                data?.erros
            )
                ? data.erros
                : [];


        let message =
            `Foram enviados ${enviados} email(s).`;


        if (erros.length) {
            message +=
                ` ${erros.length} envio(s) falharam.`;
        }


        showMessage(
            message,
            erros.length
                ? 'info'
                : 'sucesso'
        );


    } finally {
        if (button) {
            button.disabled = false;
        }
    }
}


/* ============================================================
   ADMIN — ENVIAR DOCUMENTO A TODOS
============================================================ */

async function sendDocumentToAll() {
    if (!state.admin) {
        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    const file =
        $('#admin-documento-file')
            ?.files?.[0];


    if (!file) {
        throw new Error(
            'Seleciona primeiro o documento.'
        );
    }


    if (
        file.type !==
        'application/pdf'
    ) {
        throw new Error(
            'O documento deve ser um PDF.'
        );
    }


    if (
        file.size >
        10 * 1024 * 1024
    ) {
        throw new Error(
            'O PDF não pode ultrapassar 10 MB.'
        );
    }


    const subject =
        $('#admin-documento-assunto')
            ?.value
            ?.trim() ||
        'Comunicação — Núcleo Marques Bom';


    const message =
        $('#admin-documento-mensagem')
            ?.value
            ?.trim();


    /*
       O HTML fornecido originalmente não tinha
       estes dois campos.

       Para manter compatibilidade, aceitamos também
       #admin-documento-message / #admin-documento-texto.
    */

    const messageElement =
        $('#admin-documento-mensagem') ||
        $('#admin-documento-message') ||
        $('#admin-documento-texto');


    const finalMessage =
        message ||
        messageElement?.value?.trim() ||
        '';


    if (!finalMessage) {
        throw new Error(
            'Escreve o conteúdo do email antes de enviar.'
        );
    }


    const formData =
        new FormData();

    formData.append(
        'action',
        'documento_todos'
    );

    formData.append(
        'documento',
        file,
        file.name
    );

    formData.append(
        'subject',
        subject
    );

    formData.append(
        'message',
        finalMessage
    );


    const {
        data: {
            session
        }
    } =
        await supabase.auth.getSession();


    if (!session?.access_token) {
        throw new Error(
            'A sessão expirou. Volta a iniciar sessão.'
        );
    }


    const response =
        await fetch(
            `${SUPABASE_URL}/functions/v1/admin-mail`,
            {
                method: 'POST',

                headers: {
                    Authorization:
                        `Bearer ${session.access_token}`
                },

                body: formData
            }
        );


    const data =
        await response
            .json()
            .catch(
                () => ({})
            );


    if (!response.ok || data?.error) {
        throw new Error(
            data?.error ||
            'Não foi possível enviar o documento.'
        );
    }


    const enviados =
        Number(
            data?.enviados || 0
        );

    const erros =
        Array.isArray(
            data?.erros
        )
            ? data.erros
            : [];


    showMessage(
        `Documento enviado para ${enviados} sócio(s).` +
        (
            erros.length
                ? ` ${erros.length} envio(s) falharam.`
                : ''
        ),
        erros.length
            ? 'info'
            : 'sucesso'
    );


    $('#admin-documento-form')
        ?.reset();
}


/* ============================================================
   ADMIN — IMPORTAR PDF
============================================================ */

async function importAdminPdf() {
    if (!state.admin) {
        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    const file =
        $('#admin-import-file')
            ?.files?.[0];


    if (!file) {
        throw new Error(
            'Seleciona primeiro um PDF.'
        );
    }


    if (
        file.type !==
        'application/pdf'
    ) {
        throw new Error(
            'O ficheiro deve ser um PDF.'
        );
    }


    if (
        file.size >
        10 * 1024 * 1024
    ) {
        throw new Error(
            'O PDF não pode ultrapassar 10 MB.'
        );
    }


    /*
       A função backend recebe o PDF, mas o processamento
       dos nomes é feito no browser.
    */

    const formData =
        new FormData();

    formData.append(
        'pdf',
        file,
        file.name
    );


    const {
        data: {
            session
        }
    } =
        await supabase.auth.getSession();


    if (!session?.access_token) {
        throw new Error(
            'A sessão expirou.'
        );
    }


    const response =
        await fetch(
            `${SUPABASE_URL}/functions/v1/admin-import-pdf`,
            {
                method: 'POST',

                headers: {
                    Authorization:
                        `Bearer ${session.access_token}`
                },

                body: formData
            }
        );


    const result =
        await response
            .json()
            .catch(
                () => ({})
            );


    if (!response.ok || result?.error) {
        throw new Error(
            result?.error ||
            'Não foi possível importar o PDF.'
        );
    }


    /*
       Agora tentamos também processar o PDF
       no navegador, como a versão antiga fazia.
    */

    const rows =
        await parsePdfInBrowser(file);


    if (!rows.length) {
        showMessage(
            result?.message ||
            'O PDF foi recebido, mas não foram encontrados dados reconhecíveis.',
            'info'
        );

        return;
    }


    const {
        error
    } = await supabase
        .from('socios')
        .upsert(
            rows,
            {
                onConflict:
                    'numero_socio',
                ignoreDuplicates:
                    false
            }
        );


    if (error) {
        throw error;
    }


    $('#admin-import-result') &&
        (
            $('#admin-import-result').hidden =
                false
        );


    if ($('#admin-import-result')) {
        $('#admin-import-result').textContent =
            `${rows.length} registo(s) importado(s)/atualizado(s).`;
    }


    showMessage(
        `${rows.length} sócio(s) importado(s)/atualizado(s).`,
        'sucesso'
    );


    await loadAdminSocios();
}


async function parsePdfInBrowser(file) {
    const pdfjs =
        await import(
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
        );


    pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';


    const bytes =
        new Uint8Array(
            await file.arrayBuffer()
        );


    const pdf =
        await pdfjs
            .getDocument({
                data: bytes
            })
            .promise;


    const rows = [];


    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {
        const page =
            await pdf.getPage(
                pageNumber
            );


        const content =
            await page.getTextContent();


        const lines = {};


        for (
            const item
            of content.items
        ) {
            const y =
                Math.round(
                    item.transform[5]
                );

            if (!lines[y]) {
                lines[y] = [];
            }

            lines[y].push(
                item.str
            );
        }


        for (
            const parts
            of Object.values(lines)
        ) {
            const line =
                parts
                    .join(' ')
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();


            if (!line) {
                continue;
            }


            const numberMatch =
                line.match(
                    /\b(\d{1,6})\b/
                );


            const emailMatch =
                line.match(
                    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
                );


            const numero =
                numberMatch?.[1] ||
                '';


            const email =
                emailMatch?.[0] ||
                '';


            let nome =
                line
                    .replace(
                        email,
                        ''
                    )
                    .replace(
                        /\b\d{1,6}\b/,
                        ''
                    )
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();


            if (
                numero &&
                nome.length >= 3
            ) {
                rows.push({
                    numero_socio:
                        Number(numero),

                    nome,

                    email:
                        email || null
                });
            }
        }
    }


    /*
       Evita duplicados dentro do mesmo PDF.
    */

    const unique =
        new Map();


    for (const row of rows) {
        unique.set(
            String(
                row.numero_socio
            ),
            row
        );
    }


    return [
        ...unique.values()
    ];
}


/* ============================================================
   ADMIN — RETIRAR PONTOS
============================================================ */

function populateAdminRemoveSocio() {
    const select =
        $('#admin-remove-socio');

    if (!select) {
        return;
    }


    select.innerHTML =
        state.adminSocios
            .map(
                socio => `
                    <option value="${escapeHtml(socio.id)}">
                        ${escapeHtml(
                            socio.numero_socio
                        )}
                        —
                        ${escapeHtml(
                            socio.nome
                        )}
                    </option>
                `
            )
            .join('');
}


async function removeFunlearnPoints() {
    if (!state.admin) {
        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    const socioId =
        $('#admin-remove-socio')
            ?.value;


    const pontos =
        Number(
            $('#admin-remove-pontos')
                ?.value
        );


    const motivo =
        $('#admin-remove-motivo')
            ?.value
            ?.trim();


    if (!socioId) {
        throw new Error(
            'Seleciona um sócio.'
        );
    }


    if (
        !Number.isInteger(pontos) ||
        pontos <= 0
    ) {
        throw new Error(
            'Os pontos devem ser um número inteiro superior a zero.'
        );
    }


    if (!motivo) {
        throw new Error(
            'Indica o motivo da retirada de pontos.'
        );
    }


    const {
        data,
        error
    } =
        await supabase.functions.invoke(
            'admin-funlearn',
            {
                body: {
                    action:
                        'retirar_pontos',

                    socio_id:
                        socioId,

                    pontos,

                    motivo,

                    notificar:
                        true
                }
            }
        );


    if (error) {
        throw new Error(
            await readFunctionError(error)
        );
    }


    if (data?.error) {
        throw new Error(
            data.error
        );
    }


    let message =
        `Foram retirados ${pontos} ponto(s).`;


    if (
        data?.saldo_novo !== undefined
    ) {
        message +=
            ` Novo saldo: ${data.saldo_novo}.`;
    }


    if (data?.warning) {
        message +=
            ` ${data.warning}`;
    }


    showMessage(
        message,
        data?.warning
            ? 'info'
            : 'sucesso'
    );


    $('#admin-remove-pontos') &&
        ($('#admin-remove-pontos').value =
            '');

    $('#admin-remove-motivo') &&
        ($('#admin-remove-motivo').value =
            '');


    await loadAdminSocios();
}


/* ============================================================
   ADMIN — FUN&LEARN POR PDF
============================================================ */

function normalizeName(value = '') {
    return String(value)
        .normalize('NFD')
        .replace(
            /[\u0300-\u036f]/g,
            ''
        )
        .toLowerCase()
        .replace(
            /\s+/g,
            ' '
        )
        .trim();
}


async function processFunlearnPdf(
    file,
    pontos,
    atividade,
    descricao
) {
    if (!state.admin) {
        throw new Error(
            'Apenas o administrador pode processar documentos Fun&Learn.'
        );
    }


    if (
        !file ||
        file.type !==
        'application/pdf'
    ) {
        throw new Error(
            'O ficheiro do Fun&Learn deve ser PDF.'
        );
    }


    if (
        !Number.isInteger(pontos) ||
        pontos <= 0
    ) {
        throw new Error(
            'Indica um número de pontos superior a zero.'
        );
    }


    if (!window.pdfjsLib) {
        /*
           A página antiga usava window.pdfjsLib.
           Como o socio.html não o carrega necessariamente,
           fazemos import dinâmico.
        */

        try {
            window.pdfjsLib =
                await import(
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'
                );

            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

        } catch (error) {
            throw new Error(
                'Não foi possível carregar o leitor de PDF.'
            );
        }
    }


    const pdfjs =
        window.pdfjsLib;


    const arrayBuffer =
        await file.arrayBuffer();


    const pdf =
        await pdfjs
            .getDocument({
                data: arrayBuffer
            })
            .promise;


    let text = '';


    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {
        const page =
            await pdf.getPage(
                pageNumber
            );


        const content =
            await page.getTextContent();


        text +=
            ' ' +
            content.items
                .map(
                    item => item.str
                )
                .join(' ');
    }


    const normalizedText =
        normalizeName(text);


    const {
        data: socios,
        error: sociosError
    } =
        await supabase
            .from('socios')
            .select(
                'id,nome,numero_socio'
            )
            .eq(
                'ativo',
                true
            );


    if (sociosError) {
        throw sociosError;
    }


    const encontrados =
        (socios || [])
            .filter(
                socio => {

                    const nome =
                        normalizeName(
                            socio.nome
                        );


                    return (
                        nome.length >= 4 &&
                        normalizedText.includes(
                            nome
                        )
                    );
                }
            );


    if (!encontrados.length) {
        return {
            count: 0,
            names: []
        };
    }


    const rows =
        encontrados.map(
            socio => ({
                socio_id:
                    socio.id,

                pontos,

                atividade:
                    atividade ||
                    'Fun&Learn',

                descricao:
                    descricao ||
                    'Pontos atribuídos pelo administrador.'
            })
        );


    const {
        error: insertError
    } =
        await supabase
            .from(
                'funlearn_pontos'
            )
            .insert(rows);


    if (insertError) {
        throw insertError;
    }


    return {
        count:
            encontrados.length,

        names:
            encontrados.map(
                socio =>
                    `${socio.numero_socio} — ${socio.nome}`
            )
    };
}


/* ============================================================
   ABAS
============================================================ */

function setupTabs() {
    $$('.socio-tab')
        .forEach(
            button => {

                button.addEventListener(
                    'click',
                    () => {

                        $$('.socio-tab')
                            .forEach(
                                item =>
                                    item.classList
                                        .remove(
                                            'active'
                                        )
                            );


                        $$('.socio-tab-content')
                            .forEach(
                                panel =>
                                    panel.classList
                                        .remove(
                                            'active'
                                        )
                            );


                        button.classList
                            .add('active');


                        /*
                           O HTML fornecido usa:
                           data-tab="dados"
                           id="dados"

                           A versão atual do GitHub usa:
                           data-tab="dados"
                           id="tab-dados"

                           Suportamos ambas.
                        */

                        const target =
                            button.dataset.tab;


                        document
                            .getElementById(
                                target
                            )
                            ?.classList
                            .add(
                                'active'
                            );


                        document
                            .getElementById(
                                `tab-${target}`
                            )
                            ?.classList
                            .add(
                                'active'
                            );
                    }
                );
            }
        );
}


/* ============================================================
   EVENTOS
============================================================ */

function setupLogin() {
    $('#login-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                hideMessage();


                const email =
                    $('#login-email')
                        ?.value
                        .trim();


                const password =
                    $('#login-password')
                        ?.value ||
                    '';


                if (!email) {
                    showMessage(
                        'Introduz o teu email.',
                        'erro'
                    );

                    return;
                }


                if (!password) {
                    showMessage(
                        'Introduz a tua palavra-passe.',
                        'erro'
                    );

                    return;
                }


                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );


                if (button) {
                    button.disabled =
                        true;
                }


                try {
                    await login(
                        email,
                        password
                    );


                    const {
                        data: {
                            session
                        }
                    } =
                        await supabase
                            .auth
                            .getSession();


                    if (!session) {
                        throw new Error(
                            'O login foi aceite mas não foi criada uma sessão.'
                        );
                    }


                    await loadProfile(
                        session.user
                    );


                } catch (error) {

                    console.error(
                        'Erro no login:',
                        error
                    );


                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );
}


function setupPasswordReset() {
    $('#reset-password')
        ?.addEventListener(
            'click',
            async () => {

                const email =
                    $('#login-email')
                        ?.value
                        .trim();


                if (!email) {
                    showMessage(
                        'Introduz primeiro o teu email.',
                        'info'
                    );

                    $('#login-email')
                        ?.focus();

                    return;
                }


                try {

                    await resetPassword(
                        email
                    );


                    showMessage(
                        'Foi enviado um email para redefinir a palavra-passe.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );
                }
            }
        );
}


function setupPhoto() {

    $('#photo-trigger')
        ?.addEventListener(
            'click',
            () => {
                $('#photo-input')
                    ?.click();
            }
        );


    $('#photo-input')
        ?.addEventListener(
            'change',
            async event => {

                const file =
                    event.target
                        .files?.[0];


                if (!file) {
                    return;
                }


                try {

                    await uploadPhoto(
                        file
                    );


                    showMessage(
                        'Fotografia atualizada.',
                        'sucesso'
                    );

                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    event.target.value =
                        '';
                }
            }
        );
}


function setupDocuments() {

    $('#doc-input')
        ?.addEventListener(
            'change',
            async event => {

                const file =
                    event.target
                        .files?.[0];


                if (!file) {
                    return;
                }


                try {

                    await uploadSocioPdf(
                        file
                    );


                    showMessage(
                        'Documento carregado.',
                        'sucesso'
                    );

                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    event.target.value =
                        '';
                }
            }
        );
}


function setupProfileForms() {

    $('#editar-dados-btn')
        ?.addEventListener(
            'click',
            () => {

                fillEditForms();

                if ($('#dados-view')) {
                    $('#dados-view').hidden =
                        true;
                }

                if ($('#dados-edit-form')) {
                    $('#dados-edit-form').hidden =
                        false;
                }

                if ($('#editar-dados-btn')) {
                    $('#editar-dados-btn').hidden =
                        true;
                }
            }
        );


    $('#cancelar-dados-btn')
        ?.addEventListener(
            'click',
            closeEditForms
        );


    $('#dados-edit-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    $('#guardar-dados-btn');


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    await savePersonalData();


                    showMessage(
                        'Dados pessoais atualizados.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );


    $('#editar-arbitragem-btn')
        ?.addEventListener(
            'click',
            () => {

                fillEditForms();


                if ($('#arbitragem-view')) {
                    $('#arbitragem-view').hidden =
                        true;
                }


                if ($('#arbitragem-edit-form')) {
                    $('#arbitragem-edit-form').hidden =
                        false;
                }


                if ($('#editar-arbitragem-btn')) {
                    $('#editar-arbitragem-btn').hidden =
                        true;
                }
            }
        );


    $('#cancelar-arbitragem-btn')
        ?.addEventListener(
            'click',
            closeEditForms
        );


    $('#arbitragem-edit-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    await saveArbitragemData();


                    showMessage(
                        'Dados de arbitragem atualizados.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );
}


function setupAdmin() {

    /* Atualizar lista */

    $('#admin-refresh-socios')
        ?.addEventListener(
            'click',
            async () => {

                try {

                    await loadAdminSocios();

                    showMessage(
                        'Lista de sócios atualizada.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );
                }
            }
        );


    /* Seleção individual */

    $('#admin-socios-lista')
        ?.addEventListener(
            'change',
            event => {

                if (
                    !event.target.classList
                        .contains(
                            'admin-socio-check'
                        )
                ) {
                    return;
                }


                const id =
                    String(
                        event.target.value
                    );


                if (event.target.checked) {
                    state.selectedSocios
                        .add(id);
                } else {
                    state.selectedSocios
                        .delete(id);
                }


                updateSelectedSociosCount();
            }
        );


    /* Selecionar todos */

    $('#admin-select-all-socios')
        ?.addEventListener(
            'click',
            selectAllAdminSocios
        );


    $('#admin-selecionar-todos')
        ?.addEventListener(
            'click',
            selectAllAdminSocios
        );


    /* Limpar seleção */

    $('#admin-clear-selection')
        ?.addEventListener(
            'click',
            clearAdminSociosSelection
        );


    $('#admin-limpar-selecao')
        ?.addEventListener(
            'click',
            clearAdminSociosSelection
        );


    /* Quotas */

    $('#admin-quotas-atraso')
        ?.addEventListener(
            'click',
            async () => {

                try {

                    await sendOverdueQuotaEmails();

                } catch (error) {

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );
                }
            }
        );


    /* Novo sócio */

    $('#novo-socio-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    $('#novo-socio-submit');


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    const socio =
                        await createSocioFromAdmin();


                    $('#novo-socio-form')
                        ?.reset();


                    if ($('#novo-socio-resultado')) {
                        $('#novo-socio-resultado')
                            .hidden =
                            false;

                        $('#novo-socio-resultado')
                            .textContent =
                            `Sócio ${socio.numero_socio} — ${socio.nome} criado. Foi enviado um convite para ${socio.email}.`;
                    }


                    await loadAdminSocios();


                    showMessage(
                        'Sócio criado e convite enviado por email.',
                        'sucesso'
                    );

                } catch (error) {

                    console.error(error);


                    if ($('#novo-socio-resultado')) {
                        $('#novo-socio-resultado')
                            .hidden =
                            false;

                        $('#novo-socio-resultado')
                            .textContent =
                            getErrorMessage(
                                error
                            );
                    }


                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );


    /* Documento para todos */

    $('#admin-documento-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    await sendDocumentToAll();

                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );


    /* Importar PDF */

    $('#admin-import-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    await importAdminPdf();

                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );


    /* Retirar pontos */

    $('#admin-remove-points-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    await removeFunlearnPoints();

                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );


    /* Fun&Learn PDF */

    $('#funlearn-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();


                const file =
                    $('#funlearn-file')
                        ?.files?.[0];


                const pontos =
                    Number(
                        $('#funlearn-pontos')
                            ?.value
                    );


                const atividade =
                    $('#funlearn-atividade')
                        ?.value
                        ?.trim();


                const descricao =
                    $('#funlearn-descricao')
                        ?.value
                        ?.trim();


                const button =
                    $('#funlearn-submit');


                try {

                    if (button) {
                        button.disabled =
                            true;
                    }


                    const result =
                        await processFunlearnPdf(
                            file,
                            pontos,
                            atividade,
                            descricao
                        );


                    if (result.count) {

                        showMessage(
                            `Processamento concluído: ${result.count} sócio(s) recebeu(ram) ${pontos} ponto(s).`,
                            'sucesso'
                        );

                    } else {

                        showMessage(
                            'O PDF foi processado, mas não foi encontrado nenhum nome correspondente.',
                            'info'
                        );
                    }


                    $('#funlearn-form')
                        ?.reset();


                } catch (error) {

                    console.error(error);

                    showMessage(
                        getErrorMessage(
                            error
                        ),
                        'erro'
                    );

                } finally {

                    if (button) {
                        button.disabled =
                            false;
                    }
                }
            }
        );
}


/* ============================================================
   SUPORTE À CAIXA DE EMAIL
============================================================ */

/*
   O HTML que me enviaste ainda não contém os campos
   do assunto/mensagem.

   Esta função cria os campos automaticamente caso
   estejam em falta.

   Assim não é necessário destruir o layout atual.
*/

function ensureDocumentEmailFields() {

    const form =
        $('#admin-documento-form');

    if (!form) {
        return;
    }


    let subject =
        $('#admin-documento-assunto');


    let message =
        $('#admin-documento-mensagem');


    if (!subject) {

        const label =
            document.createElement(
                'label'
            );

        label.textContent =
            'Assunto';


        subject =
            document.createElement(
                'input'
            );

        subject.id =
            'admin-documento-assunto';

        subject.type =
            'text';

        subject.value =
            'Comunicação — Núcleo Marques Bom';

        label.appendChild(
            subject
        );


        const file =
            $('#admin-documento-file');


        if (file) {
            form.insertBefore(
                label,
                file
            );
        } else {
            form.prepend(
                label
            );
        }
    }


    if (!message) {

        const label =
            document.createElement(
                'label'
            );

        label.className =
            'wide';


        label.textContent =
            'Conteúdo do email';


        message =
            document.createElement(
                'textarea'
            );

        message.id =
            'admin-documento-mensagem';

        message.rows =
            7;

        message.placeholder =
            'Escreva aqui o conteúdo do email que será enviado aos sócios.';


        label.appendChild(
            message
        );


        const file =
            $('#admin-documento-file');


        if (file) {
            form.insertBefore(
                label,
                file
            );
        } else {
            form.appendChild(
                label
            );
        }
    }
}


/* ============================================================
   SESSÃO EXISTENTE
============================================================ */

async function restoreSession() {

    const {
        data: {
            session
        }
    } =
        await supabase.auth
            .getSession();


    if (!session) {
        return;
    }


    try {

        await loadProfile(
            session.user
        );

    } catch (error) {

        console.error(
            'Erro ao restaurar sessão:',
            error
        );


        if ($('#login-panel')) {
            $('#login-panel').hidden =
                false;
        }

        if ($('#dashboard')) {
            $('#dashboard').hidden =
                true;
        }


        showMessage(
            getErrorMessage(
                error
            ),
            'erro'
        );
    }
}


/* ============================================================
   AUTH STATE
============================================================ */

supabase.auth.onAuthStateChange(
    (_event, session) => {

        if (!session) {

            state.user = null;
            state.socio = null;
            state.admin = false;


            if ($('#login-panel')) {
                $('#login-panel').hidden =
                    false;
            }


            if ($('#dashboard')) {
                $('#dashboard').hidden =
                    true;
            }
        }
    }
);


/* ============================================================
   ARRANQUE
============================================================ */

async function init() {

    setupTabs();

    setupLogin();

    setupPasswordReset();

    setupPhoto();

    setupDocuments();

    setupProfileForms();

    setupAdmin();

    ensureDocumentEmailFields();

    await restoreSession();
}


init().catch(
    error => {

        console.error(
            'Erro ao iniciar socio.js:',
            error
        );

        showMessage(
            getErrorMessage(
                error
            ),
            'erro'
        );
    }
);
