import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autenticado.");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error("Sessão inválida.");

    const adminClient = createClient(url, serviceKey);

    const { data: adminSocio, error: adminError } = await adminClient
      .from("socios")
      .select("id,numero_socio,is_admin,ativo")
      .eq("user_id", user.id)
      .maybeSingle();

    if (adminError) throw adminError;
    if (!adminSocio || adminSocio.numero_socio !== 9999 || adminSocio.is_admin !== true || adminSocio.ativo !== true) {
      throw new Error("Apenas o administrador pode criar sócios.");
    }

    const body = await req.json();
    const nome = String(body.nome ?? "").trim();
    const numero = Number(body.numero_socio);
    const email = String(body.email ?? "").trim().toLowerCase();
    const telemovel = String(body.telemovel ?? "").trim();

    if (!nome || !Number.isInteger(numero) || numero < 1 || !email) {
      throw new Error("Nome, número de sócio e email são obrigatórios.");
    }
    if (numero === 9999) throw new Error("O número 9999 está reservado ao Núcleo Marques Bom.");

    const { data: existingNumber } = await adminClient.from("socios").select("id").eq("numero_socio", numero).maybeSingle();
    if (existingNumber) throw new Error("Esse número de sócio já existe.");

    const { data: existingEmail } = await adminClient.from("socios").select("id").eq("email", email).maybeSingle();
    if (existingEmail) throw new Error("Esse email já está associado a um sócio.");

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (inviteError) throw inviteError;

    const { data: socio, error: insertError } = await adminClient.from("socios").insert({
      user_id: invited.user.id,
      numero_socio: numero,
      nome,
      email,
      telemovel: telemovel || null,
      is_admin: false,
      ativo: true,
    }).select().single();

    if (insertError) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      throw insertError;
    }

    return new Response(JSON.stringify({ socio }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
