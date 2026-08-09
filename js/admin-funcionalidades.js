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
const MAX_BULK_RECIPIENTS = 100;


const $ = (selector) =>
    document.querySelector(selector);


let socios = [];
let selectedSocioIds = new Set();


/* =========================================================
   UTILITÁRIOS
   ========================================================= */

function esc(value = '') {

    return String(value ?? '')
        .replace(/[&<>'"]/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[c]));
}


function normalise(value = '') {

    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}


function adminMessage(
    text,
    type = 'info'
) {

    let box =
        $('#admin-extra-message');

    if (!box) {

        box =
            document.createElement('div');

        box.id =
            'admin-extra-message';

        box.className =
            'socio-message';

        $('#admin-panel')?.prepend(box);
    }


    box.textContent = text;

    box.className =
        `socio-message ${type}`;

    box.hidden = false;
}


function getError(error) {

    return (
        error?.message ||
        String(error || 'Erro desconhecido.')
    );
}


/* =========================================================
   SEGURANÇA ADMIN
   ========================================================= */

async function requireAdmin() {

    const {
        data: {
            user
        },
        error: authError
    } =
        await supabase.auth.getUser();


    if (authError) {
        throw authError;
    }


    if (!user) {
        throw new Error(
            'Tem de iniciar sessão.'
        );
    }


    const {
        data,
        error
    } =
        await supabase
            .from('socios')
            .select(
                'id,numero_socio,is_admin,ativo'
            )
            .eq(
                'user_id',
                user.id
            )
            .maybeSingle();


    if (error) {
        throw error;
    }


    if (
        !data ||
        Number(data.numero_socio) !== ADMIN_NUMERO ||
        data.is_admin !== true ||
        data.ativo !== true
    ) {

        throw new Error(
            'Acesso reservado ao administrador.'
        );
    }


    return {
        user,
        socio: data
    };
}


/* =========================================================
   SÓCIOS
   ========================================================= */

async function getSocios() {

    await requireAdmin();


    const {
        data,
        error
    } =
        await supabase
            .from('socios')
            .select(
                'id,nome,numero_socio,email,telemovel,quotas,ativo'
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


    return data || [];
}


/* =========================================================
   LISTA + SELEÇÃO
   ========================================================= */

async function loadSocios() {

    try {

        socios =
            await getSocios();

        renderSocios();

        updateSelectedCount();

        populateRemovePointsSelect();

    } catch (error) {

        adminMessage(
            getError(error),
            'erro'
        );
    }
}


function renderSocios() {

    const list =
        $('#admin-socios-lista');

    if (!list) return;


    if (!socios.length) {

        list.innerHTML =
            '<div class="vazio">Não existem sócios registados.</div>';

        return;
    }


    /*
     * Só mantemos na seleção IDs que continuam
     * a existir na lista.
     */

    const validIds =
        new Set(
            socios.map(
                (socio) => socio.id
            )
        );


    selectedSocioIds =
        new Set(
            [...selectedSocioIds]
                .filter(
                    (id) =>
                        validIds.has(id)
                )
        );


    list.innerHTML =
        socios.map((socio) => {

            const checked =
                selectedSocioIds.has(
                    socio.id
                );


            const ativo =
                socio.ativo !== false;


            return `

                <div
                    class="admin-socio-row"
                    data-socio-id="${esc(socio.id)}"
                >

                    <input
                        class="admin-socio-select"
                        type="checkbox"
                        data-socio-select="${esc(socio.id)}"
                        ${checked ? 'checked' : ''}
                        ${!ativo ? 'disabled' : ''}
                        aria-label="Selecionar ${esc(socio.nome)}"
                    >


                    <span class="admin-socio-numero">
                        ${esc(socio.numero_socio)}
                    </span>


                    <div class="admin-socio-main">

                        <strong>
                            ${esc(socio.nome)}
                        </strong>

                        <small>
                            ${esc(
                                socio.email ||
                                'Sem email'
                            )}
                        </small>

                    </div>


                    <span
                        class="admin-socio-status ${
                            ativo
                                ? 'ativo'
                                : 'inativo'
                        }"
                    >
                        ${
                            ativo
                                ? 'Ativo'
                                : 'Inativo'
                        }
                    </span>

                </div>
            `;

        }).join('');


    /*
     * Eventos individuais
     */

    list
        .querySelectorAll(
            '[data-socio-select]'
        )
        .forEach((checkbox) => {

            checkbox.addEventListener(
                'change',
                () => {

                    const id =
                        checkbox.dataset.socioSelect;


                    if (checkbox.checked) {

                        selectedSocioIds.add(id);

                    } else {

                        selectedSocioIds.delete(id);
                    }


                    updateSelectedCount();
                    updateSelectAllState();
                }
            );
        });


    updateSelectAllState();
}


function updateSelectedCount() {

    const element =
        $('#admin-selected-count');

    if (!element) return;


    const count =
        selectedSocioIds.size;


    element.textContent =
        count === 1
            ? '1 selecionado'
            : `${count} selecionados`;
}


function updateSelectAllState() {

    const checkbox =
        $('#admin-select-all');

    if (!checkbox) return;


    const activeSocios =
        socios.filter(
            (socio) =>
                socio.ativo !== false
        );


    const activeIds =
        activeSocios.map(
            (socio) => socio.id
        );


    const selectedActive =
        activeIds.filter(
            (id) =>
                selectedSocioIds.has(id)
        );


    checkbox.checked =
        activeIds.length > 0 &&
        selectedActive.length === activeIds.length;


    checkbox.indeterminate =
        selectedActive.length > 0 &&
        selectedActive.length < activeIds.length;
}


function toggleSelectAll() {

    const checkbox =
        $('#admin-select-all');

    if (!checkbox) return;


    const activeSocios =
        socios.filter(
            (socio) =>
                socio.ativo !== false
        );


    if (checkbox.checked) {

        activeSocios.forEach(
            (socio) => {
                selectedSocioIds.add(
                    socio.id
                );
            }
        );

    } else {

        activeSocios.forEach(
            (socio) => {
                selectedSocioIds.delete(
                    socio.id
                );
            }
        );
    }


    renderSocios();
    updateSelectedCount();
}


/* =========================================================
   QUOTAS
   ========================================================= */

function looksOverdue(socio) {

    const value =
        normalise(
            socio.quotas || ''
        );


    return (
        value !== '' &&
        ![
            'em dia',
            'pago',
            'pagas',
            'paga',
            'liquidado',
            'liquidadas',
            'regularizado'
        ].includes(value)
    );
}


async function sendQuotasSelected() {

    await requireAdmin();


    if (!selectedSocioIds.size) {

        throw new Error(
            'Selecione pelo menos um sócio.'
        );
    }


    const selected =
        socios.filter(
            (socio) =>
                selectedSocioIds.has(
                    socio.id
                )
        );


    const eligible =
        selected.filter(
            (socio) =>
                socio.ativo !== false &&
                socio.email &&
                looksOverdue(socio)
        );


    if (!eligible.length) {

        throw new Error(
            'Nenhum dos sócios selecionados tem quotas em atraso e email válido.'
        );
    }


    const withoutEmail =
        selected.filter(
            (socio) =>
                socio.ativo !== false &&
                looksOverdue(socio) &&
                !socio.email
        );


    const result =
        await invoke(
            'admin-mail',
            {
                action:
                    'quotas_em_atraso',

                socio_ids:
                    eligible.map(
                        (socio) =>
                            socio.id
                    )
            }
        );


    return {
        ...result,
        selecionados:
            selected.length,

        elegiveis:
            eligible.length,

        sem_email:
            withoutEmail.length
    };
}


/* =========================================================
   DOCUMENTO PARA TODOS
   ========================================================= */

async function sendDocumentoTodos(
    file,
    subject,
    message
) {

    if (!(file instanceof File)) {

        throw new Error(
            'Selecione um documento.'
        );
    }


    if (
        !String(file.type)
            .toLowerCase()
            .includes('pdf')
    ) {

        throw new Error(
            'O documento deve ser PDF.'
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


    if (!String(subject || '').trim()) {

        throw new Error(
            'Indique o assunto do email.'
        );
    }


    if (!String(message || '').trim()) {

        throw new Error(
            'Escreva o conteúdo do email.'
        );
    }


    await requireAdmin();


    const {
        data: {
            session
        }
    } =
        await supabase.auth.getSession();


    if (!session) {

        throw new Error(
            'Sessão não autenticada.'
        );
    }


    const form =
        new FormData();


    form.append(
        'action',
        'documento_todos'
    );


    form.append(
        'documento',
        file
    );


    form.append(
        'subject',
        String(subject).trim()
    );


    form.append(
        'message',
        String(message).trim()
    );


    const response =
        await fetch(
            `${SUPABASE_URL}/functions/v1/admin-mail`,
            {
                method: 'POST',

                headers: {
                    Authorization:
                        `Bearer ${session.access_token}`
                },

                body: form
            }
        );


    const data =
        await response
            .json()
            .catch(() => ({}));


    if (
        !response.ok ||
        data?.error
    ) {

        throw new Error(
            data?.error ||
            'Falha no envio do documento.'
        );
    }


    return data;
}


/* =========================================================
   INVOCAR FUNÇÃO SUPABASE
   ========================================================= */

async function invoke(
    functionName,
    body
) {

    await requireAdmin();


    const {
        data,
        error
    } =
        await supabase.functions.invoke(
            functionName,
            {
                body
            }
        );


    if (error) {
        throw error;
    }


    if (data?.error) {

        throw new Error(
            data.error
        );
    }


    return data;
}


/* =========================================================
   RETIRAR PONTOS
   ========================================================= */

async function retirarPontos(
    socioId,
    pontos,
    motivo
) {

    const value =
        Number(pontos);


    if (
        !socioId ||
        !Number.isInteger(value) ||
        value <= 0
    ) {

        throw new Error(
            'Indique um número inteiro de pontos superior a zero.'
        );
    }


    if (
        !String(motivo || '').trim()
    ) {

        throw new Error(
            'Indique o motivo da retirada de pontos.'
        );
    }


    return invoke(
        'admin-funlearn',
        {
            action:
                'retirar_pontos',

            socio_id:
                socioId,

            pontos:
                value,

            motivo:
                String(motivo).trim(),

            notificar:
                true
        }
    );
}


/* =========================================================
   SELECT DE RETIRAR PONTOS
   ========================================================= */

function populateRemovePointsSelect() {

    const select =
        $('#admin-remove-socio');

    if (!select) return;


    select.innerHTML =
        '<option value="">Seleciona um sócio</option>' +
        socios
            .filter(
                (socio) =>
                    socio.ativo !== false
            )
            .map(
                (socio) => `
                    <option value="${esc(socio.id)}">
                        ${esc(socio.numero_socio)}
                        —
                        ${esc(socio.nome)}
                    </option>
                `
            )
            .join('');
}


/* =========================================================
   NOVO SÓCIO
   ========================================================= */

async function createNewMember(
    event
) {

    event.preventDefault();


    try {

        await requireAdmin();


        const nome =
            $('#novo-socio-nome')
                .value
                .trim();

        const numero =
            Number(
                $('#novo-socio-numero')
                    .value
            );

        const email =
            $('#novo-socio-email')
                .value
                .trim();

        const telemovel =
            $('#novo-socio-telemovel')
                .value
                .trim();


        if (!nome || !Number.isInteger(numero) || !email) {

            throw new Error(
                'Preencha os campos obrigatórios.'
            );
        }


        /*
         * Mantemos a criação via função administrativa,
         * caso já exista no projeto.
         */

        const result =
            await invoke(
                'admin-members',
                {
                    action:
                        'criar_socio',

                    nome,
                    numero_socio:
                        numero,

                    email,
                    telemovel:
                        telemovel || null
                }
            );


        const box =
            $('#novo-socio-resultado');


        if (box) {

            box.textContent =
                result?.message ||
                'Sócio criado e convite enviado.';

            box.hidden = false;
        }


        $('#novo-socio-form').reset();


        await loadSocios();


    } catch (error) {

        adminMessage(
            getError(error),
            'erro'
        );
    }
}


/* =========================================================
   IMPORTAÇÃO PDF
   ========================================================= */

async function extractPdfText(file) {

    if (!window.pdfjsLib) {

        throw new Error(
            'O leitor de PDF ainda não foi carregado.'
        );
    }


    const buffer =
        await file.arrayBuffer();


    const pdf =
        await window.pdfjsLib
            .getDocument({
                data: buffer
            })
            .promise;


    const pages = [];


    for (
        let pageNo = 1;
        pageNo <= pdf.numPages;
        pageNo++
    ) {

        const page =
            await pdf.getPage(
                pageNo
            );


        const content =
            await page.getTextContent();


        pages.push(
            content.items
                .map(
                    (item) =>
                        item.str || ''
                )
                .join(' ')
        );
    }


    return pages.join('\n');
}


function parseDelimitedLine(line) {

    const separators = [
        ';',
        '|',
        '\t'
    ];


    const separator =
        separators.find(
            (value) =>
                line.includes(value)
        );


    if (!separator) {
        return null;
    }


    return line
        .split(separator)
        .map(
            (value) =>
                value.trim()
        );
}


function parseSocioRows(text) {

    const lines =
        text
            .split(/\r?\n/)
            .map(
                (line) =>
                    line
                        .replace(/\s+/g, ' ')
                        .trim()
            )
            .filter(Boolean);


    if (!lines.length) {
        return [];
    }


    const rows = [];


    for (const line of lines) {

        const cells =
            parseDelimitedLine(line);


        if (!cells) continue;


        const number =
            Number.parseInt(
                cells[0] || '',
                10
            );


        const nome =
            String(
                cells[1] || ''
            ).trim();


        if (
            !Number.isInteger(number) ||
            !nome
        ) {
            continue;
        }


        rows.push({

            numero_socio:
                number,

            nome,

            email:
                cells[2]?.trim() ||
                null,

            telemovel:
                cells[3]?.trim() ||
                null
        });
    }


    const unique =
        new Map();


    rows.forEach(
        (row) => {
            unique.set(
                row.numero_socio,
                row
            );
        }
    );


    return [
        ...unique.values()
    ];
}


async function importSociosPdf(file) {

    if (
        !(file instanceof File) ||
        file.type !==
            'application/pdf'
    ) {

        throw new Error(
            'Selecione um PDF válido.'
        );
    }


    const text =
        await extractPdfText(file);


    const rows =
        parseSocioRows(text);


    if (!rows.length) {

        throw new Error(
            'Não foram encontrados registos. O PDF precisa de texto selecionável e deve conter N.º de sócio + Nome.'
        );
    }


    await requireAdmin();


    const existing =
        await getSocios();


    const byNumber =
        new Map(
            existing.map(
                (socio) => [
                    Number(
                        socio.numero_socio
                    ),
                    socio
                ]
            )
        );


    const inserted = [];
    const updated = [];
    const errors = [];


    for (const row of rows) {

        const old =
            byNumber.get(
                row.numero_socio
            );


        const payload = {

            nome:
                row.nome,

            email:
                row.email,

            telemovel:
                row.telemovel,

            ativo:
                true
        };


        const result =
            old
                ? await supabase
                    .from('socios')
                    .update(payload)
                    .eq(
                        'id',
                        old.id
                    )

                : await supabase
                    .from('socios')
                    .insert({
                        numero_socio:
                            row.numero_socio,
                        ...payload
                    });


        if (result.error) {

            errors.push(
                `${row.numero_socio} — ${row.nome}: ${result.error.message}`
            );

        } else if (old) {

            updated.push(
                row.numero_socio
            );

        } else {

            inserted.push(
                row.numero_socio
            );
        }
    }


    return {

        total:
            rows.length,

        inserted:
            inserted.length,

        updated:
            updated.length,

        errors
    };
}


/* =========================================================
   EVENTOS ADMIN
   ========================================================= */

function setupEvents() {


    $('#admin-select-all')
        ?.addEventListener(
            'change',
            toggleSelectAll
        );


    $('#admin-refresh-socios')
        ?.addEventListener(
            'click',
            async () => {

                selectedSocioIds.clear();

                await loadSocios();
            }
        );


    $('#admin-quotas-atraso')
        ?.addEventListener(
            'click',
            async () => {

                try {

                    if (
                        !selectedSocioIds.size
                    ) {

                        throw new Error(
                            'Selecione pelo menos um sócio.'
                        );
                    }


                    const selected =
                        socios.filter(
                            (socio) =>
                                selectedSocioIds
                                    .has(
                                        socio.id
                                    )
                        );


                    if (
                        !window.confirm(
                            `Enviar avisos de quotas em atraso aos ${selected.length} sócio(s) selecionado(s)?`
                        )
                    ) {
                        return;
                    }


                    const result =
                        await sendQuotasSelected();


                    let message =
                        `Avisos enviados: ${result.enviados || 0}.`;


                    if (
                        result.sem_email
                    ) {

                        message +=
                            ` ${result.sem_email} sócio(s) sem email não recebeu o aviso.`;
                    }


                    adminMessage(
                        message,
                        result.erros?.length
                            ? 'info'
                            : 'sucesso'
                    );


                    if (
                        result.erros?.length
                    ) {
                        console.warn(
                            result.erros
                        );
                    }

                } catch (error) {

                    adminMessage(
                        getError(error),
                        'erro'
                    );
                }
            }
        );


    $('#admin-documento-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();


                try {

                    const subject =
                        $('#admin-documento-assunto')
                            .value
                            .trim();


                    const message =
                        $('#admin-documento-mensagem')
                            .value
                            .trim();


                    const file =
                        $('#admin-documento-file')
                            ?.files?.[0];


                    if (
                        !subject ||
                        !message ||
                        !file
                    ) {

                        throw new Error(
                            'Preencha o assunto, o conteúdo do email e escolha o PDF.'
                        );
                    }


                    const recipients =
                        (
                            await getSocios()
                        ).filter(
                            (socio) =>
                                socio.ativo !== false &&
                                socio.email
                        );


                    if (!recipients.length) {

                        throw new Error(
                            'Não existem sócios ativos com email.'
                        );
                    }


                    if (
                        recipients.length >
                        MAX_BULK_RECIPIENTS
                    ) {

                        throw new Error(
                            `A lista tem ${recipients.length} destinatários. O envio está limitado a ${MAX_BULK_RECIPIENTS} por operação.`
                        );
                    }


                    if (
                        !window.confirm(
                            `Enviar o documento para ${recipients.length} sócios?`
                        )
                    ) {
                        return;
                    }


                    const result =
                        await sendDocumentoTodos(
                            file,
                            subject,
                            message
                        );


                    adminMessage(
                        `Comunicação enviada para ${result.enviados || 0} sócio(s).`,
                        result.erros?.length
                            ? 'info'
                            : 'sucesso'
                    );


                    if (
                        result.erros?.length
                    ) {

                        console.warn(
                            result.erros
                        );
                    }


                } catch (error) {

                    adminMessage(
                        getError(error),
                        'erro'
                    );
                }
            }
        );


    $('#novo-socio-form')
        ?.addEventListener(
            'submit',
            createNewMember
        );


    $('#admin-import-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();


                try {

                    const file =
                        $('#admin-import-file')
                            ?.files?.[0];


                    if (!file) {

                        throw new Error(
                            'Escolha o PDF dos sócios.'
                        );
                    }


                    const result =
                        await importSociosPdf(
                            file
                        );


                    const box =
                        $('#admin-import-result');


                    if (box) {

                        box.textContent =
                            `Importação concluída: ${result.inserted} inseridos, ${result.updated} atualizados.` +
                            (
                                result.errors.length
                                    ? ` Erros: ${result.errors.length}.`
                                    : ''
                            );

                        box.hidden = false;
                    }


                    if (
                        result.errors.length
                    ) {

                        console.warn(
                            result.errors
                        );
                    }


                    await loadSocios();


                } catch (error) {

                    adminMessage(
                        getError(error),
                        'erro'
                    );
                }
            }
        );


    $('#admin-remove-points-form')
        ?.addEventListener(
            'submit',
            async (event) => {

                event.preventDefault();


                try {

                    const socioId =
                        $('#admin-remove-socio')
                            .value;


                    const points =
                        Number(
                            $('#admin-remove-pontos')
                                .value
                        );


                    const reason =
                        $('#admin-remove-motivo')
                            .value
                            .trim();


                    if (
                        !socioId ||
                        !Number.isInteger(points) ||
                        points <= 0 ||
                        !reason
                    ) {

                        throw new Error(
                            'Preencha o sócio, os pontos e o motivo.'
                        );
                    }


                    if (
                        !window.confirm(
                            `Retirar ${points} ponto(s) deste sócio?`
                        )
                    ) {
                        return;
                    }


                    const result =
                        await retirarPontos(
                            socioId,
                            points,
                            reason
                        );


                    adminMessage(
                        `Foram retirados ${result.pontos_retirados} ponto(s). O sócio foi notificado.`,
                        'sucesso'
                    );


                    $('#admin-remove-pontos')
                        .value = '';

                    $('#admin-remove-motivo')
                        .value = '';


                } catch (error) {

                    adminMessage(
                        getError(error),
                        'erro'
                    );
                }
            }
        );
}


/* =========================================================
   ARRANQUE
   ========================================================= */

async function setup() {

    try {

        await requireAdmin();

        setupEvents();

        await loadSocios();

    } catch (error) {

        console.error(
            'Área administrativa:',
            error
        );

        /*
         * Não mostramos erros administrativos
         * a utilizadores normais.
         */
    }
}


setup();


window.NAFAdmin = {

    requireAdmin,

    getSocios,

    sendQuotasSelected,

    sendDocumentoTodos,

    retirarPontos,

    importSociosPdf
};
```
