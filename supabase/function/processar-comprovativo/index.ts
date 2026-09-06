import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import pdfParse from "npm:pdf-parse@1.1.1";
import { createWorker } from "npm:tesseract.js@4.1.3";

const ROOT_EMAIL = "nucleomarquesbom@gmail.com";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const DEFAULT_FROM = "Núcleo Marques Bom <nucleomarquesbom@gmail.com>";

const DEFAULT_SIGNATURE_HTML = `<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Tesouraria,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">João Gomes</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>964 645 735<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  "";

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseAmount(value: string): number | null {
  let raw = String(value || "").trim().replace(/\s/g, "");
  if (!raw) return null;

  if (raw.includes(",") && raw.includes(".")) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else {
      raw = raw.replace(/,/g, "");
    }
  } else if (raw.includes(",")) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  }

  const number = Number(raw);
  return Number.isFinite(number) && number > 0
    ? Math.round(number * 100) / 100
    : null;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /(?:VALOR|MONTANTE|TOTAL|IMPORTANCIA|QUANTIA)[^\d]{0,40}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/i,
    /(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*€/i,
    /EUR\s*(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    const amount = parseAmount(match[1]);
    if (amount !== null) return amount;
  }

  return null;
}

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

function validUtcDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function extractDate(text: string): Date | null {
  const written = text.match(
    /\b(\d{1,2})\s+de\s+([A-Za-zÀ-ÿ]+)\s+(?:de\s+)?(20\d{2})\b/i
  );

  if (written) {
    const month = MONTHS[normalize(written[2]).toLowerCase()];
    if (month) {
      const date = validUtcDate(
        Number(written[3]),
        month,
        Number(written[1])
      );
      if (date) return date;
    }
  }

  const dmy = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/);
  if (dmy) {
    const date = validUtcDate(
      Number(dmy[3]),
      Number(dmy[2]),
      Number(dmy[1])
    );
    if (date) return date;
  }

  const ymd = text.match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/);
  if (ymd) {
    const date = validUtcDate(
      Number(ymd[1]),
      Number(ymd[2]),
      Number(ymd[3])
    );
    if (date) return date;
  }

  return null;
}

function analyzeProof(text: string) {
  const original = String(text || "");
  const normalizedText = normalize(original);

  const iban = String(Deno.env.get("IBAN_NUCLEO") || "").trim();
  const treasurerNumber = String(
    Deno.env.get("NUMERO_TESOUREIRO") ||
    Deno.env.get("MBWAY_NUCLEO") ||
    ""
  ).trim();

  const reasons: string[] = [];

  const normalizedIban = normalize(iban);
  const normalizedTreasurer = normalize(treasurerNumber);

  const hasIban =
    !!normalizedIban &&
    normalizedText.includes(normalizedIban);

  const hasTreasurerNumber =
    !!normalizedTreasurer &&
    normalizedText.includes(normalizedTreasurer);

  if (!hasIban && !hasTreasurerNumber) {
    reasons.push(
      "O comprovativo não contém o IBAN do Núcleo nem o número do tesoureiro."
    );
  }

  const valor = extractAmount(original);

  if (valor === null) {
    reasons.push("Não foi possível identificar o valor pago.");
  } else if (Math.round(valor * 100) % 1200 !== 0) {
    reasons.push(
      `O valor identificado (${valor.toFixed(2).replace(".", ",")} €) não é múltiplo de 12 €.`
    );
  }

  const date = extractDate(original);
  const currentYear = new Date().getFullYear();

  if (!date) {
    reasons.push(
      "Não foi possível identificar a data da transferência/pagamento."
    );
  } else if (date.getUTCFullYear() !== currentYear) {
    reasons.push(
      `A data do comprovativo (${date.toLocaleDateString("pt-PT")}) não pertence ao ano ${currentYear}.`
    );
  }

  const metodo = /MB\s*WAY|MBWAY/i.test(original)
    ? "mbway"
    : "transferencia";

  return {
    valido: reasons.length === 0,
    valor,
    data: date ? date.toISOString().slice(0, 10) : null,
    metodo,
    temIban: hasIban,
    temNumeroTesoureiro: hasTreasurerNumber,
    motivos: reasons
  };
}

async function ocrImage(bytes: Uint8Array) {
  const worker = await createWorker({});
  await worker.load();
  await worker.loadLanguage("por");
  await worker.initialize("por");

  try {
    const result = await worker.recognize(bytes);
    return result.data.text || "";
  } finally {
    await worker.terminate();
  }
}

function money(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

async function buildReceiptPdf(socio: any, receipt: any) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.25, 0.10, 0.35);

  let y = 780;

  page.drawText("RECIBO DE PAGAMENTO", {
    x: 60,
    y,
    size: 20,
    font: bold,
    color: purple
  });

  page.drawText(`Recibo n.º ${receipt.numero_recibo}`, {
    x: 60,
    y: y - 28,
    size: 10,
    font
  });

  y -= 75;

  page.drawText(`Sócio ${socio.numero_socio}`, {
    x: 60,
    y,
    size: 13,
    font: bold,
    color: purple
  });

  y -= 28;

  page.drawText(`Caro(a) ${socio.nome},`, {
    x: 60,
    y,
    size: 11,
    font
  });

  y -= 28;

  page.drawText(
    `Pagamento validado em ${new Date(
      receipt.emitido_em || Date.now()
    ).toLocaleDateString("pt-PT")}.`,
    { x: 60, y, size: 11, font }
  );

  y -= 30;

  for (const quota of Array.isArray(receipt.quotas)
    ? receipt.quotas
    : []) {
    page.drawText(
      `${quota.ano}${quota.mes ? `/${quota.mes}` : ""} — ${money(
        Number(quota.valor || 0)
      )}`,
      { x: 60, y, size: 10, font }
    );
    y -= 18;
  }

  y -= 15;

  page.drawText(
    `Pago por ${
      receipt.metodo_pagamento === "mbway"
        ? "MB WAY"
        : "Transferência bancária"
    } — ${money(Number(receipt.valor_total || 0))}`,
    { x: 60, y, size: 11, font: bold, color: purple }
  );

  return pdf.save();
}

async function enqueueEmail(args: {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
  text: string;
  primaryPath?: string | null;
  primaryFilename?: string | null;
  attachments?: Array<{
    storage_path: string;
    filename: string;
  }>;
  metadata?: Record<string, unknown>;
}) {
  const metadata = {
    ...(args.metadata || {}),
    attachments: args.attachments || []
  };

  const { error } = await admin.rpc("enfileirar_email_sistema", {
    p_to_email: args.to,
    p_subject: args.subject,
    p_html_body: args.html,
    p_text_body: args.text,
    p_cc_email: args.cc || null,
    p_bcc_email: null,
    p_attachment_storage_path: args.primaryPath || null,
    p_attachment_filename: args.primaryFilename || null,
    p_available_at: null,
    p_source: "processar-comprovativo",
    p_metadata: metadata,
    p_from_email: Deno.env.get("MAIL_FROM") || DEFAULT_FROM
  });

  if (error) throw error;
}

async function sendInvalidEmail(
  socio: any,
  fileName: string,
  reasons: string[],
  proofPath: string
) {
  const html = `
    <p>O comprovativo do sócio <strong>${escapeHtml(
      socio.numero_socio
    )} — ${escapeHtml(socio.nome)}</strong> não foi validado.</p>
    <p><strong>Ficheiro:</strong> ${escapeHtml(fileName)}</p>
    <ul>${reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    <p>O comprovativo enviado pelo sócio segue em anexo.</p>
    ${DEFAULT_SIGNATURE_HTML}
  `;

  await enqueueEmail({
    to: ROOT_EMAIL,
    cc: socio.email,
    subject: `Comprovativo de quotas não validado — Sócio ${socio.numero_socio}`,
    html,
    text: [
      `O comprovativo do sócio ${socio.numero_socio} — ${socio.nome} não foi validado.`,
      `Ficheiro: ${fileName}`,
      "",
      ...reasons,
      "",
      "O comprovativo enviado segue em anexo."
    ].join("\n"),
    primaryPath: proofPath,
    primaryFilename: fileName,
    attachments: [
      { storage_path: proofPath, filename: fileName }
    ],
    metadata: {
      tipo: "comprovativo-invalido",
      ficheiro: fileName
    }
  });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "Método não permitido." }, 405);
  }

  try {
    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Configuração Supabase incompleta." }, 500);
    }

    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Não autenticado." }, 401);
    }

    const {
      data: userResult,
      error: userError
    } = await admin.auth.getUser(
      authorization.slice(7).trim()
    );

    if (userError || !userResult.user) {
      return json({ error: "Sessão inválida." }, 401);
    }

    const { data: socio, error: socioError } = await admin
      .from("socios")
      .select("id,numero_socio,nome,email,ativo")
      .eq("user_id", userResult.user.id)
      .eq("ativo", true)
      .single();

    if (socioError || !socio) {
      return json({ error: "Sócio não encontrado." }, 404);
    }

    const form = await req.formData();
    const file = form.get("comprovativo");

    if (!(file instanceof File)) {
      return json({ error: "Comprovativo inválido." }, 400);
    }

    const isPdf =
      file.type === "application/pdf" ||
      /\.pdf$/i.test(file.name);

    const isImage =
      /^image\/(jpeg|png|webp|gif)$/i.test(file.type) ||
      /\.(jpe?g|png|webp|gif)$/i.test(file.name);

    if (!isPdf && !isImage) {
      return json(
        { error: "O comprovativo tem de ser PDF ou imagem (JPG, JPEG, PNG ou WEBP)." },
        400
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return json(
        { error: "O comprovativo não pode ultrapassar 8 MB." },
        400
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const proofPath = `${socio.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from("comprovativos-quotas")
      .upload(proofPath, bytes, {
        contentType:
          file.type ||
          (isPdf ? "application/pdf" : "image/jpeg"),
        upsert: false
      });

    if (uploadError) throw uploadError;

    let extractedText = "";

    if (isPdf) {
      try {
        extractedText = (await pdfParse(bytes)).text || "";
      } catch (_) {
        const reasons = ["Não foi possível ler o texto do PDF."];

        await sendInvalidEmail(
          socio,
          file.name,
          reasons,
          proofPath
        );

        return json(
          { ok: false, valid: false, reasons },
          422
        );
      }
    } else {
      try {
        extractedText = await ocrImage(bytes);
      } catch (error) {
        console.error("OCR:", error);

        const reasons = [
          "Não foi possível ler o texto da fotografia/comprovativo."
        ];

        await sendInvalidEmail(
          socio,
          file.name,
          reasons,
          proofPath
        );

        return json(
          { ok: false, valid: false, reasons },
          422
        );
      }
    }

    const analysis = analyzeProof(extractedText);

    if (!analysis.valido) {
      await sendInvalidEmail(
        socio,
        file.name,
        analysis.motivos,
        proofPath
      );

      return json(
        {
          ok: false,
          valid: false,
          reasons: analysis.motivos,
          extracted_date: analysis.data,
          extracted_amount: analysis.valor,
          payment_method: analysis.metodo
        },
        422
      );
    }

    const {
      data: receipt,
      error: paymentError
    } = await admin.rpc(
      "registar_pagamento_comprovativo",
      {
        p_socio_id: socio.id,
        p_valor: analysis.valor,
        p_metodo: analysis.metodo,
        p_user_id: userResult.user.id
      }
    );

    if (paymentError || !receipt) {
      throw paymentError ||
        new Error("Não foi possível registar o pagamento.");
    }

    const receiptBytes = await buildReceiptPdf(socio, receipt);
    const receiptPath =
      `${socio.id}/${receipt.numero_recibo}.pdf`;

    const { error: receiptUploadError } =
      await admin.storage
        .from("recibos-quotas")
        .upload(
          receiptPath,
          receiptBytes,
          {
            contentType: "application/pdf",
            upsert: true
          }
        );

    if (receiptUploadError) {
      throw receiptUploadError;
    }

    const {
      error: receiptUpdateError
    } = await admin
      .from("recibos_quotas")
      .update({ storage_path: receiptPath })
      .eq("id", receipt.id);

    if (receiptUpdateError) {
      throw receiptUpdateError;
    }

    await enqueueEmail({
      to: socio.email,
      cc: ROOT_EMAIL,
      subject:
        `Recibo de pagamento de quotas — Sócio ${socio.numero_socio}`,
      html: `
        <p>Olá ${escapeHtml(socio.nome)},</p>
        <p>O pagamento foi validado e o recibo foi emitido.</p>
        <p>Seguem em anexo o <strong>recibo</strong> e o <strong>comprovativo enviado</strong>.</p>
        ${DEFAULT_SIGNATURE_HTML}
      `,
      text: [
        `Olá ${socio.nome},`,
        "",
        "O pagamento foi validado e o recibo foi emitido.",
        "Seguem em anexo o recibo e o comprovativo enviado."
      ].join("\n"),
      primaryPath: receiptPath,
      primaryFilename: `Recibo-${receipt.numero_recibo}.pdf`,
      attachments: [
        {
          storage_path: receiptPath,
          filename: `Recibo-${receipt.numero_recibo}.pdf`
        },
        {
          storage_path: proofPath,
          filename: file.name
        }
      ],
      metadata: {
        tipo: "comprovativo-valido",
        recibo_id: receipt.id,
        socio_id: socio.id,
        ficheiro_comprovativo: file.name,
        data_pagamento: analysis.data,
        valor_pagamento: analysis.valor,
        metodo_pagamento: analysis.metodo
      }
    });

    return json({
      ok: true,
      valid: true,
      message:
        "Pagamento validado. O recibo e o comprovativo foram colocados na fila de email.",
      receipt_id: receipt.id,
      numero_recibo: receipt.numero_recibo,
      extracted_date: analysis.data,
      extracted_amount: analysis.valor,
      payment_method: analysis.metodo
    });
  } catch (error) {
    console.error("processar-comprovativo:", error);

    return json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro interno ao processar o comprovativo."
      },
      500
    );
  }
});
