import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return json({error:'Não autenticado.'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'',secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'',resend=Deno.env.get('RESEND_API_KEY')||'';
  if(!url||!anon||!secret)return json({error:'Configuração Supabase incompleta.'},500);
  if(!resend)return json({error:'RESEND_API_KEY não está configurada no Supabase.'},500);

  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await uc.auth.getUser();if(ue||!u.user)return json({error:'Sessão inválida.'},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:me,error:ae}=await admin.from('socios').select('id,is_admin,ativo').eq('user_id',u.user.id).eq('ativo',true).single();
  if(ae||!me?.is_admin)return json({error:'Apenas administradores podem enviar emails.'},403);

  const body=await req.json();
  if(!body.to)return json({error:'Destinatário em falta.'},400);
  const attachment=body.attachment?.base64?{filename:String(body.attachment.name||'documento.pdf'),content:String(body.attachment.base64)}:null;
  const payload:any={from:Deno.env.get('MAIL_FROM')||'Núcleo Marques Bom <nucleomarquesbom@gmail.com>',to:[String(body.to)],subject:String(body.subject||'Núcleo Marques Bom'),text:String(body.text||'')};
  if(!payload.text)return json({error:'Conteúdo do email em falta.'},400);
  if(attachment)payload.attachments=[attachment];

  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)return json({error:data?.message||'Falha no envio do email.',details:data},r.status);
  return json({ok:true,id:data?.id||null});
 }catch(e){return json({error:e instanceof Error?e.message:String(e)},500)}
});
