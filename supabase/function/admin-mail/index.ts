import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const MAIL_FROM = Deno.env.get('MAIL_FROM');

async function getAdmin(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization) throw new Error('Sessão não autenticada.');

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } }
  });

  const { data: { user }, error: userError } = await authClient.auth.getUser();
  if (userError || !user) throw new Error('Sessão inválida.');

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: admin, error } = await adminClient
    .from('socios')
    .select('id,numero_socio,is_admin,ativo')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  if (!admin || Number(admin.numero_socio) !== 9999 || admin.is_admin !== true || admin.ativo !== true) {
    throw new Error('Acesso reservado ao administrador.');
  }

  return { user, adminClient };
}

function htmlEscape(value: string) {
  return value.replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

async function resendEmail(params: {
  to: string;
  subject: string;
  html: string;
  attachment?: { filename: string; content: string };
}) {
  if (!RESEND_API_KEY || !MAIL_FROM) {
    throw new Error('Configure RESEND_API_KEY e MAIL_FROM nos secrets do Supabase.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      ...(params.attachment ? { attachments: [params.attachment] } : {})
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'O fornecedor de email recusou o envio.');
  }
  return result;
}

async function sendToSocios(adminClient: any, socios: any[], subject: string, html: string, attachment?: { filename: string; content: string }) {
  let enviados = 0;
  const erros: string[] = [];

  for (const socio of socios) {
    if (!socio.email) continue;
    try {
      await resendEmail({
        to: socio.email,
        subject,
        html,
        attachment
      });
      enviados++;
    } catch (error) {
      erros.push(`${socio.numero_socio ?? socio.email}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { enviados, erros };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { adminClient } = await getAdmin(req);

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const action = String(form.get('action') || '');

      if (action !== 'documento_todos') {
        return json({ error: 'Ação multipart inválida.' }, 400);
      }

      const file = form.get('documento');
      if (!(file instanceof File) || !file.type.includes('pdf')) {
        return json({ error: 'O documento deve ser um PDF.' }, 400);
      }
      if (file.size > 10 * 1024 * 1024) {
        return json({ error: 'O PDF não pode ultrapassar 10 MB.' }, 400);
      }

      const subject = String(form.get('subject') || 'Comunicação — Núcleo Marques Bom').trim();
      const message = String(form.get('message') || '').trim();
      if (!message) return json({ error: 'A mensagem não pode ficar vazia.' }, 400);

      const { data: socios, error } = await adminClient
        .from('socios')
        .select('id,nome,numero_socio,email,ativo')
        .eq('ativo', true)
        .not('email', 'is', null)
        .order('numero_socio', { ascending: true });

      if (error) throw error;
      if (!socios?.length) return json({ error: 'Não existem sócios ativos com email.' }, 400);

      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }

      const attachment = {
        filename: file.name,
        content: btoa(binary)
      };

      const html = `<p>${htmlEscape(message).replace(/\n/g, '<br>')}</p><p>Com os melhores cumprimentos,<br>Núcleo de Árbitros de Futebol Marques Bom</p>`;
      return json(await sendToSocios(adminClient, socios, subject, html, attachment));
    }

    const body = await req.json();

    if (body.action === 'quotas_em_atraso') {
      const ids = Array.isArray(body.socio_ids) ? body.socio_ids : [];
      if (!ids.length) return json({ error: 'Nenhum sócio selecionado.' }, 400);

      const { data: socios, error } = await adminClient
        .from('socios')
        .select('id,nome,numero_socio,email,quotas,ativo')
        .in('id', ids)
        .eq('ativo', true)
        .not('email', 'is', null);

      if (error) throw error;

      const elegiveis = (socios || []).filter((s: any) => {
        const status = String(s.quotas || '').trim().toLowerCase();
        return status && !['em dia', 'pago', 'pagas', 'paga', 'liquidado', 'liquidadas', 'regularizado'].includes(status);
      });

      if (!elegiveis.length) return json({ enviados: 0, erros: [], mensagem: 'Não foram encontrados sócios com quotas em atraso.' });

      const htmlFor = (socio: any) =>
        `<p>Olá ${htmlEscape(socio.nome || '')},</p>` +
        `<p>Verificámos que o seu registo apresenta quotas em atraso.</p>` +
        `<p>Agradecemos a regularização da situação. Se o pagamento já foi efetuado, contacte o Núcleo para atualização do registo.</p>` +
        `<p>Com os melhores cumprimentos,<br>Núcleo de Árbitros de Futebol Marques Bom</p>`;

      let enviados = 0;
      const erros: string[] = [];
      for (const socio of elegiveis) {
        try {
          await resendEmail({
            to: socio.email,
            subject: 'Quotas em atraso — Núcleo Marques Bom',
            html: htmlFor(socio)
          });
          enviados++;
        } catch (error) {
          erros.push(`${socio.numero_socio}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return json({ enviados, erros });
    }

    if (body.action === 'funlearn_pontos_retirados') {
      const socioId = String(body.socio_id || '');
      const pontos = Number(body.pontos);
      const motivo = String(body.motivo || '').trim();

      if (!socioId || !Number.isInteger(pontos) || pontos <= 0 || !motivo) {
        return json({ error: 'Dados inválidos.' }, 400);
      }

      const { data: socio, error } = await adminClient
        .from('socios')
        .select('id,nome,email,numero_socio')
        .eq('id', socioId)
        .single();

      if (error) throw error;
      if (!socio.email) return json({ enviados: 0, mensagem: 'Sócio sem email.' });

      const result = await resendEmail({
        to: socio.email,
        subject: 'Atualização de pontos Fun&Learn — Núcleo Marques Bom',
        html:
          `<p>Olá ${htmlEscape(socio.nome || '')},</p>` +
          `<p>Informamos que foram retirados <strong>${pontos}</strong> ponto(s) do seu saldo Fun&amp;Learn.</p>` +
          `<p><strong>Motivo:</strong> ${htmlEscape(motivo)}</p>` +
          `<p>Se precisar de esclarecimentos, contacte o Núcleo.</p>` +
          `<p>Com os melhores cumprimentos,<br>Núcleo de Árbitros de Futebol Marques Bom</p>`
      });

      return json({ enviados: 1, result });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
