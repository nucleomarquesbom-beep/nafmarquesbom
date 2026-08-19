import {
    createClient
} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
} from './supabase-config.js';


/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const supabase =
    createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );


window.__NAF_SUPABASE =
    supabase;


const ADMIN_NUMERO =
    9999;


const state = {
    user: null,
    socio: null,
    admin: false,
    adminLoaded: false,
    adminLoading: false
};


/* =========================================================
   HELPERS
========================================================= */

const $ =
    selector =>
        document.querySelector(selector);


const $$ =
    selector =>
        [...document.querySelectorAll(selector)];


function escapeHtml(
    value = ''
) {

    return String(value).replace(
        /[&<>'"]/g,
        character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[character])
    );

}


function showMessage(
    text,
    type = 'info'
) {

    const element =
        $('#socio-message');

    if (!element) {
        return;
    }

    element.textContent =
        text;

    element.className =
        `socio-message ${type}`;

    element.hidden =
        false;

}


function hideMessage() {

    const element =
        $('#socio-message');

    if (element) {
        element.hidden =
            true;
    }

}


/* =========================================================
   LIMPEZA DA ÁREA PRIVADA
========================================================= */

function clearPrivateUI() {

    state.user =
        null;

    state.socio =
        null;

    state.admin =
        false;

    state.adminLoaded =
        false;


    if ($('#login-panel')) {
        $('#login-panel').hidden =
            false;
    }


    if ($('#dashboard')) {
        $('#dashboard').hidden =
            true;
    }


    if ($('#admin-tab')) {
        $('#admin-tab').hidden =
            true;

        $('#admin-tab').classList.remove(
            'admin-visible'
        );
    }


    const clearIds = [

        '#socio-name',
        '#socio-number',

        '#dados-nome',
        '#dados-numero',
        '#dados-nascimento',
        '#dados-email',
        '#dados-morada',
        '#dados-telemovel',
        '#dados-arbitro',
        '#dados-af',
        '#dados-modalidade',
        '#dados-categoria',

        '#funlearn-total',
        '#funlearn-total-top'

    ];


    clearIds.forEach(
        selector => {

            const element =
                $(selector);

            if (element) {
                element.textContent =
                    '—';
            }

        }
    );


    if ($('#funlearn-total')) {
        $('#funlearn-total').textContent =
            '0';
    }


    if ($('#funlearn-total-top')) {
        $('#funlearn-total-top').textContent =
            '0';
    }


    if ($('#docs-list')) {
        $('#docs-list').innerHTML =
            '';
    }


    if ($('#funlearn-history')) {
        $('#funlearn-history').innerHTML =
            '';
    }


    const photo =
        $('#socio-photo');


    const placeholder =
        $('#socio-photo-placeholder');


    if (photo) {

        photo.removeAttribute(
            'src'
        );

        photo.hidden =
            true;

    }


    if (placeholder) {
        placeholder.hidden =
            false;
    }

}


/* =========================================================
   AUTENTICAÇÃO
========================================================= */

async function getSession() {

    const {
        data,
        error
    } =
        await supabase.auth.getSession();


    if (error) {
        throw error;
    }


    return data.session ||
        null;

}


async function login(
    email,
    password
) {

    const {
        error
    } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });


    if (error) {
        throw error;
    }

}


