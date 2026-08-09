import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_NUMERO = 9999;
const MAX_BULK_RECIPIENTS = 100;

const $ = (selector) => document.querySelector(selector);

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function normalise(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function adminMessage(text, type = 'info') {
  const box = $('#admin-extra-message');
  if (!box) {
    window.alert(text);
    return;
  }
  box.textContent = text;
  box.className = `socio-message ${type}`;
  box.hidden = false;
}

function getError(error) {
  return error?.message || String(error || 'Erro desconhecido.');
}

async function requireAdmin() {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Tem de iniciar sessão.');

  const { data, error } = await supabase
    .from('socios')
    .select('id,numero_socio,is_admin,ativo')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data || Number(data.numero_socio) !== ADMIN_NUMERO ||
      data.is_admin !== true || data.ativo !== true) {
    throw new Error('Acesso reservado ao administrador.');
  }

  return { user, socio: data };
}

async function getSocios() {
  await requireAdmin();
  const { data, error } = await supabase
    .from('socios')
    .select('id,nome,numero_socio,email,telemovel,quotas,ativo')
    .order('numero_socio', { ascending: true });

  if (error) throw error;
  return data || [];
}

function looksOverdue(socio) {
  const value = normalise(socio.quotas || '');
  return value !== '' && ![
    'em dia', 'pago', 'pagas', 'paga', 'liquidado', 'liquidadas', 'regularizado'
  ].includes(value);
}

async function invoke(functionName, body) {
  await requireAdmin();
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function sendQuotasEmAtraso() {
  const socios = (await getSocios()).filter((s) => s.ativo !== false && s.email && looksOverdue(s));
  if (!socios.length) throw new Error('Não foram encontrados sócios ativos com quotas em atraso.');

  return invoke('admin-mail', {
    action: 'quotas_em_atraso',
    socio_ids: socios.map((s) => s.id)
  });
}

async function sendDocumentoTodos(file, subject, message) {
  if (!(file instanceof File)) throw new Error('Selecione um documento.');
  if (!String(file.type).toLowerCase().includes('pdf')) {
    throw new Error('O documento deve ser PDF.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O PDF não pode ultrapassar 10 MB.');
  }

  await requireAdmin();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sessão não autenticada.');

  const form = new FormData();
  form.append('action', 'documento_todos');
  form.append('documento', file);
  form.append('subject', subject);
  form.append('message', message);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-mail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: form
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    throw new Error(data?.error || 'Falha no envio do documento.');
  }
  return data;
}

async function retirarPontos(socioId, pontos, motivo) {
  const value = Number(pontos);
  if (!socioId || !Number.isInteger(value) || value <= 0) {
    throw new Error('Indique um número inteiro de pontos superior a zero.');
  }
  if (!String(motivo || '').trim()) {
    throw new Error('Indique o motivo da retirada de pontos.');
  }

  return invoke('admin-funlearn', {
    action: 'retirar_pontos',
    socio_id: socioId,
    pontos: value,
    motivo: String(motivo).trim(),
    notificar: true
  });
}

