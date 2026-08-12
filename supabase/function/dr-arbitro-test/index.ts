import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 const authorization=req.headers.get("Authorization"); if(!authorization)return reply({error:"Não autenticado."},401);
 const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}}});
 const {data:{user},error:authError}=await client.auth.getUser(); if(authError||!user)return reply({error:"Sessão inválida."},401);
 const {data:socio}=await admin.from("socios").select("id").eq("user_id",user.id).eq("ativo",true).single(); if(!socio)return reply({error:"Sócio não encontrado."},403);
 const body=await req.json();
 if(body.action==="start"){
   const {data:t,error:te}=await admin.from("dr_arbitro_testes").select("id,edicao_id,data_inicio,data_fim,duracao_minutos,estado").eq("id",body.teste_id).single();
   if(te||!t)return reply({error:"Teste não encontrado."},404);
   const now=Date.now(); if(now<new Date(t.data_inicio).getTime()||now>new Date(t.data_fim).getTime())return reply({error:"O teste não está disponível."},400);
   const {data:ins}=await admin.from("dr_arbitro_inscricoes").select("id").eq("edicao_id",t.edicao_id).eq("socio_id",socio.id).maybeSingle(); if(!ins)return reply({error:"Não estás inscrito nesta edição."},403);
   const {data:old}=await admin.from("dr_arbitro_tentativas").select("*").eq("teste_id",t.id).eq("socio_id",socio.id).maybeSingle(); if(old)return reply({tentativa:old,already_started:true});
   const fim=new Date(Math.min(now+t.duracao_minutos*60000,new Date(t.data_fim).getTime())).toISOString();
   const {data:tent, error}=await admin.from("dr_arbitro_tentativas").insert({teste_id:t.id,socio_id:socio.id,inicio:new Date(now).toISOString(),fim_limite:fim}).select().single(); if(error)return reply({error:error.message},400);
   const {data:qs,error:qe}=await admin.from("dr_arbitro_perguntas").select("id,numero,pergunta,dr_arbitro_opcoes(id,letra,texto)").eq("teste_id",t.id).order("numero"); if(qe)return reply({error:qe.message},500);
   return reply({tentativa:tent,perguntas:(qs||[]).map((q:any)=>({id:q.id,numero:q.numero,pergunta:q.pergunta,opcoes:q.dr_arbitro_opcoes}))});
 }
 if(body.action==="submit"){
   const {data:tent}=await admin.from("dr_arbitro_tentativas").select("*").eq("id",body.tentativa_id).eq("socio_id",socio.id).single(); if(!tent)return reply({error:"Tentativa não encontrada."},404);
   if(tent.estado!=="em_curso")return reply({error:"Esta tentativa já terminou."},400);
   const {data:qs}=await admin.from("dr_arbitro_perguntas").select("id,resposta_correta").eq("teste_id",tent.teste_id);
   const correct=new Map((qs||[]).map((q:any)=>[q.id,q.resposta_correta])); const answers=Array.isArray(body.respostas)?body.respostas:[];
   const rows=answers.filter((a:any)=>correct.has(a.pergunta_id)).map((a:any)=>({tentativa_id:tent.id,pergunta_id:a.pergunta_id,resposta:["A","B","C","D"].includes(a.resposta)?a.resposta:null,correta:a.resposta===correct.get(a.pergunta_id)}));
   if(rows.length)await admin.from("dr_arbitro_respostas").upsert(rows,{onConflict:"tentativa_id,pergunta_id"});
   const total=qs?.length||0,score=rows.filter((r:any)=>r.correta).length,percentagem=total?Number((score/total*100).toFixed(2)):0,expired=Date.now()>new Date(tent.fim_limite).getTime();
   const {data:final,error}=await admin.from("dr_arbitro_tentativas").update({submetida_em:new Date().toISOString(),estado:expired?"tempo_esgotado":"submetida",nota:score,total_perguntas:total,percentagem}).eq("id",tent.id).eq("estado","em_curso").select().single();
   if(error)return reply({error:error.message},500); return reply({tentativa:final});
 }
 return reply({error:"Ação inválida."},400);
});