async function resetPassword(
    email
) {

    const {
        error
    } =
        await supabase.auth.resetPasswordForEmail(
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


async function logout() {

    await supabase.auth.signOut();

    clearPrivateUI();

    window.location.reload();

}


/* =========================================================
   SÓCIOS PÚBLICOS
========================================================= */

async function loadPublicMembers() {

    const root =
        $('#public-members-list');


    if (!root) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await supabase.rpc(
                'socios_publicos_por_categoria'
            );


        if (error) {
            throw error;
        }


        const groups = {
            Futebol: [],
            Futsal: []
        };


        (data || []).forEach(
            row => {

                const modalidade =
                    String(
                        row.modalidade ||
                        ''
                    ).toLowerCase() === 'futsal'
                        ? 'Futsal'
                        : 'Futebol';


                if (
                    !row.categoria ||
                    !row.nome
                ) {
                    return;
                }


                groups[modalidade].push({
                    categoria:
                        String(row.categoria),

                    nome:
                        String(row.nome)
                });

            }
        );


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


        const normalize =
            value =>
                String(value)
                    .trim()
                    .toLowerCase();


        root.innerHTML =
            '';


        Object.entries(groups)
            .forEach(
                ([modalidade, rows]) => {

                    const categories =
                        [
                            ...new Set(
                                rows.map(
                                    row =>
                                        row.categoria
                                )
                            )
                        ]
                        .sort(
                            (a, b) => {

                                const ia =
                                    order[
                                        modalidade
                                    ]
                                    .findIndex(
                                        value =>
                                            normalize(
                                                value
                                            ) ===
                                            normalize(
                                                a
                                            )
                                    );


                                const ib =
                                    order[
                                        modalidade
                                    ]
                                    .findIndex(
                                        value =>
                                            normalize(
                                                value
                                            ) ===
                                            normalize(
                                                b
                                            )
                                    );


                                return (
                                    (ia < 0
                                        ? 999
                                        : ia) -
                                    (ib < 0
                                        ? 999
                                        : ib)
                                ) ||
                                a.localeCompare(
                                    b,
                                    'pt'
                                );

                            }
                        );


                    if (!categories.length) {
                        return;
                    }


                    const group =
                        document.createElement(
                            'section'
                        );


                    group.className =
                        'public-members-group';


                    group.innerHTML = `
                        <h3>
                            ${escapeHtml(modalidade)}
                        </h3>

                        <div
                            class="public-category-row"
                        ></div>
                    `;


                    const rowElement =
                        group.querySelector(
                            '.public-category-row'
                        );


                    categories.forEach(
                        category => {

                            const members =
                                rows
                                    .filter(
                                        row =>
                                            normalize(
                                                row.categoria
                                            ) ===
                                            normalize(
                                                category
                                            )
                                    )
                                    .sort(
                                        (a, b) =>
                                            a.nome.localeCompare(
                                                b.nome,
                                                'pt'
                                            )
                                    );


                            const wrapper =
                                document.createElement(
                                    'div'
                                );


                            wrapper.className =
                                'public-category';


                            const button =
                                document.createElement(
                                    'button'
                                );


                            button.type =
                                'button';

                            button.className =
                                'public-category-trigger';

                            button.textContent =
                                category;

                            button.setAttribute(
                                'aria-expanded',
                                'false'
                            );


                            const panel =
                                document.createElement(
                                    'div'
                                );


                            panel.className =
                                'public-category-members';


                            const ul =
                                document.createElement(
                                    'ul'
                                );


                            members.forEach(
                                member => {

                                    const li =
                                        document.createElement(
                                            'li'
                                        );

                                    li.textContent =
                                        member.nome;

                                    ul.appendChild(
                                        li
                                    );

                                }
                            );


                            panel.appendChild(
                                ul
                            );


                            wrapper.append(
                                button,
                                panel
                            );


                            rowElement.appendChild(
                                wrapper
                            );


                            button.addEventListener(
                                'click',
                                () => {

                                    if (
                                        !window
                                            .matchMedia(
                                                '(max-width: 700px)'
                                            )
                                            .matches
                                    ) {
                                        return;
                                    }


                                    const open =
                                        !wrapper.classList.contains(
                                            'open'
                                        );


                                    $$('.public-category.open')
                                        .forEach(
                                            element => {

                                                element.classList.remove(
                                                    'open'
                                                );

                                                element
                                                    .querySelector(
                                                        'button'
                                                    )
                                                    ?.setAttribute(
                                                        'aria-expanded',
                                                        'false'
                                                    );

                                            }
                                        );


                                    wrapper.classList.toggle(
                                        'open',
                                        open
                                    );


                                    button.setAttribute(
                                        'aria-expanded',
                                        String(open)
                                    );

                                }
                            );

                        }
                    );


                    root.appendChild(
                        group
                    );

                }
            );


        if (!root.children.length) {

            root.innerHTML =
                '<div class="vazio">Não existem categorias com sócios ativos.</div>';

        }


    } catch (error) {

        console.error(
            'Erro ao carregar sócios públicos:',
            error
        );


        root.innerHTML =
            '<div class="vazio">Não foi possível carregar a lista de sócios.</div>';

    }

}


/* =========================================================
   PERFIL
========================================================= */

async function loadProfile(
    user
) {

    if (!user?.id) {
        throw new Error(
            'Utilizador autenticado inválido.'
        );
    }


    let data;


    /*
     * Mantemos a validação existente.
     */
    const {
        data: acesso,
        error: acessoError
    } =
        await supabase.rpc(
            'validar_acesso_socio'
        );


    if (!acessoError) {

        const resultado =
            Array.isArray(acesso)
                ? acesso[0]
                : acesso;


        if (!resultado?.permitido) {

            throw new Error(
                resultado?.motivo ||
                'O acesso ao espaço de sócio está inativo.'
            );

        }

    } else {

        /*
         * Fallback para instalações onde
         * a RPC ainda não esteja disponível.
         */
        const fallback =
            await supabase
                .from('socios')
                .select('*')
                .eq(
                    'user_id',
                    user.id
                )
                .eq(
                    'ativo',
                    true
                )
                .single();


        if (fallback.error) {
            throw fallback.error;
        }


        data =
            fallback.data;

    }


    const result =
        data
            ? {
                data,
                error: null
            }
            : await supabase
                .from('socios')
                .select('*')
                .eq(
                    'user_id',
                    user.id
                )
                .eq(
                    'ativo',
                    true
                )
                .single();


    if (result.error) {
        throw result.error;
    }


    data =
        result.data;


    if (!data) {

        throw new Error(
            'A conta autenticada não está associada a um sócio ativo.'
        );

    }


    state.user =
        user;

    state.socio =
        data;


    /*
     * IMPORTANTE:
     *
     * NÃO fazemos redirect para admin.html.
     *
     * O administrador permanece em socio.html
     * e a aba Administração é apresentada.
     */
    state.admin =
        data.is_admin === true &&
        data.ativo === true;


    window.NAF_IS_ROOT_ADMIN =
        state.admin &&
        Number(data.numero_socio) ===
            ADMIN_NUMERO;

}


/* =========================================================
   RENDER PERFIL
========================================================= */

function renderProfile() {

    const socio =
        state.socio;


    if (!socio) {
        return;
    }


    $('#login-panel').hidden =
        true;


    $('#dashboard').hidden =
        false;


    /*
     * Administração só aparece
     * para administradores.
     */
    const adminTab =
        $('#admin-tab');


    if (adminTab) {

        adminTab.hidden =
            !state.admin;


        adminTab.classList.toggle(
            'admin-visible',
            state.admin
        );

    }


    $('#socio-name').textContent =
        socio.nome ||
        'Sócio';


    $('#socio-number').textContent =
        socio.numero_socio ??
        '—';


    $('#dados-nome').textContent =
        socio.nome ||
        '—';


    $('#dados-numero').textContent =
        socio.numero_socio ??
        '—';


    $('#dados-nascimento').textContent =
        socio.data_nascimento
            ? new Date(
                `${socio.data_nascimento}T00:00:00`
            ).toLocaleDateString(
                'pt-PT'
            )
            : '—';


    $('#dados-email').textContent =
        socio.email ||
        state.user?.email ||
        '—';


    $('#dados-morada').textContent =
        socio.morada ||
        '—';


    $('#dados-telemovel').textContent =
        socio.telemovel ||
        '—';


    $('#dados-arbitro').textContent =
        socio.numero_arbitro ||
        '—';


    $('#dados-af').textContent =
        socio.associacao_futebol ||
        '—';


    $('#dados-modalidade').textContent =
        socio.modalidade ||
        '—';


    $('#dados-categoria').textContent =
        socio.categoria ||
        '—';


    fillEditForms();

    loadPhoto();

    loadQuotas();

    loadDocuments();

    loadFunlearn();


    /*
     * Se for administrador, a aba fica disponível.
     * A administração só é carregada quando
     * o administrador clicar nela.
     */

}


/* =========================================================
   FORMULÁRIO DE DADOS
========================================================= */

function fillEditForms() {

    const socio =
        state.socio;


    if (!socio) {
        return;
    }


    const fields = {

        '#edit-nome':
            socio.nome || '',

        '#edit-nascimento':
            socio.data_nascimento || '',

        '#edit-morada':
            socio.morada || '',

        '#edit-telemovel':
            socio.telemovel || '',

        '#edit-email':
            socio.email ||
            state.user?.email ||
            '',

        '#edit-associacao-futebol':
            socio.associacao_futebol ||
            '',

        '#edit-numero-arbitro':
            socio.numero_arbitro ||
            '',

        '#edit-modalidade':
            socio.modalidade ||
            '',

        '#edit-categoria':
            socio.categoria ||
            ''

    };


    Object.entries(fields)
        .forEach(
            ([selector, value]) => {

                const element =
                    $(selector);

                if (element) {
                    element.value =
                        value;
                }

            }
        );

}


/* =========================================================
   GUARDAR DADOS
========================================================= */

async function saveProfileChanges() {

    if (!state.socio) {

        throw new Error(
            'Não existe uma sessão de sócio ativa.'
        );

    }


    const updates = {

        nome:
            $('#edit-nome')
                ?.value
                .trim() ||
            null,

        data_nascimento:
            $('#edit-nascimento')
                ?.value ||
            null,

        morada:
            $('#edit-morada')
                ?.value
                .trim() ||
            null,

        telemovel:
            $('#edit-telemovel')
                ?.value
                .trim() ||
            null,

        email:
            $('#edit-email')
                ?.value
                .trim() ||
            null,

        associacao_futebol:
            $('#edit-associacao-futebol')
                ?.value
                .trim() ||
            null,

        numero_arbitro:
            $('#edit-numero-arbitro')
                ?.value
                .trim() ||
            null,

        modalidade:
            $('#edit-modalidade')
                ?.value
                .trim() ||
            null,

        categoria:
            $('#edit-categoria')
                ?.value
                .trim() ||
            null

    };


    if (
        !updates.email ||
        !updates.email.includes('@')
    ) {

        throw new Error(
            'Indica um email válido.'
        );

    }


    const {
        data,
        error
    } =
        await supabase
            .from('socios')
            .update(updates)
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


    state.socio =
        data;


    renderProfile();


    showMessage(
        'Os teus dados foram atualizados.',
        'sucesso'
    );

}


/* =========================================================
   FORMULÁRIO DE PERFIL
========================================================= */

function setupProfileForm() {

    /*
     * Compatibilidade com o HTML anterior.
     */
    const oldForm =
        $('#dados-form');


    if (oldForm) {

        if (
            !oldForm.dataset.bound
        ) {

            oldForm.dataset.bound =
                '1';


            oldForm.addEventListener(
                'submit',
                async event => {

                    event.preventDefault();


                    try {

                        await saveProfileChanges();

                    } catch (error) {

                        console.error(
                            error
                        );


                        showMessage(
                            error.message ||
                            'Não foi possível guardar os dados.',
                            'erro'
                        );

                    }

                }
            );

        }

    }


    /*
     * Compatibilidade com o HTML
     * que acabámos de criar.
     */
    const newForm =
        $('#editar-dados-form');


    if (
        newForm &&
        !newForm.dataset.bound
    ) {

        newForm.dataset.bound =
            '1';


        newForm.addEventListener(
            'submit',
            async event => {

                event.preventDefault();


                try {

                    const button =
                        $('#guardar-dados-btn');


                    if (button) {
                        button.disabled =
                            true;
                    }


                    await saveProfileChanges();


                    const wrapper =
                        $('#editar-dados-form-wrap');


                    if (wrapper) {
                        wrapper.hidden =
                            true;
                    }


                } catch (error) {

                    console.error(
                        error
                    );


                    showMessage(
                        error.message ||
                        'Não foi possível guardar os dados.',
                        'erro'
                    );

                } finally {

                    const button =
                        $('#guardar-dados-btn');


                    if (button) {
                        button.disabled =
                            false;
                    }

                }

            }
        );

    }


    $('#editar-dados-btn')
        ?.addEventListener(
            'click',
            () => {

                fillEditForms();


                const wrapper =
                    $('#editar-dados-form-wrap');


                if (wrapper) {
                    wrapper.hidden =
                        false;
                }

            }
        );


    $('#cancelar-dados-btn')
        ?.addEventListener(
            'click',
            () => {

                const wrapper =
                    $('#editar-dados-form-wrap');


                if (wrapper) {
                    wrapper.hidden =
                        true;
                }

            }
        );

}


/* =========================================================
   FOTOGRAFIA
========================================================= */

async function loadPhoto() {

    const image =
        $('#socio-photo');


    const placeholder =
        $('#socio-photo-placeholder');


    if (
        !image ||
        !placeholder ||
        !state.socio
    ) {
        return;
    }


    const path =
        state.socio.fotografia_path ||
        state.socio.fotografia_url ||
        null;


    if (!path) {

        image.removeAttribute(
            'src'
        );

        image.hidden =
            true;

        placeholder.hidden =
            false;

        return;

    }


    if (
        /^https?:\/\//i.test(path)
    ) {

        image.src =
            path;

        image.hidden =
            false;

        placeholder.hidden =
            true;

        return;

    }


    try {

        const {
            data,
            error
        } =
            await supabase.storage
                .from(
                    'fotografias-socios'
                )
                .createSignedUrl(
                    path,
                    3600
                );


        if (
            error ||
            !data?.signedUrl
        ) {
            throw error ||
                new Error(
                    'URL da fotografia indisponível.'
                );
        }


        image.src =
            data.signedUrl;

        image.hidden =
            false;

        placeholder.hidden =
            true;

    } catch (error) {

        console.error(
            'Erro ao carregar fotografia:',
            error
        );


        image.hidden =
            true;

        placeholder.hidden =
            false;

    }

}


async function uploadPhoto(
    file
) {

    if (
        !file ||
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


    if (!state.socio) {
        throw new Error(
            'Sessão inválida.'
        );
    }


    const extension =
        file.type === 'image/jpeg'
            ? 'jpg'
            : file.type.split('/')[1];


    const path =
        `${state.socio.id}/fotografia.${extension}`;


    const {
        error: uploadError
    } =
        await supabase.storage
            .from(
                'fotografias-socios'
            )
            .upload(
                path,
                file,
                {
                    contentType:
                        file.type,

                    upsert:
                        true
                }
            );


    if (uploadError) {
        throw uploadError;
    }


    const {
        error: dbError
    } =
        await supabase
            .from('socios')
            .update({
                fotografia_path:
                    path
            })
            .eq(
                'id',
                state.socio.id
            )
            .eq(
                'user_id',
                state.user.id
            );


    if (dbError) {
        throw dbError;
    }


    state.socio.fotografia_path =
        path;


    await loadPhoto();

}


function setupPhotoUpload() {

    $('#photo-trigger')
        ?.addEventListener(
            'click',
            event => {

                event.preventDefault();
                event.stopPropagation();


                $('#photo-input')
                    ?.click();

            }
        );


    $('#photo-input')
        ?.addEventListener(
            'change',
            async event => {

                const file =
                    event.target.files?.[0];


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

                    console.error(
                        error
                    );


                    showMessage(
                        error.message ||
                        'Não foi possível atualizar a fotografia.',
                        'erro'
                    );

                } finally {

                    event.target.value =
                        '';

                }

            }
        );

}


/* =========================================================
   QUOTAS DO SÓCIO
========================================================= */

function quotaStatusLabel(
    status
) {

    const normalized =
        String(status || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            );


    if (
        [
            'paga',
            'pago',
            'regularizada',
            'regularizado',
            'liquidada',
            'liquidado'
        ].includes(normalized)
    ) {
        return 'Paga';
    }


    if (
        [
            'em_atraso',
            'em atraso',
            'atrasada',
            'atrasado',
            'vencida',
            'vencido'
        ].includes(normalized)
    ) {
        return 'Em atraso';
    }


    if (
        [
            'pendente',
            'por_pagar',
            'por pagar'
        ].includes(normalized)
    ) {
        return 'Pendente';
    }


    return status
        ? String(status)
        : 'Por regularizar';

}


function quotaStatusClass(
    status
) {

    const label =
        quotaStatusLabel(
            status
        ).toLowerCase();


    if (
        label === 'paga'
    ) {
        return 'quota-paga';
    }


    if (
        label === 'em atraso'
    ) {
        return 'quota-atraso';
    }


    return 'quota-pendente';

}


function formatQuotaMonth(
    year,
    month
) {

    if (
        !year ||
        !month
    ) {
        return '';
    }


    const date =
        new Date(
            Number(year),
            Number(month) - 1,
            1
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return '';
    }


    return date.toLocaleDateString(
        'pt-PT',
        {
            month: 'long',
            year: 'numeric'
        }
    );

}


function formatQuotaValue(
    value
) {

    if (
        value === null ||
        value === undefined ||
        value === ''
    ) {
        return '';
    }


    const number =
        Number(value);


    if (
        !Number.isFinite(
            number
        )
    ) {
        return String(value);
    }


    return `${number
        .toFixed(2)
        .replace('.', ',')} €`;

}


async function loadQuotas() {

    const root =
        $('#quotas-list');


    if (
        !root ||
        !state.socio?.id
    ) {
        return;
    }


    root.innerHTML =
        '<div class="vazio">A carregar quotas…</div>';


    try {

        const {
            data,
            error
        } =
            await supabase
                .from('quotas')
                .select('*')
                .eq(
                    'socio_id',
                    state.socio.id
                )
                .order(
                    'ano',
                    {
                        ascending: false
                    }
                )
                .order(
                    'mes',
                    {
                        ascending: false
                    }
                );


        if (error) {
            throw error;
        }


        const quotas =
            data || [];


        if (!quotas.length) {

            root.innerHTML =
                `<div class="vazio">
                    Não existem quotas registadas.
                </div>`;

            return;

        }


        const atrasadas =
            quotas.filter(
                quota =>
                    quotaStatusLabel(
                        quota.estado
                    ) ===
                    'Em atraso'
            );


        const pagas =
            quotas.filter(
                quota =>
                    quotaStatusLabel(
                        quota.estado
                    ) ===
                    'Paga'
            );


        const pendentes =
            quotas.filter(
                quota =>
                    quotaStatusLabel(
                        quota.estado
                    ) ===
                    'Pendente'
            );


        const resumo = `
            <div class="vazio">

                ${
                    atrasadas.length
                        ? `<strong>
                            Quotas em atraso:
                            ${atrasadas.length}
                           </strong>`
                        : 'Quotas regularizadas.'
                }

                ${
                    pagas.length
                        ? ` • ${pagas.length} pagas`
                        : ''
                }

                ${
                    pendentes.length
                        ? ` • ${pendentes.length} pendentes`
                        : ''
                }

            </div>
        `;


        const rows =
            quotas.map(
                quota => {

                    const periodo =
                        formatQuotaMonth(
                            quota.ano,
                            quota.mes
                        ) ||
                        [
                            quota.ano,
                            quota.mes
                        ]
                        .filter(Boolean)
                        .join('/');


                    const estado =
                        quotaStatusLabel(
                            quota.estado
                        );


                    return `
                        <div
                            class="quota-row"
                        >

                            <div>

                                <strong>
                                    ${escapeHtml(
                                        periodo ||
                                        'Quota'
                                    )}
                                </strong>

                                ${
                                    quota.valor !==
                                        null &&
                                    quota.valor !==
                                        undefined
                                        ? `<small>
                                            ${escapeHtml(
                                                formatQuotaValue(
                                                    quota.valor
                                                )
                                            )}
                                           </small>`
                                        : ''
                                }

                            </div>


                            <span
                                class="${quotaStatusClass(
                                    quota.estado
                                )}"
                            >
                                ${escapeHtml(
                                    estado
                                )}
                            </span>

                        </div>
                    `;

                }
            )
            .join('');


        root.innerHTML =
            resumo +
            `<div class="quotas-items">
                ${rows}
             </div>`;

    } catch (error) {

        console.error(
            'Erro ao carregar quotas:',
            error
        );


        root.innerHTML =
            `<div class="vazio">
                Não foi possível carregar as quotas neste momento.
             </div>`;

    }

}


/* =========================================================
   DOCUMENTOS
========================================================= */

async function loadDocuments() {

    const root =
        $('#docs-list');


    if (
        !root ||
        !state.socio
    ) {
        return;
    }


    try {

        const {
            data,
            error
        } =
            await supabase
                .from(
                    'documentos_socios'
                )
                .select(
                    'id,nome_ficheiro,storage_path,tamanho_bytes,tipo_mime,created_at'
                )
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
            throw error;
        }


        const documents =
            data || [];


        if (!documents.length) {

            root.innerHTML =
                '<div class="vazio">Ainda não existem documentos.</div>';

            return;

        }


        const urlResults =
            await Promise.all(
                documents.map(
                    async document => {

                        if (
                            !document.storage_path
                        ) {
                            return [
                                document.id,
                                null
                            ];
                        }


                        const result =
                            await supabase
                                .storage
                                .from(
                                    'documentos-socios'
                                )
                                .createSignedUrl(
                                    document.storage_path,
                                    3600
                                );


                        return [
                            document.id,
                            result.error
                                ? null
                                : result.data?.signedUrl ||
                                  null
                        ];

                    }
                )
            );


        const urlById =
            new Map(
                urlResults
            );


        root.innerHTML =
            documents
                .map(
                    document => {

                        const signedUrl =
                            urlById.get(
                                document.id
                            );


                        return `
                            <div
                                class="documento-socio-item"
                            >

                                <div>

                                    <strong>
                                        📄
                                        ${escapeHtml(
                                            document.nome_ficheiro ||
                                            'Documento PDF'
                                        )}
                                    </strong>

                                    <small>
                                        ${
                                            document.created_at
                                                ? new Date(
                                                    document.created_at
                                                ).toLocaleDateString(
                                                    'pt-PT'
                                                )
                                                : ''
                                        }
                                    </small>

                                </div>


                                ${
                                    signedUrl
                                        ? `<a
                                            class="botao"
                                            href="${escapeHtml(
                                                signedUrl
                                            )}"
                                            target="_blank"
                                            rel="noopener"
                                           >
                                            Abrir
                                           </a>`
                                        : ''
                                }

                            </div>
                        `;

                    }
                )
                .join('');

    } catch (error) {

        console.error(
            'Erro ao carregar documentos:',
            error
        );


        root.innerHTML =
            '<div class="vazio">Não foi possível carregar os documentos.</div>';

    }

}


