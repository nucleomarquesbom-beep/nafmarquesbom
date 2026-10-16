import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
const ROOT="nucleomarquesbom@gmail.com";
const DEFAULT_FROM="Núcleo Marques Bom <nucleomarquesbom@gmail.com>";
const PRESIDENT_SIGNATURE_TEXT=`--\nCom os mais respeitosos cumprimentos,\n\nP' Direcção,\nDiogo Silva\nNúcleo de Árbitros de Futebol Marques Bom\nEstádio Municipal Sérgio Conceição, 3030-974 Coimbra\n919 887 473\nFacebook | Instagram`;
const TREASURER_SIGNATURE_TEXT=`--\nCom os mais respeitosos cumprimentos,\n\nP' Tesouraria,\nJoão Gomes\nNúcleo de Árbitros de Futebol Marques Bom\nEstádio Municipal Sérgio Conceição, 3030-974 Coimbra\n964 645 735\nFacebook | Instagram`;
const PRESIDENT_SIGNATURE_HTML=`<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Direcção,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">Diogo Silva</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>919 887 473<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;
const TREASURER_SIGNATURE_HTML=`<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Tesouraria,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">João Gomes</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>964 645 735<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;

const isQuotaSubject=(subject:string)=>subject.toLowerCase().includes("quota");
const signatureText=(subject:string)=>isQuotaSubject(subject)?TREASURER_SIGNATURE_TEXT:PRESIDENT_SIGNATURE_TEXT;
const signatureHtml=(subject:string)=>isQuotaSubject(subject)?TREASURER_SIGNATURE_HTML:PRESIDENT_SIGNATURE_HTML;
const escapeHtml=(v:unknown)=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return json({error:'Não autenticado.'},401);
  const url=Deno.env.get('SUPABASE_URL')||'';
  const anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
  const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  const resend=Deno.env.get('RESEND_API_KEY')||'';
  const mailFrom=(Deno.env.get('MAIL_FROM')||'').trim();
  if(!url||!anon||!secret)return json({error:'Configuração Supabase incompleta.'},500);
  if(!resend)return json({error:'Falta configurar o secret RESEND_API_KEY no Supabase.'},500);
  if(!mailFrom)return json({error:'Falta configurar MAIL_FROM no Supabase com um remetente de um domínio verificado no Resend. O envio não pode usar um endereço Gmail como remetente por defeito.'},500);
  const fromMatch=mailFrom.match(/<([^<>]+)>/);
  const senderAddress=(fromMatch?.[1]||mailFrom).trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderAddress))return json({error:'MAIL_FROM inválido. Usa, por exemplo, "Núcleo Marques Bom <email@dominio-verificado.pt>".'},500);

  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await uc.auth.getUser();if(ue||!u.user)return json({error:'Sessão inválida.'},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:me,error:ae}=await admin.from('socios').select('id,is_admin,ativo').eq('user_id',u.user.id).eq('ativo',true).single();
  if(ae||!me?.is_admin)return json({error:'Apenas administradores podem enviar emails.'},403);

  const contentType=req.headers.get('content-type')||'';
  let body:any={};
  let uploaded:File|null=null;
  if(contentType.includes('multipart/form-data')){
    const form=await req.formData();
    for(const [key,value] of form.entries()){
      if(typeof value==='string')body[key]=value;
    }
    const file=form.get('documento');
    if(file instanceof File && file.size>0)uploaded=file;
  }else{
    body=await req.json();
  }

  const action=String(body.action||'');
  const validEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const toBase64=(bytes:Uint8Array)=>{
    let binary='';
    for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
    return btoa(binary);
  };
  const sendOne=async(to:string,subject:string,text:string,attachment:any=null)=>{
    if(!validEmail(to))throw new Error('Endereço de email inválido.');
    const signature=isQuotaSubject(subject)?signatureText(subject):signatureText(subject);
    const htmlSignature=signatureHtml(subject);
    const payload:any={
      from:mailFrom,
      to:[to],subject,
      text:text+'\n\n'+signature,
      html:`<p>${escapeHtml(text).replace(/\n/g,'<br>')}</p>${htmlSignature}`
    };
    if(attachment)payload.attachments=[attachment];
     let response:Response;
     let result:any={};
     for(let attempt=0;attempt<4;attempt++){
       response=await fetch('https://api.resend.com/emails',{
         method:'POST',
         headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},
         body:JSON.stringify(payload)
       });
       result=await response.json().catch(()=>({}));
       if(response.ok) return result?.id||null;
       const retryable=response.status===429||response.status>=500;
       if(!retryable||attempt===3){
         const providerMessage=String(result?.message||result?.error||'Falha no fornecedor de email.');
         throw new Error(`Resend (${response.status}): ${providerMessage}`);
       }
       await new Promise(resolve=>setTimeout(resolve,500*(2**attempt)));
     }
     throw new Error('Não foi possível concluir o envio do email.');
  };

  if(action==='quotas_em_atraso'){
    const ids=Array.isArray(body.socio_ids)?[...new Set(body.socio_ids.map(String))].slice(0,300):[];
    if(!ids.length)return json({error:'Selecione pelo menos um sócio.'},400);
    const {data:members,error:membersError}=await admin.from('socios').select('id,nome,email').eq('ativo',true).in('id',ids);
    if(membersError)return json({error:'Não foi possível consultar os sócios selecionados.'},500);
    const {data:quotas,error:quotasError}=await admin.from('quotas').select('socio_id,ano,mes,valor,pago,estado').in('socio_id',ids);
    if(quotasError)return json({error:'Não foi possível consultar as quotas.'},500);
    const now=new Date(), currentPeriod=now.getUTCFullYear()*12+now.getUTCMonth();
    const due=new Map<string,any[]>();
    for(const q of quotas||[]){
      const period=Number(q.ano)*12+Number(q.mes)-1;
      const state=String(q.estado||'').toLowerCase();
      if(q.pago===true||['pago','paga','isento','anulado','cancelado'].includes(state)||period>=currentPeriod)continue;
      const list=due.get(String(q.socio_id))||[];list.push(q);due.set(String(q.socio_id),list);
    }
    const subject=String(body.subject||'Quotas em atraso');
    const template=String(body.text||body.message||'Verificámos que tem quotas em atraso. Agradecemos que regularize a situação ou contacte a Tesouraria.');
    let sent=0;const failures:string[]=[];let skipped=0;
    for(const socio of members||[]){
      const email=String(socio.email||'').trim(), rows=due.get(String(socio.id))||[];
      if(!validEmail(email)||!rows.length){skipped++;continue;}
      const amount=rows.reduce((sum,q)=>sum+Number(q.valor||0),0);
      const periods=rows.map(q=>String(q.mes).padStart(2,'0')+'/'+q.ano).join(', ');
      const message=template.replace(/\{NOME\}/gi,String(socio.nome||'sócio'))+`\n\nPeríodos em atraso: ${periods}.\nValor em atraso registado: ${amount.toFixed(2)} €.`;
      try{await sendOne(email,subject,message);sent++;}
      catch(error){failures.push(`${socio.nome||email}: ${error instanceof Error?error.message:String(error)}`);}
    }
    return json({ok:failures.length===0,action,sent,failed:failures,skipped,message:`${sent} enviado(s), ${failures.length} falharam, ${skipped} ignorados por não terem quotas vencidas ou email válido.`},failures.length?502:200);
  }

  if(action==='documento_todos'){
    if(!uploaded)return json({error:'Selecione um documento válido.'},400);
    if(uploaded.size>10*1024*1024)return json({error:'O documento não pode ultrapassar 10 MB.'},413);
    const subject=String(body.subject||'Comunicação do Núcleo de Árbitros de Futebol Marques Bom').trim();
    const message=String(body.message||'').trim();
    if(!subject||!message)return json({error:'Indique o assunto e a mensagem.'},400);
    const {data:members,error}=await admin.from('socios').select('id,nome,email').eq('ativo',true).not('email','is',null);
    if(error)return json({error:'Não foi possível obter os destinatários.'},500);
    const recipients=(members||[]).filter(m=>validEmail(String(m.email||'').trim()));
    if(!recipients.length)return json({error:'Não existem sócios ativos com email válido.'},400);
    const attachment={filename:uploaded.name||'documento',content:toBase64(new Uint8Array(await uploaded.arrayBuffer()))};
    let sent=0;const failures:string[]=[];
    for(const socio of recipients){
      try{await sendOne(String(socio.email).trim(),subject,message.replace(/\{NOME\}/gi,String(socio.nome||'sócio')),attachment);sent++;}
      catch(error){failures.push(`${socio.email}: ${error instanceof Error?error.message:String(error)}`);}
    }
    return json({ok:failures.length===0,action,sent,failed:failures,message:`${sent} email(s) enviado(s); ${failures.length} falharam.`},failures.length?502:200);
  }

  if(action==='pontos_adicionados'||action==='pontos_retirados'){
    const socio=body.socio||{}, email=String(socio.email||'').trim();
    if(!validEmail(email))return json({error:'O sócio não tem email válido.'},400);
    const subject=action==='pontos_adicionados'?'Pontos Fun&Learn adicionados':'Pontos Fun&Learn retirados';
    const details=action==='pontos_adicionados'
      ?`Foram adicionados ${Number(body.pontos_adicionados||0)} ponto(s).\nAtividade: ${body.atividade||'Fun&Learn'}\nMotivo: ${body.descricao||'—'}`
      :`Foram retirados ${Number(body.pontos_retirados||0)} ponto(s).\nMotivo: ${body.motivo||'—'}`;
    const id=await sendOne(email,subject,`Olá ${socio.nome||'sócio'},\n\n${details}`);
    return json({ok:true,id});
  }

  if(!body.to)return json({error:'Destinatário em falta.'},400);
  const rawText=String(body.text||'').trim();
  const rawHtml=String(body.html||'').trim();
  if(!rawText&&!rawHtml)return json({error:'Conteúdo do email em falta.'},400);

  const subject=String(body.subject||"Núcleo Marques Bom");
  const text=rawText?`${rawText}\n\n${signatureText(subject)}`:signatureText(subject);
  const html=rawHtml?`${rawHtml}${signatureHtml(subject)}`:`<p>${escapeHtml(rawText).replace(/\n/g,'<br>')}</p>${signatureHtml(subject)}`;
  const attachment=body.attachment?.base64?{filename:String(body.attachment.name||'documento.pdf'),content:String(body.attachment.base64)}:null;
  const payload:any={from:mailFrom,to:[String(body.to)],subject,text,html};
  if(body.cc)payload.cc=Array.isArray(body.cc)?body.cc.map(String):[String(body.cc)];
  if(attachment)payload.attachments=[attachment];

  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return json({error:data?.message||'Falha no envio do email.',details:data},r.status);
  return json({ok:true,id:data?.id||null});
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
});
