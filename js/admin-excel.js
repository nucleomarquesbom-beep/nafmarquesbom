/* NAF — Quotas por Excel */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const getClient = () => window.__NAF_SUPABASE;
  let rows = [];

  function show(message, type='sucesso') {
    const box=$('quota-excel-result');
    if(!box)return;
    box.textContent=message;
    box.className=`admin-result ${type}`;
    box.hidden=false;
  }
  async function loadXLSX(){
    if(window.XLSX)return;
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      script.onload=resolve;
      script.onerror=()=>reject(new Error('Não foi possível carregar o leitor de Excel.'));
      document.head.appendChild(script);
    });
  }
  const normalize=value=>String(value??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function findHeader(headers,aliases){
    const normalized=headers.map(normalize);
    for(const alias of aliases){
      const index=normalized.indexOf(normalize(alias));
      if(index>=0)return headers[index];
    }
    return null;
  }
  async function preview(){
    const file=$('quota-excel-file')?.files?.[0];
    if(!file)throw new Error('Seleciona um ficheiro Excel.');
    await loadXLSX();
    const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    const data=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
    if(!data.length)throw new Error('A primeira folha está vazia.');
    const headers=Object.keys(data[0]);
    const hNumero=findHeader(headers,['Nº Sócio','Nº Socio','Número Sócio','Numero Socio','numero_socio']);
    const hNome=findHeader(headers,['Nome','Nome Completo']);
    const hValor=findHeader(headers,['Valor em dívida total','Valor Divida Total','Valor em divida total','Valor Divida','Divida Total']);
    if(!hNumero||!hNome||!hValor)throw new Error('O Excel precisa das colunas Nº Sócio, Nome e Valor em dívida total.');
    rows=[];const errors=[];
    data.forEach((record,index)=>{
      const line=index+2,numero=Number(String(record[hNumero]??'').trim()),nome=String(record[hNome]??'').trim();
      const valor=Number(String(record[hValor]??'').trim().replace(/\\s/g,'').replace(',','.'));
      if(!Number.isInteger(numero)||numero<=0){errors.push(`Linha ${line}: Nº Sócio inválido.`);return;}
      if(!nome){errors.push(`Linha ${line}: Nome vazio.`);return;}
      if(!Number.isFinite(valor)||valor<=0){errors.push(`Linha ${line}: Valor em dívida inválido.`);return;}
      if(Math.abs(valor%12)>0.000001){errors.push(`Linha ${line}: Valor em dívida tem de ser múltiplo de 12 €.`);return;}
      rows.push({numero_socio:numero,nome,valor_divida:Number(valor.toFixed(2))});
    });
    $('quota-excel-summary').textContent=`${data.length} linhas · ${rows.length} válidas · ${errors.length} erros`;
    $('quota-excel-preview').innerHTML=[
      ...rows.slice(0,100).map(r=>`<div class="admin-excel-preview-row"><strong>${r.numero_socio}</strong><span>${String(r.nome).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}</span><span>${r.valor_divida.toFixed(2)} €</span><span>${Math.round(r.valor_divida/12)} ano(s)</span></div>`),
      ...errors.slice(0,50).map(e=>`<div class="admin-excel-preview-row admin-excel-error"><strong>ERRO</strong><span>${e}</span></div>`)
    ].join('');
    $('btn-quota-excel-import').disabled=rows.length===0||errors.length>0;
    if(errors.length)throw new Error('Corrige os erros indicados antes de importar.');
    show('Excel validado. Pode importar a dívida.');
  }
  async function importDebt(){
    const client=getClient();
    if(!client)throw new Error('Ligação à BD indisponível.');
    if(!rows.length)throw new Error('Valida primeiro o Excel.');
    const {data,error}=await client.rpc('admin_importar_divida_anual_excel',{p_rows:rows,p_ano_inicial:new Date().getFullYear()});
    if(error)throw error;
    show(`Importação concluída: ${Number(data?.linhas_excel||rows.length)} sócio(s), ${Number(data?.quotas_geradas||0)} quotas anuais processadas.`);
    rows=[];$('btn-quota-excel-import').disabled=true;$('quota-excel-file').value='';
    if(typeof window.loadMembers==='function')await window.loadMembers();
  }
  async function exportDebt(){
    const client=getClient();
    if(!client)throw new Error('Ligação à BD indisponível.');
    await loadXLSX();
    const {data,error}=await client.rpc('admin_exportar_divida_anual_excel',{p_ano_inicial:new Date().getFullYear()});
    if(error)throw error;
    const out=(data||[]).map(r=>({'Nº Sócio':r.numero_socio,'Nome':r.nome,'Valor em dívida total':Number(r.valor_divida_total||0)}));
    const ws=XLSX.utils.json_to_sheet(out),wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Quotas em dívida');
    XLSX.writeFile(wb,'quotas-em-divida.xlsx');
    show(`Exportação concluída: ${out.length} sócio(s).`);
  }
  function bind(){
    const panel=$('admin-excel-panel');
    if(!panel||panel.dataset.bound==='1')return;
    panel.dataset.bound='1';
    $('btn-quota-excel-preview')?.addEventListener('click',()=>preview().catch(e=>show(e.message,'erro')));
    $('btn-quota-excel-import')?.addEventListener('click',()=>importDebt().catch(e=>show(e.message,'erro')));
    $('btn-quota-excel-export')?.addEventListener('click',()=>exportDebt().catch(e=>show(e.message,'erro')));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();