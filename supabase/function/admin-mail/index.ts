import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

function base64(bytes:Uint8Array){let binary="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const auth=req.headers.get('Authorization');
    if(!auth?.startsWith('Bearer '))return json({error:'Não autenticado.'},401);
    const url=Deno.env.get('SUPABASE_URL')||'';
    const anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
    const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
    const resend=Deno.env.get('RESEND_API_KEY')||'';
    const from=Deno.env.get('MAIL_FROM')||'Núcleo Marques Bom <nucleomarquesbom@gmail.com>';
    if(!url||!anon||!secret)return json({error:'Configuração Supabase incompleta.'},500);
    if(!resend)return json({error:'RESEND_API_KEY não está configurada no Supabase.'},500);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:u,error:ue}=await userClient.auth.getUser();
    if(ue||!u.user)return json({error:'Sessão inválida.'},401);
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:me,error:meError}=await admin.from('socios').select('id,is_admin,ativo').eq('user_id',u.user.id).eq('ativo',true).single();
    if(meError||!me?.is_admin)return json({error:'Apenas administradores podem enviar emails.'},403);
    let body:any={};let attachment:any=null;
    if((req.headers.get('content-type')||'').includes('multipart/form-data')){
      const form=await req.formData();body.action=String(form.get('action')||'');body.subject=String(form.get('subject')||'');body.message=String(form.get('message')||'');
      const file=form.get('documento');if(file instanceof File){if(file.size>10*1024*1024)return json({error:'O PDF não pode ultrapassar 10 MB.'},400);attachment={filename:file.name,content:base64(new Uint8Array(await file.arrayBuffer()))};}
    }else body=await req.json();
    let recipients:any[]=[];
    if(body.action==='individual'){
      const {data:s,error}=await admin.from('socios').select('id,nome,email').eq('id',body.socio_id).eq('ativo',true).single();
      if(error||!s?.email)return json({error:'Sócio sem email ou inexistente.'},400);
      if(!String(body.message||'').trim())return json({error:'Escreve o conteúdo do email.'},400);
      recipients=[s];
    }else if(body.action==='quotas_em_atraso'){
      const ids=Array.isArray(body.socio_ids)?body.socio_ids:[];if(!ids.length)return json({error:'Nenhum sócio selecionado.'},400);
      const {data:socios,error:sErr}=await admin.from('socios').select('id,nome,email').in('id',ids).eq('ativo',true);if(sErr)return json({error:sErr.message},500);
      const {data:q,error:qErr}=await admin.from('quotas').select('socio_id,ano,valor,estado').in('socio_id',ids).in('estado',['em_atraso','atrasada','atrasado','vencida','vencido']);if(qErr)return json({error:qErr.message},500);
      recipients=(socios||[]).map(s=>({...s,quotas:(q||[]).filter(x=>x.socio_id===s.id)})).filter(s=>s.email&&s.quotas.length);
    }else if(body.action==='documento_todos'){
      if(!attachment)return json({error:'Seleciona um documento PDF.'},400);
      const {data:socios,error:sErr}=await admin.from('socios').select('id,nome,email').eq('ativo',true).not('email','is',null);if(sErr)return json({error:sErr.message},500);recipients=socios||[];
    }else return json({error:'Ação de email inválida.'},400);
    let sent=0,failed=0;
    for(const r of recipients){
      let text=String(body.message||'').trim();
      if(body.action==='quotas_em_atraso'){const total=(r.quotas||[]).reduce((a:number,x:any)=>a+Number(x.valor||0),0);const anos=[...new Set((r.quotas||[]).map((x:any)=>x.ano))].sort().join(', ');text=`Olá ${r.nome},\n\nVerificámos que existem quotas em atraso na sua conta de sócio.\n\nValor atualmente em atraso: ${total.toFixed(2)} €\nAnos em atraso: ${anos||'—'}\n\nSe já regularizou a situação, por favor envie o comprovativo através da Área de Sócios.\n\nCom os melhores cumprimentos,\nNúcleo de Árbitros de Futebol Marques Bom`;}
      const payload:any={from,to:[r.email],subject:String(body.subject||'Núcleo Marques Bom — Comunicação').trim(),text};if(attachment)payload.attachments=[attachment];
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});if(response.ok)sent++;else failed++;
    }
    return json({ok:true,sent,failed,total:recipients.length});
  }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
});
