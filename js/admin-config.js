/* Configuração apenas. Não carrega fixes dinamicamente. */
(() => {
  const cfg = window.NAF_ADMIN_CONFIG || {};
  const meta = document.querySelector('meta[name="naf-supabase"]');
  const url = meta?.dataset?.url || cfg.SUPABASE_URL || '';
  const key = meta?.dataset?.anonKey || cfg.SUPABASE_ANON_KEY || '';
  window.NAF_ADMIN_CONFIG = {
    ...cfg,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: key,
    EMAIL_FUNCTION: cfg.EMAIL_FUNCTION || 'send-email'
  };
})();