/* NAF — Consolidação da Área de Sócios
   - Associação de Futebol: selector vindo da BD
   - Modalidade: selector
   - Categoria: selector dependente
   - Nº de sócio bloqueado para o sócio
   - Administração de nº de sócio / permissões
   - Email individual
   - Seleção/limpeza das listas administrativas
*/
(() => {
  'use strict';

  const supabase = () => window.__NAF_SUPABASE;
  const $ = id => document.getElementById(id);

  const CATEGORIAS = {
    Futebol: ['C1','C2','C3','C4','C4 Core','C5','C6','C7','Cj','CF1','CF2','CF3','CF4'],
    Futsal: ['C1','C2','C3','C4','C5','C6','C7','Cj','CFF1','CFF2']
  };

  const FALLBACK_AF = [
    'AF Algarve','AF Angra do Heroísmo','AF Aveiro','AF Beja','AF Braga',
    'AF Bragança','AF Castelo Branco','AF Coimbra','AF Évora','AF Guarda',
    'AF Horta','AF Leiria','AF Lisboa','AF Madeira','AF Ponta Delgada',
    'AF Portalegre','AF Porto','AF Santarém','AF Setúbal','AF Viana do Castelo',
    'AF Vila Real','AF Viseu'
  ];

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]
  );

  const msg = (text, type='sucesso') => {
    const el=$('socio-message');
    if (!el) return;
    el.textContent=text;
    el.className=`socio-message ${type}`;
    el.hidden=false;
  };

  async function rpc(name, args={}) {
    const client=supabase();
    if (!client) throw new Error('Ligação à BD indisponível.');
    const {data,error}=await client.rpc(name,args);
    if(error) throw error;
    return data;
  }

  async function associations() {
    try {
      const rows=await rpc('lista_associacoes_futebol');
      if(Array.isArray(rows)&&rows.length) return rows.map(r=>r.nome);
    } catch(e) {
      console.warn('Associações: fallback local.',e);
    }
    return FALLBACK_AF;
  }

  function makeSelect(id, name, options, value='') {
    const old=$(id);
    if(!old) return null;
    if(old.tagName==='SELECT') {
      old.innerHTML=options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
      old.value=value||'';
      return old;
    }
    const select=document.createElement('select');
    select.id=id;
    select.name=name;
    select.required=true;
    select.innerHTML=options.map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('');
    select.value=value||'';
    old.replaceWith(select);
    return select;
  }

  async function installArbitragem() {
    const form=$('arbitragem-edit-form');
    if(!form) return;

    const afValues=await associations();

    const af=makeSelect(
      'edit-af',
      'associacao_futebol',
      ['','',...afValues].filter((v,i,a)=>a.indexOf(v)===i).map(v=>v||'Selecionar Associação de Futebol'),
      ''
    );
    if(af) {
      af.required=true;
      if(!af.dataset.nafBound) {
        af.dataset.nafBound='1';
        // primeiro option é apenas placeholder
        af.options[0].disabled=false;
      }
    }

    const modalidade=makeSelect(
      'edit-modalidade',
      'modalidade',
      ['','Futebol','Futsal'].map(v=>v||'Selecionar modalidade'),
      ''
    );
    if(modalidade) {
      modalidade.required=true;
      const categoriaOld=$('edit-categoria');
      let categoria=categoriaOld;
      if(!categoria) {
        const label=document.createElement('label');
        label.id='edit-categoria-label';
        label.innerHTML='<span>Categoria</span><select id="edit-categoria" name="categoria" required></select>';
        (modalidade.closest('label')||form.querySelector('.socio-edit-grid')).appendChild(label);
        categoria=$('edit-categoria');
      }
      const fill=selected=>{
        const list=CATEGORIAS[modalidade.value]||[];
        categoria.innerHTML='<option value="">Selecionar categoria</option>'+
          list.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
        categoria.disabled=!modalidade.value;
        if(selected&&list.includes(selected)) categoria.value=selected;
      };
      if(!modalidade.dataset.nafBound) {
        modalidade.dataset.nafBound='1';
        modalidade.addEventListener('change',()=>fill(''));
      }
      const current=window.__NAF_CURRENT_ARBITRAGEM||{};
      modalidade.value=current.modalidade||modalidade.value||'';
      fill(current.categoria||categoria.value||'');
      if(af) af.value=current.associacao_futebol||af.value||'';
    }

    const client=supabase();
    if(client && !form.dataset.nafValuesLoaded) {
      form.dataset.nafValuesLoaded='1';
      try {
        const {data:u}=await client.auth.getUser();
        if(u?.user?.id) {
          const {data:s}=await client.from('socios')
            .select('numero_arbitro,associacao_futebol,modalidade,categoria')
            .eq('user_id',u.user.id).eq('ativo',true).single();
          if(s) {
            window.__NAF_CURRENT_ARBITRAGEM=s;
            $('edit-arbitro').value=s.numero_arbitro||'';
            if(af) af.value=s.associacao_futebol||'';
            if(modalidade) {
              modalidade.value=s.modalidade||'';
              const cat=$('edit-categoria');
              if(cat) {
                const list=CATEGORIAS[modalidade.value]||[];
                cat.innerHTML='<option value="">Selecionar categoria</option>'+
                  list.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
                cat.disabled=!modalidade.value;
                cat.value=s.categoria||'';
              }
            }
          }
        }
      } catch(e){console.error('Arbitragem:',e)}
    }
  }

  async function saveArbitragem(event) {
    const form=event.currentTarget;
    const modalidade=$('edit-modalidade')?.value||'';
    const categoria=$('edit-categoria')?.value||'';
    const associacao=$('edit-af')?.value||'';
    const numero=$('edit-arbitro')?.value?.trim()||'';

    if(!CATEGORIAS[modalidade]) throw new Error('Seleciona Futebol ou Futsal.');
    if(!CATEGORIAS[modalidade].includes(categoria)) throw new Error('Seleciona uma categoria válida.');
    if(!associacao||!FALLBACK_AF.includes(associacao)) throw new Error('Seleciona uma Associação de Futebol válida.');

    const data=await rpc('atualizar_dados_arbitragem_socio',{
      p_numero_arbitro:numero||null,
      p_associacao_futebol:associacao,
      p_modalidade:modalidade,
      p_categoria:categoria
    });

    window.__NAF_CURRENT_ARBITRAGEM=data;
    if($('dados-arbitro')) $('dados-arbitro').textContent=data.numero_arbitro||'—';
    if($('dados-af')) $('dados-af').textContent=data.associacao_futebol||'—';
    if($('dados-modalidade')) $('dados-modalidade').textContent=data.modalidade||'—';
    let cv=$('dados-categoria');
    if(!cv) {
      const block=document.createElement('div');
      block.innerHTML='<span>Categoria</span><strong id="dados-categoria">—</strong>';
      $('arbitragem-view')?.appendChild(block);
      cv=$('dados-categoria');
    }
    if(cv) cv.textContent=data.categoria||'—';

    $('arbitragem-edit-form').hidden=true;
    $('arbitragem-view').hidden=false;
    $('editar-arbitragem-btn').hidden=false;
    msg('Dados de arbitragem atualizados.','sucesso');
  }

  async function loadAdmin() {
    const panel=$('admin-panel');
    if(!panel||panel.hidden) return;
    let rows;
    try { rows=await rpc('admin_listar_socios'); }
    catch(e){ console.error(e); return; }

    const root=$('admin-socios-lista');
    if(!root) return;

    root.innerHTML=(rows||[]).map(s=>`
      <div class="admin-socio-row naf-admin-row" data-id="${esc(s.id)}">
        <input class="admin-socio-select" type="checkbox" value="${esc(s.id)}" data-name="${esc(s.nome)}">
        <span class="admin-socio-numero">${esc(s.numero_socio)}</span>
        <span class="admin-socio-main">
          <strong>${esc(s.nome)}</strong>
          <small>${esc(s.email||'Sem email')} · ${s.ativo?'Ativo':'Inativo'}</small>
        </span>
        <div class="naf-admin-tools">
          <input class="naf-admin-number" type="number" min="1" value="${esc(s.numero_socio)}" title="Número de sócio">
          <button type="button" class="admin-small-btn naf-save-number">Guardar nº</button>
          <button type="button" class="admin-small-btn naf-email">Email</button>
          <label class="naf-admin-toggle">
            <input type="checkbox" class="naf-admin-checkbox" ${s.is_admin?'checked':''}>
            Admin
          </label>
        </div>
      </div>
    `).join('')||'<div class="vazio">Ainda não existem sócios.</div>';

    root.querySelectorAll('.naf-save-number').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=btn.closest('.naf-admin-row');
      try {
        btn.disabled=true;
        await rpc('admin_alterar_numero_socio',{
          p_socio_id:row.dataset.id,
          p_novo_numero:Number(row.querySelector('.naf-admin-number').value)
        });
        msg('Número de sócio atualizado.','sucesso');
        await loadAdmin();
      } catch(e){msg(e.message||'Não foi possível alterar o número.','erro')}
      finally{btn.disabled=false}
    }));

    root.querySelectorAll('.naf-admin-checkbox').forEach(cb=>cb.addEventListener('change',async()=>{
      const row=cb.closest('.naf-admin-row');
      try {
        cb.disabled=true;
        await rpc('admin_definir_admin',{p_socio_id:row.dataset.id,p_is_admin:cb.checked});
        msg(cb.checked?'Administrador atribuído.':'Administrador retirado.','sucesso');
        await loadAdmin();
      } catch(e) {
        cb.checked=!cb.checked;
        msg(e.message||'Não foi possível alterar a permissão.','erro');
      } finally {cb.disabled=false}
    }));

    root.querySelectorAll('.naf-email').forEach(btn=>btn.addEventListener('click',async()=>{
      const row=btn.closest('.naf-admin-row');
      const socio=(rows||[]).find(x=>x.id===row.dataset.id);
      if(!socio) return;
      const subject=prompt('Assunto do email:', 'Comunicação — Núcleo Marques Bom');
      if(subject===null) return;
      const message=prompt(`Mensagem para ${socio.nome}:`,'');
      if(message===null) return;
      if(!message.trim()) return msg('O conteúdo do email não pode ficar vazio.','erro');
      try {
        btn.disabled=true;
        const {data,error}=await supabase().functions.invoke('admin-mail',{
          body:{action:'individual',socio_id:socio.id,subject,message}
        });
        if(error) throw error;
        if(data?.error) throw new Error(data.error);
        msg(`Email enviado para ${socio.email}.`,'sucesso');
      } catch(e){msg(e.message||'Não foi possível enviar o email.','erro')}
      finally{btn.disabled=false}
    }));

    // Só o administrador principal pode ver/alterar o controlo Admin.
    const me=rows?.find(r=>r.user_id===window.__NAF_SUPABASE_USER_ID);
    if(me && String(me.email).toLowerCase()==='nucleomarquesbom@gmail.com') {
      root.querySelectorAll('.naf-admin-checkbox').forEach(cb=>cb.disabled=false);
    } else {
      root.querySelectorAll('.naf-admin-checkbox').forEach(cb=>cb.disabled=true);
    }

    const remove=$('admin-remove-socio');
    if(remove) remove.innerHTML=(rows||[]).filter(s=>s.ativo)
      .map(s=>`<option value="${esc(s.id)}">${esc(s.numero_socio)} — ${esc(s.nome)}</option>`).join('');
  }

  function installSelectionButtons() {
    $('admin-select-all')?.addEventListener('click',()=> {
      document.querySelectorAll('#admin-socios-lista .admin-socio-select').forEach(c=>c.checked=true);
      updateCount();
    });
    $('admin-clear-selection')?.addEventListener('click',()=> {
      document.querySelectorAll('#admin-socios-lista .admin-socio-select').forEach(c=>c.checked=false);
      updateCount();
    });
    $('admin-socios-lista')?.addEventListener('change',e=>{
      if(e.target.classList.contains('admin-socio-select')) updateCount();
    });
  }
  function updateCount(){
    const n=document.querySelectorAll('#admin-socios-lista .admin-socio-select:checked').length;
    const el=$('admin-selected-count');
    if(el) el.textContent=`${n} selecionado${n===1?'':'s'}`;
  }

  function boot(){
    const client=supabase();
    if(client) client.auth.getUser().then(r=>{window.__NAF_SUPABASE_USER_ID=r.data?.user?.id||null});
    installSelectionButtons();
    installArbitragem();
    const panel=$('admin-panel');
    if(panel){
      new MutationObserver(()=>{ if(!panel.hidden) loadAdmin(); }).observe(panel,{attributes:true,attributeFilter:['hidden']});
      if(!panel.hidden) loadAdmin();
    }
    $('editar-arbitragem-btn')?.addEventListener('click',()=>installArbitragem(),{capture:true});
    $('arbitragem-edit-form')?.addEventListener('submit',async e=>{
      e.preventDefault(); e.stopImmediatePropagation();
      const b=e.currentTarget.querySelector('button[type="submit"]');
      try{b.disabled=true;await saveArbitragem(e)}catch(err){msg(err.message||'Não foi possível guardar.','erro')}finally{b.disabled=false}
    },{capture:true});
    document.querySelectorAll('#admin-socios-lista').forEach(x=>x.addEventListener('click',()=>updateCount()));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
