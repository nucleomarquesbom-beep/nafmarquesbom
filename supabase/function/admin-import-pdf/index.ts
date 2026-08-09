import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function requireAdmin(req: Request) {
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

  return adminClient;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const adminClient = await requireAdmin(req);
    const form = await req.formData();
    const file = form.get('pdf');

    if (!(file instanceof File) || file.type !== 'application/pdf') {
      return json({ error: 'PDF inválido ou em falta.' }, 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      return json({ error: 'O PDF não pode ultrapassar 10 MB.' }, 400);
    }

    // O parsing principal é feito no browser com PDF.js porque o site já
    // carrega essa biblioteca e isso evita dependências pesadas no Edge Runtime.
    // Esta função serve como endpoint autenticado para receber o PDF caso
    // seja necessário evoluir o processamento para o backend.
    const storagePath = `admin-imports/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await adminClient.storage
      .from('funlearn')
      .upload(storagePath, bytes, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (uploadError) {
      return json({
        ok: true,
        stored: false,
        warning: `PDF recebido mas não foi guardado no bucket funlearn: ${uploadError.message}`
      });
    }

    return json({
      ok: true,
      stored: true,
      storage_path: storagePath,
      message: 'PDF recebido. O site pode continuar o processamento dos registos no browser.'
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
