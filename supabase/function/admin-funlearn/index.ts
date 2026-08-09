import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function getAdmin(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Error('Sessão não autenticada.');

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } }
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) throw new Error('Sessão inválida.');

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: admin, error: adminError } = await adminClient
    .from('socios')
    .select('id,numero_socio,is_admin,ativo')
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) throw adminError;
  if (!admin || Number(admin.numero_socio) !== 9999 || admin.is_admin !== true || admin.ativo !== true) {
    throw new Error('Acesso reservado ao administrador.');
  }

  return { user, adminClient };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { user, adminClient } = await getAdmin(req);
    const body = await req.json();

    if (body.action !== 'retirar_pontos') {
      return json({ error: 'Ação inválida.' }, 400);
    }

    const socioId = String(body.socio_id || '');
    const pontos = Number(body.pontos);
    const motivo = String(body.motivo || '').trim();

    if (!socioId || !Number.isInteger(pontos) || pontos <= 0 || !motivo) {
      return json({ error: 'Indique sócio, pontos inteiros positivos e motivo.' }, 400);
    }

    const { data: socio, error: socioError } = await adminClient
      .from('socios')
      .select('id,nome,email,numero_socio')
      .eq('id', socioId)
      .single();

    if (socioError) throw socioError;

    const { data: saldoAtual, error: saldoError } = await adminClient
      .rpc('funlearn_total_pontos', { p_socio_id: socioId });

    if (saldoError) throw saldoError;

    if (Number(saldoAtual || 0) < pontos) {
      return json({
        error: `O sócio tem apenas ${Number(saldoAtual || 0)} ponto(s) disponíveis.`
      }, 400);
    }

    const { data: movimento, error: movimentoError } = await adminClient
      .from('funlearn_pontos')
      .insert({
        socio_id: socioId,
        pontos: -pontos,
        atividade: 'Fun&Learn',
        descricao: `Pontos retirados pelo administrador: ${motivo}`,
      })
      .select('id,pontos,atividade,descricao,created_at')
      .single();

    if (movimentoError) throw movimentoError;

    let email = null;
    if (body.notificar !== false && socio.email) {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-mail`, {
        method: 'POST',
        headers: {
          Authorization: req.headers.get('Authorization')!,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'funlearn_pontos_retirados',
          socio_id: socio.id,
          pontos,
          motivo
        })
      });

      email = await response.json().catch(() => null);
      if (!response.ok || email?.error) {
        return json({
          ok: true,
          warning: 'Os pontos foram retirados, mas o email não foi enviado.',
          pontos_retirados: pontos,
          movimento,
          email
        }, 200);
      }
    }

    const novoSaldo = Number(saldoAtual || 0) - pontos;

    return json({
      ok: true,
      socio_id: socio.id,
      numero_socio: socio.numero_socio,
      pontos_retirados: pontos,
      saldo_anterior: Number(saldoAtual || 0),
      saldo_novo: novoSaldo,
      movimento,
      email
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
