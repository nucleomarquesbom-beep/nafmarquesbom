/* NAF Marques Bom — Drº Árbitro
   Gestão completa:
   - edições / ativar / inscrições
   - configuração de testes
   - upload do PDF das questões
   - duração do teste
   - janela de acesso (dia/hora início e fim)
   - área do sócio e temporizador
*/
(() => {
  'use strict';

  const esc = (v = '') => String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));

  const client = () => window.__NAF_SUPABASE || window.supabaseClient || null;
  let booted = false;
  let waitTimer = null;
  let timerHandle = null;

  function css() {
    if (document.getElementById('naf-dr-arbitro-css')) return;
    const s = document.createElement('style');
    s.id = 'naf-dr-arbitro-css';
    s.textContent = `
      .dr-admin-panel{margin-top:18px}
      .dr-admin-grid,.dr-tests{display:grid;gap:12px}
      .dr-modalidade,.dr-test-admin{border:1px solid rgba(0,0,0,.1);border-radius:14px;padding:16px;margin-top:12px}
      .dr-row{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:10px}
      .dr-actions{display:flex;gap:8px;flex-wrap:wrap}
      .dr-muted{opacity:.7}
      .dr-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .dr-form-grid .wide{grid-column:1/-1}
      .dr-form-grid label{display:grid;gap:6px}
      .dr-form-grid input,.dr-form-grid select,.dr-form-grid textarea{width:100%;box-sizing:border-box}
      .dr-question{border:1px solid rgba(0,0,0,.08);border-radius:12px;padding:16px;margin:10px 0}
      .dr-options{display:grid;gap:8px;margin-top:10px}
      .dr-option{display:flex;gap:8px;padding:9px;border-radius:8px;background:rgba(0,0,0,.025)}
      .dr-result{padding:16px;border-radius:12px;background:rgba(0,120,70,.08);font-weight:700}
      .dr-timer{position:sticky;top:10px;z-index:5;padding:12px 16px;border-radius:12px;background:rgba(0,0,0,.06);font-size:1.1rem;font-weight:700;margin-bottom:14px}
      .dr-timer.warning{background:rgba(170,90,0,.12)}
      .dr-file-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      @media(max-width:700px){.dr-form-grid{grid-template-columns:1fr}.dr-form-grid .wide{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  async function rpc(name, args={}) {
    const c = client();
    if (!c) throw new Error('Cliente Supabase não disponível.');
    const {data,error}=await c.rpc(name,args);
    if (error) throw error;
    return data;
  }

  async function isAdmin() {
    try { return (await rpc('is_admin')) === true; } catch { return false; }
  }

  function editionLabel(n) { return `${Number(n)}.ª Edição`; }

  async function nextEditionNumber(c) {
    const {data,error}=await c.from('dr_arbitro_edicoes').select('numero_edicao').order('numero_edicao',{ascending:false}).limit(1);
    if (error) throw error;
    return Number(data?.[0]?.numero_edicao || 0) + 1;
  }

  function localDatetimeValue(iso) {
    if (!iso) return '';
    const d=new Date(iso);
    const p=n=>String(n).padStart(2,'0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function toIso(localValue) {
    return localValue ? new Date(localValue).toISOString() : null;
  }

  async function ensureIntegratedAdmin() {
    const admin=document.getElementById('admin-panel');
    if (!admin) return null;
    let panel=document.getElementById('dr-arbitro-admin-integrado');
    if (!panel) {
      panel=document.createElement('div');
      panel.id='dr-arbitro-admin-integrado';
      panel.className='admin-subpanel dr-admin-panel';
      panel.innerHTML=`
        <div class="tab-heading-row"><div>
          <h3>Drº Árbitro</h3>
          <p>Ativa a edição e configura testes, PDFs, duração e horários de acesso.</p>
        </div></div>
        <div id="dr-integrado-content"><div class="vazio">A carregar…</div></div>`;
      admin.appendChild(panel);
    }
    return panel;
  }

  async function uploadPdf(file, editionId, testNumber) {
    if (!file || file.type !== 'application/pdf') throw new Error('Selecione um PDF válido.');
    const c=client();
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`edicoes/${editionId}/teste-${testNumber}-${crypto.randomUUID()}-${safe}`;
    const {error}=await c.storage.from('dr-arbitro').upload(path,file,{contentType:'application/pdf',upsert:false});
    if (error) throw error;
    return path;
  }

  async function deleteStorage(path) {
    if (!path) return;
    try { await client().storage.from('dr-arbitro').remove([path]); } catch {}
  }

  async function saveTest(test, editionId, form, fileInput) {
    const c=client();
    const titulo=form.querySelector('[name="titulo"]').value.trim();
    const inicio=form.querySelector('[name="inicio"]').value;
    const fim=form.querySelector('[name="fim"]').value;
    const duracao=Number(form.querySelector('[name="duracao"]').value);
    const ativo=form.querySelector('[name="ativo"]').checked;

    if (!titulo) throw new Error('Indica o título do teste.');
    if (!inicio || !fim) throw new Error('Define o início e o fim do período de acesso.');
    if (new Date(inicio) >= new Date(fim)) throw new Error('O fim tem de ser posterior ao início.');
    if (!Number.isInteger(duracao) || duracao < 1 || duracao > 600) throw new Error('A duração deve estar entre 1 e 600 minutos.');

    let ficheiroPath=test?.ficheiro_path || null;
    const file=fileInput.files?.[0];
    if (file) {
      const old=ficheiroPath;
      ficheiroPath=await uploadPdf(file,editionId,Number(test?.numero_teste || form.dataset.numero));
      if (old) await deleteStorage(old);
    }

    const payload={
      edicao_id:editionId,
      numero_teste:Number(test?.numero_teste || form.dataset.numero),
      titulo,
      inicio_em:toIso(inicio),
      fim_em:toIso(fim),
      ativo,
      ficheiro_path:ficheiroPath
    };

    // duration_minutos é criado pela migration incluída no ZIP.
    if (test?.id) {
      const {error}=await c.from('dr_arbitro_testes').update({...payload,duracao_minutos:duracao,updated_at:new Date().toISOString()}).eq('id',test.id);
      if (error) throw error;
    } else {
      const {error}=await c.from('dr_arbitro_testes').insert({...payload,duracao_minutos:duracao});
      if (error) throw error;
    }
  }

  async function renderTestsAdmin(root, edition) {
    const c=client();
    const {data:tests,error}=await c.from('dr_arbitro_testes').select('*').eq('edicao_id',edition.id).order('numero_teste');
    if (error) throw error;

    const nextTest=((tests||[]).reduce((m,t)=>Math.max(m,Number(t.numero_teste||0)),0)||0)+1;

    root.insertAdjacentHTML('beforeend',`
      <div class="dr-test-admin">
        <h4>Testes da ${esc(editionLabel(edition.numero_edicao))}</h4>
        <p class="dr-muted">O PDF é guardado no bucket privado <strong>dr-arbitro</strong>. O horário define quando o teste pode ser aberto pelos sócios. A duração começa quando o sócio inicia o teste.</p>
        <div id="dr-tests-list-${edition.id}" class="dr-tests"></div>
        <button type="button" class="admin-small-btn" data-dr-new-test="${edition.id}" data-next-test="${nextTest}">
          + Criar teste ${nextTest}
        </button>
      </div>`);

    const list=document.getElementById(`dr-tests-list-${edition.id}`);

    (tests||[]).forEach(test=>{
      const wrapper=document.createElement('div');
      wrapper.className='dr-row';
      wrapper.innerHTML=`
        <div style="flex:1;min-width:220px">
          <strong>Teste ${esc(test.numero_teste)} — ${esc(test.titulo)}</strong>
          <div class="dr-muted">
            ${test.ativo?'🟢 Ativo':'⚪ Inativo'}
            · ${new Date(test.inicio_em).toLocaleString('pt-PT')}
            → ${new Date(test.fim_em).toLocaleString('pt-PT')}
            · ${Number(test.duracao_minutos||0)} min
          </div>
          <div class="dr-file-row">
            <small>${test.ficheiro_path?'PDF carregado':'Sem PDF'}</small>
          </div>
        </div>
        <div class="dr-actions">
          <button type="button" class="admin-small-btn" data-edit-test="${test.id}">Configurar</button>
        </div>`;

      list.appendChild(wrapper);

      wrapper.querySelector('[data-edit-test]').addEventListener('click',()=>{
        showTestForm(root,edition,test);
      });
    });

    root.querySelector('[data-dr-new-test]').addEventListener('click',()=>{
      showTestForm(root,edition,null,nextTest);
    });
  }

  function showTestForm(root,edition,test=null,nextNumber=null) {
    const old=root.querySelector('.dr-test-form');
    if (old) old.remove();

    const numero=Number(test?.numero_teste || nextNumber);
    const formWrap=document.createElement('div');
    formWrap.className='dr-test-admin dr-test-form';
    formWrap.innerHTML=`
      <h4>${test?'Configurar':'Criar'} teste ${esc(numero)}</h4>
      <form>
        <div class="dr-form-grid">
          <label>Título<input name="titulo" required value="${esc(test?.titulo||`Teste ${numero}`)}"></label>
          <label>Duração (minutos)<input name="duracao" type="number" min="1" max="600" required value="${Number(test?.duracao_minutos||60)}"></label>
          <label>Disponível a partir de<input name="inicio" type="datetime-local" required value="${localDatetimeValue(test?.inicio_em)}"></label>
          <label>Disponível até<input name="fim" type="datetime-local" required value="${localDatetimeValue(test?.fim_em)}"></label>
          <label class="wide">PDF das questões<input name="pdf" type="file" accept="application/pdf"></label>
          <label class="wide"><span><input name="ativo" type="checkbox" ${test?.ativo?'checked':''}> Teste ativo</span></label>
        </div>
        <div class="dr-actions">
          <button class="botao" type="submit">Guardar teste</button>
          <button class="botao-secundario" type="button" data-cancelar>Cancelar</button>
        </div>
        ${test?.ficheiro_path?'<small class="dr-muted">Já existe um PDF carregado. Selecionar outro substitui o atual.</small>':''}
      </form>`;

    root.appendChild(formWrap);
    formWrap.querySelector('[data-cancelar]').onclick=()=>formWrap.remove();

    formWrap.querySelector('form').onsubmit=async ev=>{
      ev.preventDefault();
      const submit=ev.currentTarget.querySelector('button[type="submit"]');
      submit.disabled=true;
      try {
        await saveTest(test,edition.id,ev.currentTarget,ev.currentTarget.querySelector('[name="pdf"]'));
        formWrap.remove();
        await renderAdminIntegrated();
      } catch(e) {
        alert(e.message||String(e));
      } finally { submit.disabled=false; }
    };
  }

  async function renderEditionAdmin(root,edition) {
    const c=client();
    const {data:tests,error}=await c.from('dr_arbitro_testes').select('id,numero_teste,titulo,ficheiro_path,inicio_em,fim_em,ativo,duracao_minutos').eq('edicao_id',edition.id).order('numero_teste');
    if (error) throw error;

    root.insertAdjacentHTML('beforeend',`
      <div class="dr-test-admin">
        <div class="dr-row">
          <div>
            <strong>${esc(edition.nome)}</strong>
            <div class="dr-muted">${edition.ativo?'🟢 Ativa':'⚪ Inativa'} · ${edition.inscricoes_abertas?'Inscrições abertas':'Inscrições fechadas'}</div>
          </div>
          <div class="dr-actions">
            <button type="button" class="admin-small-btn" data-toggle-ed="${edition.id}" data-value="${!edition.ativo}">${edition.ativo?'Desativar':'Ativar'}</button>
            <button type="button" class="admin-small-btn" data-toggle-ins="${edition.id}" data-value="${!edition.inscricoes_abertas}">${edition.inscricoes_abertas?'Fechar inscrições':'Abrir inscrições'}</button>
          </div>
        </div>
        <div class="dr-tests">
          ${(tests||[]).map(t=>`
            <div class="dr-row">
              <div>
                <strong>Teste ${esc(t.numero_teste)} — ${esc(t.titulo)}</strong>
                <div class="dr-muted">${t.ativo?'🟢 Ativo':'⚪ Inativo'} · ${Number(t.duracao_minutos||0)} min · ${new Date(t.inicio_em).toLocaleString('pt-PT')} → ${new Date(t.fim_em).toLocaleString('pt-PT')}</div>
              </div>
              <button type="button" class="admin-small-btn" data-edit-inline="${t.id}">Configurar</button>
            </div>`).join('')}
        </div>
        <div class="dr-actions">
          <button type="button" class="admin-small-btn" data-new-inline="${edition.id}">+ Novo teste</button>
        </div>
      </div>
    `);

    const box=root.lastElementChild;
    box.querySelector('[data-toggle-ed]').onclick=async()=>{await rpc('dr_arbitro_admin_definir_ativo',{p_edicao_id:edition.id,p_ativo:box.querySelector('[data-toggle-ed]').dataset.value==='true'}); await renderAdminIntegrated(); await refreshMember();};
    box.querySelector('[data-toggle-ins]').onclick=async()=>{await rpc('dr_arbitro_admin_definir_inscricoes',{p_edicao_id:edition.id,p_abertas:box.querySelector('[data-toggle-ins]').dataset.value==='true'}); await renderAdminIntegrated();};
    box.querySelector('[data-new-inline]').onclick=()=>showTestForm(root,edition,null,(tests||[]).reduce((m,t)=>Math.max(m,Number(t.numero_teste||0)),0)+1);
    box.querySelectorAll('[data-edit-inline]').forEach(b=>b.onclick=async()=>{
      const t=(tests||[]).find(x=>x.id===b.dataset.editInline);
      showTestForm(root,edition,t);
    });
  }

  async function renderAdminIntegrated() {
    const panel=await ensureIntegratedAdmin();
    if (!panel) return;
    const root=panel.querySelector('#dr-integrado-content');
    const c=client();
    if (!c || !(await isAdmin())) return;

    const {data:modalidades,error}=await c.from('dr_arbitro_modalidades').select('id,codigo,nome,ativo').eq('ativo',true).order('nome');
    if (error) throw error;
    const next=await nextEditionNumber(c);

    root.innerHTML='';
    for (const m of modalidades||[]) {
      const {data:edicoes,error:e}=await c.from('dr_arbitro_edicoes').select('*').eq('modalidade_id',m.id).order('numero_edicao',{ascending:false});
      if (e) throw e;

      const sec=document.createElement('div');
      sec.className='dr-modalidade';
      sec.innerHTML=`
        <h4>${esc(m.nome)}</h4>
        <div class="dr-actions">
          <button class="admin-small-btn" type="button" data-create-ed="${m.id}">Criar ${next}.ª Edição</button>
        </div>
        <div class="dr-admin-grid">${(edicoes||[]).map(ed=>`
          <div class="dr-row">
            <div><strong>${esc(ed.nome)}</strong><div class="dr-muted">${ed.ativo?'🟢 Ativa':'⚪ Inativa'} · ${ed.inscricoes_abertas?'Inscrições abertas':'Inscrições fechadas'}</div></div>
            <div class="dr-actions"><button class="admin-small-btn" type="button" data-config-ed="${ed.id}">Configurar edição</button></div>
          </div>`).join('')}</div>`;
      root.appendChild(sec);

      sec.querySelector('[data-create-ed]').onclick=async()=>{
        try {
          const {error:ie}=await c.from('dr_arbitro_edicoes').insert({
            modalidade_id:m.id,numero_edicao:next,nome:`Drº Árbitro - ${editionLabel(next)}`,
            ativo:false,numero_testes:1,inscricoes_abertas:false
          });
          if(ie) throw ie;
          await renderAdminIntegrated();
        } catch(e){alert(e.message||String(e));}
      };

      sec.querySelectorAll('[data-config-ed]').forEach(btn=>btn.onclick=async()=>{
        const ed=(edicoes||[]).find(x=>x.id===btn.dataset.configEd);
        root.innerHTML='';
        await renderEditionAdmin(root,ed);
        const back=document.createElement('button'); back.className='botao-secundario'; back.type='button'; back.textContent='← Voltar às edições'; back.onclick=renderAdminIntegrated; root.prepend(back);
      });
    }
  }

  async function renderAdminDedicated() {
    const c=client();
    const targetF=document.getElementById('dr-futebol'),targetFS=document.getElementById('dr-futsal');
    if (!c || (!targetF && !targetFS) || !(await isAdmin())) return;
    const {data:modalidades,error}=await c.from('dr_arbitro_modalidades').select('id,codigo,nome,ativo').eq('ativo',true).order('nome');
    if(error) throw error;
    for(const m of modalidades||[]) {
      const target=String(m.codigo).toLowerCase()==='futsal'?targetFS:targetF;
      if(!target) continue;
      const {data:eds,error:e}=await c.from('dr_arbitro_edicoes').select('*').eq('modalidade_id',m.id).order('numero_edicao',{ascending:false});
      if(e) throw e;
      target.innerHTML=`<h4>${esc(m.nome)}</h4><div class="dr-actions"><button class="admin-small-btn" data-new-ed="${m.id}">Criar próxima edição</button></div><div class="dr-admin-grid">${(eds||[]).map(ed=>`<div class="dr-row"><div><strong>${esc(ed.nome)}</strong><div class="dr-muted">${ed.ativo?'🟢 Ativa':'⚪ Inativa'} · ${ed.inscricoes_abertas?'Inscrições abertas':'Inscrições fechadas'}</div></div><button class="admin-small-btn" data-config="${ed.id}">Configurar</button></div>`).join('')}</div>`;
      target.querySelector('[data-new-ed]').onclick=async()=>{const next=await nextEditionNumber(c); const {error:ie}=await c.from('dr_arbitro_edicoes').insert({modalidade_id:m.id,numero_edicao:next,nome:`Drº Árbitro - ${editionLabel(next)}`,ativo:false,numero_testes:1,inscricoes_abertas:false}); if(ie) alert(ie.message); else await renderAdminDedicated();};
      target.querySelectorAll('[data-config]').forEach(b=>b.onclick=async()=>{const ed=(eds||[]).find(x=>x.id===b.dataset.config); target.innerHTML=''; await renderEditionAdmin(target,ed);});
    }
  }

  async function ensureMember() {
    const tabs=document.querySelector('.socio-tabs'),dash=document.getElementById('dashboard');
    if(!tabs||!dash) return;
    let b=tabs.querySelector('[data-tab="dr-arbitro"]'),sec=document.getElementById('dr-arbitro');
    if(!b){
      b=document.createElement('button'); b.type='button'; b.className='socio-tab'; b.dataset.tab='dr-arbitro'; b.textContent='Drº Árbitro'; tabs.appendChild(b);
      b.onclick=()=>{tabs.querySelectorAll('.socio-tab').forEach(x=>x.classList.toggle('active',x===b));dash.querySelectorAll('.socio-tab-content').forEach(x=>x.classList.remove('active'));sec.classList.add('active');loadMember();};
    }
    if(!sec){
      sec=document.createElement('section'); sec.className='socio-tab-content'; sec.id='dr-arbitro'; sec.innerHTML='<div class="tab-heading-row"><div><h2>Drº Árbitro</h2><p>Testes de conhecimentos de arbitragem.</p></div></div><div id="dr-member-content"><div class="vazio">A carregar…</div></div>'; (document.getElementById('funlearn')||dash).before(sec);
    }
    return {b,sec};
  }

  async function loadMember() {
    const c=client(),ui=await ensureMember(); if(!c||!ui) return;
    const {b,sec}=ui,root=document.getElementById('dr-member-content');
    const {data:e,error}=await c.from('dr_arbitro_edicoes').select('*').eq('ativo',true).order('numero_edicao',{ascending:false}).limit(1).maybeSingle();
    if(error) throw error;
    if(!e){b.hidden=true;sec.hidden=true;return;}
    b.hidden=false;sec.hidden=false;
    const {data:tests,error:te}=await c.from('dr_arbitro_testes').select('*').eq('edicao_id',e.id).eq('ativo',true).order('numero_teste');
    if(te) throw te;
    root.innerHTML=`<div class="dr-modalidade"><h3>${esc(e.nome)}</h3><p>${e.inscricoes_abertas?'Inscrições abertas.':'Inscrições fechadas.'}</p>${e.inscricoes_abertas?'<button class="botao" id="dr-inscrever">Inscrever-me</button>':''}</div><div class="dr-tests">${(tests||[]).length?(tests||[]).map(t=>`<div class="dr-row"><div><strong>${esc(t.titulo)}</strong><div class="dr-muted">Disponível ${new Date(t.inicio_em).toLocaleString('pt-PT')} → ${new Date(t.fim_em).toLocaleString('pt-PT')} · ${Number(t.duracao_minutos||0)} min</div></div><button class="botao" data-start-test="${t.id}" ${new Date()<new Date(t.inicio_em)||new Date()>new Date(t.fim_em)?'disabled':''}>${new Date()<new Date(t.inicio_em)?'Ainda não disponível':new Date()>new Date(t.fim_em)?'Encerrado':'Iniciar'}</button></div>`).join(''):'<div class="vazio">Ainda não existem testes ativos.</div>'}</div>`;
    document.getElementById('dr-inscrever')?.addEventListener('click',async()=>{try{await rpc('dr_arbitro_inscrever',{p_edicao_id:e.id});await loadMember();}catch(x){alert(x.message||String(x));}});
    root.querySelectorAll('[data-start-test]').forEach(x=>x.onclick=()=>startTest(x.dataset.startTest));
  }

  async function startTest(testId){
    const c=client(),root=document.getElementById('dr-member-content'); if(!c||!root)return;
    const {data:test,error:te}=await c.from('dr_arbitro_testes').select('*').eq('id',testId).single(); if(te)throw te;
    const now=Date.now(), start=new Date(test.inicio_em).getTime(), end=new Date(test.fim_em).getTime();
    if(now<start||now>end){alert('Este teste não está disponível neste momento.');return;}
    const attempt=await rpc('dr_arbitro_iniciar_teste',{p_teste_id:testId});
    const {data:q,error}=await c.from('dr_arbitro_perguntas').select('*').eq('teste_id',testId).order('numero'); if(error)throw error;
    if(!q?.length){root.innerHTML='<div class="vazio">Este teste ainda não tem perguntas.</div>';return;}
    const duration=Math.max(1,Number(test.duracao_minutos||60));
    const deadline=Math.min(Date.now()+duration*60000,end);
    root.innerHTML=`<div id="dr-timer" class="dr-timer">Tempo restante: <span></span></div><form id="dr-form"><h3>${esc(test.titulo)}</h3>${q.map(x=>`<fieldset class="dr-question"><legend><strong>${esc(x.numero)}. ${esc(x.pergunta)}</strong></legend><div class="dr-options">${[['A',x.opcao_a],['B',x.opcao_b],['C',x.opcao_c],['D',x.opcao_d]].filter(o=>o[1]!==null&&o[1]!==undefined&&o[1]!=='').map(o=>`<label class="dr-option"><input required type="radio" name="q_${x.id}" value="${o[0]}"><span><strong>${o[0]}</strong> — ${esc(o[1])}</span></label>`).join('')}</div></fieldset>`).join('')}<button class="botao" type="submit">Submeter teste</button></form>`;
    const timer=document.getElementById('dr-timer'),span=timer.querySelector('span');
    const update=()=>{const left=Math.max(0,deadline-Date.now()); const sec=Math.ceil(left/1000); const min=Math.floor(sec/60),s=sec%60; span.textContent=`${String(min).padStart(2,'0')}:${String(s).padStart(2,'0')}`; if(sec<=60)timer.classList.add('warning'); if(left<=0){clearInterval(timerHandle);submit(true);}};
    timerHandle=setInterval(update,500); update();
    async function submit(auto=false){
      const form=document.getElementById('dr-form'); if(!form)return;
      const answers={}; q.forEach(x=>answers[x.id]=document.querySelector(`input[name="q_${x.id}"]:checked`)?.value||null);
      try{const result=await rpc('dr_arbitro_submeter_teste',{p_tentativa_id:attempt,p_respostas:answers}); const r=Array.isArray(result)?result[0]:result; clearInterval(timerHandle); root.innerHTML=`<div class="dr-result">Resultado: ${esc(r?.nota??0)} / ${esc(r?.total_perguntas??q.length)} — ${esc(r?.percentagem??0)}%${auto?' — submetido automaticamente por fim de tempo.':''}</div>`;}catch(e){alert(e.message||String(e));}
    }
    document.getElementById('dr-form').onsubmit=e=>{e.preventDefault();submit(false);};
  }

  async function refreshMember(){if(document.getElementById('dashboard')) await loadMember();}

  async function boot(){
    if(booted)return true;
    css();
    const c=client(); if(!c)return false;
    booted=true;
    try{await renderAdminDedicated();}catch(e){console.error(e);}
    try{await renderAdminIntegrated();}catch(e){console.error(e);}
    if(document.getElementById('dashboard')){try{await loadMember();}catch(e){console.error(e);}}
    return true;
  }

  window.NAF_DR_ARBITRO_START=async()=>{booted=false; if(!(await boot())){waitTimer=setInterval(()=>boot().then(ok=>{if(ok){clearInterval(waitTimer);waitTimer=null;}}),100);}};
  const auto=()=>{if(client())boot();else{waitTimer=setInterval(()=>boot().then(ok=>{if(ok){clearInterval(waitTimer);waitTimer=null;}}),100);}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',auto,{once:true});else auto();
})();