async function uploadSocioPdf(
    file
) {

    if (
        !file ||
        file.type !==
            'application/pdf'
    ) {

        throw new Error(
            'Só são permitidos ficheiros PDF.'
        );

    }


    const {
        count,
        error: countError
    } =
        await supabase
            .from(
                'documentos_socios'
            )
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


    if (
        (count || 0) >= 12
    ) {

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
    } =
        await supabase.storage
            .from(
                'documentos-socios'
            )
            .upload(
                path,
                file,
                {
                    contentType:
                        'application/pdf',

                    upsert:
                        false
                }
            );


    if (uploadError) {
        throw uploadError;
    }


    const {
        error: dbError
    } =
        await supabase
            .from(
                'documentos_socios'
            )
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


    if (dbError) {

        await supabase
            .storage
            .from(
                'documentos-socios'
            )
            .remove([
                path
            ]);

        throw dbError;

    }

}


/* =========================================================
   FUN&LEARN DO SÓCIO
========================================================= */

async function loadFunlearn() {

    const history =
        $('#funlearn-history');


    if (
        !history ||
        !state.socio
    ) {
        return;
    }


    const {
        data,
        error
    } =
        await supabase
            .from(
                'funlearn_pontos'
            )
            .select(
                'id,pontos,descricao,created_at'
            )
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

        console.error(
            error
        );


        history.innerHTML =
            '<div class="vazio">Não foi possível carregar o histórico.</div>';

        return;

    }


    const rows =
        data || [];


    const total =
        rows.reduce(
            (
                sum,
                row
            ) =>
                sum +
                Number(
                    row.pontos || 0
                ),
            0
        );


    if ($('#funlearn-total')) {

        $('#funlearn-total')
            .textContent =
            total;

    }


    if ($('#funlearn-total-top')) {

        $('#funlearn-total-top')
            .textContent =
            total;

    }


    history.innerHTML =
        rows.length

            ? rows
                .map(
                    row => `
                        <div
                            class="fun-row"
                        >

                            <div>

                                <strong>
                                    Fun&amp;Learn
                                </strong>

                                <small>
                                    ${escapeHtml(
                                        row.descricao ||
                                        ''
                                    )}

                                    ${
                                        row.created_at
                                            ? ` • ${new Date(
                                                row.created_at
                                            ).toLocaleDateString(
                                                'pt-PT'
                                            )}`
                                            : ''
                                    }

                                </small>

                            </div>

                            <b>
                                ${
                                    Number(
                                        row.pontos || 0
                                    ) > 0
                                        ? '+'
                                        : ''
                                }${Number(
                                    row.pontos || 0
                                )}
                            </b>

                        </div>
                    `
                )
                .join('')

            : '<div class="vazio">Ainda não existem movimentos de pontos.</div>';

}


