import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import pdfParse from "npm:pdf-parse@1.1.1";

const ROOT_EMAIL = "nucleomarquesbom@gmail.com";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const DEFAULT_FROM = "Núcleo Marques Bom <nucleomarquesbom@gmail.com>";
const DEFAULT_SIGNATURE_TEXT =
  `--\nCom os mais respeitosos cumprimentos,\n\nP' Tesouraria,\nJoão Gomes\nNúcleo de Árbitros de Futebol Marques Bom\nEstádio Municipal Sérgio Conceição, 3030-974 Coimbra\n964 645 735\nFacebook | Instagram`;
const DEFAULT_SIGNATURE_HTML =
  `<div style="margin-top:24px">--<br><br>Com os mais respeitosos cumprimentos,<br><br>P' Tesouraria,<br><div style="font-family:cursive;font-size:24px;font-weight:700;font-style:italic;margin:6px 0">João Gomes</div><div style="color:#b00000;font-weight:700">Núcleo de Árbitros de Futebol Marques Bom</div>Estádio Municipal Sérgio Conceição, 3030-974 Coimbra<br>964 645 735<br><span style="color:#1155cc;text-decoration:underline">Facebook</span> | <span style="color:#1155cc;text-decoration:underline">Instagram</span></div>`;

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

function signatureText() {
  return DEFAULT_SIGNATURE_TEXT;
}

function signatureHtml() {
  return DEFAULT_SIGNATURE_HTML;
}

function fromEmail() {
  return Deno.env.get("MAIL_FROM") || DEFAULT_FROM;
}

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

  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /(?:VALOR|MONTANTE|TOTAL|IMPORTANCIA|QUANTIA)[^\d]{0,30}(\d{1,6}(?:[.,]\d{3})*[.,]\d{2})/i,
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
  const hasIban = !!iban && normalizedText.includes(normalize(iban));
  const normalizedTreasurer = normalize(treasurerNumber);
  const hasTreasurerNumber =
    !!normalizedTreasurer && normalizedText.includes(normalizedTreasurer);

  if (!iban && !treasurerNumber) {
    reasons.push("Não estão configurados o IBAN do Núcleo nem o número do tesoureiro no Supabase.");
  } else if (!hasIban && !hasTreasurerNumber) {
    reasons.push("O comprovativo não contém o IBAN do Núcleo nem o número do tesoureiro.");
  }

  const valor = extractAmount(original);
  if (valor === null) {
    reasons.push("Não foi possível identificar o valor pago no PDF.");
  } else if (Math.round(valor * 100) % 1200 !== 0) {
    reasons.push(`O valor identificado (${valor.toFixed(2).replace(".", ",")} €) não é múltiplo de 12 €.`);
  }

  const metodo = /MB\s*WAY|MBWAY/i.test(original) ? "mbway" : "transferencia";
  const destinatario = hasIban ? iban : treasurerNumber;

  return {
    valido: reasons.length === 0,
    valor,
    metodo,
    destinatario,
    temIban: hasIban,
    temNumeroTesoureiro: hasTreasurerNumber,
    motivos: reasons
  };
}

function money(value: number) {
  return `${value.toFixed(2).replace(".", ",")} €`;
}

