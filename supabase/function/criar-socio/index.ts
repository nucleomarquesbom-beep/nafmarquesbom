import { createSupabaseContext } from 'npm:@supabase/server'

const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})
const optionalText=(v:unknown)=>{const x=String(v??'').trim();return x||null}

export default {fetch:async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  const {data:ctx,error:authError}=await createSupabaseContext(req,{auth:'user'})
  if(authError||!ctx)return response({error:authError?.message||'Não autenticado.'},401)
  if(req.method!=='POST')return response({error:'Método não permitido.'},405)
  try{
    const {data:admin,error:ae}=await ctx.supabaseAdmin.from('socios').select('id,numero_socio,is_admin,ativo').eq('user_id',ctx.userClaims?.sub).single()
    if(ae||!admin||admin.numero_socio!==9999||!admin.is_admin||!admin.ativo)return response({error:'Apenas o administrador pode criar sócios.'},403)
    const body=await req.json()
    const nome=String(body?.nome||'').trim(),email=String(body?.email||'').trim().toLowerCase(),numero=Number(body?.numero_socio)
    if(!nome)return response({error:'O nome é obrigatório.'},400)
    if(!Number.isInteger(numero)||numero<=0||numero===9999)return response({error:'Número de sócio inválido ou reservado.'},400)
    if(!/^\S+@\S+\.\S+$/.test(email))return response({error:'Indica um email válido.'},400)

    const {data:en}=await ctx.supabaseAdmin.from('socios').select('id').eq('numero_socio',numero).maybeSingle()
    if(en)return response({error:`O número de sócio ${numero} já existe.`},409)
    const {data:ee}=await ctx.supabaseAdmin.from('socios').select('id').ilike('email',email).maybeSingle()
    if(ee)return response({error:'Já existe um sócio com esse email.'},409)

    const origin=req.headers.get('origin')||'https://nucleomarquesbom-beep.github.io/nafmarquesbom'
    const {data:inv,error:ie}=await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email,{data:{nome},redirectTo:`${origin}/socio.html`})
    if(ie||!inv?.user)return response({error:ie?.message||'Não foi possível criar o acesso do sócio.'},400)

    const extra={
      nif:optionalText(body?.nif),data_nascimento:optionalText(body?.data_nascimento),
      naturalidade:optionalText(body?.naturalidade),cartao_cidadao:optionalText(body?.cartao_cidadao),
      profissao:optionalText(body?.profissao),morada:optionalText(body?.morada),
      localidade:optionalText(body?.localidade),codigo_postal:optionalText(body?.codigo_postal),
      modalidade:optionalText(body?.modalidade),categoria:optionalText(body?.categoria),
      associacao_futebol:optionalText(body?.associacao_futebol),telemovel:optionalText(body?.telemovel)
    }
    const {data:socio,error:se}=await ctx.supabaseAdmin.from('socios').insert({user_id:inv.user.id,numero_socio:numero,nome,email,...extra,is_admin:false,ativo:true}).select('*').single()
    if(se){await ctx.supabaseAdmin.auth.admin.deleteUser(inv.user.id);return response({error:se.message},400)}
    return response({ok:true,socio})
  }catch(e){console.error(e);return response({error:e instanceof Error?e.message:String(e)},500)}
}}