/* =========================================================
   TABS PRINCIPAIS
========================================================= */

function syncMobileTabSelector() {

    const select =
        $('#socio-tab-select');


    if (!select) {
        return;
    }


    const buttons =
        $$('.socio-tab')
            .filter(
                button =>
                    !button.hidden
            );


    const active =
        buttons.find(
            button =>
                button.classList.contains(
                    'active'
                )
        )?.dataset.tab;


    const previous =
        select.value;


    select.innerHTML =
        buttons
            .map(
                button => `
                    <option
                        value="${escapeHtml(
                            button.dataset.tab ||
                            ''
                        )}"
                    >
                        ${escapeHtml(
                            button.textContent.trim()
                        )}
                    </option>
                `
            )
            .join('');


    select.value =
        buttons.some(
            button =>
                button.dataset.tab ===
                previous
        )
            ? previous
            : (
                active ||
                buttons[0]?.dataset.tab ||
                ''
            );

}


function activateSocioTab(
    tabName
) {

    const button =
        $$('.socio-tab')
            .find(
                item =>
                    item.dataset.tab ===
                    tabName &&
                    !item.hidden
            );


    if (!button) {
        return;
    }


    $$('.socio-tab')
        .forEach(
            item =>
                item.classList.remove(
                    'active'
                )
        );


    $$('.socio-tab-content')
        .forEach(
            panel => {

                panel.classList.remove(
                    'active'
                );

                panel.hidden =
                    true;

            }
        );


    button.classList.add(
        'active'
    );


    const panel =
        document.getElementById(
            tabName
        );


    if (panel) {

        panel.classList.add(
            'active'
        );

        panel.hidden =
            false;

    }


    const select =
        $('#socio-tab-select');


    if (select) {
        select.value =
            tabName;
    }


    /*
     * A administração só é carregada
     * quando o administrador abre a aba.
     */
    if (
        tabName ===
            'administracao' &&
        state.admin
    ) {

        void loadIntegratedAdmin();

    }

}


