/* Configuração pública do Supabase para a área administrativa. */
window.NAF_ADMIN_CONFIG = {
  SUPABASE_URL: "https://pvaupgdhtrmbumaxvvrj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi",
  EMAIL_FUNCTION: "admin-mail",
  ADMIN_FUNCTION: "admin-members"
};

/*
 * O Drº Árbitro é carregado diretamente pelo admin.html.
 * Não criar outro <script> dinamicamente: evita dupla inicialização.
 */
