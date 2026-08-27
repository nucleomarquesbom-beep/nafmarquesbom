import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:cors});
const ROOT="nucleomarquesbom@gmail.com";
const METHODS:Record<string,string>={transferencia:"Transferência bancária",mbway:"MB WAY",numerario:"Numerário"};
const money=(v:number)=>`${v.toFixed(2).replace('.',',')} €`;
const wrap=(t:string,max=92)=>{const o:string[]=[];let l='';for(const w of t.split(/\s+/)){if((l+' '+w).trim().length>max){if(l)o.push(l);l=w}else l=(l+' '+w).trim()}if(l)o.push(l);return o;};

async function pdf(s:any,r:any){
 const p=await PDFDocument.create(),page=p.addPage([595.28,841.89]),font=await p.embedFont(StandardFonts.Helvetica),bold=await p.embedFont(StandardFonts.HelveticaBold),purple=rgb(.25,.10,.35);let y=780;
 page.drawText('RECIBO DE PAGAMENTO',{x:60,y,size:20,font:bold,color:purple});page.drawText(`Recibo n.º ${r.numero_recibo}`,{x:60,y:y-28,size:10,font});y-=75;
 page.drawText(`Sócio ${s.numero_socio}`,{x:60,y,size:13,font:bold,color:purple});y-=28;page.drawText(`Caro(a) ${s.nome},`,{x:60,y,size:11,font});y-=28;
 for(const l of wrap(`Confirmamos a regularização dos valores pagos em ${new Date(r.emitido_em).toLocaleDateString('pt-PT')}:`)){page.drawText(l,{x:60,y,size:11,font});y-=16}y-=15;
 for(const q of Array.isArray(r.quotas)?r.quotas:[]){page.drawText(`${q.ano}${q.mes?`/${q.mes}`:''} — ${money(Number(q.valor||0))}`,{x:60,y,size:10,font});y-=18}y-=20;
 page.drawText(`Pago por ${METHODS[r.metodo_pagamento]||r.metodo_pagamento} — ${money(Number(r.valor_total))}`,{x:60,y,size:11,font:bold,color:purple});y-=45;
 for(const l of wrap('A direção agradece a regularização das suas quotas.')){page.drawText(l,{x:60,y,size:10,font});y-=15}y-=20;page.drawText('Pela direção,',{x:60,y,size:10,font});y-=18;page.drawText('Tesoureiro',{x:60,y,size:10,font:bold});y-=55;
 page.drawText('NÚCLEO DE ÁRBITROS DE FUTEBOL MARQUES BOM',{x:60,y,size:11,font:bold,color:purple});return p.save();
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 try{
  const auth=req.headers.get('Authorization');if(!auth?.startsWith('Bearer '))return json({error:'Não autenticado.'},401);
  const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'',secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
  if(!url||!anon||!secret)return json({error:'Configuração Supabase incompleta.'},500);
  const uc=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await uc.auth.getUser();if(ue||!u.user)return json({error:'Sessão inválida.'},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:me,error:ae}=await admin.from('socios').select('id,is_admin,ativo').eq('user_id',u.user.id).eq('ativo',true).maybeSingle();
  const isRoot=String(u.user.email||'').toLowerCase()===ROOT;
  if(!isRoot&& (ae||!me?.is_admin))return json({error:'Apenas administradores podem emitir recibos.'},403);
  const b=await req.json();const socioId=String(b.socio_id||''),valor=Number(b.valor||0),metodo=String(b.metodo||'');
  if(!socioId||!['transferencia','mbway','numerario'].includes(metodo)||!Number.isFinite(valor)||valor<=0)return json({error:'Dados de pagamento inválidos.'},400);
  const {data:r,error:re}=await admin.rpc('registar_pagamento_manual',{p_socio_id:socioId,p_valor:valor,p_metodo:metodo,p_admin_user_id:u.user.id});
  if(re)throw re;
  const {data:s,error:se}=await admin.from('socios').select('id,numero_socio,nome,email').eq('id',socioId).single();
  if(se||!s?.email)return json({error:'Pagamento registado, mas o sócio não tem email válido.'},400);
  const bytes=await pdf(s,r),path=`${s.id}/${r.numero_recibo}.pdf`;
  const {error:up}=await admin.storage.from('recibos-quotas').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(up)throw up;
  await admin.from('recibos_quotas').update({storage_path:path}).eq('id',r.id);
  const text=`Olá ${s.nome},\n\nEnviamos em anexo o recibo de pagamento das suas quotas.\n\nValor: ${money(Number(r.valor_total))}\nMétodo: ${METHODS[metodo]}\nRecibo: ${r.numero_recibo}\n\nObrigado,\nNúcleo de Árbitros de Futebol Marques Bom`;
  const {error:eq}=await admin.rpc('enfileirar_email_sistema',{p_to_email:s.email,p_subject:`Recibo de pagamento de quotas — Sócio ${s.numero_socio}`,p_html_body:`<p>${text.replace(/\n/g,'<br>')}</p>`,p_text_body:text,p_cc_email:ROOT,p_attachment_storage_path:path,p_attachment_filename:`Recibo-${r.numero_recibo}.pdf`,p_source:'emitir-recibo-quota',p_metadata:{recibo_id:r.id,socio_id:s.id}});
  if(eq){await admin.from('recibos_quotas').update({email_erro:eq.message}).eq('id',r.id);return json({error:`Pagamento registado e recibo guardado, mas não foi possível colocar o email na fila: ${eq.message}`},500);}
  await admin.from('recibos_quotas').update({email_enviado_em:new Date().toISOString(),email_erro:null}).eq('id',r.id);
  return json({ok:true,numero_recibo:r.numero_recibo,valor_total:r.valor_total,metodo,storage_path:path});
 }catch(e){console.error('emitir-recibo-quota',e);return json({error:e instanceof Error?e.message:String(e)},500)}
});
