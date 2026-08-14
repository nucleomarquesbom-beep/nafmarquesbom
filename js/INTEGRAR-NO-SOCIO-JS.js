/* ============================================================
   INTEGRAÇÃO A ADICIONAR AO socio.js
   Categoria + Modalidade + Associação de Futebol
   ============================================================ */

const ASSOCIACOES_FUTEBOL_FALLBACK = [
    'AF Algarve',
    'AF Angra do Heroísmo',
    'AF Aveiro',
    'AF Beja',
    'AF Braga',
    'AF Bragança',
    'AF Castelo Branco',
    'AF Coimbra',
    'AF Évora',
    'AF Guarda',
    'AF Horta',
    'AF Leiria',
    'AF Lisboa',
    'AF Madeira',
    'AF Ponta Delgada',
    'AF Portalegre',
    'AF Porto',
    'AF Santarém',
    'AF Setúbal',
    'AF Viana do Castelo',
    'AF Vila Real',
    'AF Viseu'
];

const CATEGORIAS_ARBITRAGEM = {
    Futebol: ['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
    Futsal: ['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
};

async function prepararCamposArbitragem() {
    const modalidade = document.querySelector('#edit-modalidade');
    const form = document.querySelector('#arbitragem-edit-form');
    if (!modalidade || !form) return;

    /* Modalidade deixa de ser texto livre. */
    let modalidadeSelect = modalidade;
    if (modalidadeSelect.tagName !== 'SELECT') {
        modalidadeSelect = document.createElement('select');
        modalidadeSelect.id = 'edit-modalidade';
        modalidadeSelect.name = 'modalidade';
        modalidadeSelect.required = true;
        modalidadeSelect.innerHTML = `
            <option value="">Selecionar modalidade</option>
            <option value="Futebol">Futebol</option>
            <option value="Futsal">Futsal</option>
        `;
        modalidade.replaceWith(modalidadeSelect);
    }

    /* Associação deixa de ser texto livre. */
    let af = document.querySelector('#edit-af');
    if (af && af.tagName !== 'SELECT') {
        const select = document.createElement('select');
        select.id = 'edit-af';
        select.name = 'associacao_futebol';
        select.required = true;
        af.replaceWith(select);
        af = select;
    }

    /* Categoria é dependente da modalidade. */
    let categoria = document.querySelector('#edit-categoria');
    if (!categoria) {
        const afLabel = af?.closest('label');
        const label = document.createElement('label');
        label.innerHTML = `
            Categoria
            <select id="edit-categoria" name="categoria" required></select>
        `;
        (afLabel || modalidadeSelect.closest('label')).insertAdjacentElement('afterend', label);
        categoria = document.querySelector('#edit-categoria');
    }

    if (!modalidadeSelect.dataset.nafBound) {
        modalidadeSelect.dataset.nafBound = '1';
        modalidadeSelect.addEventListener('change', () => {
            const categorias = CATEGORIAS_ARBITRAGEM[modalidadeSelect.value] || [];
            categoria.innerHTML =
                '<option value="">Selecionar categoria</option>' +
                categorias.map(c => `<option value="${c}">${c}</option>`).join('');
            categoria.disabled = !modalidadeSelect.value;
        });
    }

    /* Lista das 22 associações, preferindo a BD. */
    if (af && !af.dataset.nafBound) {
        af.dataset.nafBound = '1';

        let nomes = ASSOCIACOES_FUTEBOL_FALLBACK;

        try {
            const client = window.__NAF_SUPABASE;
            if (client) {
                const { data, error } = await client.rpc('lista_associacoes_futebol');
                if (!error && Array.isArray(data) && data.length) {
                    nomes = data.map(row => row.nome);
                }
            }
        } catch (error) {
            console.warn('Lista de associações: fallback local usado.', error);
        }

        af.innerHTML =
            '<option value="">Selecionar Associação de Futebol</option>' +
            nomes.map(nome => `<option value="${nome}">${nome}</option>`).join('');
    }

    /* Carrega os valores atuais do sócio. */
    try {
        const client = window.__NAF_SUPABASE;
        const { data: auth } = await client.auth.getUser();
        if (!auth?.user?.id) return;

        const { data: socio, error } = await client
            .from('socios')
            .select('numero_arbitro,associacao_futebol,modalidade,categoria')
            .eq('user_id', auth.user.id)
            .eq('ativo', true)
            .single();

        if (error || !socio) return;

        document.querySelector('#edit-arbitro').value = socio.numero_arbitro || '';
        modalidadeSelect.value = socio.modalidade || '';

        const categorias = CATEGORIAS_ARBITRAGEM[modalidadeSelect.value] || [];
        categoria.innerHTML =
            '<option value="">Selecionar categoria</option>' +
            categorias.map(c => `<option value="${c}">${c}</option>`).join('');
        categoria.disabled = !modalidadeSelect.value;
        categoria.value = socio.categoria || '';

        if (af) af.value = socio.associacao_futebol || '';
    } catch (error) {
        console.error('Erro ao carregar dados de arbitragem:', error);
    }
}

/*
 * Use esta função no handler atual de submit da aba Arbitragem.
 * Substitui a atualização direta de numero_arbitro/associacao/modalidade.
 */
async function guardarArbitragemComBD() {
    const client = window.__NAF_SUPABASE;
    if (!client) throw new Error('Ligação à base de dados indisponível.');

    const modalidade = document.querySelector('#edit-modalidade')?.value || '';
    const categoria = document.querySelector('#edit-categoria')?.value || '';
    const associacao = document.querySelector('#edit-af')?.value || '';
    const numeroArbitro = document.querySelector('#edit-arbitro')?.value?.trim() || '';

    if (!CATEGORIAS_ARBITRAGEM[modalidade]) {
        throw new Error('Seleciona Futebol ou Futsal.');
    }

    if (!CATEGORIAS_ARBITRAGEM[modalidade].includes(categoria)) {
        throw new Error('Seleciona uma categoria válida para a modalidade.');
    }

    if (!associacao) {
        throw new Error('Seleciona uma Associação de Futebol.');
    }

    const { data, error } = await client.rpc('atualizar_dados_arbitragem_socio', {
        p_numero_arbitro: numeroArbitro || null,
        p_associacao_futebol: associacao,
        p_modalidade: modalidade,
        p_categoria: categoria
    });

    if (error) throw error;

    return data;
}
