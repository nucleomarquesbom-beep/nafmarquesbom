/* Quotas Excel — integrado na Área do Administrador */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const client=()=>window.__NAF_SUPABASE;
  let rows=[];

  const xlsx=async()=>{if(window.XLSX)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('Não foi possível carregar o leitor de Excel.'));document.head.appendChild(s);});};

  function panel(){
    if(!$('admin-panel')||$('admin-excel-final-panel'))return;
    const p=document.createElement('div');p.id='admin-excel-final-panel';p.className='admin-subpanel';
    p.innerHTML=`<h3>Quotas em dívida — Excel</h3>
      <p>Quota anual: 12 €. O valor importado tem de ser múltiplo de 12 €.</p>
      <label>Ficheiro Excel <input id="quota-excel-file" type="file" accept=".xlsx,.xls"></label>
      <div class="admin-selection-bar">
        <button id="btn-quota-excel-preview" class="admin-small-btn" type="button">Validar Excel</button>
        <button id="btn-quota-excel-import" class="admin-small-btn" type="button" disabled>Importar dívida</button>
        <button id="btn-quota-excel-export" class="admin-small-btn" type="button">Exportar quotas em dívida</button>
      </div>
      <div id="quota-excel-summary" class="admin-selected-count"></div>
      <div id="quota-excel-preview" class="admin-preview"></div>
      <div id="quota-excel-result" class="admin-result" hidden></div>`;
    $('admin-panel').appendChild(p);
    $('btn-quota-excel-preview').onclick=()=>preview().catch(e=>result(e.message,'erro'));
    $('btn-quota-excel-import').onclick=()=>doImport().catch(e=>result(e.message,'erro'));
    $('btn-quota-excel-export').onclick=()=>doExport().catch(e=>result(e.message,'erro'));
  }
  function result(t,type='sucesso'){const e=$('quota-excel-result');if(e){e.textContent=t;e.className=`admin-result ${type}`;e.hidden=false;}}
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function head(h,aliases){const n=h.map(norm);for(const a of aliases){const i=n.indexOf(norm(a));if(i>=0)return h[i]}return null}
  async function preview(){
    const f=$('quota-excel-file')?.files?.[0];if(!f)throw new Error('Seleciona um ficheiro Excel.');
    await xlsx();
    const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]};
    const data=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});if(!data.length)throw new Error('A primeira folha está vazia.');
    const h=Object.keys(data[0]), hn=head(h,['Nº Sócio','Nº Socio','Número Sócio','Numero Socio']), ho=head(h,['Nome']), hv=head(h,['Valor em dívida total','Valor Divida Total','Valor em divida total']);
    if(!hn||!ho||!hv)throw new Error('O Excel precisa das colunas Nº Sócio, Nome e Valor em dívida total.');
    const errors=[];rows=data.map((r,i)=>{const n=Number(String(r[hn]).trim()),nome=String(r[ho]).trim(),v=Number(String(r[hv]).trim().replace(/\s/g,'').replace(',','.'));if(!Number.isInteger(n)||n<=0)errors.push(`Linha ${i+2}: nº inválido`);if(!nome)errors.push(`Linha ${i+2}: nome vazio`);if(!Number.isFinite(v)||v<=0||Math.abs(v%12)>1e-6)errors.push(`Linha ${i+2}: valor tem de ser múltiplo de 12 €`);return {numero_socio:n,nome,valor_divida:v}}).filter(r=>r.numero_socio&&r.nome&&r.valor_divida>0&&Math.abs(r.valor_divida%12)<1e-6);
    $('quota-excel-summary').textContent=`${data.length} linhas • ${rows.length} válidas • ${errors.length} erros`;
    $('quota-excel-preview').innerHTML=rows.slice(0,100).map(r=>`<div>${r.numero_socio} — ${r.nome} — ${r.valor_divida.toFixed(2)} €</div>`).join('')+errors.map(e=>`<div>ERRO: ${e}</div>`).join('');
    $('btn-quota-excel-import').disabled=!!errors.length||!rows.length;
    if(errors.length)throw new Error('Corrige os erros indicados antes de importar.');
    result('Excel validado.');
  }
  async function doImport(){
    const c=client();if(!c)throw new Error('Supabase indisponível.');
    const {data,error}=await c.rpc('admin_importar_divida_anual_excel',{p_rows:rows,p_ano_inicial:new Date().getFullYear()});if(error)throw error;
    result(`Importação concluída: ${data.quotas_geradas} quotas processadas.`);
    rows=[];
  }
  async function doExport(){
    const c=client();if(!c)throw new Error('Supabase indisponível.');
    await xlsx();const {data,error}=await c.rpc('admin_exportar_divida_anual_excel',{p_ano_inicial:new Date().getFullYear()});if(error)throw error;
    const rows=(data||[]).map(r=>({'Nº Sócio':r.numero_socio,'Nome':r.nome,'Valor em dívida total':Number(r.valor_divida_total||0)}));
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Quotas em dívida');XLSX.writeFile(wb,'quotas-em-divida.xlsx');result(`Exportação concluída: ${rows.length} sócio(s).`);
  }
  const boot=()=>{panel();const a=$('admin-panel');if(a)new MutationObserver(panel).observe(a,{attributes:true,attributeFilter:['hidden']})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',boot,{once:true}):boot();
})();