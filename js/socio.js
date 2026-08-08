import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { user: null, socio: null, admin: false };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function showMessage(text, type = 'info') {
  const el = $('#socio-message');
  if (!el) return;
  el.textContent = text;
  el.className = `socio-message ${type}`;
  el.hidden = false;
}

function hideMessage() {
  const el = $('#socio-message');
  if (el) el.hidden = true;
}

async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}`
  });
  if (error) throw error;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.reload();
}

async function loadProfile(user) {
  const { data, error } = await supabase
    .from('socios')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (error) throw error;

  state.user = user;
  state.socio = data;
  state.admin = Number(data.numero_socio) === 9999 && data.is_admin === true && data.ativo === true;
}

function renderProfile() {
  const s = state.socio;
  $('#login-panel').hidden = true;
  $('#dashboard').hidden = false;

  $('#socio-name').textContent = s.nome || 'Sócio';
  $('#socio-number').textContent = s.numero_socio ?? '—';
  $('#dados-nome').textContent = s.nome || '—';
  $('#dados-nascimento').textContent = s.data_nascimento
    ? new Date(`${s.data_nascimento}T00:00:00`).toLocaleDateString('pt-PT')
    : '—';
  $('#dados-morada').textContent = s.morada || '—';
  $('#dados-email').textContent = s.email || state.user.email || '—';
  $('#dados-telemovel').textContent = s.telemovel || '—';
  $('#dados-arbitro').textContent = s.numero_arbitro || '—';
  $('#dados-af').textContent = s.associacao_futebol || '—';
  $('#dados-modalidade').textContent = s.modalidade || '—';

  if (state.admin) $('#admin-panel').hidden = false;

  loadPhoto();
  loadQuotas();
  loadDocuments();
  loadFunlearn();
}

async function loadPhoto() {
  const img = $('#socio-photo');
  const placeholder = $('#socio-photo-placeholder');
  const path = state.socio?.fotografia_path;
  if (!img || !placeholder) return;

  if (!path) {
    img.hidden = true;
    placeholder.hidden = false;
    return;
  }

  const { data, error } = await supabase.storage
    .from('fotografias-socios')
    .createSignedUrl(path, 3600);

  if (!error && data?.signedUrl) {
    img.src = data.signedUrl;
    img.hidden = false;
    placeholder.hidden = true;
  }
}

async function loadQuotas() {
  const el = $('#quotas-list');
  if (!el) return;

  el.innerHTML = `<div class="vazio">${escapeHtml(state.socio.quotas || 'Estado de quotas não definido.')}</div>`;
}

async function loadDocuments() {
  const { data, error } = await supabase
    .from('documentos_socios')
    .select('*')
    .eq('socio_id', state.socio.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  $('#docs-count').textContent = `${data.length} / 12`;
  const list = $('#docs-list');
  list.innerHTML = '';

  if (!data.length) {
    list.innerHTML = '<div class="vazio">Ainda não existem documentos.</div>';
    return;
  }

  for (const doc of data) {
    const { data: urlData } = await supabase.storage
      .from('documentos-socios')
      .createSignedUrl(doc.ficheiro_path, 3600);

    const item = document.createElement('div');
    item.className = 'documento-socio-item';
    item.innerHTML = `
      <span>📄</span>
      <div>
        <strong>${escapeHtml(doc.nome_ficheiro)}</strong>
        <small>${new Date(doc.created_at).toLocaleDateString('pt-PT')}</small>
      </div>
      ${urlData?.signedUrl ? `<a class="botao-mini" href="${urlData.signedUrl}" target="_blank" rel="noopener">Abrir</a>` : ''}
    `;
    list.appendChild(item);
  }
}

async function loadFunlearn() {
  const { data, error } = await supabase
    .from('funlearn_pontos')
    .select('id,pontos,atividade,descricao,created_at')
    .eq('socio_id', state.socio.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const total = data.reduce((sum, row) => sum + Number(row.pontos || 0), 0);
  $('#funlearn-total').textContent = total;
  $('#funlearn-total-top').textContent = total;

  $('#funlearn-history').innerHTML = data.length
    ? data.map(row => `
      <div class="fun-row">
        <div>
          <strong>${escapeHtml(row.atividade || 'Fun&Learn')}</strong>
          <small>${escapeHtml(row.descricao || '')} • ${new Date(row.created_at).toLocaleDateString('pt-PT')}</small>
        </div>
        <b>+${Number(row.pontos)}</b>
      </div>
    `).join('')
    : '<div class="vazio">Ainda não existem movimentos de pontos.</div>';
}

async function uploadSocioPdf(file) {
  if (!file || file.type !== 'application/pdf') throw new Error('Só são permitidos ficheiros PDF.');

  const { count, error: countError } = await supabase
    .from('documentos_socios')
    .select('*', { count: 'exact', head: true })
    .eq('socio_id', state.socio.id);

  if (countError) throw countError;
  if ((count || 0) >= 12) throw new Error('Já atingiu o limite máximo de 12 documentos.');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${state.socio.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('documentos-socios')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from('documentos_socios')
    .insert({
      socio_id: state.socio.id,
      ficheiro_path: path,
      nome_ficheiro: file.name,
      mime_type: 'application/pdf',
      tamanho_bytes: file.size
    });

  if (dbError) {
    await supabase.storage.from('documentos-socios').remove([path]);
    throw dbError;
  }
}

async function uploadPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('A fotografia deve ser JPG, PNG ou WEBP.');
  }

  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${state.socio.id}/fotografia.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('fotografias-socios')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) throw uploadError;

  const { error: dbError } = await supabase
    .from('socios')
    .update({ fotografia_path: path })
    .eq('id', state.socio.id)
    .eq('user_id', state.user.id);

  if (dbError) throw dbError;

  state.socio.fotografia_path = path;
  await loadPhoto();
}

function normalizeName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function processFunlearnPdf(file, pontos, atividade, descricao) {
  if (!state.admin) throw new Error('Apenas o administrador pode processar documentos Fun&Learn.');
  if (!file || file.type !== 'application/pdf') throw new Error('O ficheiro do Fun&Learn deve ser PDF.');
  if (!Number.isInteger(pontos) || pontos <= 0) throw new Error('Indica um número de pontos superior a 0.');
  if (!window.pdfjsLib) throw new Error('O leitor de PDF ainda não ficou disponível. Atualiza a página e tenta novamente.');

  const path = `admin/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error: uploadError } = await supabase.storage
    .from('funlearn')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });

  if (uploadError) throw uploadError;

  const { data: imp, error: impError } = await supabase
    .from('funlearn_importacoes')
    .insert({
      nome_ficheiro: file.name,
      storage_path: path,
      pontos,
      estado: 'processando',
      criado_por: state.user.id
    })
    .select()
    .single();

  if (impError) throw impError;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';

    for (let page = 1; page <= pdf.numPages; page++) {
      const p = await pdf.getPage(page);
      const content = await p.getTextContent();
      text += ' ' + content.items.map(item => item.str).join(' ');
    }

    const normalizedText = normalizeName(text);

    const { data: socios, error: sociosError } = await supabase
      .from('socios')
      .select('id,nome,numero_socio')
      .eq('ativo', true);

    if (sociosError) throw sociosError;

    const encontrados = socios.filter(s => {
      const nome = normalizeName(s.nome);
      return nome.length >= 4 && normalizedText.includes(nome);
    });

    if (encontrados.length) {
      const nomesRows = encontrados.map(s => ({
        importacao_id: imp.id,
        nome_original: s.nome,
        nome_normalizado: normalizeName(s.nome),
        numero_socio: s.numero_socio,
        socio_id: s.id,
        correspondencia_encontrada: true,
        pontos_atribuidos: false
      }));

      const { error: nomesError } = await supabase
        .from('funlearn_import_nomes')
        .insert(nomesRows);
      if (nomesError) throw nomesError;

      const pontosRows = encontrados.map(s => ({
        socio_id: s.id,
        importacao_id: imp.id,
        pontos,
        atividade: atividade || 'Fun&Learn',
        descricao: descricao || 'Pontuação atribuída automaticamente'
      }));

      const { error: pontosError } = await supabase
        .from('funlearn_pontos')
        .insert(pontosRows);
      if (pontosError) throw pontosError;

      await supabase
        .from('funlearn_import_nomes')
        .update({ pontos_atribuidos: true })
        .eq('importacao_id', imp.id);
    }

    await supabase
      .from('funlearn_importacoes')
      .update({
        estado: 'concluido',
        total_nomes: encontrados.length,
        total_socios_encontrados: encontrados.length,
        total_pontos_atribuidos: encontrados.length * pontos,
        processado_at: new Date().toISOString()
      })
      .eq('id', imp.id);

    return { count: encontrados.length, names: encontrados.map(s => `${s.numero_socio} — ${s.nome}`) };
  } catch (error) {
    await supabase
      .from('funlearn_importacoes')
      .update({ estado: 'erro', erro: error.message || String(error) })
      .eq('id', imp.id);
    throw error;
  }
}