function splitPdfLines(text) {
  return text.split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseDelimitedLine(line) {
  const candidates = [';', '|', '\t'];
  const separator = candidates.find((s) => line.includes(s));
  if (!separator) return null;
  return line.split(separator).map((v) => v.trim());
}

function headerIndex(headers, names) {
  const wanted = names.map(normalise);
  return headers.findIndex((h) => wanted.includes(normalise(h)));
}

function parseSocioRows(text) {
  const lines = splitPdfLines(text);
  if (!lines.length) return [];

  const firstDelimited = lines.map(parseDelimitedLine).find(Boolean);
  let headers = null;
  let start = 0;
  let separator = null;

  if (firstDelimited) {
    const candidate = firstDelimited.map(normalise);
    const hasHeader = candidate.some((x) =>
      ['numero socio', 'numero', 'n socio', 'nome', 'nome socio', 'email', 'telemovel', 'telefone'].includes(x)
    );
    if (hasHeader) {
      headers = firstDelimited;
      separator = [';', '|', '\t'].find((s) => lines[0].includes(s));
      start = lines.indexOf(lines.find((line) => parseDelimitedLine(line) === firstDelimited)) + 1;
    }
  }

  const rows = [];

  if (headers && separator) {
    const numberIndex = headerIndex(headers, ['numero socio', 'numero', 'n socio', 'nº socio', 'nº']);
    const nameIndex = headerIndex(headers, ['nome', 'nome socio', 'socio']);
    const emailIndex = headerIndex(headers, ['email', 'e mail']);
    const phoneIndex = headerIndex(headers, ['telemovel', 'telefone', 'contacto', 'telemóvel']);

    if (numberIndex < 0 || nameIndex < 0) {
      throw new Error('O cabeçalho do PDF tem de incluir N.º de sócio e Nome.');
    }

    for (const line of lines.slice(start)) {
      const cells = parseDelimitedLine(line);
      if (!cells) continue;
      const numero = Number.parseInt(cells[numberIndex] || '', 10);
      const nome = String(cells[nameIndex] || '').trim();
      if (!Number.isInteger(numero) || !nome) continue;
      rows.push({
        numero_socio: numero,
        nome,
        email: emailIndex >= 0 ? (cells[emailIndex] || '').trim() || null : null,
        telemovel: phoneIndex >= 0 ? (cells[phoneIndex] || '').trim() || null : null
      });
    }
  } else {
    // Fallback para PDFs de listas com texto corrido:
    // procura "número + nome" e, quando possível, email/telefone na mesma linha.
    for (const line of lines) {
      const match = line.match(/^\s*(\d{1,6})\s+(.+?)(?:\s+([^\s@]+@[^\s@]+))?(?:\s+((?:\+351\s*)?[0-9][0-9\s-]{7,}))?\s*$/);
      if (!match) continue;
      const numero = Number.parseInt(match[1], 10);
      const nome = match[2].trim();
      if (!Number.isInteger(numero) || !nome) continue;
      rows.push({
        numero_socio: numero,
        nome,
        email: match[3] || null,
        telemovel: match[4]?.replace(/\s+/g, ' ').trim() || null
      });
    }
  }

  const unique = new Map();
  for (const row of rows) unique.set(row.numero_socio, row);
  return [...unique.values()];
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) {
    throw new Error('O leitor de PDF ainda não foi carregado.');
  }

  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || '').join(' '));
  }

  return pages.join('\n');
}

async function importSociosPdf(file) {
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    throw new Error('Selecione um PDF válido.');
  }

  const text = await extractPdfText(file);
  const rows = parseSocioRows(text);

  if (!rows.length) {
    throw new Error(
      'Não foram encontrados registos. O PDF precisa de texto selecionável e deve conter N.º de sócio + Nome.'
    );
  }

  const existing = await getSocios();
  const byNumber = new Map(existing.map((s) => [Number(s.numero_socio), s]));

  const inserted = [];
  const updated = [];
  const errors = [];

  for (const row of rows) {
    const old = byNumber.get(row.numero_socio);
    const payload = {
      nome: row.nome,
      email: row.email,
      telemovel: row.telemovel,
      ativo: true
    };

    const result = old
      ? await supabase.from('socios').update(payload).eq('id', old.id)
      : await supabase.from('socios').insert({
          numero_socio: row.numero_socio,
          ...payload
        });

    if (result.error) {
      errors.push(`${row.numero_socio} — ${row.nome}: ${result.error.message}`);
    } else if (old) {
      updated.push(row.numero_socio);
    } else {
      inserted.push(row.numero_socio);
    }
  }

  return {
    total: rows.length,
    inserted: inserted.length,
    updated: updated.length,
    errors
  };
}

