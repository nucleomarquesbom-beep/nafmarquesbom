/*
 * Copia este ficheiro para js/admin-config.js e preenche apenas os valores
 * da instalação Supabase. Nunca coloques aqui service_role_key, SMTP password
 * ou qualquer segredo.
 */
window.NAF_ADMIN_CONFIG = {
  SUPABASE_URL: "https://TEU-PROJETO.supabase.co",
  SUPABASE_ANON_KEY: "A_TUA_ANON_KEY",

  // Edge Functions existentes. Mantém os nomes que já tens no teu projeto
  // ou altera estes dois valores.
  EMAIL_FUNCTION: "admin-email",
  ADMIN_FUNCTION: "admin-members",

  // Opcional: RPC existente para retirar pontos.
  REMOVE_POINTS_RPC: "retirar_pontos_funlearn"
};
