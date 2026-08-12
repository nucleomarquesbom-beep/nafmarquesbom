/* NÚCLEO MARQUES BOM — DRº ÁRBITRO | Futebol + Futsal */
(() => {
  'use strict';

  const cfg = window.NAF_ADMIN_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL;
  const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY;
  let sb = null;
  let socioAtual = null;
  let countdown = null;

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const client = () => {
    if (!sb && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return sb;
  };
  const dateText = v => v ? new Date(v).toLocaleString('pt-PT',{dateStyle:'short',timeStyle:'short'}) : '—';
  const localValue = v => { const d=new Date(v),p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const isoValue = v => new Date(v).toISOString();

  async function getSocio(){
    const s=client(); if(!s)return null;
    const {data:{user}}=await s.auth.getUser(); if(!user)return null;
    const {data,error}=await s.from('socios').select('id,nome,numero_socio,ativo').eq('user_id',user.id).eq('ativo',true).single();
    return error?null:data;
  }
  async function isAdmin(){
    const s=client(); if(!s)return false;
    const {data,error}=await s.rpc('is_admin'); return !error && data===true;
  }

  /* ================= ADMIN ================= */
  async function adminInit(){
    if(!(await isAdmin()))return;
    const app=document.querySelector('#admin-app'),tabs=document.querySelector('.admin-tabs');
    if(!app||!tabs||tabs.querySelector('[data-panel="dr-arbitro"]'))return;
    tabs.insertAdjacentHTML('beforeend','<button class="admin-tab" data-panel="dr-arbitro">Drº Árbitro</button>');
    app.insertAdjacentHTML('beforeend',`<section id="panel-dr-arbitro" class="admin-tab-panel"><div class="admin-card dr-card"><h3>Drº Árbitro</h3><p class="admin-help">Gestão de Futebol e Futsal.</p><div class="dr-grid"><div id="dr-futebol" class="dr-modalidade"></div><div id="dr-futsal" class="dr-modalidade"></div></div></div></section>`);
    const tab=tabs.querySelector('[data-panel="dr-arbitro"]');
    tab.onclick=()=>{tabs.querySelectorAll('.admin-tab').forEach(x=>x.classList.remove('active'));tab.classList.add('active');app.querySelectorAll('.admin-tab-panel').forEach(x=>x.classList.remove('active'));document.querySelector('#panel-dr-arbitro').classList.add('active');};
    await Promise.all(['futebol','futsal'].map(loadModalidade));
  }

  async function loadModalidade(codigo){
    const s=client(),box=document.querySelector(`#dr-${codigo}`); if(!s||!box)return;
    const {data:m,error:me}=await s.from('dr_arbitro_modalidades').select('*').eq('codigo',codigo).single();
    if(me||!m){box.innerHTML='<p class="dr-error">Modalidade não encontrada.</p>';return;}
    const {data:eds,error:ee}=await s.from('dr_arbitro_edicoes').select('*').eq('modalidade_id',m.id).order('created_at',{ascending:false});
    if(ee){box.innerHTML=`<p class="dr-error">${esc(ee.message)}</p>`;return;}
    const ed=eds?.[0]||null, nome=codigo==='futebol'?'⚽ Drº Árbitro — Futebol':'🏆 Drº Árbitro — Futsal';
    box.innerHTML=`<div class="dr-modalidade-head"><h4>${nome}</h4><span class="dr-badge ${m.ativo?'on':'off'}">${m.ativo?'Ativo':'Desativo'}</span></div>
      <label class="dr-check"><input id="dr-m-${codigo}" type="checkbox" ${m.ativo?'checked':''}> Disponível no site</label>
      <div class="dr-form"><label class="wide">Nome da edição<input id="dr-n-${codigo}" value="${esc(ed?.nome||nome)}"></label><label>N.º de testes<input id="dr-num-${codigo}" type="number" min="1" value="${ed?.numero_testes||1}"></label><label class="dr-check"><input id="dr-ed-${codigo}" type="checkbox" ${ed?.ativo?'checked':''}> Edição ativa</label><label class="dr-check"><input id="dr-ins-${codigo}" type="checkbox" ${ed?ed.inscricoes_abertas?'checked':'':'checked'}> Inscrições abertas</label></div>
      <div class="dr-actions"><button class="admin-small-btn primary" id="dr-save-${codigo}">${ed?'Guardar edição':'Criar edição'}</button></div><div id="dr-tests-${codigo}"></div>`;
    document.querySelector(`#dr-m-${codigo}`).onchange=async e=>{const r=await s.from('dr_arbitro_modalidades').update({ativo:e.target.checked}).eq('id',m.id);if(r.error)alert(r.error.message);};
    document.querySelector(`#dr-save-${codigo}`).onclick=()=>saveEdicao(codigo,m,ed);
    if(ed)renderTests(codigo,ed);
  }

  async function saveEdicao(codigo,m,old){
    const s=client(),nome=document.querySelector(`#dr-n-${codigo}`).value.trim(),numero=Number(document.querySelector(`#dr-num-${codigo}`).value),ativo=document.querySelector(`#dr-ed-${codigo}`).checked,ins=document.querySelector(`#dr-ins-${codigo}`).checked;
    if(!nome||!Number.isInteger(numero)||numero<1){alert('Indica o nome e o número de testes.');return;}
    let r=old?await s.from('dr_arbitro_edicoes').update({nome,numero_testes:numero,ativo,inscricoes_abertas:ins}).eq('id',old.id).select().single():await s.from('dr_arbitro_edicoes').insert({modalidade_id:m.id,nome,numero_testes:numero,ativo,inscricoes_abertas:ins}).select().single();
    if(r.error){alert(r.error.message);return;} const ed=r.data;
    const {data:existing}=await s.from('dr_arbitro_testes').select('numero_teste').eq('edicao_id',ed.id); const have=new Set((existing||[]).map(x=>x.numero_teste));
    for(let i=1;i<=numero;i++)if(!have.has(i)){const start=new Date(Date.now()+3600000),end=new Date(start.getTime()+3600000);const x=await s.from('dr_arbitro_testes').insert({edicao_id:ed.id,numero_teste:i,titulo:`Teste ${i}`,inicio_em:start.toISOString(),fim_em:end.toISOString(),ativo:false});if(x.error){alert(x.error.message);return;}}
    await loadModalidade(codigo);
  }

  async function renderTests(codigo,ed){
    const s=client(),target=document.querySelector(`#dr-tests-${codigo}`); if(!target)return;
    const {data:ts,error}=await s.from('dr_arbitro_testes').select('*').eq('edicao_id',ed.id).order('numero_teste');
    if(error){target.innerHTML=`<p class="dr-error">${esc(error.message)}</p>`;return;}
    target.innerHTML=(ts||[]).map(t=>`<article class="dr-test-card"><div class="dr-test-head"><strong>${esc(t.titulo)}</strong><span class="dr-badge ${t.ativo?'on':'off'}">${t.ativo?'Ativo':'Inativo'}</span></div><div class="dr-form"><label class="wide">Título<input data-title="${t.id}" value="${esc(t.titulo)}"></label><label>Início<input type="datetime-local" data-start="${t.id}" value="${localValue(t.inicio_em)}"></label><label>Fim<input type="datetime-local" data-end="${t.id}" value="${localValue(t.fim_em)}"></label><label class="dr-check"><input type="checkbox" data-active="${t.id}" ${t.ativo?'checked':''}> Teste ativo</label><label class="wide">PDF<input type="file" accept="application/pdf" data-pdf="${t.id}"></label></div><div class="dr-meta">${t.ficheiro_path?'📄 PDF carregado':'📄 PDF por carregar'}</div><div class="dr-actions"><button class="admin-small-btn primary" data-save-test="${t.id}">Guardar teste</button><button class="admin-small-btn" data-questions="${t.id}">Ver perguntas</button></div><div class="dr-question-list" id="dr-q-${t.id}"></div></article>`).join('');
    target.querySelectorAll('[data-save-test]').forEach(b=>b.onclick=()=>saveTest(b.dataset.saveTest,ed.id,codigo));
    target.querySelectorAll('[data-questions]').forEach(b=>b.onclick=()=>loadQuestions(b.dataset.questions));
  }

  async function saveTest(id,edId,codigo){
    const s=client(),title=document.querySelector(`[data-title="${id}"]`).value.trim(),start=document.querySelector(`[data-start="${id}"]`).value,end=document.querySelector(`[data-end="${id}"]`).value,active=document.querySelector(`[data-active="${id}"]`).checked,file=document.querySelector(`[data-pdf="${id}"]`).files[0];
    if(!title||!start||!end){alert('Preenche título, início e fim.');return;} const ini=isoValue(start),fim=isoValue(end); if(new Date(fim)<=new Date(ini)){alert('O fim tem de ser posterior ao início.');return;}
    let path=null;if(file){if(file.type!=='application/pdf'){alert('O ficheiro tem de ser PDF.');return;}const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');path=`${edId}/${id}/${Date.now()}-${safe}`;const up=await s.storage.from('dr-arbitro').upload(path,file,{upsert:true,contentType:'application/pdf'});if(up.error){alert(up.error.message);return;}}
    const payload={titulo:title,inicio_em:ini,fim_em:fim,ativo:active};if(path)payload.ficheiro_path=path;const r=await s.from('dr_arbitro_testes').update(payload).eq('id',id);if(r.error){alert(r.error.message);return;}alert('Teste guardado.');await loadModalidade(codigo);
  }

  async function loadQuestions(id){
    const s=client(),el=document.querySelector(`#dr-q-${id}`);if(!el)return;const {data,error}=await s.from('dr_arbitro_perguntas').select('numero,pergunta,opcao_a,opcao_b,opcao_c,opcao_d,resposta_correta').eq('teste_id',id).order('numero');if(error){el.innerHTML=`<p class="dr-error">${esc(error.message)}</p>`;return;}el.innerHTML=(data||[]).map(q=>`<div class="dr-question"><strong>${q.numero}. ${esc(q.pergunta)}</strong><div>A — ${esc(q.opcao_a)}</div><div>B — ${esc(q.opcao_b)}</div><div>C — ${esc(q.opcao_c)}</div><div>D — ${esc(q.opcao_d)}</div><b>Correta: ${esc(q.resposta_correta)}</b></div>`).join('')||'<p class="dr-muted">Ainda não existem perguntas neste teste.</p>';
  }

  /* ================= SÓCIO ================= */
  async function socioInit(){
    socioAtual=await getSocio();if(!socioAtual)return;const dash=document.querySelector('#dashboard'),tabs=document.querySelector('.socio-tabs');if(!dash||!tabs)return;
    if(!tabs.querySelector('[data-tab="dr-arbitro"]')){tabs.insertAdjacentHTML('beforeend','<button class="socio-tab" data-tab="dr-arbitro" type="button">Drº Árbitro</button>');tabs.querySelector('[data-tab="dr-arbitro"]').onclick=()=>activateTab();}
    if(!document.querySelector('#dr-arbitro-socio-panel'))dash.insertAdjacentHTML('beforeend','<section id="dr-arbitro-socio-panel" class="socio-tab-content"><div class="dr-card"><h2>Drº Árbitro</h2><p>Atividade exclusiva para sócios.</p><div id="dr-socio-content"><div class="vazio">A carregar…</div></div></div></section>');
    await loadSocio();
  }
  function activateTab(){document.querySelectorAll('.socio-tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.socio-tab-content').forEach(x=>x.classList.remove('active'));document.querySelector('.socio-tab[data-tab="dr-arbitro"]')?.classList.add('active');document.querySelector('#dr-arbitro-socio-panel')?.classList.add('active');}
  async function loadSocio(){
    const s=client(),target=document.querySelector('#dr-socio-content');if(!s||!target)return;const {data:mods,error}=await s.from('dr_arbitro_modalidades').select('*').eq('ativo',true);if(error){target.innerHTML=`<p class="dr-error">${esc(error.message)}</p>`;return;}if(!mods?.length){target.innerHTML='<div class="vazio">O Drº Árbitro não está disponível.</div>';return;}
    const {data:eds}=await s.from('dr_arbitro_edicoes').select('*').eq('ativo',true).order('created_at',{ascending:false});const {data:ins}=await s.from('dr_arbitro_inscricoes').select('id,edicao_id').eq('socio_id',socioAtual.id);
    target.innerHTML=mods.map(m=>{const e=(eds||[]).find(x=>x.modalidade_id===m.id);if(!e)return'';const yes=(ins||[]).some(x=>x.edicao_id===e.id);return `<article class="dr-socio-modalidade"><h3>${m.codigo==='futebol'?'⚽':'🏆'} ${esc(m.nome)}</h3><p>${esc(e.nome)}</p>${yes?'<span class="dr-badge on">Inscrito</span>':e.inscricoes_abertas?`<button class="botao dr-inscrever" data-ed="${e.id}">Inscrever-me</button>`:'<span class="dr-badge off">Inscrições encerradas</span>'}<div class="dr-socio-tests" data-ed-tests="${e.id}"></div></article>`;}).join('');
    target.querySelectorAll('.dr-inscrever').forEach(b=>b.onclick=async()=>{const r=await s.rpc('dr_arbitro_inscrever',{p_edicao_id:b.dataset.ed});if(r.error){alert(r.error.message);return;}await loadSocio();});
    for(const e of eds||[]){const el=target.querySelector(`[data-ed-tests="${e.id}"]`);if(el)await renderSocioTests(el,e,(ins||[]).some(x=>x.edicao_id===e.id));}
  }
  async function renderSocioTests(el,ed,inscrito){
    const s=client();const {data:ts,error}=await s.from('dr_arbitro_testes').select('id,numero_teste,titulo,inicio_em,fim_em,ativo').eq('edicao_id',ed.id).order('numero_teste');if(error){el.innerHTML=`<p class="dr-error">${esc(error.message)}</p>`;return;}if(!inscrito){el.innerHTML='<p class="dr-muted">Inscreve-te para veres os testes.</p>';return;}
    el.innerHTML=(ts||[]).map(t=>`<div class="dr-socio-test"><div><strong>${esc(t.titulo)}</strong><small>${dateText(t.inicio_em)} → ${dateText(t.fim_em)}</small></div><span data-test-action="${t.id}">A verificar…</span></div>`).join('');for(const t of ts||[])await updateTestAction(t);
  }
  async function updateTestAction(t){
    const s=client(),el=document.querySelector(`[data-test-action="${t.id}"]`);if(!el)return;const {data:tent}=await s.from('dr_arbitro_tentativas').select('id,submeteu_em,nota,total_perguntas,percentagem').eq('teste_id',t.id).eq('socio_id',socioAtual.id).maybeSingle();const now=Date.now(),ini=new Date(t.inicio_em).getTime(),fim=new Date(t.fim_em).getTime();
    if(tent?.submeteu_em){el.innerHTML=`<span class="dr-badge on">${tent.nota}/${tent.total_perguntas} (${tent.percentagem}%)</span>`;return;}
    if(tent){el.innerHTML=`<button class="botao" data-continue="${t.id}">Continuar</button>`;el.querySelector('button').onclick=()=>openTest(t,tent.id);return;}
    if(!t.ativo||now<ini){el.innerHTML=`<span class="dr-badge off">Inicia ${dateText(t.inicio_em)}</span>`;return;}if(now>fim){el.innerHTML='<span class="dr-badge off">Terminado</span>';return;}
    el.innerHTML=`<button class="botao" data-start="${t.id}">Iniciar teste</button>`;el.querySelector('button').onclick=async()=>{const r=await s.rpc('dr_arbitro_iniciar_teste',{p_teste_id:t.id});if(r.error){alert(r.error.message);return;}await openTest(t,r.data);};
  }
  async function openTest(t,tentativa){
    const s=client(),{data:q,error}=await s.from('dr_arbitro_perguntas_publicas').select('id,numero,pergunta,opcao_a,opcao_b,opcao_c,opcao_d').eq('teste_id',t.id).order('numero');if(error){alert(error.message);return;}if(!q?.length){alert('Este teste ainda não tem perguntas.');return;}
    let overlay=document.querySelector('#dr-test-overlay');if(!overlay){document.body.insertAdjacentHTML('beforeend','<div id="dr-test-overlay" class="dr-test-overlay"></div>');overlay=document.querySelector('#dr-test-overlay');}
    overlay.innerHTML=`<div class="dr-test-window"><div class="dr-test-head"><div><h2>${esc(t.titulo)}</h2><p>A tentativa fica registada ao entrar.</p></div><strong id="dr-countdown">—</strong></div><form id="dr-test-form">${q.map(x=>`<fieldset class="dr-question"><legend>${x.numero}. ${esc(x.pergunta)}</legend>${['A','B','C','D'].map(l=>`<label class="dr-option"><input type="radio" name="q-${x.id}" value="${l}"><span><b>${l}</b> ${esc(x['opcao_'+l.toLowerCase()])}</span></label>`).join('')}</fieldset>`).join('')}<button class="botao" type="submit">Submeter respostas</button></form></div>`;overlay.hidden=false;startCountdown(t.fim_em);
    document.querySelector('#dr-test-form').onsubmit=async ev=>{ev.preventDefault();if(!confirm('Submeter o teste? Não poderás alterar as respostas.'))return;const respostas=q.map(x=>{const r=document.querySelector(`input[name="q-${x.id}"]:checked`);return r?{pergunta_id:x.id,resposta:r.value}:null;}).filter(Boolean);const r=await s.rpc('dr_arbitro_submeter_teste',{p_tentativa_id:tentativa,p_respostas:respostas});if(r.error){alert(r.error.message);return;}stopCountdown();overlay.hidden=true;alert(`Teste submetido: ${r.data?.[0]?.nota||0}/${r.data?.[0]?.total_perguntas||q.length}.`);await loadSocio();};
  }
  function startCountdown(end){stopCountdown();const tick=()=>{const el=document.querySelector('#dr-countdown');if(!el)return;let x=new Date(end).getTime()-Date.now();if(x<=0){el.textContent='Tempo terminado';return;}x=Math.floor(x/1000);el.textContent=x>=3600?`${Math.floor(x/3600)}h ${String(Math.floor(x%3600/60)).padStart(2,'0')}m`:`${Math.floor(x/60)}:${String(x%60).padStart(2,'0')}`;};tick();countdown=setInterval(tick,1000);}
  function stopCountdown(){if(countdown)clearInterval(countdown);countdown=null;}

  function boot(){client();if(!sb)return;if(/(^|\/)admin\.html$/i.test(location.pathname))setTimeout(adminInit,900);if(/(^|\/)socio\.html$/i.test(location.pathname))setTimeout(socioInit,1100);}
  boot();
})();
