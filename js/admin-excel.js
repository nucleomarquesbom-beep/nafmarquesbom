/* Quotas Excel — importação de dívida anual e exportação */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  let rowsToImport=[];

  function client(){return window.supabaseClient||window.__NAF_SUPABASE||null}
  function msg(t,type="success"){const e=$("quota-excel-result");if(e){e.textContent=t;e.className=`admin-result ${type}`;e.hidden=false;}else console.log(t)}
  async function xlsx(){if(window.XLSX)return;await new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";s.onload=ok;s.onerror=()=>no(new Error("Não foi possível carregar o leitor de Excel."));document.head.appendChild(s)})}
  const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  function hdr(h,a){const n=h.map(norm);for(const x of a){const i=n.indexOf(norm(x));if(i>=0)return h[i]}return null}

  function panel(){
    if($("admin-excel-final-panel")||!$("admin-panel"))return;
    const p=document.createElement("div");p.id="admin-excel-final-panel";p.className="admin-subpanel";
    p.innerHTML=`<h3>Quotas em dívida — Excel</h3>
    <p>Importa a dívida anual acumulada. A quota anual é de 12 € e a dívida é distribuída pelos anos mais recentes.</p>
    <label>Excel de dívida <input id="quota-excel-file" type="file" accept=".xlsx,.xls"></label>
    <p>Colunas: Nº Sócio, Nome, Valor em dívida total. O valor tem de ser múltiplo de 12 €.</p>
    <div class="admin-selection-bar">
      <button id="btn-quota-excel-preview" class="admin-small-btn" type="button">Validar Excel</button>
      <button id="btn-quota-excel-import" class="admin-small-btn" type="button" disabled>Importar dívida</button>
      <button id="btn-quota-excel-export" class="admin-small-btn" type="button">Exportar quotas em dívida</button>
    </div>
    <div id="quota-excel-summary" class="admin-selected-count"></div>
    <div id="quota-excel-preview" class="admin-preview"></div>
    <div id="quota-excel-result" class="admin-result" hidden></div>`;
    $("admin-panel").appendChild(p);
    $("btn-quota-excel-preview").onclick=()=>preview().catch(e=>msg(e.message,"error"));
    $("btn-quota-excel-import").onclick=()=>importDebt().catch(e=>msg(e.message,"error"));
    $("btn-quota-excel-export").onclick=()=>exportDebt().catch(e=>msg(e.message,"error"));
  }

  async function preview(){
    const f=$("quota-excel-file")?.files?.[0];if(!f)throw new Error("Seleciona um ficheiro Excel.");
    await xlsx();const wb=XLSX.read(await f.arrayBuffer(),{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]};
    const data=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});if(!data.length)throw new Error("A primeira folha está vazia.");
    const h=Object.keys(data[0]),hn=hdr(h,["Nº Sócio","Nº Socio","Numero Socio","Número Sócio","numero_socio"]),ho=hdr(h,["Nome","Nome Completo"]),hv=hdr(h,["Valor em dívida total","Valor Divida Total","Valor em divida total","Valor Divida","Divida Total"]);
    if(!hn||!ho||!hv)throw new Error("O Excel precisa das colunas Nº Sócio, Nome e Valor em dívida total.");
    rowsToImport=[];const er=[];
    data.forEach((r,i)=>{const l=i+2,n=Number(String(r[hn]??"").trim()),nome=String(r[ho]??"").trim(),v=Number(String(r[hv]??"").trim().replace(/\s/g,"").replace(",","."));if(!Number.isInteger(n)||n<=0)return er.push(`Linha ${l}: Nº Sócio inválido.`);if(!nome)return er.push(`Linha ${l}: Nome vazio.`);if(!Number.isFinite(v)||v<=0)return er.push(`Linha ${l}: Valor inválido.`);if(Math.abs(v%12)>1e-6)return er.push(`Linha ${l}: O valor tem de ser múltiplo de 12 €.`);rowsToImport.push({numero_socio:n,nome,valor_divida:Number(v.toFixed(2))})});
    $("quota-excel-summary").textContent=`${data.length} linhas • ${rowsToImport.length} válidas • ${er.length} erros`;
    $("quota-excel-preview").innerHTML=rowsToImport.slice(0,100).map(r=>`<div class="admin-preview-row"><strong>${esc(r.numero_socio)}</strong><span>${esc(r.nome)}</span><span>${r.valor_divida.toFixed(2)} €</span><span>${Math.round(r.valor_divida/12)} ano(s)</span></div>`).join("")+er.map(e=>`<div class="admin-preview-row"><span>ERRO</span><span>${esc(e)}</span></div>`).join("");
    $("btn-quota-excel-import").disabled=!rowsToImport.length||!!er.length;if(er.length)throw new Error("Corrige os erros indicados antes de importar.");msg("Excel validado.");
  }

  async function importDebt(){
    const c=client();if(!c)throw new Error("Cliente Supabase não encontrado.");if(!rowsToImport.length)throw new Error("Valida primeiro o Excel.");
    const {data,error}=await c.rpc("admin_importar_divida_anual_excel",{p_rows:rowsToImport,p_ano_inicial:new Date().getFullYear()});if(error)throw error;
    msg(`Importação concluída: ${data.linhas_excel} sócio(s), ${data.quotas_geradas} quotas anuais atualizadas/criadas.`);rowsToImport=[];$("btn-quota-excel-import").disabled=true;
  }

  async function exportDebt(){
    const c=client();if(!c)throw new Error("Cliente Supabase não encontrado.");await xlsx();
    const {data,error}=await c.rpc("admin_exportar_divida_anual_excel",{p_ano_inicial:new Date().getFullYear()});if(error)throw error;
    const rows=(data||[]).map(r=>({"Nº Sócio":r.numero_socio,"Nome":r.nome,"Valor em dívida total":Number(r.valor_divida_total||0)}));
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Quotas em dívida");XLSX.writeFile(wb,"quotas-em-divida.xlsx");msg(`Exportação concluída: ${rows.length} sócio(s).`);
  }

  function boot(){panel();const a=$("admin-panel");if(a)new MutationObserver(panel).observe(a,{attributes:true,attributeFilter:["hidden"]})}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();