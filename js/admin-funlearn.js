(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));

  let started = false;

  const client = () => window.__NAF_SUPABASE || window.supabaseClient || null;

  function show(message, type = "success") {
    const el = $("admin-result");
    if (!el) return;
    el.textContent = message;
    el.className = `admin-result ${type}`;
    el.hidden = false;
  }

  async function rpc(name, args) {
    const sb = client();
    if (!sb) throw new Error("Ligação ao Supabase indisponível.");
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadMembers() {
    const sb = client();
    const { data, error } = await sb
      .from("socios")
      .select("id,numero_socio,nome,email,ativo")
      .eq("ativo", true)
      .order("numero_socio", { ascending: true });

    if (error) throw error;

    const ids = (data || []).map((m) => m.id);
    const totals = new Map();

    if (ids.length) {
      const { data: points, error: pointsError } = await sb
        .from("funlearn_pontos")
        .select("socio_id,pontos")
        .in("socio_id", ids);

      if (pointsError) throw pointsError;

      for (const row of points || []) {
        const key = String(row.socio_id);
        totals.set(key, (totals.get(key) || 0) + Number(row.pontos || 0));
      }
    }

    window.__NAF_ADMIN_MEMBERS = (data || []).map((m) => ({
      ...m,
      pontos: totals.get(String(m.id)) || 0
    }));

    fillSelect("funlearn-add-member");
    fillSelect("funlearn-remove-member");

    const kpi = $("kpi-pontos");
    if (kpi) {
      kpi.textContent = window.__NAF_ADMIN_MEMBERS
        .reduce((sum, m) => sum + Number(m.pontos || 0), 0);
    }
  }

  function members() {
    return window.__NAF_ADMIN_MEMBERS || [];
  }

  function fillSelect(id) {
    const select = $(id);
    if (!select) return;

    select.innerHTML = members().map((m) => `
      <option value="${esc(m.id)}">
        ${esc(m.numero_socio)} — ${esc(m.nome)} (${Number(m.pontos || 0)} pts)
      </option>
    `).join("");
  }

  function normalizeName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  async function readPdf(file) {
    if (!file) throw new Error("Seleciona um PDF.");
    if (file.type !== "application/pdf") {
      throw new Error("O ficheiro tem de ser um PDF.");
    }

    const pdfjs = await import(
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs"
    );

    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer())
    }).promise;

    const rows = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      const lines = new Map();

      for (const item of text.items) {
        const value = String(item.str || "").trim();
        if (!value) continue;

        const y = Math.round(item.transform?.[5] || 0);
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push(value);
      }

      const orderedLines = [...lines.entries()]
        .sort((a, b) => b[0] - a[0])
        .map((entry) => entry[1].join(" ").replace(/\s+/g, " ").trim());

      for (const line of orderedLines) {
        const match = line.match(/^\s*(\d{1,6})\s+(.+)$/);
        if (!match) continue;

        const numero = Number(match[1]);
        const nome = match[2].trim();

        if (Number.isInteger(numero) && numero > 0 && nome.length >= 3) {
          rows.push({ numero_socio: numero, nome });
        }
      }
    }

    const unique = new Map();

    for (const row of rows) {
      unique.set(
        `${row.numero_socio}|${normalizeName(row.nome)}`,
        row
      );
    }

    return [...unique.values()];
  }

  function renderPreview(rows) {
    const root = $("funlearn-pdf-preview");
    if (!root) return;

    if (!rows.length) {
      root.innerHTML = `
        <div class="admin-danger-box">
          Não foram encontradas linhas no formato
          <strong>n.º de sócio + nome</strong>.
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="funlearn-preview-head">
        <strong>${rows.length} nomes encontrados</strong>
        <span>Apenas os sócios encontrados na BD recebem pontos.</span>
      </div>
      <div class="funlearn-preview-list">
        ${rows.slice(0, 300).map((row, index) => `
          <div class="funlearn-preview-row">
            <span>${index + 1}</span>
            <strong>${esc(row.numero_socio)}</strong>
            <span>${esc(row.nome)}</span>
          </div>
        `).join("")}
      </div>
      ${rows.length > 300
        ? `<p class="admin-help">A mostrar os primeiros 300 de ${rows.length}.</p>`
        : ""}
    `;
  }

  async function importPdf() {
    const file = $("funlearn-pdf")?.files?.[0];
    const points = Number($("funlearn-pdf-points")?.value);
    const description = $("funlearn-pdf-description")?.value.trim();

    if (!Number.isInteger(points) || points <= 0) {
      throw new Error("Os pontos por sócio têm de ser um inteiro positivo.");
    }

    const rows = await readPdf(file);
    renderPreview(rows);

    if (!rows.length) return;

    const result = await rpc("admin_funlearn_importar_pontos", {
      p_nomes: rows,
      p_pontos: points,
      p_nome_ficheiro: file.name,
      p_descricao: description || null
    });

    show(
      `Importação concluída: ${result.socios_encontrados} sócio(s) encontrados ` +
      `e ${result.pontos_atribuidos} ponto(s) atribuídos.`
    );

    await loadMembers();
  }

  async function addPoints() {
    const socioId = $("funlearn-add-member")?.value;
    const points = Number($("funlearn-add-points")?.value);
    const activity = $("funlearn-add-activity")?.value.trim() || "Fun&Learn";
    const description = $("funlearn-add-description")?.value.trim();

    if (!socioId) throw new Error("Seleciona um sócio.");
    if (!Number.isInteger(points) || points <= 0) {
      throw new Error("Os pontos têm de ser um inteiro positivo.");
    }
    if (!description) throw new Error("Indica o motivo da atribuição.");

    const member = members().find((m) => String(m.id) === String(socioId));

    const total = await rpc("admin_funlearn_adicionar_pontos", {
      p_socio_id: socioId,
      p_pontos: points,
      p_atividade: activity,
      p_descricao: description
    });

    if (member?.email) {
      const { error } = await client().functions.invoke("admin-mail", {
        body: {
          action: "pontos_adicionados",
          socio: {
            id: member.id,
            nome: member.nome,
            email: member.email
          },
          pontos_adicionados: points,
          atividade: activity,
          descricao: description
        }
      });

      if (error) throw error;
    }

    $("funlearn-add-description").value = "";
    show(
      `Foram adicionados ${points} ponto(s) a ${member?.nome || "o sócio"}. ` +
      `Novo total: ${total}.`
    );

    await loadMembers();
  }

  async function removePoints() {
    const socioId = $("funlearn-remove-member")?.value;
    const points = Number($("funlearn-remove-points")?.value);
    const reason = $("funlearn-remove-reason")?.value.trim();

    if (!socioId) throw new Error("Seleciona um sócio.");
    if (!Number.isInteger(points) || points <= 0) {
      throw new Error("Os pontos têm de ser um inteiro positivo.");
    }
    if (!reason) throw new Error("O motivo é obrigatório.");

    const member = members().find((m) => String(m.id) === String(socioId));

    const total = await rpc("admin_funlearn_retirar_pontos", {
      p_socio_id: socioId,
      p_pontos: points,
      p_motivo: reason
    });

    if (member?.email) {
      const { error } = await client().functions.invoke("admin-mail", {
        body: {
          action: "pontos_retirados",
          socio: {
            id: member.id,
            nome: member.nome,
            email: member.email
          },
          pontos_retirados: points,
          motivo: reason
        }
      });

      if (error) throw error;
    }

    $("funlearn-remove-reason").value = "";
    show(
      `Foram retirados ${points} ponto(s) a ${member?.nome || "o sócio"}. ` +
      `Novo total: ${total}.`
    );

    await loadMembers();
  }

  function buildPanel() {
    const panel = $("panel-funlearn");
    if (!panel || panel.dataset.unified === "1") return;

    panel.dataset.unified = "1";

    panel.innerHTML = `
      <div class="admin-card funlearn-unified-card">
        <div class="admin-card-header">
          <div>
            <span class="admin-badge">Fun&Learn</span>
            <h2>Gestão de pontos</h2>
            <p class="admin-help">
              Importar pontos por PDF, adicionar pontos individualmente
              e retirar pontos, tudo no mesmo bloco.
            </p>
          </div>
        </div>

        <div class="funlearn-section">
          <h3>Carregar pontos através de PDF</h3>
          <p class="admin-help">
            Formato recomendado: uma linha com o n.º de sócio seguido do nome.
          </p>

          <div class="admin-form-grid">
            <label>
              Pontos por sócio
              <input id="funlearn-pdf-points"
                     type="number" min="1" step="1" value="1">
            </label>

            <label>
              PDF
              <input id="funlearn-pdf"
                     type="file"
                     accept="application/pdf">
            </label>

            <label class="wide">
              Descrição
              <input id="funlearn-pdf-description"
                     placeholder="Ex.: Participação na atividade X">
            </label>
          </div>

          <button id="btn-funlearn-pdf"
                  type="button"
                  class="admin-small-btn primary">
            Ler PDF e atribuir pontos
          </button>

          <div id="funlearn-pdf-preview" class="funlearn-preview"></div>
        </div>

        <div class="funlearn-divider"></div>

        <div class="funlearn-section">
          <h3>Adicionar pontos individualmente</h3>

          <div class="admin-form-grid">
            <label>
              Sócio
              <select id="funlearn-add-member"></select>
            </label>

            <label>
              Pontos
              <input id="funlearn-add-points"
                     type="number" min="1" step="1" value="1">
            </label>

            <label>
              Atividade
              <input id="funlearn-add-activity" value="Fun&Learn">
            </label>

            <label>
              Motivo
              <input id="funlearn-add-description"
                     placeholder="Motivo da atribuição">
            </label>
          </div>

          <button id="btn-funlearn-add"
                  type="button"
                  class="admin-small-btn primary">
            Adicionar pontos
          </button>
        </div>

        <div class="funlearn-divider"></div>

        <div class="funlearn-section">
          <h3>Retirar pontos individualmente</h3>

          <div class="admin-form-grid">
            <label>
              Sócio
              <select id="funlearn-remove-member"></select>
            </label>

            <label>
              Pontos
              <input id="funlearn-remove-points"
                     type="number" min="1" step="1" value="1">
            </label>

            <label class="wide">
              Motivo
              <textarea id="funlearn-remove-reason"
                        placeholder="Motivo obrigatório"></textarea>
            </label>
          </div>

          <div class="admin-danger-box">
            A retirada fica registada como movimento negativo.
            O histórico não é apagado.
          </div>

          <button id="btn-funlearn-remove"
                  type="button"
                  class="admin-small-btn danger">
            Retirar pontos
          </button>
        </div>
      </div>
    `;

    $("btn-funlearn-pdf").onclick = () =>
      importPdf().catch((error) => {
        console.error(error);
        show(error.message || String(error), "error");
      });

    $("btn-funlearn-add").onclick = () =>
      addPoints().catch((error) => {
        console.error(error);
        show(error.message || String(error), "error");
      });

    $("btn-funlearn-remove").onclick = () =>
      removePoints().catch((error) => {
        console.error(error);
        show(error.message || String(error), "error");
      });
  }

  async function start() {
    if (started) return;
    if (!client() || !$("admin-app") || $("admin-app").hidden) return;

    started = true;
    buildPanel();
    await loadMembers();
  }

  const wait = () => {
    if (client() && $("admin-app") && !$("admin-app").hidden) {
      start().catch((error) => {
        console.error(error);
        show(error.message || String(error), "error");
      });
      return;
    }
    setTimeout(wait, 150);
  };

  wait();
})();
