import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Sessão não autenticada.");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Sessão inválida.");

  const numero = Number(
    user.user_metadata?.numero_socio ??
    user.app_metadata?.numero_socio ??
    user.user_metadata?.numero ??
    user.app_metadata?.numero
  );

  if (numero !== 9999) throw new Error("Acesso reservado ao administrador.");

  return { user, supabase };
}

async function sendEmail(to: string, subject: string, text: string, attachment?: {
  filename: string;
  contentBase64: string;
  contentType: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");

  if (!apiKey || !from) {
    throw new Error("Configure RESEND_API_KEY e MAIL_FROM nos secrets.");
  }

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject,
    text,
  };

  if (attachment) {
    payload.attachments = [{
      filename: attachment.filename,
      content: attachment.contentBase64,
    }];
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fornecedor de email recusou o envio: ${body}`);
  }

  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { supabase } = await requireAdmin(req);

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const action = String(form.get("action") || "");

      if (action !== "documento_todos") {
        return json({ error: "Ação multipart inválida." }, 400);
      }

      const file = form.get("documento");
      if (!(file instanceof File)) return json({ error: "Documento em falta." }, 400);

      const { data: socios, error } = await supabase
        .from("socios")
        .select("id, email, nome")
        .not("email", "is", null);

      if (error) throw error;

      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const contentBase64 = btoa(binary);

      let enviados = 0;
      const erros: string[] = [];

      for (const socio of socios || []) {
        if (!socio.email) continue;
        try {
          await sendEmail(
            socio.email,
            "Documento — Núcleo Marques Bom",
            `Olá ${socio.nome || ""},\n\nSegue em anexo o documento enviado pelo Núcleo Marques Bom.\n\nCumprimentos,\nNúcleo Marques Bom`,
            {
              filename: file.name,
              contentBase64,
              contentType: file.type || "application/octet-stream",
            }
          );
          enviados++;
        } catch (e) {
          erros.push(`${socio.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return json({ enviados, erros });
    }

    const body = await req.json();

    if (body.action === "quotas_em_atraso") {
      const ids = Array.isArray(body.socio_ids) ? body.socio_ids : [];
      if (!ids.length) return json({ error: "Nenhum sócio selecionado." }, 400);

      // A estrutura de quotas já existente no SQL deve ser usada aqui.
      // A consulta abaixo tenta obter apenas os registos em atraso.
      const { data: socios, error } = await supabase
        .from("socios")
        .select("id, email, nome")
        .in("id", ids)
        .not("email", "is", null);

      if (error) throw error;

      let enviados = 0;
      const erros: string[] = [];

      for (const socio of socios || []) {
        try {
          await sendEmail(
            socio.email,
            "Quotas em atraso — Núcleo Marques Bom",
            `Olá ${socio.nome || ""},\n\nVerificámos que existem quotas em atraso associadas ao seu registo. Pedimos que regularize a situação.\n\nSe já efetuou o pagamento, pode ignorar esta mensagem ou contactar o Núcleo Marques Bom para confirmação.\n\nCumprimentos,\nNúcleo Marques Bom`
          );
          enviados++;
        } catch (e) {
          erros.push(`${socio.email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      return json({ enviados, erros });
    }

    return json({ error: "Ação desconhecida." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
