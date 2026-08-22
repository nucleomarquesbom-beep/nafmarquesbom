/* NAF — Quotas por Excel / correções cirúrgicas 2026-08-22 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let rows = [];

  function show(message, type='sucesso') {
    const box = $('quota-excel-result');
    if (!box) return;
    box.textContent = message;
    box.className = `admin-result ${type}`;
    box.hidden = false;
  }

  async function loadXLSX() {
    if (window.XLSX) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Não foi possível carregar o leitor de Excel.'));
      document.head.appendChild(script);
    });
  }

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  function findHeader(headers, aliases) {
    const normalized = headers.map(normalize);
    for (const alias of aliases) {
      const index = normalized.indexOf(normalize(alias));
      if (index >= 0) return headers[index];
    }
    return null;
  }

  async function preview() {
    const file = $('quota-excel-file')?.files?.[0];
    if (!file) throw new Error('Seleciona um ficheiro Excel.');

    await loadXLSX();

    const workbook = XLSX.read(await file.arrayBuffer(), { type:'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval:'', raw:false });

    if (!data.length) throw new Error('A primeira folha está vazia.');

    const headers = Object.keys(data[0]);
    const hNumero = findHeader(headers, [
      'Nº Sócio','Nº Socio','Nº de Sócio','Nº de Socio',
      'Número Sócio','Numero Socio','numero_socio'
    ]);
    const hNome = findHeader(headers, ['Nome','Nome Completo']);
    const hValor = findHeader(headers, [
      'Valor em dívida total','Valor Divida Total',
      'Valor em divida total','Valor Divida','Divida Total'
    ]);

    if (!hNumero || !hNome || !hValor) {
      throw new Error('O Excel precisa das colunas Nº Sócio, Nome e Valor em dívida total.');
    }

    rows = [];
    const errors = [];

    data.forEach((record, index) => {
      const line = index + 2;
      const numero = Number(String(record[hNumero] ?? '').trim());
      const nome = String(record[hNome] ?? '').trim();
      const valor = Number(
        String(record[hValor] ?? '')
          .trim()
          .replace(/\s/g,'')
          .replace(',','.')
      );

      if (!Number.isInteger(numero) || numero <= 0) {
        errors.push(`Linha ${line}: Nº Sócio inválido.`);
        return;
      }
      if (!nome) {
        errors.push(`Linha ${line}: Nome vazio.`);
        return;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        errors.push(`Linha ${line}: Valor em dívida inválido.`);
        return;
      }

      // Quota anual: a dívida tem de ser composta por blocos de 12 €.
      if (Math.abs(valor % 12) > 0.000001) {
        errors.push(`Linha ${line}: Valor em dívida tem de ser múltiplo de 12 €.`);
        return;
      }

      rows.push({
        numero_socio: numero,
        nome,
        valor_divida: Number(valor.toFixed(2))
      });
    });

    const summary = $('quota-excel-summary');
    if (summary) {
      summary.textContent = `${data.length} linhas · ${rows.length} válidas · ${errors.length} erros`;
    }

    const previewBox = $('quota-excel-preview');
    if (previewBox) {
      previewBox.innerHTML = [
        ...rows.slice(0,100).map(r => `
          <div class="admin-excel-preview-row">
            <strong>${r.numero_socio}</strong>
            <span>${escapeHtml(r.nome)}</span>
            <span>${r.valor_divida.toFixed(2)} €</span>
            <span>${Math.round(r.valor_divida / 12)} ano(s)</span>
          </div>`),
        ...errors.slice(0,50).map(e => `
          <div class="admin-excel-preview-row admin-excel-error">
            <strong>ERRO</strong><span>${escapeHtml(e)}</span>
          </div>`)
      ].join('');
    }

    const importButton = $('btn-quota-excel-import');
    if (importButton) importButton.disabled = rows.length === 0 || errors.length > 0;

    if (errors.length) throw new Error('Corrige os erros indicados antes de importar.');
    show('Excel validado. Pode importar a dívida.');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  async function importDebt() {
    const client = await getClient();
    if (!rows.length) throw new Error('Valida primeiro o Excel.');

    const { data, error } = await client.rpc(
      'admin_importar_divida_anual_excel',
      {
        p_rows: rows,
        p_ano_inicial: new Date().getFullYear()
      }
    );

    if (error) throw error;

    show(
      `Importação concluída: ${Number(data?.linhas_excel || rows.length)} sócio(s), ` +
      `${Number(data?.quotas_geradas || 0)} quotas anuais processadas.`
    );

    rows = [];
    if ($('btn-quota-excel-import')) $('btn-quota-excel-import').disabled = true;
    if ($('quota-excel-file')) $('quota-excel-file').value = '';

    if (typeof window.loadMembers === 'function') await window.loadMembers();
  }

  async function exportDebt() {
    const client = await getClient();
    await loadXLSX();

    const { data, error } = await client.rpc(
      'admin_exportar_divida_anual_excel',
      { p_ano_inicial:new Date().getFullYear() }
    );

    if (error) throw error;

    const out = (data || []).map(r => ({
      'Nº Sócio': r.numero_socio,
      'Nome': r.nome,
      'Valor em dívida total': Number(r.valor_divida_total || 0)
    }));

    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Quotas em dívida');
    XLSX.writeFile(wb, 'quotas-em-divida.xlsx');

    show(`Exportação concluída: ${out.length} sócio(s).`);
  }

  async function exportPaid() {
    const client = await getClient();
    await loadXLSX();

    /*
     * CORREÇÃO CRÍTICA:
     * quotas.pagamento_id não existe na tabela quotas.
     * Agrupamos diretamente por sócio + data + método.
     */
    const { data, error } = await client
      .from('quotas')
      .select(`
        socio_id,
        ano,
        mes,
        valor,
        pago,
        data_pagamento,
        metodo_pagamento,
        socios(numero_socio,nome,email)
      `)
      .eq('pago', true)
      .order('data_pagamento', { ascending:true })
      .order('socio_id', { ascending:true });

    if (error) throw error;

    const labels = {
      transferencia:'Transferência bancária',
      mbway:'MB WAY',
      numerario:'Numerário'
    };

    const grouped = new Map();

    for (const q of (data || [])) {
      const metodoKey = String(q.metodo_pagamento || '').toLowerCase();
      const key = `${q.socio_id}|${q.data_pagamento || ''}|${metodoKey}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          numero_socio:q.socios?.numero_socio ?? '',
          nome:q.socios?.nome ?? '',
          email:q.socios?.email ?? '',
          data:q.data_pagamento || '',
          metodo:labels[metodoKey] || q.metodo_pagamento || 'Não indicado',
          valor:0,
          quotas:[]
        });
      }

      const item = grouped.get(key);
      item.valor += Number(q.valor || 0);
      if (q.ano) item.quotas.push(String(q.ano));
    }

    const payments = [...grouped.values()];

    const totals = {
      'Transferência bancária': payments
        .filter(x => x.metodo === 'Transferência bancária')
        .reduce((a,x) => a + x.valor, 0),
      'MB WAY': payments
        .filter(x => x.metodo === 'MB WAY')
        .reduce((a,x) => a + x.valor, 0),
      'Numerário': payments
        .filter(x => x.metodo === 'Numerário')
        .reduce((a,x) => a + x.valor, 0)
    };

    const total = Object.values(totals).reduce((a,x) => a + x, 0);

    const output = payments.map(x => ({
      'Nº Sócio':x.numero_socio,
      'Nome':x.nome,
      'Email':x.email,
      'Data de pagamento':x.data
        ? new Date(`${x.data}T00:00:00`).toLocaleDateString('pt-PT')
        : '',
      'Método de pagamento':x.metodo,
      'Valor pago (€)':Number(x.valor.toFixed(2)),
      'Anos regularizados':[...new Set(x.quotas)].join(', ')
    }));

    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(output),
      'Quotas pagas'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Resumo de quotas pagas'],
        ['Transferência bancária (€)',Number(totals['Transferência bancária'].toFixed(2))],
        ['MB WAY (€)',Number(totals['MB WAY'].toFixed(2))],
        ['Numerário (€)',Number(totals['Numerário'].toFixed(2))],
        ['TOTAL GERAL (€)',Number(total.toFixed(2))]
      ]),
      'Totais'
    );

    XLSX.writeFile(wb, 'quotas-pagas.xlsx');
    show(
      `Exportação concluída: ${payments.length} pagamento(s). ` +
      `Total geral: ${total.toFixed(2)} €.`
    );
  }

  async function getClient() {
    if (window.__NAF_SUPABASE) return window.__NAF_SUPABASE;

    const cfg = window.NAF_ADMIN_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
      throw new Error('Configuração Supabase indisponível.');
    }

    if (!window.supabase?.createClient) {
      throw new Error('Biblioteca Supabase não carregada.');
    }

    window.__NAF_SUPABASE = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_ANON_KEY
    );

    return window.__NAF_SUPABASE;
  }

  /*
   * ----------------------------------------------------------------
   * CORREÇÃO DO BOTÃO "ADICIONAR PONTOS"
   * ----------------------------------------------------------------
   * O admin.js atual pode parar o bind numa referência nula antes de
   * chegar ao botão. Esta ligação é independente e usa os IDs reais
   * do formulário Fun&Learn.
   */
  async function addPoints() {
    const client = await getClient();

    const socioId = $('funlearn-add-member')?.value;
    const points = Number($('funlearn-add-points')?.value);
    const activity = $('funlearn-add-activity')?.value.trim() || 'Fun&Learn';
    const description = $('funlearn-add-description')?.value.trim() || '';

    if (!socioId) throw new Error('Seleciona um sócio.');
    if (!Number.isInteger(points) || points <= 0) {
      throw new Error('Os pontos têm de ser um número inteiro positivo.');
    }
    if (!description) throw new Error('Indica o motivo.');

    const button = $('btn-funlearn-add');
    if (button) {
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = 'A adicionar…';
    }

    try {
      const { data, error } = await client.rpc(
        'admin_funlearn_adicionar_pontos',
        {
          p_socio_id:socioId,
          p_pontos:points,
          p_atividade:activity,
          p_descricao:description
        }
      );

      if (error) throw error;

      let emailWarning = '';

      const cfg = window.NAF_ADMIN_CONFIG || {};
      if (cfg.EMAIL_FUNCTION) {
        try {
          const member = await client
            .from('socios')
            .select('id,numero_socio,nome,email')
            .eq('id', socioId)
            .single();

          if (member.data?.email) {
            const mail = await client.functions.invoke(
              cfg.EMAIL_FUNCTION,
              {
                body:{
                  action:'pontos_adicionados',
                  socio:{
                    id:member.data.id,
                    numero_socio:member.data.numero_socio,
                    nome:member.data.nome,
                    email:member.data.email
                  },
                  pontos_adicionados:points,
                  atividade:activity,
                  descricao:description,
                  resultado:data ?? null
                }
              }
            );
            if (mail.error || mail.data?.error) {
              emailWarning = ' Os pontos foram adicionados, mas a notificação por email não foi enviada.';
            }
          }
        } catch (_) {
          emailWarning = ' Os pontos foram adicionados, mas a notificação por email não foi enviada.';
        }
      }

      const result = $('admin-result');
      if (result) {
        result.textContent =
          `Foram adicionados ${points} ponto(s).${emailWarning}`;
        result.className = `admin-result ${emailWarning ? 'info' : 'success'}`;
        result.hidden = false;
      }

      if ($('funlearn-add-description')) $('funlearn-add-description').value = '';

      if (typeof window.loadMembers === 'function') {
        await window.loadMembers();
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Adicionar pontos';
      }
    }
  }

  /*
   * ----------------------------------------------------------------
   * QUESTÕES NA ADMINISTRAÇÃO INTEGRADA
   * ----------------------------------------------------------------
   * O socio.js carrega o admin.html dentro de #integrated-admin-host,
   * mas a versão atual não carregava admin-questoes.js. Além disso,
   * versões anteriores deixaram um cartão de questões fora da aba.
   */
  async function loadIntegratedQuestions() {
    const host = document.getElementById('integrated-admin-host');
    if (!host) return;

    try {
      await import('./admin-questoes.js?v=20260822-final2');
    } catch (error) {
      console.error('Questões da administração:', error);
    }

    dedupeIntegratedQuestions(host);
  }

  function dedupeIntegratedQuestions(host) {
    const panel = host.querySelector('#panel-questoes');
    if (!panel) return;

    const cards = [...host.querySelectorAll('#admin-questoes-card')];

    // O cartão oficial é o que está dentro da aba Questões.
    let official = panel.querySelector('#admin-questoes-card');

    if (!official && cards.length) {
      official = cards[cards.length - 1];
      panel.prepend(official);
    }

    cards.forEach(card => {
      if (card !== official) card.remove();
    });

    // Garante que o painel não fica visível fora da aba.
    panel.classList.remove('active');
    panel.hidden = true;

    const refresh = panel.querySelector('#questoes-admin-refresh');
    if (refresh && refresh.dataset.fixBound !== '1') {
      refresh.dataset.fixBound = '1';
      refresh.addEventListener('click', () => {
        window.loadAdminQuestions?.();
      });
    }

    // Se a aba integrada estiver ativa, mostrar apenas esta.
    const activeSubtab = host.querySelector(
      '.socio-admin-subtab.active[data-admin-panel="questoes"],' +
      '.socio-admin-subtab.active[data-panel="questoes"]'
    );

    if (activeSubtab) {
      panel.hidden = false;
      panel.classList.add('active');
    }
  }

  function bindIntegratedQuestionTab() {
    const host = document.getElementById('integrated-admin-host');
    if (!host || host.dataset.questionsFixBound === '1') return;

    host.dataset.questionsFixBound = '1';

    host.addEventListener('click', event => {
      const tab = event.target.closest('.socio-admin-subtab');
      if (!tab) return;

      const target =
        tab.dataset.adminPanel ||
        tab.dataset.panel ||
        tab.getAttribute('data-tab');

      if (target !== 'questoes') return;

      setTimeout(() => {
        dedupeIntegratedQuestions(host);
        loadIntegratedQuestions();
      }, 0);
    });

    loadIntegratedQuestions();
  }

  function bind() {
    const panel = $('admin-excel-panel');
    if (panel && panel.dataset.bound !== '1') {
      panel.dataset.bound = '1';

      $('btn-quota-excel-preview')?.addEventListener(
        'click',
        () => preview().catch(e => show(e.message,'erro'))
      );

      $('btn-quota-excel-import')?.addEventListener(
        'click',
        () => importDebt().catch(e => show(e.message,'erro'))
      );

      $('btn-quota-excel-export')?.addEventListener(
        'click',
        () => exportDebt().catch(e => show(e.message,'erro'))
      );

      $('btn-quota-paid-excel-export')?.addEventListener(
        'click',
        () => exportPaid().catch(e => show(e.message,'erro'))
      );
    }

    const addButton = $('btn-funlearn-add');
    if (addButton && addButton.dataset.fixBound !== '1') {
      addButton.dataset.fixBound = '1';
      addButton.addEventListener('click', () => addPoints().catch(error => {
        const result = $('admin-result');
        if (result) {
          result.textContent = error?.message || String(error);
          result.className = 'admin-result error';
          result.hidden = false;
        }
      }));
    }

    bindIntegratedQuestionTab();
  }

  window.bindAdminExcel = bind;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once:true });
  } else {
    bind();
  }

  // A administração integrada é montada dinamicamente pelo socio.js.
  // Repetimos apenas a ligação leve; não reconstruímos a página.
  const observer = new MutationObserver(() => {
    bind();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
})();
