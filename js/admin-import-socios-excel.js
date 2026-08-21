(() => {
  'use strict';

  let rows = [];
  const $ = id => document.getElementById(id);
  const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

  const aliases = {
    numero_socio:['Nº de Sócio','Nº Sócio','Nº Socio','Número Sócio','Numero Socio','numero_socio'],
    nome:['Nome Completo','Nome completo','Nome','nome'],
    nif:['NIF'],
    data_nascimento:['Data de Nascimento','Data Nascimento','Nascimento'],
    naturalidade:['Naturalidade'],
    cartao_cidadao:['Cartão de Cidadão','Cartao de Cidadao','Cartão Cidadão','CC'],
    profissao:['Profissão','Profissao'],
    morada:['Morada Completa','Morada'],
    localidade:['Localidade'],
    codigo_postal:['Código Postal','Codigo Postal','CódigoPostal'],
    telemovel:['Telemóvel','Telemovel','Telefone'],
    email:['Email','E-mail'],
    modalidade:['Modalidade'],
    categoria:['Categoria'],
    associacao_futebol:['Associação Distrital','Associacao Distrital','Associação de Futebol','Associacao Futebol']
  };

  const categorias = {
    Futebol:['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4','Observador'],
    Futsal:['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2','Observador']
  };

  function findHeader(headers, names) {
    const m = new Map(headers.map(h => [norm(h), h]));
    return names.map(norm).map(n => m.get(n)).find(Boolean) || null;
  }

  function datePT(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      const [y,m,d]=s.split('-');
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
  }

  function result(msg, type='success') {
    const el=$('admin-excel-socios-result');
    if (!el) return;
    el.textContent=msg; el.className=`admin-result ${type}`; el.hidden=false;
  }

  async function xlsx() {
    if (window.XLSX) return;
    await new Promise((ok,no)=>{
      const s=document.createElement('script');
      s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload=ok; s.onerror=()=>no(new Error('Não foi possível carregar o leitor Excel.'));
      document.head.appendChild(s);
    });
  }

  async function preview() {
    const file=$('admin-socios-excel-file')?.files?.[0];
    if(!file) throw new Error('Seleciona o ficheiro Excel.');
    await xlsx();

    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true,raw:false});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const data=XLSX.utils.sheet_to_json(ws,{defval:''});
    if(!data.length) throw new Error('A primeira folha está vazia.');

    const headers=Object.keys(data[0]);
    const h={};
    for(const k of Object.keys(aliases)) h[k]=findHeader(headers,aliases[k]);

    for(const k of ['numero_socio','nome','email','modalidade','categoria'])
      if(!h[k]) throw new Error(`Falta a coluna obrigatória: ${aliases[k][0]}.`);

    const seen=new Set(), errors=[];
    rows=[];

    data.forEach((r,i)=>{
      const line=i+2;
      const n=Number(String(r[h.numero_socio]??'').trim());
      const nome=String(r[h.nome]??'').trim();
      const email=String(r[h.email]??'').trim().toLowerCase();
      const modalidade=String(r[h.modalidade]??'').trim();
      const categoria=String(r[h.categoria]??'').trim();

      if(!nome) return errors.push(`Linha ${line}: Nome Completo vazio.`);
      if(!Number.isInteger(n)||n<=0||n===9999) return errors.push(`Linha ${line}: Nº de Sócio inválido.`);
      if(!/^\S+@\S+\.\S+$/.test(email)) return errors.push(`Linha ${line}: Email inválido.`);
      if(seen.has(String(n))) return errors.push(`Linha ${line}: Nº de Sócio ${n} repetido.`);
      if(!categorias[modalidade]) return errors.push(`Linha ${line}: Modalidade "${modalidade}" inválida.`);
      if(!categorias[modalidade].some(c=>norm(c)===norm(categoria)))
        return errors.push(`Linha ${line}: Categoria "${categoria}" inválida para ${modalidade}.`);

      const nascimento=h.data_nascimento ? datePT(r[h.data_nascimento]) : null;
      if(h.data_nascimento && r[h.data_nascimento] && !nascimento)
        return errors.push(`Linha ${line}: Data de Nascimento inválida.`);

      seen.add(String(n));
      const text=k=>h[k] ? String(r[h[k]]??'').trim() || null : null;

      rows.push({
        numero_socio:n,nome,email,telemovel:text('telemovel'),
        nif:text('nif'),data_nascimento:nascimento,naturalidade:text('naturalidade'),
        cartao_cidadao:text('cartao_cidadao'),profissao:text('profissao'),
        morada:text('morada'),localidade:text('localidade'),codigo_postal:text('codigo_postal'),
        modalidade,categoria,associacao_futebol:text('associacao_futebol')
      });
    });

    $('admin-excel-socios-summary').textContent=`${data.length} linhas · ${rows.length} válidas · ${errors.length} erros`;
    $('admin-excel-socios-preview').innerHTML=[
      ...rows.slice(0,100).map(r=>`<div class="admin-excel-preview-row"><strong>${r.numero_socio}</strong><span>${r.nome}</span><span>${r.email}</span><span>${r.modalidade} · ${r.categoria}</span></div>`),
      ...errors.slice(0,50).map(e=>`<div class="admin-excel-preview-row admin-excel-error"><strong>ERRO</strong><span>${e}</span></div>`)
    ].join('') || '<div class="admin-loading">Sem dados.</div>';

    $('admin-excel-socios-import').disabled=rows.length===0||errors.length>0;
    if(errors.length) throw new Error('Corrige os erros indicados antes de importar.');
    result('Excel validado. Pode iniciar a importação.');
  }

  async function importRows() {
    if(!rows.length) throw new Error('Valida primeiro o Excel.');
    const sb=window.__NAF_SUPABASE||window.supabaseClient;
    if(!sb) throw new Error('Ligação ao Supabase indisponível.');

    const btn=$('admin-excel-socios-import');
    btn.disabled=true; btn.textContent='A importar…';

    let ok=0,fail=0,failures=[];
    for(let i=0;i<rows.length;i++){
      try{
        const {data,error}=await sb.functions.invoke('criar-socio',{body:rows[i]});
        if(error) throw new Error(error.message||'Erro na função criar-socio.');
        if(data?.error) throw new Error(data.error);
        ok++;
      }catch(e){ fail++; failures.push(`${rows[i].numero_socio} — ${rows[i].nome}: ${e.message||e}`); }
      $('admin-excel-socios-progress').value=Math.round(((i+1)/rows.length)*100);
      $('admin-excel-socios-status').textContent=`${i+1}/${rows.length} processados`;
    }

    rows=[];
    btn.disabled=true; btn.textContent='Importar sócios';
    $('admin-socios-excel-file').value='';
    result(`Importação concluída: ${ok} criado(s), ${fail} com erro.${failures.length?' '+failures.slice(0,8).join(' | '):''}`,fail?'error':'success');
  }

  function init(){
    if(!$('admin-socios-excel-panel')||$('admin-socios-excel-panel').dataset.excelBound) return;
    $('admin-socios-excel-panel').dataset.excelBound='1';
    $('admin-excel-socios-preview-btn')?.addEventListener('click',()=>preview().catch(e=>result(e.message,'error')));
    $('admin-excel-socios-import')?.addEventListener('click',()=>importRows().catch(e=>result(e.message,'error')));
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
})();