function setupTabs() {

    $$('.socio-tab')
        .forEach(
            button => {

                if (
                    button.dataset.bound
                ) {
                    return;
                }


                button.dataset.bound =
                    '1';


                button.addEventListener(
                    'click',
                    () =>
                        activateSocioTab(
                            button.dataset.tab
                        )
                );

            }
        );


    $('#socio-tab-select')
        ?.addEventListener(
            'change',
            event =>
                activateSocioTab(
                    event.target.value
                )
        );


    syncMobileTabSelector();


    const tabs =
        $('.socio-tabs');


    if (
        tabs &&
        !tabs.dataset.mobileObserver
    ) {

        const observer =
            new MutationObserver(
                () => {

                    syncMobileTabSelector();


                    $$('.socio-tab')
                        .forEach(
                            button => {

                                if (
                                    button.dataset.bound
                                ) {
                                    return;
                                }


                                button.dataset.bound =
                                    '1';


                                button.addEventListener(
                                    'click',
                                    () =>
                                        activateSocioTab(
                                            button.dataset.tab
                                        )
                                );

                            }
                        );

                }
            );


        observer.observe(
            tabs,
            {
                childList: true
            }
        );


        tabs.dataset.mobileObserver =
            '1';

    }

}


/* =========================================================
   CARREGAMENTO DOS SCRIPTS ADMINISTRATIVOS
========================================================= */

