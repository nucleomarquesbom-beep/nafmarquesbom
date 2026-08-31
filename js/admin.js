(() => {
  'use strict';

  const cfg = window.NAF_ADMIN_CONFIG || {};
  const state = { supabase: null, user: null, members: [], pdfRows: [] };
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
  const money = (v) => `${Number(v || 0).toFixed(2).replace('.', ',')} €`;

  function show(message, type = 'success') {
    const el = $('admin-result');
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }
  function fail(error) { console.error(error); show(error?.message || String(error), 'error'); }
  function assertConfig() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) throw new Error('Configuração Supabase incompleta.');
  }
  function getSharedClient() {
    if (window.__NAF_SUPABASE) return window.__NAF_SUPABASE;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase?.createClient && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      window.__NAF_SUPABASE = client;
      window.supabaseClient = client;
      return client;
    }
    return null;
  }
  function normalizeMember(m, points = 0) {
    return { id:m.id, numero:m.numero_socio ?? '', nome:m.nome ?? '', email:m.email ?? '', ativo:m.ativo === true, is_admin:m.is_admin === true, pontos:Number(points)||0, quotas:false, meses_atraso:0, valor_atraso:0, raw:m };
  }

  async function loadMembers() {
    const body=$('members-body');
    if(body) body.innerHTML='<tr><td colspan="8" class="admin-loading">A carregar…</td></tr>';
    if(!state.supabase) throw new Error('Ligação ao Supabase indisponível.');
    const {data,error}=await state.supabase.rpc('admin_listar_socios');
    if(error) throw error;
    const members=(data||[]).map(m=>normalizeMember(m));
    const ids=members.map(m=>m.id);
    if(ids.length){
      const [{data:points,error:pe},{data:quotas,error:qe}]=await Promise.all([
        state.supabase.from('funlearn_pontos').select('socio_id,pontos').in('socio_id',ids),
        state.supabase.from('quotas').select('socio_id,ano,mes,valor,pago,estado').in('socio_id',ids)
      ]);
      if(pe) throw pe; if(qe) throw qe;
      const totals=new Map(); for(const p of points||[]) { const k=String(p.socio_id); totals.set(k,(totals.get(k)||0)+Number(p.pontos||0)); }
      const current=new Date(); const currentMonth=new Date(current.getFullYear(),current.getMonth(),1); const overdue=new Map();
      for(const q of quotas||[]){ if(!q.mes) continue; const d=new Date(Number(q.ano),Number(q.mes)-1,1); const estado=String(q.estado||'pendente').toLowerCase(); const unpaid=q.pago!==true&&!['pago','paga','isento','anulado'].includes(estado); if(unpaid&&d<currentMonth){const k=String(q.socio_id);const x=overdue.get(k)||{months:0,value:0};x.months++;x.value+=Number(q.valor||0);overdue.set(k,x);} }
      for(const m of members){const x=overdue.get(String(m.id))||{months:0,value:0};m.pontos=totals.get(String(m.id))||0;m.quotas=x.months>0;m.meses_atraso=x.months;m.valor_atraso=x.value;}
    }
    state.members=members; renderMembers(); renderFunlearnSelects(); updateKpis();
    if(typeof window.initCriarSocio==='function') window.initCriarSocio();
    await loadAdminPermissions();
  }
  window.loadMembers=loadMembers;

  function renderMembers(){
    const q=($('member-search')?.value||'').trim().toLowerCase(); const status=$('member-status')?.value||''; const selected=new Set([...document.querySelectorAll('.member-check:checked')].map(x=>x.value));
    const rows=state.members.filter(m=>{const matchesText=!q||`${m.numero} ${m.nome} ${m.email}`.toLowerCase().includes(q);const matchesStatus=!status||(status==='ativo'?m.ativo:!m.ativo);return matchesText&&matchesStatus;});
    const body=$('members-body'); if(!body)return;
    body.innerHTML=rows.length?rows.map(m=>{
      const quotaHtml=m.quotas?`<div class="quota-debt"><strong>${money(m.valor_atraso)}</strong><span>${m.meses_atraso} ${m.meses_atraso===1?'mês':'meses'} em atraso</span></div>`:'<span class="quota-ok">Em dia</span>';
      return `<tr><td><input class="admin-check member-check" type="checkbox" value="${esc(m.id)}" ${selected.has(String(m.id))?'checked':''}></td><td><strong>${esc(m.numero)}</strong></td><td><strong>${esc(m.nome)}</strong></td><td>${esc(m.email||'Sem email')}</td><td>${m.ativo?'<span class="status-ok">Ativo</span>':'<span class="status-off">Inativo</span>'}${m.is_admin?' <span class="admin-badge">Admin</span>':''}</td><td>${quotaHtml}</td><td><strong>${m.pontos}</strong></td><td class="member-actions"><button type="button" class="admin-small-btn primary manual-quota-open" data-id="${esc(m.id)}">Pagamento</button><button type="button" class="admin-small-btn member-number-open" data-id="${esc(m.id)}" data-number="${esc(m.numero)}">Editar nº</button></td></tr>`;
    }).join(''):'<tr><td colspan="8" class="admin-loading">Nenhum sócio encontrado.</td></tr>';
    updateSelectedCount();
  }
  function renderFunlearnSelects(){for(const id of ['funlearn-add-member','funlearn-remove-member']){const select=$(id);if(!select)continue;const current=select.value;select.innerHTML=state.members.filter(m=>m.ativo).map(m=>`<option value="${esc(m.id)}">${esc(m.numero)} — ${esc(m.nome)} (${m.pontos} pts)</option>`).join('');if(current&&[...select.options].some(o=>o.value===current))select.value=current;}}
  function updateSelectedCount(){const el=$('selected-count');if(el)el.textContent=`${document.querySelectorAll('.member-check:checked').length} selecionados`;}
  function updateKpis(){ $('kpi-total')?.replaceChildren(document.createTextNode(String(state.members.length))); $('kpi-ativos')?.replaceChildren(document.createTextNode(String(state.members.filter(m=>m.ativo).length))); $('kpi-atrasos')?.replaceChildren(document.createTextNode(String(state.members.filter(m=>m.quotas).length))); $('kpi-pontos')?.replaceChildren(document.createTextNode(String(state.members.reduce((s,m)=>s+m.pontos,0)))); }

  async function parsePdf(){
    const file=$('pdf-file')?.files?.[0]; if(!file)throw new Error('Seleciona primeiro um PDF.'); if(file.type!=='application/pdf')throw new Error('O ficheiro tem de ser PDF.');
    const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
    const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise; const rows=[];
    for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const text=await page.getTextContent();const lines=new Map();for(const item of text.items){const value=String(item.str||'').trim();if(!value)continue;const y=Math.round(item.transform?.[5]||0);if(!lines.has(y))lines.set(y,[]);lines.get(y).push(value);}for(const parts of [...lines.entries()].sort((a,b)=>b[0]-a[0]).map(x=>x[1].join(' ').replace(/\s+/g,' ').trim())){const m=parts.match(/^\s*(\d{1,6})\s+(.+)$/);if(!m)continue;const numero=Number(m[1]);const nome=m[2].trim();if(Number.isInteger(numero)&&numero>0&&numero!==9999&&nome.length>=3)rows.push({numero_socio:numero,nome});}const progress=$('pdf-progress')?.querySelector('span');if(progress)progress.style.width=`${Math.round(p/pdf.numPages*100)}%`;}
    state.pdfRows=[...new Map(rows.map(r=>[String(r.numero_socio),r])).values()]; const preview=$('pdf-preview');if(preview)preview.innerHTML=state.pdfRows.length?state.pdfRows.map((r,i)=>`<div class="admin-preview-row"><span>${i+1}</span><strong>${r.numero_socio}</strong><span>${esc(r.nome)}</span></div>`).join(''):'<div class="admin-loading">Não foi possível extrair dados.</div>'; $('btn-import-pdf')&&( $('btn-import-pdf').disabled=!state.pdfRows.length );
  }
  async function importPdfRows(){if(!state.pdfRows.length)throw new Error('Não existem dados para importar.');const {data,error}=await state.supabase.rpc('admin_importar_socios_pdf',{p_rows:state.pdfRows});if(error)throw error;show(`${data?.importados??state.pdfRows.length} sócio(s) importado(s)/atualizado(s).`);state.pdfRows=[];$('btn-import-pdf')?.setAttribute('disabled','true');if($('pdf-preview'))$('pdf-preview').innerHTML='';if($('pdf-file'))$('pdf-file').value='';await loadMembers();}
  async function parseFunlearnPdf(){const file=$('funlearn-pdf')?.files?.[0];if(!file)throw new Error('Seleciona um PDF.');if(file.type!=='application/pdf')throw new Error('O ficheiro tem de ser PDF.');const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;const rows=[];for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const text=await page.getTextContent();const lines=new Map();for(const item of text.items){const value=String(item.str||'').trim();if(!value)continue;const y=Math.round(item.transform?.[5]||0);if(!lines.has(y))lines.set(y,[]);lines.get(y).push(value);}for(const parts of [...lines.entries()].sort((a,b)=>b[0]-a[0]).map(x=>x[1].join(' ').replace(/\s+/g,' ').trim())){const m=parts.match(/^\s*(\d{1,6})\s+(.+)$/);if(m)rows.push({numero_socio:Number(m[1]),nome:m[2].trim()});}}return [...new Map(rows.filter(r=>Number.isInteger(r.numero_socio)&&r.numero_socio>0&&r.numero_socio!==9999).map(r=>[r.numero_socio,r])).values()];}
  async function importFunlearnPdf(){const points=Number($('funlearn-pdf-points')?.value);const desc=$('funlearn-pdf-description')?.value.trim();if(!Number.isInteger(points)||points<=0)throw new Error('Os pontos por sócio têm de ser positivos.');const unique=await parseFunlearnPdf();if(!unique.length)throw new Error('Não foram encontrados sócios no PDF.');const result=await state.supabase.rpc('admin_funlearn_importar_pontos',{p_nomes:unique,p_pontos:points,p_nome_ficheiro:$('funlearn-pdf')?.files?.[0]?.name||'importacao.pdf',p_descricao:desc||null});if(result.error)throw result.error;const data=result.data||{};show(`${data.socios_encontrados??0} sócio(s) encontrados; ${data.pontos_atribuidos??0} ponto(s) atribuídos.`);$('funlearn-pdf').value='';$('funlearn-pdf-description').value='';await loadMembers();}
  async function sendPointsMail(member,action,extra){if(!member.email)return;await invokeEdge(cfg.EMAIL_FUNCTION,{action,socio:{id:member.id,nome:member.nome,email:member.email},...extra});}
  async function addFunlearnPoints(){const socioId=$('funlearn-add-member')?.value;const points=Number($('funlearn-add-points')?.value);const activity=$('funlearn-add-activity')?.value.trim()||'Fun&Learn';const desc=$('funlearn-add-description')?.value.trim();const member=state.members.find(x=>String(x.id)===String(socioId));if(!member)throw new Error('Seleciona um sócio.');if(!Number.isInteger(points)||points<=0)throw new Error('Os pontos têm de ser positivos.');if(!desc)throw new Error('Indica o motivo.');const result=await state.supabase.rpc('admin_funlearn_adicionar_pontos',{p_socio_id:socioId,p_pontos:points,p_atividade:activity,p_descricao:desc});if(result.error)throw result.error;await sendPointsMail(member,'pontos_adicionados',{pontos_adicionados:points,atividade:activity,descricao:desc});show(`Foram adicionados ${points} ponto(s) a ${member.nome}. Novo total: ${result.data}.`);$('funlearn-add-description').value='';await loadMembers();}
  async function removeFunlearnPoints(){const socioId=$('funlearn-remove-member')?.value;const points=Number($('funlearn-remove-points')?.value);const reason=$('funlearn-remove-reason')?.value.trim();const member=state.members.find(x=>String(x.id)===String(socioId));if(!member)throw new Error('Seleciona um sócio.');if(!Number.isInteger(points)||points<=0)throw new Error('Os pontos têm de ser positivos.');if(!reason)throw new Error('O motivo é obrigatório.');const result=await state.supabase.rpc('admin_funlearn_retirar_pontos',{p_socio_id:socioId,p_pontos:points,p_motivo:reason});if(result.error)throw result.error;await sendPointsMail(member,'pontos_retirados',{pontos_retirados:points,motivo:reason});show(`Foram retirados ${points} ponto(s) a ${member.nome}. Novo total: ${result.data}.`);$('funlearn-remove-reason').value='';await loadMembers();}
  async function editMemberNumber(id,current){const member=state.members.find(x=>String(x.id)===String(id));if(!member)return;const value=window.prompt(`Novo nº de sócio para ${member.nome}:`,String(current));if(value===null)return;const numero=Number(value.trim());if(!Number.isInteger(numero)||numero<=0||numero===9999)throw new Error('Número inválido.');const duplicate=state.members.find(x=>Number(x.numero)===numero&&String(x.id)!==String(id));if(duplicate)throw new Error(`O nº ${numero} já pertence a ${duplicate.nome}.`);const {error}=await state.supabase.rpc('admin_alterar_numero_socio',{p_socio_id:id,p_novo_numero:numero});if(error)throw error;show(`Nº de sócio alterado para ${numero}.`);await loadMembers();}
  function openManualQuota(id){const select=$('manual-quota-socio');if(select){select.value=String(id);if(select.value!==String(id)){const member=state.members.find(m=>String(m.id)===String(id));if(member){const option=document.createElement('option');option.value=member.id;option.textContent=`${member.numero} — ${member.nome}${member.email?` — ${member.email}`:''}`;select.appendChild(option);select.value=member.id;}}}$('panel-quotas')?.scrollIntoView({behavior:'smooth',block:'start'});$('manual-quota-valor')?.focus();$('manual-quota-valor')?.select();}
  function exportMembersExcel(){if(!state.members.length){show('Não existem sócios para exportar.','error');return;}const headers=['Nº Sócio','Nome','Email','Telemóvel','Estado','Administrador','Pontos Fun&Learn','Meses em atraso','Valor em atraso'];const lines=[headers.map(excelCell).join('\t')];for(const m of state.members)lines.push([m.numero,m.nome,m.email,m.raw?.telemovel||'',m.ativo?'Ativo':'Inativo',m.is_admin?'Sim':'Não',m.pontos,m.meses_atraso,Number(m.valor_atraso||0).toFixed(2)].map(excelCell).join('\t'));const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'application/vnd.ms-excel;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`socios-${new Date().toISOString().slice(0,10)}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);show(`${state.members.length} sócio(s) exportado(s) para Excel.`);}
  function excelCell(value){let text=String(value??'');if(/^[=+\-@]/.test(text))text=`'${text}`;return text.replace(/\t/g,' ').replace(/\r?\n/g,' ').replace(/\r/g,' ');}
  function selectedOverdueIds(){return [...document.querySelectorAll('.member-check:checked')].map(x=>String(x.value)).filter(id=>state.members.some(m=>String(m.id)===id&&m.quotas&&m.email));}
  async function sendOverdueSelected(){const ids=selectedOverdueIds();if(!ids.length)throw new Error('Seleciona pelo menos um sócio com quotas em atraso e email.');const subject=$('quota-subject')?.value?.trim()||'Quotas em atraso';const message=$('quota-message')?.value?.trim()||'';if(!message)throw new Error('Escreve a mensagem do aviso de quotas.');let sent=0;const failures=[];for(const id of ids){const member=state.members.find(m=>String(m.id)===id);if(!member?.email)continue;try{await invokeEdge(cfg.EMAIL_FUNCTION,{to:member.email,subject,text:message.replaceAll('{NOME}',member.nome||'sócio')});sent++;}catch(error){failures.push(`${member.nome}: ${error.message||error}`);}}if(failures.length)throw new Error(`${sent} aviso(s) enviado(s); ${failures.length} falharam. ${failures.slice(0,3).join(' | ')}`);show(`Avisos processados: ${sent} enviado(s).`);}
  async function fileToBase64(file){const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));return btoa(binary);}
  async function invokeEdge(name,payload){const {data,error}=await state.supabase.functions.invoke(name,{body:payload});if(error){let message=error.message||'Erro na função.';try{const body=await error.context?.json();if(body?.error)message=body.error;}catch{}throw new Error(message);}if(data?.error)throw new Error(data.error);return data;}
  async function sendDocument(){const file=$('mail-file')?.files?.[0];if(!file)throw new Error('Seleciona o documento.');if(file.size>10*1024*1024)throw new Error('O documento não pode ultrapassar 10 MB.');const subject=$('mail-subject')?.value.trim();const message=$('mail-message')?.value.trim();if(!subject||!message)throw new Error('Indica o assunto e escreve a mensagem.');const recipients=state.members.filter(m=>m.ativo&&m.email).map(m=>m.email);if(!recipients.length)throw new Error('Não existem sócios ativos com email.');let sent=0;const failures=[];const base64=await fileToBase64(file);for(const email of recipients){try{await invokeEdge(cfg.EMAIL_FUNCTION,{to:email,subject,text:message,attachment:{name:file.name,mime:file.type||'application/octet-stream',base64}});sent++;}catch(error){failures.push(`${email}: ${error.message||error}`);}}if(failures.length)throw new Error(`${sent} email(s) enviado(s); ${failures.length} falharam.`);show(`Documento enviado para ${sent} sócio(s).`);$('mail-file').value='';}
  async function loadAdminPermissions(){const tab=$('tab-admins'),panel=$('panel-admins');if(!tab||!panel)return;let root=false;try{const {data,error}=await state.supabase.rpc('is_root_admin');root=!error&&data===true;}catch{}if(!root){tab.hidden=true;panel.hidden=true;return;}tab.hidden=false;panel.hidden=false;const {data,error}=await state.supabase.rpc('admin_listar_permissoes_admin');if(error)throw error;const box=$('admin-permissions-list');if(!box)return;box.innerHTML=(data||[]).map(m=>`<div class="admin-preview-row admin-permission-row"><strong>${esc(m.numero_socio)}</strong><span>${esc(m.nome)}</span><span>${esc(m.email||'')}</span><span>${m.is_admin?'Administrador':'Sócio'}</span><button type="button" class="admin-small-btn ${m.is_admin?'danger':'primary'}" data-admin-toggle="${esc(m.id)}" data-admin-value="${m.is_admin?'false':'true'}">${m.is_admin?'Retirar admin':'Dar admin'}</button></div>`).join('')||'<div class="admin-loading">Não existem outros sócios.</div>';box.querySelectorAll('[data-admin-toggle]').forEach(btn=>{btn.onclick=async()=>{btn.disabled=true;try{const {error}=await state.supabase.rpc('admin_definir_admin',{p_socio_id:btn.dataset.adminToggle,p_is_admin:btn.dataset.adminValue==='true'});if(error)throw error;await loadMembers();show('Permissões de administrador atualizadas.');}catch(e){fail(e);}finally{btn.disabled=false;}};});}
  function bind(){
    const bindClick=(id,handler)=>$(id)?.addEventListener('click',()=>handler().catch?.(fail));
    bindClick('btn-refresh',loadMembers); bindClick('btn-refresh-list',loadMembers);
    $('member-search')?.addEventListener('input',renderMembers); $('member-status')?.addEventListener('change',renderMembers);
    $('btn-select-all')?.addEventListener('click',()=>{document.querySelectorAll('.member-check').forEach(x=>x.checked=true);updateSelectedCount();});
    $('btn-clear-selection')?.addEventListener('click',()=>{document.querySelectorAll('.member-check').forEach(x=>x.checked=false);updateSelectedCount();});
    $('members-body')?.addEventListener('change',updateSelectedCount);
    $('members-body')?.addEventListener('click',e=>{const payment=e.target.closest('.manual-quota-open');if(payment)openManualQuota(payment.dataset.id);const number=e.target.closest('.member-number-open');if(number)editMemberNumber(number.dataset.id,number.dataset.number).catch(fail);});
    $('btn-export-members-excel')?.addEventListener('click',exportMembersExcel);
    bindClick('btn-send-overdue-selected',sendOverdueSelected); bindClick('btn-send-document',sendDocument); bindClick('btn-parse-pdf',parsePdf); bindClick('btn-import-pdf',importPdfRows); bindClick('btn-funlearn-pdf',importFunlearnPdf); bindClick('btn-funlearn-add',addFunlearnPoints); bindClick('btn-funlearn-remove',removeFunlearnPoints);
    document.querySelectorAll('.admin-tab').forEach(btn=>{if(btn.dataset.nafBound==='1')return;btn.dataset.nafBound='1';btn.addEventListener('click',()=>{document.querySelectorAll('.admin-tab').forEach(x=>{x.classList.toggle('active',x===btn);x.setAttribute('aria-selected',String(x===btn));});document.querySelectorAll('.admin-tab-panel').forEach(x=>{const active=x.id===`panel-${btn.dataset.panel}`;x.classList.toggle('active',active);x.hidden=!active;});});});
  }
  async function init(){try{assertConfig();const shared=getSharedClient();if(!shared)throw new Error('Biblioteca/cliente Supabase não disponível.');state.supabase=shared;const {data:{session},error:sessionError}=await state.supabase.auth.getSession();if(sessionError)throw sessionError;state.user=session?.user||null;if(!state.user){$('admin-login-warning')?.removeAttribute('hidden');return;}const {data:isAdmin,error}=await state.supabase.rpc('is_admin');if(error)throw error;if(isAdmin!==true){$('admin-login-warning')?.removeAttribute('hidden');return;}$('admin-app')?.removeAttribute('hidden');bind();await loadMembers();}catch(e){fail(e);}}
  init();
})();
