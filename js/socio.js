import {
    createClient
} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
} from './supabase-config.js';


const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


const state = {
    user: null,
    socio: null,
    admin: false,
    sociosAdmin: []
};


const $ = (selector) =>
    document.querySelector(selector);


const $$ = (selector) =>
    [...document.querySelectorAll(selector)];


const esc = (value) =>
    String(value ?? '').replace(
        /[&<>'"]/g,
        (character) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[character])
    );


function showMessage(
    text,
    type = 'info',
    target = '#socio-message'
) {
    const element = $(target);

    if (!element) {
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


function isQuotaOverdue(value) {
    const status = String(value ?? '')
        .trim()
        .toLowerCase();

    if (!status) {
        return false;
    }

    return ![
        'em dia',
        'pago',
        'pagas',
        'paga',
        'liquidado',
        'liquidadas',
        'regularizado',
        'regularizada',
        'regular'
    ].includes(status);
}


/* ============================================================
   AUTENTICAÇÃO
============================================================ */

async function login(email, password) {

    const {
        error
    } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }

    /*
     * IMPORTANTE:
     * A versão atual do GitHub fazia o login mas não carregava
     * o perfil depois do login.
     */

    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();

    if (!session) {
        throw new Error(
            'O login foi efetuado, mas não foi criada uma sessão.'
        );
    }

    await loadProfile(session.user);

    renderProfile();
}


async function logout() {

    await supabase.auth.signOut();

    window.location.reload();
}


async function resetPassword(email) {

    const {
        error
    } = await supabase.auth.resetPasswordForEmail(
        email,
        {
            redirectTo:
                `${window.location.origin}${window.location.pathname}`
        }
    );

    if (error) {
        throw error;
    }
}


/* ============================================================
   PERFIL
============================================================ */

async function loadProfile(user) {

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
            'A conta autenticada ainda não está associada a um registo de sócio.'
        );

    }


    state.user = user;
    state.socio = data;


    state.admin =
        Number(data.numero_socio) === 9999 &&
        data.is_admin === true &&
        data.ativo === true;
}


function renderProfile() {

    const socio = state.socio;

    if (!socio) {
        return;
    }


    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;


    $('#socio-name').textContent =
        socio.nome || 'Sócio';

    $('#socio-number').textContent =
        socio.numero_socio ?? '—';


    $('#dados-nome').textContent =
        socio.nome || '—';

    $('#dados-numero').textContent =
        socio.numero_socio ?? '—';

    $('#dados-nascimento').textContent =
        socio.data_nascimento
            ? new Date(
                `${socio.data_nascimento}T00:00:00`
            ).toLocaleDateString('pt-PT')
            : '—';

    $('#dados-email').textContent =
        socio.email ||
        state.user?.email ||
        '—';

    $('#dados-morada').textContent =
        socio.morada || '—';

    $('#dados-telemovel').textContent =
        socio.telemovel || '—';


    $('#dados-arbitro').textContent =
        socio.numero_arbitro || '—';

    $('#dados-af').textContent =
        socio.associacao_futebol || '—';

    $('#dados-modalidade').textContent =
        socio.modalidade || '—';


    fillEditForms();


    $('#admin-panel').hidden =
        !state.admin;


    loadPhoto().catch(console.error);
    loadQuotas().catch(console.error);
    loadDocuments().catch(console.error);
    loadFunlearn().catch(console.error);


    if (state.admin) {
        loadAdminSocios().catch((error) => {
            showMessage(
                error.message ||
                'Não foi possível carregar a lista de sócios.',
                'erro'
            );
        });
    }
}


/* ============================================================
   FOTOGRAFIA
============================================================ */

async function loadPhoto() {

    const image = $('#socio-photo');
    const avatar = $('#socio-photo-placeholder');

    if (!image || !avatar) {
        return;
    }


    const path =
        state.socio?.fotografia_path ||
        null;


    if (!path) {

        image.removeAttribute('src');
        image.hidden = true;

        avatar.hidden = false;

        return;
    }


    const {
        data,
        error
    } = await supabase
        .storage
        .from('fotografias-socios')
        .createSignedUrl(
            path,
            3600
        );


    if (error) {
        throw error;
    }


    if (data?.signedUrl) {

        image.src =
            `${data.signedUrl}${
                data.signedUrl.includes('?')
                    ? '&'
                    : '?'
            }v=${encodeURIComponent(path)}`;

        image.hidden = false;
        avatar.hidden = true;
    }
}


