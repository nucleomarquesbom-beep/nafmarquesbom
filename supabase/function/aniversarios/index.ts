import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: CORS });

const DEFAULT_SIGNATURE_TEXT = "--\nCom os mais respeitosos cumprimentos,\n\nP' Direcção,\nDiogo Silva\nNúcleo de Árbitros de Futebol Marques Bom\nEstádio Municipal Sérgio Conceição, 3030-974 Coimbra\n919 887 473\nFacebook | Instagram";
const DEFAULT_SIGNATURE_HTML = `<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Direcção,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">Diogo Silva</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>919 887 473<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;
const signatureText = () => DEFAULT_SIGNATURE_TEXT;
const signatureHtml = () => DEFAULT_SIGNATURE_HTML;
const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

function key(name: "publishable" | "secret") {
  const raw = Deno.env.get(
    name === "publishable" ? "SUPABASE_PUBLISHABLE_KEYS" : "SUPABASE_SECRET_KEYS"
  ) || "{}";

  try {
    return JSON.parse(raw).default || "";
  } catch {
    return "";
  }
}

function todayLisbon() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day"))
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supplied = req.headers.get("apikey") || "";
    const publishable = key("publishable");

    if (!publishable || supplied !== publishable) {
      return json({ error: "Não autorizado." }, 401);
    }

    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret =
      key("secret") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      "";

    const resend = Deno.env.get("RESEND_API_KEY") || "";
    const from =
      Deno.env.get("MAIL_FROM") ||
      "Núcleo Marques Bom <nucleomarquesbom@gmail.com>";

    if (!url || !secret) {
      return json({ error: "Configuração Supabase incompleta." }, 500);
    }

    if (!resend) {
      return json({
        error: "RESEND_API_KEY não está configurada no Supabase."
      }, 500);
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const date = todayLisbon();

    const { data: socios, error } = await admin
      .from("socios")
      .select("id,nome,email,data_nascimento")
      .eq("ativo", true)
      .not("email", "is", null)
      .not("data_nascimento", "is", null);

    if (error) throw error;

    const birthdays = (socios || []).filter((s) => {
      const value = String(s.data_nascimento || "");
      return (
        value.length >= 10 &&
        Number(value.slice(5, 7)) === date.month &&
        Number(value.slice(8, 10)) === date.day
      );
    });

    let sent = 0;
    let skipped = 0;
    const failures = [];

    for (const socio of birthdays) {
      const { data: already, error: logError } = await admin
        .from("aniversarios_enviados")
        .select("id")
        .eq("socio_id", socio.id)
        .eq("ano", date.year)
        .maybeSingle();

      if (logError) throw logError;

      if (already) {
        skipped++;
        continue;
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resend}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [socio.email],
          subject: "🎉 Parabéns! — Núcleo Marques Bom",
          text:
`Olá ${socio.nome},

Hoje é um dia especial e o Núcleo de Árbitros de Futebol Marques Bom não podia deixar passar em branco.

🎂 Muitos parabéns pelo seu aniversário!

Desejamos-lhe um excelente dia, muita saúde, felicidade e muitos sucessos, dentro e fora dos campos.

${signatureText()}`,
          html:
            `<p>Olá ${escapeHtml(socio.nome || "sócio")}.</p>` +
            `<p>Hoje é um dia especial e o Núcleo de Árbitros de Futebol Marques Bom não podia deixar passar em branco.</p>` +
            `<p>🎂 Muitos parabéns pelo seu aniversário!</p>` +
            `<p>Desejamos-lhe um excelente dia, muita saúde, felicidade e muitos sucessos, dentro e fora dos campos.</p>` +
            signatureHtml()
        })
      });

      if (!response.ok) {
        failures.push({
          socio_id: socio.id,
          email: socio.email,
          status: response.status
        });
        continue;
      }

      const { error: insertError } = await admin
        .from("aniversarios_enviados")
        .insert({
          socio_id: socio.id,
          ano: date.year
        });

      if (insertError) {
        failures.push({
          socio_id: socio.id,
          email: socio.email,
          status: 500,
          error: insertError.message
        });
        continue;
      }

      sent++;
    }

    return json({
      ok: true,
      sent,
      skipped,
      birthdays: birthdays.length,
      failed: failures.length,
      failures
    });
  } catch (error) {
    console.error(error);
    return json({
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