function loadScriptOnce(
    src
) {

    return new Promise(
        (
            resolve,
            reject
        ) => {

            const existing =
                document.querySelector(
                    `script[data-naf-script="${src}"]`
                );


            if (existing) {

                if (
                    existing.dataset.loaded ===
                    '1'
                ) {

                    resolve();

                    return;

                }


                existing.addEventListener(
                    'load',
                    () => resolve(),
                    {
                        once: true
                    }
                );


                existing.addEventListener(
                    'error',
                    () =>
                        reject(
                            new Error(
                                `Não foi possível carregar ${src}.`
                            )
                        ),
                    {
                        once: true
                    }
                );


                return;

            }


            const script =
                document.createElement(
                    'script'
                );


            script.src =
                src;


            script.dataset.nafScript =
                src;


            script.onload =
                () => {

                    script.dataset.loaded =
                        '1';

                    resolve();

                };


            script.onerror =
                () => {

                    reject(
                        new Error(
                            `Não foi possível carregar ${src}.`
                        )
                    );

                };


            document.head.appendChild(
                script
            );

        }
    );

}


/* =========================================================
   CSS ADMINISTRATIVO
========================================================= */

function loadAdminStyle(
    href
) {

    if (
        document.querySelector(
            `link[data-naf-admin-style="${href}"]`
        )
    ) {
        return;
    }


    const link =
        document.createElement(
            'link'
        );


    link.rel =
        'stylesheet';


    link.href =
        href;


    link.dataset.nafAdminStyle =
        href;


    document.head.appendChild(
        link
    );

}


/* =========================================================
   REORGANIZAÇÃO DO ADMIN
========================================================= */