async function uploadPhoto(file) {

    if (!file) {
        return;
    }


    if (
        ![
            'image/jpeg',
            'image/png',
            'image/webp'
        ].includes(file.type)
    ) {
        throw new Error(
            'A fotografia deve ser JPG, PNG ou WEBP.'
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
        state.socio.fotografia_path ||
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


    const {
        error: databaseError
    } = await supabase
        .from('socios')
        .update({
            fotografia_path: path
        })
        .eq(
            'id',
            state.socio.id
        )
        .eq(
            'user_id',
            state.user.id
        );


    if (databaseError) {

        await supabase
            .storage
            .from('fotografias-socios')
            .remove([path]);

        throw databaseError;
    }


    state.socio.fotografia_path =
        path;


    if (oldPath) {

        await supabase
            .storage
            .from('fotografias-socios')
            .remove([oldPath]);

    }


    await loadPhoto();
}


/* ============================================================
   QUOTAS DO SÓCIO
============================================================ */

async function loadQuotas() {

    const element =
        $('#quotas-list');

    if (!element) {
        return;
    }


    const quotas =
        state.socio?.quotas;


    if (!quotas) {

        element.innerHTML = `
            <div class="vazio">
                Estado de quotas não definido.
            </div>
        `;

        return;
    }


    const overdue =
        isQuotaOverdue(quotas);


    element.innerHTML = `
        <div class="quota-status-card ${overdue ? 'atrasada' : 'regular'}">

            <span class="quota-status-icon">
                ${overdue ? '⚠️' : '✓'}
            </span>

            <div>
                <strong>
                    ${overdue
                        ? 'Quotas em atraso'
                        : 'Quotas regularizadas'}
                </strong>

                <small>
                    Estado registado:
                    ${esc(quotas)}
                </small>
            </div>

        </div>
    `;
}


/* ============================================================
   DOCUMENTOS
============================================================ */

async function loadDocuments() {

    const list =
        $('#docs-list');

    if (!list) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from('documentos_socios')
        .select('*')
        .eq(
            'socio_id',
            state.socio.id
        )
        .order(
            'created_at',
            {
                ascending: false
            }
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


    const documents =
        data || [];


    $('#docs-count').textContent =
        `${documents.length} / 12`;


    if (!documents.length) {

        list.innerHTML = `
            <div class="vazio">
                Ainda não existem documentos.
            </div>
        `;

        return;
    }


    list.innerHTML = '';


    for (const documentRecord of documents) {

        let signedUrl = null;


        const storagePath =
            documentRecord.storage_path ||
            documentRecord.ficheiro_path;


        if (storagePath) {

            const {
                data: signedData
            } = await supabase
                .storage
                .from('documentos-socios')
                .createSignedUrl(
                    storagePath,
                    3600
                );

            signedUrl =
                signedData?.signedUrl ||
                null;
        }


        const item =
            document.createElement('div');


        item.className =
            'documento-socio-item';


        item.innerHTML = `

            <div class="documento-info">

                <span class="documento-icon">
                    📄
                </span>

                <div>

                    <strong>
                        ${esc(
                            documentRecord.nome_ficheiro ||
                            'Documento PDF'
                        )}
                    </strong>

                    <small>
                        ${
                            documentRecord.created_at
                                ? new Date(
                                    documentRecord.created_at
                                ).toLocaleDateString('pt-PT')
                                : ''
                        }
                    </small>

                </div>

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

    if (
        !file ||
        file.type !== 'application/pdf'
    ) {
        throw new Error(
            'Só são permitidos ficheiros PDF.'
        );
    }


    const {
        count,
        error: countError
    } = await supabase
        .from('documentos_socios')
        .select(
            'id',
            {
                count: 'exact',
                head: true
            }
        )
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
                contentType:
                    'application/pdf',
                upsert: false
            }
        );


    if (uploadError) {
        throw uploadError;
    }


    const {
        error: databaseError
    } = await supabase
        .from('documentos_socios')
        .insert({
            socio_id:
                state.socio.id,

            nome_ficheiro:
                file.name,

            storage_path:
                path,

            tamanho_bytes:
                file.size,

            tipo_mime:
                'application/pdf'
        });


    if (databaseError) {

        await supabase
            .storage
            .from('documentos-socios')
            .remove([path]);

        throw databaseError;
    }


    await loadDocuments();
}


/* ============================================================
   FUN & LEARN
============================================================ */

async function loadFunlearn() {

    const history =
        $('#funlearn-history');

    if (!history) {
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
            {
                ascending: false
            }
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


    const rows =
        data || [];


    const total =
        rows.reduce(
            (sum, row) =>
                sum +
                Number(row.pontos || 0),
            0
        );


    $('#funlearn-total').textContent =
        total;

    $('#funlearn-total-top').textContent =
        total;


    if (!rows.length) {

        history.innerHTML = `
            <div class="vazio">
                Ainda não existem movimentos de pontos.
            </div>
        `;

        return;
    }


    history.innerHTML =
        rows.map(
            (row) => {

                const points =
                    Number(
                        row.pontos || 0
                    );

                return `

                    <div class="fun-row">

                        <div>

                            <strong>
                                ${esc(
                                    row.atividade ||
                                    'Fun&Learn'
                                )}
                            </strong>

                            <small>
                                ${esc(
                                    row.descricao ||
                                    ''
                                )}

                                ${
                                    row.created_at
                                        ? ` • ${new Date(
                                            row.created_at
                                        ).toLocaleDateString('pt-PT')}`
                                        : ''
                                }
                            </small>

                        </div>

                        <b class="${points < 0 ? 'negativo' : ''}">
                            ${points > 0 ? '+' : ''}
                            ${points}
                        </b>

                    </div>

                `;
            }
        ).join('');
}


/* ============================================================
   FORMULÁRIOS
============================================================ */

function fillEditForms() {

    const socio =
        state.socio;

    if (!socio) {
        return;
    }


    $('#edit-nome').value =
        socio.nome || '';

    $('#edit-numero').value =
        socio.numero_socio ?? '';

    $('#edit-nascimento').value =
        socio.data_nascimento || '';

    $('#edit-email').value =
        socio.email ||
        state.user?.email ||
        '';

    $('#edit-morada').value =
        socio.morada || '';

    $('#edit-telemovel').value =
        socio.telemovel || '';

    $('#edit-arbitro').value =
        socio.numero_arbitro || '';

    $('#edit-af').value =
        socio.associacao_futebol || '';

    $('#edit-modalidade').value =
        socio.modalidade || '';
}


function closeEditForms() {

    $('#dados-edit-form').hidden =
        true;

    $('#dados-view').hidden =
        false;

    $('#editar-dados-btn').hidden =
        false;


    $('#arbitragem-edit-form').hidden =
        true;

    $('#arbitragem-view').hidden =
        false;

    $('#editar-arbitragem-btn').hidden =
        false;
}


async function savePersonalData() {

    const email =
        $('#edit-email').value.trim();


    if (
        !email ||
        !email.includes('@')
    ) {
        throw new Error(
            'Indica um email válido.'
        );
    }


    const {
        data,
        error
    } = await supabase
        .from('socios')
        .update({
            data_nascimento:
                $('#edit-nascimento').value ||
                null,

            email,

            morada:
                $('#edit-morada').value.trim() ||
                null,

            telemovel:
                $('#edit-telemovel').value.trim() ||
                null
        })
        .eq(
            'id',
            state.socio.id
        )
        .eq(
            'user_id',
            state.user.id
        )
        .select()
        .single();


    if (error) {
        throw error;
    }


    state.socio =
        data;

    renderProfile();

    closeEditForms();
}


async function saveArbitragemData() {

    const {
        data,
        error
    } = await supabase
        .from('socios')
        .update({
            numero_arbitro:
                $('#edit-arbitro').value.trim() ||
                null,

            associacao_futebol:
                $('#edit-af').value.trim() ||
                null,

            modalidade:
                $('#edit-modalidade').value.trim() ||
                null
        })
        .eq(
            'id',
            state.socio.id
        )
        .eq(
            'user_id',
            state.user.id
        )
        .select()
        .single();


    if (error) {
        throw error;
    }


    state.socio =
        data;

    renderProfile();

    closeEditForms();
}


/* ============================================================
   ADMIN — LISTA
============================================================ */

async function loadAdminSocios() {

    if (
        !state.admin ||
        !$('#admin-socios-lista')
    ) {
        return;
    }


    const {
        data,
        error
    } = await supabase
        .from('socios')
        .select(
            'id,numero_socio,nome,email,telemovel,ativo,quotas'
        )
        .order(
            'numero_socio',
            {
                ascending: true
            }
        );


    if (error) {
        throw error;
    }


    state.sociosAdmin =
        data || [];


    renderAdminSocios();
    renderAdminOverdue();
    renderAdminSocioSelect();
}


function renderAdminSocios() {

    const container =
        $('#admin-socios-lista');

    if (!container) {
        return;
    }


    if (!state.sociosAdmin.length) {

        container.innerHTML = `
            <div class="vazio">
                Ainda não existem sócios.
            </div>
        `;

        return;
    }


    container.innerHTML =
        state.sociosAdmin
            .map(
                (socio) => `

                    <label class="admin-socio-row">

                        <input
                            class="admin-socio-select"
                            type="checkbox"
                            value="${esc(socio.id)}"
                        >

                        <span class="admin-socio-numero">
                            ${esc(
                                socio.numero_socio
                            )}
                        </span>

                        <span class="admin-socio-main">

                            <strong>
                                ${esc(
                                    socio.nome
                                )}
                            </strong>

                            <small>
                                ${esc(
                                    socio.email ||
                                    'Sem email'
                                )}
                                ·
                                ${esc(
                                    socio.telemovel ||
                                    'Sem telemóvel'
                                )}
                            </small>

                        </span>

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

                `
            )
            .join('');


    updateAdminSelectedCount();
}


function getSelectedAdminSocios() {

    const ids =
        $$('.admin-socio-select:checked')
            .map(
                (checkbox) =>
                    checkbox.value
            );


    return state.sociosAdmin.filter(
        (socio) =>
            ids.includes(
                String(socio.id)
            )
    );
}


function updateAdminSelectedCount() {

    const count =
        $$('.admin-socio-select:checked')
            .length;


    $('#admin-selected-count')
        .textContent =
        `${count} selecionados`;
}


function selectAllAdminSocios() {

    $$('.admin-socio-select')
        .forEach(
            (checkbox) => {
                checkbox.checked = true;
            }
        );

    updateAdminSelectedCount();
}


function clearAdminSocios() {

    $$('.admin-socio-select')
        .forEach(
            (checkbox) => {
                checkbox.checked = false;
            }
        );

    updateAdminSelectedCount();
}


/* ============================================================
   ADMIN — QUOTAS EM ATRASO
============================================================ */

function renderAdminOverdue() {

    const container =
        $('#admin-overdue-list');

    if (!container) {
        return;
    }


    const overdue =
        state.sociosAdmin.filter(
            (socio) =>
                socio.ativo &&
                socio.email &&
                isQuotaOverdue(
                    socio.quotas
                )
        );


    if (!overdue.length) {

        container.innerHTML = `
            <div class="vazio">
                Não existem sócios ativos com quotas em atraso.
            </div>
        `;

        $('#admin-overdue-count')
            .textContent =
            '0 selecionados';

        return;
    }


    container.innerHTML =
        overdue
            .map(
                (socio) => `

                    <label class="admin-overdue-row">

                        <input
                            class="admin-overdue-select"
                            type="checkbox"
                            value="${esc(socio.id)}"
                        >

                        <span class="admin-overdue-numero">
                            ${esc(
                                socio.numero_socio
                            )}
                        </span>

                        <span class="admin-overdue-main">

                            <strong>
                                ${esc(
                                    socio.nome
                                )}
                            </strong>

                            <small>
                                ${esc(
                                    socio.email
                                )}
                            </small>

                        </span>

                        <span class="admin-overdue-status">
                            ${esc(
                                socio.quotas
                            )}
                        </span>

                    </label>

                `
            )
            .join('');


    updateAdminOverdueCount();
}


function updateAdminOverdueCount() {

    const count =
        $$('.admin-overdue-select:checked')
            .length;


    $('#admin-overdue-count')
        .textContent =
        `${count} selecionados`;
}


function selectAllOverdue() {

    $$('.admin-overdue-select')
        .forEach(
            (checkbox) => {
                checkbox.checked = true;
            }
        );

    updateAdminOverdueCount();
}


function clearOverdue() {

    $$('.admin-overdue-select')
        .forEach(
            (checkbox) => {
                checkbox.checked = false;
            }
        );

    updateAdminOverdueCount();
}


async function sendOverdueEmails() {

    const ids =
        $$('.admin-overdue-select:checked')
            .map(
                (checkbox) =>
                    checkbox.value
            );


    if (!ids.length) {

        throw new Error(
            'Seleciona pelo menos um sócio.'
        );

    }


    const button =
        $('#admin-quotas-atraso');


    button.disabled = true;


    try {

        const {
            data,
            error
        } = await supabase
            .functions
            .invoke(
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

            let message =
                error.message;

            if (error.context) {

                try {

                    const payload =
                        await error.context.json();

                    message =
                        payload?.error ||
                        message;

                } catch (_) {
                    // mantém mensagem original
                }
            }

            throw new Error(
                message ||
                'Não foi possível enviar os emails.'
            );
        }


        if (data?.error) {
            throw new Error(
                data.error
            );
        }


        showMessage(
            `Avisos enviados para ${
                data?.enviados ?? ids.length
            } sócio(s).`,
            'sucesso'
        );

    } finally {

        button.disabled = false;

    }
}


/* ============================================================
   ADMIN — DOCUMENTO PARA TODOS
============================================================ */

async function sendDocumentToAll(event) {

    event.preventDefault();


    const file =
        $('#admin-documento-file')
            ?.files?.[0];


    const subject =
        $('#admin-documento-assunto')
            .value
            .trim();


    const message =
        $('#admin-documento-mensagem')
            .value
            .trim();


    if (!file) {

        throw new Error(
            'Seleciona primeiro o documento PDF.'
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


    if (!subject) {

        throw new Error(
            'Indica o assunto do email.'
        );

    }


    if (!message) {

        throw new Error(
            'Escreve o conteúdo do email antes de enviar.'
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


    const button =
        $('#admin-documento-submit');


    button.disabled = true;


    try {

        /*
         * O backend admin-mail atual espera
         * multipart/form-data.
         */

        const formData =
            new FormData();

        formData.append(
            'action',
            'documento_todos'
        );

        formData.append(
            'subject',
            subject
        );

        formData.append(
            'message',
            message
        );

        formData.append(
            'documento',
            file,
            file.name
        );


        const {
            data,
            error
        } = await supabase
            .functions
            .invoke(
                'admin-mail',
                {
                    body: formData
                }
            );


        if (error) {

            let errorMessage =
                error.message;

            if (error.context) {

                try {

                    const payload =
                        await error.context.json();

                    errorMessage =
                        payload?.error ||
                        errorMessage;

                } catch (_) {
                    // mantém mensagem original
                }
            }

            throw new Error(
                errorMessage ||
                'Não foi possível enviar o documento.'
            );
        }


        if (data?.error) {

            throw new Error(
                data.error
            );

        }


        $('#admin-documento-result')
            .hidden = false;

        $('#admin-documento-result')
            .textContent =
            `Documento enviado para ${
                data?.enviados ?? 'os'
            } sócio(s).`;


        showMessage(
            'Documento enviado com sucesso.',
            'sucesso'
        );


        $('#admin-documento-form')
            .reset();

    } finally {

        button.disabled = false;

    }
}


/* ============================================================
   ADMIN — NOVO SÓCIO
============================================================ */

async function createSocioFromAdmin(event) {

    event.preventDefault();


    const button =
        $('#novo-socio-submit');


    button.disabled = true;


    try {

        const body = {

            nome:
                $('#novo-socio-nome')
                    .value
                    .trim(),

            numero_socio:
                Number(
                    $('#novo-socio-numero')
                        .value
                ),

            email:
                $('#novo-socio-email')
                    .value
                    .trim(),

            telemovel:
                $('#novo-socio-telemovel')
                    .value
                    .trim()

        };


        const {
            data,
            error
        } = await supabase
            .functions
            .invoke(
                'criar-socio',
                {
                    body
                }
            );


        if (error) {

            let message =
                error.message;

            if (error.context) {

                try {

                    const payload =
                        await error.context.json();

                    message =
                        payload?.error ||
                        message;

                } catch (_) {
                    // mantém original
                }
            }

            throw new Error(
                message ||
                'Não foi possível criar o sócio.'
            );
        }


        if (data?.error) {

            throw new Error(
                data.error
            );

        }


        $('#novo-socio-form')
            .reset();


        $('#novo-socio-resultado')
            .hidden = false;

        $('#novo-socio-resultado')
            .textContent =
            `Sócio ${body.numero_socio} criado. Foi enviado um convite para ${body.email}.`;


        showMessage(
            'Sócio criado e convite enviado por email.',
            'sucesso'
        );


        await loadAdminSocios();

    } finally {

        button.disabled = false;

    }
}


/* ============================================================
   ADMIN — RETIRAR PONTOS
============================================================ */

function renderAdminSocioSelect() {

    const select =
        $('#admin-remove-socio');


    if (!select) {
        return;
    }


    select.innerHTML =
        state.sociosAdmin
            .filter(
                (socio) =>
                    socio.ativo
            )
            .map(
                (socio) => `

                    <option value="${esc(socio.id)}">
                        ${esc(
                            socio.numero_socio
                        )}
                        —
                        ${esc(
                            socio.nome
                        )}
                    </option>

                `
            )
            .join('');
}


async function removePoints(event) {

    event.preventDefault();


    const socioId =
        $('#admin-remove-socio')
            .value;


    const pontos =
        Number(
            $('#admin-remove-pontos')
                .value
        );


    const motivo =
        $('#admin-remove-motivo')
            .value
            .trim();


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
            'Os pontos têm de ser um número inteiro positivo.'
        );

    }


    if (!motivo) {

        throw new Error(
            'O motivo é obrigatório.'
        );

    }


    const button =
        $('#admin-remove-points-submit');


    button.disabled = true;


    try {

        /*
         * A função admin-funlearn existente no repositório
         * já valida o saldo e cria o movimento negativo.
         */

        const {
            data,
            error
        } = await supabase
            .functions
            .invoke(
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

            let message =
                error.message;

            if (error.context) {

                try {

                    const payload =
                        await error.context.json();

                    message =
                        payload?.error ||
                        message;

                } catch (_) {
                    // mantém original
                }
            }

            throw new Error(
                message
            );
        }


        if (data?.error) {

            throw new Error(
                data.error
            );

        }


        $('#admin-remove-points-form')
            .reset();


        showMessage(
            data?.warning ||
            'Pontos retirados e sócio notificado por email.',
            data?.warning
                ? 'info'
                : 'sucesso'
        );


        await loadAdminSocios();

    } finally {

        button.disabled = false;

    }
}


/* ============================================================
   ADMIN — FUN & LEARN POR PDF
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
        file.type !== 'application/pdf'
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
            'Indica um número de pontos superior a 0.'
        );

    }


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


    let text = '';


    for (
        let page = 1;
        page <= pdf.numPages;
        page++
    ) {

        const pdfPage =
            await pdf.getPage(page);


        const content =
            await pdfPage
                .getTextContent();


        text +=
            ' ' +
            content.items
                .map(
                    (item) =>
                        item.str
                )
                .join(' ');
    }


    const normalizedText =
        normalizeName(text);


    const {
        data: socios,
        error
    } = await supabase
        .from('socios')
        .select(
            'id,nome,numero_socio'
        )
        .eq(
            'ativo',
            true
        );


    if (error) {
        throw error;
    }


    const encontrados =
        (socios || []).filter(
            (socio) => {

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
            count: 0
        };

    }


    const descricaoFinal =
        atividade
            ? `${atividade}${descricao ? ` — ${descricao}` : ''}`
            : (
                descricao ||
                'Pontuação atribuída automaticamente'
            );


    const rows =
        encontrados.map(
            (socio) => ({
                socio_id:
                    socio.id,

                pontos,

                atividade:
                    atividade ||
                    'Fun&Learn',

                descricao:
                    descricaoFinal
            })
        );


    const {
        error: insertError
    } = await supabase
        .from('funlearn_pontos')
        .insert(rows);


    if (insertError) {
        throw insertError;
    }


    return {
        count:
            encontrados.length
    };
}


/* ============================================================
   TABS
============================================================ */

function setupTabs() {

    $$('.socio-tab')
        .forEach(
            (button) => {

                button.addEventListener(
                    'click',
                    () => {

                        $$('.socio-tab')
                            .forEach(
                                (tab) =>
                                    tab.classList
                                        .remove(
                                            'active'
                                        )
                            );


                        $$('.socio-tab-content')
                            .forEach(
                                (panel) =>
                                    panel.classList
                                        .remove(
                                            'active'
                                        )
                            );


                        button.classList
                            .add('active');


                        const panel =
                            document.getElementById(
                                button.dataset.tab
                            );


                        if (panel) {
                            panel.classList
                                .add('active');
                        }

                    }
                );

            }
        );
}


/* ============================================================
   EVENTOS
============================================================ */

function setupEvents() {


    /* LOGIN */

    $('#login-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();

                hideMessage();


                const button =
                    $('#login-submit');


                button.disabled = true;


                try {

                    const email =
                        $('#login-email')
                            .value
                            .trim();


                    const password =
                        $('#login-password')
                            .value;


                    if (!email) {
                        throw new Error(
                            'Introduz o teu email.'
                        );
                    }


                    if (!password) {
                        throw new Error(
                            'Introduz a tua palavra-passe.'
                        );
                    }


                    await login(
                        email,
                        password
                    );

                } catch (error) {

                    console.error(
                        'Erro no login:',
                        error
                    );


                    showMessage(
                        error.message ||
                        'Não foi possível iniciar sessão.',
                        'erro'
                    );

                } finally {

                    button.disabled = false;

                }

            }
        );


    /* PASSWORD */

    $('#reset-password')
        ?.addEventListener(
            'click',
            async () => {

                const email =
                    $('#login-email')
                        .value
                        .trim();


                if (!email) {

                    showMessage(
                        'Introduz primeiro o teu email.',
                        'info'
                    );

                    $('#login-email')
                        .focus();

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
                        error.message ||
                        'Não foi possível enviar o email.',
                        'erro'
                    );

                }

            }
        );


    /* LOGOUT */

    $('#logout-btn')
        ?.addEventListener(
            'click',
            logout
        );


    /* FOTO */

    $('#photo-trigger')
        ?.addEventListener(
            'click',
            () =>
                $('#photo-input')
                    .click()
        );


    $('#photo-input')
        ?.addEventListener(
            'change',
            async (event) => {

                const file =
                    event.target.files?.[0];


                if (!file) {
                    return;
                }


                try {

                    await uploadPhoto(file);


                    showMessage(
                        'Fotografia atualizada.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        error.message ||
                        'Não foi possível atualizar a fotografia.',
                        'erro'
                    );

                } finally {

                    event.target.value = '';

                }

            }
        );


    /* PDF DO SÓCIO */

    $('#doc-input')
        ?.addEventListener(
            'change',
            async (event) => {

                const file =
                    event.target.files?.[0];


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

                    showMessage(
                        error.message ||
                        'Não foi possível carregar o documento.',
                        'erro'
                    );

                } finally {

                    event.target.value = '';

                }

            }
        );


    /* DADOS */

    $('#editar-dados-btn')
        ?.addEventListener(
            'click',
            () => {

                fillEditForms();

                $('#dados-view').hidden =
                    true;

                $('#dados-edit-form').hidden =
                    false;

                $('#editar-dados-btn').hidden =
                    true;

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
            async (event) => {

                event.preventDefault();

                const button =
                    $('#guardar-dados-btn');

                button.disabled = true;


                try {

                    await savePersonalData();


                    showMessage(
                        'Dados pessoais atualizados.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        error.message ||
                        'Não foi possível guardar os dados.',
                        'erro'
                    );

                } finally {

                    button.disabled = false;

                }

            }
        );


    /* ARBITRAGEM */

    $('#editar-arbitragem-btn')
        ?.addEventListener(
            'click',
            () => {

                fillEditForms();

                $('#arbitragem-view').hidden =
                    true;

                $('#arbitragem-edit-form').hidden =
                    false;

                $('#editar-arbitragem-btn').hidden =
                    true;

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
            async (event) => {

                event.preventDefault();

                const button =
                    event.currentTarget
                        .querySelector(
                            'button[type="submit"]'
                        );

                button.disabled = true;


                try {

                    await saveArbitragemData();


                    showMessage(
                        'Dados de arbitragem atualizados.',
                        'sucesso'
                    );

                } catch (error) {

                    showMessage(
                        error.message ||
                        'Não foi possível guardar os dados.',
                        'erro'
                    );

                } finally {

                    button.disabled = false;

                }

            }
        );


    /* ADMIN */

    $('#novo-socio-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                try {

                    await createSocioFromAdmin(
                        event
                    );

                } catch (error) {

                    showMessage(
                        error.message ||
                        'Não foi possível criar o sócio.',
                        'erro'
                    );

                    $('#novo-socio-resultado')
                        .hidden = false;

                    $('#novo-socio-resultado')
                        .textContent =
                        error.message;

                }

            }
        );


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
                        error.message,
                        'erro'
                    );

                }

            }
        );


    $('#admin-select-all')
        ?.addEventListener(
            'click',
            selectAllAdminSocios
        );


    $('#admin-clear-selection')
        ?.addEventListener(
            'click',
            clearAdminSocios
        );


    $('#admin-socios-lista')
        ?.addEventListener(
            'change',
            updateAdminSelectedCount
        );


    $('#admin-quotas-atraso')
        ?.addEventListener(
            'click',
            async () => {

                try {

                    await sendOverdueEmails();

                } catch (error) {

                    showMessage(
                        error.message,
                        'erro'
                    );

                }

            }
        );


    $('#admin-overdue-select-all')
        ?.addEventListener(
            'click',
            selectAllOverdue
        );


    $('#admin-overdue-clear')
        ?.addEventListener(
            'click',
            clearOverdue
        );


    $('#admin-overdue-list')
        ?.addEventListener(
            'change',
            updateAdminOverdueCount
        );


    $('#admin-documento-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                try {

                    await sendDocumentToAll(
                        event
                    );

                } catch (error) {

                    showMessage(
                        error.message,
                        'erro'
                    );

                }

            }
        );


    $('#admin-remove-points-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                try {

                    await removePoints(
                        event
                    );

                } catch (error) {

                    showMessage(
                        error.message,
                        'erro'
                    );

                }

            }
        );


    $('#funlearn-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();

                const button =
                    $('#funlearn-submit');

                button.disabled = true;


                try {

                    const result =
                        await processFunlearnPdf(

                            $('#funlearn-file')
                                .files?.[0],

                            Number(
                                $('#funlearn-pontos')
                                    .value
                            ),

                            $('#funlearn-atividade')
                                .value
                                .trim(),

                            $('#funlearn-descricao')
                                .value
                                .trim()
                        );


                    showMessage(
                        result.count
                            ? `Processamento concluído: ${result.count} sócio(s) recebeu(ram) pontos.`
                            : 'O PDF foi processado, mas não foi encontrado nenhum sócio correspondente.',
                        result.count
                            ? 'sucesso'
                            : 'info'
                    );


                    $('#funlearn-form')
                        .reset();


                    await loadFunlearn();

                } catch (error) {

                    showMessage(
                        error.message ||
                        'Erro ao processar o PDF.',
                        'erro'
                    );

                } finally {

                    button.disabled = false;

                }

            }
        );
}


/* ============================================================
   ARRANQUE
============================================================ */

async function init() {

    setupTabs();

    setupEvents();


    try {

        const {
            data: {
                session
            }
        } =
            await supabase.auth.getSession();


        if (!session) {
            return;
        }


        await loadProfile(
            session.user
        );


        renderProfile();

    } catch (error) {

        console.error(
            'Erro ao carregar sessão:',
            error
        );


        await supabase.auth.signOut();


        showMessage(
            error.message ||
            'A sessão não pôde ser carregada.',
            'erro'
        );

    }
}


/*
 * Mantém a interface sincronizada com alterações
 * de autenticação.
 */

supabase.auth.onAuthStateChange(
    async (_event, session) => {

        if (!session) {

            if ($('#login-panel')) {
                $('#login-panel').hidden =
                    false;
            }

            if ($('#dashboard')) {
                $('#dashboard').hidden =
                    true;
            }

            return;
        }

        /*
         * Não repetimos loadProfile durante o SIGNED_IN
         * se o init já está a tratar da sessão.
         */

    }
);


init();
/* =========================================================
   COMPROVATIVO DE QUOTAS
========================================================= */

const quotaComprovativo =
    document.getElementById("quota-comprovativo");

const quotaUploadStatus =
    document.getElementById("quota-upload-status");

if (quotaComprovativo) {

    quotaComprovativo.addEventListener(
        "change",
        async function () {

            const file = this.files?.[0];

            if (!file) {
                return;
            }

            if (file.type !== "application/pdf") {

                mostrarQuotaStatus(
                    "erro",
                    "Selecione um ficheiro PDF válido."
                );

                this.value = "";

                return;
            }

            if (file.size > 10 * 1024 * 1024) {

                mostrarQuotaStatus(
                    "erro",
                    "O PDF não pode ultrapassar 10 MB."
                );

                this.value = "";

                return;
            }

            await processarComprovativoQuota(file);
        }
    );
}


function mostrarQuotaStatus(tipo, mensagem) {

    if (!quotaUploadStatus) {
        return;
    }

    quotaUploadStatus.hidden = false;

    quotaUploadStatus.className =
        "admin-result quota-payment-result " + tipo;

    quotaUploadStatus.textContent = mensagem;
}


async function processarComprovativoQuota(file) {

    try {

        mostrarQuotaStatus(
            "info",
            "A analisar o comprovativo. Aguarde..."
        );


        const {
            data: {
                session
            }
        } = await supabase.auth.getSession();


        if (!session) {

            mostrarQuotaStatus(
                "erro",
                "A sua sessão terminou. Entre novamente."
            );

            return;
        }


        const formData = new FormData();

        formData.append(
            "comprovativo",
            file
        );


        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/processar-comprovativo`,
            {
                method: "POST",

                headers: {
                    Authorization:
                        `Bearer ${session.access_token}`
                },

                body: formData
            }
        );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Não foi possível processar o comprovativo."
            );
        }


        mostrarQuotaStatus(
            "sucesso",
            result.message
        );


        quotaComprovativo.value = "";


        await carregarQuotas();

        await carregarRecibos();


    } catch (error) {

        console.error(
            "Erro ao processar comprovativo:",
            error
        );


        mostrarQuotaStatus(
            "erro",
            error.message ||
            "Erro ao processar o comprovativo."
        );
    }
}
const importQuotasForm =
    document.getElementById(
        "admin-import-quotas-form"
    );