function wrap(text: string, max = 92) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function buildReceiptPdf(
  socio: { nome: string; numero_socio: number },
  receipt: any
) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.25, 0.10, 0.35);
  let y = 780;

  page.drawText("RECIBO DE PAGAMENTO", { x: 60, y, size: 20, font: bold, color: purple });
  page.drawText(`Recibo n.º ${receipt.numero_recibo}`, { x: 60, y: y - 28, size: 10, font });
  y -= 75;
  page.drawText(`Sócio ${socio.numero_socio}`, { x: 60, y, size: 13, font: bold, color: purple });
  y -= 28;
  page.drawText(`Caro(a) ${socio.nome},`, { x: 60, y, size: 11, font });
  y -= 28;

  for (const line of wrap(`Confirmamos a regularização dos valores pagos em ${new Date(receipt.emitido_em || Date.now()).toLocaleDateString("pt-PT")}:`)) {
    page.drawText(line, { x: 60, y, size: 11, font });
    y -= 16;
  }
  y -= 15;

  for (const quota of Array.isArray(receipt.quotas) ? receipt.quotas : []) {
    page.drawText(
      `${quota.ano}${quota.mes ? `/${quota.mes}` : ""} — ${money(Number(quota.valor || 0))}`,
      { x: 60, y, size: 10, font }
    );
    y -= 18;
  }

  y -= 20;
  page.drawText(
    `Pago por ${receipt.metodo_pagamento === "mbway" ? "MB WAY" : "Transferência bancária"} — ${money(Number(receipt.valor_total || 0))}`,
    { x: 60, y, size: 11, font: bold, color: purple }
  );
  y -= 45;

  for (const line of wrap("A direção agradece a regularização das suas quotas.")) {
    page.drawText(line, { x: 60, y, size: 10, font });
    y -= 15;
  }
  y -= 20;
  page.drawText("Pela direção,", { x: 60, y, size: 10, font });
  y -= 18;
  page.drawText("Tesoureiro", { x: 60, y, size: 10, font: bold });
  y -= 55;
  page.drawText("NÚCLEO DE ÁRBITROS DE FUTEBOL MARQUES BOM", {
    x: 60,
    y,
    size: 11,
    font: bold,
    color: purple
  });

  return pdf.save();
}

async function queueReceiptEmail(
  socio: { id: string; nome: string; numero_socio: number; email: string },
  receipt: any,
  receiptPath: string
) {
  const text =
    `Olá ${socio.nome},\n\n` +
    "O seu comprovativo de pagamento foi validado automaticamente e o recibo foi emitido.\n\n" +
    `Valor: ${money(Number(receipt.valor_total))}\n` +
    `Recibo: ${receipt.numero_recibo}\n\n` +
    signatureText();

  const html =
    `<p>Olá ${escapeHtml(socio.nome)},</p>` +
    "<p>O seu comprovativo de pagamento foi validado automaticamente e o recibo foi emitido.</p>" +
    `<p><strong>Valor:</strong> ${escapeHtml(money(Number(receipt.valor_total)))}<br>` +
    `<strong>Recibo:</strong> ${escapeHtml(receipt.numero_recibo)}</p>` +
    signatureHtml();

  const { data, error } = await admin.rpc("enfileirar_email_sistema", {
    p_to_email: socio.email,
    p_subject: `Recibo de pagamento de quotas — Sócio ${socio.numero_socio}`,
    p_html_body: html,
    p_text_body: text,
    p_cc_email: ROOT_EMAIL,
    p_bcc_email: null,
    p_attachment_storage_path: receiptPath,
    p_attachment_filename: `Recibo-${receipt.numero_recibo}.pdf`,
    p_available_at: null,
    p_source: "processar-comprovativo",
    p_metadata: { recibo_id: receipt.id, socio_id: socio.id },
    p_from_email: fromEmail()
  });

  if (error) throw error;
  return data;
}

