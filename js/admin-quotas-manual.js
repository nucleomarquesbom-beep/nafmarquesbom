(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  function asMessage(value, fallback = 'Ocorreu um erro.') {
    if (value == null) return fallback;
    if (typeof value === 'string') return value;
    if (value?.message && typeof value.message === 'string') return value.message;
    if (value?.error && typeof value.error === 'string') return value.error;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return fallback;
    }
  }

  function show(message, type = 'success') {
    const el = $('manual-quota-result');
    if (!el) return;
    el.textContent = asMessage(message);
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  async function load() {
    const client = getClient();
    const select = $('manual-quota-socio');
    if (!client || !select) return;

    const { data, error } = await client
      .from('socios')
      .select('id,numero_socio,nome,email')
      .eq('ativo', true)
      .order('numero_socio', { ascending: true });

    if (error) throw error;

    const options = (data || []).map(member => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = `${member.numero_socio} — ${member.nome}${member.email ? ` — ${member.email}` : ''}`;
      return option;
    });

    select.replaceChildren(...options);

    if (!select.options.length) {
      select.innerHTML = '<option value="">Nenhum sócio ativo</option>';
    }
  }

  async function emit() {
    const client = getClient();
    if (!client) throw new Error('Ligação ao Supabase indisponível.');

    const socioId = $('manual-quota-socio')?.value || '';
    const valor = Number($('manual-quota-valor')?.value);
    const metodo = $('manual-quota-metodo')?.value || 'transferencia';

    if (!socioId) throw new Error('Seleciona um sócio.');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Indica um montante válido.');

    const button = $('btn-manual-quota');
    if (button) {
      button.disabled = true;
      button.textContent = 'A emitir recibo…';
    }

    try {
      const { data, error } = await client.functions.invoke('emitir-recibo-quota', {
        body: {
          socio_id: socioId,
          valor: Number(valor.toFixed(2)),
          metodo
        }
      });

      if (error) {
        let message = error.message || 'Não foi possível emitir o recibo.';
        try {
          const body = await error.context?.json();
          message = asMessage(body?.error || body?.message || message, message);
        } catch (_) {}
        throw new Error(message);
      }

      if (!data?.ok) {
        throw new Error(asMessage(data?.error || data?.message, 'Não foi possível emitir o recibo.'));
      }

      const numero = data.numero_recibo || data.recibo?.numero_recibo || data.recibo_id || '';
      show(numero
        ? `Recibo nº ${numero} emitido e enviado ao sócio com o Núcleo em CC.`
        : 'Pagamento registado e recibo enviado ao sócio com o Núcleo em CC.');

      if (typeof window.loadMembers === 'function') {
        await window.loadMembers();
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Registar pagamento e enviar recibo';
      }
    }
  }

  window.selectManualQuotaSocio = (id) => {
    const select = $('manual-quota-socio');
    if (!select) return;
    select.value = String(id);
  };

  function init() {
    const button = $('btn-manual-quota');
    if (!button || button.dataset.manualQuotaReady === '1') return;
    button.dataset.manualQuotaReady = '1';

    button.addEventListener('click', () => {
      emit().catch(error => {
        console.error('[QUOTAS MANUAIS]', error);
        show(asMessage(error, 'Não foi possível registar o pagamento.'), 'error');
      });
    });

    load().catch(error => {
      console.error('[QUOTAS MANUAIS] carregamento:', error);
      show(asMessage(error, 'Não foi possível carregar a lista de sócios.'), 'error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
