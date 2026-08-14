(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  let rowsToImport = [];
  let isReady = false;

  function show(message, type="success") {
    const el = $("admin-result");
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  function getClient() {
    return window.supabaseClient || window.__NAF_SUPABASE || null;
  }

  async function loadXLSX() {
    if (window.XLSX) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Não foi possível carregar o leitor de Excel."));
      document.head.appendChild(s);
    });
  }

  function normalizeHeader(v) {
    return String(v ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function findHeader(headers, aliases) {
    const normalized = headers.map(normalizeHeader);
    for (const alias of aliases) {
      const idx = normalized.indexOf(normalizeHeader(alias));
      if (idx >= 0) return headers[idx];
    }
    return null;
  }

  function addUI() {
    if ($("admin-excel-final-panel")) return;

    const tabs = document.querySelector(".admin-tabs");
    const quotasPanel = $("panel-quotas");
    if (!tabs || !quotasPanel) return;

    const oldTab = [...tabs.children].find(x => x.dataset.panel === "excel");
    const tab = oldTab || document.createElement("button");
    tab.className = "admin-tab";
    tab.dataset.panel = "excel";
    tab.textContent = "Quotas Excel";

    if (!oldTab) {
      const quotasTab = [...tabs.children].find(x => x.dataset.panel === "quotas");
      tabs.insertBefore(tab, quotasTab ? quotasTab.nextSibling : null);
    }

    let panel = $("panel-excel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "panel-excel";
      panel.className = "admin-tab-panel";
      panel.innerHTML = `
        <div class="admin-card" id="admin-excel-final-panel">
          <h3>Quotas em dívida — Excel</h3>
          <p class="admin-help">
            Importa apenas a dívida anual total de cada sócio. A quota anual é de
            12 €. O sistema distribui automaticamente a dívida pelos anos mais recentes.
          </p>

          <div class="admin-file">
            <label>Excel de dívida
              <input id="quota-excel-file" type="file" accept=".xlsx,.xls">
            </label>
            <p class="admin-import-note">
              Colunas: Nº Sócio, Nome, Valor em dívida total.
              O valor tem de ser múltiplo de 12 €.
            </p>
          </div>

          <div class="admin-actions">
            <button id="btn-quota-excel-preview" type="button" class="admin-small-btn primary">
              Validar Excel
            </button>
            <button id="btn-quota-excel-import" type="button" class="admin-small-btn" disabled>
              Importar dívida
            </button>
            <button id="btn-quota-excel-export" type="button" class="admin-small-btn">
              Exportar quotas em dívida
            </button>
          </div>

          <div id="quota-excel-summary" class="admin-selected-count"></div>
          <div id="quota-excel-preview" class="admin-preview"></div>
        </div>
      `;
      quotasPanel.insertAdjacentElement("afterend", panel);
    }

    tab.onclick = () => {
      document.querySelectorAll(".admin-tab").forEach(x => x.classList.remove("active"));
      document.querySelectorAll(".admin-tab-panel").forEach(x => x.classList.remove("active"));
      tab.classList.add("active");
      $("panel-excel").classList.add("active");
    };

    $("btn-quota-excel-preview").onclick = () => previewExcel().catch(showError);
    $("btn-quota-excel-import").onclick = () => importDebt().catch(showError);
    $("btn-quota-excel-export").onclick = () => exportDebt().catch(showError);

    isReady = true;
  }

  function showError(e) {
    console.error(e);
    show(e?.message || String(e), "error");
  }

  async function previewExcel() {
    const file = $("quota-excel-file")?.files?.[0];
    if (!file) throw new Error("Seleciona um ficheiro Excel.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("O ficheiro tem de ser .xlsx ou .xls.");
    if (file.size > 10 * 1024 * 1024) throw new Error("O Excel não pode ultrapassar 10 MB.");

    await loadXLSX();

    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

    if (!data.length) throw new Error("A primeira folha está vazia.");

    const headers = Object.keys(data[0]);
    const hNumero = findHeader(headers, ["Nº Sócio","Nº Socio","Numero Socio","Número Sócio","numero_socio"]);
    const hNome = findHeader(headers, ["Nome","Nome Completo","Socio"]);
    const hValor = findHeader(headers, ["Valor em dívida total","Valor Divida Total","Valor em divida total","Valor Divida","Divida Total"]);

    if (!hNumero || !hNome || !hValor) {
      throw new Error("O Excel precisa das colunas Nº Sócio, Nome e Valor em dívida total.");
    }

    rowsToImport = [];
    const errors = [];

    data.forEach((r, idx) => {
      const line = idx + 2;
      const numero = Number(String(r[hNumero] ?? "").trim());
      const nome = String(r[hNome] ?? "").trim();
      const raw = String(r[hValor] ?? "").trim().replace(/\s/g,"").replace(",", ".");
      const valor = Number(raw);

      if (!Number.isInteger(numero) || numero <= 0) {
        errors.push(`Linha ${line}: Nº Sócio inválido.`);
        return;
      }
      if (!nome) {
        errors.push(`Linha ${line}: Nome vazio.`);
        return;
      }
      if (!Number.isFinite(valor) || valor <= 0) {
        errors.push(`Linha ${line}: Valor em dívida inválido.`);
        return;
      }
      if (Math.abs(valor % 12) > 0.000001) {
        errors.push(`Linha ${line}: O valor em dívida tem de ser múltiplo de 12 €.`);
        return;
      }

      rowsToImport.push({
        numero_socio: numero,
        nome,
        valor_divida: Number(valor.toFixed(2))
      });
    });

    $("quota-excel-summary").textContent =
      `${data.length} linhas • ${rowsToImport.length} válidas • ${errors.length} erros`;

    $("quota-excel-preview").innerHTML = [
      ...rowsToImport.slice(0,100).map((r,i) => {
        const anos = Math.round(r.valor_divida / 12);
        return `<div class="admin-preview-row">
          <span>${i+2}</span>
          <strong>${esc(r.numero_socio)}</strong>
          <span>${esc(r.nome)}</span>
          <span>${esc(r.valor_divida.toFixed(2))} €</span>
          <span>${anos} ano(s)</span>
        </div>`;
      }),
      ...errors.slice(0,50).map(e => `<div class="admin-preview-row"><span>ERRO</span><span>${esc(e)}</span></div>`)
    ].join("");

    $("btn-quota-excel-import").disabled = rowsToImport.length === 0 || errors.length > 0;

    if (errors.length) {
      throw new Error("Corrige os erros indicados antes de importar.");
    }

    show("Excel validado. A dívida será distribuída começando pelo ano mais recente.");
  }

  async function importDebt() {
    const client = getClient();
    if (!client) throw new Error("Cliente Supabase não encontrado.");
    if (!rowsToImport.length) throw new Error("Valida primeiro o Excel.");

    const { data, error } = await client.rpc(
      "admin_importar_divida_anual_excel",
      {
        p_rows: rowsToImport.map(r => ({
          numero_socio: r.numero_socio,
          nome: r.nome,
          valor_divida: r.valor_divida
        })),
        p_ano_inicial: new Date().getFullYear()
      }
    );

    if (error) throw error;

    const count = Number(data?.quotas_geradas ?? 0);
    show(`Importação concluída: ${rowsToImport.length} sócio(s), ${count} quotas anuais geradas.`);
    rowsToImport = [];
    $("btn-quota-excel-import").disabled = true;
    await exportDebtPreview();
  }

  function downloadWorkbook(rows) {
    const ws = XLSX.utils.json_to_sheet(rows, {
      header: ["numero_socio","nome","valor_divida_total"]
    });

    ws["A1"] = { t:"s", v:"Nº Sócio" };
    ws["B1"] = { t:"s", v:"Nome" };
    ws["C1"] = { t:"s", v:"Valor em dívida total" };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quotas em dívida");
    XLSX.writeFile(wb, "quotas-em-divida.xlsx");
  }

  async function exportDebtPreview() {
    const client = getClient();
    if (!client) throw new Error("Cliente Supabase não encontrado.");

    const { data, error } = await client.rpc(
      "admin_exportar_divida_anual_excel",
      { p_ano_inicial: new Date().getFullYear() }
    );

    if (error) throw error;

    const rows = (data || []).map(r => ({
      numero_socio: r.numero_socio,
      nome: r.nome,
      valor_divida_total: Number(r.valor_divida_total || 0)
    }));

    downloadWorkbook(rows);
  }

  async function exportDebt() {
    await loadXLSX();
    await exportDebtPreview();
  }

  function boot() {
    addUI();
    const app = $("admin-app");
    if (app && app.hidden) {
      const obs = new MutationObserver(() => {
        if (!app.hidden) {
          addUI();
          obs.disconnect();
        }
      });
      obs.observe(app, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();