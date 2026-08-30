(() => {
  "use strict";

  const cfg = window.NAF_ADMIN_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;

  const $ = (id) => document.getElementById(id);

  function show(message, type="success") {
    const el = $("admin-create-socio-result");
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  async function createSocio(event) {
    event.preventDefault();

    const button = $("btn-criar-socio");
    const nome = $("novo-socio-nome")?.value.trim();
    const numero = Number($("novo-socio-numero")?.value);
    const email = $("novo-socio-email")?.value.trim().toLowerCase();
    const telemovel = $("novo-socio-telemovel")?.value.trim();

    if (!nome) return show("Indica o nome do sócio.", "error");
    if (!Number.isInteger(numero) || numero <= 0 || numero === 9999)
      return show("Indica um número de sócio válido. O 9999 está reservado.", "error");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return show("Indica um email válido.", "error");

    try {
      button.disabled = true;
      button.textContent = "A criar…";
      show("A criar a conta e a preparar o convite…", "success");

      const client = window.NAF_GET_SHARED_SUPABASE?.() || window.__NAF_SUPABASE || window.supabaseClient;
      if (!client) throw new Error("Cliente Supabase não disponível.");

      const { data: { session }, error: sessionError } =
        await client.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session) throw new Error("A sessão de administrador expirou. Volta a iniciar sessão.");

      const { data, error } = await client.functions.invoke("criar-socio", {
        body: {
          nome,
          numero_socio: numero,
          email,
          telemovel
        }
      });

      if (error) {
        let message = error.message || "Não foi possível criar o sócio.";
        if (error.context) {
          try {
            const body = await error.context.json();
            if (body?.error) message = body.error;
          } catch {}
        }
        throw new Error(message);
      }

      if (!data?.success) throw new Error(data?.error || "Não foi possível criar o sócio.");

      show(`Sócio ${numero} criado com sucesso. O email para definir a palavra-passe foi enviado para ${email}.`, "success");
      event.target.reset();

      if (typeof window.loadMembers === "function") {
        await window.loadMembers();
      } else {
        window.dispatchEvent(new CustomEvent("socio-criado"));
      }
    } catch (error) {
      console.error(error);
      show(error?.message || String(error), "error");
    } finally {
      button.disabled = false;
      button.textContent = "Criar sócio e enviar convite";
    }
  }

  function init() {
    const form = $("form-criar-socio");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", createSocio);
  }

  window.criarSocio = createSocio;
  window.initCriarSocio = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();