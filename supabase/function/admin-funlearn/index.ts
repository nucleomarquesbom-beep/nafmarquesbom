import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Sessão não autenticada.");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) throw new Error("Sessão inválida.");

    const numeroAdmin = Number(
      user.user_metadata?.numero_socio ??
      user.app_metadata?.numero_socio ??
      user.user_metadata?.numero ??
      user.app_metadata?.numero
    );

    if (numeroAdmin !== 9999) throw new Error("Acesso reservado ao administrador.");

    const body = await req.json();

    if (body.action !== "retirar_pontos") {
      return response({ error: "Ação inválida." }, 400);
    }

    const socioId = body.socio_id;
    const pontos = Number(body.pontos);
    const motivo = String(body.motivo || "").trim();

    if (!socioId || !Number.isFinite(pontos) || pontos <= 0 || !motivo) {
      return response({ error: "Dados inválidos." }, 400);
    }

    // Atualização atómica do saldo: a função SQL é a opção ideal.
    // Mantemos fallback explícito para instalações em que o saldo esteja
    // armazenado diretamente na tabela de sócios.
    const { data: socio, error: socioError } = await admin
      .from("socios")
      .select("id, nome, email")
      .eq("id", socioId)
      .single();

    if (socioError) throw socioError;

    // Registo de movimento. Se a tabela existir no SQL tratado, esta é a
    // estrutura esperada; o saldo deve ser recalculado por trigger/policy.
    const { error: movimentoError } = await admin
      .from("funlearn_movimentos")
      .insert({
        socio_id: socioId,
        pontos: -Math.abs(pontos),
        motivo,
        criado_por: user.id,
      });

    if (movimentoError) {
      throw new Error(
        `Não foi possível registar a retirada de pontos: ${movimentoError.message}`
      );
    }

    // Notificação por email é feita pela função de email.
    let email = null;
    if (body.notificar !== false && socio.email) {
      const mailResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/admin-mail`,
        {
          method: "POST",
          headers: {
            "Authorization": auth,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "funlearn_pontos_retirados",
            socio_id: socio.id,
            pontos,
            motivo,
          }),
        }
      );

      email = await mailResponse.json().catch(() => null);
    }

    return response({
      ok: true,
      socio_id: socio.id,
      pontos_retirados: pontos,
      email,
    });
  } catch (e) {
    return response({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
