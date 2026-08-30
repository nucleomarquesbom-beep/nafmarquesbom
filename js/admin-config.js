/* Configuração pública da aplicação. Nunca colocar service_role/secret keys aqui. */
(() => {
  'use strict';
  const current = window.NAF_ADMIN_CONFIG || {};
  const meta = document.querySelector('meta[name="naf-supabase"]');
  window.NAF_ADMIN_CONFIG = {
    ...current,
    SUPABASE_URL: meta?.dataset?.url || current.SUPABASE_URL || 'https://pvaupgdhtrmbumaxvvrj.supabase.co',
    SUPABASE_ANON_KEY: meta?.dataset?.anonKey || current.SUPABASE_ANON_KEY || 'sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi',
    EMAIL_FUNCTION: current.EMAIL_FUNCTION || 'admin-mail',
    ADMIN_FUNCTION: current.ADMIN_FUNCTION || 'admin-members',
    REMOVE_POINTS_RPC: current.REMOVE_POINTS_RPC || 'retirar_pontos_funlearn'
  };
  window.NAF_ADMIN_CONFIG_READY = true;
})();
