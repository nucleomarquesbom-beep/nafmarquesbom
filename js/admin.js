(() => {
  "use strict";

  const cfg = window.NAF_ADMIN_CONFIG || {};
  const state = { supabase: null, user: null, members: [], pdfRows: [] };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

  function show(message, type = "success") {
    const el = $("admin-result");
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  function fail(error) {
    console.error(error);
    show(error?.message || String(error), "error");
  }

  function assertConfig() {
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("TEU-PROJETO") ||
        !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("A_TUA")) {
      throw new Error("Configuração Supabase incompleta: preenche js/admin-config.js.");
    }
  }

  function normalizeMember(m) {
    return {
      id: m.id,
      numero: m.numero_socio ?? m.numero ?? "",
      nome: m.nome ?? m.nome_completo ?? "",
      email: m.email ?? "",
      ativo: m.ativo ?? m.estado === "ativo" ?? true,
      quotas: m.quotas_em_atraso ?? m.quota_em_atraso ?? m.tem_quotas_em_atraso ?? false,
      pontos: Number(m.pontos_fun_learn ?? m.pontos_funlearn ?? m.pontos ?? 0) || 0,
      raw: m
    };
  }

  async function init() {
    try {
      assertConfig();
      if (!window.supabase) throw new Error("Biblioteca Supabase não carregada.");
      state.supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      window.supabaseClient = state.supabase;
      window.__NAF_SUPABASE = state.supabase;

      const { data: { session } } = await state.supabase.auth.getSession();
      state.user = session?.user || null;

      if (!state.user) {
        $("admin-login-warning").hidden = false;
        return;
      }

      const { data: isAdmin, error: adminError } = await state.supabase.rpc("is_admin");
      if (adminError) throw adminError;

      if (isAdmin !== true) {
        $("admin-login-warning").hidden = false;
        return;
      }

      $("admin-app").hidden = false;
      bind();
      await loadMembers();
    } catch (e) { fail(e); }
  }

  async function loadMembers() {
    const body = $("members-body");
    body.innerHTML = `<tr><td colspan="8" class="admin-loading">A carregar…</td></tr>`;

    const { data, error } = await state.supabase.from("socios").select("*").order("numero_socio", { ascending: true });
    if (error) throw error;

    state.members = (data || []).map(normalizeMember);
    const ids = state.members.map(m => m.id);
    if (ids.length) {
      const { data: quotas, error: quotasError } = await state.supabase
        .from("quotas")
        .select("socio_id,ano,mes,valor,pago,estado")
        .in("socio_id", ids);
      if (quotasError) throw quotasError;
      const now = new Date();
      const current = new Date(now.getFullYear(), now.getMonth(), 1);
      const map = new Map();
      for (const q of quotas || []) {
        if (!q.mes) continue;
        const d = new Date(Number(q.ano), Number(q.mes)-1, 1);
        const unpaid = q.pago !== true && !["pago","paga","isento","anulado"].includes(String(q.estado || "pendente").toLowerCase());
        if (unpaid && d < current) {
          const x = map.get(q.socio_id) || {months:0,value:0};
          x.months += 1; x.value += Number(q.valor || 0); map.set(q.socio_id,x);
        }
      }
      state.members.forEach(m => { const x=map.get(m.id)||{months:0,value:0}; m.quotas=x.months>0; m.meses_atraso=x.months; m.valor_atraso=x.value; });
    }
    renderMembers();
    renderOverdue();
    renderMemberSelect();
    updateKpis();
  }

  function renderMembers() {
    const q = $("member-search").value.trim().toLowerCase();
    const status = $("member-status").value;
    const selected = new Set([...document.querySelectorAll(".member-check:checked")].map(x => x.value));

    const rows = state.members.filter(m => {
      const text = `${m.numero} ${m.nome} ${m.email}`.toLowerCase();
      const okQ = !q || text.includes(q);
      const okStatus = !status || (status === "ativo" ? !!m.ativo : !m.ativo);
      return okQ && okStatus;
    });

    $("members-body").innerHTML = rows.length ? rows.map(m => `
      <tr>
        <td><input class="admin-check member-check" type="checkbox" value="${esc(m.id)}" ${selected.has(String(m.id)) ? "checked":""}></td>
        <td><button type="button" class="edit-member-number admin-small-btn" data-id="${esc(m.id)}" data-number="${esc(m.numero)}" title="Alterar nº de sócio">${esc(m.numero)}</button></td>
        <td>${esc(m.nome)}</td>
        <td>${esc(m.email)}</td>
        <td>${m.ativo ? "Ativo" : "Inativo"}</td>
        <td>${m.quotas ? '<span class="admin-badge">Em atraso</span>' : "Regular"}</td>
        <td>${m.pontos}</td>
      </tr>`).join("") :
      `<tr><td colspan="8" class="admin-loading">Nenhum sócio encontrado.</td></tr>`;

    updateSelectedCount();
  }

  function updateOverdueSelectedCount() {
    const el = $("overdue-selected-count");
    if (!el) return;
    el.textContent = `${document.querySelectorAll(".overdue-check:checked").length} selecionados`;
  }

  function renderOverdue() {
    const overdue = state.members.filter(m => m.quotas && m.email);
    $("overdue-list").innerHTML = overdue.length ? overdue.map(m => `
      <label class="admin-preview-row">
        <input class="admin-check overdue-check" type="checkbox" value="${esc(m.id)}" checked>
        <strong>${esc(m.numero)}</strong><span>${esc(m.nome)}</span><span>${esc(m.email)}</span>
      </label>`).join("") : `<div class="admin-loading">Não existem sócios marcados com quotas em atraso.</div>`;
    updateOverdueSelectedCount();
  }

  function renderMemberSelect() {
    $("points-member").innerHTML = state.members.map(m =>
      `<option value="${esc(m.id)}">${esc(m.numero)} — ${esc(m.nome)} (${m.pontos} pts)</option>`
    ).join("");
  }

  function updateSelectedCount() {
    $("selected-count").textContent =
      `${document.querySelectorAll(".member-check:checked").length} selecionados`;
  }

  function updateKpis() {
    $("kpi-total").textContent = state.members.length;
    $("kpi-ativos").textContent = state.members.filter(m => m.ativo).length;
    $("kpi-atrasos").textContent = state.members.filter(m => m.quotas).length;
    $("kpi-pontos").textContent = state.members.reduce((s,m) => s + m.pontos, 0);
  }

  async function parsePdf() {
    const file = $("pdf-file").files[0];
    if (!file) throw new Error("Seleciona primeiro um PDF.");
    if (file.type !== "application/pdf") throw new Error("O ficheiro tem de ser PDF.");

    const pdfjs = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: bytes }).promise;
    const rows = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const text = await page.getTextContent();
      const lines = {};
      for (const item of text.items) {
        const y = Math.round(item.transform[5]);
        (lines[y] ||= []).push(item.str);
      }
      for (const parts of Object.values(lines)) {
        const line = parts.join(" ").replace(/\s+/g, " ").trim();
        if (!line) continue;
        const number = line.match(/\b(\d{1,6})\b/)?.[1] || "";
        const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
        let name = line.replace(email, "").replace(/\b\d{1,6}\b/, "").replace(/\s+/g, " ").trim();
        if (number && name.length >= 3) rows.push({ numero_socio: Number(number), nome: name, email });
      }
      $("pdf-progress").querySelector("span").style.width = `${Math.round((p/pdf.numPages)*100)}%`;
    }

    state.pdfRows = rows;
    $("pdf-preview").innerHTML = rows.length ? rows.map((r,i) =>
      `<div class="admin-preview-row"><span>${i+1}</span><strong>${esc(r.numero_socio)}</strong><span>${esc(r.nome)}</span><span>${esc(r.email)}</span></div>`
    ).join("") : `<div class="admin-loading">Não foi possível extrair linhas com o formato esperado.</div>`;
    $("btn-import-pdf").disabled = !rows.length;
  }

  async function importPdfRows() {
    if (!state.pdfRows.length) throw new Error("Não existem dados para importar.");

    const { error } = await state.supabase.from("socios").upsert(
      state.pdfRows,
      { onConflict: "numero_socio", ignoreDuplicates: false }
    );
    if (error) throw error;
    show(`${state.pdfRows.length} registos importados/atualizados.`);
    await loadMembers();
  }

  async function invokeEdge(name, payload) {
    const { data, error } = await state.supabase.functions.invoke(name, { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function sendOverdue() {
    const ids = [...document.querySelectorAll(".overdue-check:checked")].map(x => x.value);
    if (!ids.length) throw new Error("Seleciona pelo menos um sócio.");
    const members = state.members.filter(m => ids.includes(String(m.id)));
    await invokeEdge(cfg.EMAIL_FUNCTION, {
      action: "quotas_atraso",
      subject: $("quota-subject").value.trim(),
      message: $("quota-message").value.trim(),
      members: members.map(m => ({ id:m.id, numero_socio:m.numero, nome:m.nome, email:m.email }))
    });
    show(`Avisos enviados para ${members.length} sócio(s).`);
  }

  async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunk = 0x8000;
    for (let i=0; i<bytes.length; i+=chunk)
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i+chunk, bytes.length)));
    return btoa(binary);
  }

  async function sendDocument() {
    const file = $("mail-file").files[0];
    if (!file) throw new Error("Seleciona o documento.");
    const members = state.members.filter(m => m.email);
    if (!members.length) throw new Error("Não existem sócios com email.");
    const subject = $("mail-subject").value.trim();
    const message = $("mail-message").value.trim();
    if (!subject) throw new Error("Indica o assunto do email.");
    if (!message) throw new Error("Escreve o conteúdo do email antes de enviar.");
    if (file.size > 10 * 1024 * 1024) throw new Error("O documento não pode ultrapassar 10 MB.");
    await invokeEdge(cfg.EMAIL_FUNCTION, {
      action: "documento_todos",
      subject,
      message,
      attachment: { name:file.name, mime:file.type || "application/octet-stream", base64:await fileToBase64(file) },
      members: members.map(m => ({ id:m.id, numero_socio:m.numero, nome:m.nome, email:m.email }))
    });
    show(`Documento enviado para ${members.length} sócio(s).`);
  }

  async function removePoints() {
    const member = state.members.find(m => String(m.id) === $("points-member").value);
    const amount = Number($("points-amount").value);
    const reason = $("points-reason").value.trim();
    if (!member) throw new Error("Seleciona um sócio.");
    if (!Number.isInteger(amount) || amount < 1) throw new Error("A quantidade de pontos tem de ser um inteiro positivo.");
    if (!reason) throw new Error("O motivo é obrigatório.");
    if (amount > member.pontos) throw new Error("Não é possível retirar mais pontos do que os existentes.");

    const { data, error } = await state.supabase.rpc(cfg.REMOVE_POINTS_RPC, {
      p_socio_id: member.id,
      p_pontos: amount,
      p_motivo: reason
    });
    if (error) throw error;

    await invokeEdge(cfg.EMAIL_FUNCTION, {
      action: "pontos_retirados",
      socio: { id:member.id, numero_socio:member.numero, nome:member.nome, email:member.email },
      pontos_retirados: amount,
      motivo: reason,
      resultado: data ?? null
    });

    show(`Foram retirados ${amount} ponto(s) a ${member.nome} e enviada a notificação.`);
    $("points-reason").value = "";
    await loadMembers();
  }

  async function editMemberNumber(id, currentNumber) {
    const member = state.members.find(m => String(m.id) === String(id));
    if (!member) return;
    const value = window.prompt(`Novo nº de sócio para ${member.nome}:`, String(currentNumber ?? ''));
    if (value === null) return;
    const numero = Number(value.trim());
    if (!Number.isInteger(numero) || numero <= 0 || numero === 9999) {
      throw new Error('Indica um número de sócio inteiro positivo (9999 está reservado ao administrador).');
    }
    const duplicate = state.members.find(m => Number(m.numero) === numero && String(m.id) !== String(id));
    if (duplicate) throw new Error(`O nº ${numero} já pertence a ${duplicate.nome}.`);
    const { error } = await state.supabase.rpc('admin_alterar_numero_socio', { p_socio_id: id, p_numero: numero });
    if (error) throw error;
    show(`Nº de sócio alterado para ${numero}.`);
    await loadMembers();
  }

  async function loadAdminPermissions() {
    const tab = $("tab-admins");
    const panel = $("panel-admins");
    if (!tab || !panel) return;
    let root = false;
    try { const {data,error}=await state.supabase.rpc("is_root_admin"); root=!error && data===true; } catch (_) {}
    if (!root) { tab.hidden=true; panel.hidden=true; return; }
    tab.hidden=false; panel.hidden=false;
    const box=$("admin-permissions-list");
    const {data,error}=await state.supabase.rpc("admin_listar_permissoes_admin");
    if(error) throw error;
    box.innerHTML=(data||[]).map(m=>`<div class="admin-preview-row admin-permission-row"><strong>${esc(m.numero_socio)}</strong><span>${esc(m.nome)}</span><span>${esc(m.email||'')}</span><span>${m.is_admin?'Administrador':'Sócio'}</span><button type="button" class="admin-small-btn ${m.is_admin?'danger':'primary'}" data-admin-toggle="${esc(m.id)}" data-admin-value="${m.is_admin?'false':'true'}">${m.is_admin?'Retirar admin':'Dar admin'}</button></div>`).join('')||'<div class="admin-loading">Não existem outros sócios.</div>';
    box.querySelectorAll('[data-admin-toggle]').forEach(btn=>btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try { const {error}=await state.supabase.rpc('admin_definir_admin',{p_socio_id:btn.dataset.adminToggle,p_is_admin:btn.dataset.adminValue==='true'}); if(error) throw error; await loadMembers(); await loadAdminPermissions(); show('Permissões de administrador atualizadas.'); } catch(e){ fail(e); } finally { btn.disabled=false; }
    }));
  }

  function bind() {
    $("btn-refresh").onclick = () => loadMembers().catch(fail);
    $("member-search").oninput = renderMembers;
    $("member-status").onchange = renderMembers;
    $("btn-select-all").onclick = () => {
      document.querySelectorAll(".member-check").forEach(x => x.checked = true);
      updateSelectedCount();
    };
    $("btn-clear-selection").onclick = () => {
      document.querySelectorAll(".member-check").forEach(x => x.checked = false);
      updateSelectedCount();
    };
    $("members-body").addEventListener("change", updateSelectedCount);
    $("members-body").addEventListener("click", event => {
      const btn = event.target.closest(".edit-member-number");
      if (btn) editMemberNumber(btn.dataset.id, btn.dataset.number).catch(fail);
    });
    $("btn-overdue-select-all").onclick = () => {
      document.querySelectorAll(".overdue-check").forEach(x => x.checked = true);
      updateOverdueSelectedCount();
    };
    $("btn-overdue-clear").onclick = () => {
      document.querySelectorAll(".overdue-check").forEach(x => x.checked = false);
      updateOverdueSelectedCount();
    };
    $("overdue-list").addEventListener("change", updateOverdueSelectedCount);
    $("btn-parse-pdf").onclick = () => parsePdf().catch(fail);
    $("btn-import-pdf").onclick = () => importPdfRows().catch(fail);
    $("btn-send-overdue").onclick = () => sendOverdue().catch(fail);
    $("btn-send-document").onclick = () => sendDocument().catch(fail);
    $("btn-remove-points").onclick = () => removePoints().catch(fail);

    document.querySelectorAll(".admin-tab").forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll(".admin-tab").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".admin-tab-panel").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        $(`panel-${btn.dataset.panel}`).classList.add("active");
      };
    });
  }

  init();
})();
