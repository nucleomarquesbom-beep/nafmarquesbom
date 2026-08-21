import { createSupabaseContext } from 'npm:@supabase/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

export default {
  fetch: async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: 'user' })
    if (authError || !ctx) return response({ error: authError?.message || 'Não autenticado.' }, 401)

    if (req.method !== 'POST') return response({ error: 'Método não permitido.' }, 405)

    try {
      const { data: adminSocio, error: adminError } = await ctx.supabaseAdmin
        .from('socios')
        .select('id,numero_socio,nome,is_admin,ativo')
        .eq('user_id', ctx.userClaims?.sub)
        .single()

      if (adminError || !adminSocio || adminSocio.numero_socio !== 9999 || !adminSocio.is_admin || !adminSocio.ativo) {
        return response({ error: 'Apenas o administrador pode criar sócios.' }, 403)
      }

      const body = await req.json()
      const nome = String(body?.nome || '').trim()
      const email = String(body?.email || '').trim().toLowerCase()
      const telemovel = optionalText(body?.telemovel)
      const numeroSocio = Number(body?.numero_socio)

      if (!nome) return response({ error: 'O nome é obrigatório.' }, 400)
      if (!Number.isInteger(numeroSocio) || numeroSocio <= 0) {
        return response({ error: 'O número de sócio deve ser um número inteiro positivo.' }, 400)
      }
      if (!email || !email.includes('@')) return response({ error: 'Indica um email válido.' }, 400)
      if (numeroSocio === 9999) return response({ error: 'O número 9999 está reservado para o Núcleo Marques Bom.' }, 400)

      const { data: existingNumber } = await ctx.supabaseAdmin
        .from('socios')
        .select('id')
        .eq('numero_socio', numeroSocio)
        .maybeSingle()

      if (existingNumber) return response({ error: `O número de sócio ${numeroSocio} já existe.` }, 409)

      const { data: existingEmail } = await ctx.supabaseAdmin
        .from('socios')
        .select('id')
        .ilike('email', email)
        .maybeSingle()

      if (existingEmail) return response({ error: 'Já existe um sócio com esse email.' }, 409)

      const origin = req.headers.get('origin') || ''
      const redirectTo = `${origin}/socio.html`

      const { data: inviteData, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nome },
        redirectTo,
      })

      if (inviteError || !inviteData?.user) {
        return response({ error: inviteError?.message || 'Não foi possível criar o acesso do sócio.' }, 400)
      }

      const extra = {
        nif: optionalText(body?.nif),
        data_nascimento: optionalText(body?.data_nascimento),
        naturalidade: optionalText(body?.naturalidade),
        cartao_cidadao: optionalText(body?.cartao_cidadao),
        profissao: optionalText(body?.profissao),
        morada: optionalText(body?.morada),
        localidade: optionalText(body?.localidade),
        codigo_postal: optionalText(body?.codigo_postal),
        modalidade: optionalText(body?.modalidade),
        categoria: optionalText(body?.categoria),
        associacao_futebol: optionalText(body?.associacao_futebol),
      }

      const { data: socio, error: socioError } = await ctx.supabaseAdmin
        .from('socios')
        .insert({
          user_id: inviteData.user.id,
          numero_socio: numeroSocio,
          nome,
          email,
          telemovel,
          ...extra,
          is_admin: false,
          ativo: true,
        })
        .select('id,user_id,numero_socio,nome,email,telemovel,nif,data_nascimento,naturalidade,cartao_cidadao,profissao,morada,localidade,codigo_postal,modalidade,categoria,associacao_futebol,ativo')
        .single()

      if (socioError) {
        await ctx.supabaseAdmin.auth.admin.deleteUser(inviteData.user.id)
        return response({ error: socioError.message }, 400)
      }

      return response({ ok: true, socio })
    } catch (error) {
      console.error(error)
      return response({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500)
    }
  },
}