function reorganizeIntegratedAdmin(
    app
) {

    if (!app) {
        return;
    }


    /*
     * O admin.html continua a ser a origem
     * das funções existentes.
     *
     * Aqui apenas reorganizamos os painéis.
     */


    const tabs =
        app.querySelector(
            '.admin-tabs'
        );


    const sociosPanel =
        app.querySelector(
            '#panel-socios'
        );


    if (!tabs || !sociosPanel) {
        return;
    }


    /*
     * Mantemos apenas:
     *
     * Sócios
     * Fun&Learn
     * Drº Árbitro
     */
    tabs.querySelectorAll(
        '.admin-tab'
    ).forEach(
        button => {

            const panel =
                button.dataset.panel;


            if (
                ![
                    'socios',
                    'funlearn',
                    'dr-arbitro'
                ].includes(
                    panel
                )
            ) {

                button.remove();

            }

        }
    );


    /*
     * Alguns projetos usam IDs diferentes.
     * Tentamos encontrar todos os painéis
     * administrativos antigos.
     */

    const quotaPanel =
        app.querySelector(
            '#panel-quotas'
        );


    const emailPanel =
        app.querySelector(
            '#panel-email'
        );


    const adminsPanel =
        app.querySelector(
            '#panel-admins'
        );


    /*
     * Quotas passa para Sócios.
     */
    if (
        quotaPanel &&
        quotaPanel.parentNode !== sociosPanel
    ) {

        quotaPanel.hidden =
            false;


        const wrapper =
            document.createElement(
                'div'
            );


        wrapper.className =
            'admin-merged-section';


        wrapper.innerHTML =
            '<div class="admin-merged-section-title"><h3>Quotas</h3></div>';


        wrapper.appendChild(
            quotaPanel
        );


        sociosPanel.appendChild(
            wrapper
        );

    }


    /*
     * Email geral passa para Sócios.
     */
    if (
        emailPanel &&
        emailPanel.parentNode !== sociosPanel
    ) {

        emailPanel.hidden =
            false;


        const wrapper =
            document.createElement(
                'div'
            );


        wrapper.className =
            'admin-merged-section';


        wrapper.innerHTML =
            '<div class="admin-merged-section-title"><h3>Email geral</h3></div>';


        wrapper.appendChild(
            emailPanel
        );


        sociosPanel.appendChild(
            wrapper
        );

    }


    /*
     * O painel separado de administradores
     * deixa de ser uma sub-aba.
     *
     * A gestão Dar/Retirar Admin já pertence
     * às linhas dos sócios no admin.js.
     */
    if (adminsPanel) {

        const adminControls =
            adminsPanel.querySelector(
                '#admin-socios-lista'
            );


        if (
            adminControls &&
            !sociosPanel.querySelector(
                '#admin-socios-lista'
            )
        ) {

            const wrapper =
                document.createElement(
                    'div'
                );


            wrapper.className =
                'admin-merged-section';


            wrapper.innerHTML =
                '<div class="admin-merged-section-title"><h3>Permissões de administrador</h3></div>';


            wrapper.appendChild(
                adminControls.parentElement ||
                adminControls
            );


            sociosPanel.appendChild(
                wrapper
            );

        }


        adminsPanel.remove();

    }


    /*
     * Remove qualquer botão separado
     * correspondente aos painéis eliminados.
     */
    tabs.querySelectorAll(
        '.admin-tab'
    ).forEach(
        button => {

            if (
                ![
                    'socios',
                    'funlearn',
                    'dr-arbitro'
                ].includes(
                    button.dataset.panel
                )
            ) {
                button.remove();
            }

        }
    );

}


/* =========================================================
   ADMINISTRAÇÃO INTEGRADA
========================================================= */