if (importQuotasForm) {

    importQuotasForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();


            const file =
                document.getElementById(
                    "admin-quotas-excel"
                ).files[0];


            const resultBox =
                document.getElementById(
                    "admin-import-quotas-result"
                );


            if (!file) {
                return;
            }


            resultBox.hidden = false;

            resultBox.className =
                "admin-result";

            resultBox.textContent =
                "A importar quotas...";


            try {

                const {
                    data: {
                        session
                    }
                } =
                    await supabase.auth
                        .getSession();


                if (!session) {

                    throw new Error(
                        "Sessão terminada."
                    );
                }


                const formData =
                    new FormData();


                formData.append(
                    "excel",
                    file
                );


                const response =
                    await fetch(
                        `${SUPABASE_URL}/functions/v1/importar-quotas`,
                        {
                            method: "POST",

                            headers: {
                                Authorization:
                                    `Bearer ${session.access_token}`
                            },

                            body: formData
                        }
                    );


                const result =
                    await response.json();


                if (!response.ok) {
                    throw new Error(
                        result.error ||
                        "Erro na importação."
                    );
                }


                resultBox.className =
                    "admin-result sucesso";


                resultBox.textContent =
                    result.message;


                await carregarQuotasAdmin();

                await carregarListaSocios();


            } catch (error) {

                console.error(error);

                resultBox.className =
                    "admin-result erro";

                resultBox.textContent =
                    error.message;
            }
        }
    );
}