async function setup() {
  const panel = $('#admin-panel');
  if (!panel) return;

  const extra = document.createElement('div');
  extra.className = 'admin-subpanel';
  extra.innerHTML = `
    <h3>Comunicação, Tesouraria e Fun&Learn</h3>
    <div id="admin-extra-message" class="socio-message" hidden></div>

    <div class="admin-form">
      <h4>Importar sócios através de PDF</h4>
      <p class="admin-nota">O PDF deve ter texto selecionável e incluir N.º de sócio e Nome. São aceites colunas separadas por ;, | ou TAB.</p>
      <label>PDF dos sócios
        <input id="admin-import-pdf" type="file" accept="application/pdf">
      </label>
      <button id="admin-import-pdf-btn" class="botao" type="button">Importar / atualizar sócios</button>
    </div>

    <div class="admin-form">
      <h4>Quotas em atraso</h4>
      <p class="admin-nota">É usado o campo <strong>quotas</strong> existente na base de dados. Estados como “Em dia”, “Pago” e “Regularizado” não recebem aviso.</p>
      <button id="admin-send-overdue" class="botao" type="button">Enviar avisos de quotas em atraso</button>
    </div>

    <div class="admin-form">
      <h4>Enviar documento para todos os sócios</h4>
      <label>Assunto
        <input id="admin-bulk-subject" type="text" value="Comunicação do Núcleo de Árbitros de Futebol Marques Bom">
      </label>
      <label>Mensagem
        <textarea id="admin-bulk-message" rows="5" placeholder="Escreve aqui a mensagem..."></textarea>
      </label>
      <label>PDF
        <input id="admin-bulk-file" type="file" accept="application/pdf">
      </label>
      <button id="admin-send-bulk" class="botao" type="button">Enviar para todos os sócios</button>
    </div>

    <div class="admin-form">
      <h4>Retirar pontos Fun&Learn</h4>
      <label>Sócio
        <select id="admin-points-socio"><option value="">A carregar…</option></select>
      </label>
      <label>Pontos a retirar
        <input id="admin-points-value" type="number" min="1" step="1">
      </label>
      <label>Motivo
        <textarea id="admin-points-reason" rows="3" placeholder="Indica o motivo..."></textarea>
      </label>
      <button id="admin-remove-points" class="botao" type="button">Retirar pontos e enviar email</button>
    </div>
  `;
  panel.appendChild(extra);

  try {
    const socios = await getSocios();
    const select = $('#admin-points-socio');
    select.innerHTML =
      '<option value="">Seleciona um sócio</option>' +
      socios
        .filter((s) => s.ativo !== false)
        .map((s) => `<option value="${esc(s.id)}">${esc(s.numero_socio)} — ${esc(s.nome)}</option>`)
        .join('');
  } catch (error) {
    adminMessage(getError(error), 'error');
    return;
  }

  $('#admin-import-pdf-btn').addEventListener('click', async () => {
    try {
      const file = $('#admin-import-pdf')?.files?.[0];
      if (!file) throw new Error('Escolhe o PDF dos sócios.');
      const result = await importSociosPdf(file);
      const detail = result.errors.length ? ` Erros: ${result.errors.length}.` : '';
      adminMessage(
        `Importação concluída: ${result.inserted} inseridos, ${result.updated} atualizados.${detail}`,
        result.errors.length ? 'info' : 'success'
      );
      if (result.errors.length) console.warn(result.errors);
    } catch (error) {
      adminMessage(getError(error), 'error');
    }
  });

  $('#admin-send-overdue').addEventListener('click', async () => {
    try {
      if (!window.confirm('Enviar agora os avisos de quotas em atraso?')) return;
      const result = await sendQuotasEmAtraso();
      adminMessage(`Avisos enviados: ${result.enviados || 0}.`, result.erros?.length ? 'info' : 'success');
      if (result.erros?.length) console.warn(result.erros);
    } catch (error) {
      adminMessage(getError(error), 'error');
    }
  });

  $('#admin-send-bulk').addEventListener('click', async () => {
    try {
      const subject = $('#admin-bulk-subject').value.trim();
      const message = $('#admin-bulk-message').value.trim();
      const file = $('#admin-bulk-file')?.files?.[0];

      if (!subject || !message || !file) {
        throw new Error('Preenche assunto, mensagem e escolhe o PDF.');
      }

      const socios = (await getSocios()).filter((s) => s.ativo !== false && s.email);
      if (!socios.length) throw new Error('Não existem sócios ativos com email.');
      if (socios.length > MAX_BULK_RECIPIENTS) {
        throw new Error(`A lista tem ${socios.length} destinatários. O envio está limitado a ${MAX_BULK_RECIPIENTS} por operação.`);
      }

      if (!window.confirm(`Enviar o documento para ${socios.length} sócios?`)) return;

      const result = await sendDocumentoTodos(file, subject, message);
      adminMessage(`Comunicação enviada para ${result.enviados || 0} sócio(s).`, result.erros?.length ? 'info' : 'success');
      if (result.erros?.length) console.warn(result.erros);
    } catch (error) {
      adminMessage(getError(error), 'error');
    }
  });

  $('#admin-remove-points').addEventListener('click', async () => {
    try {
      const socioId = $('#admin-points-socio').value;
      const points = Number($('#admin-points-value').value);
      const reason = $('#admin-points-reason').value.trim();

      if (!socioId || !Number.isInteger(points) || points <= 0 || !reason) {
        throw new Error('Preenche o sócio, os pontos e o motivo.');
      }

      if (!window.confirm(`Retirar ${points} ponto(s) deste sócio?`)) return;

      const result = await retirarPontos(socioId, points, reason);
      adminMessage(
        `Foram retirados ${result.pontos_retirados} ponto(s). O saldo foi atualizado e o sócio foi notificado.`,
        'success'
      );
      $('#admin-points-value').value = '';
      $('#admin-points-reason').value = '';
    } catch (error) {
      adminMessage(getError(error), 'error');
    }
  });
}

setup();

window.NAFAdmin = {
  requireAdmin,
  getSocios,
  importSociosPdf,
  sendQuotasEmAtraso,
  sendDocumentoTodos,
  retirarPontos
};
