import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY), BUCKET='questoes-socios';
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let socioCache=null;

async function socio(){
  if(socioCache)return socioCache;
  const {data:s}=await supabase.auth.getSession(); if(!s.session)return null;
  const {data,error}=await supabase.from('socios').select('id,nome,numero_socio,email,ativo').eq('user_id',s.session.user.id).eq('ativo',true).single();
  if(error)throw error; socioCache=data; return data;
}
async function signed(path){
  if(!path)return null;
  const {data}=await supabase.storage.from(BUCKET).createSignedUrl(path,3600);
  return data?.signedUrl||null;
}
async function upload(file,path){
  if(!file)return null;
  if(file.type!=='application/pdf')throw new Error('O ficheiro tem de ser PDF.');
  if(file.size>10*1024*1024)throw new Error('O PDF não pode ultrapassar 10 MB.');
  const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:'application/pdf',upsert:false});
  if(error)throw error; return path;
}

function memberUI(){
  const tabs=document.querySelector('.socio-tabs'), fun=document.getElementById('funlearn');
  if(!tabs||!fun)return;
  let b=tabs.querySelector('[data-tab="questoes"]');
  if(!b){b=document.createElement('button');b.type='button';b.className='socio-tab';b.dataset.tab='questoes';b.textContent='Questões';tabs.appendChild(b);}
  let p=document.getElementById('questoes');
  if(!p){
    p=document.createElement('section');p.id='questoes';p.className='socio-tab-content';
    p.innerHTML=`<div class="questoes-head"><span class="admin-badge">Contacto com o Núcleo</span><h2>Questões</h2><p>Envie uma questão por escrito ou através de PDF. A resposta ficará imediatamente abaixo.</p></div>
    <form id="questao-form" class="questao-form"><label>Questão<textarea id="questao-texto" rows="6" placeholder="Escreva aqui a sua questão..."></textarea></label><label>Anexar PDF (opcional)<input id="questao-pdf" type="file" accept="application/pdf"></label><button class="botao" type="submit">Enviar questão</button><div id="questao-result" class="admin-result" hidden></div></form><div class="questoes-list" id="questoes-list"></div>`;
    fun.insertAdjacentElement('afterend',p);
  }
  if(!b.dataset.bound){b.dataset.bound='1';b.onclick=()=>{document.querySelectorAll('.socio-tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.socio-tab-content').forEach(x=>x.classList.toggle('active',x===p));loadMember();};}
  if(!p.dataset.bound){p.dataset.bound='1';p.querySelector('form').onsubmit=sendQuestion;}
}

