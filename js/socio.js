```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
    SUPABASE_URL,
    SUPABASE_ANON_KEY
} from './supabase-config.js';

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);

const ADMIN_NUMERO = 9999;
const MAX_DOCUMENTOS = 12;

const state = {
    user: null,
    socio: null,
    admin: false
};

const $ = (selector) => document.querySelector(selector);

function esc(value = '') {
    return String(value ?? '').replace(/[&<>'"]/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[c]));
}

function msg(text, type = 'info') {

    const element = $('#socio-message');

    if (!element) return;

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


/* =========================================================
   LOGIN
   ========================================================= */

async function login(email, password) {

    const { data, error } =
        await supabase.auth.signInWithPassword({
            email,
            password
        });

    if (error) {
        throw error;
    }

    if (!data.user) {
        throw new Error('Não foi possível iniciar sessão.');
    }

    await loadProfile(data.user);
}


async function logout() {

    await supabase.auth.signOut();

    state.user = null;
    state.socio = null;
    state.admin = false;

    $('#dashboard').hidden = true;
    $('#login-panel').hidden = false;

    hideMessage();
}


/* =========================================================
   PERFIL
   ========================================================= */

async function loadProfile(user) {

    const { data, error } = await supabase
        .from('socios')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error) {
        throw error;
    }

    state.user = user;
    state.socio = data;

    state.admin =
        Number(data.numero_socio) === ADMIN_NUMERO &&
        data.is_admin === true &&
        data.ativo === true;

    renderProfile();

    if (state.admin) {

        $('#admin-panel').hidden = false;

        import('./admin-funcionalidades.js?v=20260809-1')
            .catch((error) => {
                console.error(
                    'Erro ao carregar área administrativa:',
                    error
                );
            });

    } else {

        $('#admin-panel').hidden = true;
    }
}


function renderProfile() {

    const s = state.socio;

    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;

    $('#socio-name').textContent =
        s.nome || 'Sócio';

    $('#socio-number').textContent =
        s.numero_socio ?? '—';


    /* Dados pessoais */

    $('#dados-nome').textContent =
        s.nome || '—';

    $('#dados-numero').textContent =
        s.numero_socio ?? '—';

    $('#dados-nascimento').textContent =
        formatDate(s.data_nascimento);

    $('#dados-email').textContent =
        s.email || state.user?.email || '—';

    $('#dados-morada').textContent =
        s.morada || '—';

    $('#dados-telemovel').textContent =
        s.telemovel || '—';


    /* Formulário */

    $('#edit-nome').value =
        s.nome || '';

    $('#edit-numero').value =
        s.numero_socio ?? '';

    $('#edit-nascimento').value =
        s.data_nascimento || '';

    $('#edit-email').value =
        s.email || state.user?.email || '';

    $('#edit-morada').value =
        s.morada || '';

    $('#edit-telemovel').value =
        s.telemovel || '';


    /* Arbitragem */

    $('#dados-arbitro').textContent =
        s.numero_arbitro || '—';

    $('#dados-af').textContent =
        s.associacao_futebol || '—';

    $('#dados-modalidade').textContent =
        s.modalidade || '—';


    $('#edit-arbitro').value =
        s.numero_arbitro || '';

    $('#edit-af').value =
        s.associacao_futebol || '';

    $('#edit-modalidade').value =
        s.modalidade || '';


    loadPhoto();
    loadQuotas();
    loadDocuments();
    loadFunlearn();
}


/* =========================================================
   FOTOGRAFIA
   ========================================================= */

async function loadPhoto() {

    const path =
        state.socio?.fotografia_path || null;

    const photo =
        $('#socio-photo');

    const avatar =
        $('#socio-photo-placeholder');

    if (!photo || !avatar) {
        return;
    }


    /* Sem fotografia = avatar */

    if (!path) {

        photo.removeAttribute('src');

        photo.hidden = true;
        avatar.hidden = false;

        return;
    }


    try {

        const { data, error } =
            await supabase.storage
                .from('fotografias-socios')
                .createSignedUrl(
                    path,
                    3600
                );

        if (error) {
            throw error;
        }

        if (data?.signedUrl) {

            photo.src =
                `${data.signedUrl}${
                    data.signedUrl.includes('?')
                        ? '&'
                        : '?'
                }v=${encodeURIComponent(path)}`;

            photo.hidden = false;
            avatar.hidden = true;
        }

    } catch (error) {

        console.error(
            'Erro ao carregar fotografia:',
            error
        );

        photo.hidden = true;
        avatar.hidden = false;
    }
}


async function uploadPhoto(file) {

    if (!file) return;


    const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (!allowed.includes(file.type)) {

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
        state.socio.fotografia_path || null;


    const path =
        `${state.socio.id}/fotografia-${crypto.randomUUID()}.${extension}`;


    const upload =
        await supabase.storage
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


    if (upload.error) {
        throw upload.error;
    }


    const update =
        await supabase
            .from('socios')
            .update({
                fotografia_path: path
            })
            .eq('id', state.socio.id)
            .eq('user_id', state.user.id);


    if (update.error) {

        await supabase.storage
            .from('fotografias-socios')
            .remove([path]);

        throw update.error;
    }


    state.socio.fotografia_path = path;


    /* Apaga fotografia anterior */

    if (oldPath) {

        await supabase.storage
            .from('fotografias-socios')
            .remove([oldPath]);
    }


    await loadPhoto();

    msg(
        'Fotografia atualizada com sucesso.',
        'sucesso'
    );
}


/* =========================================================
   QUOTAS
   ========================================================= */

async function loadQuotas() {

    const element = $('#quotas-list');

    if (!element) return;

    const value =
        state.socio?.quotas || '';

    if (!value) {

        element.innerHTML =
            '<div class="vazio">Sem informação de quotas.</div>';

        return;
    }


    element.innerHTML = `
        <div class="quota-item">
            <strong>Estado das quotas</strong>
            <span>${esc(value)}</span>
        </div>
    `;
}


/* =========================================================
   DOCUMENTOS
   ========================================================= */

async function loadDocuments() {

    const list =
        $('#docs-list');

    const count =
        $('#docs-count');

    if (!list) return;


    const { data, error } =
        await supabase
            .from('documentos_socios')
            .select('*')
            .eq('socio_id', state.socio.id)
            .order(
                'created_at',
                { ascending: false }
            );


    if (error) {

        console.error(
            'Erro ao carregar documentos:',
            error
        );

        list.innerHTML =
            '<div class="vazio">Não foi possível carregar os documentos.</div>';

        return;
    }


    const documents = data || [];


    if (count) {

        count.textContent =
            `${documents.length} / ${MAX_DOCUMENTOS}`;
    }


    if (!documents.length) {

        list.innerHTML =
            '<div class="vazio">Ainda não existem documentos.</div>';

        return;
    }


    list.innerHTML =
        documents.map((document) => `
            <div class="documento-socio-item">

                <div>
                    📄

                    <strong>
                        ${esc(document.nome_ficheiro)}
                    </strong>

                    <small>
                        ${formatDateTime(document.created_at)}
                    </small>
                </div>

            </div>
        `).join('');
}


/* =========================================================
   FUN & LEARN
   ========================================================= */

async function loadFunlearn() {

    const history =
        $('#funlearn-history');

    const totalElement =
        $('#funlearn-total');

    const topElement =
        $('#funlearn-total-top');


    const { data, error } =
        await supabase
            .from('funlearn_pontos')
            .select('*')
            .eq('socio_id', state.socio.id)
            .order(
                'created_at',
                { ascending: false }
            );


    if (error) {

        console.error(
            'Erro ao carregar Fun&Learn:',
            error
        );

        return;
    }


    const rows = data || [];


    const total =
        rows.reduce(
            (sum, row) =>
                sum + Number(row.pontos || 0),
            0
        );


    if (totalElement) {
        totalElement.textContent = total;
    }

    if (topElement) {
        topElement.textContent = total;
    }


    if (!history) return;


    if (!rows.length) {

        history.innerHTML =
            '<div class="vazio">Ainda não existem movimentos de pontos.</div>';

        return;
    }


    history.innerHTML =
        rows.map((row) => {

            const points =
                Number(row.pontos || 0);

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
                                row.descricao || ''
                            )}
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


/* =========================================================
   DADOS PESSOAIS
   ========================================================= */

async function savePersonalData(event) {

    event.preventDefault();

    try {

        const payload = {

            email:
                $('#edit-email').value.trim(),

            telemovel:
                $('#edit-telemovel').value.trim(),

            data_nascimento:
                $('#edit-nascimento').value || null,

            morada:
                $('#edit-morada').value.trim()
        };


        const { data, error } =
            await supabase
                .from('socios')
                .update(payload)
                .eq('id', state.socio.id)
                .eq('user_id', state.user.id)
                .select()
                .single();


        if (error) {
            throw error;
        }


        state.socio = data;

        renderProfile();

        $('#dados-edit-form').hidden = true;
        $('#dados-view').hidden = false;


        msg(
            'Os seus dados foram atualizados.',
            'sucesso'
        );

    } catch (error) {

        msg(
            error.message ||
            'Não foi possível guardar os dados.',
            'erro'
        );
    }
}


/* =========================================================
   ARBITRAGEM
   ========================================================= */

async function saveArbitragem(event) {

    event.preventDefault();

    try {

        const payload = {

            numero_arbitro:
                $('#edit-arbitro').value.trim(),

            associacao_futebol:
                $('#edit-af').value.trim(),

            modalidade:
                $('#edit-modalidade').value.trim()
        };


        const { data, error } =
            await supabase
                .from('socios')
                .update(payload)
                .eq('id', state.socio.id)
                .eq('user_id', state.user.id)
                .select()
                .single();


        if (error) {
            throw error;
        }


        state.socio = data;

        renderProfile();

        $('#arbitragem-edit-form').hidden = true;
        $('#arbitragem-view').hidden = false;


        msg(
            'Dados de arbitragem atualizados.',
            'sucesso'
        );

    } catch (error) {

        msg(
            error.message ||
            'Não foi possível guardar os dados.',
            'erro'
        );
    }
}


/* =========================================================
   PASSWORD RESET
   ========================================================= */

async function resetPassword() {

    const email =
        $('#login-email').value.trim();


    if (!email) {

        msg(
            'Indique primeiro o seu email.',
            'erro'
        );

        return;
    }


    const { error } =
        await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo:
                    `${window.location.origin}/socio.html`
            }
        );


    if (error) {
        throw error;
    }


    msg(
        'Foi enviado um email para redefinir a palavra-passe.',
        'sucesso'
    );
}


/* =========================================================
   TABS
   ========================================================= */

function setupTabs() {

    document
        .querySelectorAll('.socio-tab')
        .forEach((button) => {

            button.addEventListener(
                'click',
                () => {

                    const tab =
                        button.dataset.tab;


                    document
                        .querySelectorAll('.socio-tab')
                        .forEach((item) => {
                            item.classList.toggle(
                                'active',
                                item === button
                            );
                        });


                    document
                        .querySelectorAll('.socio-tab-content')
                        .forEach((section) => {

                            section.classList.toggle(
                                'active',
                                section.id === tab
                            );

                        });
                }
            );
        });
}


/* =========================================================
   EVENTOS
   ========================================================= */

function setupEvents() {


    $('#login-form')?.addEventListener(
        'submit',
        async (event) => {

            event.preventDefault();

            hideMessage();

            try {

                await login(
                    $('#login-email').value.trim(),
                    $('#login-password').value
                );

            } catch (error) {

                msg(
                    error.message ||
                    'Não foi possível iniciar sessão.',
                    'erro'
                );
            }
        }
    );


    $('#reset-password')?.addEventListener(
        'click',
        async () => {

            try {

                await resetPassword();

            } catch (error) {

                msg(
                    error.message ||
                    'Não foi possível enviar o email.',
                    'erro'
                );
            }
        }
    );


    $('#logout-btn')?.addEventListener(
        'click',
        logout
    );


    $('#photo-trigger')?.addEventListener(
        'click',
        () => {
            $('#photo-input')?.click();
        }
    );


    $('#photo-input')?.addEventListener(
        'change',
        async () => {

            const file =
                $('#photo-input')?.files?.[0];

            if (!file) return;

            try {

                await uploadPhoto(file);

            } catch (error) {

                msg(
                    error.message ||
                    'Não foi possível alterar a fotografia.',
                    'erro'
                );

            } finally {

                $('#photo-input').value = '';
            }
        }
    );


    $('#editar-dados-btn')?.addEventListener(
        'click',
        () => {

            $('#dados-view').hidden = true;
            $('#dados-edit-form').hidden = false;
        }
    );


    $('#cancelar-dados-btn')?.addEventListener(
        'click',
        () => {

            $('#dados-edit-form').hidden = true;
            $('#dados-view').hidden = false;
        }
    );


    $('#dados-edit-form')?.addEventListener(
        'submit',
        savePersonalData
    );


    $('#editar-arbitragem-btn')?.addEventListener(
        'click',
        () => {

            $('#arbitragem-view').hidden = true;
            $('#arbitragem-edit-form').hidden = false;
        }
    );


    $('#cancelar-arbitragem-btn')?.addEventListener(
        'click',
        () => {

            $('#arbitragem-edit-form').hidden = true;
            $('#arbitragem-view').hidden = false;
        }
    );


    $('#arbitragem-edit-form')?.addEventListener(
        'submit',
        saveArbitragem
    );


    $('#doc-input')?.addEventListener(
        'change',
        async () => {

            const file =
                $('#doc-input')?.files?.[0];

            if (!file) return;

            try {

                if (file.type !== 'application/pdf') {
                    throw new Error(
                        'O documento deve ser PDF.'
                    );
                }

                const { data: documents } =
                    await supabase
                        .from('documentos_socios')
                        .select('id')
                        .eq(
                            'socio_id',
                            state.socio.id
                        );

                if (
                    (documents || []).length >=
                    MAX_DOCUMENTOS
                ) {
                    throw new Error(
                        'Já atingiu o limite de 12 documentos.'
                    );
                }

                msg(
                    'O carregamento de documentos precisa de estar ligado à política de Storage do projeto.',
                    'info'
                );

            } catch (error) {

                msg(
                    error.message,
                    'erro'
                );

            } finally {

                $('#doc-input').value = '';
            }
        }
    );
}


/* =========================================================
   DATA
   ========================================================= */

function formatDate(value) {

    if (!value) return '—';

    const date =
        new Date(`${value}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString(
        'pt-PT'
    );
}


function formatDateTime(value) {

    if (!value) return '';

    const date =
        new Date(value);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString(
        'pt-PT'
    );
}


/* =========================================================
   ARRANQUE
   ========================================================= */

async function init() {

    setupTabs();
    setupEvents();


    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();


    if (session?.user) {

        try {

            await loadProfile(
                session.user
            );

        } catch (error) {

            console.error(error);

            await supabase.auth.signOut();

            msg(
                'Não foi possível carregar o perfil do sócio.',
                'erro'
            );
        }
    }


    supabase.auth.onAuthStateChange(
        async (event, sessionData) => {

            if (
                event === 'SIGNED_IN' &&
                sessionData?.user
            ) {

                try {

                    await loadProfile(
                        sessionData.user
                    );

                } catch (error) {

                    console.error(error);

                    msg(
                        error.message ||
                        'Erro ao carregar o perfil.',
                        'erro'
                    );
                }
            }


            if (event === 'SIGNED_OUT') {

                $('#dashboard').hidden = true;
                $('#login-panel').hidden = false;
            }
        }
    );
}


init();
```