async function loadIntegratedAdmin() {

    if (!state.admin) {
        return;
    }


    if (
        state.adminLoaded
    ) {
        return;
    }


    if (
        state.adminLoading
    ) {
        return;
    }


    const target =
        $('#integrated-admin-content');


    const loading =
        $('#integrated-admin-loading');


    const errorBox =
        $('#integrated-admin-error');


    if (!target) {
        return;
    }


    state.adminLoading =
        true;


    try {

        if (loading) {
            loading.hidden =
                false;
        }


        if (errorBox) {
            errorBox.hidden =
                true;
        }


        /*
         * Carregamos os estilos existentes.
         */
        loadAdminStyle(
            'css/admin.css?v=20260820'
        );

        loadAdminStyle(
            'css/admin-criar-socio.css?v=20260820'
        );

        loadAdminStyle(
            'css/admin-funlearn.css?v=20260820'
        );

        loadAdminStyle(
            'css/admin-quotas-manual.css?v=20260820'
        );


        /*
         * O HTML administrativo já existe.
         * Não o recriamos.
         */
        const response =
            await fetch(
                `admin.html?embedded=1&_=${Date.now()}`,
                {
                    cache:
                        'no-store'
                }
            );


        if (!response.ok) {

            throw new Error(
                'Não foi possível carregar a área administrativa.'
            );

        }


        const html =
            await response.text();


        const parser =
            new DOMParser();


        const documentAdmin =
            parser.parseFromString(
                html,
                'text/html'
            );


        const source =
            documentAdmin.querySelector(
                '#admin-app'
            );


        if (!source) {

            throw new Error(
                'O admin.html não contém o painel administrativo esperado.'
            );

        }


        /*
         * Copiar o HTML para a página atual.
         *
         * Isto NÃO cria um iframe.
         */
        const clone =
            source.cloneNode(
                true
            );


        clone.hidden =
            false;


        target.replaceChildren(
            clone
        );


        /*
         * Reorganizar a interface.
         */
        reorganizeIntegratedAdmin(
            clone
        );


        /*
         * Configuração administrativa existente.
         *
         * Não recriamos nenhuma RPC.
         */
        await loadScriptOnce(
            'js/admin-config.js?v=20260820'
        );


        /*
         * Módulos já existentes.
         */
        await loadScriptOnce(
            'js/admin.js?v=20260820'
        );


        await loadScriptOnce(
            'js/admin-criar-socio.js?v=20260820'
        );


        await loadScriptOnce(
            'js/admin-quotas-manual.js?v=20260820'
        );


        await loadScriptOnce(
            'js/admin-excel.js?v=20260820'
        );


        /*
         * O Drº Árbitro já existe.
         */
        await loadScriptOnce(
            'js/dr-arbitro.js?v=20260820'
        );


        /*
         * Alguns scripts administrativos
         * inicializam através de eventos.
         *
         * Damos oportunidade para eles
         * encontrarem o HTML já inserido.
         */
        document.dispatchEvent(
            new Event(
                'naf:admin-ready'
            )
        );


        /*
         * Se o admin.js expuser uma função
         * de carregamento, utilizamo-la.
         */
        if (
            typeof window.loadMembers ===
            'function'
        ) {

            try {
                await window.loadMembers();
            } catch (error) {
                console.warn(
                    'loadMembers:',
                    error
                );
            }

        }


        /*
         * Alguns módulos usam initAdmin().
         */
        if (
            typeof window.initAdmin ===
            'function'
        ) {

            try {
                await window.initAdmin();
            } catch (error) {
                console.warn(
                    'initAdmin:',
                    error
                );
            }

        }


        target.hidden =
            false;


        if (loading) {
            loading.hidden =
                true;
        }


        state.adminLoaded =
            true;


        /*
         * O administrador começa na sub-aba
         * Sócios.
         */
        const adminFirstTab =
            clone.querySelector(
                '.admin-tab[data-panel="socios"]'
            );


        adminFirstTab?.click();


    } catch (error) {

        console.error(
            'Administração integrada:',
            error
        );


        if (loading) {
            loading.hidden =
                true;
        }


        if (errorBox) {

            errorBox.textContent =
                error.message ||
                'Não foi possível carregar a administração.';

            errorBox.hidden =
                false;

        }


        showMessage(
            error.message ||
            'Não foi possível carregar a administração.',
            'erro'
        );

    } finally {

        state.adminLoading =
            false;

    }

}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

function setupDocumentUpload() {

    $('#doc-input')
        ?.addEventListener(
            'change',
            async event => {

                const file =
                    event.target.files?.[0];


                if (!file) {
                    return;
                }


                try {

                    await uploadSocioPdf(
                        file
                    );


                    await loadDocuments();


                    showMessage(
                        'Documento carregado.',
                        'sucesso'
                    );

                } catch (error) {

                    console.error(
                        error
                    );


                    showMessage(
                        error.message ||
                        'Não foi possível carregar o documento.',
                        'erro'
                    );

                } finally {

                    event.target.value =
                        '';

                }

            }
        );

}


async function init() {

    /*
     * A lista pública continua disponível
     * mesmo sem login.
     */
    await loadPublicMembers();


    /*
     * Segurança:
     * limpar tudo antes de verificar sessão.
     */
    clearPrivateUI();


    setupTabs();

    setupProfileForm();

    setupPhotoUpload();

    setupDocumentUpload();


    /*
     * Login.
     */
    $('#login-form')
        ?.addEventListener(
            'submit',
            async event => {

                event.preventDefault();

                hideMessage();


                try {

                    await login(
                        $('#login-email')
                            .value
                            .trim(),

                        $('#login-password')
                            .value
                    );


                    const session =
                        await getSession();


                    if (!session) {

                        throw new Error(
                            'O login não criou uma sessão.'
                        );

                    }


                    await loadProfile(
                        session.user
                    );


                    renderProfile();


                    /*
                     * Se for admin, NÃO redirecionamos.
                     *
                     * A aba Administração fica
                     * disponível dentro desta página.
                     */
                    if (
                        state.admin
                    ) {

                        activateSocioTab(
                            'administracao'
                        );

                    }

                } catch (error) {

                    console.error(
                        'Erro no login:',
                        error
                    );


                    clearPrivateUI();


                    showMessage(
                        error.message ||
                        'Não foi possível iniciar sessão.',
                        'erro'
                    );

                }

            }
        );


    /*
     * Recuperação da palavra-passe.
     */
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
                        error.message ||
                        'Não foi possível enviar o email.',
                        'erro'
                    );

                }

            }
        );


    /*
     * Logout.
     */
    $('#logout-btn')
        ?.addEventListener(
            'click',
            logout
        );


    /*
     * Sessão existente.
     */
    const session =
        await getSession();


    if (!session) {
        return;
    }


    try {

        await loadProfile(
            session.user
        );


        renderProfile();


        /*
         * Se já existe sessão administrativa,
         * não fazemos redirect.
         */
        if (
            state.admin
        ) {

            /*
             * Mantemos a aba normal por defeito.
             * O administrador pode entrar em
             * Administração quando quiser.
             */
            activateSocioTab(
                'dados'
            );

        }

    } catch (error) {

        console.error(
            'Erro ao carregar perfil:',
            error
        );


        clearPrivateUI();


        showMessage(
            'A conta autenticada ainda não está associada a um registo de sócio ativo.',
            'erro'
        );

    }

}


/* =========================================================
   ALTERAÇÕES DE SESSÃO
========================================================= */

supabase.auth.onAuthStateChange(
    (
        _event,
        session
    ) => {

        if (!session) {

            clearPrivateUI();

            return;

        }

    }
);


/* =========================================================
   ARRANQUE
========================================================= */

init()
    .catch(
        error => {

            console.error(
                'Erro de inicialização:',
                error
            );


            clearPrivateUI();


            showMessage(
                'Não foi possível inicializar a área de sócios.',
                'erro'
            );

        }
    );