async function sendQuestion(e){
  e.preventDefault(); const f=e.target, r=f.querySelector('#questao-result');
  try{
    const s=await socio(); if(!s)throw new Error('Inicie sessão para enviar uma questão.');
    const text=f.querySelector('#questao-texto').value.trim(), file=f.querySelector('#questao-pdf').files?.[0];
    if(!text&&!file)throw new Error('Escreva a questão ou carregue um PDF.');
    const id=crypto.randomUUID(), path=file?`${s.id}/${id}.pdf`:null; if(file)await upload(file,path);
    const {error}=await supabase.rpc('socio_criar_questao',{p_id:id,p_texto:text||null,p_anexo_storage_path:path,p_anexo_nome:file?.name||null});
    if(error)throw error;
    f.reset();r.textContent='Questão enviada. O Núcleo foi notificado por email.';r.className='admin-result success';r.hidden=false;loadMember();
  }catch(x){r.textContent=x.message||'Erro';r.className='admin-result error';r.hidden=false;}
}
async function loadMember(){
  const list=document.getElementById('questoes-list'); if(!list)return;
  try{
    const s=await socio(); if(!s){list.innerHTML='<div class="vazio">Inicie sessão para consultar as suas questões.</div>';return;}
    const {data,error}=await supabase.from('questoes_socios').select('*').eq('socio_id',s.id).order('created_at',{ascending:false});if(error)throw error;
    if(!data?.length){list.innerHTML='<div class="vazio">Ainda não colocou nenhuma questão.</div>';return;}
    const out=[];
    for(const q of data){const qu=await signed(q.anexo_storage_path),ru=await signed(q.resposta_storage_path);
      out.push(`<article class="questao-card"><div class="questao-card-head"><strong>Questão</strong><span>${new Date(q.created_at).toLocaleString('pt-PT')}</span></div><div>${q.texto?esc(q.texto).replace(/\n/g,'<br>'):'<em>Questão enviada em PDF.</em>'}</div>${qu?`<a href="${qu}" target="_blank" rel="noopener">📎 Abrir PDF da questão</a>`:''}${q.estado==='respondida'?`<div class="questao-resposta"><div class="questao-card-head"><strong>Resposta do Núcleo</strong><span>${q.respondido_em?new Date(q.respondido_em).toLocaleString('pt-PT'):''}</span></div><div>${q.resposta_texto?esc(q.resposta_texto).replace(/\n/g,'<br>'):'<em>Resposta enviada em PDF.</em>'}</div>${ru?`<a href="${ru}" target="_blank" rel="noopener">📎 Abrir PDF da resposta</a>`:''}</div>`:'<div class="questao-pendente">A aguardar resposta do Núcleo.</div>'}</article>`);
    } list.innerHTML=out.join('');
  }catch(x){list.innerHTML=`<div class="vazio">${esc(x.message||'Erro')}</div>`;}
}
function adminUI(){
  const panel=document.getElementById('panel-socios');if(!panel||document.getElementById('admin-questoes-card'))return;
  const c=document.createElement('section');c.id='admin-questoes-card';c.className='admin-card';
  c.innerHTML='<div class="admin-card-header"><div><span class="admin-badge">Questões</span><h3>Questões dos sócios</h3><p class="admin-help">Consulte e responda por texto e/ou PDF.</p></div><button id="questoes-refresh" class="admin-small-btn" type="button">Atualizar</button></div><div id="admin-questoes-list"><div class="admin-loading">A carregar…</div></div>';
  panel.appendChild(c);c.querySelector('#questoes-refresh').onclick=loadAdmin;
}
async function loadAdmin(){
  const list=document.getElementById('admin-questoes-list');if(!list)return;
  try{
    const {data:isAdmin,error:ie}=await supabase.rpc('is_admin_user');if(ie)throw ie;if(isAdmin!==true){list.innerHTML='<div class="vazio">Acesso reservado a administradores.</div>';return;}
    const {data:qs,error}=await supabase.from('questoes_socios').select('*').order('created_at',{ascending:false});if(error)throw error;
    const ids=[...new Set((qs||[]).map(q=>q.socio_id))], {data:ss}=ids.length?await supabase.from('socios').select('id,nome,numero_socio,email').in('id',ids):{data:[]};
    const map=new Map((ss||[]).map(s=>[s.id,s]));
    let html='';
    for(const q of qs||[]){const s=map.get(q.socio_id)||{},qu=await signed(q.anexo_storage_path);
      html+=`<article class="admin-questao-item" data-id="${q.id}"><div class="admin-questao-meta"><strong>${esc(s.numero_socio)} — ${esc(s.nome)}</strong><span>${new Date(q.created_at).toLocaleString('pt-PT')}</span><b>${q.estado==='respondida'?'Respondida':'Aberta'}</b></div><div>${q.texto?esc(q.texto).replace(/\n/g,'<br>'):'<em>Questão enviada em PDF.</em>'}</div>${qu?`<a href="${qu}" target="_blank" rel="noopener">📎 Abrir PDF</a>`:''}<div class="admin-questao-response"><textarea rows="5" class="answer" placeholder="Resposta...">${esc(q.resposta_texto||'')}</textarea><input class="pdf" type="file" accept="application/pdf"><button type="button" class="admin-small-btn primary send">Responder</button><div class="result" hidden></div></div></article>`;
    }
    list.innerHTML=html||'<div class="vazio">Não existem questões.</div>';
    [...list.querySelectorAll('.admin-questao-item')].forEach(c=>c.querySelector('.send').onclick=()=>respond(c));
  }catch(x){list.innerHTML=`<div class="vazio">${esc(x.message||'Erro')}</div>`;}
}
async function respond(card){
  const id=card.dataset.id,text=card.querySelector('.answer').value.trim(),file=card.querySelector('.pdf').files?.[0],r=card.querySelector('.result'),b=card.querySelector('.send');
  try{
    if(!text&&!file)throw new Error('Escreva a resposta ou carregue um PDF.');
    b.disabled=true;const path=file?`admin/${id}.pdf`:null;if(file)await upload(file,path);
    const {error}=await supabase.rpc('admin_responder_questao',{p_questao_id:id,p_resposta_texto:text||null,p_resposta_storage_path:path,p_resposta_nome:file?.name||null});if(error)throw error;
    r.textContent='Resposta enviada e email preparado.';r.className='admin-result success';r.hidden=false;await loadAdmin();
  }catch(x){r.textContent=x.message||'Erro';r.className='admin-result error';r.hidden=false;}finally{b.disabled=false;}
}
function init(){const l=document.createElement('link');l.rel='stylesheet';l.href='css/questoes-socios.css?v=20260821-2';document.head.appendChild(l);memberUI();adminUI();new MutationObserver(()=>{memberUI();adminUI();}).observe(document.body,{childList:true,subtree:true});}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init,{once:true}):init();
