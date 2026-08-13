import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const esc=(v:string)=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]??c));

Deno.serve(async req=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 try{
  const cronSecret=Deno.env.get("CRON_SECRET");
  const auth=req.headers.get("Authorization")||"";
  if(cronSecret && auth!==`Bearer ${cronSecret}`) return reply({error:"Não autorizado."},401);
  if(!cronSecret && req.method!=="POST") return reply({error:"Método não permitido."},405);
  const url=Deno.env.get("SUPABASE_URL")!, secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resend=Deno.env.get("RESEND_API_KEY"), from=Deno.env.get("MAIL_FROM");
  if(!resend||!from) return reply({error:"Configure RESEND_API_KEY e MAIL_FROM."},500);
  const db=createClient(url,secret);
  const today=new Date(), month=today.getUTCMonth()+1, day=today.getUTCDate(), year=today.getUTCFullYear();
  const {data:socios,error}=await db.from("socios").select("id,nome,email,data_nascimento,ativo").eq("ativo",true).not("email","is",null);
  if(error) throw error;
  let enviados=0,ignorados=0,erros:string[]=[];
  for(const s of socios||[]){
   if(!s.data_nascimento) {ignorados++;continue;}
   const d=new Date(`${String(s.data_nascimento).slice(0,10)}T00:00:00Z`);
   if(d.getUTCMonth()+1!==month||d.getUTCDate()!==day) {ignorados++;continue;}
   const {data:claim,error:claimError}=await db.from("aniversarios_enviados").insert({socio_id:s.id,ano:year}).select("id").maybeSingle();
   if(claimError||!claim){ignorados++;continue;}
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resend}`,"Content-Type":"application/json"},body:JSON.stringify({
    from,to:[s.email],subject:"Parabéns pelo seu aniversário! — Núcleo Marques Bom",
    html:`<p>Olá ${esc(s.nome||"Sócio")},</p><p>O Núcleo de Árbitros de Futebol Marques Bom deseja-lhe um <strong>feliz aniversário</strong>!</p><p>Que tenha um excelente dia e um novo ano cheio de saúde, alegria e grandes momentos.</p><p>Com os melhores cumprimentos,<br>Núcleo de Árbitros de Futebol Marques Bom</p>`
   })});
   if(!response.ok){erros.push(`${s.id}: ${await response.text()}`);continue;}
   enviados++;
  }
  return reply({ok:true,enviados,ignorados,erros});
 }catch(e){console.error(e);return reply({error:e instanceof Error?e.message:String(e)},500);}
});