function setupTabs() {
  $$('.socio-tab').forEach(btn => btn.addEventListener('click', () => {
    $$('.socio-tab').forEach(b => b.classList.remove('active'));
    $$('.socio-tab-content').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab)?.classList.add('active');
  }));
}

async function init() {
  setupTabs();

  $('#login-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    hideMessage();
    try {
      await login($('#login-email').value.trim(), $('#login-password').value);
    } catch (err) {
      showMessage(err.message || 'Não foi possível iniciar sessão.', 'erro');
    }
  });

  $('#reset-password')?.addEventListener('click', async () => {
    const email = $('#login-email')?.value.trim();
    if (!email) {
      showMessage('Introduz primeiro o teu email.', 'info');
      $('#login-email')?.focus();
      return;
    }
    try {
      await resetPassword(email);
      showMessage('Foi enviado um email para redefinir a palavra-passe.', 'sucesso');
    } catch (err) {
      showMessage(err.message || 'Não foi possível enviar o email.', 'erro');
    }
  });

  $('#logout-btn')?.addEventListener('click', logout);

  $('#photo-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadPhoto(file);
      showMessage('Fotografia atualizada.', 'sucesso');
    } catch (err) {
      showMessage(err.message, 'erro');
    }
    e.target.value = '';
  });

  $('#doc-input')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadSocioPdf(file);
      await loadDocuments();
      showMessage('Documento carregado.', 'sucesso');
    } catch (err) {
      showMessage(err.message, 'erro');
    }
    e.target.value = '';
  });

  $('#funlearn-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const file = $('#funlearn-file').files?.[0];
    try {
      $('#funlearn-submit').disabled = true;
      const result = await processFunlearnPdf(
        file,
        Number($('#funlearn-pontos').value),
        $('#funlearn-atividade').value.trim(),
        $('#funlearn-descricao').value.trim()
      );
      showMessage(
        result.count
          ? `Processamento concluído: ${result.count} sócio(s) recebeu(ram) ${Number($('#funlearn-pontos').value)} ponto(s).`
          : 'O PDF foi processado, mas não foi encontrado nenhum nome correspondente.',
        result.count ? 'sucesso' : 'info'
      );
      $('#funlearn-form').reset();
    } catch (err) {
      showMessage(err.message || 'Erro ao processar o PDF.', 'erro');
    } finally {
      $('#funlearn-submit').disabled = false;
    }
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  try {
    await loadProfile(session.user);
    renderProfile();
  } catch (err) {
    console.error(err);
    showMessage('A conta autenticada ainda não está associada a um registo de sócio.', 'erro');
  }
}

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    if ($('#login-panel')) $('#login-panel').hidden = false;
    if ($('#dashboard')) $('#dashboard').hidden = true;
  }
});

init();
