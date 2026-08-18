import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const state={user:null,socio:null,drEdicao:null};

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];

function escapeHtml(value=''){
 return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function showScreen(id){
 $$('.screen').forEach(x=>x.classList.remove('on'));
 const el=$(id); if(!el){console.error('Ecrã não encontrado:',id);return;}
 el.classList.add('on');
 $$('.bottom [data-screen]').forEach(x=>x.classList.toggle('on',x.dataset.screen===id));
 if(id!=='login') $('bottom').hidden=false;
 closeMenu(); window.scrollTo({top:0,behavior:'smooth'});
}
function openMenu(){ $('sheet')?.classList.add('open'); }
function closeMenu(){ $('sheet')?.classList.remove('open'); }
function showLoginMessage(message,type=''){
 const el=$('login-msg'); if(!el)return;
 el.textContent=message||''; el.className=`notice ${type}`.trim(); el.hidden=!message;
}
async function getSession(){
 const {data,error}=await supabase.auth.getSession();
 if(error)throw error;
 return data.session||null;
}
async function validateSocioAccess(){
 const {data,error}=await supabase.rpc('validar_acesso_socio');
 if(error)throw error;
 const result=Array.isArray(data)?data[0]:data;
 if(!result?.permitido)throw new Error(result?.motivo||'O acesso à área de sócio está inativo.');
 state.socio=result.socio||null;
 if(!state.socio?.id){
  const fallback=await supabase.from('socios').select('*').eq('user_id',state.user.id).eq('ativo',true).single();
  if(fallback.error)throw fallback.error;
  state.socio=fallback.data;
 }
 if(!state.socio?.id)throw new Error('Sócio não encontrado.');
}
function renderProfile(){
 const s=state.socio;if(!s)return;
 $('member-name').textContent=`Olá, ${s.nome||'Sócio'} 👋`;
 $('member-number').textContent=s.numero_socio?`Sócio nº ${s.numero_socio}`:'Área reservada';
 $('profile-list').innerHTML=`
 <div class="row"><div><strong>Nome</strong></div><small>${escapeHtml(s.nome||'—')}</small></div>
 <div class="row"><div><strong>N.º de sócio</strong></div><small>${escapeHtml(s.numero_socio??'—')}</small></div>
 <div class="row"><div><strong>Email</strong></div><small>${escapeHtml(s.email||state.user?.email||'—')}</small></div>
 <div class="row"><div><strong>Telemóvel</strong></div><small>${escapeHtml(s.telemovel||'—')}</small></div>`;
 $('arb-list').innerHTML=`
 <div class="row"><div><strong>N.º árbitro</strong></div><small>${escapeHtml(s.numero_arbitro||'—')}</small></div>
 <div class="row"><div><strong>Associação de Futebol</strong></div><small>${escapeHtml(s.associacao_futebol||'—')}</small></div>
 <div class="row"><div><strong>Modalidade</strong></div><small>${escapeHtml(s.modalidade||'—')}</small></div>
 <div class="row"><div><strong>Categoria</strong></div><small>${escapeHtml(s.categoria||'—')}</small></div>`;
}
async function loadFunSummary(){
 try{
  const {data,error}=await supabase.from('funlearn_pontos').select('pontos').eq('socio_id',state.socio.id);
  if(error)throw error;
  const total=(data||[]).reduce((s,r)=>s+Number(r.pontos||0),0);
  $('fun-pill').textContent=`${total} pontos`; $('fun-total').textContent=total;
 }catch(e){console.error('Fun&Learn:',e);$('fun-pill').textContent='Ver pontos';}
}
async function loadFunHistory(){
 const root=$('fun-history');root.innerHTML='<div class="card">A carregar…</div>';
 try{
  const {data,error}=await supabase.from('funlearn_pontos').select('pontos,descricao,atividade,created_at').eq('socio_id',state.socio.id).order('created_at',{ascending:false});
  if(error)throw error;
  const rows=data||[];$('fun-total').textContent=rows.reduce((s,r)=>s+Number(r.pontos||0),0);
  root.innerHTML=rows.length?rows.map(r=>`<div class="row"><div><strong>${escapeHtml(r.atividade||'Fun&Learn')}</strong><small>${escapeHtml(r.descricao||'')}${r.created_at?` · ${new Date(r.created_at).toLocaleDateString('pt-PT')}`:''}</small></div><span class="badge">+${Number(r.pontos||0)}</span></div>`).join(''):'<div class="card">Ainda não existem movimentos.</div>';
 }catch(e){console.error('Fun&Learn history:',e);root.innerHTML='<div class="card">Não foi possível carregar o histórico.</div>';}
}
async function loadQuotas(){
 const root=$('quota-list');root.innerHTML='<div class="card">A carregar quotas…</div>';
 try{
  const {data,error}=await supabase.from('quotas').select('ano,mes,valor,estado,pago').eq('socio_id',state.socio.id).order('ano',{ascending:false}).order('mes',{ascending:false,nullsFirst:false});
  if(error)throw error;
  const names=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const rows=data||[];
  root.innerHTML=rows.length?rows.map(r=>{
   const v=String(r.estado||'').toLowerCase();
   const paid=r.pago===true||['pago','paga','regularizado','regularizada','liquidado','liquidada'].includes(v);
   const late=['em_atraso','em atraso','atrasado','atrasada','vencido','vencida'].includes(v);
   const period=r.mes?`${names[Number(r.mes)-1]||''} ${r.ano}`:`${r.ano}`;
   const label=paid?'Paga':late?'Em atraso':'Pendente';
   const cls=paid?'ok':late?'late':'';
   return `<div class="row"><div><strong>${escapeHtml(period)}</strong><small>${new Intl.NumberFormat('pt-PT',{style:'currency',currency:'EUR'}).format(Number(r.valor||0))}</small></div><span class="badge ${cls}">${label}</span></div>`;
  }).join(''):'<div class="card">Não existem quotas registadas.</div>';
 }catch(e){console.error('Quotas:',e);root.innerHTML='<div class="card">Não foi possível carregar as quotas.</div>';}
}
async function loadDocuments(){
 const root=$('docs-list');root.innerHTML='<div class="card">A carregar documentos…</div>';
 try{
  const {data,error}=await supabase.from('documentos_socios').select('nome_ficheiro,storage_path,created_at').eq('socio_id',state.socio.id).order('created_at',{ascending:false});
  if(error)throw error;
  const rows=data||[];
  root.innerHTML=rows.length?rows.map(r=>`<div class="row"><div><strong>📄 ${escapeHtml(r.nome_ficheiro||'Documento PDF')}</strong><small>${r.created_at?new Date(r.created_at).toLocaleDateString('pt-PT'):''}</small></div><button class="btn secondary" type="button" data-path="${escapeHtml(r.storage_path||'')}">Abrir</button></div>`).join(''):'<div class="card">Ainda não existem documentos.</div>';
  root.querySelectorAll('[data-path]').forEach(btn=>btn.addEventListener('click',async()=>{
   const path=btn.dataset.path;if(!path)return;
   try{
    btn.disabled=true;
    const {data,error}=await supabase.storage.from('documentos-socios').createSignedUrl(path,3600);
    if(error||!data?.signedUrl)throw error||new Error('Documento indisponível.');
    window.open(data.signedUrl,'_blank','noopener');
   }catch(e){console.error('Documento:',e);alert('Não foi possível abrir o documento.');}
   finally{btn.disabled=false;}
  }));
 }catch(e){console.error('Documentos:',e);root.innerHTML='<div class="card">Não foi possível carregar os documentos.</div>';}
}
async function detectDr(){
 try{
  const {data,error}=await supabase.from('dr_arbitro_edicoes').select('id,nome,numero_edicao,ativo,dr_arbitro_modalidades(nome,codigo)').eq('ativo',true).order('numero_edicao',{ascending:false}).limit(1);
  if(error)throw error;
  state.drEdicao=data?.[0]||null;
  $('dr-card').hidden=!state.drEdicao;
  if(!state.drEdicao)return;
  const m=state.drEdicao.dr_arbitro_modalidades?.nome||'';
  $('dr-sub').textContent=`${state.drEdicao.nome||'Edição ativa'}${m?` · ${m}`:''}`;
  $('dr-info').innerHTML=`<strong style="color:var(--roxo)">${escapeHtml(state.drEdicao.nome||'Drº Árbitro')}</strong><div style="margin-top:6px;color:var(--suave);font-size:11px">${state.drEdicao.numero_edicao?`${Number(state.drEdicao.numero_edicao)}.ª edição`:''}${m?` · ${escapeHtml(m)}`:''}</div>`;
 }catch(e){console.error('Drº Árbitro:',e);$('dr-card').hidden=true;}
}
async function login(event){
 event.preventDefault();
 try{
  showLoginMessage('A entrar…');
  const {error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error)throw error;
  const current=await getSession();if(!current?.user)throw new Error('Não foi possível recuperar a sessão.');
  state.user=current.user;await validateSocioAccess();
  renderProfile();await Promise.all([loadFunSummary(),detectDr()]);
  showScreen('home');showLoginMessage('');
 }catch(e){console.error('Login:',e);showLoginMessage(e.message||'Falha no acesso.','error');}
}
async function restoreSession(){
 try{
  const current=await getSession();if(!current?.user)return;
  state.user=current.user;await validateSocioAccess();
  renderProfile();await Promise.all([loadFunSummary(),detectDr()]);showScreen('home');
 }catch(e){console.error('Sessão:',e);await supabase.auth.signOut();}
}
async function logout(){await supabase.auth.signOut();location.reload();}
function openExistingDr(){location.href='./socio.html#dr-arbitro';}
function setupNavigation(){
 $$('.bottom [data-screen]').forEach(btn=>btn.addEventListener('click',async()=>{
  const screen=btn.dataset.screen;showScreen(screen);
  if(screen==='quotas')await loadQuotas();
  if(screen==='docs')await loadDocuments();
 }));
 $('fun-card').addEventListener('click',async()=>{showScreen('fun');await loadFunHistory();});
 $('dr-card').addEventListener('click',()=>showScreen('dr'));
 $('dr-open').addEventListener('click',openExistingDr);
 $$('.menuitem[data-menu]').forEach(btn=>btn.addEventListener('click',async()=>{
  const screen=btn.dataset.menu;showScreen(screen);
  if(screen==='quotas')await loadQuotas();
  if(screen==='docs')await loadDocuments();
 }));
 $('open-menu').addEventListener('click',openMenu);$('bottom-menu').addEventListener('click',openMenu);$('close-menu').addEventListener('click',closeMenu);
 $('sheet').addEventListener('click',e=>{if(e.target.id==='sheet')closeMenu();});
 $('logout').addEventListener('click',logout);$('menu-logout').addEventListener('click',logout);
}
function setupInstallPrompt(){
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('install-box').hidden=false;});
 $('install-btn').addEventListener('click',async()=>{
  if(!deferredInstallPrompt)return;
  deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('install-box').hidden=true;
 });
 window.addEventListener('appinstalled',()=>{$('install-box').hidden=true;});
}
setupNavigation();setupInstallPrompt();$('login-form').addEventListener('submit',login);restoreSession();
