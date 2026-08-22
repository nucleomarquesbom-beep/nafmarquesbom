import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function show(text, type='sucesso') {
  const el = $('socio-message');
  if (el) { el.textContent=text; el.className=`socio-message ${type}`; el.hidden=false; }
}

async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await sb.storage.from('questoes-socios').createSignedUrl(path, 3600);
  return error ? null : data?.signedUrl || null;
}

function injectSocioTab() {
  const dashboard = $('dashboard');
  const tabs = document.querySelector('.socio-tabs');
  if (!dashboard || !tabs || $('questoes')) return;

  const funTab = tabs.querySelector('[data-tab="funlearn"]');
  const button = document.createElement('button');
  button.type='button'; button.className='socio-tab'; button.dataset.tab='questoes'; button.textContent='Questões';
  funTab ? funTab.after(button) : tabs.append(button);

  const section = document.createElement('section');
  section.id='questoes'; section.className='socio-tab-content';
  section.innerHTML = `
    <div class="tab-heading-row"><div><h2>Questões</h2><p>Coloque uma questão ao Núcleo. Pode escrever, anexar um PDF ou usar os dois.</p></div></div>
    <form id="questao-form" class="questao-form">
      <label class="wide">Questão<textarea id="questao-texto" rows="6" maxlength="10000" placeholder="Escreva aqui a sua questão..."></textarea></label>
      <label class="upload-box">📄 Anexar PDF<input id="questao-file" type="file" accept="application/pdf"></label>
      <button class="botao" type="submit">Enviar questão</button>
      <div id="questao-result" class="admin-result" hidden></div>
    </form>
    <div class="questoes-title"><h3>As minhas questões</h3></div>
    <div id="questoes-list"><div class="vazio">A carregar…</div></div>`;
  dashboard.append(section);

  button.addEventListener('click', () => {
    document.querySelectorAll('.socio-tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.socio-tab-content').forEach(p=>{p.classList.remove('active'); if(p.id==='administracao')p.hidden=true;});
    button.classList.add('active'); section.classList.add('active');
    const select=$('socio-tab-select'); if(select){select.innerHTML=[...document.querySelectorAll('.socio-tab:not([hidden])')].map(b=>`<option value="${esc(b.dataset.tab)}">${esc(b.textContent)}</option>`).join('');select.value='questoes';}
    loadQuestions();
  });

  $('questao-form').addEventListener('submit', submitQuestion);
}

