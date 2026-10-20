import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const DEFAULT_SIGNATURE_TEXT = "--\nCom os mais respeitosos cumprimentos,\n\nP' Direcção,\nDiogo Silva\nNúcleo de Árbitros de Futebol Marques Bom\nEstádio Municipal Sérgio Conceição, 3030-974 Coimbra\n919 887 473\nFacebook | Instagram";
const DEFAULT_SIGNATURE_HTML = `<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Direcção,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">Diogo Silva</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>919 887 473<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;
const signatureText = () => DEFAULT_SIGNATURE_TEXT;
const signatureHtml = () => DEFAULT_SIGNATURE_HTML;
const escapeHtml = (v: unknown) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

Deno.serve(async req => {
  let stage = "request";
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    stage = "configuration";
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
    const smtpUser = Deno.env.get("email_smtp_user") || "nucleomarquesbom@gmail.com";
    const from = (Deno.env.get("email_smtp_from") || smtpUser).trim();

    if (!url || !anon || !service) return json({ error: "Configuração Supabase incompleta." }, 500);
    if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((from.match(/<([^<>]+)>/)?.[1] || from).trim())) {
      return json({ error: "Remetente SMTP inválido. Verifica email_smtp_from/email_smtp_user nos secrets do Supabase." }, 500);
    }

stage = "authentication";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

stage = "admin-permission";
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me, error: adminError } = await admin
      .from("socios")
      .select("id,is_admin,ativo")
      .eq("user_id", userData.user.id)
      .eq("ativo", true)
      .single();
    if (adminError || !me?.is_admin) return json({ error: "Apenas administradores podem enviar notificações." }, 403);

stage = "request-validation";
    const body = await req.json().catch(() => ({}));
    const tipo = String(body.tipo || "");
    const recursoId = String(body.recurso_id || "");
    const token = String(body.activation_token || "");
    if (!tipo || !recursoId || !token) return json({ error: "Dados de ativação incompletos." }, 400);
    if (!['acao', 'dr_arbitro'].includes(tipo)) return json({ error: "Tipo de notificação inválido." }, 400);

stage = "load-recipients";
    const { data: socios, error: sociosError } = await admin
      .from("socios")
      .select("id,nome,email")
      .eq("ativo", true)
      .not("email", "is", null);
    if (sociosError) throw sociosError;

    let subject = "";
    let text = "";

stage = "load-resource";
    if (tipo === "acao") {
      const { data: acao, error } = await admin
        .from("acoes")
        .select("id,titulo,data,hora,local,descricao,ativa,inscricoes_abertas,anulada")
        .eq("id", recursoId)
        .single();
      if (error) throw error;
      if (!acao.ativa || acao.anulada) return json({ ok: true, skipped: true, reason: "Atividade não está ativa." });

      subject = `Nova atividade disponível — ${acao.titulo}`;
      text = `Olá {NOME},\n\nEstá disponível uma nova atividade do Núcleo de Árbitros de Futebol Marques Bom:\n\n${acao.titulo}\n${acao.data ? `Data: ${acao.data}\n` : ''}${acao.hora ? `Hora: ${String(acao.hora).slice(0,5)}\n` : ''}${acao.local ? `Local: ${acao.local}\n` : ''}${acao.descricao ? `\n${acao.descricao}\n` : ''}\nConsulte a Área de Sócio para ver os detalhes e, se as inscrições estiverem abertas, efetuar a sua inscrição.\n\n${signatureText()}`;
    } else {
      const { data: edicao, error } = await admin
        .from("dr_arbitro_edicoes")
        .select("id,nome,numero_edicao,ativo,inscricoes_abertas")
        .eq("id", recursoId)
        .single();
      if (error) throw error;
      if (!edicao.ativo) return json({ ok: true, skipped: true, reason: "Edição não está ativa." });

      subject = `Drº Árbitro — ${edicao.nome}`;
      text = `Olá {NOME},\n\nEstá disponível uma nova edição do Drº Árbitro:\n\n${edicao.nome}\n\nConsulte a Área de Sócio para ver os detalhes${edicao.inscricoes_abertas ? ' e efetuar a sua inscrição' : ''}.\n\n${signatureText()}`;
    }

stage = "notification-record";
    const { data: existing, error: existingError } = await admin
      .from("notificacoes_ativacao")
      .select("id,estado,total_enviados")
      .eq("tipo", tipo)
      .eq("recurso_id", recursoId)
      .eq("activation_token", token)
      .maybeSingle();
    if (existingError) throw new Error(`Não foi possível consultar o registo de notificação: ${existingError.message}`);
    if (existing?.estado === "enviado") return json({ ok: true, duplicate: true, total_enviados: existing.total_enviados });

    const { data: notification, error: insertError } = await admin
      .from("notificacoes_ativacao")
      .upsert({ tipo, recurso_id: recursoId, activation_token: token, estado: "a_enviar", total_enviados: 0 }, { onConflict: "tipo,recurso_id,activation_token" })
      .select("id")
      .single();
    if (insertError) throw insertError;

    stage = "queue-emails";
    let queued = 0;
    const failures: string[] = [];
    for (const socio of socios || []) {
      const email = String(socio.email || "").trim();
      if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) continue;
      const personalized = text.replace("{NOME}", String(socio.nome || "sócio"));
      const htmlBody = `<!doctype html><html lang="pt-PT"><body style="font-family:Arial,sans-serif"><div style="max-width:620px;margin:30px auto;border:1px solid #e5dfe8;border-radius:18px;overflow:hidden"><div style="background:#5b2a72;color:#fff;padding:22px;font-size:22px;font-weight:700">Núcleo Marques Bom</div><div style="padding:28px;line-height:1.65">${escapeHtml(personalized).replace(/\\n/g, "<br>")}</div></div></body></html>`;
      const { error: queueError } = await admin.from("email_outbox").insert({
        to_email: email,
        from_email: from,
        subject,
        text_body: personalized,
        html_body: htmlBody,
        status: "pending",
        attempts: 0,
        available_at: new Date().toISOString(),
        source: "notificar-ativacao",
        metadata: { tipo, recurso_id: recursoId, activation_token: token }
      });
      if (queueError) failures.push(`${email}: ${queueError.message}`);
      else queued++;
    }

    stage = "update-notification-record";
    const failed = failures.length;
    const { error: updateError } = await admin.from("notificacoes_ativacao").update({
      estado: failed ? (queued ? "parcial_em_fila" : "falhado") : "em_fila",
      total_enviados: 0,
      total_falhados: failed,
      enviado_em: null
    }).eq("id", notification.id);
    if (updateError) throw new Error(`Emails colocados em fila, mas não foi possível atualizar o registo: ${updateError.message}`);

    if (failed) {
      return json({ ok: false, em_fila: queued, total_falhados: failed, error: "Alguns emails não puderam ser colocados na fila SMTP.", details: failures.slice(0, 3) }, 502);
    }
    return json({ ok: true, em_fila: queued, message: "Notificações adicionadas à fila de email SMTP do Supabase." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[notificar-ativacao] Erro", { stage, message });
    return json({ error: message, stage }, 500);
  }
});
