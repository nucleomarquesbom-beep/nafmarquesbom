/* Configuração pública do Supabase para a área administrativa. */
window.NAF_ADMIN_CONFIG = {
  SUPABASE_URL: "https://pvaupgdhtrmbumaxvvrj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi",
  EMAIL_FUNCTION: "admin-mail",
  ADMIN_FUNCTION: "admin-members",
  REMOVE_POINTS_RPC: "retirar_pontos_funlearn"
};

/* Carrega o módulo Drº Árbitro sem alterar o HTML da administração. */
(function () {
  if (window.__drArbitroLoaded) return;
  window.__drArbitroLoaded = true;
  const script = document.createElement('script');
  script.src = 'js/dr-arbitro.js?v=20260812-1';
  script.defer = true;
  document.head.appendChild(script);
})();
