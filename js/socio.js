import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
user: null,
socio: null,
admin: false
};

/* ============================================================
UTILITÁRIOS
============================================================ */

function escapeHtml(value = '') {
return String(value).replace(/[&<>'"]/g, (character) => ({
'&': '&',
'<': '<',
'>': '>',
"'": ''',
'"': '"'
}[character]));
}

function showMessage(text, type = 'info') {
const element = $('#socio-message');

```
if (!element) {
    console.log(text);
    return;
}

element.textContent = text;
element.className = `socio-message ${type}`;
element.hidden = false;
```

}

function hideMessage() {
const element = $('#socio-message');

```
if (element) {
    element.hidden = true;
}
```

}

/* ============================================================
AUTENTICAÇÃO
============================================================ */

async function login(email, password) {
const { error } = await supabase.auth.signInWithPassword({
email,
password
});

```
if (error) {
    throw error;
}
```

}

async function resetPassword(email) {
const { error } = await supabase.auth.resetPasswordForEmail(email, {
redirectTo: `${window.location.origin}${window.location.pathname}`
});

```
if (error) {
    throw error;
}
```

}

async function logout() {
await supabase.auth.signOut();
window.location.reload();
}

/* ============================================================
PERFIL DO SÓCIO
============================================================ */

async function loadProfile(user) {
const { data, error } = await supabase
.from('socios')
.select('*')
.eq('user_id', user.id)
.single();

```
if (error) {
    throw error;
}

state.user = user;
state.socio = data;

state.admin =
    Number(data.numero_socio) === 9999 &&
    data.is_admin === true &&
    data.ativo === true;
```

}

function renderProfile() {
const socio = state.socio;

```
if (!socio) {
    return;
}

if ($('#login-panel')) {
    $('#login-panel').hidden = true;
}

if ($('#dashboard')) {
    $('#dashboard').hidden = false;
}

if ($('#socio-name')) {
    $('#socio-name').textContent = socio.nome || 'Sócio';
}

if ($('#socio-number')) {
    $('#socio-number').textContent = socio.numero_socio ?? '—';
}

if ($('#dados-nome')) {
    $('#dados-nome').textContent = socio.nome || '—';
}

if ($('#dados-numero')) {
    $('#dados-numero').textContent = socio.numero_socio ?? '—';
}

if ($('#dados-nascimento')) {
    $('#dados-nascimento').textContent = socio.data_nascimento
        ? new Date(`${socio.data_nascimento}T00:00:00`).toLocaleDateString('pt-PT')
        : '—';
}

if ($('#dados-morada')) {
    $('#dados-morada').textContent = socio.morada || '—';
}

if ($('#dados-email')) {
    $('#dados-email').textContent =
        socio.email || state.user?.email || '—';
}

if ($('#dados-telemovel')) {
    $('#dados-telemovel').textContent = socio.telemovel || '—';
}

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

if ($('#admin-panel')) {
    $('#admin-panel').hidden = !state.admin;
}

fillEditForms();

loadPhoto();
loadQuotas();
loadDocuments();
loadFunlearn();

if (state.admin) {
    loadAdminSocios();
}
```

}

/* ============================================================
FOTOGRAFIA
============================================================ */

async function loadPhoto() {
const image = $('#socio-photo');
const placeholder = $('#socio-photo-placeholder');

```
if (!image || !placeholder) {
    return;
}

/*
 * O SQL principal usa fotografia_url.
 * Se não houver fotografia, mostramos o placeholder.
 */

const path = state.socio?.fotografia_url;

if (!path) {
    image.hidden = true;
    placeholder.hidden = false;
    return;
}

/*
 * Aceitamos tanto um URL completo como um caminho
 * dentro do Storage.
 */

if (path.startsWith('http://') || path.startsWith('https://')) {
    image.src = path;
    image.hidden = false;
    placeholder.hidden = true;
    return;
}

const { data, error } = await supabase.storage
    .from('fotografias-socios')
    .createSignedUrl(path, 3600);

if (!error && data?.signedUrl) {
    image.src = data.signedUrl;
    image.hidden = false;
    placeholder.hidden = true;
}
```

}

/* ============================================================
QUOTAS
============================================================ */

async function loadQuotas() {
const element = $('#quotas-list');

```
if (!element) {
    return;
}

element.innerHTML = `
    <div class="vazio">
        ${escapeHtml(
            state.socio?.quotas ||
            'Estado de quotas não definido.'
        )}
    </div>
`;
```

}

/* ============================================================
DOCUMENTOS
============================================================ */

async function loadDocuments() {
const list = $('#docs-list');

```
if (!list) {
    return;
}

const { data, error } = await supabase
    .from('documentos_socios')
    .select('*')
    .eq('socio_id', state.socio.id)
    .order('created_at', {
        ascending: false
    });

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

list.innerHTML = '';

if (!documents.length) {
    list.innerHTML = `
        <div class="vazio">
            Ainda não existem documentos.
        </div>
    `;
    return;
}

for (const documentRecord of documents) {
    let signedUrl = null;

    /*
     * O SQL principal usa storage_path.
     */

    if (documentRecord.storage_path) {
        const result = await supabase.storage
            .from('documentos-socios')
            .createSignedUrl(
                documentRecord.storage_path,
                3600
            );

        if (!result.error) {
            signedUrl = result.data?.signedUrl || null;
        }
    }

    const item = document.createElement('div');

    item.className = 'documento-socio-item';

    item.innerHTML = `
        <span>📄</span>

        <div>
            <strong>
                ${escapeHtml(
                    documentRecord.nome_ficheiro || 'Documento PDF'
                )}
            </strong>

            <small>
                ${documentRecord.created_at
                    ? new Date(
                        documentRecord.created_at
                      ).toLocaleDateString('pt-PT')
                    : ''}
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
```

}

/* ============================================================
UPLOAD DE PDF DO SÓCIO
============================================================ */

async function uploadSocioPdf(file) {
if (!file || file.type !== 'application/pdf') {
throw new Error(
'Só são permitidos ficheiros PDF.'
);
}

```
const { count, error: countError } = await supabase
    .from('documentos_socios')
    .select('id', {
        count: 'exact',
        head: true
    })
    .eq('socio_id', state.socio.id);

if (countError) {
    throw countError;
}

if ((count || 0) >= 12) {
    throw new Error(
        'Já atingiu o limite máximo de 12 documentos.'
    );
}

const safeName = file.name.replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
);

const path =
    `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;

const { error: uploadError } = await supabase.storage
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
    await supabase.storage
        .from('documentos-socios')
        .remove([path]);

    throw dbError;
}
```

}

/* ============================================================
FUN&LEARN
============================================================ */

async function loadFunlearn() {
const history = $('#funlearn-history');

```
if (!history) {
    return;
}

const { data, error } = await supabase
    .from('funlearn_pontos')
    .select(
        'id,pontos,descricao,created_at'
    )
    .eq('socio_id', state.socio.id)
    .order('created_at', {
        ascending: false
    });

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

const total = rows.reduce(
    (sum, row) =>
        sum + Number(row.pontos || 0),
    0
);

if ($('#funlearn-total')) {
    $('#funlearn-total').textContent = total;
}

if ($('#funlearn-total-top')) {
    $('#funlearn-total-top').textContent = total;
}

if (!rows.length) {
    history.innerHTML = `
        <div class="vazio">
            Ainda não existem movimentos de pontos.
        </div>
    `;

    return;
}

history.innerHTML = rows.map((row) => `
    <div class="fun-row">
        <div>
            <strong>
                Fun&Learn
            </strong>

            <small>
                ${escapeHtml(row.descricao || '')}
                ${
                    row.created_at
                        ? ` • ${new Date(
                            row.created_at
                          ).toLocaleDateString('pt-PT')}`
                        : ''
                }
            </small>
        </div>

        <b>
            +${Number(row.pontos || 0)}
        </b>
    </div>
`).join('');
```

}

/* ============================================================
FORMULÁRIOS
============================================================ */

function fillEditForms() {
const socio = state.socio;

```
if (!socio) {
    return;
}

if ($('#edit-nome')) {
    $('#edit-nome').value =
        socio.nome || '';
}

if ($('#edit-numero')) {
    $('#edit-numero').value =
        socio.numero_socio ?? '';
}

if ($('#edit-nascimento')) {
    $('#edit-nascimento').value =
        socio.data_nascimento || '';
}

if ($('#edit-email')) {
    $('#edit-email').value =
        socio.email ||
        state.user?.email ||
        '';
}

if ($('#edit-morada')) {
    $('#edit-morada').value =
        socio.morada || '';
}

if ($('#edit-telemovel')) {
    $('#edit-telemovel').value =
        socio.telemovel || '';
}

if ($('#edit-arbitro')) {
    $('#edit-arbitro').value =
        socio.numero_arbitro || '';
}

if ($('#edit-af')) {
    $('#edit-af').value =
        socio.associacao_futebol || '';
}

if ($('#edit-modalidade')) {
    $('#edit-modalidade').value =
        socio.modalidade || '';
}
```

}

function closeEditForms() {
if ($('#dados-edit-form')) {
$('#dados-edit-form').hidden = true;
}

```
if ($('#dados-view')) {
    $('#dados-view').hidden = false;
}

if ($('#editar-dados-btn')) {
    $('#editar-dados-btn').hidden = false;
}

if ($('#arbitragem-edit-form')) {
    $('#arbitragem-edit-form').hidden = true;
}

if ($('#arbitragem-view')) {
    $('#arbitragem-view').hidden = false;
}

if ($('#editar-arbitragem-btn')) {
    $('#editar-arbitragem-btn').hidden = false;
}
```

}

/* ============================================================
GUARDAR DADOS DO PERFIL
============================================================ */

async function saveProfileFields(fields) {
/*
* Atualizamos diretamente a tabela socios.
*
* Nome e numero_socio NÃO fazem parte de fields.
* Assim ficam sempre protegidos nesta área.
*/

```
const { data, error } = await supabase
    .from('socios')
    .update(fields)
    .eq('id', state.socio.id)
    .eq('user_id', state.user.id)
    .select('*')
    .single();

if (error) {
    throw error;
}

state.socio = data;

renderProfile();
closeEditForms();
```

}

async function savePersonalData() {
const email = $('#edit-email')
?.value
.trim();

```
if (!email || !email.includes('@')) {
    throw new Error(
        'Indica um email válido.'
    );
}

const oldEmail =
    (state.user?.email || '').toLowerCase();

/*
 * Se o email mudou, atualizamos também o Auth.
 */

if (email.toLowerCase() !== oldEmail) {
    const { error } =
        await supabase.auth.updateUser({
            email
        });

    if (error) {
        throw error;
    }
}

await saveProfileFields({
    data_nascimento:
        $('#edit-nascimento')?.value || null,

    morada:
        $('#edit-morada')?.value || null,

    email,

    telemovel:
        $('#edit-telemovel')?.value || null
});
```

}

async function saveArbitragemData() {
await saveProfileFields({
data_nascimento:
state.socio.data_nascimento,

```
    morada:
        state.socio.morada,

    email:
        state.socio.email ||
        state.user.email,

    telemovel:
        state.socio.telemovel,

    numero_arbitro:
        $('#edit-arbitro')?.value || null,

    associacao_futebol:
        $('#edit-af')?.value || null,

    modalidade:
        $('#edit-modalidade')?.value || null
});
```

}

/* ============================================================
ADMINISTRADOR — NOVO SÓCIO
============================================================ */

async function createSocioFromAdmin() {
const body = {
nome:
$('#novo-socio-nome')
?.value
.trim(),

```
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

const { data, error } =
    await supabase.functions.invoke(
        'criar-socio',
        { body }
    );

if (error) {
    let message =
        error.message ||
        'Não foi possível criar o sócio.';

    if (error.context) {
        try {
            const payload =
                await error.context.json();

            message =
                payload?.error ||
                message;
        } catch (_) {
            // Mantém a mensagem original.
        }
    }

    throw new Error(message);
}

if (data?.error) {
    throw new Error(data.error);
}

return data?.socio;
```

}

/* ============================================================
ADMINISTRADOR — LISTA DE SÓCIOS
============================================================ */

async function loadAdminSocios() {
if (
!state.admin ||
!$('#admin-socios-lista')
) {
return;
}

```
const { data, error } = await supabase
    .from('socios')
    .select(
        'numero_socio,nome,email,telemovel,ativo,user_id'
    )
    .order('numero_socio', {
        ascending: true
    });

if (error) {
    $('#admin-socios-lista').innerHTML = `
        <div class="vazio">
            ${escapeHtml(error.message)}
        </div>
    `;

    return;
}

const rows = data || [];

if (!rows.length) {
    $('#admin-socios-lista').innerHTML = `
        <div class="vazio">
            Ainda não existem sócios.
        </div>
    `;

    return;
}

$('#admin-socios-lista').innerHTML =
    rows.map((socio) => `
        <div class="admin-socio-row">

            <div class="admin-socio-numero">
                ${escapeHtml(socio.numero_socio)}
            </div>

            <div class="admin-socio-main">
                <strong>
                    ${escapeHtml(socio.nome)}
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

        </div>
    `).join('');
```

}

/* ============================================================
FUN&LEARN — ADMINISTRADOR
============================================================ */

function normalizeName(value = '') {
return String(value)
.normalize('NFD')
.replace(/[\u0300-\u036f]/g, '')
.toLowerCase()
.replace(/\s+/g, ' ')
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

```
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

if (!window.pdfjsLib) {
    throw new Error(
        'O leitor de PDF ainda não ficou disponível. Atualiza a página e tenta novamente.'
    );
}

const path =
    `admin/${crypto.randomUUID()}-${file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        '_'
    )}`;

const { error: uploadError } =
    await supabase.storage
        .from('funlearn')
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

const { data: importacao, error: importError } =
    await supabase
        .from('funlearn_importacoes')
        .insert({
            nome_ficheiro: file.name,
            storage_path: path,
            pontos,
            estado: 'processando',
            created_by: state.user.id
        })
        .select()
        .single();

if (importError) {
    throw importError;
}

try {
    const arrayBuffer =
        await file.arrayBuffer();

    const pdf =
        await window.pdfjsLib
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
                .map(item => item.str)
                .join(' ');
    }

    const normalizedText =
        normalizeName(text);

    const {
        data: socios,
        error: sociosError
    } = await supabase
        .from('socios')
        .select(
            'id,nome,numero_socio'
        )
        .eq('ativo', true);

    if (sociosError) {
        throw sociosError;
    }

    const encontrados =
        (socios || []).filter(
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

    if (encontrados.length) {
        const nomesRows =
            encontrados.map(socio => ({
                importacao_id:
                    importacao.id,

                nome_original:
                    socio.nome,

                nome_normalizado:
                    normalizeName(
                        socio.nome
                    ),

                numero_socio:
                    socio.numero_socio,

                socio_id:
                    socio.id,

                correspondencia_encontrada:
                    true,

                pontos_atribuidos:
                    false
            }));

        const {
            error: nomesError
        } = await supabase
            .from(
                'funlearn_import_nomes'
            )
            .insert(nomesRows);

        if (nomesError) {
            throw nomesError;
        }

        /*
         * O SQL principal tem:
         * pontos
         * descricao
         *
         * Não tem uma coluna "atividade".
         *
         * Por isso juntamos atividade + descrição
         * no campo descricao.
         */

        const descricaoFinal =
            atividade
                ? `${atividade}${
                    descricao
                        ? ` — ${descricao}`
                        : ''
                }`
                : (
                    descricao ||
                    'Pontuação atribuída automaticamente'
                );

        const pontosRows =
            encontrados.map(socio => ({
                socio_id:
                    socio.id,

                importacao_id:
                    importacao.id,

                pontos,

                descricao:
                    descricaoFinal
            }));

        const {
            error: pontosError
        } = await supabase
            .from('funlearn_pontos')
            .insert(pontosRows);

        if (pontosError) {
            throw pontosError;
        }

        await supabase
            .from(
                'funlearn_import_nomes'
            )
            .update({
                pontos_atribuidos: true
            })
            .eq(
                'importacao_id',
                importacao.id
            );
    }

    await supabase
        .from('funlearn_importacoes')
        .update({
            estado: 'processado',

            total_nomes:
                encontrados.length,

            total_socios_encontrados:
                encontrados.length,

            total_pontos_atribuidos:
                encontrados.length * pontos,

            processado_at:
                new Date().toISOString()
        })
        .eq(
            'id',
            importacao.id
        );

    return {
        count: encontrados.length,

        names:
            encontrados.map(
                socio =>
                    `${socio.numero_socio} — ${socio.nome}`
            )
    };

} catch (error) {
    await supabase
        .from('funlearn_importacoes')
        .update({
            estado: 'erro',
            erro:
                error.message ||
                String(error)
        })
        .eq(
            'id',
            importacao.id
        );

    throw error;
}
```

}

/* ============================================================
ABAS
============================================================ */

function setupTabs() {
$$('.socio-tab').forEach(button => {
button.addEventListener(
'click',
() => {
$$('.socio-tab')
.forEach(
item =>
item.classList
.remove('active')
);

```
            $$('.socio-tab-content')
                .forEach(
                    panel =>
                        panel.classList
                            .remove('active')
                );

            button.classList.add(
                'active'
            );

            document
                .getElementById(
                    button.dataset.tab
                )
                ?.classList.add(
                    'active'
                );
        }
    );
});
```

}

/* ============================================================
INICIALIZAÇÃO
============================================================ */

async function init() {
setupTabs();

```
/* LOGIN */

$('#login-form')?.addEventListener(
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
        } catch (error) {
            showMessage(
                error.message ||
                'Não foi possível iniciar sessão.',
                'erro'
            );
        }
    }
);


/* RECUPERAR PALAVRA-PASSE */

$('#reset-password')?.addEventListener(
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

            $('#login-email')?.focus();

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

$('#logout-btn')?.addEventListener(
    'click',
    logout
);


/* FOTOGRAFIA */

$('#photo-input')?.addEventListener(
    'change',
    async event => {
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
                error.message,
                'erro'
            );
        }

        event.target.value = '';
    }
);


/* DOCUMENTOS */

$('#doc-input')?.addEventListener(
    'change',
    async event => {
        const file =
            event.target.files?.[0];

        if (!file) {
            return;
        }

        try {
            await uploadSocioPdf(file);

            await loadDocuments();

            showMessage(
                'Documento carregado.',
                'sucesso'
            );

        } catch (error) {
            showMessage(
                error.message,
                'erro'
            );
        }

        event.target.value = '';
    }
);


/* EDITAR DADOS */

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
        async event => {
            event.preventDefault();

            try {
                $('#guardar-dados-btn')
                    .disabled = true;

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
                $('#guardar-dados-btn')
                    .disabled = false;
            }
        }
    );


/* EDITAR ARBITRAGEM */

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
        async event => {
            event.preventDefault();

            const button =
                event.currentTarget
                    .querySelector(
                        'button[type="submit"]'
                    );

            try {
                button.disabled = true;

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


/* ADMIN — CRIAR SÓCIO */

$('#novo-socio-form')
    ?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            try {
                $('#novo-socio-submit')
                    .disabled = true;

                const socio =
                    await createSocioFromAdmin();

                $('#novo-socio-form')
                    .reset();

                $('#novo-socio-resultado')
                    .hidden = false;

                $('#novo-socio-resultado')
                    .textContent =
                    `Sócio ${socio.numero_socio} — ${socio.nome} criado. Foi enviado um convite para ${socio.email}.`;

                await loadAdminSocios();

                showMessage(
                    'Sócio criado e convite enviado por email.',
                    'sucesso'
                );

            } catch (error) {
                $('#novo-socio-resultado')
                    .hidden = false;

                $('#novo-socio-resultado')
                    .textContent =
                    error.message ||
                    'Não foi possível criar o sócio.';

                showMessage(
                    error.message ||
                    'Não foi possível criar o sócio.',
                    'erro'
                );

            } finally {
                $('#novo-socio-submit')
                    .disabled = false;
            }
        }
    );


/* ADMIN — FUN&LEARN */

$('#funlearn-form')
    ?.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            const file =
                $('#funlearn-file')
                    .files?.[0];

            try {
                $('#funlearn-submit')
                    .disabled = true;

                const result =
                    await processFunlearnPdf(
                        file,

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

                const pontos =
                    Number(
                        $('#funlearn-pontos')
                            .value
                    );

                showMessage(
                    result.count
                        ? `Processamento concluído: ${result.count} sócio(s) recebeu(ram) ${pontos} ponto(s).`
                        : 'O PDF foi processado, mas não foi encontrado nenhum nome correspondente.',

                    result.count
                        ? 'sucesso'
                        : 'info'
                );

                $('#funlearn-form')
                    .reset();

            } catch (error) {
                showMessage(
                    error.message ||
                    'Erro ao processar o PDF.',
                    'erro'
                );

            } finally {
                $('#funlearn-submit')
                    .disabled = false;
            }
        }
    );


/* ========================================================
   VERIFICAR SESSÃO
   ======================================================== */

const {
    data: {
        session
    }
} = await supabase.auth.getSession();

if (!session) {
    return;
}

try {
    await loadProfile(
        session.user
    );

    renderProfile();

} catch (error) {
    console.error(
        'Erro ao carregar perfil:',
        error
    );

    showMessage(
        'A conta autenticada ainda não está associada a um registo de sócio.',
        'erro'
    );
}
```

}

/* ============================================================
ALTERAÇÕES DE AUTENTICAÇÃO
============================================================ */

supabase.auth.onAuthStateChange(
(_event, session) => {
if (!session) {
if ($('#login-panel')) {
$('#login-panel').hidden = false;
}

```
        if ($('#dashboard')) {
            $('#dashboard').hidden = true;
        }

        return;
    }

    /*
     * Não fazemos aqui uma segunda consulta ao perfil.
     * O init() trata do carregamento inicial.
     */
}
```

);

/* ============================================================
ARRANQUE
============================================================ */

init();

