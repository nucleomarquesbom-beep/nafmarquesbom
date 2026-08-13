import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const out=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  try{
    const authorization=req.headers.get("Authorization");
    if(!authorization?.startsWith("Bearer ")) return out({error:"Não autenticado."},401);
    const url=Deno.env.get("SUPABASE_URL")??"";
    const anon=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY")??"";
    const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??Deno.env.get("SUPABASE_SECRET_KEY")??"";
    if(!url||!anon||!secret) return out({error:"Configuração Supabase incompleta."},500);

    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user) return out({error:"Sessão inválida."},401);
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});

    const {data:me,error:meError}=await admin.from("socios")
      .select("id,numero_socio,is_admin,ativo").eq("user_id",user.id).maybeSingle();
    if(meError) return out({error:meError.message},500);
    if(!me||Number(me.numero_socio)!==9999||me.is_admin!==true||me.ativo!==true)
      return out({error:"Apenas administradores podem importar quotas."},403);

    const body=await req.json();
    if(!Array.isArray(body?.rows)||!body.rows.length) return out({error:"Não existem linhas para importar."},400);
    if(body.rows.length>10000) return out({error:"Máximo de 10.000 linhas."},400);

    const rows=body.rows.map((r:any,i:number)=>{
      const numero=Number(r.numero_socio),ano=Number(r.ano),mes=Number(r.mes);
      const estado=String(r.estado??"").trim().toLowerCase().replace(/\s+/g,"_");
      const valor=(r.valor===null||r.valor===undefined||r.valor==="")?null:Number(String(r.valor).replace(",",".")); 
      if(!Number.isInteger(numero)||numero<=0) throw new Error(`Linha ${i+1}: Nº Sócio inválido.`);
      if(!Number.isInteger(ano)||ano<2000||ano>2100) throw new Error(`Linha ${i+1}: ano inválido.`);
      if(!Number.isInteger(mes)||mes<1||mes>12) throw new Error(`Linha ${i+1}: mês inválido.`);
      if(!["paga","pago","em_atraso","pendente","nao_paga","não_paga","isento","anulado"].includes(estado)) throw new Error(`Linha ${i+1}: estado inválido.`);
      if(valor!==null&&(!Number.isFinite(valor)||valor<0)) throw new Error(`Linha ${i+1}: valor inválido.`);
      const estadoBd = ["paga","pago"].includes(estado) ? "pago" : ["em_atraso","pendente","nao_paga","não_paga"].includes(estado) ? "pendente" : estado;
      return {numero_socio:numero,ano,mes,estado:estadoBd,valor};
    });

    const nums=[...new Set(rows.map((r:any)=>r.numero_socio))];
    const {data:socios,error:socioError}=await admin.from("socios").select("id,numero_socio").in("numero_socio",nums);
    if(socioError) return out({error:socioError.message},500);
    const map=new Map((socios??[]).map((s:any)=>[Number(s.numero_socio),s.id]));
    const missing=nums.filter(n=>!map.has(n));
    if(missing.length) return out({error:"Existem números de sócio inexistentes.",socios_em_falta:missing},400);

    const payload=rows.map((r:any)=>({socio_id:map.get(r.numero_socio),ano:r.ano,mes:r.mes,valor:r.valor,estado:r.estado}));
    const {error}=await admin.from("quotas").upsert(payload,{onConflict:"socio_id,ano,mes",ignoreDuplicates:false});
    if(error) return out({error:error.message},500);
    return out({ok:true,imported:payload.length,socios:nums.length});
  }catch(e){console.error(e);return out({error:e instanceof Error?e.message:String(e)},400);}
});
