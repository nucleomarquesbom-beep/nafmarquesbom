import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    const resend = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("MAIL_FROM") || "Núcleo Marques Bom <nucleomarquesbom@gmail.com>";

    if (!url || !anon || !service) return json({ error: "Configuração Supabase incompleta." }, 500);
    if (!resend) return json({ error: "RESEND_API_KEY não está configurada no Supabase." }, 500);

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me, error: adminError } = await admin
      .from("socios")
      .select("id,is_admin,ativo")
      .eq("user_id", userData.user.id)
      .eq("ativo", true)
      .single();
    if (adminError || !me?.is_admin) return json({ error: "Apenas administradores podem enviar notificações." }, 403);

    const body = await req.json().catch(() => ({}));
    const tipo = String(body.tipo || "");
    const recursoId = String(body.recurso_id || "");
    const token = String(body.activation_token || "");
    if (!tipo || !recursoId || !token) return json({ error: "Dados de ativação incompletos." }, 400);
    if (!['acao', 'dr_arbitro'].includes(tipo)) return json({ error: "Tipo de notificação inválido." }, 400);

    const { data: socios, error: sociosError } = await admin
      .from("socios")
      .select("id,nome,email")
      .eq("ativo", true)
      .not("email", "is", null);
    if (sociosError) throw sociosError;

    let subject = "";
    let text = "";

    if (tipo === "acao") {
      const { data: acao, error } = await admin
        .from("acoes")
        .select("id,titulo,data,hora,local,descricao,ativa,inscricoes_abertas,anulada")
        .eq("id", recursoId)
        .single();
      if (error) throw error;
      if (!acao.ativa || acao.anulada) return json({ ok: true, skipped: true, reason: "Atividade não está ativa." });

      subject = `Nova atividade disponível — ${acao.titulo}`;
      text = `Olá {NOME},\n\nEstá disponível uma nova atividade do Núcleo de Árbitros de Futebol Marques Bom:\n\n${acao.titulo}\n${acao.data ? `Data: ${acao.data}\n` : ''}${acao.hora ? `Hora: ${String(acao.hora).slice(0,5)}\n` : ''}${acao.local ? `Local: ${acao.local}\n` : ''}${acao.descricao ? `\n${acao.descricao}\n` : ''}\nConsulte a Área de Sócio para ver os detalhes e, se as inscrições estiverem abertas, efetuar a sua inscrição.\n\nNúcleo de Árbitros de Futebol Marques Bom`;
    } else {
      const { data: edicao, error } = await admin
        .from("dr_arbitro_edicoes")
        .select("id,nome,numero_edicao,ativo,inscricoes_abertas")
        .eq("id", recursoId)
        .single();
      if (error) throw error;
      if (!edicao.ativo) return json({ ok: true, skipped: true, reason: "Edição não está ativa." });

      subject = `Drº Árbitro — ${edicao.nome}`;
      text = `Olá {NOME},\n\nEstá disponível uma nova edição do Drº Árbitro:\n\n${edicao.nome}\n\nConsulte a Área de Sócio para ver os detalhes${edicao.inscricoes_abertas ? ' e efetuar a sua inscrição' : ''}.\n\nNúcleo de Árbitros de Futebol Marques Bom`;
    }

    const { data: existing } = await admin
      .from("notificacoes_ativacao")
      .select("id,estado,total_enviados")
      .eq("tipo", tipo)
      .eq("recurso_id", recursoId)
      .eq("activation_token", token)
      .maybeSingle();
    if (existing?.estado === "enviado") return json({ ok: true, duplicate: true, total_enviados: existing.total_enviados });

    const { data: notification, error: insertError } = await admin
      .from("notificacoes_ativacao")
      .upsert({ tipo, recurso_id: recursoId, activation_token: token, estado: "a_enviar", total_enviados: 0 }, { onConflict: "tipo,recurso_id,activation_token" })
      .select("id")
      .single();
    if (insertError) throw insertError;

    let sent = 0;
    let failed = 0;
    for (const socio of socios || []) {
      const email = String(socio.email || '').trim();
      if (!email || !email.includes('@')) continue;
      const personalized = text.replace('{NOME}', String(socio.nome || 'sócio'));
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject, text: personalized })
      });
      if (response.ok) sent++; else failed++;
    }

    await admin.from("notificacoes_ativacao").update({
      estado: failed ? "parcial" : "enviado",
      total_enviados: sent,
      total_falhados: failed,
      enviado_em: new Date().toISOString()
    }).eq("id", notification.id);

    return json({ ok: true, total_enviados: sent, total_falhados: failed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
