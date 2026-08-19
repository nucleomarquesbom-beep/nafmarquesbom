(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sb = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  function show(message, type = 'success') {
    const el = $('manual-quota-result');
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  async function load() {
    const client = sb();
    const select = $('manual-quota-socio');
    if (!client || !select) return;

    const { data, error } = await client
      .from('socios')
      .select('id,numero_socio,nome,email')
      .eq('ativo', true)
      .order('numero_socio');

    if (error) throw error;

    select.replaceChildren(...(data || []).map(member => {
      const option = document.createElement('option');
      option.value = member.id;
      option.textContent = `${member.numero_socio} — ${member.nome}${member.email ? ` — ${member.email}` : ''}`;
      return option;
    }));

    if (!select.options.length) {
      select.innerHTML = '<option value="">Nenhum sócio ativo</option>';
    }
  }

  async function emit() {
    const client = sb();
    if (!client) throw new Error('Ligação ao Supabase indisponível.');

    const socio_id = $('manual-quota-socio').value;
    const valor = Number($('manual-quota-valor').value);
    const metodo = $('manual-quota-metodo').value;

    if (!socio_id) throw new Error('Seleciona um sócio.');
    if (!Number.isFinite(valor) || valor <= 0) throw new Error('Indica um montante válido.');

    const button = $('btn-manual-quota');
    button.disabled = true;
    button.textContent = 'A emitir recibo…';

    try {
      const { data, error } = await client.functions.invoke('emitir-recibo-quota', {
        body: { socio_id, valor, metodo }
      });

      if (error) {
        let message = error.message || 'Não foi possível emitir o recibo.';
        try {
          const body = await error.context?.json();
          if (body?.error) message = body.error;
        } catch {}
        throw new Error(message);
      }

      if (!data?.ok) throw new Error(data?.error || 'Não foi possível emitir o recibo.');

      show(`Recibo nº ${data.numero_recibo} emitido e enviado ao sócio com o Núcleo em CC.`);

      if (typeof window.loadMembers === 'function') {
        await window.loadMembers();
      }
    } finally {
      button.disabled = false;
      button.textContent = 'Registar pagamento e enviar recibo';
    }
  }

  window.selectManualQuotaSocio = (id) => {
    const select = $('manual-quota-socio');
    if (!select) return;
    select.value = String(id);
  };

  function init() {
    const button = $('btn-manual-quota');
    if (!button) return;
    button.onclick = () => emit().catch(e => {
      console.error(e);
      show(e.message || String(e), 'error');
    });
    load().catch(e => {
      console.error(e);
      show(e.message || String(e), 'error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
