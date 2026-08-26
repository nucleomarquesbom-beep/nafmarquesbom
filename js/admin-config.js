/* NAF Marques Bom — configuração pública da administração.
 * Mantém a configuração existente e carrega a camada de correções finais.
 */
window.NAF_ADMIN_CONFIG = {
  SUPABASE_URL: "https://pvaupgdhtrmbumaxvvrj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi",
  EMAIL_FUNCTION: "admin-mail",
  RECEIPT_FUNCTION: "emitir-recibo-quota"
};

(() => {
  const loadFinalFixes = () => {
    if (document.querySelector('script[data-naf-final-fixes]')) return;
    const script = document.createElement('script');
    script.src = 'js/admin-final-fixes-20260826.js?v=20260826-2';
    script.dataset.nafFinalFixes = '1';
    document.head.appendChild(script);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFinalFixes, { once: true });
  } else {
    loadFinalFixes();
  }
})();
