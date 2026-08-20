(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.NAF_ADMIN_CONFIG || {};
  let rows = [];

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function normalize(v) {
    return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  }
  function header(headers, aliases) {
    const map = new Map(headers.map(h => [normalize(h), h]));
    for (const a of aliases) if (map.has(normalize(a))) return map.get(normalize(a));
    return null;
  }
  function show(msg, type='success') {
    const el = $('admin-excel-socios-result');
    if (!el) return;
    el.textContent = msg;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }
  async function loadXLSX() {
    if (window.XLSX) return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload=resolve; s.onerror=()=>reject(new Error('Não foi possível carregar o leitor de Excel.')); document.head.appendChild(s);
    });
  }
  async function preview() {
    const file=$('admin-socios-excel-file')?.files?.[0];
    if(!file) throw new Error('Seleciona um ficheiro Excel.');
    await loadXLSX();
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const data=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
    if(!data.length) throw new Error('A primeira folha está vazia.');
    const headers=Object.keys(data[0]);
    const hNome=header(headers,['Nome','Nome completo','Nome Completo']);
    const hNumero=header(headers,['Nº Sócio','Nº Socio','Número Sócio','Numero Socio','numero_socio']);
    const hEmail=header(headers,['Email','E-mail','E-mail do sócio','Email do socio']);
    const hTel=header(headers,['Telemóvel','Telemovel','Telefone','Telemóvel do sócio','Telemovel do socio']);
    if(!hNome||!hNumero||!hEmail) throw new Error('O Excel precisa das colunas Nome, Nº Sócio e Email. Telemóvel é opcional.');
    const seen=new Set(); const errors=[]; rows=[];
    data.forEach((r,i)=>{
      const line=i+2, nome=String(r[hNome]??'').trim(), email=String(r[hEmail]??'').trim().toLowerCase(), telemovel=hTel?String(r[hTel]??'').trim():'';
      const numero=Number(String(r[hNumero]??'').trim());
      if(!nome) return errors.push(`Linha ${line}: Nome vazio.`);
      if(!Number.isInteger(numero)||numero<=0||numero===9999) return errors.push(`Linha ${line}: Nº Sócio inválido ou reservado.`);
      if(!/^\S+@\S+\.\S+$/.test(email)) return errors.push(`Linha ${line}: Email inválido.`);
      if(seen.has(String(numero))) return errors.push(`Linha ${line}: Nº Sócio ${numero} repetido no ficheiro.`);
      seen.add(String(numero)); rows.push({nome,numero_socio:numero,email,telemovel});
    });
    $('admin-excel-socios-summary').textContent=`${data.length} linhas · ${rows.length} válidas · ${errors.length} erros`;
    $('admin-excel-socios-preview').innerHTML=[
      ...rows.slice(0,100).map(r=>`<div class="admin-excel-preview-row"><strong>${esc(r.numero_socio)}</strong><span>${esc(r.nome)}</span><span>${esc(r.email)}</span><span>${esc(r.telemovel||'—')}</span></div>`),
      ...errors.slice(0,50).map(e=>`<div class="admin-excel-preview-row admin-excel-error"><strong>ERRO</strong><span>${esc(e)}</span></div>`)
    ].join('') || '<div class="admin-loading">Sem dados.</div>';
    $('admin-excel-socios-import').disabled=rows.length===0||errors.length>0;
    if(errors.length) throw new Error('Corrige os erros indicados antes de importar.');
    show('Excel validado. Pode iniciar a importação.');
  }
  async function importRows() {
    if(!rows.length) throw new Error('Valida primeiro o Excel.');
    const sb=window.__NAF_SUPABASE || window.supabaseClient;
    if(!sb) throw new Error('Ligação ao Supabase indisponível.');
    const btn=$('admin-excel-socios-import'); btn.disabled=true; btn.textContent='A importar…';
    let ok=0, fail=0; const failures=[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i];
      try{
        const {data,error}=await sb.functions.invoke('criar-socio',{body:r});
        if(error){let m=error.message||'Erro';try{const b=await error.context?.json();if(b?.error)m=b.error;}catch{}throw new Error(m);}
        if(data?.error) throw new Error(data.error);
        ok++;
      }catch(e){fail++; failures.push(`${r.numero_socio} — ${r.nome}: ${e.message||e}`);}
      $('admin-excel-socios-progress').value=Math.round(((i+1)/rows.length)*100);
      $('admin-excel-socios-status').textContent=`${i+1}/${rows.length} processados`;
    }
    rows=[]; btn.disabled=true; btn.textContent='Importar sócios'; $('admin-socios-excel-file').value='';
    if(typeof window.loadMembers==='function') await window.loadMembers();
    if(typeof window.loadAdminSocios==='function') await window.loadAdminSocios();
    const detail=failures.length?` Falharam ${fail}: ${failures.slice(0,8).join(' | ')}`:'';
    show(`Importação concluída: ${ok} criado(s), ${fail} com erro.${detail}`, fail?'error':'success');
  }
  function init(){
    if(!$('admin-socios-excel-panel')||$('admin-socios-excel-panel').dataset.bound==='1') return;
    $('admin-socios-excel-panel').dataset.bound='1';
    $('admin-socios-excel-preview-btn')?.addEventListener('click',()=>preview().catch(e=>show(e.message,'error')));
    $('admin-excel-socios-import')?.addEventListener('click',()=>importRows().catch(e=>show(e.message,'error')));
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
