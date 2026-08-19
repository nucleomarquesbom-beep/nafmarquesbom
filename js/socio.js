import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.__NAF_SUPABASE = supabase;

const state = {
    user: null,
    socio: null
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

const $ = selector =>
    document.querySelector(selector);

const $$ = selector =>
    [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
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
    const el = $('#socio-message');

    if (!el) return;

    el.textContent = text;
    el.className =
        `socio-message ${type}`;
    el.hidden = false;
}

function hideMessage() {
    const el =
        $('#socio-message');

    if (el) {
        el.hidden = true;
    }
}

/*
 * Regra importante:
 * nenhum dado privado é colocado no HTML antes
 * de existir uma sessão autenticada e um registo
 * válido na tabela socios.
 */
function clearPrivateUI() {
    state.user = null;
    state.socio = null;

    if ($('#login-panel')) {
        $('#login-panel').hidden = false;
    }

    if ($('#dashboard')) {
        $('#dashboard').hidden = true;
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

    clearIds.forEach(id => {
        const el = $(id);

        if (el) {
            el.textContent = '—';
        }
    });

    if ($('#funlearn-total')) {
        $('#funlearn-total').textContent = '0';
    }

    if ($('#funlearn-total-top')) {
        $('#funlearn-total-top').textContent = '0';
    }

    if ($('#docs-list')) {
        $('#docs-list').innerHTML = '';
    }

    if ($('#funlearn-history')) {
        $('#funlearn-history').innerHTML = '';
    }

    const photo =
        $('#socio-photo');

    const placeholder =
        $('#socio-photo-placeholder');

    if (photo) {
        photo.removeAttribute('src');
        photo.hidden = true;
    }

    if (placeholder) {
        placeholder.hidden = false;
    }
}

async function getSession() {
    const {
        data,
        error
    } = await supabase.auth.getSession();

    if (error) {
        throw error;
    }

    return data.session || null;
}

async function login(
    email,
    password
) {
    const {
        error
    } = await supabase.auth.signInWithPassword({
        email,
        password
    });

    if (error) {
        throw error;
    }
}

async function resetPassword(email) {
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

async function loadProfile(user) {
    if (!user?.id) {
        throw new Error(
            'Utilizador autenticado inválido.'
        );
    }

    let data;

    const {
        data: acesso,
        error: acessoError
    } = await supabase.rpc(
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
         * Compatibilidade durante a transição:
         * a migration da regra pode ainda não ter
         * sido aplicada.
         */
        const fallback =
            await supabase
                .from('socios')
                .select('*')
                .eq('user_id', user.id)
                .eq('ativo', true)
                .single();

        if (fallback.error) {
            throw fallback.error;
        }

        data = fallback.data;
    }

    const result = data
        ? {
              data,
              error: null
          }
        : await supabase
              .from('socios')
              .select('*')
              .eq('user_id', user.id)
              .eq('ativo', true)
              .single();

    if (result.error) {
        throw result.error;
    }

    data = result.data;

    if (!data) {
        throw new Error(
            'A conta autenticada não está associada a um sócio ativo.'
        );
    }

    state.user = user;
    state.socio = data;

    /*
     * ADMINISTRAÇÃO CENTRALIZADA
     *
     * A partir daqui um administrador NÃO usa
     * mais o painel administrativo antigo que
     * existia dentro de socio.html.
     *
     * Existe uma única área administrativa:
     *
     *       admin.html
     */
    if (
        data.is_admin === true &&
        data.ativo === true
    ) {
        window.location.replace(
            'admin.html'
        );

        return;
    }
}

function renderProfile() {
    const s = state.socio;

    if (!s) {
        return;
    }

    $('#login-panel').hidden = true;
    $('#dashboard').hidden = false;

    $('#socio-name').textContent =
        s.nome || 'Sócio';

    $('#socio-number').textContent =
        s.numero_socio ?? '—';

    $('#dados-nome').textContent =
        s.nome || '—';

    $('#dados-numero').textContent =
        s.numero_socio ?? '—';

    $('#dados-nascimento').textContent =
        s.data_nascimento
            ? new Date(
                  `${s.data_nascimento}T00:00:00`
              ).toLocaleDateString('pt-PT')
            : '—';

    $('#dados-morada').textContent =
        s.morada || '—';

    $('#dados-email').textContent =
        s.email ||
        state.user?.email ||
        '—';

    $('#dados-telemovel').textContent =
        s.telemovel || '—';

    $('#dados-arbitro').textContent =
        s.numero_arbitro || '—';

    $('#dados-af').textContent =
        s.associacao_futebol || '—';

    $('#dados-modalidade').textContent =
        s.modalidade || '—';

    const categoriaView =
        $('#dados-categoria');

    if (categoriaView) {
        categoriaView.textContent =
            s.categoria || '—';
    }

    fillEditForms();
    setupArbitragemSelectors();
    loadPhoto();
    loadQuotas();
    loadDocuments();
    loadFunlearn();

    window.NAF_DR_ARBITRO_START?.();
}

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

    const numero =
        state.socio.numero_socio;

    if (!numero) {
        image.hidden = true;
        placeholder.hidden = false;
        return;
    }

    try {
        const {
            data,
            error
        } =
            await supabase
                .storage
                .from('fotos_socios')
                .list(
                    String(numero),
                    {
                        limit: 100
                    }
                );

        if (error) {
            throw error;
        }

        const files =
            data || [];

        const imageFile =
            files.find(file =>
                /\.(jpg|jpeg|png|webp)$/i.test(
                    file.name
                )
            );

        if (!imageFile) {
            image.hidden = true;
            placeholder.hidden = false;
            return;
        }

        const path =
            `${numero}/${imageFile.name}`;

        const {
            data: publicData
        } =
            supabase
                .storage
                .from('fotos_socios')
                .getPublicUrl(path);

        if (!publicData?.publicUrl) {
            image.hidden = true;
            placeholder.hidden = false;
            return;
        }

        image.src =
            `${publicData.publicUrl}?v=${Date.now()}`;

        image.hidden = false;
        placeholder.hidden = true;
    } catch (error) {
        console.error(
            'Erro ao carregar fotografia:',
            error
        );

        image.hidden = true;
        placeholder.hidden = false;
    }
}

function fillEditForms() {
    const s = state.socio;

    if (!s) {
        return;
    }

    const fields = {
        '#edit-nome': s.nome || '',
        '#edit-nascimento': s.data_nascimento || '',
        '#edit-morada': s.morada || '',
        '#edit-telemovel': s.telemovel || '',
        '#edit-email': s.email || state.user?.email || '',
        '#edit-associacao-futebol': s.associacao_futebol || '',
        '#edit-numero-arbitro': s.numero_arbitro || '',
        '#edit-modalidade': s.modalidade || '',
        '#edit-categoria': s.categoria || ''
    };

    Object.entries(fields).forEach(
        ([selector, value]) => {
            const element =
                $(selector);

            if (element) {
                element.value = value;
            }
        }
    );
}

async function saveProfileChanges() {
    if (!state.socio) {
        throw new Error(
            'Não existe uma sessão de sócio ativa.'
        );
    }

    const updates = {
        nome:
            $('#edit-nome')?.value.trim() ||
            null,

        data_nascimento:
            $('#edit-nascimento')?.value ||
            null,

        morada:
            $('#edit-morada')?.value.trim() ||
            null,

        telemovel:
            $('#edit-telemovel')?.value.trim() ||
            null,

        email:
            $('#edit-email')?.value.trim() ||
            null,

        associacao_futebol:
            $('#edit-associacao-futebol')
                ?.value.trim() ||
            null,

        numero_arbitro:
            $('#edit-numero-arbitro')
                ?.value.trim() ||
            null,

        modalidade:
            $('#edit-modalidade')
                ?.value.trim() ||
            null,

        categoria:
            $('#edit-categoria')
                ?.value.trim() ||
            null
    };

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
            .select('*')
            .single();

    if (error) {
        throw error;
    }

    state.socio = data;

    renderProfile();

    showMessage(
        'Os teus dados foram atualizados.',
        'sucesso'
    );
}

function setupProfileForm() {
    const form =
        $('#dados-form');

    if (!form || form.dataset.bound) {
        return;
    }

    form.dataset.bound = '1';

    form.addEventListener(
        'submit',
        async event => {
            event.preventDefault();

            try {
                await saveProfileChanges();
            } catch (error) {
                console.error(
                    'Erro ao guardar dados:',
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

function setupArbitragemSelectors() {
    /*
     * A função Drº Árbitro trata da sua própria
     * inicialização. Esta função existe para
     * compatibilidade com o HTML atual.
     */
}

async function loadQuotas() {
    const totalElement =
        $('#quotas-total');

    const estadoElement =
        $('#quotas-estado');

    const historicoElement =
        $('#quotas-historico');

    if (
        !state.socio ||
        !totalElement &&
        !estadoElement &&
        !historicoElement
    ) {
        return;
    }

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
                );

        if (error) {
            throw error;
        }

        const quotas =
            data || [];

        if (!quotas.length) {
            if (estadoElement) {
                estadoElement.textContent =
                    'Sem registos de quotas.';
            }

            if (historicoElement) {
                historicoElement.innerHTML =
                    '<div class="vazio">Não existem registos de quotas.</div>';
            }

            return;
        }

        const emDivida =
            quotas.filter(
                quota =>
                    !(
                        quota.pago === true ||
                        quota.estado === 'pago' ||
                        quota.estado === 'regularizada'
                    )
            );

        if (estadoElement) {
            estadoElement.textContent =
                emDivida.length
                    ? `${emDivida.length} quota(s) em dívida`
                    : 'Quotas regularizadas';
        }

        if (totalElement) {
            const total =
                emDivida.reduce(
                    (sum, quota) =>
                        sum +
                        Number(
                            quota.valor_em_divida ??
                                quota.valor ??
                                0
                        ),
                    0
                );

            totalElement.textContent =
                `${total.toFixed(2)} €`;
        }

        if (historicoElement) {
            historicoElement.innerHTML =
                quotas
                    .map(quota => {
                        const pago =
                            quota.pago === true ||
                            quota.estado === 'pago' ||
                            quota.estado === 'regularizada';

                        const valor =
                            Number(
                                quota.valor ??
                                    quota.valor_total ??
                                    0
                            );

                        return `
                            <div class="quota-row">
                                <div>
                                    <strong>${escapeHtml(quota.ano ?? '')}</strong>
                                </div>

                                <div>
                                    ${valor.toFixed(2)} €
                                </div>

                                <div class="${pago ? 'quota-paga' : 'quota-divida'}">
                                    ${pago ? 'Regularizada' : 'Em dívida'}
                                </div>
                            </div>
                        `;
                    })
                    .join('');
        }
    } catch (error) {
        console.error(
            'Erro ao carregar quotas:',
            error
        );

        if (estadoElement) {
            estadoElement.textContent =
                'Não foi possível carregar as quotas.';
        }
    }
}

async function loadDocuments() {
    const root =
        $('#docs-list');

    if (!root || !state.socio) {
        return;
    }

    try {
        const {
            data,
            error
        } =
            await supabase
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
            throw error;
        }

        const documents =
            data || [];

        if (!documents.length) {
            root.innerHTML =
                '<div class="vazio">Não existem documentos disponíveis.</div>';

            return;
        }

        root.innerHTML =
            documents
                .map(document => `
                    <div class="documento-row">
                        <div>
                            <strong>
                                ${escapeHtml(
                                    document.nome ||
                                    document.titulo ||
                                    'Documento'
                                )}
                            </strong>

                            ${
                                document.created_at
                                    ? `
                                        <small>
                                            ${new Date(
                                                document.created_at
                                            ).toLocaleDateString(
                                                'pt-PT'
                                            )}
                                        </small>
                                    `
                                    : ''
                            }
                        </div>

                        <button
                            type="button"
                            class="botao-secundario documento-download"
                            data-url="${escapeHtml(
                                document.url ||
                                document.storage_path ||
                                ''
                            )}"
                        >
                            Abrir
                        </button>
                    </div>
                `)
                .join('');

        root
            .querySelectorAll(
                '.documento-download'
            )
            .forEach(button => {
                button.addEventListener(
                    'click',
                    () => {
                        const url =
                            button.dataset.url;

                        if (url) {
                            window.open(
                                url,
                                '_blank',
                                'noopener'
                            );
                        }
                    }
                );
            });
    } catch (error) {
        console.error(
            'Erro ao carregar documentos:',
            error
        );

        root.innerHTML =
            '<div class="vazio">Não foi possível carregar os documentos.</div>';
    }
}

async function loadFunlearn() {
    const totalElements = [
        $('#funlearn-total'),
        $('#funlearn-total-top')
    ].filter(Boolean);

    const history =
        $('#funlearn-history');

    if (
        !state.socio ||
        (
            !totalElements.length &&
            !history
        )
    ) {
        return;
    }

    try {
        const {
            data,
            error
        } =
            await supabase
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
            throw error;
        }

        const entries =
            data || [];

        const total =
            entries.reduce(
                (sum, entry) =>
                    sum +
                    Number(
                        entry.pontos || 0
                    ),
                0
            );

        totalElements.forEach(
            element => {
                element.textContent =
                    String(total);
            }
        );

        if (!history) {
            return;
        }

        if (!entries.length) {
            history.innerHTML =
                '<div class="vazio">Ainda não existem movimentos Fun&Learn.</div>';

            return;
        }

        history.innerHTML =
            entries
                .map(entry => `
                    <div class="funlearn-row">
                        <div>
                            <strong>
                                ${escapeHtml(
                                    entry.atividade ||
                                    'Fun&Learn'
                                )}
                            </strong>

                            ${
                                entry.descricao
                                    ? `
                                        <small>
                                            ${escapeHtml(
                                                entry.descricao
                                            )}
                                        </small>
                                    `
                                    : ''
                            }

                            ${
                                entry.created_at
                                    ? `
                                        <small>
                                            ${new Date(
                                                entry.created_at
                                            ).toLocaleDateString(
                                                'pt-PT'
                                            )}
                                        </small>
                                    `
                                    : ''
                            }
                        </div>

                        <strong>
                            ${
                                Number(
                                    entry.pontos || 0
                                ) > 0
                                    ? '+'
                                    : ''
                            }${Number(
                                entry.pontos || 0
                            )}
                        </strong>
                    </div>
                `)
                .join('');
    } catch (error) {
        console.error(
            'Erro ao carregar Fun&Learn:',
            error
        );

        totalElements.forEach(
            element => {
                element.textContent = '0';
            }
        );

        if (history) {
            history.innerHTML =
                '<div class="vazio">Não foi possível carregar o histórico Fun&Learn.</div>';
        }
    }
}

async function uploadPhoto(file) {
    if (
        !file ||
        !state.socio?.numero_socio
    ) {
        throw new Error(
            'Não foi possível identificar o sócio.'
        );
    }

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (
        !allowedTypes.includes(
            file.type
        )
    ) {
        throw new Error(
            'A fotografia deve estar em JPG, PNG ou WEBP.'
        );
    }

    const maxSize =
        5 * 1024 * 1024;

    if (file.size > maxSize) {
        throw new Error(
            'A fotografia não pode ultrapassar 5 MB.'
        );
    }

    const extension =
        file.name
            .split('.')
            .pop()
            .toLowerCase();

    const path =
        `${state.socio.numero_socio}/foto.${extension}`;

    const {
        error
    } =
        await supabase
            .storage
            .from('fotos_socios')
            .upload(
                path,
                file,
                {
                    upsert: true,
                    contentType:
                        file.type
                }
            );

    if (error) {
        throw error;
    }

    await loadPhoto();
}

function setupPhotoUpload() {
    const input =
        $('#photo-input');

    const trigger =
        $('#photo-trigger');

    if (
        !input ||
        !trigger ||
        input.dataset.bound
    ) {
        return;
    }

    input.dataset.bound = '1';

    trigger.addEventListener(
        'click',
        event => {
            event.preventDefault();
            input.click();
        }
    );

    input.addEventListener(
        'change',
        async () => {
            const file =
                input.files?.[0];

            if (!file) {
                return;
            }

            try {
                await uploadPhoto(file);

                showMessage(
                    'Fotografia atualizada com sucesso.',
                    'sucesso'
                );
            } catch (error) {
                console.error(
                    'Erro ao atualizar fotografia:',
                    error
                );

                showMessage(
                    error.message ||
                        'Não foi possível atualizar a fotografia.',
                    'erro'
                );
            } finally {
                input.value = '';
            }
        }
    );
}

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

function syncMobileTabSelector() {
    const select =
        $('#socio-tab-select');

    if (!select) {
        return;
    }

    const buttons =
        $$('.socio-tab');

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
                button =>
                    `<option value="${escapeHtml(
                        button.dataset.tab || ''
                    )}">${escapeHtml(
                        button.textContent.trim()
                    )}</option>`
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
        $$('.socio-tab').find(
            button =>
                button.dataset.tab ===
                tabName
        );

    if (!button) {
        return;
    }

    $$('.socio-tab').forEach(
        button =>
            button.classList.remove(
                'active'
            )
    );

    $$('.socio-tab-content').forEach(
        panel =>
            panel.classList.remove(
                'active'
            )
    );

    button.classList.add(
        'active'
    );

    document
        .getElementById(tabName)
        ?.classList.add('active');

    const select =
        $('#socio-tab-select');

    if (select) {
        select.value =
            tabName;
    }
}

function setupTabs() {
    $$('.socio-tab').forEach(
        button => {
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
                                    !button.dataset.bound
                                ) {
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

function cleanupDuplicateQuotaMarkup() {
    /*
     * Mantém compatibilidade com versões antigas
     * do HTML que possam ter duplicado algum bloco
     * visual de quotas.
     *
     * Não executa qualquer operação administrativa.
     */
}

async function init() {
    await loadPublicMembers();

    /*
     * Nunca mostrar dados privados por defeito.
     */
    clearPrivateUI();

    cleanupDuplicateQuotaMarkup();

    setupTabs();
    setupProfileForm();
    setupPhotoUpload();

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

                    /*
                     * Se for administrador,
                     * loadProfile já iniciou a
                     * navegação para admin.html.
                     */
                    if (
                        !state.socio ||
                        state.socio.is_admin === true
                    ) {
                        return;
                    }

                    renderProfile();
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

    $('#logout-btn')
        ?.addEventListener(
            'click',
            logout
        );

    const session =
        await getSession();

    if (!session) {
        return;
    }

    try {
        await loadProfile(
            session.user
        );

        /*
         * Administradores já foram enviados
         * para admin.html por loadProfile().
         */
        if (
            !state.socio ||
            state.socio.is_admin === true
        ) {
            return;
        }

        renderProfile();
    } catch (error) {
        console.error(
            'Erro ao restaurar sessão:',
            error
        );

        clearPrivateUI();

        showMessage(
            error.message ||
                'A sessão não pôde ser restaurada.',
            'erro'
        );
    }
}

supabase.auth.onAuthStateChange(
    async (_event, session) => {
        if (!session?.user) {
            clearPrivateUI();
            return;
        }

        try {
            await loadProfile(
                session.user
            );

            /*
             * Se for administrador,
             * loadProfile já trata do redirect.
             */
            if (
                !state.socio ||
                state.socio.is_admin === true
            ) {
                return;
            }

            renderProfile();
        } catch (error) {
            console.error(
                'Erro na sessão:',
                error
            );

            clearPrivateUI();

            showMessage(
                error.message ||
                    'Não foi possível validar o acesso.',
                'erro'
            );
        }
    }
);

init().catch(error => {
    console.error(
        'Erro ao iniciar área de sócio:',
        error
    );

    clearPrivateUI();

    showMessage(
        error.message ||
            'Não foi possível iniciar a área de sócio.',
        'erro'
    );
});
