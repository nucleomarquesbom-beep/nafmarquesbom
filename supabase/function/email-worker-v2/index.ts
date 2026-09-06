import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@7";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

const esc = (value: string) =>
  String(value ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] || c)
  );

const html = (text: string) =>
  `<!doctype html><html lang="pt-PT"><body style="font-family:Arial,sans-serif"><div style="max-width:620px;margin:30px auto;border:1px solid #e5dfe8;border-radius:18px;overflow:hidden"><div style="background:#5b2a72;color:#fff;padding:22px;font-size:22px;font-weight:700">Núcleo Marques Bom</div><div style="padding:28px;line-height:1.65">${esc(text).replace(/\n/g, "<br>")}</div></div></body></html>`;

async function downloadAttachment(
  db: any,
  path: string,
  filename: string
) {
  const buckets = [
    "questoes-socios",
    "documentos-socios",
    "recibos-quotas",
    "comprovativos-quotas",
    "funlearn",
    "email-anexos"
  ];

  for (const bucket of buckets) {
    const { data, error } =
      await db.storage.from(bucket).download(path);

    if (!error && data) {
      return {
        filename,
        content: new Uint8Array(
          await data.arrayBuffer()
        )
      };
    }
  }

  throw new Error(
    `Não foi possível obter o anexo do email: ${filename}`
  );
}

Deno.serve(async req => {
  try {
    if (req.method !== "POST") {
      return json({ error: "Método não permitido." }, 405);
    }

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!url || !key) {
      return json(
        { error: "Configuração Supabase incompleta." },
        500
      );
    }

    const db = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const token =
      req.headers.get("X-Email-Worker-Token") || "";

    const {
      data: valid,
      error: validationError
    } = await db.rpc(
      "email_worker_validate_token",
      { p_token: token }
    );

    if (validationError || valid !== true) {
      return json({ error: "Não autorizado." }, 401);
    }

    const host =
      Deno.env.get("email_smtp_host") ||
      "smtp.gmail.com";

    const port = Number(
      Deno.env.get("email_smtp_port") || "587"
    );

    const secure =
      String(
        Deno.env.get("email_smtp_secure") ||
        (port === 465 ? "true" : "false")
      ).toLowerCase() === "true";

    const username =
      Deno.env.get("email_smtp_user") ||
      "nucleomarquesbom@gmail.com";

    const password =
      Deno.env.get("email_smtp_password") || "";

    const from =
      Deno.env.get("email_smtp_from") || username;

    if (!password) {
      return json({
        ok: true,
        configured: false,
        message:
          "SMTP password não configurada como secret da Edge Function."
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: username,
        pass: password
      }
    });

    await transporter.verify();

    const {
      data: items,
      error: queueError
    } = await db.rpc(
      "email_outbox_claim",
      { p_limit: 20 }
    );

    if (queueError) {
      return json(
        { error: queueError.message },
        500
      );
    }

    const sent: string[] = [];
    const failed: Array<{
      id: string;
      error: string;
    }> = [];

    for (const item of items || []) {
      try {
        const mail: any = {
          from: item.from_email || from,
          to: item.to_email,
          cc: item.cc_email || undefined,
          bcc: item.bcc_email || undefined,
          subject: item.subject,
          text: item.text_body || undefined,
          html:
            item.html_body ||
            html(item.text_body || "")
        };

        const attachments: any[] = [];

        const metadata =
          item.metadata &&
          typeof item.metadata === "object"
            ? item.metadata
            : {};

        const listed =
          Array.isArray(metadata.attachments)
            ? metadata.attachments
            : [];

        if (listed.length) {
          for (const attachment of listed) {
            if (!attachment?.storage_path) continue;

            attachments.push(
              await downloadAttachment(
                db,
                String(attachment.storage_path),
                String(
                  attachment.filename ||
                  "documento"
                )
              )
            );
          }
        } else if (item.attachment_storage_path) {
          attachments.push(
            await downloadAttachment(
              db,
              item.attachment_storage_path,
              item.attachment_filename ||
                "documento.pdf"
            )
          );
        }

        if (attachments.length) {
          mail.attachments = attachments;
        }

        const info =
          await transporter.sendMail(mail);

        await db
          .from("email_outbox")
          .update({
            provider_message_id:
              String(info.messageId || "")
          })
          .eq("id", item.id);

        await db.rpc(
          "email_outbox_mark_sent",
          { p_id: item.id }
        );

        sent.push(item.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        await db.rpc(
          "email_outbox_mark_failed",
          {
            p_id: item.id,
            p_error: message,
            p_retry_minutes: 10
          }
        );

        failed.push({
          id: item.id,
          error: message
        });
      }
    }

    return json({
      ok: true,
      configured: true,
      smtp_verified: true,
      processed: (items || []).length,
      sent,
      failed
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error)
      },
      500
    );
  }
});
