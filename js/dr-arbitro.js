/* NAF Marques Bom — Drº Árbitro
   Plain script: works in admin.html and socio.html without changing the existing
   Supabase configuration. The page must expose a Supabase client as
   window.__NAF_SUPABASE (socio.js patch below) or window.supabaseClient (admin.js).
*/
(() => {
  'use strict';

  const esc = (v='') => String(v).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const getClient = () => window.__NAF_SUPABASE || window.supabaseClient || null;
  let started = false;

  function css() {
    if (document.getElementById('naf-dr-arbitro-css')) return;
    const s=document.createElement('style'); s.id='naf-dr-arbitro-css';
    s.textContent=`
      .dr-admin-grid,.dr-tests{display:grid;gap:12px}
      .dr-modalidade{border:1px solid rgba(0,0,0,.10);border-radius:14px;padding:16px;margin-top:12px}
      .dr-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:10px}
      .dr-actions{display:flex;gap:8px;flex-wrap:wrap}.dr-muted{opacity:.7}
      .dr-question{border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:16px;margin:10px 0}
      .dr-options{display:grid;gap:8px;margin-top:10px}
      .dr-option{display:flex;gap:8px;padding:9px;border-radius:8px;background:rgba(0,0,0,.025)}
      .dr-result{padding:16px;border-radius:12px;background:rgba(0,120,70,.08);font-weight:700}
    `; document.head.appendChild(s);
  }

  async function rpc(name,args={}) {
    const c=getClient(); if(!c) throw new Error('Cliente Supabase não disponível.');
    const r=await c.rpc(name,args); if(r.error) throw r.error; return r.data;
  }

  async function getAdmin() {
    try { return (await rpc('is_admin')) === true; } catch { return false; }
  }

  async function renderAdmin() {
    const c=getClient(), f=document.getElementById('dr-futebol'), fs=document.getElementById('dr-futsal');
    if(!c || (!f && !fs) || !(await getAdmin())) return;

    const {data:mods,error:me}=await c.from('dr_arbitro_modalidades').select('*').eq('ativo',true).order('nome');
    if(me) throw me;
    for(const m of mods||[]) {
      const target=(String(m.codigo).toLowerCase()==='futsal'?fs:f);
      if(!target) continue;
      target.innerHTML='<div class="dr-muted">A carregar…</div>';
      const {data:eds,error}=await c.from('dr_arbitro_edicoes').select('*')
        .eq('modalidade_id',m.id).order('numero_edicao',{ascending:false}).order('created_at',{ascending:false});
      if(error) throw error;
      const next=(eds?.reduce((x,e)=>Math.max(x,Number(e.numero_edicao||0)),0)||0)+1;
      target.innerHTML=`
        <h4>${esc(m.nome)}</h4>
        <div class="dr-actions">
          <button type="button" class="admin-small-btn" data-dr-create="${m.id}" data-next="${next}">Criar ${next}.ª edição</button>
        </div>
        <div class="dr-admin-grid">${(eds||[]).map(e=>`
          <div class="dr-row">
            <div><strong>${esc(e.nome)}</strong>
              <div class="dr-muted">${e.ativo?'🟢 Ativa':'⚪ Inativa'} · ${e.inscricoes_abertas?'Inscrições abertas':'Inscrições fechadas'} · ${Number(e.numero_testes||0)} teste(s)</div>
            </div>
            <div class="dr-actions">
              <button type="button" class="admin-small-btn" data-dr-toggle="${e.id}" data-v="${!e.ativo}">${e.ativo?'Desativar':'Ativar'}</button>
              <button type="button" class="admin-small-btn" data-dr-ins="${e.id}" data-v="${!e.inscricoes_abertas}">${e.inscricoes_abertas?'Fechar inscrições':'Abrir inscrições'}</button>
            </div>
          </div>`).join('')}</div>`;

      target.querySelectorAll('[data-dr-create]').forEach(b=>b.onclick=async()=>{
        try {
          const n=Number(b.dataset.next);
          const {error}=await c.from('dr_arbitro_edicoes').insert({
            modalidade_id:b.dataset.drCreate, numero_edicao:n,
            nome:`Drº Árbitro - ${n}.ª Edição`, ativo:false, numero_testes:1, inscricoes_abertas:false
          });
          if(error) throw error; await renderAdmin();
        } catch(e){ alert(e.message||String(e)); }
      });
      target.querySelectorAll('[data-dr-toggle]').forEach(b=>b.onclick=async()=>{
        try { await rpc('dr_arbitro_admin_definir_ativo',{p_edicao_id:b.dataset.drToggle,p_ativo:b.dataset.v==='true'}); await renderAdmin(); }
        catch(e){ alert(e.message||String(e)); }
      });
      target.querySelectorAll('[data-dr-ins]').forEach(b=>b.onclick=async()=>{
        try { await rpc('dr_arbitro_admin_definir_inscricoes',{p_edicao_id:b.dataset.drIns,p_abertas:b.dataset.v==='true'}); await renderAdmin(); }
        catch(e){ alert(e.message||String(e)); }
      });
    }
  }

  function ensureMemberUI() {
    const tabs=document.querySelector('.socio-tabs'), dash=document.getElementById('dashboard');
    if(!tabs || !dash || document.querySelector('[data-tab="dr-arbitro"]')) return;
    const b=document.createElement('button'); b.type='button'; b.className='socio-tab'; b.dataset.tab='dr-arbitro'; b.textContent='Drº Árbitro';
    tabs.appendChild(b);
    const sec=document.createElement('section'); sec.className='socio-tab-content'; sec.id='dr-arbitro'; sec.hidden=true;
    sec.innerHTML=`<div class="tab-heading-row"><div><h2>Drº Árbitro</h2><p>Testes de conhecimentos de arbitragem.</p></div></div><div id="dr-member-content"><div class="vazio">A carregar…</div></div>`;
    const fun=document.getElementById('funlearn'); fun?.parentNode.insertBefore(sec,fun);
    b.onclick=()=>{ tabs.querySelectorAll('.socio-tab').forEach(x=>x.classList.toggle('active',x===b)); dash.querySelectorAll('.socio-tab-content').forEach(x=>x.classList.remove('active')); sec.classList.add('active'); sec.hidden=false; loadMember(); };
  }

  async function loadMember() {
    const c=getClient(), root=document.getElementById('dr-member-content'), sec=document.getElementById('dr-arbitro'), b=document.querySelector('[data-tab="dr-arbitro"]');
    if(!c||!root||!sec) return;
    try {
      const {data:e,error}=await c.from('dr_arbitro_edicoes').select('*,dr_arbitro_modalidades(nome,codigo)')
        .eq('ativo',true).order('numero_edicao',{ascending:false}).limit(1).maybeSingle();
      if(error) throw error;
      if(!e){ b.hidden=true; sec.hidden=true; return; }
      b.hidden=false;
      const {data:tests,error:te}=await c.from('dr_arbitro_testes').select('*').eq('edicao_id',e.id).eq('ativo',true).order('numero_teste');
      if(te) throw te;
      root.innerHTML=`<div class="dr-modalidade"><h3>${esc(e.nome)}</h3><p>${e.inscricoes_abertas?'Inscrições abertas.':'Inscrições fechadas.'}</p>
        ${e.inscricoes_abertas?'<button class="botao" id="dr-inscrever">Inscrever-me</button>':''}</div>
        <div class="dr-tests">${(tests||[]).length?(tests||[]).map(t=>`<div class="dr-row"><div><strong>${esc(t.titulo)}</strong><div class="dr-muted">Teste ${esc(t.numero_teste)}</div></div><button class="botao" data-dr-test="${t.id}">Iniciar</button></div>`).join(''):'<div class="vazio">Ainda não existem testes ativos.</div>'}</div>`;
      document.getElementById('dr-inscrever')?.addEventListener('click',async()=>{try{await rpc('dr_arbitro_inscrever',{p_edicao_id:e.id});await loadMember()}catch(x){alert(x.message||String(x))}});
      root.querySelectorAll('[data-dr-test]').forEach(x=>x.onclick=()=>startTest(x.dataset.drTest));
    } catch(e){ root.innerHTML=`<div class="vazio">Não foi possível carregar o Drº Árbitro: ${esc(e.message)}</div>`; }
  }

  async function startTest(testId) {
    const c=getClient(), root=document.getElementById('dr-member-content');
    try {
      const attempt=await rpc('dr_arbitro_iniciar_teste',{p_teste_id:testId});
      const {data:q,error}=await c.from('dr_arbitro_perguntas').select('*').eq('teste_id',testId).order('numero');
      if(error) throw error;
      if(!q?.length){root.innerHTML='<div class="vazio">Este teste ainda não tem perguntas.</div>';return;}
      root.innerHTML=`<form id="dr-form"><h3>Teste</h3>${q.map(x=>`<fieldset class="dr-question"><legend><strong>${esc(x.numero)}. ${esc(x.pergunta)}</strong></legend><div class="dr-options">${[['A',x.opcao_a],['B',x.opcao_b],['C',x.opcao_c],['D',x.opcao_d]].map(o=>`<label class="dr-option"><input required type="radio" name="q_${x.id}" value="${o[0]}"><span><strong>${o[0]}</strong> — ${esc(o[1])}</span></label>`).join('')}</div></fieldset>`).join('')}<button class="botao" type="submit">Submeter teste</button></form>`;
      document.getElementById('dr-form').onsubmit=async ev=>{
        ev.preventDefault(); const answers={}; q.forEach(x=>{answers[x.id]=document.querySelector(`input[name="q_${x.id}"]:checked`)?.value||null});
        try{const result=await rpc('dr_arbitro_submeter_teste',{p_tentativa_id:attempt,p_respostas:answers}); const r=Array.isArray(result)?result[0]:result; root.innerHTML=`<div class="dr-result">Resultado: ${esc(r?.nota)} / ${esc(r?.total_perguntas)} — ${esc(r?.percentagem)}%</div>`}
        catch(x){alert(x.message||String(x))}
      };
    } catch(e){alert(e.message||String(e))}
  }

  async function start() {
    if(started) return; started=true; css();
    const c=getClient(); if(!c) { started=false; return; }
    if(document.getElementById('dr-futebol')) await renderAdmin().catch(console.error);
    if(document.getElementById('dashboard')) { ensureMemberUI(); }
  }
  window.NAF_DR_ARBITRO_START=async()=>{started=false; await start(); await loadMember();};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();