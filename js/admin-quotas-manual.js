(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const sb = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  function show(message, type = "success") {
    const el = $("manual-quota-result");
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  async function loadSocios() {
    const client = sb(), select = $("manual-quota-socio");
    if (!client || !select) return;

    const { data, error } = await client
      .from("socios")
      .select("id,numero_socio,nome,email,ativo")
      .eq("ativo", true)
      .order("numero_socio", { ascending: true });

    if (error) throw error;

    select.replaceChildren();
    for (const socio of data || []) {
      const option = document.createElement("option");
      option.value = socio.id;
      option.textContent =
        `${socio.numero_socio} — ${socio.nome}${socio.email ? ` — ${socio.email}` : ""}`;
      select.appendChild(option);
    }

    if (!select.options.length) {
      select.innerHTML = '<option value="">Nenhum sócio ativo</option>';
    }
  }

  async function emitirRecibo() {
    const client = sb();
    if (!client) throw new Error("Ligação ao Supabase indisponível.");

    const socio_id = $("manual-quota-socio")?.value;
    const valor = Number($("manual-quota-valor")?.value);
    const metodo = $("manual-quota-metodo")?.value;

    if (!socio_id) throw new Error("Seleciona um sócio.");
    if (!Number.isFinite(valor) || valor <= 0)
      throw new Error("Indica um montante válido.");
    if (Math.round(valor * 100) % 1200 !== 0)
      throw new Error("O montante deve ser múltiplo de 12,00 €.");

    const button = $("btn-manual-quota");
    if (button) {
      button.disabled = true;
      button.textContent = "A emitir recibo…";
    }

    try {
      const { data, error } = await client.functions.invoke(
        "emitir-recibo-quota",
        { body: { socio_id, valor, metodo } }
      );

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível emitir o recibo.");

      show(
        `Recibo nº ${data.numero_recibo} emitido. ` +
        "O PDF foi enviado ao sócio e ao Núcleo em CC."
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Registar pagamento e enviar recibo";
      }
    }
  }

  function init() {
    const button = $("btn-manual-quota");
    if (!button) return;

    button.addEventListener("click", () => {
      emitirRecibo().catch(error => {
        console.error(error);
        show(error?.message || String(error), "error");
      });
    });

    loadSocios().catch(error => {
      console.error(error);
      show(error?.message || String(error), "error");
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else
    init();
})();
