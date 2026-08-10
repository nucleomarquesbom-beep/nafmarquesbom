(() => {
"use strict";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

let validRows = [];

function show(message, type="success") {
  const el = $("admin-result");
  if (!el) return;
  el.textContent = message;
  el.className = `admin-result ${type}`;
  el.hidden = false;
}

function col(headers, aliases) {
  const norm = x => String(x ?? "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9]/g,"");
  const hs = headers.map(norm);
  for (const a of aliases) {
    const i = hs.indexOf(norm(a));
    if (i >= 0) return headers[i];
  }
  return null;
}

function month(v) {
  const s = String(v ?? "").trim().toLowerCase();
  const names = {
    janeiro:1,jan:1,fevereiro:2,fev:2,marco:3,"março":3,mar:3,
    abril:4,abr:4,maio:5,mai:5,junho:6,jun:6,julho:7,jul:7,
    agosto:8,ago:8,setembro:9,set:9,outubro:10,out:10,
    novembro:11,nov:11,dezembro:12,dez:12
  };
  return names[s] || Number(s);
}

function state(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["paga","pago","paid","regularizada","regularizado"].includes(s)) return "paga";
  if (["em_atraso","atrasada","atrasado","em atraso","unpaid","pending"].includes(s)) return "em_atraso";
  return s;
}

async function loadXLSX() {
  if (window.XLSX) return;
  await new Promise((resolve,reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Não foi possível carregar o leitor de Excel."));
    document.head.appendChild(s);
  });
}

function addUI() {
  if ($("admin-excel-panel")) return;
  const tabs = document.querySelector(".admin-tabs");
  const quotas = $("panel-quotas");
  const app = $("admin-app");
  if (!tabs || !quotas || !app) return;

  const tab = document.createElement("button");
  tab.className = "admin-tab";
  tab.dataset.panel = "excel";
  tab.textContent = "Importar Excel";

  const emailTab = [...tabs.children].find(x => x.dataset.panel === "email");
  tabs.insertBefore(tab, emailTab || null);

  const panel = document.createElement("section");
  panel.id = "panel-excel";
  panel.className = "admin-tab-panel";
  panel.innerHTML = `
    <div class="admin-card" id="admin-excel-panel">
      <h3>Importar quotas a partir de Excel</h3>
      <p class="admin-help">Carrega um Excel com Nº Sócio, Ano, Mês e Estado. Os dados são validados antes da importação.</p>
      <div class="admin-file">
        <label>Ficheiro Excel
          <input id="excel-file" type="file" accept=".xlsx,.xls">
        </label>
        <p class="admin-import-note">Formato esperado: Nº Sócio, Ano, Mês, Estado.</p>
      </div>
      <div class="admin-actions">
        <button id="btn-excel-preview" type="button" class="admin-small-btn primary">Validar Excel</button>
        <button id="btn-excel-import" type="button" class="admin-small-btn" disabled>Confirmar importação</button>
      </div>
      <div id="excel-summary" class="admin-selected-count"></div>
      <div id="excel-preview" class="admin-preview"></div>
    </div>`;

  quotas.insertAdjacentElement("afterend", panel);

  tab.onclick = () => {
    document.querySelectorAll(".admin-tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".admin-tab-panel").forEach(x => x.classList.remove("active"));
    tab.classList.add("active");
    panel.classList.add("active");
  };

  $("btn-excel-preview").onclick = preview;
  $("btn-excel-import").onclick = importRows;
}

async function preview() {
  try {
    const file = $("excel-file")?.files?.[0];
    if (!file) throw new Error("Seleciona um ficheiro Excel.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("O ficheiro tem de ser .xlsx ou .xls.");
    if (file.size > 10*1024*1024) throw new Error("O Excel não pode ultrapassar 10 MB.");

    await loadXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), {type:"array"});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {defval:"", raw:false});
    if (!rows.length) throw new Error("A primeira folha está vazia.");

    const headers = Object.keys(rows[0]);
    const cs = col(headers, ["nº sócio","nº socio","numero socio","numero_socio","numero","socio"]);
    const ca = col(headers, ["ano","year"]);
    const cm = col(headers, ["mês","mes","month"]);
    const ce = col(headers, ["estado","status","situacao","situação"]);
    if (!cs || !ca || !cm || !ce) throw new Error("O Excel precisa das colunas Nº Sócio, Ano, Mês e Estado.");

    const errors = [];
    validRows = [];

    rows.forEach((r,i) => {
      const line = i+2;
      const numero = Number(r[cs]);
      const ano = Number(r[ca]);
      const mes = Number(month(r[cm]));
      const st = state(r[ce]);

      if (!Number.isInteger(numero) || numero <= 0) return errors.push(`Linha ${line}: Nº Sócio inválido.`);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return errors.push(`Linha ${line}: ano inválido.`);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) return errors.push(`Linha ${line}: mês inválido.`);
      if (!["paga","em_atraso"].includes(st)) return errors.push(`Linha ${line}: estado inválido.`);

      validRows.push({numero_socio:numero, ano, mes, estado:st});
    });

    $("excel-summary").textContent = `${rows.length} linhas • ${validRows.length} válidas • ${errors.length} erros`;
    $("excel-preview").innerHTML = [
      ...validRows.slice(0,100).map((r,i)=>`<div class="admin-preview-row"><span>${i+2}</span><strong>${esc(r.numero_socio)}</strong><span>${r.ano}</span><span>${r.mes}</span><span>${esc(r.estado)}</span></div>`),
      ...errors.slice(0,50).map(e=>`<div class="admin-preview-row"><span>ERRO</span><span>${esc(e)}</span></div>`)
    ].join("") || `<div class="admin-loading">Nenhum registo válido.</div>`;

    $("btn-excel-import").disabled = validRows.length === 0 || errors.length > 0;
    if (errors.length) throw new Error("Corrige os erros do Excel antes de confirmar.");
    show("Excel validado. Podes confirmar a importação.");
  } catch(e) {
    console.error(e);
    show(e.message || String(e), "error");
  }
}

async function importRows() {
  try {
    if (!validRows.length) throw new Error("Valida primeiro o Excel.");

    const supa = window.supabaseClient || window.__NAF_SUPABASE;
    if (!supa?.functions) throw new Error("Cliente Supabase não encontrado.");

    const {data,error} = await supa.functions.invoke("importar-quotas", {
      body:{rows:validRows}
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    show(`Importação concluída: ${data?.imported ?? validRows.length} registos.`);
    $("btn-excel-import").disabled = true;
    validRows = [];
  } catch(e) {
    console.error(e);
    show(e.message || String(e), "error");
  }
}

function boot() {
  addUI();
  const app = $("admin-app");
  if (app && app.hidden) {
    const obs = new MutationObserver(() => {
      if (!app.hidden) { addUI(); obs.disconnect(); }
    });
    obs.observe(app,{attributes:true,attributeFilter:["hidden"]});
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot);
else boot();
})();