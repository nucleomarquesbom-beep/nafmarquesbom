/* Configuração pública do Supabase para a área administrativa. */
window.NAF_ADMIN_CONFIG = {
  SUPABASE_URL: "https://pvaupgdhtrmbumaxvvrj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_8pqZLxvQA5kMbYYLD95WPg_0uFK5WRi",
  EMAIL_FUNCTION: "admin-mail"
};

/*
 * Módulos administrativos adicionais.
 * Não é necessário alterar admin.html: este carregador espera
 * pela inicialização do admin.js e só depois monta o Fun&Learn.
 */
(function () {
  const load = () => {
    if (!window.__NAF_SUPABASE || !document.getElementById("admin-app")) {
      setTimeout(load, 150);
      return;
    }

    if (!window.__NAF_FUNLEARN_LOADED) {
      window.__NAF_FUNLEARN_LOADED = true;

      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "css/admin-funlearn.css?v=20260819-1";
      document.head.appendChild(css);

      const script = document.createElement("script");
      script.src = "js/admin-funlearn.js?v=20260819-1";
      script.defer = true;
      document.head.appendChild(script);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load, { once: true });
  } else {
    load();
  }
})();
