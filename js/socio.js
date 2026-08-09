import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const state = { user:null, socio:null, admin:false };

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function msg(text,type='info',target='#socio-message'){
  const el=$(target); if(!el)return;
  el.textContent=text; el.className=`message ${type}`; el.hidden=false;
}
async function login(email,password){
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw error;
}
async function loadProfile(user){
  const {data,error}=await supabase.from('socios').select('*').eq('user_id',user.id).single();
  if(error)throw error;
  state.user=user; state.socio=data;
  state.admin=Number(data.numero_socio)===9999 && data.is_admin===true && data.ativo===true;
  render();
}
function render(){
  const s=state.socio;
  $('#login-panel').hidden=true; $('#dashboard').hidden=false;
  $('#socio-name').textContent=s.nome||'Sócio';
  $('#socio-number').textContent=s.numero_socio??'—';
  $('#profile-nome').value=s.nome||'';
  $('#profile-numero').value=s.numero_socio??'';
  $('#profile-email').value=s.email||state.user.email||'';
  $('#profile-telemovel').value=s.telemovel||'';
  $('#profile-nascimento').value=s.data_nascimento||'';
  $('#profile-morada').value=s.morada||'';
  $('#profile-arbitro').value=s.numero_arbitro||'';
  $('#profile-af').value=s.associacao_futebol||'';
  $('#profile-modalidade').value=s.modalidade||'';
  $('#profile-quotas').value=s.quotas||'';
  $('#admin-panel').hidden=!state.admin;
  loadPhoto(); loadDocuments(); loadFunlearn();
}
async function loadPhoto(){
  const path=state.socio.fotografia_path||state.socio.fotografia_url;
  const photo = $('#socio-photo');
  const placeholder = $('#socio-photo-placeholder');
  if(!path){
    photo.src='imagens/avatar-default.svg';
    photo.hidden=false;
    if(placeholder) placeholder.hidden=true;
    return;
  }
  const {data}=await supabase.storage.from('fotografias-socios').createSignedUrl(path,3600);
  if(data?.signedUrl){
    photo.src=data.signedUrl;
    photo.hidden=false;
    if(placeholder) placeholder.hidden=true;
  }
}
async function loadDocuments(){
  const {data,error}=await supabase.from('documentos_socios').select('*').eq('socio_id',state.socio.id).order('created_at',{ascending:false});
  if(error)return console.error(error);
  $('#docs-count').textContent=`${data.length} / 12`;
  $('#docs-list').innerHTML=data.length?data.map(d=>`<div class="documento-socio-item"><div>📄 <strong>${esc(d.nome_ficheiro)}</strong><small>${new Date(d.created_at).toLocaleDateString('pt-PT')}</small></div></div>`).join(''):'<div class="vazio">Ainda não existem documentos.</div>';
}
async function loadFunlearn(){
  const {data,error}=await supabase.from('funlearn_pontos').select('*').eq('socio_id',state.socio.id).order('created_at',{ascending:false});
  if(error)return console.error(error);
  const total=data.reduce((a,r)=>a+Number(r.pontos||0),0);
  $('#funlearn-total').textContent=total;
  $('#funlearn-history').innerHTML=data.length?data.map(r=>`<div class="fun-row"><div><strong>${esc(r.atividade||'Fun&Learn')}</strong><small>${esc(r.descricao||'')}</small></div><b>+${Number(r.pontos||0)}</b></div>`).join(''):'<div class="vazio">Ainda não existem movimentos de pontos.</div>';
}
async function updateProfile(e){
  e.preventDefault();
  const payload={
    email:$('#profile-email').value.trim(),
    telemovel:$('#profile-telemovel').value.trim(),
    data_nascimento:$('#profile-nascimento').value||null,
    morada:$('#profile-morada').value.trim(),
    numero_arbitro:$('#profile-arbitro').value.trim(),
    associacao_futebol:$('#profile-af').value.trim(),
    modalidade:$('#profile-modalidade').value.trim()
  };
  const {data,error}=await supabase.from('socios').update(payload).eq('id',state.socio.id).eq('user_id',state.user.id).select().single();
  if(error)throw error;
  state.socio=data; $('#socio-name').textContent=data.nome; msg('Dados atualizados.','sucesso');
}
async function createMember(e){
  e.preventDefault();
  const button=$('#new-member-submit'); button.disabled=true;
  try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Sessão expirada.');
    const payload={
      nome:$('#new-nome').value.trim(),
      numero_socio:Number($('#new-numero').value),
      email:$('#new-email').value.trim(),
      telemovel:$('#new-telemovel').value.trim()
    };
    const {data,error}=await supabase.functions.invoke('criar-socio',{body:payload});
    if(error)throw error;
    $('#new-member-form').reset();
    msg(`Sócio ${payload.numero_socio} criado. Foi enviado um convite para ${payload.email}.`,'sucesso','#admin-message');
  }catch(err){msg(err.message||'Não foi possível criar o sócio.','erro','#admin-message')}
  finally{button.disabled=false}
}
async function uploadPhoto(file){
  if(!file) return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('A fotografia deve ser JPG, PNG ou WEBP.');
  const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
  const path=`${state.socio.id}/fotografia.${ext}`;
  const {error}=await supabase.storage.from('fotografias-socios').upload(path,file,{contentType:file.type,upsert:true});
  if(error)throw error;
  const {error:dbError}=await supabase.from('socios').update({fotografia_path:path}).eq('id',state.socio.id).eq('user_id',state.user.id);
  if(dbError)throw dbError;
  state.socio.fotografia_path=path; await loadPhoto();
}
async function uploadPdf(file){
  if(!file||file.type!=='application/pdf')throw new Error('Só são permitidos ficheiros PDF.');
  const {count,error}=await supabase.from('documentos_socios').select('*',{count:'exact',head:true}).eq('socio_id',state.socio.id);
  if(error)throw error; if((count||0)>=12)throw new Error('Já atingiu o limite máximo de 12 documentos.');
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=`${state.socio.id}/${crypto.randomUUID()}-${safe}`;
  const up=await supabase.storage.from('documentos-socios').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(up.error)throw up.error;
  const ins=await supabase.from('documentos_socios').insert({socio_id:state.socio.id,nome_ficheiro:file.name,ficheiro_path:path,mime_type:'application/pdf',tamanho_bytes:file.size});
  if(ins.error){await supabase.storage.from('documentos-socios').remove([path]);throw ins.error}
  await loadDocuments();
}
async function resetPassword(){
  const email=$('#login-email').value.trim(); if(!email)return msg('Introduz primeiro o teu email.','info');
  const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});
  if(error)throw error; msg('Foi enviado um email para redefinir a palavra-passe.','sucesso');
}
function init(){
  $('#login-form').addEventListener('submit',async e=>{e.preventDefault();try{await login($('#login-email').value.trim(),$('#login-password').value)}catch(err){msg(err.message,'erro')}});
  $('#reset-password').addEventListener('click',async()=>{try{await resetPassword()}catch(err){msg(err.message,'erro')}});
  $('#logout-btn').addEventListener('click',async()=>{await supabase.auth.signOut();location.reload()});
  $('#profile-form').addEventListener('submit',async e=>{try{await updateProfile(e)}catch(err){msg(err.message,'erro')}});
  $('#new-member-form').addEventListener('submit',createMember);
  $('#photo-trigger').addEventListener('click',()=>$('#photo-input').click());
  $('#photo-input').addEventListener('change',async e=>{try{await uploadPhoto(e.target.files?.[0]);msg('Fotografia atualizada.','sucesso')}catch(err){msg(err.message,'erro')}e.target.value=''});
  $('#doc-input').addEventListener('change',async e=>{try{await uploadPdf(e.target.files?.[0]);msg('Documento carregado.','sucesso')}catch(err){msg(err.message,'erro')}e.target.value=''});
  supabase.auth.getSession().then(({data:{session}})=>{if(session)loadProfile(session.user).catch(()=>msg('A conta autenticada ainda não está associada a um sócio.','erro'))});
}
init();