async function sendInvalidEmail(
  socio: { nome: string; email: string; numero_socio: number },
  fileName: string,
  reasons: string[]
) {
  const reasonText = reasons.map((reason) => `- ${reason}`).join("\n");
  const text =
    `O comprovativo enviado pelo sócio ${socio.numero_socio} — ${socio.nome} não foi validado.\n\n` +
    `Ficheiro: ${fileName}\n\nMotivos:\n${reasonText}\n\n` +
    signatureText();

  const htmlReasons = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
  const html =
    `<p>O comprovativo enviado pelo sócio <strong>${escapeHtml(socio.numero_socio)} — ${escapeHtml(socio.nome)}</strong> não foi validado.</p>` +
    `<p><strong>Ficheiro:</strong> ${escapeHtml(fileName)}</p>` +
    `<p><strong>Motivos:</strong></p><ul>${htmlReasons}</ul>` +
    signatureHtml();

  const { error } = await admin.rpc("enfileirar_email_sistema", {
    p_to_email: ROOT_EMAIL,
    p_subject: `Comprovativo de quotas não validado — Sócio ${socio.numero_socio}`,
    p_html_body: html,
    p_text_body: text,
    p_cc_email: socio.email,
    p_bcc_email: null,
    p_attachment_storage_path: null,
    p_attachment_filename: null,
    p_available_at: null,
    p_source: "quota-comprovativo",
    p_metadata: { socio_id: socio.numero_socio, ficheiro: fileName, tipo: "comprovativo-invalido" },
    p_from_email: fromEmail()
  });

  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    if (!supabaseUrl || !serviceKey) return json({ error: "Configuração Supabase incompleta." }, 500);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

    const token = authorization.slice("Bearer ".length).trim();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sessão inválida." }, 401);

    const { data: socio, error: socioError } = await admin
      .from("socios")
      .select("id,numero_socio,nome,email,ativo")
      .eq("user_id", userData.user.id)
      .eq("ativo", true)
      .single();

    if (socioError || !socio) return json({ error: "Sócio não encontrado." }, 404);
    if (!socio.email) return json({ error: "O sócio não tem email associado." }, 400);

    const form = await req.formData();
    const file = form.get("comprovativo");
    if (!(file instanceof File)) return json({ error: "Comprovativo inválido." }, 400);
    if (file.type !== "application/pdf") return json({ error: "O ficheiro tem de ser PDF." }, 400);
    if (file.size > MAX_FILE_SIZE) return json({ error: "O comprovativo não pode ultrapassar 8 MB." }, 400);

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    let extractedText = "";
    try {
      const parsed = await pdfParse(fileBytes);
      extractedText = parsed.text || "";
    } catch (error) {
      console.error("Falha ao ler PDF", error);
      await sendInvalidEmail(socio, file.name, ["Não foi possível ler o texto do PDF."]);
      return json({ error: "Não foi possível ler o PDF. A ocorrência foi comunicada ao Núcleo." }, 422);
    }

    const analysis = analyzeProof(extractedText);

    if (!analysis.valido) {
      await sendInvalidEmail(socio, file.name, analysis.motivos);
      return json({
        ok: false,
        valid: false,
        message: "Comprovativo não validado. O Núcleo foi informado por email.",
        reasons: analysis.motivos
      }, 422);
    }

    if (!analysis.valor || Math.round(analysis.valor * 100) % 1200 !== 0) {
      const reasons = ["O valor do comprovativo não é múltiplo de 12 €."];
      await sendInvalidEmail(socio, file.name, reasons);
      return json({ ok: false, valid: false, message: reasons[0], reasons }, 422);
    }

    const { data: receipt, error: paymentError } = await admin.rpc("registar_pagamento_comprovativo", {
      p_socio_id: socio.id,
      p_valor: analysis.valor,
      p_metodo: analysis.metodo,
      p_user_id: userData.user.id
    });

    if (paymentError || !receipt) throw paymentError || new Error("Não foi possível registar o pagamento.");

    const receiptBytes = await buildReceiptPdf(socio, receipt);
    const receiptPath = `${socio.id}/${receipt.numero_recibo}.pdf`;

    const { error: uploadError } = await admin.storage
      .from("recibos-quotas")
      .upload(receiptPath, receiptBytes, {
        contentType: "application/pdf",
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { error: receiptUpdateError } = await admin
      .from("recibos_quotas")
      .update({ storage_path: receiptPath })
      .eq("id", receipt.id);

    if (receiptUpdateError) throw receiptUpdateError;

    await queueReceiptEmail(socio, receipt, receiptPath);

    return json({
      ok: true,
      valid: true,
      message: `Pagamento de ${money(analysis.valor)} validado. O recibo foi emitido e colocado na fila de email.`,
      valor: analysis.valor,
      recibo: receipt.numero_recibo
    });
  } catch (error) {
    console.error("processar-comprovativo", error);
    return json({
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