async function submitQuestion(e) {
  e.preventDefault();
  const text = $('questao-texto').value.trim();
  const file = $('questao-file').files?.[0];
  const result = $('questao-result');
  if (!text && !file) { result.textContent='Escreva uma questão ou carregue um PDF.'; result.hidden=false; return; }
  if (file && file.type !== 'application/pdf') { result.textContent='O anexo tem de ser PDF.'; result.hidden=false; return; }
  try {
    const { data:{session} } = await sb.auth.getSession();
    if (!session) throw new Error('Inicie sessão para enviar uma questão.');
    let path=null;
    if(file){
      path=`${session.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
      const {error}=await sb.storage.from('questoes-socios').upload(path,file,{contentType:'application/pdf',upsert:false});
      if(error)throw error;
    }
    const id=crypto.randomUUID();
    const {error}=await sb.rpc('socio_criar_questao',{p_id:id,p_texto:text||null,p_anexo_storage_path:path,p_anexo_nome:file?.name||null});
    if(error){if(path)await sb.storage.from('questoes-socios').remove([path]);throw error;}
    e.target.reset(); result.textContent='Questão enviada. O Núcleo foi notificado por email.'; result.hidden=false; result.className='admin-result success';
    await loadQuestions();
  } catch(err){ result.textContent=err.message||'Não foi possível enviar a questão.'; result.hidden=false; result.className='admin-result error'; }
}

async function loadQuestions() {
  const list=$('questoes-list'); if(!list)return;
  const {data,error}=await sb.from('questoes_socios').select('*').order('created_at',{ascending:false});
  if(error){list.innerHTML=`<div class="vazio">${esc(error.message)}</div>`;return;}
  if(!data?.length){list.innerHTML='<div class="vazio">Ainda não colocou nenhuma questão.</div>';return;}
  const cards=[];
  for(const q of data){
    const qa=q.anexo_storage_path?await signedUrl(q.anexo_storage_path):null;
    const ra=q.resposta_storage_path?await signedUrl(q.resposta_storage_path):null;
    cards.push(`<article class="questao-card"><div class="questao-meta"><strong>Questão</strong><span>${new Date(q.created_at).toLocaleString('pt-PT')}</span></div><div class="questao-text">${esc(q.texto||'Questão enviada em PDF.')}</div>${qa?`<a class="questao-pdf" target="_blank" rel="noopener" href="${qa}">📄 Abrir PDF da questão</a>`:''}<div class="questao-answer ${q.estado==='respondida'?'answered':''}"><div class="questao-meta"><strong>${q.estado==='respondida'?'Resposta do Núcleo':'A aguardar resposta'}</strong>${q.respondido_em?`<span>${new Date(q.respondido_em).toLocaleString('pt-PT')}</span>`:''}</div>${q.estado==='respondida'?`<div class="questao-text">${esc(q.resposta_texto||'Resposta enviada em PDF.')}</div>${ra?`<a class="questao-pdf" target="_blank" rel="noopener" href="${ra}">📄 Abrir PDF da resposta</a>`:''}`:''}</div></article>`);
  }
  list.innerHTML=cards.join('');
}

function replaceExcelButtons(){
  const panel=$('admin-socios-excel-panel'); if(!panel || panel.dataset.questionExcelBound==='1')return;
  const file=$('admin-socios-excel-file'); if(!file)return;
  panel.dataset.questionExcelBound='1';
  const oldPreview=$('admin-socios-excel-preview-btn'), oldImport=$('admin-excel-socios-import');
  if(!oldPreview||!oldImport)return;
  const preview=oldPreview.cloneNode(true), imp=oldImport.cloneNode(true);
  oldPreview.replaceWith(preview); oldImport.replaceWith(imp);
  preview.textContent='Validar Excel'; imp.textContent='Importar sócios'; imp.disabled=true;
  const load=()=>{ if(!window.XLSX){const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=()=>{};document.head.appendChild(s);} };
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const aliases={numero_socio:['nº de sócio','nº sócio','nº socio','numero socio','número sócio','numero_socio'],nome:['nome completo','nome'],nif:['nif'],data_nascimento:['data de nascimento','data nascimento'],naturalidade:['naturalidade'],cartao_cidadao:['cartão de cidadão','cartao de cidadao','cc'],profissao:['profissão','profissao'],morada:['morada completa','morada'],localidade:['localidade'],codigo_postal:['código postal','codigo postal'],telemovel:['telemóvel','telemovel','telefone'],email:['email','e-mail'],modalidade:['modalidade'],categoria:['categoria'],associacao_futebol:['associação distrital','associacao distrital','associação de futebol','associacao futebol']};
  let rows=[];
  const header=(hs,a)=>{const m=new Map(hs.map(h=>[norm(h),h]));for(const x of a)if(m.has(norm(x)))return m.get(norm(x));return null;};
  preview.addEventListener('click',async()=>{try{load();if(!window.XLSX)throw new Error('A carregar o leitor Excel. Tenta novamente.');const f=file.files?.[0];if(!f)throw new Error('Seleciona um ficheiro Excel.');const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});if(!data.length)throw new Error('A primeira folha está vazia.');const hs=Object.keys(data[0]);const h={};for(const k in aliases)h[k]=header(hs,aliases[k]);for(const k of ['numero_socio','nome','email','modalidade','categoria'])if(!h[k])throw new Error(`Falta a coluna ${k}.`);const errors=[];rows=data.map((r,i)=>{const x={};for(const k in h)x[k]=String(r[h[k]]??'').trim();x.numero_socio=Number(x.numero_socio);if(!Number.isInteger(x.numero_socio)||x.numero_socio<=0||x.numero_socio===9999)errors.push(`Linha ${i+2}: Nº de Sócio inválido.`);if(!x.nome)errors.push(`Linha ${i+2}: Nome vazio.`);if(!x.email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email))errors.push(`Linha ${i+2}: Email inválido.`);return x;}).filter(x=>x.numero_socio);$('admin-excel-socios-summary').textContent=`${data.length} linhas · ${rows.length} válidas · ${errors.length} erros`;$('admin-excel-socios-preview').innerHTML=[...rows.slice(0,100).map(x=>`<div class="admin-excel-preview-row"><strong>${esc(x.numero_socio)}</strong><span>${esc(x.nome)}</span><span>${esc(x.modalidade)} · ${esc(x.categoria)}</span><span>${esc(x.email)}</span></div>`),...errors.slice(0,50).map(x=>`<div class="admin-excel-preview-row admin-excel-error"><strong>ERRO</strong><span>${esc(x)}</span></div>`)].join('');imp.disabled=errors.length>0||!rows.length;load();}catch(err){const r=$('admin-excel-socios-result');r.textContent=err.message;r.className='admin-result error';r.hidden=false;}});
  imp.addEventListener('click',async()=>{try{if(!rows.length)throw new Error('Valida primeiro o Excel.');imp.disabled=true;imp.textContent='A importar…';const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sessão de administrador expirada.');let ok=0,fail=0,details=[];for(let i=0;i<rows.length;i++){try{const {data,error}=await sb.functions.invoke('criar-socio',{body:rows[i]});if(error)throw error;if(data?.error)throw new Error(data.error);ok++;}catch(err){fail++;details.push(`${rows[i].numero_socio} — ${rows[i].nome}: ${err.message||err}`);}const prog=$('admin-excel-socios-progress');if(prog)prog.value=Math.round(((i+1)/rows.length)*100);const st=$('admin-excel-socios-status');if(st)st.textContent=`${i+1}/${rows.length} processados`; }const r=$('admin-excel-socios-result');r.textContent=`Importação concluída: ${ok} criado(s), ${fail} com erro.${details.length?' '+details.slice(0,5).join(' | '):''}`;r.className=`admin-result ${fail?'error':'success'}`;r.hidden=false;rows=[];imp.disabled=true;imp.textContent='Importar sócios';if(typeof window.loadMembers==='function')await window.loadMembers();}catch(err){const r=$('admin-excel-socios-result');r.textContent=err.message;r.className='admin-result error';r.hidden=false;imp.disabled=false;imp.textContent='Importar sócios';}});
}

function boot(){
  injectSocioTab();
  replaceExcelButtons();
}
new MutationObserver(boot).observe(document.documentElement,{childList:true,subtree:true});
setTimeout(boot,250);setTimeout(boot,1000);setTimeout(boot,2500);
window.addEventListener('load',boot);
