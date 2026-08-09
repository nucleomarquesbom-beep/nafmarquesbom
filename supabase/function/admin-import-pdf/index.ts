import { serve } from "https://deno.land/std@0.224.0/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) throw new Error("Sessão não autenticada.");

    const form = await req.formData();
    const file = form.get("pdf");

    if (!(file instanceof File) || file.type !== "application/pdf") {
      return json({ error: "PDF inválido ou em falta." }, 400);
    }

    // Segurança: a autorização administrativa real deve ser verificada
    // pelo Supabase/Edge Function antes da escrita.
    //
    // A extração PDF pode ser ligada aqui a um parser escolhido para o
    // formato real dos PDFs do Núcleo Marques Bom.
    //
    // Devolvemos o ficheiro como base64 para permitir uma integração
    // posterior sem obrigar a colocar uma biblioteca pesada no browser.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }

    return json({
      ok: true,
      filename: file.name,
      size: file.size,
      content_type: file.type,
      message: "PDF recebido. A etapa seguinte deve mapear os campos extraídos para socios.",
      pdf_base64: btoa(binary),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
