(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;
  const asMessage = (v, fallback='Ocorreu um erro.') => {
    if (v == null) return fallback;
    if (typeof v === 'string') return v;
    if (v?.message) return String(v.message);
    if (v?.error) return String(v.error);
    try { return JSON.stringify(v); } catch (_) { return fallback; }
  };
  const show = (message,type='success') => {
    const el=$('manual-quota-result'); if(!el) return;
    el.textContent=asMessage(message); el.className=`admin-result ${type}`; el.hidden=false;
  };
  async function load(){
    const client=getClient(), select=$('manual-quota-socio'); if(!client||!select)return;
    const {data,error}=await client.from('socios').select('id,numero_socio,nome,email').eq('ativo',true).order('numero_socio',{ascending:true});
    if(error)throw error;
    select.replaceChildren(...(data||[]).map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=`${m.numero_socio} — ${m.nome}${m.email?` — ${m.email}`:''}`;return o;}));
    if(!select.options.length)select.innerHTML='<option value="">Nenhum sócio ativo</option>';
  }
  async function emit(){
    const client=getClient(); if(!client)throw new Error('Ligação ao Supabase indisponível.');
    const socioId=$('manual-quota-socio')?.value||'', valor=Number($('manual-quota-valor')?.value), metodo=$('manual-quota-metodo')?.value||'transferencia';
    if(!socioId)throw new Error('Seleciona um sócio.');
    if(!Number.isFinite(valor)||valor<=0)throw new Error('Indica um montante válido.');
    const button=$('btn-manual-quota'); if(button){button.disabled=true;button.textContent='A emitir recibo…';}
    try{
      const {data,error}=await client.functions.invoke('emitir-recibo-quota',{body:{socio_id:socioId,valor:Number(valor.toFixed(2)),metodo}});
      if(error){let message=error.message||'Não foi possível emitir o recibo.';try{const body=await error.context?.json();message=asMessage(body?.error||body?.message||message,message);}catch(_){}throw new Error(message);}
      if(!data?.ok)throw new Error(asMessage(data?.error||data?.message,'Não foi possível emitir o recibo.'));
      const numero=data.numero_recibo||data.recibo?.numero_recibo||data.recibo_id||'';
      show(numero?`Recibo nº ${numero} emitido e enviado ao sócio com o Núcleo em CC.`:'Pagamento registado e recibo enviado ao sócio com o Núcleo em CC.');
      if(typeof window.loadMembers==='function')await window.loadMembers();
    }finally{if(button){button.disabled=false;button.textContent='Registar pagamento e enviar recibo';}}
  }
  window.selectManualQuotaSocio=id=>{const s=$('manual-quota-socio');if(s)s.value=String(id);};
  function init(){
    const b=$('btn-manual-quota');if(!b||b.dataset.manualQuotaReady==='1')return;b.dataset.manualQuotaReady='1';
    b.addEventListener('click',()=>emit().catch(e=>{console.error('[QUOTAS MANUAIS]',e);show(asMessage(e,'Não foi possível registar o pagamento.'),'error');}));
    load().catch(e=>{console.error('[QUOTAS MANUAIS] carregamento:',e);show(asMessage(e,'Não foi possível carregar a lista de sócios.'),'error');});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
