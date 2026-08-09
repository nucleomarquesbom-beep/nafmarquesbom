/*
 * NAF Marques Bom — funcionalidades administrativas
 * Integração frontend sem alterar o CSS existente.
 */
(function () {
  'use strict';

  const ADMIN_NUMERO = 9999;

  function getSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;
    throw new Error('Cliente Supabase não encontrado.');
  }

  async function getSession() {
    const sb = getSupabase();
    if (!sb.auth || !sb.auth.getSession) {
      throw new Error('Autenticação Supabase não está disponível.');
    }
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    if (!data || !data.session) throw new Error('Sessão não autenticada.');
    return data.session;
  }

  async function assertAdmin() {
    const sb = getSupabase();
    const session = await getSession();
    const user = session.user;

    // O número de sócio do administrador deve estar disponível
    // no perfil/sessão ou ser validado no backend.
    const numero = Number(
      user.user_metadata?.numero_socio ??
      user.app_metadata?.numero_socio ??
      user.user_metadata?.numero ??
      user.app_metadata?.numero
    );

    if (numero === ADMIN_NUMERO) return true;

    // Se a aplicação já tiver uma função de verificação de admin,
    // usa-a como segunda camada.
    if (typeof window.isAdmin === 'function') {
      const ok = await window.isAdmin();
      if (ok) return true;
    }

    throw new Error('Acesso reservado ao administrador.');
  }

  async function invokeAdminMail(payload) {
    const sb = getSupabase();
    await assertAdmin();

    const { data, error } = await sb.functions.invoke('admin-mail', {
      body: payload
    });

    if (error) throw error;
    return data;
  }

  async function listSocios() {
    const sb = getSupabase();
    await assertAdmin();

    const { data, error } = await sb
      .from('socios')
      .select('*')
      .order('numero_socio', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async function sendQuotasEmAtraso(socioIds) {
    if (!Array.isArray(socioIds) || socioIds.length === 0) {
      throw new Error('Selecione pelo menos um sócio.');
    }

    return invokeAdminMail({
      action: 'quotas_em_atraso',
      socio_ids: socioIds
    });
  }

  async function sendDocumentoTodos(file) {
    if (!(file instanceof File)) {
      throw new Error('Selecione um documento válido.');
    }

    const sb = getSupabase();
    await assertAdmin();

    const form = new FormData();
    form.append('action', 'documento_todos');
    form.append('documento', file);

    const session = await getSession();

    const response = await fetch(
      `${sb.supabaseUrl}/functions/v1/admin-mail`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: form
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha no envio do documento.');
    }
    return data;
  }

  async function importarPDF(file) {
    if (!(file instanceof File) || file.type !== 'application/pdf') {
      throw new Error('Selecione um ficheiro PDF.');
    }

    const sb = getSupabase();
    await assertAdmin();

    const form = new FormData();
    form.append('action', 'importar_pdf');
    form.append('pdf', file);

    const session = await getSession();

    const response = await fetch(
      `${sb.supabaseUrl}/functions/v1/admin-import-pdf`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`
        },
        body: form
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Falha na importação do PDF.');
    }
    return data;
  }

  async function retirarPontos(socioId, pontos, motivo) {
    const valor = Number(pontos);
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new Error('Indique um número de pontos superior a zero.');
    }

    if (!motivo || !String(motivo).trim()) {
      throw new Error('Indique o motivo da retirada de pontos.');
    }

    const sb = getSupabase();
    await assertAdmin();

    const { data, error } = await sb.functions.invoke('admin-funlearn', {
      body: {
        action: 'retirar_pontos',
        socio_id: socioId,
        pontos: valor,
        motivo: String(motivo).trim(),
        notificar: true
      }
    });

    if (error) throw error;
    return data;
  }

  window.NAFAdmin = {
    assertAdmin,
    listSocios,
    sendQuotasEmAtraso,
    sendDocumentoTodos,
    importarPDF,
    retirarPontos
  };
})();
